# train_model.R
# Trains a Random Forest to predict a parking zone's occupancy 30 minutes
# ahead. R equivalent of ml/train_model.py, using the SAME feature set and
# ml_dataset.csv so the two languages' results are directly comparable.
#
# Run (from the project root):
#   Rscript r-analytics/train_model.R
#
# Requires: dplyr, randomForest (see r-analytics/install_packages.R)

suppressMessages({
  library(dplyr)
  library(randomForest)
})

ML_DATASET <- "data/processed/ml_dataset.csv"
MODEL_PATH <- "r-analytics/model.rds"
FEATURE_IMPORTANCE_PATH <- "r-analytics/feature_importance_r.csv"
PREDICTIONS_PATH <- "data/processed/predictions_r.csv"

FEATURES <- c(
  "hour", "day_of_week", "is_weekend", "is_holiday",
  "temperature", "rainfall", "current_occupancy", "capacity", "average_duration"
)
TARGET <- "future_occupancy"

risk_level <- function(predicted, capacity) {
  pct <- ifelse(capacity > 0, predicted / capacity * 100, 0)
  ifelse(pct >= 90, "HIGH", ifelse(pct >= 70, "MEDIUM", "LOW"))
}

main <- function() {
  if (!file.exists(ML_DATASET)) {
    stop(sprintf(
      "%s not found. Run `python scripts/generate_dataset.py` first (from the project root).",
      ML_DATASET
    ))
  }

  df <- read.csv(ML_DATASET, stringsAsFactors = FALSE)
  df$timestamp <- as.POSIXct(df$timestamp, format = "%Y-%m-%d %H:%M:%S", tz = "UTC")
  cat(sprintf("Loaded %d rows from %s\n", nrow(df), ML_DATASET))

  set.seed(42)
  n <- nrow(df)
  train_idx <- sample(seq_len(n), size = floor(0.8 * n))

  train_df <- df[train_idx, c(FEATURES, TARGET)]
  test_df  <- df[-train_idx, c(FEATURES, TARGET)]

  model_formula <- as.formula(paste(TARGET, "~", paste(FEATURES, collapse = " + ")))

  model <- randomForest(
    model_formula,
    data = train_df,
    ntree = 200,
    mtry = max(1, floor(length(FEATURES) / 3)),
    importance = TRUE
  )

  predictions <- predict(model, newdata = test_df)

  mae  <- mean(abs(predictions - test_df[[TARGET]]))
  rmse <- sqrt(mean((predictions - test_df[[TARGET]])^2))
  ss_res <- sum((test_df[[TARGET]] - predictions)^2)
  ss_tot <- sum((test_df[[TARGET]] - mean(test_df[[TARGET]]))^2)
  r2 <- 1 - ss_res / ss_tot

  cat("\nModel Performance (held-out test set)\n")
  cat("--------------------------------------\n")
  cat(sprintf("MAE  : %.3f vehicles\n", mae))
  cat(sprintf("RMSE : %.3f vehicles\n", rmse))
  cat(sprintf("R2   : %.4f\n", r2))

  saveRDS(model, MODEL_PATH)
  cat(sprintf("\nModel saved to %s\n", MODEL_PATH))

  imp <- importance(model)
  imp_df <- data.frame(feature = rownames(imp), importance = imp[, "IncNodePurity"])
  imp_df <- imp_df[order(-imp_df$importance), ]
  write.csv(imp_df, FEATURE_IMPORTANCE_PATH, row.names = FALSE)
  cat(sprintf("Feature importance saved to %s\n", FEATURE_IMPORTANCE_PATH))
  print(imp_df)

  # ---- Build predictions_r.csv for the Shiny dashboard (last 7 days) ----
  cutoff <- max(df$timestamp) - as.difftime(7, units = "days")
  recent <- df %>% filter(timestamp >= cutoff)
  recent$predicted_occupancy <- round(predict(model, newdata = recent[, FEATURES]), 1)
  recent$risk_level <- risk_level(recent$predicted_occupancy, recent$capacity)

  out <- recent %>%
    select(timestamp, zone_id, current_occupancy, predicted_occupancy, capacity, risk_level)
  write.csv(out, PREDICTIONS_PATH, row.names = FALSE)
  cat(sprintf("\nDemo predictions written to %s (%d rows)\n", PREDICTIONS_PATH, nrow(out)))
}

main()
