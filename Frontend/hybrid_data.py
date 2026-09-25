"""Hybrid live-data adapters for SmartPark.

The module intentionally uses only the Python standard library so the same code
can run in the local integration server and in a Vercel Python Function.  It
combines three kinds of information:

* operator observations (real occupancy entered from the dashboard),
* current weather from Open-Meteo,
* real parking points of interest from OpenStreetMap Overpass.

Mutable state is written to Upstash Redis when its REST credentials are present.
Local development falls back to a JSON file under ``.runtime``.  On Vercel,
where the filesystem is ephemeral, the fallback is explicitly reported as
ephemeral rather than pretending that it is durable.
"""

from __future__ import annotations

import json
import os
import threading
import uuid
from datetime import datetime, timezone
from pathlib import Path
from typing import Any
from urllib.error import HTTPError, URLError
from urllib.parse import urlencode
from urllib.request import Request, urlopen


ROOT = Path(__file__).resolve().parents[1]
IS_VERCEL = bool(os.getenv("VERCEL"))
STATE_PATH = Path(os.getenv(
    "SMARTPARK_STATE_FILE",
    str(Path(os.getenv("TEMP", "/tmp")) / "smartpark_hybrid_state.json")
    if IS_VERCEL else str(ROOT / ".runtime" / "hybrid_state.json"),
))
STATE_KEY = os.getenv("SMARTPARK_STATE_KEY", "smartpark:hybrid:state:v1")
OPEN_METEO_URL = "https://api.open-meteo.com/v1/forecast"
OVERPASS_URL = os.getenv("SMARTPARK_OVERPASS_URL", "https://overpass-api.de/api/interpreter")
MUMBAI_LAT = 19.0760
MUMBAI_LON = 72.8777

_lock = threading.RLock()
_memory_state: dict[str, Any] | None = None


def _truthy(name: str, default: bool = False) -> bool:
    value = os.getenv(name)
    if value is None:
        return default
    return value.strip().lower() in {"1", "true", "yes", "on"}


def _now() -> str:
    return datetime.now(timezone.utc).isoformat()


def _default_state() -> dict[str, Any]:
    return {
        "version": 1,
        "manual_zones": {},
        "manual_events": [],
        "weather": {},
        "osm_parking": [],
        "osm_synced_at": None,
        "updated_at": None,
    }


def _redis_configured() -> bool:
    return bool(os.getenv("UPSTASH_REDIS_REST_URL") and os.getenv("UPSTASH_REDIS_REST_TOKEN"))


def _upstash(command: list[Any], timeout: float = 4.0) -> Any:
    url = os.environ["UPSTASH_REDIS_REST_URL"].rstrip("/")
    token = os.environ["UPSTASH_REDIS_REST_TOKEN"]
    request = Request(
        url,
        data=json.dumps(command, separators=(",", ":")).encode("utf-8"),
        headers={
            "Authorization": f"Bearer {token}",
            "Content-Type": "application/json",
            "User-Agent": "smartpark-intelligence/1.0",
        },
        method="POST",
    )
    with urlopen(request, timeout=timeout) as response:
        payload = json.loads(response.read().decode("utf-8"))
    if payload.get("error"):
        raise RuntimeError(payload["error"])
    return payload.get("result")


def state_store_info() -> dict[str, Any]:
    if _redis_configured():
        return {"provider": "UPSTASH_REDIS", "durable": True, "configured": True}
    if IS_VERCEL:
        return {"provider": "VERCEL_EPHEMERAL", "durable": False, "configured": False}
    return {"provider": "LOCAL_JSON", "durable": True, "configured": True, "path": str(STATE_PATH)}


def load_state() -> dict[str, Any]:
    global _memory_state
    with _lock:
        if _redis_configured():
            try:
                raw = _upstash(["GET", STATE_KEY])
                if raw:
                    value = json.loads(raw)
                    return {**_default_state(), **value}
            except (HTTPError, URLError, TimeoutError, RuntimeError, ValueError, OSError):
                # A remote-state outage must not make the read-only dashboard fail.
                pass
        if _memory_state is not None:
            return json.loads(json.dumps(_memory_state))
        try:
            if STATE_PATH.exists():
                value = json.loads(STATE_PATH.read_text(encoding="utf-8"))
                _memory_state = {**_default_state(), **value}
                return json.loads(json.dumps(_memory_state))
        except (OSError, ValueError):
            pass
        _memory_state = _default_state()
        return json.loads(json.dumps(_memory_state))


def save_state(state: dict[str, Any]) -> None:
    global _memory_state
    state = {**_default_state(), **state, "updated_at": _now()}
    encoded = json.dumps(state, ensure_ascii=False, separators=(",", ":"))
    with _lock:
        if _redis_configured():
            _upstash(["SET", STATE_KEY, encoded])
        _memory_state = json.loads(encoded)
        try:
            STATE_PATH.parent.mkdir(parents=True, exist_ok=True)
            STATE_PATH.write_text(json.dumps(state, ensure_ascii=False, indent=2), encoding="utf-8")
        except OSError:
            # Expected on read-only serverless filesystems; memory/Redis still works.
            pass


def manual_zone_states() -> dict[str, dict[str, Any]]:
    return load_state().get("manual_zones", {})


def manual_events(limit: int = 500) -> list[dict[str, Any]]:
    events = load_state().get("manual_events", [])
    return list(reversed(events[-max(1, min(limit, 2000)):]))


def _publish_kafka(event: dict[str, Any]) -> dict[str, Any]:
    if not _truthy("SMARTPARK_KAFKA_BRIDGE", True) or IS_VERCEL:
        return {"attempted": False, "published": False, "detail": "Kafka bridge disabled for this runtime"}
    try:
        from kafka import KafkaProducer  # Imported lazily; absent in the serverless bundle by design.

        producer = KafkaProducer(
            bootstrap_servers=os.getenv("KAFKA_BROKER", "localhost:9092"),
            value_serializer=lambda value: json.dumps(value).encode("utf-8"),
            request_timeout_ms=2500,
            max_block_ms=2500,
        )
        metadata = producer.send(os.getenv("KAFKA_TOPIC", "parking-events"), event).get(timeout=3)
        producer.flush(timeout=3)
        producer.close(timeout=3)
        return {
            "attempted": True,
            "published": True,
            "detail": f"{metadata.topic}:{metadata.partition}:{metadata.offset}",
        }
    except Exception as exc:  # The manual observation remains valid even if Kafka is offline.
        return {"attempted": True, "published": False, "detail": str(exc)[:240]}


def record_occupancy(payload: dict[str, Any], base_zone: dict[str, Any]) -> dict[str, Any]:
    zone_id = str(payload.get("zone_id", "")).strip().upper()
    if not zone_id or zone_id != str(base_zone.get("zone_id", "")).upper():
        raise ValueError("A valid zone_id is required")
    capacity = int(base_zone.get("capacity", 0))
    if capacity <= 0:
        raise ValueError("The selected zone has no valid capacity")
    action = str(payload.get("action", "SET")).strip().upper()
    if action not in {"ENTRY", "EXIT", "SET"}:
        raise ValueError("action must be ENTRY, EXIT, or SET")
    amount = max(1, min(100, int(payload.get("amount", 1) or 1)))

    with _lock:
        state = load_state()
        previous = state.get("manual_zones", {}).get(zone_id, {})
        current = int(previous.get("occupancy", base_zone.get("occupancy", 0)))
        if action == "ENTRY":
            occupancy = current + amount
        elif action == "EXIT":
            occupancy = current - amount
        else:
            occupancy = int(payload.get("occupancy", current))
        if occupancy < 0 or occupancy > capacity:
            raise ValueError(f"Occupancy must be between 0 and {capacity}")

        observed_at = _now()
        source_type = str(payload.get("source_type", "MANUAL_GATE")).strip().upper()[:40] or "MANUAL_GATE"
        note = str(payload.get("note", "")).strip()[:180]
        zone_state = {
            "zone_id": zone_id,
            "occupancy": occupancy,
            "capacity": capacity,
            "source_type": source_type,
            "confidence": 1.0,
            "observed_at": observed_at,
            "note": note,
        }
        event = {
            "event_id": f"LIVE-{uuid.uuid4()}",
            "timestamp": observed_at,
            "vehicle_id": str(payload.get("vehicle_id", "OPERATOR")).strip().upper()[:30] or "OPERATOR",
            "zone_id": zone_id,
            "event_type": action,
            "parking_duration": int(payload.get("parking_duration", 0) or 0),
            "occupancy": occupancy,
            "capacity": capacity,
            "latitude": float(base_zone.get("latitude", MUMBAI_LAT)),
            "longitude": float(base_zone.get("longitude", MUMBAI_LON)),
            "temperature": payload.get("temperature"),
            "rainfall": payload.get("rainfall"),
            "source_type": source_type,
            "confidence": 1.0,
            "operator_note": note,
        }
        state.setdefault("manual_zones", {})[zone_id] = zone_state
        state.setdefault("manual_events", []).append(event)
        state["manual_events"] = state["manual_events"][-2000:]
        save_state(state)

    kafka = _publish_kafka(event)
    return {
        "ok": True,
        "message": f"{zone_id} occupancy updated to {occupancy}/{capacity}",
        "zone": zone_state,
        "event": event,
        "kafka_bridge": kafka,
        "state_store": state_store_info(),
    }


def _fresh(timestamp: str | None, ttl_seconds: int) -> bool:
    if not timestamp:
        return False
    try:
        age = datetime.now(timezone.utc) - datetime.fromisoformat(timestamp.replace("Z", "+00:00"))
        return age.total_seconds() < ttl_seconds
    except (TypeError, ValueError):
        return False


def current_weather(force: bool = False) -> dict[str, Any]:
    state = load_state()
    cached = state.get("weather") or {}
    ttl = max(60, int(os.getenv("SMARTPARK_WEATHER_TTL_SECONDS", "") or "600"))
    if not force and _fresh(cached.get("fetched_at"), ttl):
        return cached
    if not _truthy("SMARTPARK_LIVE_WEATHER", True):
        return {**cached, "available": False, "provider": "Open-Meteo", "detail": "Disabled by configuration"}

    params = urlencode({
        "latitude": MUMBAI_LAT,
        "longitude": MUMBAI_LON,
        "current": "temperature_2m,rain,precipitation,relative_humidity_2m,weather_code,wind_speed_10m",
        "timezone": "Asia/Kolkata",
    })
    request = Request(
        f"{OPEN_METEO_URL}?{params}",
        headers={"User-Agent": "smartpark-intelligence/1.0"},
    )
    try:
        with urlopen(request, timeout=float(os.getenv("SMARTPARK_EXTERNAL_TIMEOUT", "3.5"))) as response:
            payload = json.loads(response.read().decode("utf-8"))
        current = payload.get("current", {})
        weather = {
            "available": True,
            "provider": "Open-Meteo",
            "source_url": "https://open-meteo.com/",
            "temperature": current.get("temperature_2m"),
            "rainfall": current.get("rain", current.get("precipitation")),
            "precipitation": current.get("precipitation"),
            "humidity": current.get("relative_humidity_2m"),
            "wind_speed": current.get("wind_speed_10m"),
            "weather_code": current.get("weather_code"),
            "observed_at": current.get("time"),
            "fetched_at": _now(),
            "is_cached": False,
        }
        state["weather"] = weather
        save_state(state)
        return weather
    except (HTTPError, URLError, TimeoutError, ValueError, OSError) as exc:
        if cached:
            return {**cached, "available": True, "is_cached": True, "detail": f"Live refresh failed: {str(exc)[:160]}"}
        failed = {"available": False, "provider": "Open-Meteo", "detail": str(exc)[:200], "fetched_at": _now()}
        state["weather"] = failed
        save_state(state)
        return failed


def sync_osm_parking(force: bool = False) -> dict[str, Any]:
    state = load_state()
    existing = state.get("osm_parking", [])
    ttl = max(300, int(os.getenv("SMARTPARK_OSM_TTL_SECONDS", "86400")))
    if not force and existing and _fresh(state.get("osm_synced_at"), ttl):
        return {"ok": True, "provider": "OpenStreetMap Overpass", "locations": existing, "cached": True, "synced_at": state.get("osm_synced_at")}
    if not _truthy("SMARTPARK_LIVE_LOCATIONS", True):
        return {"ok": False, "provider": "OpenStreetMap Overpass", "locations": existing, "cached": bool(existing), "detail": "Disabled by configuration"}

    radius = max(1000, min(50000, int(os.getenv("SMARTPARK_OSM_RADIUS_METERS", "25000"))))
    query = (
        "[out:json][timeout:25];"
        f"(nwr[\"amenity\"=\"parking\"](around:{radius},{MUMBAI_LAT},{MUMBAI_LON}););"
        "out center tags;"
    )
    request = Request(
        OVERPASS_URL,
        data=urlencode({"data": query}).encode("utf-8"),
        headers={
            "Content-Type": "application/x-www-form-urlencoded",
            "User-Agent": "smartpark-intelligence/1.0 (student project)",
        },
        method="POST",
    )
    try:
        with urlopen(request, timeout=float(os.getenv("SMARTPARK_OVERPASS_TIMEOUT", "18"))) as response:
            payload = json.loads(response.read().decode("utf-8"))
        locations: list[dict[str, Any]] = []
        for element in payload.get("elements", []):
            tags = element.get("tags", {})
            center = element.get("center", {})
            lat = element.get("lat", center.get("lat"))
            lon = element.get("lon", center.get("lon"))
            if lat is None or lon is None:
                continue
            raw_capacity = str(tags.get("capacity", "")).replace(",", "").strip()
            capacity = int(raw_capacity) if raw_capacity.isdigit() else None
            locations.append({
                "osm_id": f"{element.get('type', 'node')}/{element.get('id')}",
                "name": tags.get("name") or tags.get("operator") or "Mapped parking facility",
                "latitude": round(float(lat), 7),
                "longitude": round(float(lon), 7),
                "capacity": capacity,
                "parking_type": tags.get("parking"),
                "access": tags.get("access", "unknown"),
                "fee": tags.get("fee", "unknown"),
                "opening_hours": tags.get("opening_hours"),
                "source_type": "OPENSTREETMAP",
                "occupancy_available": False,
            })
        # Keep the response small enough for browsers and serverless functions.
        locations = locations[:300]
        synced_at = _now()
        state["osm_parking"] = locations
        state["osm_synced_at"] = synced_at
        save_state(state)
        return {"ok": True, "provider": "OpenStreetMap Overpass", "locations": locations, "cached": False, "synced_at": synced_at}
    except (HTTPError, URLError, TimeoutError, ValueError, OSError) as exc:
        return {
            "ok": bool(existing),
            "provider": "OpenStreetMap Overpass",
            "locations": existing,
            "cached": bool(existing),
            "synced_at": state.get("osm_synced_at"),
            "detail": str(exc)[:200],
        }


def hybrid_status(refresh_weather: bool = False) -> dict[str, Any]:
    state = load_state()
    weather = current_weather(force=refresh_weather)
    manual = state.get("manual_zones", {})
    osm = state.get("osm_parking", [])
    return {
        "mode": "HYBRID",
        "runtime": "VERCEL_SERVERLESS" if IS_VERCEL else "LOCAL_FULL_STACK",
        "generated_at": _now(),
        "sources": {
            "occupancy": {
                "provider": "Operator observations + local Kafka/snapshot fallback",
                "real_observations": len(manual),
                "available": True,
            },
            "weather": weather,
            "parking_locations": {
                "provider": "OpenStreetMap Overpass",
                "available": bool(osm),
                "count": len(osm),
                "synced_at": state.get("osm_synced_at"),
            },
            "state_store": state_store_info(),
        },
    }


def sync_live_sources(include_locations: bool = True) -> dict[str, Any]:
    weather = current_weather(force=True)
    locations = sync_osm_parking(force=True) if include_locations else {
        "ok": True,
        "locations": load_state().get("osm_parking", []),
        "cached": True,
        "provider": "OpenStreetMap Overpass",
    }
    return {
        "ok": bool(weather.get("available")) or bool(locations.get("ok")),
        "message": f"Live sources refreshed: weather {'online' if weather.get('available') else 'unavailable'}, {len(locations.get('locations', []))} mapped parking locations",
        "weather": weather,
        "parking_locations": locations,
        "status": hybrid_status(False),
    }
