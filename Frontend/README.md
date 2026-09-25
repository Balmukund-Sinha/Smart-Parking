# SmartPark integrated frontend

The Stitch exports in this directory are preserved as the visual source. The
local integration server injects `integration.js`, which turns them into one
responsive eight-route application backed by the project's real datasets,
trained model, Kafka broker, and Docker services.

## Run

From the project root on Windows:

```powershell
powershell -ExecutionPolicy Bypass -File scripts/run_frontend.ps1
```

Open <http://127.0.0.1:8502/overview>. The frontend also works with only the
generated CSV/model artifacts; live Kafka and container-health features become
available when the full Docker pipeline is running.

Routes: `/overview`, `/live-monitoring`, `/parking-map`,
`/historical-analytics`, `/demand-prediction`, `/big-data-pipeline`,
`/data-explorer`, and `/system-health`.

The server binds to localhost by default. Set a different port through the
launcher with `-Port 9000` or directly with `python Frontend/server.py --port 9000`.
