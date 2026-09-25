[CmdletBinding()]
param(
    [switch]$SmokeTest,
    [int]$RunSeconds = 60,
    [int]$EventCount = 20,
    [double]$EventIntervalSeconds = 0.2
)

$ErrorActionPreference = "Stop"
$ProjectRoot = Split-Path -Parent $PSScriptRoot
Set-Location -LiteralPath $ProjectRoot

function Resolve-RealPython {
    $candidates = @()
    if ($env:PARKING_PYTHON) {
        $candidates += $env:PARKING_PYTHON
    }
    $pythonCommand = Get-Command python -ErrorAction SilentlyContinue
    if ($pythonCommand) {
        $candidates += $pythonCommand.Source
    }
    $candidates += Get-ChildItem `
        -Path (Join-Path $env:LOCALAPPDATA "Programs\Python") `
        -Filter python.exe `
        -Recurse `
        -ErrorAction SilentlyContinue | Select-Object -ExpandProperty FullName

    foreach ($candidate in $candidates | Select-Object -Unique) {
        if (-not $candidate -or $candidate -like "*\WindowsApps\*") {
            continue
        }
        & $candidate -c "import sys; assert sys.version_info >= (3, 10)" 2>$null
        if ($LASTEXITCODE -eq 0) {
            return $candidate
        }
    }
    throw "A real Python 3.10+ installation was not found. Set PARKING_PYTHON to python.exe."
}

$PythonExe = Resolve-RealPython
$RuntimeRoot = Join-Path $ProjectRoot ".runtime"
$Logs = Join-Path $RuntimeRoot "logs"
New-Item -ItemType Directory -Force -Path $Logs | Out-Null

Write-Host "Python: $PythonExe"
& $PythonExe -c "import kafka; print('Kafka Python client: OK')"

docker compose up -d
if ($LASTEXITCODE -ne 0) {
    throw "Docker Compose failed. Start Docker Desktop and retry."
}

$KafkaReady = $false
$PreviousErrorActionPreference = $ErrorActionPreference
try {
    $ErrorActionPreference = "Continue"
    for ($attempt = 1; $attempt -le 30; $attempt++) {
        docker exec kafka /opt/kafka/bin/kafka-topics.sh `
            --bootstrap-server localhost:9092 --list *> $null
        if ($LASTEXITCODE -eq 0) {
            $KafkaReady = $true
            break
        }
        Start-Sleep -Seconds 1
    }
}
finally {
    $ErrorActionPreference = $PreviousErrorActionPreference
}
if (-not $KafkaReady) {
    throw "Kafka did not become ready within 30 seconds."
}

docker exec kafka /opt/kafka/bin/kafka-topics.sh `
    --bootstrap-server localhost:9092 `
    --create --if-not-exists `
    --topic parking-events `
    --partitions 3 `
    --replication-factor 1
if ($LASTEXITCODE -ne 0) {
    throw "Kafka topic creation failed."
}

if (-not $SmokeTest) {
    Write-Host "Infrastructure is ready. Start the services in separate terminals:"
    Write-Host "  & '$PythonExe' kafka/producer.py"
    Write-Host "  docker compose --profile pipeline up -d spark"
    Write-Host "  powershell -ExecutionPolicy Bypass -File scripts/run_frontend.ps1"
    exit 0
}

$ValidationRoot = Join-Path $RuntimeRoot "validation"
$OutputName = "output-" + [guid]::NewGuid()
$ValidationOutput = Join-Path $ValidationRoot $OutputName
New-Item -ItemType Directory -Force -Path $ValidationOutput | Out-Null

$SparkOut = Join-Path $Logs "spark-streaming.out.log"
$SparkErr = Join-Path $Logs "spark-streaming.err.log"
$DockerExe = (Get-Command docker -ErrorAction Stop).Source
$sparkArgs = @(
    "compose"
    "--profile"
    "pipeline"
    "run"
    "--rm"
    "-e"
    "PARKING_RUN_SECONDS=$RunSeconds"
    "-e"
    "PARKING_STREAM_OUTPUT_ROOT=/opt/project/.runtime/validation/$OutputName"
    "-e"
    "PARKING_CHECKPOINT_ROOT=/tmp/parking-checkpoints"
    "-e"
    "KAFKA_STARTING_OFFSETS=latest"
    "spark"
)
$sparkProcess = Start-Process `
    -FilePath $DockerExe `
    -ArgumentList $sparkArgs `
    -PassThru `
    -WindowStyle Hidden `
    -RedirectStandardOutput $SparkOut `
    -RedirectStandardError $SparkErr

try {
    $ready = $false
    $deadline = (Get-Date).AddSeconds([Math]::Max(240, $RunSeconds))
    while ((Get-Date) -lt $deadline -and -not $sparkProcess.HasExited) {
        if ((Test-Path -LiteralPath $SparkOut) -and
            (Select-String -LiteralPath $SparkOut -Pattern "STREAM_READY" -Quiet)) {
            $ready = $true
            break
        }
        Start-Sleep -Seconds 1
        $sparkProcess.Refresh()
    }
    if (-not $ready) {
        throw "Spark did not become ready. See $SparkErr"
    }

    & $PythonExe kafka/producer.py --count $EventCount --interval $EventIntervalSeconds
    if ($LASTEXITCODE -ne 0) {
        throw "Kafka producer failed."
    }

    $completed = $sparkProcess.WaitForExit(($RunSeconds + 60) * 1000)
    if (-not $completed) {
        throw "Spark did not stop within the expected time. See $SparkErr"
    }
    if (-not (Select-String -LiteralPath $SparkOut -Pattern "STREAM_STOPPED_OK" -Quiet)) {
        throw "Spark did not report a clean shutdown. See $SparkErr"
    }
}
finally {
    $sparkProcess.Refresh()
    if (-not $sparkProcess.HasExited) {
        Stop-Process -Id $sparkProcess.Id
    }
}

$bronzeFiles = @(Get-ChildItem -LiteralPath (Join-Path $ValidationOutput "bronze_events") -Filter "*.parquet" -ErrorAction SilentlyContinue)
if ($bronzeFiles.Count -eq 0) {
    throw "The stream completed but wrote no bronze Parquet files."
}

Write-Host "FULL_PIPELINE_OK"
Write-Host "Bronze Parquet files: $($bronzeFiles.Count)"
Write-Host "Spark stdout: $SparkOut"
Write-Host "Spark stderr: $SparkErr"
