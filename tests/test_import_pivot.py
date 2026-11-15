import json
import tempfile
import threading
import unittest
from http.server import BaseHTTPRequestHandler, HTTPServer
from pathlib import Path
import sys

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "scripts"))
from import_pivot import import_file


OBSERVATION = {
    "id": "test-noaa-0001",
    "timestamp": "2026-01-02T03:04:00Z",
    "subject_id": None,
    "indicator": "xray_flux_short",
    "value": 1.2e-7,
    "unit": "W/m2",
    "source": "NOAA_SWPC",
    "data_class": "measured_real",
    "context": {"environment": "solar_environment"},
    "provenance": {},
}


class IngestHandler(BaseHTTPRequestHandler):
    request_count = 0
    auth_header = None

    def do_POST(self):
        type(self).request_count += 1
        type(self).auth_header = self.headers.get("Authorization")
        length = int(self.headers["Content-Length"])
        request = json.loads(self.rfile.read(length))
        body = json.dumps(
            {
                "accepted": len(request["observations"]),
                "duplicates_skipped": 0,
                "alerts_created": 0,
            }
        ).encode()
        self.send_response(200)
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def log_message(self, _format, *_args):
        pass


class PivotImportTests(unittest.TestCase):
    def setUp(self):
        IngestHandler.request_count = 0
        IngestHandler.auth_header = None
        self.server = HTTPServer(("127.0.0.1", 0), IngestHandler)
        self.thread = threading.Thread(target=self.server.serve_forever)
        self.thread.start()
        self.base_url = f"http://127.0.0.1:{self.server.server_port}"
        self.temp_dir = tempfile.TemporaryDirectory()

    def tearDown(self):
        self.server.shutdown()
        self.thread.join()
        self.server.server_close()
        self.temp_dir.cleanup()

    def write_jsonl(self, row):
        path = Path(self.temp_dir.name) / "observations.jsonl"
        path.write_text(json.dumps(row) + "\n", encoding="utf-8")
        return path

    def test_import_sends_validated_batch_with_bearer_token(self):
        totals = import_file(
            self.write_jsonl(OBSERVATION),
            self.base_url,
            token="test-token",
            batch_size=1,
        )
        self.assertEqual(totals["validated"], 1)
        self.assertEqual(totals["accepted"], 1)
        self.assertEqual(totals["batches_sent"], 1)
        self.assertEqual(IngestHandler.auth_header, "Bearer test-token")

    def test_dry_run_validates_without_network(self):
        totals = import_file(
            self.write_jsonl(OBSERVATION),
            "http://127.0.0.1:1",
            batch_size=1,
            dry_run=True,
        )
        self.assertEqual(totals["validated"], 1)
        self.assertEqual(totals["batches_sent"], 0)
        self.assertEqual(IngestHandler.request_count, 0)

    def test_invalid_line_is_rejected_before_network(self):
        invalid = dict(OBSERVATION, data_class="astronaut")
        with self.assertRaisesRegex(ValueError, "violates pivot schema"):
            import_file(
                self.write_jsonl(invalid),
                self.base_url,
                batch_size=1,
            )
        self.assertEqual(IngestHandler.request_count, 0)


if __name__ == "__main__":
    unittest.main()
