import hashlib
import json
import tempfile
import unittest
from datetime import datetime, timezone
from pathlib import Path
import sys

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from scripts.build_pivot import build_pivot


class PivotBuilderTests(unittest.TestCase):
    def test_builds_distinct_valid_noaa_observations_with_provenance(self):
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            xray_rows = [
                {
                    "time_tag": "2026-01-02T03:04:00Z",
                    "energy": "0.05-0.4nm",
                    "flux": 1.2e-7,
                    "satellite": 18,
                    "electron_contaminaton": False,
                },
                {
                    "time_tag": "2026-01-02T03:04:00Z",
                    "energy": "0.1-0.8nm",
                    "flux": 2.4e-6,
                    "satellite": 18,
                    "electron_contaminaton": False,
                },
            ]
            wind_rows = [
                {
                    "time_tag": "2026-01-02T03:04:00",
                    "active": True,
                    "source": "SOLAR1",
                    "proton_speed": 402.1,
                    "overall_quality": 0,
                },
                {
                    "time_tag": "2026-01-02T03:04:00",
                    "active": False,
                    "source": "ACE",
                    "proton_speed": 416.6,
                    "overall_quality": 0,
                },
            ]
            entries = []
            for name, rows in (
                ("NOAA_SWPC_XRAY", xray_rows),
                ("NOAA_SWPC_SOLAR_WIND", wind_rows),
            ):
                raw_file = root / f"{name}.json"
                raw_file.write_text(json.dumps(rows), encoding="utf-8")
                entries.append(
                    {
                        "source": name,
                        "url": f"https://example.test/{name}.json",
                        "local_path": str(raw_file),
                        "data_class": "measured_real",
                        "download_date": datetime.now(timezone.utc).isoformat(),
                        "http_status": 200,
                        "sha256": hashlib.sha256(raw_file.read_bytes()).hexdigest(),
                        "license": "public_domain",
                        "error": None,
                    }
                )
            manifest = root / "manifest.json"
            manifest.write_text(
                json.dumps({"entries": entries}), encoding="utf-8"
            )
            output = root / "out" / "observations.jsonl"
            rejected = root / "out" / "rejected.jsonl"

            accepted_count, rejected_count = build_pivot(manifest, output, rejected)
            observations = [
                json.loads(line) for line in output.read_text().splitlines()
            ]
            rejected_rows = [
                json.loads(line) for line in rejected.read_text().splitlines()
            ]

        self.assertEqual(accepted_count, 2)
        self.assertEqual(rejected_count, 0)
        self.assertEqual(
            {row["indicator"] for row in observations},
            {"xray_flux_short", "solar_wind_speed"},
        )
        self.assertTrue(all(row["data_class"] == "measured_real" for row in observations))
        self.assertTrue(all(row["provenance"]["sha256"] for row in observations))
        self.assertEqual(
            next(row for row in observations if row["indicator"] == "solar_wind_speed")[
                "timestamp"
            ],
            "2026-01-02T03:04:00Z",
        )
        self.assertEqual(rejected_rows, [])

    def test_checksum_mismatch_skips_source_and_records_failure(self):
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            raw_file = root / "feed.json"
            raw_file.write_text("[]", encoding="utf-8")
            manifest = root / "manifest.json"
            manifest.write_text(
                json.dumps(
                    {
                        "entries": [
                            {
                                "source": "NOAA_SWPC_XRAY",
                                "url": "https://example.test/feed.json",
                                "local_path": str(raw_file),
                                "data_class": "measured_real",
                                "download_date": datetime.now(timezone.utc).isoformat(),
                                "http_status": 200,
                                "sha256": "0" * 64,
                                "error": None,
                            }
                        ]
                    }
                ),
                encoding="utf-8",
            )
            output = root / "out.jsonl"
            rejected = root / "rejected.jsonl"
            accepted_count, rejected_count = build_pivot(manifest, output, rejected)
            failure = json.loads(rejected.read_text().splitlines()[0])

        self.assertEqual(accepted_count, 0)
        self.assertEqual(rejected_count, 1)
        self.assertIn("checksum", failure["reason"])

    def test_extracts_nasa_mission_dashboard_with_timestamp_uncertainty_flagged(self):
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            payload = {
                "mission": "RR-1",
                "telemetry_data": json.dumps(
                    {
                        "time": ["2014-09-20 03:59:00"],
                        "temperature_iss": [24.1],
                        "rh_iss": [39],
                        "co2_iss": [2641],
                    }
                ),
                "radiation_data": "{}",
            }
            raw_file = root / "dashboard.html"
            raw_file.write_text(
                '<script id="data" type="application/json">'
                + json.dumps(payload)
                + "</script>",
                encoding="utf-8",
            )
            manifest = root / "manifest.json"
            manifest.write_text(
                json.dumps(
                    {
                        "entries": [
                            {
                                "source": "NASA_OSDR_EDA_RR_1",
                                "url": "https://visualization.osdr.nasa.gov/eda/dashboard_RR-1",
                                "local_path": str(raw_file),
                                "data_class": "measured_real",
                                "download_date": datetime.now(timezone.utc).isoformat(),
                                "http_status": 200,
                                "sha256": hashlib.sha256(raw_file.read_bytes()).hexdigest(),
                                "license": "public_domain",
                            }
                        ]
                    }
                ),
                encoding="utf-8",
            )
            output = root / "observations.jsonl"
            rejected = root / "rejected.jsonl"
            accepted_count, rejected_count = build_pivot(manifest, output, rejected)
            observations = [
                json.loads(line) for line in output.read_text().splitlines()
            ]
            rejected_text = rejected.read_text(encoding="utf-8")

        self.assertEqual(accepted_count, 3)
        self.assertEqual(rejected_count, 2)
        self.assertEqual(
            {row["indicator"] for row in observations},
            {"temperature_iss", "humidity_iss", "co2_cabin"},
        )
        self.assertTrue(all(row["data_class"] == "measured_real" for row in observations))
        self.assertTrue(
            all(
                row["quality"]["flags"] == ["timestamp_timezone_not_specified"]
                for row in observations
            )
        )
        self.assertTrue(all(row["context"]["mission"] == "RR-1" for row in observations))
        self.assertIn(
            "radiation_series_not_normalized_unit_and_period_unverified",
            rejected_text,
        )


if __name__ == "__main__":
    unittest.main()
