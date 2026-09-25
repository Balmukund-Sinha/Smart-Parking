"""
db.py
-----
Thin PostgreSQL helper for the Smart Parking project. Loads the operational
summary tables (zones, occupancy_summary, predictions) from the CSVs
produced by the analytics/ML pipeline.

Configure the connection via environment variables (don't hardcode
credentials):
    PARKING_DB_HOST      (default: localhost)
    PARKING_DB_PORT      (default: 5432)
    PARKING_DB_NAME      (default: smart_parking)
    PARKING_DB_USER      (default: postgres)
    PARKING_DB_PASSWORD  (required)

Run:
    # 1. createdb smart_parking
    # 2. psql smart_parking < database/schema.sql
    # 3. python database/db.py --load-all
"""

import argparse
import os
from pathlib import Path

import pandas as pd
from sqlalchemy import create_engine

BASE_DIR = Path(__file__).resolve().parent.parent
RAW_DIR = BASE_DIR / "data" / "raw"
PROCESSED_DIR = BASE_DIR / "data" / "processed"


def get_engine():
    host = os.environ.get("PARKING_DB_HOST", "localhost")
    port = os.environ.get("PARKING_DB_PORT", "5432")
    name = os.environ.get("PARKING_DB_NAME", "smart_parking")
    user = os.environ.get("PARKING_DB_USER", "postgres")
    password = os.environ.get("PARKING_DB_PASSWORD")

    if not password:
        raise SystemExit(
            "PARKING_DB_PASSWORD is not set. Export it before running this script, e.g.\n"
            "  export PARKING_DB_PASSWORD=yourpassword"
        )

    url = f"postgresql+psycopg2://{user}:{password}@{host}:{port}/{name}"
    return create_engine(url)


def load_zones(engine):
    zones = pd.read_csv(RAW_DIR / "zones.csv")[["zone_id", "zone_name", "capacity", "latitude", "longitude"]]
    zones.to_sql("parking_zones", engine, if_exists="append", index=False)
    print(f"Loaded {len(zones)} zones into parking_zones")


def load_occupancy_summary(engine):
    trend = pd.read_csv(PROCESSED_DIR / "occupancy_trend.csv", parse_dates=["timestamp"])
    dashboard = pd.read_csv(PROCESSED_DIR / "dashboard_data.csv")
    capacity_map = dict(zip(dashboard["zone_id"], dashboard["capacity"]))

    trend["capacity"] = trend["zone_id"].map(capacity_map)
    trend["utilization"] = (trend["occupancy"] / trend["capacity"] * 100).round(1)
    trend["event_count"] = 1  # placeholder; a real pipeline would carry this through from Spark

    summary = trend.rename(columns={"occupancy": "avg_occupancy"})[
        ["timestamp", "zone_id", "avg_occupancy", "utilization", "event_count"]
    ]
    summary.to_sql("occupancy_summary", engine, if_exists="append", index=False)
    print(f"Loaded {len(summary)} rows into occupancy_summary")


def load_predictions(engine):
    predictions = pd.read_csv(PROCESSED_DIR / "predictions.csv", parse_dates=["timestamp"])
    out = predictions[["timestamp", "zone_id", "current_occupancy", "predicted_occupancy", "risk_level"]]
    out.to_sql("predictions", engine, if_exists="append", index=False)
    print(f"Loaded {len(out)} rows into predictions")


def main():
    parser = argparse.ArgumentParser(description="Load Smart Parking summary data into PostgreSQL")
    parser.add_argument("--load-zones", action="store_true")
    parser.add_argument("--load-occupancy", action="store_true")
    parser.add_argument("--load-predictions", action="store_true")
    parser.add_argument("--load-all", action="store_true")
    args = parser.parse_args()

    engine = get_engine()

    if args.load_all or args.load_zones:
        load_zones(engine)
    if args.load_all or args.load_occupancy:
        load_occupancy_summary(engine)
    if args.load_all or args.load_predictions:
        load_predictions(engine)

    if not any([args.load_zones, args.load_occupancy, args.load_predictions, args.load_all]):
        parser.print_help()


if __name__ == "__main__":
    main()
