# SmartPark Intelligence

SmartPark is an end-to-end smart-parking analytics project for the Mumbai Metropolitan Region. It combines synthetic IoT telemetry, Kafka ingestion, PySpark Structured Streaming, Parquet storage, PostgreSQL serving tables, a Random Forest demand model, free live-data adapters, and an integrated eight-page web interface.

The recommended Windows architecture keeps Spark and Hadoop inside Linux Docker containers. This avoids the `winutils.exe`, native Hadoop DLL, Microsoft Store Python alias, and temporary JAR-locking problems that commonly affect native Windows Spark installations.

For a simple, student-friendly explanation of what the project does, where its data comes from, why each technology is used, and how the complete pipeline works, read [PROJECT_EXPLANATION.md](PROJECT_EXPLANATION.md).

For a complete first-time installation or for moving the project to another computer, follow [SETUP_ON_ANOTHER_PC.md](SETUP_ON_ANOTHER_PC.md).

For serverless hosting, follow [VERCEL_DEPLOYMENT.md](VERCEL_DEPLOYMENT.md).

## What the project includes

- Live Kafka parking-event ingestion and a bounded producer for testing.
- PySpark validation, deduplication, window aggregation, and Parquet output.
- Bloom-filter telemetry for duplicate event detection.
- Historical occupancy, dwell-time, congestion, weather, and capacity analytics.
- A trained Random Forest model for 30-minute occupancy prediction.
- Real Mumbai parking-zone coordinates displayed on an OpenStreetMap/Leaflet map.
- Docker, Kafka, Spark, PostgreSQL, and lakehouse health diagnostics.
- CSV, JSON, GeoJSON, model, schema, diagnostic, and report exports.
- A responsive frontend whose controls, charts, tables, filters, map, and actions are connected to the local integration API.
- Hybrid operation: local Kafka/Spark when available, plus operator occupancy observations, Open-Meteo weather, and OpenStreetMap parking facilities when deployed serverlessly.

## Architecture

```text
Parking event producer
        |
        v
Kafka topic: parking-events
        |
        v
PySpark Structured Streaming
  | validation | Bloom deduplication | five-minute windows
        |
        +--------------------+
        |                    |
        v                    v
Bronze/Silver Parquet   PostgreSQL summaries
        |                    |
        +----------+---------+
                   |
                   v
     Analytics + Random Forest model
                   |
                   v
       Frontend integration API/UI
```

## Application pages

| Page | Route | Purpose |
|---|---|---|
| Overview | `/overview` | Executive metrics, map, risk ranking, live flow, demand, and capacity pressure |
| Live Monitoring | `/live-monitoring` | Kafka events, stream controls, filtering, paging, and deduplication telemetry |
| Parking Map | `/parking-map` | Real map, Mumbai zone positions, slot status, and routing actions |
| Historical Analytics | `/historical-analytics` | Multi-zone trends, congestion heatmap, dwell distribution, and weather correlation |
| Demand Prediction | `/demand-prediction` | Interactive 30-minute Random Forest inference and model evidence |
| Big Data Pipeline | `/big-data-pipeline` | Execution topology, stage status, latency, packet journey, and payload inspection |
| Data Explorer | `/data-explorer` | Lakehouse catalog, schemas, governed queries, records, partitions, and quality checks |
| System Health | `/system-health` | Container readiness, Kafka offsets, Spark cadence, diagnostics, and recovery controls |

## Prerequisites

Recommended for Windows:

- Windows 10 or 11, 64-bit.
- Docker Desktop with the WSL 2 engine enabled.
- Python 3.10 or newer (64-bit). Python 3.11 or 3.12 is a safe default, and the current project has also been verified with Python 3.13.
- Git, if the project will be cloned instead of copied.
- At least 8 GB RAM; 12 GB or more is preferable when Spark is running.
- Internet access on the first run to download Python packages, Docker images, the Spark Kafka connector, and map tiles.

A local JDK, Hadoop installation, `HADOOP_HOME`, and `winutils.exe` are **not required** for the recommended Docker-based workflow.

## Quick start on Windows

Run all commands from the directory containing `docker-compose.yml`.

### 1. Create the Python environment

```powershell
python -m venv .venv
Set-ExecutionPolicy -Scope Process -ExecutionPolicy Bypass
.\.venv\Scripts\Activate.ps1
python -m pip install --upgrade pip
python -m pip install -r requirements-pipeline.txt
$env:PARKING_PYTHON = (Resolve-Path .\.venv\Scripts\python.exe).Path
```

`PARKING_PYTHON` makes the launchers use the virtual environment directly and prevents Windows App Execution Aliases from redirecting `python` to the Microsoft Store.

### 2. Generate local data and train the model

Generated CSV files and the model are intentionally excluded from Git, so a clean clone normally needs this step:

```powershell
python scripts\generate_dataset.py
python ml\train_model.py
```

### 3. Start and verify the Docker pipeline

Start Docker Desktop and wait until it reports that the engine is running. Then run:

```powershell
powershell -ExecutionPolicy Bypass -File scripts\run_full_pipeline.ps1 -SmokeTest
```

The smoke test starts Kafka and PostgreSQL, creates `parking-events`, runs a bounded producer-to-Spark-to-Parquet flow, and finishes with `FULL_PIPELINE_OK` when successful.

### 4. Start the continuous services

Prepare the infrastructure:

```powershell
powershell -ExecutionPolicy Bypass -File scripts\run_full_pipeline.ps1
```

Start the continuous event producer in a second PowerShell window:

```powershell
& .\.venv\Scripts\python.exe kafka\producer.py
```

Start Spark in a third PowerShell window:

```powershell
docker compose --profile pipeline up -d spark
```

Optional: populate PostgreSQL serving tables from the generated analytics files:

```powershell
$env:PARKING_DB_PASSWORD = "postgres"
python database\db.py --load-all
```

### 5. Start the integrated frontend

```powershell
powershell -ExecutionPolicy Bypass -File scripts\run_frontend.ps1
```

Open <http://127.0.0.1:8502/overview>.

## Frontend-only demo

Kafka, Spark, and PostgreSQL are optional when only the visual demonstration is required. The frontend reads the generated CSV/model artifacts and clearly reports unavailable live services.

```powershell
python -m venv .venv
.\.venv\Scripts\Activate.ps1
python -m pip install -r requirements.txt
powershell -ExecutionPolicy Bypass -File scripts\run_frontend.ps1
```

Open <http://127.0.0.1:8502/overview>.

This lightweight mode uses the checked-in sample and analytical snapshots. To regenerate all data and use the serialized Random Forest locally, install `requirements-pipeline.txt`, then run the generator and trainer from the full quick-start section.

## Hybrid live-data mode

The application never labels estimated public-map data as live occupancy. It combines sources with explicit provenance:

| Source | What it supplies | Cost / credential |
|---|---|---|
| Kafka + PySpark | Full local event stream and analytics pipeline | Local Docker stack |
| Operator observation controls | Real ENTRY, EXIT, or occupied-bay updates entered from the Parking Map | Free; no key |
| Open-Meteo | Current Mumbai temperature, rain, humidity, and wind | Free non-commercial tier; no key |
| OpenStreetMap Overpass | Real mapped parking-facility locations and public tags | Free public service; no occupancy |
| Upstash Redis REST | Durable serverless operator state | Optional free database |
| Checked-in sample/snapshots | Read-only fallback for charts and tables | Included in the repository |

Use **Parking Map > Sync Live Sources** to refresh weather and mapped facilities. Select a zone and use **Vehicle entry**, **Vehicle exit**, or **Set occupancy** to record an actual observation. Locally, the observation is saved under `.runtime/` and is also offered to Kafka. On Vercel, configure Upstash so observations survive function restarts.

## Deploy to Vercel

Kafka brokers and continuously running Spark jobs do not run inside a short-lived Vercel Function. The checked-in deployment therefore uses the same UI/API in hybrid mode: sample analytics remain available, free live weather and mapped parking locations can refresh, and mutable occupancy observations use Upstash Redis.

1. Push this repository to GitHub.
2. Create a free Upstash Redis database and copy its REST URL/token.
3. Import the GitHub repository into Vercel. The root directory is the folder containing `vercel.json`.
4. In Vercel project environment variables, add `UPSTASH_REDIS_REST_URL` and `UPSTASH_REDIS_REST_TOKEN`.
5. Deploy. `api/index.py` exposes the existing integration server and `vercel.json` routes every page/API request to it.

CLI alternative:

```powershell
npm install -g vercel
vercel login
vercel
vercel env add UPSTASH_REDIS_REST_URL
vercel env add UPSTASH_REDIS_REST_TOKEN
vercel --prod
```

Without Upstash the deployed dashboard still opens, fetches weather/locations, and accepts updates, but Vercel's temporary filesystem cannot guarantee that those updates persist across invocations. The header displays `HYBRID` so this limitation is visible rather than hidden.

## Service ports and credentials

| Component | Address | Default |
|---|---|---|
| Integrated frontend/API | `127.0.0.1:8502` | Localhost only |
| Kafka host listener | `localhost:9092` | Topic `parking-events` |
| PostgreSQL | `localhost:5432` | Database `smart_parking` |
| PostgreSQL development login | user `postgres` | password `postgres` |

The PostgreSQL password in `docker-compose.yml` is suitable only for local development. Change it before deploying outside a trusted machine.

## Useful commands

```powershell
# Show container state
docker compose ps

# Follow Spark output
docker compose --profile pipeline logs -f spark

# List Kafka topics using the binary's actual container path
docker exec kafka /opt/kafka/bin/kafka-topics.sh --bootstrap-server localhost:9092 --list

# Show Kafka topic offsets
docker exec kafka /opt/kafka/bin/kafka-get-offsets.sh --bootstrap-server localhost:9092 --topic parking-events

# Check the frontend API after the server starts
Invoke-RestMethod http://127.0.0.1:8502/api/health

# Stop containers while retaining database/checkpoint volumes
docker compose --profile pipeline down

# Run automated tests
python -m pytest -q
```

## Dataset and model

The default generator creates 20 Mumbai zones, 6,000 vehicles, and 21 days of ENTRY/EXIT activity. It derives zone demand from capacity, dwell time, time of day, day of week, weather, and holiday/event effects.

The Random Forest predicts occupancy 30 minutes ahead from:

- hour and day-of-week features;
- weekend and holiday flags;
- temperature and rainfall;
- current occupancy and zone capacity;
- average parking duration.

The default seeded dataset currently produces approximately:

| Metric | Result |
|---|---:|
| MAE | 3.100 vehicles |
| RMSE | 4.388 vehicles |
| R2 | 0.9630 |

Regenerating the data with different arguments can change these metrics. The training script always prints the actual result and rewrites `ml/model.pkl`, `ml/feature_importance.csv`, and `data/processed/predictions.csv`.

Example larger dataset:

```powershell
python scripts\generate_dataset.py --zones 100 --vehicles 20000 --days 180
python ml\train_model.py
```

## Main configuration

| Variable or option | Default | Meaning |
|---|---|---|
| `PARKING_PYTHON` | auto-detected | Absolute path to the Python executable used by PowerShell launchers |
| `PARKING_FRONTEND_HOST` | `127.0.0.1` | Frontend/API bind address |
| `PARKING_FRONTEND_PORT` | `8502` | Frontend/API port |
| `KAFKA_BOOTSTRAP_SERVERS` | host: `localhost:9092`; container: `kafka:29092` | Kafka connection |
| `KAFKA_TOPIC` | `parking-events` | Event topic |
| `KAFKA_STARTING_OFFSETS` | `earliest` in Compose | Spark starting offset policy |
| `PARKING_STREAM_OUTPUT_ROOT` | `data/processed` | Bronze and Silver Parquet output root |
| `PARKING_CHECKPOINT_ROOT` | Docker volume | Structured Streaming checkpoint root |
| `PARKING_DB_HOST` | `localhost` | PostgreSQL host used by `database/db.py` |
| `PARKING_DB_PORT` | `5432` | PostgreSQL port |
| `PARKING_DB_NAME` | `smart_parking` | PostgreSQL database |
| `PARKING_DB_USER` | `postgres` | PostgreSQL user |
| `PARKING_DB_PASSWORD` | required by loader | PostgreSQL password |
| `UPSTASH_REDIS_REST_URL` | unset | Optional durable hybrid-state REST endpoint for Vercel |
| `UPSTASH_REDIS_REST_TOKEN` | unset | Token for the Upstash REST endpoint |
| `SMARTPARK_LIVE_WEATHER` | `true` | Enable current Mumbai weather from Open-Meteo |
| `SMARTPARK_LIVE_LOCATIONS` | `true` | Enable OpenStreetMap Overpass parking-place discovery |
| `SMARTPARK_KAFKA_BRIDGE` | `true` locally | Publish operator observations to Kafka when reachable |

The frontend launcher also accepts explicit options:

```powershell
powershell -ExecutionPolicy Bypass -File scripts\run_frontend.ps1 -Port 9000 -HostAddress 0.0.0.0
```

Binding to `0.0.0.0` exposes the dashboard to the local network. Only do this on a trusted network and configure Windows Firewall deliberately.

## Repository structure

```text
Frontend/                 Integrated eight-page web UI and Python API server
analytics/                Batch analytics jobs
dashboard/                Legacy Streamlit dashboard
data/raw/                 Generated events and zone registry
data/processed/           ML tables and Bronze/Silver Parquet outputs
data/sample/              Small GitHub-safe example dataset
database/                 PostgreSQL schema and CSV loader
kafka/                    Event producer and topic helper
ml/                       Random Forest training, inference, and artifacts
r-analytics/              Parallel R analytics implementation
scripts/                  Windows launchers and dataset generator
streaming/                PySpark stream, schema, and Bloom filter
tests/                    Automated backend/frontend tests
docker-compose.yml        Kafka, PostgreSQL, and containerized Spark
requirements.txt          Python dependencies
```

Generated data, trained models, Spark checkpoints, logs, caches, and browser-test profiles are intentionally excluded from Git. A clean clone recreates them with `python scripts/generate_dataset.py` and `python ml/train_model.py`. The retained `Frontend/**/screen.png` files are intentional visual-design references, not runtime screenshots.

## Additional documentation

- [Complete installation and transfer guide](SETUP_ON_ANOTHER_PC.md)
- [Integrated frontend notes](Frontend/README.md)
- [R analytics track](r-analytics/README.md)

## Windows troubleshooting summary

- **Docker daemon unavailable:** launch Docker Desktop and wait for the engine before running Compose.
- **Python opens the Microsoft Store:** set `PARKING_PYTHON` to `.venv\Scripts\python.exe` as shown above.
- **Kafka utility not found:** use `/opt/kafka/bin/kafka-topics.sh` inside the Kafka container.
- **`winutils.exe` or `hadoop.dll` errors:** do not run the Spark job natively on Windows; use the Compose `spark` profile.
- **JAR deletion or Windows file-lock errors:** keep Spark and checkpoints in Docker/Linux volumes.
- **Map tiles do not appear:** allow internet access to OpenStreetMap tile servers; telemetry markers and data can still load without the basemap.
- **A port is already occupied:** stop the conflicting service or change the frontend port; Kafka/PostgreSQL host-port changes must also be reflected in client configuration.

See [SETUP_ON_ANOTHER_PC.md](SETUP_ON_ANOTHER_PC.md#troubleshooting) for detailed diagnostics and recovery steps.
