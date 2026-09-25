"""
schemas.py
----------
Shared PySpark schema definitions used by the streaming job and the batch
analytics scripts, so the two stay in sync with the Kafka producer's JSON
payload and the raw CSV dataset.
"""

from pyspark.sql.types import (
    DoubleType,
    IntegerType,
    StringType,
    StructField,
    StructType,
)

PARKING_EVENT_SCHEMA = StructType([
    StructField("event_id", StringType()),
    StructField("timestamp", StringType()),
    StructField("vehicle_id", StringType()),
    StructField("zone_id", StringType()),
    StructField("event_type", StringType()),
    StructField("parking_duration", IntegerType()),
    StructField("occupancy", IntegerType()),
    StructField("capacity", IntegerType()),
    StructField("latitude", DoubleType()),
    StructField("longitude", DoubleType()),
    StructField("temperature", DoubleType()),
    StructField("rainfall", DoubleType()),
])
