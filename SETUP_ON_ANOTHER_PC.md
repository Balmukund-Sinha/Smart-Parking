# Run SmartPark on Another PC

This guide explains how to transfer, configure, start, verify, and troubleshoot the complete SmartPark project on a different computer. The primary instructions target Windows 10/11 because that is the environment in which the project's platform-specific problems were resolved.

## 1. Recommended deployment model

Use this split on Windows:

| Runs on Windows | Runs in Docker Linux containers |
|---|---|
| Python virtual environment | Kafka 4.3.1 |
| Synthetic event producer | PostgreSQL 16 |
| Dataset generation and ML training | Apache Spark 4.2 with Python |
| Frontend integration API and UI | Spark checkpoints |

This arrangement is intentional. It removes the need for native Hadoop binaries, `winutils.exe`, `hadoop.dll`, `HADOOP_HOME`, a local Spark installation, and a local Java installation for the normal workflow.

## 2. Hardware and software requirements

### Minimum practical hardware

- 64-bit CPU with hardware virtualization enabled.
- 8 GB RAM; allocate at least 4 GB to Docker Desktop.
- 10 GB free disk space for images, dependencies, data, models, and Parquet files.
- Internet access for initial installation and real OpenStreetMap tiles.

For a larger generated dataset or sustained Spark workload, use 12-16 GB RAM and additional free disk space.

### Install these applications

1. **Git for Windows** - needed when cloning from a repository. It is optional when copying a ZIP/folder.
2. **Python 3.10 or newer, 64-bit** - Python 3.11 or 3.12 is a conservative default; the project is also verified with Python 3.13. Select "Add Python to PATH" during installation when offered.
3. **Docker Desktop** - enable the WSL 2 backend during installation.

Restart Windows if Docker Desktop or WSL asks for it.

### Docker Desktop configuration

Open Docker Desktop and check:

- the engine is running before any `docker compose` command;
- **Use the WSL 2 based engine** is enabled;
- Linux containers are selected;
- Docker has at least 4 GB RAM available;
- the drive containing the project can be shared/mounted by Docker if Docker prompts for access.

Verify from PowerShell:

```powershell
docker version
docker compose version
```

Both commands must show client and server information without a daemon connection error.

## 3. Transfer the project

### Option A: clone it

```powershell
git clone <your-repository-url> smart-parking-bda
Set-Location smart-parking-bda
```

Replace `<your-repository-url>` with the real Git URL.

### Option B: copy or extract it

Copy the project directory to the new PC, extract it if necessary, and open PowerShell in the directory that directly contains:

```text
docker-compose.yml
requirements.txt
Frontend/
scripts/
streaming/
```

Do not copy an old `.venv` from another computer. Virtual environments contain machine-specific absolute paths and should always be recreated.

The following runtime directories can also be omitted during transfer:

- `.runtime/`
- `.pytest_cache/`
- `.tmp/`
- `checkpoints/`
- Python `__pycache__/` directories

The large raw event history, `ml/model.pkl`, and Parquet folders may be copied to save generation time, but they are not required. Small sample and analytical snapshot files are kept in Git so the frontend and Vercel hybrid mode can open immediately.

## 4. Create a clean Python environment

From the project root:

```powershell
python -m venv .venv
Set-ExecutionPolicy -Scope Process -ExecutionPolicy Bypass
.\.venv\Scripts\Activate.ps1
python -m pip install --upgrade pip
python -m pip install -r requirements-pipeline.txt
```

Confirm that PowerShell is using the virtual environment:

```powershell
python -c "import sys; print(sys.executable); print(sys.version)"
```

The executable path should end in `.venv\Scripts\python.exe` and the version must be Python 3.10 or newer.

If the Python launcher is installed and a particular version is available, a command such as `py -3.11 -m venv .venv` can be used instead. Do not request a version that `py -0p` does not list. If `py` is unavailable but `python --version` works, use `python -m venv .venv` as shown above.

Set the project launcher override for the current PowerShell session:

```powershell
$env:PARKING_PYTHON = (Resolve-Path .\.venv\Scripts\python.exe).Path
```

This override is important on systems where the Windows App Execution Alias redirects `python` to the Microsoft Store. It is session-scoped and must be set again in a new terminal when required. The commands in this guide also use the virtual environment's explicit path when convenient.

### If PowerShell activation is blocked

The `Set-ExecutionPolicy -Scope Process` command changes policy only for the current terminal. Alternatively, skip activation and run Python explicitly:

```powershell
& .\.venv\Scripts\python.exe -m pip install -r requirements-pipeline.txt
```

## 5. Prepare the data and model

A normal Git clone does not contain large generated data/model artifacts because `.gitignore` excludes them.

Generate the default 20-zone, 21-day dataset:

```powershell
python scripts\generate_dataset.py
```

Train the Random Forest and generate prediction artifacts:

```powershell
python ml\train_model.py
```

Verify the required outputs:

```powershell
@(
  "data\raw\zones.csv",
  "data\raw\parking_events.csv",
  "data\processed\dashboard_data.csv",
  "data\processed\ml_dataset.csv",
  "data\processed\predictions.csv",
  "ml\model.pkl"
) | ForEach-Object { "$_ : $(Test-Path $_)" }
```

Each line should end in `True`.

To generate a different dataset, inspect all supported parameters with:

```powershell
python scripts\generate_dataset.py --help
```

Example:

```powershell
python scripts\generate_dataset.py --zones 40 --vehicles 12000 --days 30 --seed 42
python ml\train_model.py
```

## 6. Start the infrastructure

Start Docker Desktop first and wait until it reports that the engine is ready.

Run the Windows launcher:

```powershell
powershell -ExecutionPolicy Bypass -File scripts\run_full_pipeline.ps1
```

This command:

1. rejects the Microsoft Store Python alias and finds a real Python installation;
2. verifies the `kafka-python` package;
3. starts Kafka and PostgreSQL with Docker Compose;
4. waits for Kafka readiness;
5. creates the three-partition `parking-events` topic;
6. prints the commands used to start the producer, Spark, and frontend.

Verify the containers:

```powershell
docker compose ps
```

`kafka` and `parking_postgres` should be running.

## 7. Run the end-to-end smoke test

Run this before starting the permanent Spark service:

```powershell
powershell -ExecutionPolicy Bypass -File scripts\run_full_pipeline.ps1 -SmokeTest
```

The test performs the following bounded flow:

```text
Python producer -> Kafka -> Docker Spark -> validation Parquet output
```

Success is reported as:

```text
FULL_PIPELINE_OK
```

The validation files are written below `.runtime/validation/`, and Spark logs are written below `.runtime/logs/`.

The test can be adjusted when the PC is slow:

```powershell
powershell -ExecutionPolicy Bypass -File scripts\run_full_pipeline.ps1 `
  -SmokeTest -RunSeconds 120 -EventCount 50 -EventIntervalSeconds 0.2
```

The first Spark run may be slower because the container downloads the Kafka connector package.

## 8. Start the complete continuous pipeline

Use three PowerShell windows, all opened in the project root.

### Terminal 1: continuous event producer

```powershell
& .\.venv\Scripts\python.exe kafka\producer.py
```

Press `Ctrl+C` to stop it. For a bounded test instead:

```powershell
& .\.venv\Scripts\python.exe kafka\producer.py --count 100 --interval 0.2
```

### Terminal 2: PySpark stream

```powershell
docker compose --profile pipeline up -d spark
docker compose --profile pipeline logs -f spark
```

Press `Ctrl+C` to stop following logs; the Spark container continues in the background.

Look for a `STREAM_READY` message. Spark writes:

- `data/processed/bronze_events/` - validated append-only events;
- `data/processed/silver_zone_metrics/` - windowed zone metrics;
- its streaming checkpoint to the Docker-managed `spark_checkpoints` volume.

### Terminal 3: integrated frontend

```powershell
powershell -ExecutionPolicy Bypass -File scripts\run_frontend.ps1
```

Open:

<http://127.0.0.1:8502/overview>

The same server provides the frontend files and the local `/api/*` integration endpoints. Do not open the exported HTML files directly from File Explorer because they need that API server.

## 9. Initialize and load PostgreSQL

Compose creates the database, user, and schema automatically the first time the `parking_pgdata` volume is created.

Defaults:

| Setting | Value |
|---|---|
| Host | `localhost` |
| Port | `5432` |
| Database | `smart_parking` |
| User | `postgres` |
| Local development password | `postgres` |

Load the generated summary data:

```powershell
$env:PARKING_DB_HOST = "localhost"
$env:PARKING_DB_PORT = "5432"
$env:PARKING_DB_NAME = "smart_parking"
$env:PARKING_DB_USER = "postgres"
$env:PARKING_DB_PASSWORD = "postgres"
python database\db.py --load-all
```

Check readiness:

```powershell
docker exec parking_postgres pg_isready -U postgres -d smart_parking
```

The Compose password is a local-development default. If the service will be exposed beyond the local PC, change the password in `docker-compose.yml`, update `PARKING_DB_PASSWORD`, and restrict the network/firewall rules.

## 10. Verify every layer

### Containers

```powershell
docker compose --profile pipeline ps
```

### Kafka topic and offset

```powershell
docker exec kafka /opt/kafka/bin/kafka-topics.sh `
  --bootstrap-server localhost:9092 --describe --topic parking-events

docker exec kafka /opt/kafka/bin/kafka-get-offsets.sh `
  --bootstrap-server localhost:9092 --topic parking-events
```

Offsets should increase while the producer runs.

### Spark output

```powershell
Get-ChildItem data\processed\bronze_events -Filter *.parquet | Select-Object -First 5
Get-ChildItem data\processed\silver_zone_metrics -Filter *.parquet | Select-Object -First 5
```

### Frontend API

After starting the frontend:

```powershell
Invoke-RestMethod http://127.0.0.1:8502/api/health | ConvertTo-Json -Depth 6
```

### Automated tests

```powershell
python -m pytest -q
```

## 11. Frontend routes

| Page | URL |
|---|---|
| Overview | <http://127.0.0.1:8502/overview> |
| Live Monitoring | <http://127.0.0.1:8502/live-monitoring> |
| Parking Map | <http://127.0.0.1:8502/parking-map> |
| Historical Analytics | <http://127.0.0.1:8502/historical-analytics> |
| Demand Prediction | <http://127.0.0.1:8502/demand-prediction> |
| Big Data Pipeline | <http://127.0.0.1:8502/big-data-pipeline> |
| Data Explorer | <http://127.0.0.1:8502/data-explorer> |
| System Health | <http://127.0.0.1:8502/system-health> |

The real map uses Leaflet and OpenStreetMap tiles. Internet access is required for the basemap tiles, although zone data and markers still come from the local project.

## 12. Configuration reference

### Windows launcher and frontend

| Name | Default | Description |
|---|---|---|
| `PARKING_PYTHON` | automatic discovery | Absolute path to a real Python 3.10+ executable |
| `PARKING_FRONTEND_HOST` | `127.0.0.1` | Interface used by `Frontend/server.py` |
| `PARKING_FRONTEND_PORT` | `8502` | Frontend and API port |

The launcher parameters override frontend defaults:

```powershell
powershell -ExecutionPolicy Bypass -File scripts\run_frontend.ps1 `
  -HostAddress 127.0.0.1 -Port 8502
```

### Kafka and streaming

| Name | Host default | Spark container default | Description |
|---|---|---|---|
| `KAFKA_BOOTSTRAP_SERVERS` | `localhost:9092` | `kafka:29092` | Kafka broker address |
| `KAFKA_TOPIC` | `parking-events` | `parking-events` | Source topic |
| `KAFKA_STARTING_OFFSETS` | `latest` in Python code | `earliest` in Compose | Initial offsets for a new query |
| `PARKING_STREAM_OUTPUT_ROOT` | `data/processed` | `/opt/project/data/processed` | Parquet root |
| `PARKING_CHECKPOINT_ROOT` | `checkpoints` | `/opt/checkpoints/rocksdb-v3` | Spark checkpoint root |
| `PARKING_RUN_SECONDS` | `0` | `0` | `0` runs continuously; positive values make a bounded run |

### PostgreSQL loader

| Name | Default |
|---|---|
| `PARKING_DB_HOST` | `localhost` |
| `PARKING_DB_PORT` | `5432` |
| `PARKING_DB_NAME` | `smart_parking` |
| `PARKING_DB_USER` | `postgres` |
| `PARKING_DB_PASSWORD` | no default; required |

### Ports

| Port | Component | Required locally |
|---:|---|---|
| 8502 | Integrated frontend/API | Yes |
| 9092 | Kafka external listener | Yes for the Windows producer/API |
| 5432 | PostgreSQL | Yes for the Windows database loader |

If 8502 is occupied, use another frontend port:

```powershell
powershell -ExecutionPolicy Bypass -File scripts\run_frontend.ps1 -Port 9000
```

If Kafka or PostgreSQL ports are changed in Compose, update every associated client environment variable as well. Do not change only one side of the connection.

## 13. Frontend-only/offline demonstration

When Docker cannot be installed, the analytics, prediction, map, data explorer, and most UI demonstrations can still use generated local files:

```powershell
.\.venv\Scripts\Activate.ps1
python scripts\generate_dataset.py
python ml\train_model.py
powershell -ExecutionPolicy Bypass -File scripts\run_frontend.ps1
```

Expected limitations:

- Kafka throughput and offsets are unavailable.
- Spark live cadence and container status are unavailable.
- PostgreSQL readiness is unavailable.
- Pipeline/system-health pages correctly show degraded or offline live services.
- File-backed charts, tables, predictions, exports, and map zone data remain available.

This mode is useful for a visual demo, but the smoke test is the evidence that the distributed pipeline works.

## 14. Start and stop commands

Start base infrastructure:

```powershell
docker compose up -d
```

Start Spark too:

```powershell
docker compose --profile pipeline up -d spark
```

Stop the Spark service only:

```powershell
docker compose --profile pipeline stop spark
```

Stop and remove the project containers while preserving named volumes:

```powershell
docker compose --profile pipeline down
```

View logs:

```powershell
docker compose logs -f kafka postgres
docker compose --profile pipeline logs -f spark
```

Do not delete Docker volumes during normal shutdown. Removing the `parking_pgdata` volume deletes the PostgreSQL database, and removing `spark_checkpoints` discards streaming progress.

## 15. Troubleshooting

### Docker daemon is offline

Symptoms include `docker compose up` failing to connect to the engine or a named-pipe error.

1. Launch Docker Desktop manually.
2. Wait until it shows **Engine running**.
3. Run `docker version` and confirm that a **Server** section appears.
4. Retry the launcher.

### Windows says Python was not found or opens the Microsoft Store

Windows App Execution Aliases may be intercepting `python.exe`.

```powershell
$env:PARKING_PYTHON = (Resolve-Path .\.venv\Scripts\python.exe).Path
powershell -ExecutionPolicy Bypass -File scripts\run_frontend.ps1
```

You can also disable the `python.exe` and `python3.exe` Store aliases in Windows **Manage app execution aliases**, but the environment-variable solution does not require changing system settings.

### The launcher cannot import `kafka`, `pandas`, or `joblib`

The selected Python does not have the project dependencies.

```powershell
& .\.venv\Scripts\python.exe -m pip install -r requirements.txt
$env:PARKING_PYTHON = (Resolve-Path .\.venv\Scripts\python.exe).Path
```

### Kafka command is not found inside the container

The Apache Kafka image does not guarantee that Kafka utilities are on `$PATH`. Use their absolute paths:

```powershell
docker exec kafka /opt/kafka/bin/kafka-topics.sh --bootstrap-server localhost:9092 --list
```

### Spark reports `winutils.exe`, `hadoop.dll`, or `HADOOP_HOME` errors

Those errors mean Spark is being started natively on Windows. Stop that process and use:

```powershell
docker compose --profile pipeline up -d spark
```

The official Linux Spark container does not depend on Windows Hadoop wrappers.

### Spark fails while deleting a temporary JAR

This is usually Windows file locking in a native Spark installation. Use the Docker Spark service and its Linux checkpoint volume. Do not point the Docker checkpoint root to a Windows host directory.

### Spark remains in `ATTENTION` during its first start

The Kafka connector may still be downloading. Follow the log:

```powershell
docker compose --profile pipeline logs -f spark
```

If the log shows DNS/download failures, confirm Docker has internet access and retry. If it shows a corrupt Ivy download, recreate only the Spark container with Compose; the connector cache in this configuration is container-local.

### Kafka offsets remain at zero

1. Confirm the producer window is still running.
2. Check `docker compose ps`.
3. Run the producer once in bounded mode and inspect its output:

```powershell
& .\.venv\Scripts\python.exe kafka\producer.py --count 10 --interval 0.2
```

4. Read the offset again with `/opt/kafka/bin/kafka-get-offsets.sh`.

### No Parquet files appear

1. Confirm Kafka offsets are increasing.
2. Look for `STREAM_READY` in Spark logs.
3. Check that Docker can mount the project directory.
4. Run the bounded smoke test and inspect `.runtime/logs/spark-streaming.err.log`.

### PostgreSQL schema changes do not appear

Files in `/docker-entrypoint-initdb.d` run only when PostgreSQL initializes a new, empty data volume. For a non-destructive update, apply the SQL explicitly with `psql`. Recreating the volume also reapplies it, but destroys all stored database data and should be done only when that loss is intentional.

### Port 8502, 9092, or 5432 is already in use

Find the owning Windows process:

```powershell
Get-NetTCPConnection -State Listen -LocalPort 8502,9092,5432 |
  Select-Object LocalPort, OwningProcess
```

Stop the conflicting application if safe. The frontend port can be changed with `-Port`. Kafka and PostgreSQL port changes require corresponding Compose and client configuration changes.

### Map area is blank

- Confirm the browser can reach OpenStreetMap tile servers.
- Disable overly strict content/ad blocking for localhost.
- Check the browser developer console for blocked tile requests.
- Confirm `data/raw/zones.csv` exists for local marker data.

### The frontend opens, but charts or predictions are empty

Regenerate the file-backed artifacts:

```powershell
python scripts\generate_dataset.py
python ml\train_model.py
```

Then restart `scripts\run_frontend.ps1` and force-refresh the browser with `Ctrl+F5`.

### Browser shows an old design after files changed

Stop and restart the frontend server, then use `Ctrl+F5`. Also confirm the address starts with `http://127.0.0.1:8502/` and is not a directly opened `file:///...` HTML export.

## 16. Moving an already-running installation

When migrating from one PC to another:

1. Stop the producer with `Ctrl+C`.
2. Stop containers with `docker compose --profile pipeline down`.
3. Copy source files and, if desired, `data/` and `ml/model.pkl`.
4. Do not copy `.venv`, `.runtime`, `checkpoints`, or Docker's internal volume directories.
5. Recreate `.venv` and install `requirements.txt` on the destination PC.
6. Run the smoke test.
7. Regenerate data/model artifacts if they were not copied.
8. Load PostgreSQL again, because Docker named volumes do not travel with an ordinary project-folder copy.

For a database that contains important non-generated data, export it with PostgreSQL tools before migration and restore it separately. The supplied dataset is reproducible, so regeneration is normally simpler for this project.

## 17. Final readiness checklist

- [ ] PowerShell is in the directory containing `docker-compose.yml`.
- [ ] Python resolves to `.venv\Scripts\python.exe`.
- [ ] `python -m pip install -r requirements.txt` completed successfully.
- [ ] Dataset CSV files and `ml/model.pkl` exist.
- [ ] Docker Desktop is running with Linux/WSL 2 containers.
- [ ] `run_full_pipeline.ps1 -SmokeTest` prints `FULL_PIPELINE_OK`.
- [ ] Kafka offsets increase while the producer runs.
- [ ] Spark logs contain `STREAM_READY` and Parquet files are created.
- [ ] PostgreSQL reports that it is accepting connections.
- [ ] `/api/health` returns JSON.
- [ ] All eight frontend routes open at `127.0.0.1:8502`.
- [ ] The map PC has internet access for OpenStreetMap tiles.
- [ ] `python -m pytest -q` passes.

Once every item is checked, the project is ready for a full demonstration on the new PC.

## 18. Linux and macOS notes

The data-generation, model-training, producer, and frontend commands are the same after activating a POSIX virtual environment:

```bash
python3 -m venv .venv
source .venv/bin/activate
python -m pip install --upgrade pip
python -m pip install -r requirements.txt
python scripts/generate_dataset.py
python ml/train_model.py
```

Start the Docker services and create the topic with the same explicit Kafka binary path used by the Windows launcher:

```bash
docker compose up -d
docker exec kafka /opt/kafka/bin/kafka-topics.sh \
  --bootstrap-server localhost:9092 \
  --create --if-not-exists \
  --topic parking-events --partitions 3 --replication-factor 1
docker compose --profile pipeline up -d spark
```

Run the producer and frontend in separate terminals:

```bash
python kafka/producer.py
python Frontend/server.py --host 127.0.0.1 --port 8502
```

Docker Desktop is suitable for macOS. On Linux, Docker Engine with the Compose v2 plugin is sufficient. The Compose Spark service remains the supported cross-platform path; a local Java/Spark installation is optional, not required.
