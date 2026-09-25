"""
train_model.py
---------------
Trains a Random Forest Regressor to predict a parking zone's occupancy
30 minutes into the future, using the bucketed features in
data/processed/ml_dataset.csv (produced by scripts/generate_dataset.py,
or by your real PySpark pipeline once Kafka/Spark are running).

Run:
    python ml/train_model.py

Outputs:
    ml/model.pkl                       -> trained model
    ml/feature_importance.csv          -> feature importances
    data/processed/predictions.csv     -> current vs predicted occupancy
                                           (last 7 days, for the dashboard)
"""

from pathlib import Path

import joblib
import numpy as np
import pandas as pd
from sklearn.ensemble import RandomForestRegressor
from sklearn.metrics import mean_absolute_error, mean_squared_error, r2_score
from sklearn.model_selection import train_test_split

BASE_DIR = Path(__file__).resolve().parent.parent
ML_DATASET = BASE_DIR / "data" / "processed" / "ml_dataset.csv"
MODEL_PATH = Path(__file__).resolve().parent / "model.pkl"
FEATURE_IMPORTANCE_PATH = Path(__file__).resolve().parent / "feature_importance.csv"
PREDICTIONS_PATH = BASE_DIR / "data" / "processed" / "predictions.csv"

FEATURES = [
    "hour",
    "day_of_week",
    "is_weekend",
    "is_holiday",
    "temperature",
    "rainfall",
    "current_occupancy",
    "capacity",
    "average_duration",
]
TARGET = "future_occupancy"


def risk_level(predicted, capacity):
    pct = (predicted / capacity) * 100 if capacity else 0
    if pct >= 85:
        return "HIGH"
    if pct >= 60:
        return "MEDIUM"
    return "LOW"


def main():
    if not ML_DATASET.exists():
        raise SystemExit(
            f"{ML_DATASET} not found. Run scripts/generate_dataset.py first "
            "(or point this script at your real PySpark output)."
        )

    df = pd.read_csv(ML_DATASET, parse_dates=["timestamp"])
    print(f"Loaded {len(df):,} rows from {ML_DATASET.relative_to(BASE_DIR)}")

    X = df[FEATURES]
    y = df[TARGET]

    X_train, X_test, y_train, y_test, idx_train, idx_test = train_test_split(
        X, y, df.index, test_size=0.2, random_state=42
    )

    model = RandomForestRegressor(
        n_estimators=200,
        max_depth=None,
        min_samples_leaf=2,
        random_state=42,
        n_jobs=-1,
    )
    model.fit(X_train, y_train)

    predictions = model.predict(X_test)

    mae = mean_absolute_error(y_test, predictions)
    rmse = mean_squared_error(y_test, predictions) ** 0.5
    r2 = r2_score(y_test, predictions)

    print("\nModel Performance (held-out test set)")
    print("--------------------------------------")
    print(f"MAE  : {mae:.3f} vehicles")
    print(f"RMSE : {rmse:.3f} vehicles")
    print(f"R2   : {r2:.4f}")

    joblib.dump(model, MODEL_PATH)
    print(f"\nModel saved to {MODEL_PATH.relative_to(BASE_DIR)}")

    importance = pd.DataFrame({
        "feature": FEATURES,
        "importance": model.feature_importances_,
    }).sort_values("importance", ascending=False)
    importance.to_csv(FEATURE_IMPORTANCE_PATH, index=False)
    print(f"Feature importance saved to {FEATURE_IMPORTANCE_PATH.relative_to(BASE_DIR)}")
    print(importance.to_string(index=False))

    # ---- Build predictions.csv for the dashboard (last 7 days) ----
    cutoff = df["timestamp"].max() - pd.Timedelta(days=7)
    recent = df[df["timestamp"] >= cutoff].copy()
    recent["predicted_occupancy"] = model.predict(recent[FEATURES]).round(1)
    recent["actual_occupancy"] = recent[TARGET]
    recent["is_validation"] = recent.index.isin(idx_test).astype(int)
    recent["risk_level"] = [
        risk_level(p, c) for p, c in zip(recent["predicted_occupancy"], recent["capacity"])
    ]

    out_cols = ["timestamp", "zone_id", "current_occupancy", "actual_occupancy", "predicted_occupancy", "capacity", "risk_level", "is_validation"]
    recent[out_cols].to_csv(PREDICTIONS_PATH, index=False)
    print(f"\nDemo predictions written to {PREDICTIONS_PATH.relative_to(BASE_DIR)} "
          f"({len(recent):,} rows)")


if __name__ == "__main__":
    main()
