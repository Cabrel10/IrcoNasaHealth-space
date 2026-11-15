#!/usr/bin/env python3
"""Download a bounded set of public IRCO source files with resumable caching."""

from __future__ import annotations

import argparse
import hashlib
import json
import os
import time
import tomllib
import urllib.error
import urllib.request
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path
from typing import Any


ROOT = Path(__file__).resolve().parents[1]
CONFIG_PATH = ROOT / "config" / "sources.toml"
DEFAULT_MANIFEST = ROOT / "data" / "manifests" / "acquisition.json"
COLLECTOR_VERSION = "0.1.0"


class DownloadLimitError(OSError):
    pass


class InvalidResponseError(OSError):
    pass


@dataclass(frozen=True)
class Source:
    name: str
    url: str
    filename: str
    data_class: str
    license: str
    timeout_seconds: int
    max_retries: int
    notes: str


def load_sources(config_path: Path = CONFIG_PATH) -> dict[str, Source]:
    with config_path.open("rb") as config_file:
        config = tomllib.load(config_file)

    sources = {
        "noaa_xray": Source(
            name="NOAA_SWPC_XRAY",
            url=config["noaa_swpc"]["xray_url"],
            filename="noaa/swpc/xrays-7-day.json",
            data_class="measured_real",
            license="public_domain",
            timeout_seconds=config["noaa_swpc"]["timeout_seconds"],
            max_retries=config["noaa_swpc"]["max_retries"],
            notes="GOES X-ray flux, latest 7-day feed.",
        ),
        "noaa_solar_wind": Source(
            name="NOAA_SWPC_SOLAR_WIND",
            url=config["noaa_swpc"]["solar_wind_url"],
            filename="noaa/swpc/solar-wind-plasma-1-day.json",
            data_class="measured_real",
            license="public_domain",
            timeout_seconds=config["noaa_swpc"]["timeout_seconds"],
            max_retries=config["noaa_swpc"]["max_retries"],
            notes="Solar-wind plasma, latest 1-day feed.",
        ),
        "uci_mhealth": Source(
            name="UCI_MHEALTH",
            url=config["uci_mhealth"]["url"],
            filename="uci/MHEALTHDATASET.zip",
            data_class="analog",
            license="CC-BY-4.0",
            timeout_seconds=config["uci_mhealth"]["timeout_seconds"],
            max_retries=3,
            notes="Analog physiological dataset; retain original archive unchanged.",
        ),
        "celss": Source(
            name="CELSS",
            url=config["celss"]["url"],
            filename="celss/celss-supplementary-data.zip",
            data_class="analog",
            license=config["celss"]["license"],
            timeout_seconds=300,
            max_retries=3,
            notes="Frontiers supplementary archive with two JPEG figures; it contains no machine-readable measurements to pivot.",
        ),
    }
    nasa = config["nasa_eda"]
    for mission in nasa.get("missions", []):
        source_key = "nasa_eda_" + mission.lower().replace("-", "_")
        source_name = "NASA_OSDR_EDA_" + mission.upper().replace("-", "_")
        sources[source_key] = Source(
            name=source_name,
            url=f"{nasa['base_url'].rstrip('/')}/dashboard_{mission}",
            filename=f"nasa/eda/dashboard_{mission}.html",
            data_class="measured_real",
            license="public_domain",
            timeout_seconds=nasa["timeout_seconds"],
            max_retries=nasa["max_retries"],
            notes=f"NASA EDA per-mission dashboard, mission {mission}.",
        )
    return sources


def sha256_file(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as input_file:
        for chunk in iter(lambda: input_file.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def manifest_path(path: Path) -> str:
    resolved = path.resolve()
    try:
        return resolved.relative_to(ROOT).as_posix()
    except ValueError:
        return str(resolved)


def download_source(
    source: Source,
    output_dir: Path,
    remaining_bytes: int,
    retry_delay_seconds: float = 1.0,
) -> tuple[dict[str, Any], int]:
    destination = output_dir / source.filename
    partial = destination.with_name(destination.name + ".part")
    destination.parent.mkdir(parents=True, exist_ok=True)
    started_at = datetime.now(timezone.utc).isoformat()

    if destination.is_file():
        return (
            {
                "source": source.name,
                "url": source.url,
                "local_path": manifest_path(destination),
                "data_class": source.data_class,
                "download_date": started_at,
                "http_status": 200,
                "file_size_bytes": destination.stat().st_size,
                "sha256": sha256_file(destination),
                "license": source.license,
                "retries": 0,
                "error": None,
                "notes": f"{source.notes} Reused verified local cache.",
            },
            0,
        )

    downloaded = 0
    last_error = "download did not complete"
    last_status = 0
    last_content_type: str | None = None
    retries_used = 0
    attempts = max(0, source.max_retries) + 1

    for attempt in range(attempts):
        offset = partial.stat().st_size if partial.exists() else 0
        headers = {"User-Agent": f"IRCO-data-collector/{COLLECTOR_VERSION}"}
        if offset:
            headers["Range"] = f"bytes={offset}-"
        request = urllib.request.Request(source.url, headers=headers)
        try:
            with urllib.request.urlopen(request, timeout=source.timeout_seconds) as response:
                status = response.status
                last_status = status
                last_content_type = response.headers.get("Content-Type")
                if offset and status == 206:
                    content_range = response.headers.get("Content-Range", "")
                    if not content_range.startswith(f"bytes {offset}-"):
                        raise InvalidResponseError(
                            "server returned a mismatched Content-Range"
                        )
                    mode = "ab"
                elif status == 200:
                    offset = 0
                    mode = "wb"
                else:
                    raise OSError(f"unexpected HTTP status {status}")

                content_length = response.headers.get("Content-Length")
                if content_length is not None:
                    expected = int(content_length)
                    if expected > remaining_bytes - downloaded:
                        raise DownloadLimitError(
                            "download would exceed the remaining byte budget"
                        )

                with partial.open(mode) as output_file:
                    while chunk := response.read(64 * 1024):
                        if downloaded + len(chunk) > remaining_bytes:
                            raise DownloadLimitError(
                                "download stopped at the configured byte budget"
                            )
                        output_file.write(chunk)
                        downloaded += len(chunk)

                expected_total = response.headers.get("Content-Range")
                if expected_total:
                    total_text = expected_total.rsplit("/", 1)[-1]
                    if total_text.isdigit() and partial.stat().st_size != int(
                        total_text
                    ):
                        raise InvalidResponseError("partial download is incomplete")
                elif content_length is not None:
                    expected_size = offset + int(content_length)
                    if partial.stat().st_size != expected_size:
                        raise InvalidResponseError(
                            "download size does not match Content-Length"
                        )

                os.replace(partial, destination)
                entry = {
                    "source": source.name,
                    "url": source.url,
                    "local_path": manifest_path(destination),
                    "data_class": source.data_class,
                    "download_date": started_at,
                    "http_status": status,
                    "file_size_bytes": destination.stat().st_size,
                    "sha256": sha256_file(destination),
                    "license": source.license,
                    "retries": attempt,
                    "error": None,
                    "notes": source.notes,
                }
                if last_content_type is not None:
                    entry["content_type"] = last_content_type
                return entry, downloaded
        except (urllib.error.URLError, TimeoutError, OSError, ValueError) as error:
            if isinstance(error, urllib.error.HTTPError):
                last_status = error.code
                error.close()
            last_error = str(error)
            if isinstance(error, (DownloadLimitError, InvalidResponseError)) or (
                isinstance(error, urllib.error.HTTPError)
                and 400 <= error.code < 500
            ):
                break
            if attempt + 1 < attempts:
                retries_used += 1
                time.sleep(retry_delay_seconds * (2**attempt))

    return (
        {
            "source": source.name,
            "url": source.url,
            "local_path": manifest_path(partial if partial.exists() else destination),
            "data_class": source.data_class,
            "download_date": started_at,
            "http_status": last_status,
            "file_size_bytes": partial.stat().st_size if partial.exists() else 0,
            "license": source.license,
            "retries": retries_used,
            "error": last_error,
            "notes": source.notes,
        },
        downloaded,
    )


def write_manifest(path: Path, entries: list[dict[str, Any]]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    manifest = {
        "version": "0.1.0",
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "collector_version": COLLECTOR_VERSION,
        "entries": entries,
    }
    temporary = path.with_suffix(path.suffix + ".tmp")
    temporary.write_text(json.dumps(manifest, indent=2) + "\n", encoding="utf-8")
    os.replace(temporary, path)


def load_existing_entries(path: Path) -> list[dict[str, Any]]:
    try:
        manifest = json.loads(path.read_text(encoding="utf-8"))
    except FileNotFoundError:
        return []
    if not isinstance(manifest.get("entries"), list):
        raise ValueError(f"Existing manifest {path} has no entries array")
    return manifest["entries"]


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--source",
        action="append",
        dest="selected_sources",
        help="Source key to download; repeat to select multiple (default: all).",
    )
    parser.add_argument(
        "--max-mb",
        type=float,
        default=None,
        help="Maximum bytes downloaded in this run (defaults to config/sources.toml).",
    )
    parser.add_argument("--data-dir", type=Path, default=None)
    parser.add_argument("--manifest", type=Path, default=DEFAULT_MANIFEST)
    parser.add_argument("--config", type=Path, default=CONFIG_PATH)
    args = parser.parse_args()
    config_data = tomllib.loads(args.config.read_text(encoding="utf-8"))
    max_mb = (
        args.max_mb
        if args.max_mb is not None
        else float(config_data.get("general", {}).get("max_total_mb", 250))
    )
    if max_mb < 0:
        parser.error("--max-mb must be non-negative")
    data_dir = args.data_dir or ROOT / config_data.get("general", {}).get(
        "cache_dir", "data/raw"
    )

    sources = load_sources(args.config)
    names = args.selected_sources or list(sources)
    unknown = sorted(set(names) - sources.keys())
    if unknown:
        parser.error(f"unknown source key(s): {', '.join(unknown)}")
    budget = int(max_mb * 1024 * 1024)
    entries = load_existing_entries(args.manifest)
    by_name = {entry.get("source"): entry for entry in entries}
    failed = 0

    for name in names:
        source = sources[name]
        entry, used = download_source(source, data_dir, budget)
        budget -= used
        by_name[source.name] = entry
        write_manifest(args.manifest, list(by_name.values()))
        if entry["error"]:
            failed += 1
            print(f"{source.name}: failed: {entry['error']}")
        else:
            print(
                f"{source.name}: {entry['file_size_bytes']} bytes "
                f"sha256={entry['sha256']}"
            )
    print(f"Manifest: {args.manifest}; remaining download budget: {budget} bytes")
    return 1 if failed == len(names) else 0


if __name__ == "__main__":
    raise SystemExit(main())
