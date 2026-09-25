# peak_hours.R
# Finds the busiest hours of the day, overall and per zone.
# R equivalent of analytics/peak_hours.py.
#
# Run (from the project root):
#   Rscript r-analytics/peak_hours.R

suppressMessages({
  library(dplyr)
  library(lubridate)
})

RAW_CSV <- "data/raw/parking_events.csv"

if (!file.exists(RAW_CSV)) {
  stop(sprintf("%s not found. Run `python scripts/generate_dataset.py` first.", RAW_CSV))
}

df <- read.csv(RAW_CSV, stringsAsFactors = FALSE)
df$timestamp <- as.POSIXct(df$timestamp, format = "%Y-%m-%d %H:%M:%S", tz = "UTC")
df$hour <- hour(df$timestamp)

cat("Overall peak hours (average occupancy across all zones):\n")
overall <- df %>%
  group_by(hour) %>%
  summarise(avg_occupancy = mean(occupancy), .groups = "drop") %>%
  arrange(desc(avg_occupancy))
print(overall, n = 24)

cat("\nPeak hour per zone:\n")
per_zone <- df %>%
  group_by(zone_id, hour) %>%
  summarise(avg_occupancy = mean(occupancy), .groups = "drop")

top_hour_per_zone <- per_zone %>%
  group_by(zone_id) %>%
  slice_max(avg_occupancy, n = 1, with_ties = FALSE) %>%
  arrange(zone_id)

print(top_hour_per_zone, n = 50)
