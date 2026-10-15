"""Train every demand model exposed by the SmartPark prediction studio.

Run::

    python ml/train_model.py

The script trains all models on the same feature contract and held-out split so
their dashboard metrics are directly comparable.
"""

from __future__ import annotations

import json
from pathlib import Path

import joblib
import numpy as np
import pandas as pd
from sklearn.ensemble import RandomForestRegressor
from sklearn.linear_model import LinearRegression
from sklearn.metrics import mean_absolute_error, mean_squared_error, r2_score
from sklearn.model_selection import train_test_split

try:
    from xgboost import XGBRegressor
except ImportError as exc:  # pragma: no cover - exercised by first-time setup
    raise SystemExit(
        "XGBoost is required. Install requirements-pipeline.txt before training."
    ) from exc


BASE_DIR = Path(__file__).resolve().parent.parent
ML_DIR = Path(__file__).resolve().parent
ML_DATASET = BASE_DIR / "data" / "processed" / "ml_dataset.csv"
RF_MODEL_PATH = ML_DIR / "model.pkl"
XGB_MODEL_PATH = ML_DIR / "xgboost_model.json"
LINEAR_MODEL_PATH = ML_DIR / "linear_model.json"
FEATURE_IMPORTANCE_PATH = ML_DIR / "feature_importance.csv"
MODEL_IMPORTANCE_PATH = ML_DIR / "model_feature_importance.csv"
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


def risk_level(predicted: float, capacity: float) -> str:
    pct = (predicted / capacity) * 100 if capacity else 0
    if pct >= 85:
        return "HIGH"
    if pct >= 60:
        return "MEDIUM"
    return "LOW"


def normalized_importance(values: np.ndarray) -> np.ndarray:
    values = np.abs(np.asarray(values, dtype=float))
    total = float(values.sum())
    return values / total if total else np.zeros_like(values)


def metrics(actual: pd.Series, predicted: np.ndarray) -> dict[str, float]:
    return {
        "mae": float(mean_absolute_error(actual, predicted)),
        "rmse": float(mean_squared_error(actual, predicted) ** 0.5),
        "r2": float(r2_score(actual, predicted)),
    }


def main() -> None:
    if not ML_DATASET.exists():
        raise SystemExit(
            f"{ML_DATASET} not found. Run scripts/generate_dataset.py first."
        )

    frame = pd.read_csv(ML_DATASET, parse_dates=["timestamp"])
    print(f"Loaded {len(frame):,} rows from {ML_DATASET.relative_to(BASE_DIR)}")
    X = frame[FEATURES].astype(float)
    y = frame[TARGET].astype(float)
    X_train, X_test, y_train, y_test, _, idx_test = train_test_split(
        X, y, frame.index, test_size=0.2, random_state=42
    )

    models = {
        "random_forest": RandomForestRegressor(
            n_estimators=200,
            max_depth=None,
            min_samples_leaf=2,
            random_state=42,
            n_jobs=-1,
        ),
        "xgboost": XGBRegressor(
            n_estimators=350,
            max_depth=7,
            learning_rate=0.05,
            subsample=0.9,
            colsample_bytree=0.9,
            reg_lambda=1.0,
            objective="reg:squarederror",
            tree_method="hist",
            random_state=42,
            n_jobs=-1,
        ),
        "linear": LinearRegression(),
    }
    labels = {
        "random_forest": "Random Forest v3.2",
        "xgboost": "XGBoost v1.8",
        "linear": "Linear Baseline",
    }

    validation_predictions: dict[str, np.ndarray] = {}
    importance_rows: list[dict] = []
    for key, model in models.items():
        print(f"\nTraining {labels[key]}...")
        model.fit(X_train, y_train)
        predicted = np.asarray(model.predict(X_test), dtype=float)
        validation_predictions[key] = predicted
        score = metrics(y_test, predicted)
        print(
            f"MAE={score['mae']:.3f}  RMSE={score['rmse']:.3f}  "
            f"R2={score['r2']:.4f}"
        )

        if key == "random_forest":
            joblib.dump(model, RF_MODEL_PATH)
            raw_importance = model.feature_importances_
        elif key == "xgboost":
            model.save_model(XGB_MODEL_PATH)
            raw_importance = model.feature_importances_
        else:
            coefficient_payload = {
                "model": "LinearRegression",
                "version": "LINEAR-30M-v1.0",
                "features": FEATURES,
                "intercept": float(model.intercept_),
                "coefficients": {
                    feature: float(coefficient)
                    for feature, coefficient in zip(FEATURES, model.coef_)
                },
            }
            LINEAR_MODEL_PATH.write_text(
                json.dumps(coefficient_payload, indent=2), encoding="utf-8"
            )
            # Scale coefficients by observed feature spread before normalizing,
            # otherwise units such as rainfall and capacity are incomparable.
            raw_importance = model.coef_ * X_train.std(ddof=0).to_numpy()

        for feature, importance in zip(FEATURES, normalized_importance(raw_importance)):
            importance_rows.append(
                {"model": key, "feature": feature, "importance": float(importance)}
            )

    importance = pd.DataFrame(importance_rows)
    importance.to_csv(MODEL_IMPORTANCE_PATH, index=False)
    importance[importance["model"] == "random_forest"][["feature", "importance"]].sort_values(
        "importance", ascending=False
    ).to_csv(FEATURE_IMPORTANCE_PATH, index=False)

    cutoff = frame["timestamp"].max() - pd.Timedelta(days=7)
    recent = frame[frame["timestamp"] >= cutoff].copy()
    recent_features = recent[FEATURES].astype(float)
    prediction_columns = {
        "random_forest": "random_forest_prediction",
        "xgboost": "xgboost_prediction",
        "linear": "linear_prediction",
    }
    for key, model in models.items():
        recent[prediction_columns[key]] = np.clip(
            model.predict(recent_features), 0, recent["capacity"]
        ).round(1)

    recent["predicted_occupancy"] = recent["random_forest_prediction"]
    recent["actual_occupancy"] = recent[TARGET]
    recent["is_validation"] = recent.index.isin(idx_test).astype(int)
    recent["risk_level"] = [
        risk_level(predicted, capacity)
        for predicted, capacity in zip(
            recent["random_forest_prediction"], recent["capacity"]
        )
    ]
    output_columns = [
        "timestamp",
        "zone_id",
        "current_occupancy",
        "actual_occupancy",
        "predicted_occupancy",
        "random_forest_prediction",
        "xgboost_prediction",
        "linear_prediction",
        "capacity",
        "risk_level",
        "is_validation",
    ]
    recent[output_columns].to_csv(PREDICTIONS_PATH, index=False)

    print("\nArtifacts")
    for path in (
        RF_MODEL_PATH,
        XGB_MODEL_PATH,
        LINEAR_MODEL_PATH,
        MODEL_IMPORTANCE_PATH,
        PREDICTIONS_PATH,
    ):
        print(f"- {path.relative_to(BASE_DIR)}")


if __name__ == "__main__":
    main()
