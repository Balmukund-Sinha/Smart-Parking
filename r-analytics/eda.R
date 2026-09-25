# eda.R
# Exploratory Data Analysis over the raw parking events dataset, using
# dplyr + ggplot2. R equivalent of analytics/eda.py.
#
# Run (from the project root):
#   Rscript r-analytics/eda.R

suppressMessages({
  library(dplyr)
  library(ggplot2)
})

RAW_CSV <- "data/raw/parking_events.csv"

if (!file.exists(RAW_CSV)) {
  stop(sprintf("%s not found. Run `python scripts/generate_dataset.py` first (from the project root).", RAW_CSV))
}

df <- read.csv(RAW_CSV, stringsAsFactors = FALSE)
df$timestamp <- as.POSIXct(df$timestamp, format = "%Y-%m-%d %H:%M:%S", tz = "UTC")

cat("Structure:\n")
str(df)

cat(sprintf("\nTotal rows: %d\n", nrow(df)))

cat("\nDistinct counts:\n")
cat(sprintf("  zones   : %d\n", n_distinct(df$zone_id)))
cat(sprintf("  vehicles: %d\n", n_distinct(df$vehicle_id)))
cat(sprintf("  events  : %d\n", n_distinct(df$event_id)))

cat("\nEvent type breakdown:\n")
print(table(df$event_type))

cat("\nNumeric summary:\n")
print(summary(df[, c("occupancy", "capacity", "parking_duration", "temperature", "rainfall")]))

cat("\nTop 5 busiest zones by average occupancy:\n")
top5 <- df %>%
  group_by(zone_id) %>%
  summarise(avg_occupancy = round(mean(occupancy), 2), events = n(), .groups = "drop") %>%
  arrange(desc(avg_occupancy)) %>%
  head(5)
print(top5)

cat("\nData quality checks:\n")
cat(sprintf("  Rows with occupancy > capacity : %d\n", sum(df$occupancy > df$capacity)))
cat(sprintf("  Rows with negative duration    : %d\n", sum(df$parking_duration < 0)))

# ---- Save a plot for the report ----
dir.create("r-analytics/plots", showWarnings = FALSE, recursive = TRUE)

p1 <- ggplot(top5, aes(x = reorder(zone_id, avg_occupancy), y = avg_occupancy)) +
  geom_col(fill = "#2c7fb8") +
  coord_flip() +
  labs(title = "Top 5 Busiest Zones (avg occupancy)", x = "Zone", y = "Average Occupancy") +
  theme_minimal()

ggsave("r-analytics/plots/top5_zones.png", p1, width = 6, height = 4)
cat("\nSaved plot: r-analytics/plots/top5_zones.png\n")
