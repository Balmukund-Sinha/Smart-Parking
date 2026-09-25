# Deploy SmartPark to Vercel

## What this deployment runs

Vercel hosts the complete eight-page interface and the Python integration API. It uses the repository's compact analytical snapshots, current weather from Open-Meteo, public parking locations from OpenStreetMap Overpass, and operator-entered occupancy observations.

Vercel does **not** host the continuously running Kafka broker or PySpark streaming driver. Those services require persistent processes. Keep them on a PC, VM, or container platform when demonstrating the full pipeline. The Vercel interface reports `HYBRID` instead of falsely claiming the local stream is online.

## Files already prepared

- `api/index.py` exposes the existing HTTP handler as a Vercel Python Function.
- `vercel.json` routes page, asset, and API requests to that handler and excludes large local-only files.
- `.python-version` selects Python 3.12.
- `requirements.txt` contains only the web runtime dependencies.
- `requirements-pipeline.txt` contains the heavier local Kafka, Spark, ML, database, notebook, and test dependencies.
- `.env.example` documents optional live-data settings.

## Recommended durable state

Create a free Upstash Redis database. In its console, copy the REST URL and REST token. Do not commit these credentials.

Add both values in **Vercel > Project > Settings > Environment Variables**:

```text
UPSTASH_REDIS_REST_URL=https://...
UPSTASH_REDIS_REST_TOKEN=...
```

Apply them to Production, Preview, and Development if all environments should persist observations. Without them, the application still runs, but operator updates use temporary function storage and can disappear after a restart or scale-out.

## Deploy from GitHub

1. Push the project to a GitHub repository.
2. In Vercel, choose **Add New > Project** and import that repository.
3. Leave Framework Preset as **Other** and select the directory containing `vercel.json` as the root.
4. Add the two Upstash variables above.
5. Click **Deploy**.
6. Open `/overview`, then verify `/api/hybrid/status` returns JSON.

## Deploy with the CLI

```powershell
npm install -g vercel
vercel login
Set-Location "E:\smart-parking-bda\smart-parking-bda"
vercel
vercel env add UPSTASH_REDIS_REST_URL
vercel env add UPSTASH_REDIS_REST_TOKEN
vercel --prod
```

## Verification checklist

- Every sidebar route opens without a 404.
- `/api/hybrid/status` reports `mode: HYBRID`.
- **Parking Map > Sync Live Sources** refreshes weather and mapped parking facilities.
- Selecting a zone and pressing **Vehicle entry/exit** updates its occupancy.
- Reloading the page keeps that update when Upstash is configured.
- Export buttons download non-empty files.
- The System Health page correctly shows unavailable local-only services instead of inventing green statuses.

## Connect a remote real-time pipeline later

The current secure bridge accepts operator observations and publishes them to Kafka when the dashboard runs locally. A future hosted full-stream version should expose Kafka/Spark results through an authenticated HTTPS API or managed event service. Do not expose a raw Kafka broker directly to the browser or public internet.
