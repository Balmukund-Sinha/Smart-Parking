# db_load.R
# Loads the operational summary CSVs into PostgreSQL. R equivalent of
# database/db.py -- same environment-variable convention, same tables.
#
# Configure via env vars:
#   PARKING_DB_HOST      (default: localhost)
#   PARKING_DB_PORT      (default: 5432)
#   PARKING_DB_NAME      (default: smart_parking)
#   PARKING_DB_USER      (default: postgres)
#   PARKING_DB_PASSWORD  (required)
#
# Run (from the project root):
#   export PARKING_DB_PASSWORD=postgres
#   Rscript r-analytics/db_load.R --load-all

suppressMessages({
  library(DBI)
  library(RPostgres)
})

env_or <- function(name, default) {
  val <- Sys.getenv(name)
  if (identical(val, "")) default else val
}

get_connection <- function() {
  password <- Sys.getenv("PARKING_DB_PASSWORD")
  if (identical(password, "")) {
    stop("PARKING_DB_PASSWORD is not set. Export it before running this script, e.g.\n  export PARKING_DB_PASSWORD=yourpassword")
  }

  dbConnect(
    RPostgres::Postgres(),
    host = env_or("PARKING_DB_HOST", "localhost"),
    port = as.integer(env_or("PARKING_DB_PORT", "5432")),
    dbname = env_or("PARKING_DB_NAME", "smart_parking"),
    user = env_or("PARKING_DB_USER", "postgres"),
    password = password
  )
}

load_zones <- function(con) {
  zones <- read.csv("data/raw/zones.csv", stringsAsFactors = FALSE)
  zones <- zones[, c("zone_id", "zone_name", "capacity", "latitude", "longitude")]
  dbWriteTable(con, "parking_zones", zones, append = TRUE, row.names = FALSE)
  cat(sprintf("Loaded %d zones into parking_zones\n", nrow(zones)))
}

load_occupancy_summary <- function(con) {
  trend <- read.csv("data/processed/occupancy_trend.csv", stringsAsFactors = FALSE)
  dashboard <- read.csv("data/processed/dashboard_data.csv", stringsAsFactors = FALSE)
  cap_map <- setNames(dashboard$capacity, dashboard$zone_id)

  trend$capacity <- cap_map[trend$zone_id]
  trend$utilization <- round(trend$occupancy / trend$capacity * 100, 1)
  trend$event_count <- 1L

  names(trend)[names(trend) == "occupancy"] <- "avg_occupancy"
  out <- trend[, c("timestamp", "zone_id", "avg_occupancy", "utilization", "event_count")]
  dbWriteTable(con, "occupancy_summary", out, append = TRUE, row.names = FALSE)
  cat(sprintf("Loaded %d rows into occupancy_summary\n", nrow(out)))
}

load_predictions <- function(con) {
  path <- if (file.exists("data/processed/predictions_r.csv")) {
    "data/processed/predictions_r.csv"
  } else {
    "data/processed/predictions.csv"
  }
  preds <- read.csv(path, stringsAsFactors = FALSE)
  out <- preds[, c("timestamp", "zone_id", "current_occupancy", "predicted_occupancy", "risk_level")]
  dbWriteTable(con, "predictions", out, append = TRUE, row.names = FALSE)
  cat(sprintf("Loaded %d rows into predictions (from %s)\n", nrow(out), path))
}

args <- commandArgs(trailingOnly = TRUE)

if (length(args) == 0) {
  cat("Usage: Rscript db_load.R [--load-all | --load-zones --load-occupancy --load-predictions]\n")
} else {
  con <- get_connection()
  tryCatch({
    if ("--load-all" %in% args || "--load-zones" %in% args) load_zones(con)
    if ("--load-all" %in% args || "--load-occupancy" %in% args) load_occupancy_summary(con)
    if ("--load-all" %in% args || "--load-predictions" %in% args) load_predictions(con)
  }, finally = {
    dbDisconnect(con)
  })
}
