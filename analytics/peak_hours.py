"""
peak_hours.py
-------------
Batch PySpark job: finds the busiest hours of the day across all zones,
and per zone.

Run:
    spark-submit analytics/peak_hours.py
"""

from pathlib import Path

from pyspark.sql import SparkSession
from pyspark.sql.functions import avg, col, hour, to_timestamp

BASE_DIR = Path(__file__).resolve().parent.parent
RAW_CSV = str(BASE_DIR / "data" / "raw" / "parking_events.csv")


def main():
    spark = SparkSession.builder.appName("ParkingPeakHours").getOrCreate()
    spark.sparkContext.setLogLevel("WARN")

    df = (
        spark.read
        .option("header", True)
        .option("inferSchema", True)
        .csv(RAW_CSV)
        .withColumn("timestamp", to_timestamp("timestamp"))
        .withColumn("hour", hour("timestamp"))
    )

    print("Overall peak hours (average occupancy across all zones):")
    overall = (
        df.groupBy("hour")
        .agg(avg("occupancy").alias("avg_occupancy"))
        .orderBy(col("avg_occupancy").desc())
    )
    overall.show(24, truncate=False)

    print("Peak hour per zone:")
    per_zone = (
        df.groupBy("zone_id", "hour")
        .agg(avg("occupancy").alias("avg_occupancy"))
    )
    # Rank hours within each zone and keep the top one
    from pyspark.sql.window import Window
    from pyspark.sql.functions import row_number

    w = Window.partitionBy("zone_id").orderBy(col("avg_occupancy").desc())
    top_hour_per_zone = (
        per_zone.withColumn("rank", row_number().over(w))
        .filter(col("rank") == 1)
        .drop("rank")
        .orderBy("zone_id")
    )
    top_hour_per_zone.show(50, truncate=False)


if __name__ == "__main__":
    main()
