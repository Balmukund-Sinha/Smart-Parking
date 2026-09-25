"""
spark_streaming.py
-------------------
The core streaming job: reads parking events from Kafka, validates and
deduplicates them (using the Bloom Filter for a cheap first-pass duplicate
check), computes rolling per-zone occupancy metrics, and writes:
  - the raw, cleaned events to Parquet ("bronze" layer) for historical/batch use
  - the windowed zone aggregates to Parquet ("silver" layer) + console
  - (optionally) the same aggregates upserted into PostgreSQL for the dashboard

Requires a running Kafka broker + topic (see ../kafka/) and PySpark with the
spark-sql-kafka connector (see the spark-submit command below).

Run:
    spark-submit \\
      --packages org.apache.spark:spark-sql-kafka-0-10_2.13:4.2.0 \\
      streaming/spark_streaming.py
"""

import argparse
import os
import sys
from pathlib import Path

from pyspark.sql import SparkSession
from pyspark.sql.functions import (
    avg,
    col,
    count,
    from_json,
    max as spark_max,
    to_timestamp,
    udf,
    window,
)
from pyspark.sql.types import BooleanType

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from streaming.bloom_filter import BloomFilter  # noqa: E402
from streaming.schemas import PARKING_EVENT_SCHEMA  # noqa: E402

KAFKA_BOOTSTRAP_SERVERS = os.environ.get("KAFKA_BOOTSTRAP_SERVERS", "localhost:9092")
KAFKA_TOPIC = os.environ.get("KAFKA_TOPIC", "parking-events")
KAFKA_STARTING_OFFSETS = os.environ.get("KAFKA_STARTING_OFFSETS", "latest")

BASE_DIR = Path(__file__).resolve().parent.parent
OUTPUT_ROOT = Path(os.environ.get("PARKING_STREAM_OUTPUT_ROOT", BASE_DIR / "data" / "processed"))
BRONZE_PATH = str(OUTPUT_ROOT / "bronze_events")
SILVER_PATH = str(OUTPUT_ROOT / "silver_zone_metrics")
CHECKPOINT_ROOT = str(Path(os.environ.get("PARKING_CHECKPOINT_ROOT", BASE_DIR / "checkpoints")))

# One Bloom Filter instance per executor-local batch pass. For a real
# multi-node cluster you would back this with a shared store (e.g. Redis)
# so all executors see the same "seen" state; for a single-node demo this
# in-process filter is enough to prove the concept.
_bloom = BloomFilter(size=2_000_000, hash_count=6)


def _is_new_event(event_id: str) -> bool:
    return _bloom.add_if_new(event_id)


is_new_event_udf = udf(_is_new_event, BooleanType())


def build_spark_session() -> SparkSession:
    builder = (
        SparkSession.builder
        .appName("SmartParkingStreaming")
        .config("spark.sql.shuffle.partitions", "4")
        .config(
            "spark.sql.streaming.stateStore.providerClass",
            "org.apache.spark.sql.execution.streaming.state.RocksDBStateStoreProvider",
        )
        # Spark 4.2 can commit an empty initial batch without materializing a
        # state-store version, then fail when the first event arrives. Skip
        # empty eager-state batches; real data batches still advance state.
        .config("spark.sql.streaming.noDataMicroBatches.enabled", "false")
    )
    if os.name == "nt":
        # Jetty's Spark UI can hold packaged JAR files open on Windows. The UI
        # is not needed for this local demo and disabling it avoids that lock.
        builder = builder.config("spark.ui.enabled", "false")
    return builder.getOrCreate()


def read_kafka_stream(spark: SparkSession):
    return (
        spark.readStream
        .format("kafka")
        .option("kafka.bootstrap.servers", KAFKA_BOOTSTRAP_SERVERS)
        .option("subscribe", KAFKA_TOPIC)
        .option("startingOffsets", KAFKA_STARTING_OFFSETS)
        .option("failOnDataLoss", "false")
        .load()
    )


def parse_events(raw_stream):
    events = (
        raw_stream
        .select(from_json(col("value").cast("string"), PARKING_EVENT_SCHEMA).alias("data"))
        .select("data.*")
        .withColumn("timestamp", to_timestamp("timestamp"))
    )
    return events


def clean_and_deduplicate(events):
    """Drop structurally invalid rows, then filter out events the Bloom
    Filter has already seen (cheap first pass -- see bloom_filter.py for
    why false positives are an acceptable trade-off here)."""
    valid = events.filter(
        col("event_id").isNotNull()
        & col("timestamp").isNotNull()
        & (col("occupancy") >= 0)
        & (col("capacity") > 0)
    )
    deduped = valid.withColumn("is_new", is_new_event_udf(col("event_id"))).filter(col("is_new"))
    return deduped.drop("is_new")


def zone_window_aggregates(events):
    return (
        events
        .withWatermark("timestamp", "5 minutes")
        .groupBy(window("timestamp", "5 minutes"), "zone_id")
        .agg(
            avg("occupancy").alias("avg_occupancy"),
            spark_max("occupancy").alias("max_occupancy"),
            avg("capacity").alias("avg_capacity"),
            count("*").alias("event_count"),
        )
        .withColumn("utilization_pct", (col("avg_occupancy") / col("avg_capacity") * 100))
    )


def write_zone_metrics_batch(batch_df, batch_id: int) -> None:
    """Fully consume each stateful update, then publish it to both outputs.

    Parquet's streaming sink only supports append mode. A watermarked window
    in append mode may emit no rows for several batches, which can leave a
    local state-store version incomplete. foreachBatch lets the aggregation
    run in update mode and uses a normal append write for each completed
    micro-batch result.
    """
    cached = batch_df.persist()
    try:
        row_count = cached.count()
        print(f"METRICS_BATCH id={batch_id} rows={row_count}", flush=True)
        if row_count:
            cached.show(truncate=False)
            cached.write.mode("append").parquet(SILVER_PATH)
    finally:
        cached.unpersist()


def parse_args():
    parser = argparse.ArgumentParser(description="Run the parking Structured Streaming job")
    parser.add_argument(
        "--run-seconds",
        type=float,
        default=float(os.environ.get("PARKING_RUN_SECONDS", "0")),
        help="Stop cleanly after this many seconds (0 runs until Ctrl+C)",
    )
    return parser.parse_args()


def main():
    args = parse_args()
    if args.run_seconds < 0:
        raise SystemExit("--run-seconds must be zero or greater")

    spark = build_spark_session()
    spark.sparkContext.setLogLevel("WARN")

    raw_stream = read_kafka_stream(spark)
    events = parse_events(raw_stream)
    clean_events = clean_and_deduplicate(events)

    # Bronze: append every cleaned, deduplicated event to Parquet for
    # historical/batch analytics (see analytics/*.py) and Hive/HDFS backup.
    bronze_query = (
        clean_events.writeStream
        .format("parquet")
        .option("path", BRONZE_PATH)
        .option("checkpointLocation", f"{CHECKPOINT_ROOT}/bronze")
        .outputMode("append")
        .trigger(processingTime="5 seconds")
        .start()
    )

    # Silver: 5-minute windowed zone metrics, shown live in the console and
    # persisted to Parquet from the same fully-consumed micro-batch.
    zone_metrics = zone_window_aggregates(clean_events)

    silver_query = (
        zone_metrics.writeStream
        .outputMode("update")
        .foreachBatch(write_zone_metrics_batch)
        .option("checkpointLocation", f"{CHECKPOINT_ROOT}/silver")
        .trigger(processingTime="5 seconds")
        .start()
    )

    print(
        f"STREAM_READY topic={KAFKA_TOPIC} bronze={BRONZE_PATH} silver={SILVER_PATH}",
        flush=True,
    )
    try:
        if args.run_seconds:
            spark.streams.awaitAnyTermination(args.run_seconds)
        else:
            spark.streams.awaitAnyTermination()
    finally:
        for query in spark.streams.active:
            query.stop()
        spark.stop()
    print("STREAM_STOPPED_OK", flush=True)


if __name__ == "__main__":
    main()
