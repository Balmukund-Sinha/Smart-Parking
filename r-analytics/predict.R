# predict.R
# Loads the trained R model and predicts occupancy 30 minutes ahead for a
# single zone snapshot. R equivalent of ml/predict.py.
#
# Run (from the project root):
#   Rscript r-analytics/predict.R

suppressMessages(library(randomForest))

MODEL_PATH <- "r-analytics/model.rds"
FEATURES <- c(
  "hour", "day_of_week", "is_weekend", "is_holiday",
  "temperature", "rainfall", "current_occupancy", "capacity", "average_duration"
)

risk_level <- function(predicted, capacity) {
  pct <- predicted / capacity * 100
  if (pct >= 90) "HIGH" else if (pct >= 70) "MEDIUM" else "LOW"
}

if (!file.exists(MODEL_PATH)) {
  stop("r-analytics/model.rds not found. Run r-analytics/train_model.R first.")
}

model <- readRDS(MODEL_PATH)

# Kept in-distribution with the demo dataset's zones (capacity 30-150) --
# see the note in ml/predict.py about not extrapolating outside training ranges.
example <- data.frame(
  hour = 18, day_of_week = 4, is_weekend = 0, is_holiday = 0,
  temperature = 29.0, rainfall = 0.0, current_occupancy = 34,
  capacity = 40, average_duration = 65.0
)

predicted <- as.numeric(predict(model, newdata = example))
current_pct <- example$current_occupancy / example$capacity * 100

cat("Input snapshot:\n")
print(example)
cat(sprintf("\nCurrent occupancy  : %.1f%%\n", current_pct))
cat(sprintf(
  "Predicted (30 min) : %.2f vehicles (%.1f%%)\n",
  predicted, predicted / example$capacity * 100
))
cat(sprintf("Risk level         : %s\n", risk_level(predicted, example$capacity)))
