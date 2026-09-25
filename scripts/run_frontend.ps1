[CmdletBinding()]
param(
    [int]$Port = 8502,
    [string]$HostAddress = "127.0.0.1"
)

$ErrorActionPreference = "Stop"
$ProjectRoot = Split-Path -Parent $PSScriptRoot
Set-Location -LiteralPath $ProjectRoot

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

$PythonExe = $null
foreach ($candidate in $candidates | Select-Object -Unique) {
    if (-not $candidate -or $candidate -like "*\WindowsApps\*") {
        continue
    }
    & $candidate -c "import pandas, joblib; assert __import__('sys').version_info >= (3, 10)" 2>$null
    if ($LASTEXITCODE -eq 0) {
        $PythonExe = $candidate
        break
    }
}
if (-not $PythonExe) {
    throw "A real Python 3.10+ installation with project dependencies was not found. Set PARKING_PYTHON to python.exe."
}

Write-Host "SmartPark frontend: http://${HostAddress}:$Port/overview"
& $PythonExe Frontend/server.py --host $HostAddress --port $Port
