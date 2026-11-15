#!/usr/bin/env python3
"""Stream validated pivot JSONL observations into the IRCO ingestion API."""

from __future__ import annotations

import argparse
import json
import os
import time
import urllib.error
import urllib.request
from pathlib import Path
from typing import Any

from jsonschema import Draft7Validator, FormatChecker

if __package__:
    from .build_pivot import ROOT
else:
    from build_pivot import ROOT


SCHEMA_PATH = ROOT / "contracts" / "pivot.schema.json"


def read_batches(path: Path, batch_size: int, validator: Draft7Validator):
    if batch_size < 1:
        raise ValueError("batch size must be a positive integer")
    batch: list[dict[str, Any]] = []
    with path.open(encoding="utf-8") as input_file:
        for line_number, line in enumerate(input_file, start=1):
            try:
                observation = json.loads(line)
            except json.JSONDecodeError as error:
                raise ValueError(f"line {line_number} is not valid JSON: {error}") from error
            errors = sorted(
                validator.iter_errors(observation), key=lambda error: list(error.path)
            )
            if errors:
                reason = "; ".join(error.message for error in errors)
                raise ValueError(f"line {line_number} violates pivot schema: {reason}")
            batch.append(observation)
            if len(batch) == batch_size:
                yield batch
                batch = []
    if batch:
        yield batch


def post_batch(
    endpoint: str,
    observations: list[dict[str, Any]],
    token: str | None,
    timeout_seconds: float = 30,
    retries: int = 2,
) -> dict[str, Any]:
    body = json.dumps({"observations": observations}).encode("utf-8")
    headers = {"Content-Type": "application/json"}
    if token:
        headers["Authorization"] = f"Bearer {token}"
    request = urllib.request.Request(endpoint, data=body, headers=headers, method="POST")

    for attempt in range(retries + 1):
        try:
            with urllib.request.urlopen(request, timeout=timeout_seconds) as response:
                result = json.loads(response.read().decode("utf-8"))
            if result.get("accepted", 0) + result.get("duplicates_skipped", 0) != len(
                observations
            ):
                raise RuntimeError(
                    "API response count does not match the submitted batch"
                )
            return result
        except urllib.error.HTTPError as error:
            response_body = error.read().decode("utf-8", errors="replace")
            error.close()
            if 400 <= error.code < 500 or attempt == retries:
                raise RuntimeError(
                    f"API rejected ingestion with HTTP {error.code}: {response_body}"
                ) from error
        except (urllib.error.URLError, TimeoutError) as error:
            if attempt == retries:
                raise RuntimeError(f"API ingestion failed: {error}") from error
        time.sleep(0.5 * (2**attempt))
    raise RuntimeError("API ingestion exhausted retries")


def import_file(
    path: Path,
    base_url: str,
    token: str | None = None,
    batch_size: int = 100,
    dry_run: bool = False,
) -> dict[str, int]:
    validator = Draft7Validator(
        json.loads(SCHEMA_PATH.read_text(encoding="utf-8")),
        format_checker=FormatChecker(),
    )
    endpoint = base_url.rstrip("/") + "/api/v1/ingest"
    totals = {
        "validated": 0,
        "accepted": 0,
        "duplicates_skipped": 0,
        "alerts_created": 0,
        "batches_sent": 0,
    }

    for batch in read_batches(path, batch_size, validator):
        totals["validated"] += len(batch)
        if dry_run:
            continue
        result = post_batch(endpoint, batch, token)
        totals["batches_sent"] += 1
        for key in ("accepted", "duplicates_skipped", "alerts_created"):
            totals[key] += int(result.get(key, 0))
    return totals


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "path",
        nargs="?",
        type=Path,
        default=ROOT / "data" / "normalized" / "observations.jsonl",
    )
    parser.add_argument("--api-url", default="http://127.0.0.1:3080")
    parser.add_argument("--batch-size", type=int, default=100)
    parser.add_argument("--dry-run", action="store_true")
    args = parser.parse_args()
    token = os.environ.get("IRCO_API_TOKEN")
    try:
        result = import_file(
            args.path,
            args.api_url,
            token=token,
            batch_size=args.batch_size,
            dry_run=args.dry_run,
        )
    except (OSError, ValueError, RuntimeError) as error:
        parser.exit(1, f"Import failed: {error}\n")
    print(json.dumps(result, sort_keys=True))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
