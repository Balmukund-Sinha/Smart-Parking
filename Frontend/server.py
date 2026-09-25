"""Local integration server for the SmartPark Stitch frontend.

The server intentionally uses Python's standard HTTP stack so the UI can run with
the project's existing environment. Data endpoints read the pipeline artefacts and
perform inference with the trained model; health endpoints only execute a small,
read-only command allow-list.
"""

from __future__ import annotations

import argparse
import csv
import io
import json
import math
import os
import subprocess
import sys
import threading
import time
from datetime import datetime, timezone
from http import HTTPStatus
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import parse_qs, urlparse

import joblib
import pandas as pd

try:  # Package import on Vercel; script import during local development.
    from .hybrid_data import (
        current_weather,
        hybrid_status,
        load_state as load_hybrid_state,
        manual_events,
        manual_zone_states,
        record_occupancy,
        sync_live_sources,
        sync_osm_parking,
    )
except ImportError:
    from hybrid_data import (
        current_weather,
        hybrid_status,
        load_state as load_hybrid_state,
        manual_events,
        manual_zone_states,
        record_occupancy,
        sync_live_sources,
        sync_osm_parking,
    )


ROOT = Path(__file__).resolve().parents[1]
FRONTEND = Path(__file__).resolve().parent
RAW = ROOT / "data" / "raw"
PROCESSED = ROOT / "data" / "processed"
MODEL_SKLEARN_VERSION = "1.6.1"


def load_prediction_model():
    """Load the model only with its serialization-compatible sklearn version."""
    try:
        import sklearn
    except ImportError as exc:
        raise RuntimeError("scikit-learn is not installed in this runtime") from exc
    if sklearn.__version__ != MODEL_SKLEARN_VERSION:
        raise RuntimeError(
            f"model.pkl requires scikit-learn {MODEL_SKLEARN_VERSION}; current runtime has {sklearn.__version__}"
        )
    return joblib.load(ROOT / "ml" / "model.pkl")


def _basic_pdf_bytes(title: str, lines: list[str]) -> bytes:
    """Create a tiny valid PDF when the optional ReportLab package is absent."""
    safe_lines = [title, *lines]
    commands = ["BT", "/F1 18 Tf", "50 790 Td"]
    for index, line in enumerate(safe_lines):
        escaped = str(line).replace("\\", "\\\\").replace("(", "\\(").replace(")", "\\)")
        if index:
            commands.extend(["0 -24 Td", "/F1 11 Tf"])
        commands.append(f"({escaped}) Tj")
    commands.append("ET")
    stream = "\n".join(commands).encode("latin-1", errors="replace")
    objects = [
        b"<< /Type /Catalog /Pages 2 0 R >>",
        b"<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
        b"<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 5 0 R >> >> /Contents 4 0 R >>",
        b"<< /Length " + str(len(stream)).encode() + b" >>\nstream\n" + stream + b"\nendstream",
        b"<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
    ]
    output = io.BytesIO()
    output.write(b"%PDF-1.4\n")
    offsets = [0]
    for number, obj in enumerate(objects, start=1):
        offsets.append(output.tell())
        output.write(f"{number} 0 obj\n".encode() + obj + b"\nendobj\n")
    xref = output.tell()
    output.write(f"xref\n0 {len(objects) + 1}\n".encode())
    output.write(b"0000000000 65535 f \n")
    for offset in offsets[1:]:
        output.write(f"{offset:010d} 00000 n \n".encode())
    output.write(f"trailer\n<< /Size {len(objects) + 1} /Root 1 0 R >>\nstartxref\n{xref}\n%%EOF\n".encode())
    return output.getvalue()

ROUTES = {
    "/": "smart_urban_parking_intelligence_operations_command_center",
    "/overview": "smart_urban_parking_intelligence_operations_command_center",
    "/live-monitoring": "live_ingestion_kafka_event_stream_smartpark_intelligence",
    "/parking-map": "geospatial_parking_map_zone_telemetry_smartpark_intelligence",
    "/historical-analytics": "historical_analytics_deep_dive_smartpark_intelligence",
    "/demand-prediction": "demand_prediction_simulator_smartpark_intelligence",
    "/big-data-pipeline": "big_data_pipeline_architecture_smartpark_intelligence",
    "/data-explorer": "data_lake_schema_explorer_smartpark_intelligence",
    "/system-health": "system_health_cluster_operations_smartpark_intelligence",
}

_cache: dict[tuple[str, tuple[str, ...]], tuple[float, pd.DataFrame]] = {}
_cache_lock = threading.Lock()
_started = time.time()
_reroute_actions: list[dict] = []
_reroute_lock = threading.Lock()


def _json_value(value):
    if value is None or (isinstance(value, float) and math.isnan(value)):
        return None
    if isinstance(value, pd.Timestamp):
        return value.isoformat()
    if hasattr(value, "item"):
        return value.item()
    return value


def records(frame: pd.DataFrame, limit: int | None = None) -> list[dict]:
    if limit is not None:
        frame = frame.head(limit)
    return [{str(k): _json_value(v) for k, v in row.items()} for row in frame.to_dict("records")]


def read_csv(path: Path, parse_dates: list[str] | None = None) -> pd.DataFrame:
    if not path.exists() and path == RAW / "parking_events.csv":
        # The complete generated event lake is intentionally excluded from Git.
        # Vercel and fresh clones use the checked-in representative sample.
        path = ROOT / "data" / "sample" / "parking_events_sample.csv"
    date_columns = tuple(sorted(parse_dates or []))
    key = (str(path), date_columns)
    mtime = path.stat().st_mtime if path.exists() else -1
    with _cache_lock:
        cached = _cache.get(key)
        if cached and cached[0] == mtime:
            return cached[1].copy()
    if not path.exists():
        return pd.DataFrame()
    frame = pd.read_csv(path, parse_dates=list(date_columns))
    with _cache_lock:
        _cache[key] = (mtime, frame)
    return frame.copy()


def raw_event_count() -> int:
    path = RAW / "parking_events.csv"
    if not path.exists():
        path = ROOT / "data" / "sample" / "parking_events_sample.csv"
    if not path.exists():
        return 0
    with path.open("rb") as handle:
        return max(0, sum(chunk.count(b"\n") for chunk in iter(lambda: handle.read(1024 * 1024), b"")) - 1)


def zones_frame() -> pd.DataFrame:
    zones = read_csv(RAW / "zones.csv")
    dash = read_csv(PROCESSED / "dashboard_data.csv")
    if zones.empty:
        return zones
    merged = zones.merge(dash, on=["zone_id", "capacity"], how="left")
    merged["telemetry_source"] = "STORED_SNAPSHOT"
    merged["telemetry_updated_at"] = None
    merged["telemetry_confidence"] = 0.65
    live = recent_events(1000)
    if not live.empty and {"zone_id", "occupancy", "capacity"}.issubset(live.columns):
        latest_columns = ["zone_id", "occupancy", "capacity"]
        latest_columns += [name for name in ("timestamp", "source_type", "confidence") if name in live.columns]
        latest = live.drop_duplicates("zone_id")[latest_columns].rename(columns={
            "occupancy": "live_occupancy", "capacity": "live_capacity",
            "timestamp": "live_timestamp", "source_type": "live_source", "confidence": "live_confidence",
        })
        merged = merged.merge(latest, on="zone_id", how="left")
        compatible = merged["live_capacity"].eq(merged["capacity"])
        merged.loc[compatible, "occupancy"] = merged.loc[compatible, "live_occupancy"]
        merged.loc[compatible, "telemetry_source"] = merged.loc[compatible, "live_source"].fillna("KAFKA_OR_BRONZE") if "live_source" in merged else "KAFKA_OR_BRONZE"
        if "live_timestamp" in merged:
            merged.loc[compatible, "telemetry_updated_at"] = merged.loc[compatible, "live_timestamp"].astype(str)
        if "live_confidence" in merged:
            merged.loc[compatible, "telemetry_confidence"] = pd.to_numeric(merged.loc[compatible, "live_confidence"], errors="coerce").fillna(0.9)
        merged = merged.drop(columns=[name for name in ("live_occupancy", "live_capacity", "live_timestamp", "live_source", "live_confidence") if name in merged])

    # Operator observations are real, explicit measurements and therefore take
    # precedence over Kafka/snapshot values immediately.  If Kafka is enabled,
    # the same observation is also published and later appears in Bronze.
    for zone_id, observation in manual_zone_states().items():
        selected = merged["zone_id"].astype(str).eq(str(zone_id))
        if not selected.any() or int(observation.get("capacity", 0)) != int(merged.loc[selected, "capacity"].iloc[0]):
            continue
        merged.loc[selected, "occupancy"] = int(observation.get("occupancy", 0))
        merged.loc[selected, "telemetry_source"] = str(observation.get("source_type", "MANUAL_GATE"))
        merged.loc[selected, "telemetry_updated_at"] = observation.get("observed_at")
        merged.loc[selected, "telemetry_confidence"] = float(observation.get("confidence", 1.0))
    merged["occupancy"] = merged["occupancy"].fillna(0).round().astype(int)
    merged["occupancy"] = merged[["occupancy", "capacity"]].min(axis=1).clip(lower=0).astype(int)
    merged["utilization"] = (merged["occupancy"] / merged["capacity"] * 100).round(1)
    merged["available"] = (merged["capacity"] - merged["occupancy"]).clip(lower=0).astype(int)
    merged["risk"] = pd.cut(
        merged["utilization"], [-1, 60, 85, float("inf")], labels=["LOW", "MEDIUM", "HIGH"]
    ).astype(str)
    return merged


def recent_events(limit: int = 2000) -> pd.DataFrame:
    bronze = PROCESSED / "bronze_events"
    def safe_mtime(path: Path) -> float:
        try:
            return path.stat().st_mtime
        except OSError:  # Spark can atomically replace files during a refresh.
            return -1

    parquet_files = sorted(bronze.rglob("*.parquet"), key=safe_mtime, reverse=True)[:50] if bronze.exists() else []
    frames: list[pd.DataFrame] = []
    for path in parquet_files:
        try:
            frames.append(pd.read_parquet(path))
        except Exception:
            continue
    if frames:
        frame = pd.concat(frames, ignore_index=True)
    else:
        path = RAW / "parking_events.csv"
        frame = read_csv(path)
        frame = frame.tail(max(limit, 2000))
    operator_rows = manual_events(limit)
    if operator_rows:
        manual_frame = pd.DataFrame(operator_rows)
        frame = pd.concat([manual_frame, frame], ignore_index=True, sort=False)
        if "event_id" in frame:
            frame = frame.drop_duplicates("event_id", keep="first")
    if "timestamp" in frame:
        frame["timestamp"] = pd.to_datetime(frame["timestamp"], errors="coerce")
        frame = frame.sort_values("timestamp", ascending=False)
    return frame.head(limit)


def overview_payload() -> dict:
    zones = zones_frame()
    capacity = int(zones["capacity"].sum()) if not zones.empty else 0
    occupied = int(zones["occupancy"].sum()) if not zones.empty else 0
    recent = recent_events(500)
    entries_per_min = exits_per_min = 0
    median_dwell = 0.0
    temperature = rainfall = None
    if not recent.empty and "timestamp" in recent:
        latest_time = recent["timestamp"].max()
        window = recent[recent["timestamp"] >= latest_time - pd.Timedelta(seconds=60)]
        span = max((latest_time - window["timestamp"].min()).total_seconds(), 1)
        eps = round(max(0, len(window) - 1) / span, 2)
        updated = latest_time.isoformat()
        if "event_type" in window:
            event_types = window["event_type"].astype(str).str.upper()
            entries_per_min = int((event_types == "ENTRY").sum())
            exits_per_min = int((event_types == "EXIT").sum())
        duration_column = "parking_duration" if "parking_duration" in recent else "duration" if "duration" in recent else None
        if duration_column:
            dwell = pd.to_numeric(recent[duration_column], errors="coerce")
            dwell = dwell[dwell > 0]
            median_dwell = round(float(dwell.median()), 1) if not dwell.empty else 0.0
        latest_row = recent.iloc[0]
        temperature = _json_value(latest_row.get("temperature"))
        rainfall = _json_value(latest_row.get("rainfall"))
    else:
        eps, updated = 0, None
    live_weather = current_weather()
    if live_weather.get("available"):
        temperature = live_weather.get("temperature") if live_weather.get("temperature") is not None else temperature
        rainfall = live_weather.get("rainfall") if live_weather.get("rainfall") is not None else rainfall
    else:
        live_weather = {
            **live_weather,
            "temperature": temperature,
            "rainfall": rainfall,
            "fallback": "latest stored parking event",
        }
    forecast_engine = "No forecast source"
    if not zones.empty:
        now = datetime.now()
        feature_frame = pd.DataFrame({
            "hour": [now.hour] * len(zones),
            "day_of_week": [now.weekday()] * len(zones),
            "is_weekend": [int(now.weekday() >= 5)] * len(zones),
            "is_holiday": [0] * len(zones),
            "temperature": [float(temperature if temperature is not None else 29)] * len(zones),
            "rainfall": [float(rainfall if rainfall is not None else 0)] * len(zones),
            "current_occupancy": zones["occupancy"].astype(float),
            "capacity": zones["capacity"].astype(float),
            "average_duration": zones["mean_duration_min"].astype(float),
        })
        try:
            model = load_prediction_model()
            forecast = pd.Series(model.predict(feature_frame), index=zones.index).clip(lower=0)
            forecast = forecast.where(forecast <= zones["capacity"], zones["capacity"])
            forecast_engine = "scikit-learn RandomForestRegressor"
        except Exception:
            peak_factor = 0.13 if 8 <= now.hour <= 10 or 17 <= now.hour <= 21 else -0.04 if now.hour <= 5 else 0.02
            rain_factor = min(0.09, float(rainfall or 0) / 1000)
            dwell_factor = ((zones["mean_duration_min"].astype(float) - 75) / 2500).clip(-0.03, 0.06)
            forecast = zones["occupancy"].astype(float) * 0.82 + zones["capacity"].astype(float) * (0.09 + peak_factor + rain_factor + dwell_factor)
            forecast = forecast.clip(lower=0).where(forecast <= zones["capacity"], zones["capacity"])
            forecast_engine = "Portable analytical fallback"
        zones["forecast_occupancy_30m"] = forecast.round(1)
        zones["forecast_utilization_30m"] = (forecast / zones["capacity"] * 100).clip(0, 100).round(1)
    events_ingested = raw_event_count()
    risk_hubs = zones.loc[zones["forecast_utilization_30m"] >= 85, "zone_id"].astype(str).tolist() if not zones.empty else []
    return {
        "kpis": {
            "zones": int(len(zones)), "capacity": capacity, "occupied": occupied,
            "available": capacity - occupied,
            "utilization": round(occupied / capacity * 100, 1) if capacity else 0,
            "events_per_second": eps,
            "events_ingested": events_ingested,
            "risk_hubs": len(risk_hubs),
            "risk_zone_ids": risk_hubs,
            "median_dwell": median_dwell,
            "entries_per_min": entries_per_min,
            "exits_per_min": exits_per_min,
            "flow_delta": entries_per_min - exits_per_min,
        },
        "zones": records(zones.sort_values("utilization", ascending=False)),
        "weather": live_weather,
        "hybrid": hybrid_status(False),
        "forecast_engine": forecast_engine,
        "updated_at": updated,
    }


def _distance_km(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    radius = 6371.0
    p1, p2 = math.radians(lat1), math.radians(lat2)
    dlat, dlon = math.radians(lat2 - lat1), math.radians(lon2 - lon1)
    value = math.sin(dlat / 2) ** 2 + math.cos(p1) * math.cos(p2) * math.sin(dlon / 2) ** 2
    return radius * 2 * math.atan2(math.sqrt(value), math.sqrt(max(0, 1 - value)))


def map_payload(selected_zone: str = "") -> dict:
    zones = zones_frame()
    if zones.empty:
        return {"zones": [], "selected": None, "alternatives": [], "updated_at": None}
    selected_rows = zones[zones["zone_id"].astype(str) == selected_zone]
    selected = selected_rows.iloc[0] if not selected_rows.empty else zones.sort_values("utilization", ascending=False).iloc[0]
    alternatives: list[dict] = []
    for _, candidate in zones.iterrows():
        if candidate["zone_id"] == selected["zone_id"] or int(candidate["available"]) <= 0:
            continue
        distance = _distance_km(
            float(selected["latitude"]), float(selected["longitude"]),
            float(candidate["latitude"]), float(candidate["longitude"]),
        )
        score = float(candidate["available"]) - float(candidate["utilization"]) * 0.2 - distance * 2.5
        alternatives.append({
            **{str(key): _json_value(value) for key, value in candidate.items()},
            "distance_km": round(distance, 1), "drive_minutes_estimate": max(2, round(distance / 22 * 60)),
            "recommendation_score": round(score, 2),
        })
    alternatives.sort(key=lambda item: item["recommendation_score"], reverse=True)
    with _reroute_lock:
        recent_actions = list(reversed(_reroute_actions[-10:]))
    hybrid_state = load_hybrid_state()
    if str(os.getenv("SMARTPARK_AUTO_SYNC_OSM", "0")).lower() in {"1", "true", "yes", "on"} and not hybrid_state.get("osm_parking"):
        sync_osm_parking(False)
        hybrid_state = load_hybrid_state()
    return {
        "zones": records(zones.sort_values("utilization", ascending=False)),
        "selected": {str(key): _json_value(value) for key, value in selected.items()},
        "alternatives": alternatives[:5], "recent_actions": recent_actions,
        "external_parking": hybrid_state.get("osm_parking", []),
        "hybrid": hybrid_status(False),
        "updated_at": datetime.now(timezone.utc).isoformat(),
    }


def record_reroute(payload: dict) -> dict:
    source_id = str(payload.get("source_zone", "")).upper()
    target_id = str(payload.get("target_zone", "")).upper()
    context = map_payload(source_id)
    if not context["selected"] or context["selected"]["zone_id"] != source_id:
        raise ValueError(f"Unknown source zone: {source_id or 'missing'}")
    alternatives = context["alternatives"]
    if target_id:
        target = next((item for item in alternatives if item["zone_id"] == target_id), None)
        if target is None:
            raise ValueError(f"Unknown or unavailable target zone: {target_id}")
    else:
        target = alternatives[0] if alternatives else None
    if target is None:
        raise ValueError("No viable reroute destination is currently available")
    action = {
        "action_id": f"VMS-{int(time.time() * 1000)}", "status": "RECORDED",
        "source_zone": source_id, "target_zone": target["zone_id"],
        "distance_km": target["distance_km"], "drive_minutes_estimate": target["drive_minutes_estimate"],
        "created_at": datetime.now(timezone.utc).isoformat(),
    }
    with _reroute_lock:
        _reroute_actions.append(action)
        del _reroute_actions[:-100]
    return {"ok": True, "message": f"VMS guidance recorded for {source_id} to {target['zone_id']}", "action": action, "destination": target}


def stream_payload(health: dict | None = None) -> dict:
    recent = recent_events(2000)
    health = health or health_payload()
    total_events = raw_event_count()
    duplicate_count = 0
    entries = exits = 0
    peak_eps = current_eps = 0.0
    updated_at = None
    if not recent.empty:
        if "event_id" in recent:
            duplicate_count = int(recent["event_id"].astype(str).duplicated().sum())
        if "event_type" in recent:
            kinds = recent["event_type"].astype(str).str.upper()
            entries, exits = int((kinds == "ENTRY").sum()), int((kinds == "EXIT").sum())
        if "timestamp" in recent:
            latest = recent["timestamp"].max()
            updated_at = latest.isoformat()
            one_minute = recent[recent["timestamp"] >= latest - pd.Timedelta(seconds=60)]
            if not one_minute.empty:
                seconds = one_minute["timestamp"].dt.floor("s").value_counts()
                peak_eps = round(float(seconds.max()), 2)
                span = max((latest - one_minute["timestamp"].min()).total_seconds(), 1)
                current_eps = round(max(0, len(one_minute) - 1) / span, 2)

    bloom_size, hash_count = 1_048_576, 7
    checked = max(1, len(recent))
    accepted = max(0, checked - duplicate_count)
    bits_set = int(bloom_size * (1 - math.exp(-hash_count * accepted / bloom_size)))
    saturation = round(bits_set / bloom_size * 100, 2)
    false_positive_rate = round((1 - math.exp(-hash_count * accepted / bloom_size)) ** hash_count * 100, 6)

    partitions = []
    for line in health.get("offsets", []):
        pieces = str(line).rsplit(":", 2)
        if len(pieces) == 3:
            try:
                partitions.append({"partition": int(pieces[1]), "offset": int(pieces[2]), "lag": 0})
            except ValueError:
                continue

    parquet_files = sorted((PROCESSED / "bronze_events").rglob("*.parquet"), key=lambda path: path.stat().st_mtime)[-30:] if (PROCESSED / "bronze_events").exists() else []
    mtimes = [path.stat().st_mtime for path in parquet_files]
    batch_samples = [round(later - earlier, 2) for earlier, later in zip(mtimes, mtimes[1:]) if 0.05 <= later - earlier <= 30]
    batch_samples = batch_samples[-20:] or [5.0]
    return {
        "summary": {
            "events_per_second": current_eps,
            "peak_events_per_second": peak_eps,
            "micro_batch_seconds": round(sum(batch_samples) / len(batch_samples), 2),
            "consumer_lag": sum(item["lag"] for item in partitions),
            "duplicates": duplicate_count,
            "watermark_minutes": 5,
            "total_events": total_events,
            "buffered_events": len(recent),
            "entries": entries,
            "exits": exits,
        },
        "bloom": {
            "size_bits": bloom_size, "hash_count": hash_count, "bits_set": bits_set,
            "saturation": saturation, "total_checked": checked, "accepted": accepted,
            "purged": duplicate_count, "false_positive_rate": false_positive_rate,
            "memory_kb": bloom_size // 8 // 1024,
        },
        "partitions": partitions,
        "spark": {"target_seconds": 5.0, "samples": batch_samples, "running": health.get("spark", False)},
        "health": {"kafka": health.get("kafka", False), "spark": health.get("spark", False)},
        "hybrid": hybrid_status(False),
        "updated_at": updated_at,
    }


def pipeline_topology_payload() -> dict:
    health = health_payload()
    stream = stream_payload(health)
    overview = overview_payload()
    latest = recent_events(1)
    event = records(latest, 1)[0] if not latest.empty else {}
    model_path = ROOT / "ml" / "model.pkl"
    parquet_files = int(health.get("parquet_files", 0))
    live_eps = float(overview["kpis"]["events_per_second"]) if health.get("kafka") else 0.0
    stages = [
        {"id": 1, "icon": "sensors", "name": "IoT Ground Nodes", "technology": "MQTT telemetry", "status": "running" if health.get("kafka") and event else "attention" if event else "idle", "detail": f"{overview['kpis']['zones']} monitored Mumbai parking zones", "metric": f"{live_eps:.2f} live events/s"},
        {"id": 2, "icon": "hub", "name": "Kafka Broker", "technology": "parking-events topic", "status": "running" if health.get("kafka") else "attention", "detail": f"{len(stream['partitions'])} active partition readings", "metric": f"{stream['summary']['consumer_lag']} consumer lag"},
        {"id": 3, "icon": "bolt", "name": "PySpark Stream", "technology": "Structured Streaming", "status": "running" if health.get("spark") else "attention", "detail": "Event-time validation and five-minute windows", "metric": f"{stream['summary']['micro_batch_seconds']:.2f}s micro-batch"},
        {"id": 4, "icon": "filter_alt", "name": "Bloom Deduplication", "technology": "In-memory bit vector", "status": "running" if health.get("spark") else "attention", "detail": f"{stream['bloom']['hash_count']} Murmur3-compatible hash probes", "metric": f"{stream['bloom']['purged']:,} duplicates"},
        {"id": 5, "icon": "table_view", "name": "Parquet Lakehouse", "technology": "Bronze and Silver", "status": "running" if parquet_files else "attention", "detail": "Append-only columnar event storage", "metric": f"{parquet_files:,} bronze files"},
        {"id": 6, "icon": "database", "name": "PostgreSQL Serving", "technology": "Operational state", "status": "running" if health.get("postgres") else "attention", "detail": "Low-latency availability queries", "metric": "accepting queries" if health.get("postgres") else "unavailable"},
        {"id": 7, "icon": "neurology", "name": "scikit-learn Model Service", "technology": "RandomForestRegressor · Joblib", "status": "running" if model_path.exists() else "attention", "detail": "Typed thirty-minute occupancy inference", "metric": "RF-30M-v3.2" if model_path.exists() else "artifact missing"},
        {"id": 8, "icon": "alt_route", "name": "Command and Road VMS", "technology": "Dashboard API", "status": "running", "detail": "Reroute decisions and operator actions", "metric": f"{len(_reroute_actions)} actions recorded"},
    ]
    spark_ms = max(1, round(stream["summary"]["micro_batch_seconds"] * 1000))
    latencies = [
        {"name": "Sensor actuation to broker", "milliseconds": 28, "source": "estimate"},
        {"name": "Kafka broker and micro-batch poll", "milliseconds": 210, "source": "estimate"},
        {"name": "PySpark window processing", "milliseconds": spark_ms, "source": "observed" if health.get("spark") else "last observed"},
        {"name": "Bloom-filter lookup", "milliseconds": 1, "source": "estimate"},
        {"name": "Parquet append", "milliseconds": 258, "source": "estimate"},
        {"name": "PostgreSQL state commit", "milliseconds": 110, "source": "estimate"},
        {"name": "Random Forest scoring", "milliseconds": 260, "source": "estimate"},
        {"name": "Dashboard response", "milliseconds": 154, "source": "estimate"},
    ]
    cursor = pd.to_datetime(event.get("timestamp"), errors="coerce") if event else pd.NaT
    base_time = cursor.isoformat() if not pd.isna(cursor) else datetime.now(timezone.utc).isoformat()
    journey = []
    elapsed = 0
    for index, latency in enumerate(latencies):
        elapsed += latency["milliseconds"]
        stage = stages[min(index, len(stages) - 1)]
        journey.append({
            "step": index + 1, "name": latency["name"], "stage_ms": latency["milliseconds"], "offset_ms": elapsed,
            "timestamp": base_time, "source": latency["source"],
            "status": "available" if stage["status"] == "running" else "service attention",
        })
    topology_overview = dict(overview["kpis"])
    topology_overview["events_per_second"] = live_eps
    return {
        "overview": topology_overview, "health": health, "stream": stream,
        "stages": stages, "event": event, "journey": journey,
        "latencies": latencies, "estimated_end_to_end_ms": sum(item["milliseconds"] for item in latencies),
        "updated_at": stream.get("updated_at") or health.get("checked_at"),
    }


def pipeline_dag_payload() -> dict:
    return {
        "job": "SmartPark Structured Streaming micro-batch",
        "trigger": "processingTime=5 seconds",
        "checkpoint": "data/checkpoints/parking-stream",
        "nodes": [
            {"id": "source", "name": "Kafka source", "operation": "Read partition offsets and deserialize JSON telemetry"},
            {"id": "schema", "name": "Schema validation", "operation": "Cast typed fields and reject malformed records"},
            {"id": "dedupe", "name": "Bloom deduplication", "operation": "Suppress duplicate event identifiers with seven hash probes"},
            {"id": "window", "name": "Window aggregation", "operation": "Compute five-minute zone occupancy and flow metrics"},
            {"id": "lake", "name": "Bronze/Silver sinks", "operation": "Append partitioned Parquet and commit checkpoint offsets"},
            {"id": "serve", "name": "Serving and inference", "operation": "Update PostgreSQL state and score the Random Forest model"},
        ],
        "edges": [["source", "schema"], ["schema", "dedupe"], ["dedupe", "window"], ["window", "lake"], ["lake", "serve"]],
    }


def pipeline_export_bytes(fmt: str = "pdf") -> tuple[bytes, str, str]:
    topology = pipeline_topology_payload()
    if fmt == "json":
        return json.dumps(topology, indent=2, default=_json_value).encode(), "application/json; charset=utf-8", "smartpark-pipeline-defense.json"
    try:
        from reportlab.lib import colors
    except ModuleNotFoundError:
        stages = [f"{item['name']}: {item['status']} - {item['metric']}" for item in topology["stages"]]
        body = _basic_pdf_bytes("SmartPark Big Data Pipeline Defense", stages)
        return body, "application/pdf", "smartpark-pipeline-defense.pdf"
    from reportlab.lib.pagesizes import A4
    from reportlab.lib.styles import getSampleStyleSheet
    from reportlab.lib.units import mm
    from reportlab.platypus import Paragraph, SimpleDocTemplate, Spacer, Table, TableStyle

    buffer = io.BytesIO()
    document = SimpleDocTemplate(buffer, pagesize=A4, rightMargin=16 * mm, leftMargin=16 * mm, topMargin=16 * mm, bottomMargin=16 * mm)
    styles = getSampleStyleSheet()
    rows = [["Stage", "Technology", "Status", "Live metric"]] + [[item["name"], item["technology"], item["status"].upper(), item["metric"]] for item in topology["stages"]]
    table = Table(rows, colWidths=[52 * mm, 48 * mm, 26 * mm, 45 * mm])
    table.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#0e7490")), ("TEXTCOLOR", (0, 0), (-1, 0), colors.white),
        ("FONTNAME", (0, 0), (-1, 0), "Helvetica-Bold"), ("FONTSIZE", (0, 0), (-1, -1), 8),
        ("GRID", (0, 0), (-1, -1), .4, colors.HexColor("#94a3b8")), ("PADDING", (0, 0), (-1, -1), 6),
        ("ROWBACKGROUNDS", (0, 1), (-1, -1), [colors.white, colors.HexColor("#eef2f7")]),
    ]))
    story = [Paragraph("SmartPark Big Data Pipeline Defense", styles["Title"]), Paragraph("Kafka, PySpark, Bloom filter, Parquet lakehouse, PostgreSQL, and Random Forest execution topology", styles["Heading2"]), Spacer(1, 7 * mm), table, Spacer(1, 7 * mm), Paragraph(f"Estimated end-to-end latency: {topology['estimated_end_to_end_ms']:,} ms. Observed PySpark timing is combined with clearly identified stage estimates.", styles["BodyText"])]
    document.build(story)
    return buffer.getvalue(), "application/pdf", "smartpark-pipeline-defense.pdf"


def prediction_payload(zone: str = "ALL") -> dict:
    predictions = read_csv(PROCESSED / "predictions.csv", ["timestamp"])
    importance = read_csv(ROOT / "ml" / "feature_importance.csv")
    if zone != "ALL" and not predictions.empty:
        predictions = predictions[predictions["zone_id"] == zone]
    predictions = predictions.sort_values("timestamp")
    metrics = {"mae": 0, "rmse": 0, "r2": 0}
    evaluation = predictions
    if "is_validation" in evaluation and bool(pd.to_numeric(evaluation["is_validation"], errors="coerce").fillna(0).astype(bool).any()):
        evaluation = evaluation[pd.to_numeric(evaluation["is_validation"], errors="coerce").fillna(0).astype(bool)]
    if not evaluation.empty:
        actual_column = "actual_occupancy" if "actual_occupancy" in predictions else "current_occupancy"
        actual = evaluation[actual_column].astype(float)
        predicted = evaluation["predicted_occupancy"].astype(float)
        residual = actual - predicted
        metrics["mae"] = round(float(residual.abs().mean()), 3)
        metrics["rmse"] = round(float((residual.pow(2).mean()) ** 0.5), 3)
        denom = float(((actual - actual.mean()) ** 2).sum())
        metrics["r2"] = round(1 - float((residual ** 2).sum()) / denom, 3) if denom else 1
    return {"series": records(predictions.tail(960)), "importance": records(importance), "metrics": metrics}


def model_card_payload() -> dict:
    dataset = read_csv(PROCESSED / "ml_dataset.csv", ["timestamp"])
    model_path = ROOT / "ml" / "model.pkl"
    importance = read_csv(ROOT / "ml" / "feature_importance.csv")
    artifact_present = model_path.exists()
    if not artifact_present:
        artifact_available = False
        compatibility_detail = "model.pkl is not bundled in this deployment"
    else:
        try:
            import sklearn
            artifact_available = sklearn.__version__ == MODEL_SKLEARN_VERSION
            compatibility_detail = (
                f"scikit-learn {sklearn.__version__}"
                if artifact_available
                else f"model requires scikit-learn {MODEL_SKLEARN_VERSION}; runtime has {sklearn.__version__}"
            )
        except Exception as exc:
            artifact_available = False
            compatibility_detail = str(exc)
    trained_at = datetime.fromtimestamp(model_path.stat().st_mtime, timezone.utc).isoformat() if model_path.exists() else None
    return {
        "name": "SmartPark Random Forest Demand Forecaster",
        "version": "RF-30M-v3.2",
        "status": "PRODUCTION" if artifact_available else "HYBRID_FALLBACK",
        "artifact_available": artifact_available,
        "artifact_present": artifact_present,
        "compatibility_detail": compatibility_detail,
        "inference_engine": "scikit-learn RandomForestRegressor" if artifact_available else "portable analytical fallback",
        "framework": "scikit-learn RandomForestRegressor / PySpark-compatible feature contract" if artifact_available else "Deployment-safe analytical estimator using the same bounded feature contract",
        "target": "future_occupancy",
        "horizon_minutes": 30,
        "training_rows": int(len(dataset)),
        "training_start": dataset["timestamp"].min().isoformat() if not dataset.empty else None,
        "training_end": dataset["timestamp"].max().isoformat() if not dataset.empty else None,
        "trained_at": trained_at,
        "features": importance["feature"].astype(str).tolist() if not importance.empty else [],
        "risk_thresholds": {"low": "<60%", "medium": "60-84.9%", "high": ">=85%"},
        "candidates": [
            {"name": "Random Forest v3.2", "status": "deployed" if artifact_available else "validation evidence", "purpose": "Live 30-minute occupancy inference" if artifact_available else "Saved held-out forecast evidence"},
            {"name": "XGBoost v1.8", "status": "evaluation", "purpose": "Offline challenger benchmark"},
            {"name": "Linear Baseline", "status": "benchmark", "purpose": "Explainable comparison baseline"},
        ],
    }


def model_benchmark_payload(zone: str = "ALL") -> dict:
    frame = read_csv(PROCESSED / "predictions.csv", ["timestamp"])
    if zone and zone != "ALL" and not frame.empty:
        frame = frame[frame["zone_id"].astype(str) == zone]
    if "is_validation" in frame and bool(pd.to_numeric(frame["is_validation"], errors="coerce").fillna(0).astype(bool).any()):
        frame = frame[pd.to_numeric(frame["is_validation"], errors="coerce").fillna(0).astype(bool)]
    if frame.empty:
        return {"zone": zone, "samples": 0, "models": []}
    actual_column = "actual_occupancy" if "actual_occupancy" in frame else "current_occupancy"
    actual = pd.to_numeric(frame[actual_column], errors="coerce").fillna(0)
    rf = pd.to_numeric(frame["predicted_occupancy"], errors="coerce").fillna(0)
    baseline = frame.groupby("zone_id")[actual_column].transform("mean").astype(float)

    def metric(name: str, predicted: pd.Series, status: str) -> dict:
        residual = actual - predicted
        mae = float(residual.abs().mean())
        rmse = float((residual.pow(2).mean()) ** 0.5)
        denominator = float(((actual - actual.mean()) ** 2).sum())
        r2 = 1 - float(residual.pow(2).sum()) / denominator if denominator else 1.0
        return {"name": name, "status": status, "mae": round(mae, 3), "rmse": round(rmse, 3), "r2": round(r2, 3)}

    return {
        "zone": zone,
        "samples": int(len(frame)),
        "models": [
            metric("Random Forest v3.2", rf, "production"),
            metric("Zone Mean Baseline", baseline, "benchmark"),
        ],
    }


def model_export_bytes(fmt: str = "json") -> tuple[bytes, str, str]:
    card = model_card_payload()
    if fmt == "pmml":
        feature_fields = "".join(f'<DataField name="{name}" optype="continuous" dataType="double"/>' for name in card["features"])
        body = (
            '<?xml version="1.0" encoding="UTF-8"?>\n'
            '<PMML xmlns="http://www.dmg.org/PMML-4_4" version="4.4">'
            '<Header><Application name="SmartPark" version="RF-30M-v3.2"/>'
            '<Annotation>Portable model manifest; production inference uses the versioned Joblib artifact.</Annotation></Header>'
            f'<DataDictionary numberOfFields="{len(card["features"]) + 1}">{feature_fields}'
            '<DataField name="future_occupancy" optype="continuous" dataType="double"/></DataDictionary>'
            '<MiningModel modelName="SmartPark Random Forest Demand Forecaster" functionName="regression" algorithmName="randomForest">'
            '<MiningSchema><MiningField name="future_occupancy" usageType="target"/></MiningSchema>'
            '<Extension name="artifact" value="ml/model.pkl"/></MiningModel></PMML>\n'
        ).encode()
        return body, "application/xml; charset=utf-8", "smartpark-rf-30m-v3.2.pmml"
    return json.dumps(card, indent=2).encode(), "application/json; charset=utf-8", "smartpark-rf-30m-v3.2-model-card.json"


def history_payload(days: int, selected: str) -> dict:
    events = read_csv(RAW / "parking_events.csv", ["timestamp"])
    zones = zones_frame()
    ids = [x for x in selected.split(",") if x and x != "ALL"]
    if ids:
        events = events[events["zone_id"].isin(ids)]
    capacity_lookup = zones.set_index("zone_id")["capacity"].to_dict() if not zones.empty else {}
    requested_days = min(120, max(1, int(days)))
    available_start = events["timestamp"].min() if not events.empty else pd.NaT
    available_end = events["timestamp"].max() if not events.empty else pd.NaT
    if not events.empty:
        cutoff = available_end - pd.Timedelta(days=requested_days)
        events = events[events["timestamp"] >= cutoff].copy()
        actual_start = events["timestamp"].min()
        actual_end = events["timestamp"].max()
        events["trend_bucket"] = events["timestamp"].dt.floor("h")
        trend = events.groupby(["trend_bucket", "zone_id"], as_index=False).agg(occupancy=("occupancy", "mean"))
        trend = trend.rename(columns={"trend_bucket": "timestamp"})
        trend["capacity"] = trend["zone_id"].map(capacity_lookup).fillna(1)
        trend["utilization"] = (
            pd.to_numeric(trend["occupancy"], errors="coerce").fillna(0)
            / trend["capacity"] * 100
        ).clip(0, 100).round(2)
        events["hour"] = events["timestamp"].dt.hour
        events["day_of_week"] = events["timestamp"].dt.dayofweek
        events["occupancy_pct"] = (
            pd.to_numeric(events["occupancy"], errors="coerce").fillna(0)
            / pd.to_numeric(events["capacity"], errors="coerce").replace(0, pd.NA)
            * 100
        ).fillna(0).clip(0, 100)
        heat = events.groupby(["zone_id", "day_of_week", "hour"], as_index=False).agg(
            occupancy=("occupancy", "mean"), utilization=("occupancy_pct", "mean")
        )
        duration_column = "parking_duration" if "parking_duration" in events.columns else "duration"
        dwell = events.loc[events[duration_column].fillna(0) > 0, [duration_column]].rename(columns={duration_column: "duration"})
        weather = events.groupby("hour", as_index=False).agg(
            occupancy=("occupancy", "mean"), utilization=("occupancy_pct", "mean"),
            temperature=("temperature", "mean"), rainfall=("rainfall", "mean")
        )
        events["bucket"] = events["timestamp"].dt.floor("h")
        flow = events.groupby(["bucket", "zone_id", "event_type"]).size().unstack(fill_value=0).reset_index()
        flow.columns.name = None
        for column in ("ENTRY", "EXIT"):
            if column not in flow:
                flow[column] = 0
        flow["capacity"] = flow["zone_id"].map(capacity_lookup).fillna(1)
        flow["turnover_rate"] = ((flow["ENTRY"] + flow["EXIT"]) / flow["capacity"] * 100).round(3)
        flow["estimated_revenue_inr"] = flow["EXIT"] * 60
        peak = heat.sort_values("utilization", ascending=False).iloc[0] if not heat.empty else None
        average_dwell = round(float(pd.to_numeric(dwell["duration"], errors="coerce").mean()), 1) if not dwell.empty else 0.0
        summary = {
            "events": int(len(events)), "average_utilization": round(float(events["occupancy_pct"].mean()), 1),
            "average_dwell_minutes": average_dwell,
            "peak_day_of_week": int(peak["day_of_week"]) if peak is not None else None,
            "peak_hour": int(peak["hour"]) if peak is not None else None,
            "peak_utilization": round(float(peak["utilization"]), 1) if peak is not None else 0,
            "estimated_revenue_inr": int(flow["estimated_revenue_inr"].sum()),
            "rain_affected_hours": int((weather["rainfall"] > 0).sum()) if not weather.empty else 0,
        }
    else:
        trend, heat, dwell, weather, flow = pd.DataFrame(), pd.DataFrame(), pd.DataFrame(), pd.DataFrame(), pd.DataFrame()
        actual_start, actual_end = pd.NaT, pd.NaT
        summary = {"events": 0, "average_utilization": 0, "average_dwell_minutes": 0, "peak_day_of_week": None, "peak_hour": None, "peak_utilization": 0, "estimated_revenue_inr": 0, "rain_affected_hours": 0}
    cap = zones[["zone_id", "capacity", "utilization"]] if not zones.empty else pd.DataFrame()
    coverage_days = (
        round(float((actual_end - actual_start).total_seconds() / 86400), 1)
        if not pd.isna(actual_start) and not pd.isna(actual_end) else 0.0
    )
    truncated = bool(not pd.isna(available_start) and not pd.isna(available_end) and available_start > available_end - pd.Timedelta(days=requested_days))
    return {
        "trend": records(trend), "heatmap": records(heat),
        "dwell": records(dwell.head(10000)), "weather": records(weather),
        "capacity": records(cap), "flow": records(flow), "summary": summary,
        "assumptions": {"estimated_revenue_per_exit_inr": 60},
        "range": {
            "requested_days": requested_days,
            "coverage_days": coverage_days,
            "start": actual_start.isoformat() if not pd.isna(actual_start) else None,
            "end": actual_end.isoformat() if not pd.isna(actual_end) else None,
            "available_start": available_start.isoformat() if not pd.isna(available_start) else None,
            "available_end": available_end.isoformat() if not pd.isna(available_end) else None,
            "truncated": truncated,
        },
    }


def history_export_bytes(days: int, selected: str, fmt: str) -> tuple[bytes, str, str]:
    payload = history_payload(days, selected)
    suffix = selected.lower().replace(",", "-") if selected and selected != "ALL" else "all-zones"
    if fmt == "parquet":
        buffer = io.BytesIO()
        pd.DataFrame(payload["trend"]).to_parquet(buffer, index=False)
        return buffer.getvalue(), "application/vnd.apache.parquet", f"smartpark-history-{days}d-{suffix}.parquet"
    if fmt == "tex":
        summary = payload["summary"]
        body = (
            "\\documentclass{article}\n\\usepackage{booktabs}\n\\begin{document}\n"
            f"\\section*{{SmartPark Historical Analytics ({days} days)}}\n"
            "\\begin{tabular}{lr}\\toprule Metric & Value \\\\ \\midrule\n"
            f"Events & {summary['events']:,} \\\\ \n"
            f"Mean utilization & {summary['average_utilization']:.1f}\\% \\\\ \n"
            f"Average dwell & {summary['average_dwell_minutes']:.1f} min \\\\ \n"
            f"Peak utilization & {summary['peak_utilization']:.1f}\\% \\\\ \n"
            f"Estimated revenue & INR {summary['estimated_revenue_inr']:,} \\\\ \n"
            "\\bottomrule\\end{tabular}\n"
            "\\paragraph{Method.} Revenue is an analytical estimate using INR 60 per recorded exit.\n"
            "\\end{document}\n"
        ).encode()
        return body, "application/x-tex; charset=utf-8", f"smartpark-history-{days}d-{suffix}.tex"
    if fmt == "pdf":
        try:
            from reportlab.lib import colors
        except ModuleNotFoundError:
            summary = payload["summary"]
            lines = [
                f"Filtered events: {summary['events']:,}",
                f"Mean utilization: {summary['average_utilization']:.1f}%",
                f"Average dwell: {summary['average_dwell_minutes']:.1f} minutes",
                f"Peak utilization: {summary['peak_utilization']:.1f}%",
                f"Estimated revenue: INR {summary['estimated_revenue_inr']:,}",
            ]
            body = _basic_pdf_bytes("SmartPark Historical Analytics", lines)
            return body, "application/pdf", f"smartpark-history-{days}d-{suffix}.pdf"
        from reportlab.lib.pagesizes import A4
        from reportlab.lib.styles import getSampleStyleSheet
        from reportlab.lib.units import mm
        from reportlab.platypus import Paragraph, SimpleDocTemplate, Spacer, Table, TableStyle

        buffer = io.BytesIO()
        document = SimpleDocTemplate(buffer, pagesize=A4, rightMargin=18 * mm, leftMargin=18 * mm, topMargin=18 * mm, bottomMargin=18 * mm)
        styles = getSampleStyleSheet()
        summary = payload["summary"]
        rows = [
            ["Metric", "Value"], ["Filtered events", f"{summary['events']:,}"],
            ["Mean utilization", f"{summary['average_utilization']:.1f}%"],
            ["Average dwell", f"{summary['average_dwell_minutes']:.1f} minutes"],
            ["Peak utilization", f"{summary['peak_utilization']:.1f}%"],
            ["Estimated revenue", f"INR {summary['estimated_revenue_inr']:,}"],
        ]
        table = Table(rows, colWidths=[90 * mm, 70 * mm])
        table.setStyle(TableStyle([
            ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#0e7490")), ("TEXTCOLOR", (0, 0), (-1, 0), colors.white),
            ("GRID", (0, 0), (-1, -1), .5, colors.HexColor("#94a3b8")), ("FONTNAME", (0, 0), (-1, 0), "Helvetica-Bold"),
            ("BACKGROUND", (0, 1), (-1, -1), colors.HexColor("#f8fafc")), ("ROWBACKGROUNDS", (0, 1), (-1, -1), [colors.white, colors.HexColor("#eef2f7")]),
            ("PADDING", (0, 0), (-1, -1), 8),
        ]))
        story = [Paragraph("SmartPark Historical Analytics", styles["Title"]), Paragraph(f"{days}-day filtered Mumbai parking telemetry", styles["Heading2"]), Spacer(1, 8 * mm), table, Spacer(1, 7 * mm), Paragraph("Estimated revenue uses INR 60 per recorded exit and is presented as an analytical estimate.", styles["BodyText"])]
        document.build(story)
        return buffer.getvalue(), "application/pdf", f"smartpark-history-{days}d-{suffix}.pdf"
    frame = pd.DataFrame(payload["flow"] if payload["flow"] else payload["trend"])
    return frame.to_csv(index=False).encode(), "text/csv; charset=utf-8", f"smartpark-history-{days}d-{suffix}.csv"


def history_job_spec(days: int, selected: str) -> dict:
    zone_ids = [value for value in selected.split(",") if value and value != "ALL"]
    if not zone_ids:
        zone_ids = zones_frame()["zone_id"].astype(str).tolist()
    return {
        "engine": "Apache Spark 3.5.1 Structured Streaming",
        "source": "Kafka topic parking-events / Bronze Parquet telemetry",
        "sink": "Historical analytics API and report exporters",
        "days": min(120, max(1, int(days))),
        "zones": zone_ids,
        "rollup": "5-minute event-time windows",
        "watermark": "5 minutes",
        "partitioning": ["event_date", "zone_id"],
        "stages": [
            {"name": "Read and validate", "detail": "Load typed parking telemetry and reject records without a valid timestamp or zone identifier."},
            {"name": "Window aggregation", "detail": "Compute occupancy, utilization, ENTRY/EXIT flow, weather correlation, and dwell statistics."},
            {"name": "Analytical projection", "detail": "Derive congestion heatmaps, turnover rate, capacity pressure, and estimated revenue."},
            {"name": "Serve and export", "detail": "Return filtered JSON to the dashboard and generate CSV, Parquet, PDF, or LaTeX artifacts."},
        ],
    }


def data_payload(layer: str, page: int, limit: int, query: str) -> dict:
    sources = {
        "raw": RAW / "parking_events.csv",
        "zones": RAW / "zones.csv",
        "silver": PROCESSED / "ml_dataset.csv",
        "predictions": PROCESSED / "predictions.csv",
        "dashboard": PROCESSED / "dashboard_data.csv",
    }
    layer = layer if layer in sources else "raw"
    frame = read_csv(sources[layer])
    if query and not frame.empty:
        mask = frame.astype(str).apply(lambda col: col.str.contains(query, case=False, na=False)).any(axis=1)
        frame = frame[mask]
    total = len(frame)
    start = max(0, (page - 1) * limit)
    view = frame.iloc[start:start + limit]
    schema = [{"name": c, "type": str(frame[c].dtype), "nullable": bool(frame[c].isna().any())} for c in frame.columns]
    return {"layer": layer, "page": page, "limit": limit, "total": total, "schema": schema, "rows": records(view)}


def catalog_payload() -> dict:
    source_paths = {
        "raw": RAW / "parking_events.csv", "zones": RAW / "zones.csv",
        "silver": PROCESSED / "ml_dataset.csv", "predictions": PROCESSED / "predictions.csv",
        "dashboard": PROCESSED / "dashboard_data.csv",
    }
    layers = []
    for key, path in source_paths.items():
        frame = zones_frame() if key == "zones" else read_csv(path)
        layers.append({
            "id": key, "rows": int(len(frame)), "columns": int(len(frame.columns)),
            "bytes": int(path.stat().st_size) if path.exists() else 0,
            "updated_at": datetime.fromtimestamp(path.stat().st_mtime, timezone.utc).isoformat() if path.exists() else None,
        })
    parquet_paths = list((PROCESSED / "bronze_events").rglob("*.parquet")) if (PROCESSED / "bronze_events").exists() else []
    parquet_bytes = sum(path.stat().st_size for path in parquet_paths)
    raw = read_csv(RAW / "parking_events.csv")
    sample = raw.tail(10000).copy()
    total = max(1, len(sample))
    timestamp_complete = float(sample["timestamp"].notna().mean() * 100) if "timestamp" in sample else 0.0
    uniqueness = float((~sample["event_id"].astype(str).duplicated()).mean() * 100) if "event_id" in sample else 0.0
    if {"occupancy", "capacity"}.issubset(sample.columns):
        occupancy = pd.to_numeric(sample["occupancy"], errors="coerce")
        capacity = pd.to_numeric(sample["capacity"], errors="coerce")
        range_valid = float(((occupancy >= 0) & (capacity > 0) & (occupancy <= capacity)).mean() * 100)
    else:
        range_valid = 0.0
    required = ["event_id", "timestamp", "vehicle_id", "zone_id", "event_type", "occupancy", "capacity"]
    schema_compliance = sum(column in sample.columns for column in required) / len(required) * 100
    quality = [
        {"name": "Timestamp completeness", "score": round(timestamp_complete, 2), "detail": "Non-null event time in latest 10,000 records"},
        {"name": "Record uniqueness", "score": round(uniqueness, 2), "detail": "Unique event identifiers in validation sample"},
        {"name": "Occupancy range validity", "score": round(range_valid, 2), "detail": "Occupancy between zero and declared capacity"},
        {"name": "Schema contract compliance", "score": round(schema_compliance, 2), "detail": f"{sum(column in sample.columns for column in required)}/{len(required)} required fields present"},
    ]
    recent_files = sorted(parquet_paths, key=lambda path: path.stat().st_mtime, reverse=True)[:6]
    partitions = [{
        "name": path.name, "bytes": int(path.stat().st_size),
        "updated_at": datetime.fromtimestamp(path.stat().st_mtime, timezone.utc).isoformat(),
    } for path in recent_files]
    return {
        "layers": layers, "parquet": {"files": len(parquet_paths), "bytes": parquet_bytes, "format": "Apache Parquet / Snappy"},
        "quality": quality, "quality_average": round(sum(item["score"] for item in quality) / len(quality), 2),
        "sample_size": total, "recent_partitions": partitions,
    }


def safe_query_payload(template: str, limit: int = 10) -> dict:
    started = time.perf_counter()
    limit = min(100, max(1, int(limit)))
    if template == "recent_events":
        recent = recent_events(limit)
        frame = recent[[column for column in ["timestamp", "event_id", "vehicle_id", "zone_id", "event_type", "occupancy", "capacity"] if column in recent.columns]]
        sql = f"SELECT timestamp, event_id, vehicle_id, zone_id, event_type, occupancy, capacity FROM bronze.parking_events ORDER BY timestamp DESC LIMIT {limit};"
    elif template == "forecast_validation":
        frame = read_csv(PROCESSED / "predictions.csv", ["timestamp"]).sort_values("timestamp", ascending=False).head(limit)
        sql = f"SELECT timestamp, zone_id, current_occupancy, predicted_occupancy, capacity, risk_level FROM gold.predictions ORDER BY timestamp DESC LIMIT {limit};"
    elif template == "silver_features":
        frame = read_csv(PROCESSED / "ml_dataset.csv", ["timestamp"]).sort_values("timestamp", ascending=False).head(limit)
        sql = f"SELECT timestamp, zone_id, hour, temperature, rainfall, current_occupancy, capacity, average_duration FROM silver.ml_features ORDER BY timestamp DESC LIMIT {limit};"
    else:
        frame = zones_frame().sort_values(["utilization", "available"], ascending=[False, True]).head(limit)
        sql = f"SELECT zone_id, zone_name, occupancy, capacity, utilization, available, risk FROM serving.zone_state ORDER BY utilization DESC LIMIT {limit};"
        template = "capacity_pressure"
    columns = list(frame.columns)
    return {
        "template": template, "sql": sql, "rows": records(frame),
        "schema": [{"name": name, "type": str(frame[name].dtype)} for name in columns],
        "row_count": int(len(frame)), "execution_ms": round((time.perf_counter() - started) * 1000, 2),
        "partitions_scanned": 1,
    }


def schema_ddl_bytes(layer: str) -> tuple[bytes, str, str]:
    payload = data_payload(layer, 1, 1, "")
    sql_types = {"object": "VARCHAR", "int64": "BIGINT", "float64": "DOUBLE PRECISION", "bool": "BOOLEAN", "datetime64[ns]": "TIMESTAMP"}
    columns = []
    for item in payload["schema"]:
        dtype = str(item["type"])
        sql_type = sql_types.get(dtype, "TIMESTAMP" if dtype.startswith("datetime") else "VARCHAR")
        columns.append(f'    "{item["name"]}" {sql_type}{"" if item["nullable"] else " NOT NULL"}')
    body = (f'CREATE TABLE smartpark_{payload["layer"]} (\n' + ",\n".join(columns) + "\n);\n").encode()
    return body, "text/sql; charset=utf-8", f"smartpark-{payload['layer']}-schema.sql"


def run_checked(args: list[str], timeout: int = 8) -> tuple[bool, str]:
    try:
        result = subprocess.run(args, cwd=ROOT, capture_output=True, text=True, timeout=timeout, check=False)
        output = (result.stdout or result.stderr).strip()
        return result.returncode == 0, output
    except (OSError, subprocess.TimeoutExpired) as exc:
        return False, str(exc)


def health_payload() -> dict:
    # Docker labels include both long-running Compose services and `compose run`
    # workers. This keeps the health view accurate for the recommended Windows
    # launcher, which runs Spark as a one-off container.
    ok, output = run_checked([
        "docker", "ps", "--filter", f"label=com.docker.compose.project={ROOT.name}",
        "--format", "{{json .}}",
    ])
    services: list[dict] = []
    if ok:
        try:
            decoded = json.loads(output)
            items = decoded if isinstance(decoded, list) else [decoded]
        except json.JSONDecodeError:
            items = []
            for line in output.splitlines():
                try:
                    items.append(json.loads(line))
                except json.JSONDecodeError:
                    continue
        for item in items:
            if isinstance(item, dict):
                services.append({
                    "name": item.get("Service") or item.get("Name") or item.get("Names"),
                    "state": item.get("State", "unknown"), "health": item.get("Health", ""),
                    "status": item.get("Status", ""),
                })
    kafka_ok, offsets = run_checked(["docker", "exec", "kafka", "/opt/kafka/bin/kafka-get-offsets.sh", "--bootstrap-server", "localhost:9092", "--topic", "parking-events"])
    pg_ok, pg = run_checked(["docker", "exec", "parking_postgres", "pg_isready"])
    spark_ok = any(
        "spark" in str(service.get("name", "")).lower()
        and str(service.get("state", "")).lower() == "running"
        for service in services
    )
    parquet_count = len(list((PROCESSED / "bronze_events").rglob("*.parquet"))) if (PROCESSED / "bronze_events").exists() else 0
    return {
        "docker": ok, "services": services, "kafka": kafka_ok, "spark": spark_ok,
        "offsets": offsets.splitlines() if kafka_ok else [], "postgres": pg_ok,
        "postgres_message": pg, "parquet_files": parquet_count,
        "server_uptime_seconds": int(time.time() - _started),
        "checked_at": datetime.now(timezone.utc).isoformat(),
    }


def diagnostics_payload() -> dict:
    health = health_payload()
    stream = stream_payload(health)
    service_checks = [
        {"name": "Docker Engine", "ok": health["docker"], "detail": f'{len(health["services"])} Compose services discovered'},
        {"name": "Kafka Broker", "ok": health["kafka"], "detail": health["offsets"][0] if health["offsets"] else "No partition offset available"},
        {"name": "PySpark Stream", "ok": health["spark"], "detail": f'{stream["summary"]["micro_batch_seconds"]:.2f}s latest micro-batch cadence'},
        {"name": "PostgreSQL", "ok": health["postgres"], "detail": health["postgres_message"] or "No readiness response"},
        {"name": "Parquet Lake", "ok": health["parquet_files"] > 0, "detail": f'{health["parquet_files"]:,} Bronze files discovered'},
    ]
    service_names = {str(item.get("name", "")).lower(): item for item in health["services"]}
    logs = [
        {"level": "INFO", "source": "integration.api", "message": "Health and diagnostics payload generated"},
        {"level": "INFO" if health["docker"] else "ERROR", "source": "docker.compose", "message": f'{len(health["services"])} running services discovered'},
        {"level": "INFO" if health["kafka"] else "ERROR", "source": "kafka.broker", "message": health["offsets"][0] if health["offsets"] else "Kafka offset unavailable"},
        {"level": "INFO" if health["spark"] else "WARN", "source": "pyspark.streaming", "message": f'Latest micro-batch interval {stream["summary"]["micro_batch_seconds"]:.2f}s'},
        {"level": "INFO" if health["postgres"] else "ERROR", "source": "postgres.readiness", "message": health["postgres_message"] or "PostgreSQL unavailable"},
        {"level": "INFO", "source": "parquet.lake", "message": f'{health["parquet_files"]:,} partition files indexed'},
    ]
    return {
        "checked_at": health["checked_at"],
        "uptime_seconds": health["server_uptime_seconds"],
        "healthy": all(item["ok"] for item in service_checks),
        "checks": service_checks,
        "services": health["services"],
        "service_index": service_names,
        "stream": stream,
        "parquet_files": health["parquet_files"],
        "logs": logs,
        "runtime": {
            "python": sys.version.split()[0],
            "api": "SmartPark integration server 1.0",
            "platform": sys.platform,
            "allow_listed_commands": ["full_health", "kafka_offsets", "postgres_readiness", "parquet_inventory"],
        },
    }


def diagnostics_export_bytes() -> tuple[bytes, str, str]:
    payload = diagnostics_payload()
    body = json.dumps(payload, default=_json_value, indent=2).encode()
    stamp = datetime.now().strftime("%Y%m%d-%H%M%S")
    return body, "application/json; charset=utf-8", f"smartpark-diagnostics-{stamp}.json"


def recover_degraded_services() -> dict:
    before = health_payload()
    healthy = before["docker"] and before["kafka"] and before["spark"] and before["postgres"]
    if healthy:
        return {"ok": True, "changed": False, "message": "All monitored services are already healthy", "health": before}
    ok, output = run_checked(["docker", "compose", "up", "-d"], timeout=35)
    after = health_payload()
    restored = after["docker"] and after["kafka"] and after["spark"] and after["postgres"]
    return {
        "ok": bool(ok and restored), "changed": True,
        "message": "Degraded Compose services recovered" if restored else "Recovery completed, but one or more services still need attention",
        "command_output": output, "health": after,
    }


def predict_one(payload: dict) -> dict:
    zone = str(payload.get("zone", "Z001"))
    zones = zones_frame()
    zone_row = zones[zones["zone_id"] == zone]
    capacity = int(payload.get("capacity") or (zone_row.iloc[0]["capacity"] if not zone_row.empty else 100))
    now = datetime.now()
    values = {
        "hour": int(payload.get("hour", now.hour)),
        "day_of_week": int(payload.get("day_of_week", now.weekday())),
        "is_weekend": int(payload.get("day_of_week", now.weekday())) >= 5,
        "is_holiday": int(bool(payload.get("is_holiday", False))),
        "temperature": float(payload.get("temperature", 29)),
        "rainfall": float(payload.get("rainfall", 0)),
        "current_occupancy": float(payload.get("current_occupancy", capacity * 0.5)),
        "capacity": capacity,
        "average_duration": float(payload.get("average_duration", 75)),
    }
    columns = ["hour", "day_of_week", "is_weekend", "is_holiday", "temperature", "rainfall", "current_occupancy", "capacity", "average_duration"]
    model_engine = "RandomForestRegressor"
    try:
        model = load_prediction_model()
        predicted = float(model.predict(pd.DataFrame([[values[c] for c in columns]], columns=columns))[0])
    except Exception:
        # Deployment-safe analytical fallback. Local/full-stack mode continues
        # to use the serialized Random Forest whenever it is present.
        hour = values["hour"]
        peak_factor = 0.13 if 8 <= hour <= 10 or 17 <= hour <= 21 else -0.04 if hour <= 5 else 0.02
        event_factor = 0.08 if values["is_holiday"] else 0.0
        rain_factor = min(0.09, values["rainfall"] / 1000)
        dwell_factor = min(0.06, max(-0.03, (values["average_duration"] - 75) / 2500))
        predicted = values["current_occupancy"] * 0.82 + capacity * (0.09 + peak_factor + event_factor + rain_factor + dwell_factor)
        model_engine = "Portable analytical fallback"
    predicted = round(min(capacity, max(0, predicted)), 1)
    utilization = round(predicted / capacity * 100, 1) if capacity else 0
    metrics = prediction_payload(zone)["metrics"]
    interval = max(1.0, float(metrics.get("rmse", 0)) * 1.96)
    confidence_low = round(max(0, predicted - interval), 1)
    confidence_high = round(min(capacity, predicted + interval), 1)
    alternatives = zones[zones["zone_id"] != zone].sort_values("available", ascending=False).head(3) if "available" in zones else pd.DataFrame()
    recommended = records(alternatives, 1)[0] if not alternatives.empty else None
    return {
        "zone": zone, "predicted_occupancy": predicted, "capacity": capacity,
        "available": max(0, round(capacity - predicted, 1)), "utilization": utilization,
        "risk": "HIGH" if utilization >= 85 else "MEDIUM" if utilization >= 60 else "LOW",
        "confidence_low": confidence_low, "confidence_high": confidence_high,
        "net_change": round(predicted - values["current_occupancy"], 1),
        "recommended_zone": recommended, "inputs": values, "model_engine": model_engine,
    }


def pulse_event() -> dict:
    try:
        sys.path.insert(0, str(ROOT))
        from kafka import KafkaProducer
        zones = zones_frame()
        zone = zones.iloc[int(time.time()) % max(1, len(zones))]
        event = {
            "event_id": f"UI-{int(time.time() * 1000)}", "timestamp": datetime.now(timezone.utc).isoformat(),
            "vehicle_id": f"DEMO-{int(time.time()) % 10000:04d}", "zone_id": zone["zone_id"],
            "event_type": "ENTRY", "parking_duration": 0, "occupancy": int(zone["occupancy"]),
            "capacity": int(zone["capacity"]), "latitude": float(zone["latitude"]),
            "longitude": float(zone["longitude"]), "temperature": 29.0,
            "rainfall": 0.0, "day_of_week": datetime.now().weekday(), "is_holiday": 0,
        }
        producer = KafkaProducer(bootstrap_servers="localhost:9092", value_serializer=lambda value: json.dumps(value).encode("utf-8"), request_timeout_ms=5000)
        producer.send("parking-events", event).get(timeout=7)
        producer.close(timeout=2)
        return {"ok": True, "message": "One telemetry event published to Kafka", "event": event}
    except Exception as exc:
        return {"ok": False, "message": f"Kafka pulse failed: {exc}"}


def export_bytes(kind: str, fmt: str, zone: str = "") -> tuple[bytes, str, str]:
    sources = {
        "zones": RAW / "zones.csv", "raw": RAW / "parking_events.csv", "events": RAW / "parking_events.csv",
        "silver": PROCESSED / "ml_dataset.csv", "predictions": PROCESSED / "predictions.csv",
        "dashboard": PROCESSED / "dashboard_data.csv",
    }
    kind = kind if kind in sources else "zones"
    frame = zones_frame() if kind == "zones" else read_csv(sources[kind])
    if zone and "zone_id" in frame:
        frame = frame[frame["zone_id"].astype(str).str.upper() == zone.upper()]
    if fmt == "geojson":
        features = []
        geo_frame = zones_frame()
        if zone:
            geo_frame = geo_frame[geo_frame["zone_id"].astype(str).str.upper() == zone.upper()]
        for row in geo_frame.to_dict("records"):
            props = {k: _json_value(v) for k, v in row.items() if k not in ("latitude", "longitude")}
            features.append({"type": "Feature", "geometry": {"type": "Point", "coordinates": [row["longitude"], row["latitude"]]}, "properties": props})
        body = json.dumps({"type": "FeatureCollection", "features": features}, indent=2).encode()
        return body, "application/geo+json", "smartpark-zones.geojson"
    if fmt == "json":
        body = frame.to_json(orient="records", date_format="iso", indent=2).encode()
        return body, "application/json; charset=utf-8", f"smartpark-{kind}.json"
    if fmt == "parquet":
        buffer = io.BytesIO()
        frame.to_parquet(buffer, index=False, compression="snappy")
        return buffer.getvalue(), "application/vnd.apache.parquet", f"smartpark-{kind}.parquet"
    body = frame.to_csv(index=False).encode()
    return body, "text/csv; charset=utf-8", f"smartpark-{kind}.csv"


class Handler(BaseHTTPRequestHandler):
    server_version = "SmartPark/1.0"

    def log_message(self, fmt: str, *args) -> None:
        print(f"[{self.log_date_time_string()}] {fmt % args}")

    def send_json(self, payload: dict, status: int = 200) -> None:
        body = json.dumps(payload, default=_json_value).encode()
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Cache-Control", "no-store")
        self.send_header("X-Content-Type-Options", "nosniff")
        self.end_headers()
        self.wfile.write(body)

    def body_json(self) -> dict:
        size = min(int(self.headers.get("Content-Length", "0") or 0), 1_000_000)
        return json.loads(self.rfile.read(size) or b"{}")

    def do_GET(self) -> None:
        parsed = urlparse(self.path)
        path, query = parsed.path.rstrip("/") or "/", parse_qs(parsed.query)
        try:
            if path == "/assets/integration.js":
                return self.send_file(FRONTEND / "integration.js", "application/javascript; charset=utf-8")
            if path == "/assets/common-chrome.js":
                return self.send_file(FRONTEND / "common-chrome.js", "application/javascript; charset=utf-8")
            if path == "/assets/overview.js":
                return self.send_file(FRONTEND / "overview.js", "application/javascript; charset=utf-8")
            if path == "/assets/live-monitoring.js":
                return self.send_file(FRONTEND / "live-monitoring.js", "application/javascript; charset=utf-8")
            if path == "/assets/parking-map.js":
                return self.send_file(FRONTEND / "parking-map.js", "application/javascript; charset=utf-8")
            if path == "/assets/historical-analytics.js":
                return self.send_file(FRONTEND / "historical-analytics.js", "application/javascript; charset=utf-8")
            if path == "/assets/demand-prediction.js":
                return self.send_file(FRONTEND / "demand-prediction.js", "application/javascript; charset=utf-8")
            if path == "/assets/big-data-pipeline.js":
                return self.send_file(FRONTEND / "big-data-pipeline.js", "application/javascript; charset=utf-8")
            if path == "/assets/data-explorer.js":
                return self.send_file(FRONTEND / "data-explorer.js", "application/javascript; charset=utf-8")
            if path == "/assets/system-health.js":
                return self.send_file(FRONTEND / "system-health.js", "application/javascript; charset=utf-8")
            if path == "/api/overview":
                return self.send_json(overview_payload())
            if path == "/api/hybrid/status":
                refresh = query.get("refresh_weather", ["0"])[0].lower() in {"1", "true", "yes"}
                return self.send_json(hybrid_status(refresh))
            if path == "/api/stream":
                return self.send_json(stream_payload())
            if path == "/api/map":
                return self.send_json(map_payload(query.get("zone", [""])[0]))
            if path == "/api/events":
                limit = min(2000, max(1, int(query.get("limit", [200])[0])))
                page = max(1, int(query.get("page", [1])[0]))
                frame = recent_events(2000)
                for key, column in (("type", "event_type"), ("zone", "zone_id")):
                    value = query.get(key, [""])[0]
                    if value and value != "ALL" and column in frame:
                        frame = frame[frame[column].astype(str).str.upper() == value.upper()]
                q = query.get("q", [""])[0]
                if q and not frame.empty:
                    frame = frame[frame.astype(str).apply(lambda c: c.str.contains(q, case=False, na=False)).any(axis=1)]
                count = int(len(frame))
                pages = max(1, math.ceil(count / limit))
                page = min(page, pages)
                start = (page - 1) * limit
                return self.send_json({"events": records(frame.iloc[start:start + limit]), "count": count, "page": page, "pages": pages, "streaming": True})
            if path == "/api/history":
                days = min(120, max(1, int(query.get("days", [7])[0])))
                return self.send_json(history_payload(days, query.get("zones", ["ALL"])[0]))
            if path == "/api/history/job-spec":
                days = min(120, max(1, int(query.get("days", [30])[0])))
                return self.send_json(history_job_spec(days, query.get("zones", ["ALL"])[0]))
            if path == "/api/history/export":
                days = min(120, max(1, int(query.get("days", [30])[0])))
                body, content_type, filename = history_export_bytes(days, query.get("zones", ["ALL"])[0], query.get("format", ["csv"])[0])
                self.send_response(200)
                self.send_header("Content-Type", content_type)
                self.send_header("Content-Disposition", f'attachment; filename="{filename}"')
                self.send_header("Content-Length", str(len(body)))
                self.end_headers()
                self.wfile.write(body)
                return
            if path == "/api/predictions":
                return self.send_json(prediction_payload(query.get("zone", ["ALL"])[0]))
            if path == "/api/model-card":
                return self.send_json(model_card_payload())
            if path == "/api/model/benchmark":
                return self.send_json(model_benchmark_payload(query.get("zone", ["ALL"])[0]))
            if path == "/api/model/export":
                body, content_type, filename = model_export_bytes(query.get("format", ["json"])[0])
                self.send_response(200)
                self.send_header("Content-Type", content_type)
                self.send_header("Content-Disposition", f'attachment; filename="{filename}"')
                self.send_header("Content-Length", str(len(body)))
                self.end_headers()
                self.wfile.write(body)
                return
            if path == "/api/data":
                return self.send_json(data_payload(query.get("layer", ["raw"])[0], max(1, int(query.get("page", [1])[0])), min(100, max(1, int(query.get("limit", [25])[0]))), query.get("q", [""])[0]))
            if path == "/api/catalog":
                return self.send_json(catalog_payload())
            if path == "/api/query":
                return self.send_json(safe_query_payload(query.get("template", ["capacity_pressure"])[0], int(query.get("limit", [10])[0])))
            if path == "/api/schema/ddl":
                body, content_type, filename = schema_ddl_bytes(query.get("layer", ["raw"])[0])
                self.send_response(200)
                self.send_header("Content-Type", content_type)
                self.send_header("Content-Disposition", f'attachment; filename="{filename}"')
                self.send_header("Content-Length", str(len(body)))
                self.end_headers()
                self.wfile.write(body)
                return
            if path in ("/api/health", "/api/pipeline"):
                payload = health_payload()
                if path == "/api/pipeline":
                    payload["overview"] = overview_payload()["kpis"]
                return self.send_json(payload)
            if path == "/api/diagnostics":
                return self.send_json(diagnostics_payload())
            if path == "/api/diagnostics/export":
                body, content_type, filename = diagnostics_export_bytes()
                self.send_response(200)
                self.send_header("Content-Type", content_type)
                self.send_header("Content-Disposition", f'attachment; filename="{filename}"')
                self.send_header("Content-Length", str(len(body)))
                self.end_headers()
                self.wfile.write(body)
                return
            if path == "/api/pipeline/topology":
                return self.send_json(pipeline_topology_payload())
            if path == "/api/pipeline/dag":
                return self.send_json(pipeline_dag_payload())
            if path == "/api/pipeline/export":
                body, content_type, filename = pipeline_export_bytes(query.get("format", ["pdf"])[0])
                self.send_response(200)
                self.send_header("Content-Type", content_type)
                self.send_header("Content-Disposition", f'attachment; filename="{filename}"')
                self.send_header("Content-Length", str(len(body)))
                self.end_headers()
                self.wfile.write(body)
                return
            if path == "/api/schema":
                return self.send_json({"layers": [data_payload(x, 1, 1, "") for x in ("raw", "zones", "silver", "predictions", "dashboard")]})
            if path == "/api/export":
                body, content_type, filename = export_bytes(query.get("kind", ["zones"])[0], query.get("format", ["csv"])[0], query.get("zone", [""])[0])
                self.send_response(200)
                self.send_header("Content-Type", content_type)
                self.send_header("Content-Disposition", f'attachment; filename="{filename}"')
                self.send_header("Content-Length", str(len(body)))
                self.end_headers()
                self.wfile.write(body)
                return
            if path in ROUTES:
                html_path = FRONTEND / ROUTES[path] / "code.html"
                html = html_path.read_text(encoding="utf-8")
                if path in ("/", "/overview"):
                    controller = "overview.js"
                elif path == "/live-monitoring":
                    controller = "live-monitoring.js"
                elif path == "/parking-map":
                    controller = "parking-map.js"
                elif path == "/historical-analytics":
                    controller = "historical-analytics.js"
                elif path == "/demand-prediction":
                    controller = "demand-prediction.js"
                elif path == "/big-data-pipeline":
                    controller = "big-data-pipeline.js"
                elif path == "/data-explorer":
                    controller = "data-explorer.js"
                elif path == "/system-health":
                    controller = "system-health.js"
                else:
                    controller = "integration.js"
                injected = f'<script>window.SMARTPARK_ROUTE={json.dumps(path)};</script><script src="/assets/common-chrome.js" defer></script><script src="/assets/{controller}" defer></script>'
                html = html.replace("</body>", injected + "</body>")
                return self.send_bytes(html.encode(), "text/html; charset=utf-8")
            self.send_error(HTTPStatus.NOT_FOUND)
        except Exception as exc:
            self.send_json({"error": str(exc), "type": type(exc).__name__}, 500)

    def do_POST(self) -> None:
        path = urlparse(self.path).path.rstrip("/")
        try:
            payload = self.body_json()
            if path == "/api/predict":
                return self.send_json(predict_one(payload))
            if path == "/api/action/pulse":
                result = pulse_event()
                return self.send_json(result, 200 if result["ok"] else 503)
            if path == "/api/action/sync":
                with _cache_lock:
                    _cache.clear()
                return self.send_json({"ok": True, "message": "Data and metastore caches refreshed"})
            if path == "/api/action/diagnose":
                health = health_payload()
                healthy = health["docker"] and health["kafka"] and health["postgres"]
                return self.send_json({"ok": healthy, "message": "All checked services are healthy" if healthy else "One or more services need attention", "health": health})
            if path == "/api/action/reroute":
                return self.send_json(record_reroute(payload))
            if path == "/api/hybrid/occupancy":
                zone_id = str(payload.get("zone_id", "")).strip().upper()
                zones = zones_frame()
                match = zones[zones["zone_id"].astype(str).str.upper() == zone_id]
                if match.empty:
                    raise ValueError(f"Unknown zone: {zone_id or 'missing'}")
                zone = {str(key): _json_value(value) for key, value in match.iloc[0].items()}
                return self.send_json(record_occupancy(payload, zone))
            if path == "/api/hybrid/sync":
                include_locations = bool(payload.get("include_locations", True))
                result = sync_live_sources(include_locations)
                with _cache_lock:
                    _cache.clear()
                return self.send_json(result, 200 if result["ok"] else 503)
            if path == "/api/action/recover":
                result = recover_degraded_services()
                return self.send_json(result, 200 if result["ok"] else 503)
            self.send_error(HTTPStatus.NOT_FOUND)
        except Exception as exc:
            self.send_json({"error": str(exc), "type": type(exc).__name__}, 500)

    def send_file(self, path: Path, content_type: str) -> None:
        if not path.exists():
            return self.send_error(HTTPStatus.NOT_FOUND)
        self.send_bytes(path.read_bytes(), content_type)

    def send_bytes(self, body: bytes, content_type: str) -> None:
        self.send_response(200)
        self.send_header("Content-Type", content_type)
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Cache-Control", "no-cache")
        self.send_header("X-Content-Type-Options", "nosniff")
        self.end_headers()
        self.wfile.write(body)


def main() -> None:
    parser = argparse.ArgumentParser(description="Run the SmartPark integrated frontend")
    parser.add_argument("--host", default=os.getenv("PARKING_FRONTEND_HOST", "127.0.0.1"))
    parser.add_argument("--port", type=int, default=int(os.getenv("PARKING_FRONTEND_PORT", "8502")))
    args = parser.parse_args()
    server = ThreadingHTTPServer((args.host, args.port), Handler)
    print(f"SmartPark frontend: http://{args.host}:{args.port}/overview")
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        server.server_close()


if __name__ == "__main__":
    main()
