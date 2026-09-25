"""
eda.py
------
Exploratory Data Analysis over the raw parking events dataset using
PySpark SQL. Prints summary stats, schema, and a handful of sanity checks
useful for a project report.

Run:
    spark-submit analytics/eda.py
"""

from pathlib import Path

from pyspark.sql import SparkSession
from pyspark.sql.functions import col, countDistinct

BASE_DIR = Path(__file__).resolve().parent.parent
RAW_CSV = str(BASE_DIR / "data" / "raw" / "parking_events.csv")


def main():
    spark = SparkSession.builder.appName("ParkingEDA").getOrCreate()
    spark.sparkContext.setLogLevel("WARN")

    df = (
        spark.read
        .option("header", True)
        .option("inferSchema", True)
        .csv(RAW_CSV)
    )
    df.createOrReplaceTempView("parking_events")

    print("Schema:")
    df.printSchema()

    print(f"Total rows: {df.count():,}")

    print("Distinct counts:")
    df.select(
        countDistinct("zone_id").alias("zones"),
        countDistinct("vehicle_id").alias("vehicles"),
        countDistinct("event_id").alias("unique_events"),
    ).show()

    print("Event type breakdown:")
    df.groupBy("event_type").count().show()

    print("Numeric summary:")
    df.select("occupancy", "capacity", "parking_duration", "temperature", "rainfall").describe().show()

    print("Sample Spark SQL query -- top 5 busiest zones by average occupancy:")
    spark.sql("""
        SELECT zone_id, ROUND(AVG(occupancy), 2) AS avg_occupancy, COUNT(*) AS events
        FROM parking_events
        GROUP BY zone_id
        ORDER BY avg_occupancy DESC
        LIMIT 5
    """).show(truncate=False)

    print("Data quality checks:")
    invalid_occupancy = df.filter(col("occupancy") > col("capacity")).count()
    negative_duration = df.filter(col("parking_duration") < 0).count()
    print(f"  Rows with occupancy > capacity : {invalid_occupancy}")
    print(f"  Rows with negative duration    : {negative_duration}")


if __name__ == "__main__":
    main()
