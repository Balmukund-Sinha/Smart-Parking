"""
predict.py
----------
Loads the trained model and predicts occupancy 30 minutes ahead for a
single zone snapshot. Useful for a quick demo or for wiring into an API.

Run:
    python ml/predict.py
"""

from pathlib import Path

import joblib
import pandas as pd

MODEL_PATH = Path(__file__).resolve().parent / "model.pkl"

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


def risk_level(predicted, capacity):
    pct = (predicted / capacity) * 100 if capacity else 0
    if pct >= 90:
        return "HIGH"
    if pct >= 70:
        return "MEDIUM"
    return "LOW"


def predict_one(model, sample: dict) -> dict:
    row = pd.DataFrame([sample])[FEATURES]
    predicted = float(model.predict(row)[0])
    return {
        "predicted_occupancy": round(predicted, 2),
        "risk_level": risk_level(predicted, sample["capacity"]),
    }


if __name__ == "__main__":
    if not MODEL_PATH.exists():
        raise SystemExit("ml/model.pkl not found. Run ml/train_model.py first.")

    model = joblib.load(MODEL_PATH)

    # NOTE: keep inputs within the range of your training data (zone capacity,
    # occupancy, durations etc). A Random Forest cannot extrapolate sensibly
    # outside the ranges it was trained on -- if your real zones are bigger
    # than the ones in your training set, retrain on data that covers them.
    example = {
        "hour": 18,
        "day_of_week": 4,
        "is_weekend": 0,
        "is_holiday": 0,
        "temperature": 29.0,
        "rainfall": 0.0,
        "current_occupancy": 34,
        "capacity": 40,
        "average_duration": 65.0,
    }

    result = predict_one(model, example)
    current_pct = example["current_occupancy"] / example["capacity"] * 100

    print("Input snapshot:", example)
    print(f"\nCurrent occupancy      : {current_pct:.1f}%")
    print(f"Predicted (30 min)     : {result['predicted_occupancy']} vehicles "
          f"({result['predicted_occupancy'] / example['capacity'] * 100:.1f}%)")
    print(f"Risk level             : {result['risk_level']}")
