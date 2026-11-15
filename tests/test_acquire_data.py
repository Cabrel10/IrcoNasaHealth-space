import tempfile
import threading
import unittest
from http.server import BaseHTTPRequestHandler, HTTPServer
from pathlib import Path
import sys

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from scripts.acquire_data import Source, download_source


PAYLOAD = b"small synthetic test payload\n"


class RangeHandler(BaseHTTPRequestHandler):
    requests = 0

    def do_GET(self):
        type(self).requests += 1
        if self.path == "/missing":
            self.send_error(404)
            return
        range_header = self.headers.get("Range")
        if range_header:
            offset = int(range_header.removeprefix("bytes=").removesuffix("-"))
            body = PAYLOAD[offset:]
            self.send_response(206)
            self.send_header("Content-Range", f"bytes {offset}-{len(PAYLOAD) - 1}/{len(PAYLOAD)}")
        else:
            body = PAYLOAD
            self.send_response(200)
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Content-Type", "application/octet-stream")
        self.end_headers()
        self.wfile.write(body)

    def log_message(self, _format, *_args):
        pass


class AcquisitionTests(unittest.TestCase):
    def setUp(self):
        RangeHandler.requests = 0
        self.server = HTTPServer(("127.0.0.1", 0), RangeHandler)
        self.thread = threading.Thread(target=self.server.serve_forever)
        self.thread.start()
        self.url = f"http://127.0.0.1:{self.server.server_port}/payload"
        self.temp_dir = tempfile.TemporaryDirectory()

    def tearDown(self):
        self.server.shutdown()
        self.thread.join()
        self.server.server_close()
        self.temp_dir.cleanup()

    def test_download_is_hashed_and_cached_without_redownload(self):
        source = Source(
            "TEST", self.url, "source.bin", "synthetic", "test-license", 3, 0, "test"
        )
        output = Path(self.temp_dir.name)
        entry, downloaded = download_source(source, output, len(PAYLOAD))
        self.assertIsNone(entry["error"])
        self.assertEqual(downloaded, len(PAYLOAD))
        self.assertEqual((output / "source.bin").read_bytes(), PAYLOAD)

        cached, downloaded_again = download_source(source, output, 0)
        self.assertEqual(cached["sha256"], entry["sha256"])
        self.assertEqual(downloaded_again, 0)

    def test_download_resumes_partial_file_and_enforces_budget(self):
        source = Source(
            "TEST", self.url, "source.bin", "synthetic", "test-license", 3, 0, "test"
        )
        output = Path(self.temp_dir.name)
        partial = output / "source.bin.part"
        partial.write_bytes(PAYLOAD[:8])

        entry, downloaded = download_source(source, output, len(PAYLOAD) - 8)
        self.assertIsNone(entry["error"])
        self.assertEqual(downloaded, len(PAYLOAD) - 8)
        self.assertEqual((output / "source.bin").read_bytes(), PAYLOAD)

        capped, capped_bytes = download_source(
            Source(
                "CAPPED",
                self.url,
                "other.bin",
                "synthetic",
                "test-license",
                3,
                0,
                "test",
            ),
            output,
            2,
        )
        self.assertIsNotNone(capped["error"])
        self.assertEqual(capped_bytes, 0)

    def test_permanent_source_failure_is_reported_without_retrying(self):
        source = Source(
            "MISSING",
            self.url.rsplit("/", 1)[0] + "/missing",
            "missing.bin",
            "measured_real",
            "public_domain",
            3,
            3,
            "test",
        )
        entry, downloaded = download_source(source, Path(self.temp_dir.name), 100)
        self.assertEqual(entry["http_status"], 404)
        self.assertIsNotNone(entry["error"])
        self.assertEqual(entry["retries"], 0)
        self.assertEqual(downloaded, 0)
        self.assertEqual(RangeHandler.requests, 1)


if __name__ == "__main__":
    unittest.main()
