#!/usr/bin/env bash
# Creates the `parking-events` Kafka topic.
# Requires the Kafka container from docker-compose.yml to be running:
#   docker compose up -d
set -euo pipefail

TOPIC="parking-events"
BROKER="localhost:9092"
PARTITIONS="${1:-3}"
REPLICATION="${2:-1}"

echo "Creating topic '${TOPIC}' (partitions=${PARTITIONS}, replication=${REPLICATION}) ..."

docker exec kafka /opt/kafka/bin/kafka-topics.sh \
  --create \
  --if-not-exists \
  --topic "${TOPIC}" \
  --bootstrap-server "${BROKER}" \
  --partitions "${PARTITIONS}" \
  --replication-factor "${REPLICATION}"

echo "Listing topics:"
docker exec kafka /opt/kafka/bin/kafka-topics.sh --list --bootstrap-server "${BROKER}"
