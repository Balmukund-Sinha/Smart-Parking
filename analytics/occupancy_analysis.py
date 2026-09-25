"""
occupancy_analysis.py
----------------------
Batch PySpark job: cleans the raw historical event log and computes
per-zone occupancy statistics and utilization.

Run:
    spark-submit analytics/occupancy_analysis.py
"""

from pathlib import Path

from pyspark.sql import SparkSession
from pyspark.sql.functions import avg, col, count, max as spark_max, min as spark_min

BASE_DIR = Path(__file__).resolve().parent.parent
RAW_CSV = str(BASE_DIR / "data" / "raw" / "parking_events.csv")
OUTPUT_PARQUET = str(BASE_DIR / "data" / "processed" / "cleaned_events")


def build_spark_session() -> SparkSession:
    return SparkSession.builder.appName("ParkingOccupancyAnalysis").getOrCreate()


def load_and_clean(spark: SparkSession):
    df = (
        spark.read
        .option("header", True)
        .option("inferSchema", True)
        .csv(RAW_CSV)
    )

    before = df.count()

    df = df.dropDuplicates(["event_id"])
    df = df.filter((col("occupancy") >= 0) & (col("capacity") > 0))
    df = df.filter(col("parking_duration") >= 0)

    after = df.count()
    print(f"Cleaning: {before:,} rows -> {after:,} rows ({before - after:,} removed)")
    return df


def zone_occupancy_summary(df):
    return (
        df.groupBy("zone_id")
        .agg(
            avg("occupancy").alias("average_occupancy"),
            spark_max("occupancy").alias("maximum_occupancy"),
            spark_min("occupancy").alias("minimum_occupancy"),
            count("*").alias("total_events"),
        )
        .orderBy(col("average_occupancy").desc())
    )


def main():
    spark = build_spark_session()
    spark.sparkContext.setLogLevel("WARN")

    df = load_and_clean(spark)
    df.write.mode("overwrite").parquet(OUTPUT_PARQUET)
    print(f"Cleaned data written to {OUTPUT_PARQUET}")

    summary = zone_occupancy_summary(df)
    summary.show(truncate=False)


if __name__ == "__main__":
    main()
