#!/usr/bin/env python3
"""Convert acquired NOAA SWPC and NASA EDA feeds into validated pivot JSONL."""

from __future__ import annotations

import argparse
import hashlib
from html.parser import HTMLParser
import json
import math
import os
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

from jsonschema import Draft7Validator, FormatChecker


ROOT = Path(__file__).resolve().parents[1]
SCHEMA_PATH = ROOT / "contracts" / "pivot.schema.json"
SOURCES = {
    "NOAA_SWPC_XRAY": {
        "data_class": "measured_real",
        "energy_band": "0.05-0.4nm",
        "indicator": "xray_flux_short",
        "unit": "W/m2",
    },
    "NOAA_SWPC_SOLAR_WIND": {
        "data_class": "measured_real",
        "indicator": "solar_wind_speed",
        "unit": "km/s",
    },
}


def parse_utc(value: str) -> datetime:
    parsed = datetime.fromisoformat(value.replace("Z", "+00:00"))
    if parsed.tzinfo is None:
        parsed = parsed.replace(tzinfo=timezone.utc)
    return parsed.astimezone(timezone.utc)


def source_file(entry: dict[str, Any]) -> Path:
    path = Path(entry["local_path"])
    return path if path.is_absolute() else ROOT / path


class DashboardPayloadParser(HTMLParser):
    def __init__(self) -> None:
        super().__init__()
        self.in_payload = False
        self.parts: list[str] = []

    def handle_starttag(self, tag: str, attrs: list[tuple[str, str | None]]) -> None:
        if tag == "script" and dict(attrs).get("id") == "data":
            self.in_payload = True

    def handle_endtag(self, tag: str) -> None:
        if tag == "script" and self.in_payload:
            self.in_payload = False

    def handle_data(self, data: str) -> None:
        if self.in_payload:
            self.parts.append(data)


def reject(source: str, record: int | str | None, reason: str) -> dict[str, Any]:
    return {
        "source": source,
        "original_record": record,
        "reason": reason,
    }


def make_observation(
    source: str,
    row: dict[str, Any],
    record_number: int,
    entry: dict[str, Any],
    source_hash: str,
    validator: Draft7Validator,
) -> tuple[dict[str, Any] | None, str | None]:
    config = SOURCES[source]
    timestamp_text = row.get("time_tag")
    if not isinstance(timestamp_text, str):
        return None, "missing_or_invalid_time_tag"

    if source == "NOAA_SWPC_XRAY":
        if row.get("energy") != config["energy_band"]:
            return None, None
        value = row.get("flux")
        contamination = row.get("electron_contaminaton")
        status = "valid" if contamination is False else "suspect"
        flags = (
            []
            if status == "valid"
            else [
                "electron_contamination"
                if contamination is True
                else "electron_contamination_status_missing"
            ]
        )
        context = {
            "environment": "solar_environment",
            "energy_band": config["energy_band"],
            "satellite": row.get("satellite"),
        }
    else:
        if row.get("active") is not True:
            return None, None
        value = row.get("proton_speed")
        quality_flag = row.get("overall_quality")
        status = "valid" if quality_flag == 0 else "suspect"
        flags = [] if status == "valid" else [f"noaa_quality_flag:{quality_flag}"]
        context = {
            "environment": "solar_wind",
            "spacecraft": row.get("source"),
        }

    if isinstance(value, bool) or not isinstance(value, (float, int)):
        return None, "missing_or_non_numeric_value"
    if not math.isfinite(value):
        return None, "non_finite_value"
    try:
        timestamp = parse_utc(timestamp_text)
    except ValueError:
        return None, "invalid_time_tag"

    download_url = entry["url"]
    download_date = entry["download_date"]
    observation = {
        "id": f"noaa-{config['indicator'].replace('_', '-')}-{source_hash[:32]}-{record_number:05d}",
        "timestamp": timestamp.isoformat().replace("+00:00", "Z"),
        "subject_id": None,
        "indicator": config["indicator"],
        "value": value,
        "unit": config["unit"],
        "source": "NOAA_SWPC",
        "data_class": entry["data_class"],
        "context": context,
        "provenance": {
            "dataset": entry["source"],
            "original_file": entry["local_path"],
            "original_record": str(record_number),
            "original_unit": config["unit"],
            "original_timestamp": timestamp_text,
            "sha256": source_hash,
            "download_url": download_url,
            "download_date": download_date,
            "license": entry.get("license", "unspecified"),
        },
        "quality": {"status": status, "flags": flags},
    }
    errors = sorted(
        validator.iter_errors(observation), key=lambda error: list(error.path)
    )
    if errors:
        return None, "; ".join(error.message for error in errors)
    return observation, None


def extract_dashboard_payload(path: Path) -> dict[str, Any]:
    parser = DashboardPayloadParser()
    parser.feed(path.read_text(encoding="utf-8"))
    if not parser.parts:
        raise ValueError("NASA dashboard has no embedded data payload")
    payload = json.loads("".join(parser.parts))
    telemetry = json.loads(payload["telemetry_data"])
    return {"telemetry": telemetry}


def make_eda_observation(
    source: str,
    mission: str,
    indicator: str,
    value: float,
    unit: str,
    timestamp_text: str,
    record_label: str,
    sequence: int,
    entry: dict[str, Any],
    source_hash: str,
    validator: Draft7Validator,
) -> tuple[dict[str, Any] | None, str | None]:
    try:
        timestamp = parse_utc(timestamp_text)
    except ValueError:
        return None, "invalid_time_tag"

    observation = {
        "id": f"nasa-eda-{mission.lower().replace('_', '-')}-{source_hash[:24]}-{sequence:06d}",
        "timestamp": timestamp.isoformat().replace("+00:00", "Z"),
        "subject_id": None,
        "indicator": indicator,
        "value": value,
        "unit": unit,
        "source": "NASA_OSDR_EDA",
        "data_class": entry["data_class"],
        "context": {
            "mission": mission,
            "environment": "ISS_cabin",
            "timestamp_basis": "naive NASA EDA timestamp interpreted as UTC",
        },
        "provenance": {
            "dataset": f"NASA OSDR EDA {mission}",
            "original_file": entry["local_path"],
            "original_record": record_label,
            "original_unit": unit,
            "original_timestamp": timestamp_text,
            "sha256": source_hash,
            "download_url": entry["url"],
            "download_date": entry["download_date"],
            "license": entry.get("license", "unspecified"),
        },
        "quality": {
            "status": "suspect",
            "flags": ["timestamp_timezone_not_specified"],
        },
    }
    errors = sorted(
        validator.iter_errors(observation), key=lambda error: list(error.path)
    )
    if errors:
        return None, "; ".join(error.message for error in errors)
    return observation, None


def add_nasa_dashboard(
    source: str,
    entry: dict[str, Any],
    validator: Draft7Validator,
    observations: list[dict[str, Any]],
    rejected: list[dict[str, Any]],
) -> None:
    if entry.get("error"):
        rejected.append(reject(source, None, f"source_unavailable:{entry['error']}"))
        return
    if entry.get("data_class") != "measured_real":
        rejected.append(reject(source, None, "source_data_class_mismatch"))
        return

    raw_path = source_file(entry)
    try:
        source_hash = hashlib.sha256(raw_path.read_bytes()).hexdigest()
        if source_hash != entry.get("sha256"):
            raise ValueError("raw file checksum does not match acquisition manifest")
        payload = extract_dashboard_payload(raw_path)
    except (OSError, UnicodeDecodeError, json.JSONDecodeError, KeyError, ValueError) as error:
        rejected.append(reject(source, None, f"source_read_failed:{error}"))
        return

    mission = source.removeprefix("NASA_OSDR_EDA_").replace("_", "-")
    telemetry = payload["telemetry"]
    rejected.append(
        reject(
            source,
            "radiation_data",
            "radiation_series_not_normalized_unit_and_period_unverified",
        )
    )
    rejected.append(
        reject(
            source,
            "ground_control_telemetry",
            "ground_control_fields_excluded_from_iss_indicator_registry",
        )
    )
    timestamps = telemetry.get("time")
    if not isinstance(timestamps, list):
        rejected.append(reject(source, None, "telemetry_time_array_missing"))
        return

    sequence = 0
    fields = (
        ("temperature_iss", "temperature_iss", "degC"),
        ("rh_iss", "humidity_iss", "percent"),
        ("co2_iss", "co2_cabin", "ppm"),
    )
    for field, indicator, unit in fields:
        values = telemetry.get(field)
        if not isinstance(values, list) or len(values) != len(timestamps):
            rejected.append(reject(source, field, "telemetry_array_missing_or_misaligned"))
            continue
        for index, (timestamp_text, value) in enumerate(zip(timestamps, values)):
            sequence += 1
            record_label = f"{field}[{index}]"
            if isinstance(value, bool) or not isinstance(value, (float, int)):
                rejected.append(reject(source, record_label, "missing_or_non_numeric_value"))
                continue
            if not math.isfinite(value):
                rejected.append(reject(source, record_label, "non_finite_value"))
                continue
            if not isinstance(timestamp_text, str):
                rejected.append(reject(source, record_label, "missing_or_invalid_time_tag"))
                continue
            observation, reason = make_eda_observation(
                source,
                mission,
                indicator,
                value,
                unit,
                timestamp_text,
                record_label,
                sequence,
                entry,
                source_hash,
                validator,
            )
            if reason:
                rejected.append(reject(source, record_label, reason))
            elif observation is not None:
                observations.append(observation)


def build_pivot(
    manifest_path: Path, output_path: Path, rejected_path: Path
) -> tuple[int, int]:
    manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
    validator = Draft7Validator(
        json.loads(SCHEMA_PATH.read_text(encoding="utf-8")),
        format_checker=FormatChecker(),
    )
    entries = {
        entry["source"]: entry
        for entry in manifest.get("entries", [])
        if isinstance(entry, dict) and isinstance(entry.get("source"), str)
    }
    observations: list[dict[str, Any]] = []
    rejected: list[dict[str, Any]] = []

    for source in SOURCES:
        entry = entries.get(source)
        if entry is None:
            continue
        if entry.get("error"):
            rejected.append(reject(source, None, f"source_unavailable:{entry['error']}"))
            continue
        if entry.get("data_class") != SOURCES[source]["data_class"]:
            rejected.append(reject(source, None, "source_data_class_mismatch"))
            continue
        raw_path = source_file(entry)
        try:
            source_hash = hashlib.sha256(raw_path.read_bytes()).hexdigest()
            if source_hash != entry.get("sha256"):
                raise ValueError("raw file checksum does not match acquisition manifest")
            rows = json.loads(raw_path.read_text(encoding="utf-8"))
            if not isinstance(rows, list):
                raise ValueError("source document is not a JSON array")
        except (OSError, UnicodeDecodeError, json.JSONDecodeError, ValueError) as error:
            rejected.append(reject(source, None, f"source_read_failed:{error}"))
            continue

        for index, row in enumerate(rows, start=1):
            if not isinstance(row, dict):
                rejected.append(reject(source, index, "record_is_not_a_json_object"))
                continue
            observation, reason = make_observation(
                source, row, index, entry, source_hash, validator
            )
            if reason:
                rejected.append(reject(source, index, reason))
            elif observation is not None:
                observations.append(observation)

    for source in sorted(name for name in entries if name.startswith("NASA_OSDR_EDA_")):
        add_nasa_dashboard(source, entries[source], validator, observations, rejected)

    output_path.parent.mkdir(parents=True, exist_ok=True)
    rejected_path.parent.mkdir(parents=True, exist_ok=True)
    write_jsonl(output_path, observations)
    write_jsonl(rejected_path, rejected)
    return len(observations), len(rejected)


def write_jsonl(path: Path, rows: list[dict[str, Any]]) -> None:
    temporary = path.with_suffix(path.suffix + ".tmp")
    with temporary.open("w", encoding="utf-8") as output_file:
        for row in rows:
            output_file.write(json.dumps(row, sort_keys=True) + "\n")
    os.replace(temporary, path)


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--manifest",
        type=Path,
        default=ROOT / "data" / "manifests" / "acquisition.json",
    )
    parser.add_argument(
        "--output",
        type=Path,
        default=ROOT / "data" / "normalized" / "observations.jsonl",
    )
    parser.add_argument(
        "--rejected",
        type=Path,
        default=ROOT / "data" / "normalized" / "rejected.jsonl",
    )
    args = parser.parse_args()
    accepted, rejected_count = build_pivot(args.manifest, args.output, args.rejected)
    print(f"Accepted {accepted} observations; rejected/skipped {rejected_count} records.")
    print(f"JSONL: {args.output}; rejected-row log: {args.rejected}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
