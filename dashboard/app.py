"""
app.py
------
Streamlit dashboard for the Smart Urban Parking Intelligence project.

Reads from data/processed/*.csv, which are produced either by:
  - scripts/generate_dataset.py + ml/train_model.py (offline demo mode), or
  - the real Kafka -> PySpark -> PostgreSQL pipeline, once that's running
    (point the CSV paths below at exports from PostgreSQL, or swap the
    pd.read_csv calls for database/db.py queries).

Run:
    streamlit run dashboard/app.py
"""

from pathlib import Path

import pandas as pd
import plotly.express as px
import streamlit as st

BASE_DIR = Path(__file__).resolve().parent.parent
PROCESSED_DIR = BASE_DIR / "data" / "processed"
RAW_DIR = BASE_DIR / "data" / "raw"

st.set_page_config(page_title="Smart Parking BDA", page_icon="🚗", layout="wide")


@st.cache_data(ttl=60)
def load_data():
    dashboard_data = pd.read_csv(PROCESSED_DIR / "dashboard_data.csv")
    trend = pd.read_csv(PROCESSED_DIR / "occupancy_trend.csv", parse_dates=["timestamp"])
    predictions = pd.read_csv(PROCESSED_DIR / "predictions.csv", parse_dates=["timestamp"])
    zones = pd.read_csv(RAW_DIR / "zones.csv")
    return dashboard_data, trend, predictions, zones


def risk_badge(risk: str) -> str:
    return {"HIGH": "🔴", "MEDIUM": "🟡", "LOW": "🟢"}.get(risk, "⚪")


def main():
    st.title("🚗 Smart Urban Parking Intelligence")
    st.caption("Real-Time Big Data Analytics Dashboard")

    try:
        dashboard_data, trend, predictions, zones = load_data()
    except FileNotFoundError as e:
        st.error(
            f"Missing data file: {e.filename}\n\n"
            "Run `python scripts/generate_dataset.py` and `python ml/train_model.py` "
            "first (or point this dashboard at your live pipeline's output)."
        )
        st.stop()

    dashboard_data = dashboard_data.merge(zones[["zone_id", "zone_name"]], on="zone_id", how="left")

    tabs = st.tabs(["📊 Overview", "🟢 Live Monitoring", "📈 Historical Analytics", "🔮 Prediction", "🗺️ Map"])

    # ---------------- Overview ----------------
    with tabs[0]:
        total_capacity = dashboard_data["capacity"].sum()
        total_occupied = dashboard_data["occupancy"].sum()
        total_available = total_capacity - total_occupied
        utilization = (total_occupied / total_capacity * 100) if total_capacity else 0

        col1, col2, col3, col4 = st.columns(4)
        col1.metric("Total Capacity", int(total_capacity))
        col2.metric("Occupied", int(total_occupied))
        col3.metric("Available", int(total_available))
        col4.metric("Utilization", f"{utilization:.1f}%")

        st.subheader("📍 Zone-wise Occupancy")
        fig = px.bar(
            dashboard_data.sort_values("utilization", ascending=False),
            x="zone_id", y="occupancy", color="utilization",
            color_continuous_scale="RdYlGn_r",
            hover_data=["zone_name", "capacity"],
            title="Current Parking Occupancy by Zone",
        )
        st.plotly_chart(fig, use_container_width=True)

    # ---------------- Live Monitoring ----------------
    with tabs[1]:
        st.subheader("🟢 Live Zone Status")
        for _, row in dashboard_data.sort_values("utilization", ascending=False).iterrows():
            if row["utilization"] >= 90:
                icon = "🔴"
            elif row["utilization"] >= 70:
                icon = "🟡"
            else:
                icon = "🟢"
            c1, c2, c3 = st.columns([2, 5, 2])
            c1.write(f"**{row['zone_id']}**")
            c2.progress(min(row["utilization"] / 100, 1.0), text=f"{row['zone_name']}")
            c3.write(f"{icon} {row['utilization']:.0f}%")

    # ---------------- Historical Analytics ----------------
    with tabs[2]:
        st.subheader("📈 Occupancy Trend (last 7 days)")
        fig2 = px.line(
            trend, x="timestamp", y="occupancy", color="zone_id",
            title="Parking Occupancy Over Time",
        )
        st.plotly_chart(fig2, use_container_width=True)

        st.subheader("⏰ Peak Hours")
        trend_with_hour = trend.copy()
        trend_with_hour["hour"] = trend_with_hour["timestamp"].dt.hour
        peak = trend_with_hour.groupby("hour")["occupancy"].mean().reset_index()
        fig3 = px.bar(peak, x="hour", y="occupancy", title="Average Occupancy by Hour of Day")
        st.plotly_chart(fig3, use_container_width=True)

    # ---------------- Prediction ----------------
    with tabs[3]:
        st.subheader("🔮 Parking Demand Prediction (next 30 minutes)")
        zone_options = sorted(predictions["zone_id"].unique())
        selected_zone = st.selectbox("Select a zone", zone_options)

        zone_pred = predictions[predictions["zone_id"] == selected_zone].sort_values("timestamp")
        latest = zone_pred.iloc[-1]

        c1, c2, c3 = st.columns(3)
        c1.metric("Current Occupancy", f"{latest['current_occupancy']:.0f}/{latest['capacity']:.0f}")
        c2.metric("Predicted (30 min)", f"{latest['predicted_occupancy']:.0f}/{latest['capacity']:.0f}")
        c3.metric("Risk Level", f"{risk_badge(latest['risk_level'])} {latest['risk_level']}")

        fig4 = px.line(
            zone_pred, x="timestamp", y=["current_occupancy", "predicted_occupancy"],
            title=f"Current vs Predicted Occupancy — {selected_zone}",
        )
        st.plotly_chart(fig4, use_container_width=True)

    # ---------------- Map ----------------
    with tabs[4]:
        st.subheader("🗺️ Parking Zones Map")
        map_df = zones.merge(dashboard_data[["zone_id", "occupancy", "utilization"]], on="zone_id", how="left")
        fig5 = px.scatter_mapbox(
            map_df, lat="latitude", lon="longitude", size="capacity", color="utilization",
            color_continuous_scale="RdYlGn_r", hover_name="zone_name",
            hover_data=["capacity", "occupancy"], zoom=11, height=550,
        )
        fig5.update_layout(mapbox_style="open-street-map", margin={"r": 0, "t": 0, "l": 0, "b": 0})
        st.plotly_chart(fig5, use_container_width=True)


if __name__ == "__main__":
    main()
