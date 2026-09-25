"""
zone_analysis.py
-----------------
Batch PySpark job: computes zone-wise parking utilization and average
parking duration, and ranks zones from most to least utilized.

Run:
    spark-submit analytics/zone_analysis.py
"""

from pathlib import Path

from pyspark.sql import SparkSession
from pyspark.sql.functions import avg, col

BASE_DIR = Path(__file__).resolve().parent.parent
RAW_CSV = str(BASE_DIR / "data" / "raw" / "parking_events.csv")
OUTPUT_CSV = str(BASE_DIR / "data" / "processed" / "zone_utilization")


def main():
    spark = SparkSession.builder.appName("ParkingZoneAnalysis").getOrCreate()
    spark.sparkContext.setLogLevel("WARN")

    df = (
        spark.read
        .option("header", True)
        .option("inferSchema", True)
        .csv(RAW_CSV)
    )

    utilization = df.withColumn("utilization", (col("occupancy") / col("capacity")) * 100)

    zone_utilization = (
        utilization.groupBy("zone_id")
        .agg(avg("utilization").alias("average_utilization"))
        .orderBy(col("average_utilization").desc())
    )

    print("Zone-wise average utilization:")
    zone_utilization.show(50, truncate=False)

    avg_duration = (
        df.filter(col("event_type") == "EXIT")
        .groupBy("zone_id")
        .agg(avg("parking_duration").alias("average_parking_duration_min"))
        .orderBy(col("average_parking_duration_min").desc())
    )

    print("Average parking duration per zone (minutes):")
    avg_duration.show(50, truncate=False)

    zone_utilization.coalesce(1).write.mode("overwrite").option("header", True).csv(OUTPUT_CSV)
    print(f"Zone utilization written to {OUTPUT_CSV}")


if __name__ == "__main__":
    main()
