"""
producer.py
-----------
Simulates real-time parking sensor events (vehicle ENTRY/EXIT) and publishes
them to the Kafka topic `parking-events`.

Requires a running Kafka broker (see ../docker-compose.yml) and the
`kafka-python` package (see ../requirements.txt).

Run:
    python kafka/create_topic.sh          # one-time: create the topic
    python kafka/producer.py              # start streaming events

Each zone maintains its own live occupancy counter in this process so the
stream looks like a real building: occupancy rises with ENTRY events and
falls with EXIT events, bounded by that zone's capacity.
"""

import argparse
import csv
import json
import os
import random
import time
import uuid
from datetime import datetime
from pathlib import Path

from kafka import KafkaProducer

BOOTSTRAP_SERVERS = os.environ.get("KAFKA_BOOTSTRAP_SERVERS", "localhost:9092")
TOPIC = os.environ.get("KAFKA_TOPIC", "parking-events")

FALLBACK_ZONES = {
    "Z001": 120, "Z002": 80, "Z003": 200, "Z004": 60, "Z005": 150,
    "Z006": 90, "Z007": 110, "Z008": 70, "Z009": 130, "Z010": 100,
}


def load_zones() -> tuple[dict[str, int], dict[str, tuple[float, float]]]:
    """Load the same zone capacities and coordinates used by analytics and UI."""
    path = Path(__file__).resolve().parents[1] / "data" / "raw" / "zones.csv"
    if not path.exists():
        return FALLBACK_ZONES, {}
    capacities: dict[str, int] = {}
    coordinates: dict[str, tuple[float, float]] = {}
    with path.open(newline="", encoding="utf-8") as handle:
        for row in csv.DictReader(handle):
            zone_id = row["zone_id"]
            capacities[zone_id] = int(float(row["capacity"]))
            coordinates[zone_id] = (float(row["latitude"]), float(row["longitude"]))
    return capacities or FALLBACK_ZONES, coordinates


ZONES, ZONE_COORDINATES = load_zones()

CENTER_LAT, CENTER_LON = 19.0760, 72.8777  # Mumbai


def build_producer() -> KafkaProducer:
    return KafkaProducer(
        bootstrap_servers=BOOTSTRAP_SERVERS,
        acks=1,
        enable_idempotence=False,
        max_in_flight_requests_per_connection=1,
        retries=3,
        linger_ms=10,
    )


class ZoneState:
    """Tracks live occupancy per zone so ENTRY/EXIT events stay consistent."""

    def __init__(self, zones: dict):
        self.capacity = dict(zones)
        self.occupancy = {zone_id: random.randint(0, cap // 2) for zone_id, cap in zones.items()}

    def next_event_type(self, zone_id: str) -> str:
        cap = self.capacity[zone_id]
        occ = self.occupancy[zone_id]
        if occ <= 0:
            return "ENTRY"
        if occ >= cap:
            return "EXIT"
        # Otherwise mostly-random with a slight bias, weighted by fill level
        return "ENTRY" if random.random() > (occ / cap) else "EXIT"

    def apply(self, zone_id: str, event_type: str) -> int:
        if event_type == "ENTRY":
            self.occupancy[zone_id] = min(self.capacity[zone_id], self.occupancy[zone_id] + 1)
        else:
            self.occupancy[zone_id] = max(0, self.occupancy[zone_id] - 1)
        return self.occupancy[zone_id]


def generate_event(state: ZoneState) -> dict:
    zone_id = random.choice(list(ZONES.keys()))
    event_type = state.next_event_type(zone_id)
    occupancy = state.apply(zone_id, event_type)

    zone_lat, zone_lon = ZONE_COORDINATES.get(zone_id, (CENTER_LAT, CENTER_LON))
    return {
        "event_id": str(uuid.uuid4()),
        "timestamp": datetime.now().isoformat(),
        "vehicle_id": f"V{random.randint(1, 10000):05d}",
        "zone_id": zone_id,
        "event_type": event_type,
        "parking_duration": random.randint(5, 180) if event_type == "EXIT" else 0,
        "occupancy": occupancy,
        "capacity": ZONES[zone_id],
        "latitude": round(zone_lat + random.uniform(-0.0004, 0.0004), 6),
        "longitude": round(zone_lon + random.uniform(-0.0004, 0.0004), 6),
        "temperature": round(random.uniform(20, 36), 2),
        "rainfall": round(random.uniform(0, 30), 2),
    }


def parse_args():
    parser = argparse.ArgumentParser(description="Publish simulated parking events to Kafka")
    parser.add_argument(
        "--count",
        type=int,
        default=0,
        help="Stop after this many events (0 streams until Ctrl+C)",
    )
    parser.add_argument(
        "--interval",
        type=float,
        default=1.0,
        help="Seconds between events",
    )
    return parser.parse_args()


def main():
    args = parse_args()
    if args.count < 0:
        raise SystemExit("--count must be zero or greater")
    if args.interval < 0:
        raise SystemExit("--interval must be zero or greater")

    producer = build_producer()
    state = ZoneState(ZONES)

    print(f"Starting Kafka producer -> topic '{TOPIC}' @ {BOOTSTRAP_SERVERS}")
    print("Press Ctrl+C to stop.\n")

    try:
        sent = 0
        while args.count == 0 or sent < args.count:
            event = generate_event(state)
            payload = json.dumps(event).encode("utf-8")
            producer.send(TOPIC, value=payload).get(timeout=10)
            sent += 1
            print(f"Sent: {event['zone_id']} {event['event_type']:5s} "
                  f"occ={event['occupancy']}/{event['capacity']}  ({event['event_id'][:8]})")
            if args.interval and (args.count == 0 or sent < args.count):
                time.sleep(args.interval)
    except KeyboardInterrupt:
        print("\nStopping producer ...")
    finally:
        producer.flush()
        producer.close()


if __name__ == "__main__":
    main()
