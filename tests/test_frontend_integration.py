"""Smoke tests for the Stitch frontend's data integration layer."""

import sys
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch


ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "Frontend"))

import server  # noqa: E402
import hybrid_data  # noqa: E402


class FrontendIntegrationTests(unittest.TestCase):
    def test_hybrid_operator_occupancy_is_persisted_and_bounded(self):
        original_path = hybrid_data.STATE_PATH
        original_memory = hybrid_data._memory_state
        try:
            with tempfile.TemporaryDirectory() as temp_dir:
                hybrid_data.STATE_PATH = Path(temp_dir) / "hybrid-state.json"
                hybrid_data._memory_state = None
                zone = server.zones_frame().iloc[0].to_dict()
                target = min(int(zone["capacity"]), int(zone["occupancy"]) + 1)
                with patch.object(hybrid_data, "_publish_kafka", return_value={"attempted": False, "published": False, "detail": "test"}):
                    result = hybrid_data.record_occupancy({"zone_id": zone["zone_id"], "action": "SET", "occupancy": target}, zone)
                self.assertTrue(result["ok"])
                self.assertEqual(hybrid_data.manual_zone_states()[zone["zone_id"]]["occupancy"], target)
                self.assertTrue(hybrid_data.STATE_PATH.exists())
        finally:
            hybrid_data.STATE_PATH = original_path
            hybrid_data._memory_state = original_memory

    def test_overview_contains_zones_and_consistent_capacity(self):
        payload = server.overview_payload()
        self.assertGreater(len(payload["zones"]), 0)
        self.assertEqual(
            payload["kpis"]["capacity"],
            payload["kpis"]["occupied"] + payload["kpis"]["available"],
        )
        self.assertTrue(all(0 <= zone["utilization"] <= 100 for zone in payload["zones"]))
        self.assertTrue(all(0 <= zone["occupancy"] <= zone["capacity"] for zone in payload["zones"]))
        for key in (
            "events_ingested", "risk_hubs", "median_dwell",
            "entries_per_min", "exits_per_min", "flow_delta",
        ):
            self.assertIn(key, payload["kpis"])
        self.assertIn("weather", payload)
        self.assertTrue(all("forecast_occupancy_30m" in zone for zone in payload["zones"]))
        self.assertTrue(all(0 <= zone["forecast_occupancy_30m"] <= zone["capacity"] for zone in payload["zones"]))

    def test_prediction_uses_saved_model(self):
        result = server.predict_one({"zone": "Z001", "current_occupancy": 20})
        self.assertGreaterEqual(result["predicted_occupancy"], 0)
        self.assertLessEqual(result["predicted_occupancy"], result["capacity"])
        self.assertIn(result["risk"], {"LOW", "MEDIUM", "HIGH"})
        self.assertLessEqual(result["confidence_low"], result["predicted_occupancy"])
        self.assertGreaterEqual(result["confidence_high"], result["predicted_occupancy"])

    def test_demand_prediction_model_endpoints_and_controller(self):
        card = server.model_card_payload()
        benchmark = server.model_benchmark_payload("Z001")
        aggregate_prediction = server.prediction_payload("ALL")
        self.assertIn(card["status"], {"PRODUCTION", "HYBRID_FALLBACK"})
        self.assertGreater(card["training_rows"], 0)
        self.assertGreater(len(card["features"]), 0)
        self.assertGreater(benchmark["samples"], 0)
        self.assertEqual(benchmark["models"][0]["name"], "Random Forest v3.2")
        self.assertGreater(aggregate_prediction["metrics"]["r2"], 0.9)
        for format_name, content_type in (("json", "application/json"), ("pmml", "application/xml")):
            body, returned_type, filename = server.model_export_bytes(format_name)
            self.assertGreater(len(body), 100)
            self.assertIn(content_type, returned_type)
            self.assertTrue(filename.endswith(f".{format_name}"))
        controller = server.FRONTEND / "demand-prediction.js"
        source = controller.read_text(encoding="utf-8")
        self.assertIn("font-size:19px", source)
        self.assertIn("/api/model/benchmark", source)
        self.assertIn("/api/model/export", source)
        self.assertIn("/api/predict", source)
        self.assertIn("state.model.inference_engine", source)
        self.assertIn("series.slice(-48)", source)
        self.assertIn("forecast_occupancy_30m", source)
        self.assertIn("async function runBenchmark()", source)
        self.assertIn("function wireGlobalControls()", source)

    def test_big_data_pipeline_topology_and_controller(self):
        fake_health = {
            "docker": True, "kafka": True, "spark": True, "postgres": True,
            "services": [], "offsets": ["parking-events:0:7513"], "parquet_files": 12,
            "checked_at": "2026-09-10T00:00:00+00:00",
        }
        with patch.object(server, "health_payload", return_value=fake_health):
            topology = server.pipeline_topology_payload()
            body, content_type, filename = server.pipeline_export_bytes("json")
        self.assertEqual(len(topology["stages"]), 8)
        self.assertEqual(len(topology["journey"]), 8)
        self.assertGreater(topology["estimated_end_to_end_ms"], 0)
        self.assertEqual(topology["stream"]["partitions"][0]["offset"], 7513)
        self.assertEqual(topology["stages"][6]["name"], "scikit-learn Model Service")
        elapsed = 0
        for latency, journey in zip(topology["latencies"], topology["journey"]):
            elapsed += latency["milliseconds"]
            self.assertEqual(journey["stage_ms"], latency["milliseconds"])
            self.assertEqual(journey["offset_ms"], elapsed)
            self.assertIn("source", journey)
        offline_health = {
            "docker": False, "kafka": False, "spark": False, "postgres": False,
            "services": [], "offsets": [], "parquet_files": 12,
            "checked_at": "2026-09-10T00:00:00+00:00",
        }
        with patch.object(server, "health_payload", return_value=offline_health):
            degraded = server.pipeline_topology_payload()
        self.assertEqual(degraded["overview"]["events_per_second"], 0)
        self.assertEqual(degraded["stages"][0]["status"], "attention")
        self.assertEqual(degraded["latencies"][2]["source"], "last observed")
        self.assertIn("application/json", content_type)
        self.assertTrue(filename.endswith(".json"))
        self.assertGreater(len(body), 100)
        dag = server.pipeline_dag_payload()
        self.assertEqual(len(dag["nodes"]), 6)
        controller = server.FRONTEND / "big-data-pipeline.js"
        source = controller.read_text(encoding="utf-8")
        self.assertIn("font-size:19px", source)
        self.assertIn("/api/pipeline/topology", source)
        self.assertIn("/api/pipeline/dag", source)
        self.assertIn("/api/pipeline/export", source)
        self.assertIn("function wireGlobalControls()", source)
        self.assertIn("T+${fmt(row.offset_ms)} ms", source)
        self.assertIn('state.paused ? "Resume animation" : "Pause animation"', source)
        self.assertIn("Pipeline degraded", source)
        self.assertIn("Modeled Latency Stack", source)
        self.assertIn("Kafka offline", source)

    def test_history_and_explorer_return_real_rows(self):
        # overview_payload reads the same raw CSV without date parsing first;
        # history must still receive datetime columns from its own cache entry.
        server.overview_payload()
        history = server.history_payload(7, "Z001")
        self.assertGreater(len(history["trend"]), 0)
        self.assertGreater(len(history["flow"]), 0)
        self.assertIn("average_utilization", history["summary"])
        self.assertTrue(all("utilization" in row for row in history["trend"]))
        self.assertEqual(history["range"]["requested_days"], 7)
        self.assertGreaterEqual(history["range"]["coverage_days"], 6.9)
        expanded = server.history_payload(30, "Z001")
        self.assertTrue(expanded["range"]["truncated"])
        self.assertGreater(expanded["range"]["coverage_days"], history["range"]["coverage_days"])
        self.assertGreater(len(expanded["trend"]), len(history["trend"]))
        explored = server.data_payload("raw", 1, 5, "")
        self.assertEqual(len(explored["rows"]), 5)
        self.assertGreater(len(explored["schema"]), 5)

    def test_all_frontend_route_sources_exist(self):
        for folder in server.ROUTES.values():
            self.assertTrue((server.FRONTEND / folder / "code.html").is_file())

    def test_overview_uses_real_geospatial_coordinates(self):
        payload = server.overview_payload()
        self.assertEqual(len(payload["zones"]), 20)
        self.assertTrue(all(not zone["zone_name"].startswith("Parking Zone ") for zone in payload["zones"]))
        self.assertTrue(all(18.9 < float(zone["latitude"]) < 19.3 for zone in payload["zones"]))
        self.assertTrue(all(72.7 < float(zone["longitude"]) < 73.1 for zone in payload["zones"]))
        overview_html = (server.FRONTEND / server.ROUTES["/overview"] / "code.html").read_text(encoding="utf-8")
        controller = (server.FRONTEND / "overview.js").read_text(encoding="utf-8")
        self.assertIn("leaflet@1.9.4", overview_html)
        self.assertIn("tile.openstreetmap.org", controller)
        self.assertIn("font-size:18px", controller)
        self.assertIn('api("/api/stream")', controller)
        self.assertIn('api("/api/action/reroute"', controller)
        self.assertIn("Network Capacity Normal", controller)
        self.assertIn("function wireGlobalControls()", controller)
        self.assertIn("HTTP action API", controller)
        self.assertNotIn("12 parts | 0.8ms lag", overview_html)
        self.assertNotIn("PySpark MLlib Random Forest", overview_html)

    def test_live_stream_payload_and_controller(self):
        fake_health = {
            "kafka": True, "spark": True,
            "offsets": ["parking-events:0:1234"],
        }
        with patch.object(server, "health_payload", return_value=fake_health):
            payload = server.stream_payload()
        self.assertEqual(payload["partitions"][0]["partition"], 0)
        self.assertEqual(payload["partitions"][0]["offset"], 1234)
        self.assertIn("saturation", payload["bloom"])
        self.assertIn("samples", payload["spark"])
        controller = server.FRONTEND / "live-monitoring.js"
        self.assertTrue(controller.is_file())
        source = controller.read_text(encoding="utf-8")
        self.assertIn("font-size:18px", source)
        self.assertIn("const duplicate = seen.has(id)", source)
        self.assertIn("rows.filter((row) => !row.duplicate)", source)

    def test_parking_map_backend_and_controller(self):
        payload = server.map_payload("Z003")
        self.assertEqual(payload["selected"]["zone_id"], "Z003")
        self.assertEqual(len(payload["zones"]), 20)
        self.assertGreater(len(payload["alternatives"]), 0)
        self.assertTrue(all(item["distance_km"] >= 0 for item in payload["alternatives"]))
        with patch.object(server, "_reroute_actions", []):
            result = server.record_reroute({
                "source_zone": "Z003",
                "target_zone": payload["alternatives"][0]["zone_id"],
            })
        self.assertTrue(result["ok"])
        self.assertEqual(result["action"]["status"], "RECORDED")
        controller = server.FRONTEND / "parking-map.js"
        source = controller.read_text(encoding="utf-8")
        self.assertTrue(controller.is_file())
        self.assertIn("font-size:19px", source)
        self.assertIn("tile.openstreetmap.org", source)
        self.assertIn("/api/action/reroute", source)
        self.assertIn("Find Best Available Hub", source)
        self.assertIn("stored baseline", source)
        self.assertIn("/api/hybrid/occupancy", source)
        self.assertIn("/api/hybrid/sync", source)
        self.assertIn("Record VMS guidance", source)
        self.assertIn("Map source:", source)
        self.assertIn("setInterval", source)

    def test_historical_exports_and_controller(self):
        for format_name, content_type in (("csv", "text/csv"), ("parquet", "application/vnd.apache.parquet"), ("tex", "application/x-tex"), ("pdf", "application/pdf")):
            body, returned_type, filename = server.history_export_bytes(7, "Z001", format_name)
            self.assertGreater(len(body), 20)
            self.assertIn(content_type, returned_type)
            self.assertTrue(filename.endswith(f".{format_name}"))
        controller = server.FRONTEND / "historical-analytics.js"
        source = controller.read_text(encoding="utf-8")
        self.assertIn("font-size:19px", source)
        self.assertIn("sp-heatmap", source)
        self.assertIn("/api/history/export", source)
        self.assertIn("#sp-history-summary{display:block", source)
        self.assertIn("/api/history/job-spec", source)
        self.assertIn("function wireGlobalControls()", source)
        self.assertIn("coverage_days", source)
        self.assertNotIn(".slice(-120)", source)
        spec = server.history_job_spec(30, "Z003,Z011")
        self.assertEqual(spec["zones"], ["Z003", "Z011"])
        self.assertEqual(spec["days"], 30)
        self.assertEqual(spec["rollup"], "5-minute event-time windows")

    def test_data_explorer_catalog_query_exports_and_controller(self):
        catalog = server.catalog_payload()
        self.assertEqual(len(catalog["layers"]), 5)
        self.assertGreater(catalog["sample_size"], 0)
        self.assertEqual(len(catalog["quality"]), 4)
        self.assertGreaterEqual(catalog["quality_average"], 0)
        query = server.safe_query_payload("capacity_pressure", 5)
        self.assertEqual(query["template"], "capacity_pressure")
        self.assertLessEqual(query["row_count"], 5)
        self.assertIn("SELECT", query["sql"])
        ddl, ddl_type, ddl_name = server.schema_ddl_bytes("silver")
        self.assertIn(b"CREATE TABLE smartpark_silver", ddl)
        self.assertIn("text/sql", ddl_type)
        self.assertTrue(ddl_name.endswith(".sql"))
        parquet, parquet_type, parquet_name = server.export_bytes("silver", "parquet")
        self.assertGreater(len(parquet), 20)
        self.assertIn("application/vnd.apache.parquet", parquet_type)
        self.assertTrue(parquet_name.endswith(".parquet"))
        controller = server.FRONTEND / "data-explorer.js"
        source = controller.read_text(encoding="utf-8")
        self.assertIn("font-size:19px", source)
        self.assertIn("/api/catalog", source)
        self.assertIn("/api/query", source)
        self.assertIn("/api/schema/ddl", source)

    def test_system_health_diagnostics_and_controller(self):
        fake_health = {
            "docker": True, "kafka": True, "spark": True, "postgres": True,
            "services": [{"name": "kafka", "state": "running", "health": "", "status": "Up 10 minutes"}],
            "offsets": ["parking-events:0:11099"], "postgres_message": "accepting connections",
            "parquet_files": 1454, "server_uptime_seconds": 600,
            "checked_at": "2026-09-10T00:00:00+00:00",
        }
        with patch.object(server, "health_payload", return_value=fake_health):
            diagnostics = server.diagnostics_payload()
            body, content_type, filename = server.diagnostics_export_bytes()
        self.assertTrue(diagnostics["healthy"])
        self.assertEqual(len(diagnostics["checks"]), 5)
        self.assertEqual(diagnostics["stream"]["partitions"][0]["offset"], 11099)
        self.assertGreater(len(diagnostics["logs"]), 4)
        self.assertIn("application/json", content_type)
        self.assertTrue(filename.endswith(".json"))
        self.assertGreater(len(body), 100)
        controller = server.FRONTEND / "system-health.js"
        source = controller.read_text(encoding="utf-8")
        self.assertIn("font-size:19px", source)
        self.assertIn("/api/diagnostics", source)
        self.assertIn("/api/action/recover", source)
        self.assertIn("/api/diagnostics/export", source)

    def test_shared_chrome_is_consistent_and_profile_free(self):
        source = (server.FRONTEND / "common-chrome.js").read_text(encoding="utf-8")
        self.assertNotIn("Aanya Sharma", source)
        self.assertIn("MISSION TELEMETRY", source)
        self.assertIn("All 20 Zones (Mumbai MMR)", source)
        self.assertIn("Live Window (Last 24 Hours)", source)
        self.assertIn("Collapse Dock", source)
        self.assertIn("Open Dock", source)
        self.assertIn('id = "sp-dock-reopen"', source)
        self.assertIn('setDockState(false, window.matchMedia("(max-width: 1080px)").matches)', source)
        self.assertIn("/api/diagnostics", source)
        self.assertIn("/api/hybrid/status", source)
        self.assertIn("const liveRate = kafkaCheck?.ok", source)
        self.assertIn('hybridReady ? "HYBRID" : "DEGRADED"', source)
        server_source = (server.FRONTEND / "server.py").read_text(encoding="utf-8")
        self.assertIn('/assets/common-chrome.js', server_source)


if __name__ == "__main__":
    unittest.main()
