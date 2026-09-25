# zone_analysis.R
# Computes zone-wise parking utilization and average parking duration.
# R equivalent of analytics/zone_analysis.py.
#
# Run (from the project root):
#   Rscript r-analytics/zone_analysis.R

suppressMessages(library(dplyr))

RAW_CSV <- "data/raw/parking_events.csv"
OUTPUT_CSV <- "r-analytics/output/zone_utilization_r.csv"

if (!file.exists(RAW_CSV)) {
  stop(sprintf("%s not found. Run `python scripts/generate_dataset.py` first.", RAW_CSV))
}

df <- read.csv(RAW_CSV, stringsAsFactors = FALSE)
df$utilization <- df$occupancy / df$capacity * 100

zone_utilization <- df %>%
  group_by(zone_id) %>%
  summarise(average_utilization = mean(utilization), .groups = "drop") %>%
  arrange(desc(average_utilization))

cat("Zone-wise average utilization:\n")
print(zone_utilization, n = 50)

avg_duration <- df %>%
  filter(event_type == "EXIT") %>%
  group_by(zone_id) %>%
  summarise(average_parking_duration_min = mean(parking_duration), .groups = "drop") %>%
  arrange(desc(average_parking_duration_min))

cat("\nAverage parking duration per zone (minutes):\n")
print(avg_duration, n = 50)

dir.create(dirname(OUTPUT_CSV), showWarnings = FALSE, recursive = TRUE)
write.csv(zone_utilization, OUTPUT_CSV, row.names = FALSE)
cat(sprintf("\nSaved to %s\n", OUTPUT_CSV))
