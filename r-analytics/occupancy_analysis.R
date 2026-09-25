# occupancy_analysis.R
# Cleans the raw historical event log and computes per-zone occupancy
# statistics. R equivalent of analytics/occupancy_analysis.py.
#
# Run (from the project root):
#   Rscript r-analytics/occupancy_analysis.R

suppressMessages(library(dplyr))

RAW_CSV <- "data/raw/parking_events.csv"
OUTPUT_CSV <- "r-analytics/output/zone_occupancy_summary.csv"

if (!file.exists(RAW_CSV)) {
  stop(sprintf("%s not found. Run `python scripts/generate_dataset.py` first.", RAW_CSV))
}

df <- read.csv(RAW_CSV, stringsAsFactors = FALSE)
before <- nrow(df)

df <- df %>% distinct(event_id, .keep_all = TRUE)
df <- df %>% filter(occupancy >= 0, capacity > 0, parking_duration >= 0)

after <- nrow(df)
cat(sprintf("Cleaning: %d rows -> %d rows (%d removed)\n", before, after, before - after))

summary_df <- df %>%
  group_by(zone_id) %>%
  summarise(
    average_occupancy = mean(occupancy),
    maximum_occupancy = max(occupancy),
    minimum_occupancy = min(occupancy),
    total_events = n(),
    .groups = "drop"
  ) %>%
  arrange(desc(average_occupancy))

print(summary_df, n = 50)

dir.create(dirname(OUTPUT_CSV), showWarnings = FALSE, recursive = TRUE)
write.csv(summary_df, OUTPUT_CSV, row.names = FALSE)
cat(sprintf("\nSaved to %s\n", OUTPUT_CSV))
