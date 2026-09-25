-- Smart Urban Parking Intelligence -- PostgreSQL operational schema
--
-- This holds SUMMARY / OPERATIONAL data only (zone list, rolling occupancy
-- summaries, and predictions). The full historical event log stays in
-- Parquet/Delta on the data lake (see data/processed/) -- don't load
-- millions of raw events into Postgres.

DROP TABLE IF EXISTS predictions;
DROP TABLE IF EXISTS occupancy_summary;
DROP TABLE IF EXISTS parking_zones;

CREATE TABLE parking_zones (
    zone_id     VARCHAR(20) PRIMARY KEY,
    zone_name   VARCHAR(100),
    capacity    INTEGER NOT NULL CHECK (capacity > 0),
    latitude    DOUBLE PRECISION,
    longitude   DOUBLE PRECISION
);

CREATE TABLE occupancy_summary (
    id             SERIAL PRIMARY KEY,
    "timestamp"    TIMESTAMP NOT NULL,
    zone_id        VARCHAR(20) NOT NULL REFERENCES parking_zones(zone_id),
    avg_occupancy  DOUBLE PRECISION,
    utilization    DOUBLE PRECISION,
    event_count    INTEGER
);
CREATE INDEX idx_occupancy_summary_zone_time ON occupancy_summary (zone_id, "timestamp");

CREATE TABLE predictions (
    id                    SERIAL PRIMARY KEY,
    "timestamp"           TIMESTAMP NOT NULL,
    zone_id               VARCHAR(20) NOT NULL REFERENCES parking_zones(zone_id),
    current_occupancy     DOUBLE PRECISION,
    predicted_occupancy   DOUBLE PRECISION,
    risk_level            VARCHAR(20) CHECK (risk_level IN ('LOW', 'MEDIUM', 'HIGH')),
    UNIQUE (zone_id, "timestamp")
);
CREATE INDEX idx_predictions_zone_time ON predictions (zone_id, "timestamp");
