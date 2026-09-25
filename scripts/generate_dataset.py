"""
generate_dataset.py
--------------------
Generates a realistic synthetic parking-events dataset for the
Smart Urban Parking Intelligence project.

Why this exists:
  Kafka + PySpark Structured Streaming are the *production* ingestion path
  (see kafka/producer.py + streaming/spark_streaming.py). But a college
  project also needs a large, realistic historical dataset to demo
  analytics/ML/dashboard without requiring a live cluster. This script
  builds that dataset in one shot using vectorised pandas/numpy — no Spark
  or Kafka required to run it.

Calibration:
  Each zone is assigned a capacity, an average stay duration, and a target
  peak utilization (e.g. 75% full at the busiest hour). The number of
  sessions generated for that zone is derived analytically from queueing
  theory (Little's Law: L = lambda * W) so that the simulated occupancy
  actually reaches realistic peak/off-peak levels, instead of a fixed
  session count that under- or over-fills zones of different sizes.

Outputs:
  data/raw/parking_events.csv        -> full raw event log (ENTRY/EXIT)
  data/raw/zones.csv                 -> zone reference table (id/capacity/lat/lon)
  data/sample/parking_events_sample.csv -> first 2,000 rows, for quick preview
  data/processed/ml_dataset.csv      -> time-bucketed features + future_occupancy target
  data/processed/dashboard_data.csv  -> latest snapshot per zone (for KPI cards)
  data/processed/occupancy_trend.csv -> last 7 days of occupancy per zone (for trend chart)

Usage:
  python scripts/generate_dataset.py                     # defaults (~20 zones, ~3 weeks)
  python scripts/generate_dataset.py --zones 60 --days 60 --vehicles 10000
"""

import argparse
from pathlib import Path

import numpy as np
import pandas as pd

BASE_DIR = Path(__file__).resolve().parent.parent
RAW_DIR = BASE_DIR / "data" / "raw"
SAMPLE_DIR = BASE_DIR / "data" / "sample"
PROCESSED_DIR = BASE_DIR / "data" / "processed"

CENTER_LAT, CENTER_LON = 19.0760, 72.8777  # Mumbai, used as the demo city centre

MUMBAI_ZONE_NAMES = [
    "Deonar Municipal Parking Hub",
    "Bhandup East Parking Hub",
    "Shastri Nagar Airport Road",
    "Chakala Metro Parking Hub",
    "Kurla West Parking Hub",
    "Mahim Parking Hub",
    "Santacruz West Parking Hub",
    "Wadala Sangam Nagar Hub",
    "Oshiwara West Parking Hub",
    "Powai Lake South Hub",
    "Saki Naka Parking Hub",
    "Govandi East Parking Hub",
    "Powai Saki Vihar Hub",
    "Jogeshwari East Parking Hub",
    "Vikhroli West Parking Hub",
    "Trombay Municipal Parking Hub",
    "BKC Connector Parking Hub",
    "Prabhadevi South Parking Hub",
    "Fertilizer Colony Parking Hub",
    "Vile Parle Nehru Nagar Hub",
]

# Peak-hour weighting: morning rush, lunch peak, evening rush; quiet overnight.
# Weights are normalised to sum to 1 across the 24 hours.
_HOUR_WEIGHTS_RAW = np.ones(24)
for h in (8, 9, 10):
    _HOUR_WEIGHTS_RAW[h] = 3.0
for h in (12, 13):
    _HOUR_WEIGHTS_RAW[h] = 3.5
for h in (17, 18, 19):
    _HOUR_WEIGHTS_RAW[h] = 4.0
for h in (0, 1, 2, 3, 4):
    _HOUR_WEIGHTS_RAW[h] = 0.1
HOUR_WEIGHTS = _HOUR_WEIGHTS_RAW / _HOUR_WEIGHTS_RAW.sum()
PEAK_WEIGHT = HOUR_WEIGHTS.max()


def build_zones(rng, num_zones, cap_min, cap_max, util_min, util_max, dur_min, dur_max):
    """Each zone gets a capacity, a target peak utilization, and an average
    stay duration (minutes). These three numbers determine how much traffic
    the zone needs (via Little's Law) to realistically reach that peak."""
    zone_ids = [f"Z{str(i + 1).zfill(3)}" for i in range(num_zones)]
    capacity = rng.integers(cap_min, cap_max, size=num_zones)
    lat = CENTER_LAT + rng.uniform(-0.06, 0.06, size=num_zones)
    lon = CENTER_LON + rng.uniform(-0.06, 0.06, size=num_zones)
    peak_utilization = rng.uniform(util_min, util_max, size=num_zones)
    mean_duration_min = rng.uniform(dur_min, dur_max, size=num_zones)

    zones_df = pd.DataFrame({
        "zone_id": zone_ids,
        "zone_name": [MUMBAI_ZONE_NAMES[i] if i < len(MUMBAI_ZONE_NAMES) else f"Mumbai Parking Zone {i + 1}" for i in range(num_zones)],
        "capacity": capacity,
        "latitude": lat.round(6),
        "longitude": lon.round(6),
        "peak_utilization_target": peak_utilization.round(3),
        "mean_duration_min": mean_duration_min.round(1),
    })
    return zones_df


def sessions_needed(capacity, peak_utilization, mean_duration_min, num_days):
    """Little's Law: L = lambda * W  =>  lambda_peak = (u * C) / W.
    lambda_peak is sessions/hour during the single busiest hour of the day.
    Total daily sessions = lambda_peak / PEAK_WEIGHT (since PEAK_WEIGHT is
    the busiest hour's share of the day's total session volume)."""
    mean_duration_hr = mean_duration_min / 60.0
    lambda_peak = (peak_utilization * capacity) / mean_duration_hr
    daily_sessions = lambda_peak / PEAK_WEIGHT
    return np.maximum(1, np.round(daily_sessions * num_days)).astype(int)


def build_events(rng, zones_df, vehicle_ids, num_days, start_date, holidays, duration_sigma=0.5):
    zone_ids = zones_df["zone_id"].to_numpy()
    capacities = zones_df["capacity"].to_numpy()
    mean_durations = zones_df["mean_duration_min"].to_numpy()
    peak_utils = zones_df["peak_utilization_target"].to_numpy()

    total_sessions_per_zone = sessions_needed(capacities, peak_utils, mean_durations, num_days)
    grand_total = int(total_sessions_per_zone.sum())

    # Deterministically repeat each zone's id/capacity/mean-duration according
    # to its own calibrated session count.
    zone_id_arr = np.repeat(zone_ids, total_sessions_per_zone)
    capacity_arr = np.repeat(capacities, total_sessions_per_zone)
    zone_mean_dur_arr = np.repeat(mean_durations, total_sessions_per_zone)

    vehicle_choice = rng.choice(len(vehicle_ids), size=grand_total)
    vehicle_id_arr = vehicle_ids[vehicle_choice]

    day_offset = rng.integers(0, num_days, size=grand_total)
    dates = start_date.normalize() + pd.to_timedelta(day_offset, unit="D")

    hours = rng.choice(24, size=grand_total, p=HOUR_WEIGHTS)
    minutes = rng.integers(0, 60, size=grand_total)
    seconds = rng.integers(0, 60, size=grand_total)

    entry_ts = (
        dates
        + pd.to_timedelta(hours, unit="h")
        + pd.to_timedelta(minutes, unit="m")
        + pd.to_timedelta(seconds, unit="s")
    )

    # Per-session duration: lognormal centred on that ZONE's mean duration.
    mu = np.log(zone_mean_dur_arr) - 0.5 * duration_sigma ** 2
    duration = rng.lognormal(mean=mu, sigma=duration_sigma)
    duration = np.clip(duration, 5, 240).round().astype(int)
    exit_ts = entry_ts + pd.to_timedelta(duration, unit="m")

    entry_events = pd.DataFrame({
        "timestamp": entry_ts,
        "vehicle_id": vehicle_id_arr,
        "zone_id": zone_id_arr,
        "event_type": "ENTRY",
        "parking_duration": 0,
        "capacity": capacity_arr,
        "_sign": 1,
    })
    exit_events = pd.DataFrame({
        "timestamp": exit_ts,
        "vehicle_id": vehicle_id_arr,
        "zone_id": zone_id_arr,
        "event_type": "EXIT",
        "parking_duration": duration,
        "capacity": capacity_arr,
        "_sign": -1,
    })

    events = pd.concat([entry_events, exit_events], ignore_index=True)
    events = events.sort_values(["zone_id", "timestamp", "event_type"]).reset_index(drop=True)

    # Running occupancy per zone = cumulative sum of +1/-1, clipped to [0, capacity]
    events["occupancy"] = events.groupby("zone_id")["_sign"].cumsum()
    events["occupancy"] = events[["occupancy", "capacity"]].min(axis=1).clip(lower=0)

    # Simple seasonal weather model (warming trend, mostly dry with occasional showers)
    day_key = events["timestamp"].dt.date
    unique_days = pd.Series(sorted(day_key.unique()))
    day_index = (pd.to_datetime(unique_days) - start_date.normalize()).dt.days
    temp_by_day = 24 + 8 * (day_index / max(num_days, 1)) + rng.normal(0, 1.5, size=len(unique_days))
    rain_by_day = np.clip(rng.exponential(2.0, size=len(unique_days)) - 1.5, 0, None)

    weather_map_temp = dict(zip(unique_days, temp_by_day.round(2)))
    weather_map_rain = dict(zip(unique_days, rain_by_day.round(2)))

    events["temperature"] = day_key.map(weather_map_temp)
    events["rainfall"] = day_key.map(weather_map_rain)
    events["day_of_week"] = events["timestamp"].dt.dayofweek  # 0 = Monday
    events["is_holiday"] = day_key.isin(holidays).astype(int)

    zone_latlon = dict(zip(zone_ids, zip(zones_df["latitude"], zones_df["longitude"])))
    lat_series = events["zone_id"].map(lambda z: zone_latlon[z][0]).astype(float)
    lon_series = events["zone_id"].map(lambda z: zone_latlon[z][1]).astype(float)
    events["latitude"] = (lat_series + rng.uniform(-0.001, 0.001, size=len(events))).round(6)
    events["longitude"] = (lon_series + rng.uniform(-0.001, 0.001, size=len(events))).round(6)

    events["event_id"] = "E" + (events.index + 1).astype(str).str.zfill(8)

    final_cols = [
        "event_id", "timestamp", "vehicle_id", "zone_id", "event_type",
        "parking_duration", "occupancy", "capacity", "latitude", "longitude",
        "temperature", "rainfall", "day_of_week", "is_holiday",
    ]
    events = events[final_cols].sort_values("timestamp").reset_index(drop=True)
    return events, weather_map_temp, weather_map_rain


def build_ml_dataset(events, zones_df, weather_map_temp, weather_map_rain, holidays, start_date, end_date, freq_minutes=30):
    capacity_map = dict(zip(zones_df["zone_id"], zones_df["capacity"]))
    avg_duration_by_zone = (
        events[events.event_type == "EXIT"].groupby("zone_id")["parking_duration"].mean()
    )

    bins = pd.date_range(start_date, end_date, freq=f"{freq_minutes}min")
    rows = []
    for zone_id, grp in events.sort_values("timestamp").groupby("zone_id"):
        occ_series = grp.set_index("timestamp")["occupancy"]
        # Two events in the same zone can land on the same second (rare but
        # possible with random second-level timestamps) -> keep the later one.
        occ_series = occ_series[~occ_series.index.duplicated(keep="last")]
        combined_index = occ_series.index.union(bins)
        occ_at_bins = occ_series.reindex(combined_index).ffill().reindex(bins).fillna(0)
        rows.append(pd.DataFrame({
            "timestamp": bins,
            "zone_id": zone_id,
            "current_occupancy": occ_at_bins.values,
            "capacity": capacity_map[zone_id],
        }))

    ml_df = pd.concat(rows, ignore_index=True)
    ml_df["date"] = ml_df["timestamp"].dt.date
    ml_df["hour"] = ml_df["timestamp"].dt.hour
    ml_df["day_of_week"] = ml_df["timestamp"].dt.dayofweek
    ml_df["is_weekend"] = (ml_df["day_of_week"] >= 5).astype(int)
    ml_df["is_holiday"] = ml_df["date"].isin(holidays).astype(int)
    ml_df["temperature"] = ml_df["date"].map(weather_map_temp)
    ml_df["rainfall"] = ml_df["date"].map(weather_map_rain)
    ml_df["average_duration"] = ml_df["zone_id"].map(avg_duration_by_zone).round(1).fillna(30.0)

    # Target: occupancy `freq_minutes` later, in the SAME zone
    ml_df = ml_df.sort_values(["zone_id", "timestamp"]).reset_index(drop=True)
    ml_df["future_occupancy"] = ml_df.groupby("zone_id")["current_occupancy"].shift(-1)
    ml_df = ml_df.dropna(subset=["future_occupancy"]).reset_index(drop=True)

    final_cols = [
        "timestamp", "zone_id", "hour", "day_of_week", "is_weekend", "is_holiday",
        "temperature", "rainfall", "current_occupancy", "capacity",
        "average_duration", "future_occupancy",
    ]
    return ml_df[final_cols]


def build_dashboard_snapshots(ml_df):
    latest = ml_df.sort_values("timestamp").groupby("zone_id").tail(1).copy()
    latest["utilization"] = (latest["current_occupancy"] / latest["capacity"] * 100).round(1)
    dashboard_data = latest.rename(columns={"current_occupancy": "occupancy"})[
        ["zone_id", "occupancy", "capacity", "utilization"]
    ]

    trend_cutoff = ml_df["timestamp"].max() - pd.Timedelta(days=7)
    trend = ml_df[ml_df["timestamp"] >= trend_cutoff][["timestamp", "zone_id", "current_occupancy"]]
    trend = trend.rename(columns={"current_occupancy": "occupancy"})
    return dashboard_data, trend


def main():
    parser = argparse.ArgumentParser(description="Generate the Smart Parking synthetic dataset")
    parser.add_argument("--zones", type=int, default=20)
    parser.add_argument("--vehicles", type=int, default=6000)
    parser.add_argument("--days", type=int, default=21, help="Number of days of history to simulate")
    parser.add_argument("--start", type=str, default="2026-01-01")
    parser.add_argument("--cap-min", type=int, default=30)
    parser.add_argument("--cap-max", type=int, default=150)
    parser.add_argument("--util-min", type=float, default=0.5, help="Min per-zone peak utilization target")
    parser.add_argument("--util-max", type=float, default=0.85, help="Max per-zone peak utilization target")
    parser.add_argument("--dur-min", type=float, default=45.0, help="Min per-zone mean stay (minutes)")
    parser.add_argument("--dur-max", type=float, default=150.0, help="Max per-zone mean stay (minutes)")
    parser.add_argument("--seed", type=int, default=42)
    args = parser.parse_args()

    for d in (RAW_DIR, SAMPLE_DIR, PROCESSED_DIR):
        d.mkdir(parents=True, exist_ok=True)

    rng = np.random.default_rng(args.seed)
    start_date = pd.Timestamp(args.start)
    end_date = start_date + pd.Timedelta(days=args.days) - pd.Timedelta(seconds=1)
    holidays = pd.to_datetime([
        "2026-01-01", "2026-01-26", "2026-02-15", "2026-03-06", "2026-03-25",
    ]).date

    print(f"Generating {args.zones} zones, {args.vehicles} vehicles, {args.days} days ...")
    zones_df = build_zones(
        rng, args.zones, args.cap_min, args.cap_max,
        args.util_min, args.util_max, args.dur_min, args.dur_max,
    )
    vehicle_ids = np.array([f"V{str(i + 1).zfill(5)}" for i in range(args.vehicles)])

    events, w_temp, w_rain = build_events(rng, zones_df, vehicle_ids, args.days, start_date, holidays)
    print(f"  -> {len(events):,} raw ENTRY/EXIT events")

    util = events["occupancy"] / events["capacity"] * 100
    print(f"  -> occupancy/capacity ratio: mean={util.mean():.1f}%  p90={util.quantile(0.9):.1f}%  max={util.max():.1f}%")

    zones_df.to_csv(RAW_DIR / "zones.csv", index=False)
    events.to_csv(RAW_DIR / "parking_events.csv", index=False)
    events.head(2000).to_csv(SAMPLE_DIR / "parking_events_sample.csv", index=False)

    print("Building 30-minute bucketed ML dataset ...")
    ml_df = build_ml_dataset(events, zones_df, w_temp, w_rain, holidays, start_date, end_date)
    ml_df.to_csv(PROCESSED_DIR / "ml_dataset.csv", index=False)
    print(f"  -> {len(ml_df):,} rows in data/processed/ml_dataset.csv")

    dashboard_data, trend = build_dashboard_snapshots(ml_df)
    dashboard_data.to_csv(PROCESSED_DIR / "dashboard_data.csv", index=False)
    trend.to_csv(PROCESSED_DIR / "occupancy_trend.csv", index=False)

    print("Done. Files written:")
    for p in [
        RAW_DIR / "zones.csv", RAW_DIR / "parking_events.csv",
        SAMPLE_DIR / "parking_events_sample.csv",
        PROCESSED_DIR / "ml_dataset.csv", PROCESSED_DIR / "dashboard_data.csv",
        PROCESSED_DIR / "occupancy_trend.csv",
    ]:
        size_mb = p.stat().st_size / (1024 * 1024)
        print(f"  {p.relative_to(BASE_DIR)}  ({size_mb:.2f} MB)")


if __name__ == "__main__":
    main()
