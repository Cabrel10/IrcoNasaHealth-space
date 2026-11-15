# IRCO — Intelligent Real-time Crew Observer

**NASA Space Apps Challenge 2026 — Healthcare Track**

> Transform heterogeneous observations into coherent, traceable, temporal,
> and explainable health surveillance for astronauts.

![Language](https://img.shields.io/badge/language-Rust%20%2B%20Python-blue)
![API](https://img.shields.io/badge/API-Axum%20(Rust)-orange)
![Status](https://img.shields.io/badge/status-prototype%20%2F%20in%20progress-yellow)

---

## Table of Contents

- [Overview](#overview)
- [Key Features](#key-features)
- [Architecture](#architecture)
- [Quick Start](#quick-start)
- [API Endpoints](#api-endpoints)
- [Data Classes — Never Mixed](#data-classes--never-mixed)
- [Project Structure](#project-structure)
- [Design Principles](#design-principles)
- [Testing](#testing)
- [Continuous Integration](#continuous-integration)
- [Project Status](#project-status)
- [Documentation](#documentation)
- [License](#license)

## Overview

IRCO is a deterministic health-surveillance backend for space crews. It
ingests heterogeneous observations (real telemetry, analog human datasets,
synthetic scenarios), stores them with full provenance, evaluates
transparent rule-based health indicators over time, and raises persistent,
traceable alerts. A curated NASA/CSA knowledge corpus with offline BM25
search provides cited, source-grounded explanations.

Determinism and auditability come first: the monitoring pipeline runs
entirely without any LLM, and every conclusion can be traced back to its
source data.

## Key Features

- **Ingestion & storage** — SQLite observation store with idempotent exact
  replay, conflict rejection, indexed queries, and data-class filtering.
- **Deterministic rules engine** — absolute-threshold, personal-baseline
  deviation, and signed trend-slope conditions, plus persistent deviation
  across consecutive valid readings, scoped to one subject / class /
  indicator / unit.
- **AND/OR composite rules** — deterministic evaluation over rule IDs
  already triggered for one subject and data class, with strict validation
  (no empty, duplicate, unknown, or nested references).
- **Alert lifecycle** — persisted, idempotent alerts with rule validation
  status, source, data class, and follow-up measurements.
- **Temporal health state** — per-subject health overview with freshness
  evaluation, `as_of` deterministic replay, and missing-indicator reporting.
- **Knowledge & assistant** — curated NASA/CSA summary corpus, offline BM25
  search, an optional OpenAI-compatible Colab chat relay with citation checks,
  and an extractive fallback (no LLM required).
- **Offline demo** — replayable synthetic scenarios (A-01, nominal,
  dropout) with explicit synthetic labels.

## Architecture

```
┌─────────────────────────────────────────────────────────┐
│                   IRCO API (Rust/Axum)                  │
│       Port 3080 · Auth · Routes · Orchestration         │
├──────────────┬──────────────────┬────────────────────────┤
│  PART 1      │    PART 2        │      PART 3            │
│  Data        │    Health        │      Knowledge & AI    │
│  Platform    │    Intelligence  │                        │
│              │                  │                        │
│  Python+Rust │    Rust          │      Python+Rust       │
│              │                  │                        │
│  Acquisition │  Indicators      │  NASA/CSA corpus       │
│  Validation  │  Temporal        │  BM25 search           │
│  Normalize   │  Baseline        │  Assistant             │
│  Storage     │  Correlations    │  Multimodal adapters   │
│  Provenance  │  Anomalies       │  Model relay           │
│              │  Decision        │                        │
│              │  Alerts/Followup │                        │
├──────────────┴──────────────────┴────────────────────────┤
│                   Shared Storage                        │
│  SQLite · Raw files · JSONL · Manifests · Audit log     │
└─────────────────────────────────────────────────────────┘
```

## Quick Start

Prerequisites: **Rust** (stable) and **Python 3** with no additional
packages required for the contract tests.

```bash
# 1. Build the API (single Cargo job — suitable for small VPS)
CARGO_BUILD_JOBS=1 cargo build --bin irco-api

# 2. Start the API from the repository root
IRCO_HOST=127.0.0.1 IRCO_PORT=3080 cargo run --bin irco-api

# 3. Health check (public, no token required)
curl http://localhost:3080/health
```

### Configuration

| Variable | Purpose |
|----------|---------|
| `IRCO_HOST` / `IRCO_PORT` | Bind address and port (default `3080`) |
| `IRCO_API_TOKEN` | Enables bearer authentication on every route except `/health`, `/version`, and `/openapi.json` |
| `IRCO_COLAB_ADMIN_TOKEN` | Separate bearer token required to register or revoke Colab; registration is disabled when absent |
| `IRCO_COLAB_TTL_SECONDS` | Colab heartbeat expiry window in seconds (30–3600, default 180) |
| `IRCO_CORPUS_PATH` | Overrides the default knowledge corpus location (`data/corpus.jsonl`) |

The assistant uses the current, unexpired Colab registry session and falls
back locally when Colab is unavailable. It sends only relevant scientific
sources; health state is sent only when explicitly requested with a subject ID
and data class to an active registered runtime. The current VPS notebook
supports text chat only; multimodal endpoints are not enabled. See
[`colab/README.md`](colab/README.md).

## API Endpoints

Full contract: [`contracts/api.md`](contracts/api.md) ·
OpenAPI: [`docs/api/openapi.yaml`](docs/api/openapi.yaml)

| Area | Endpoints |
|------|-----------|
| System | `GET /health`, `GET /version`, `GET /openapi.json` |
| Registry & state | `GET /api/v1/rules`, `POST /api/v1/admin/rules/reload`, `GET /api/v1/indicators`, `GET /api/v1/indicators/{id}`, `GET /api/v1/state?data_class=…`, `GET /api/v1/state/{subject_id}?data_class=…` |
| Data | `POST /api/v1/ingest`, `GET /api/v1/observations`, `GET /api/v1/observations/export` |
| Alerts | `GET /api/v1/alerts`, `PATCH /api/v1/alerts/{id}`, `POST /api/v1/alerts/{id}/followup` |
| Knowledge | `GET /api/v1/knowledge/search`, `POST /api/v1/assistant/chat`, `GET /api/v1/knowledge/health`, `GET /api/v1/knowledge/hazards`, `GET /api/v1/knowledge/indicator/{id}` |
| Colab runtime | `POST` / `DELETE /api/v1/admin/colab/register`, `POST /api/v1/admin/colab/heartbeat`, `GET /api/v1/colab/status`, `GET /api/v1/colab/capabilities` |
| Offline demo | `GET /api/v1/demo/scenarios`, `GET /api/v1/demo/replay`, `GET /api/v1/demo/scenario`, `POST /api/v1/demo/reset` |

## Data Classes — Never Mixed

Every observation and alert carries its `data_class`. Synthetic scenarios
are for demonstrations only and are never represented as astronaut
measurements.

| Class | Meaning | Examples |
|-------|---------|----------|
| `measured_real` | Actually collected measurements | ISS telemetry, NOAA solar data |
| `analog` | Real human data, not astronauts | MIMIC-IV, MHEALTH, Sleep-EDF |
| `synthetic` | Generated by IRCO | Scenario A-01 |

## Project Structure

```
nase/
├── Cargo.toml          # Workspace
├── contracts/          # JSON schemas & API contract (v0)
├── crates/             # 8 Rust crates
│   ├── irco-api/       # HTTP server (Axum)
│   ├── irco-core/      # Shared types & config
│   ├── irco-data/      # Storage & ingestion (SQLite)
│   ├── irco-health/    # Health analysis engine
│   ├── irco-decisions/ # Deterministic rules engine
│   ├── irco-alerts/    # Alert lifecycle
│   ├── irco-knowledge/ # BM25 search & corpus
│   └── irco-ai/        # Model gateway & relay
├── python/             # Data acquisition & knowledge
├── config/             # Server, sources & indicator registry
├── rules/              # Decision rules (JSON)
├── data/               # Raw data, normalized data, manifests
├── colab/              # Optional Colab runtime integration
├── docs/               # Architecture, API & scientific validation docs
└── tests/              # Integration tests & fixtures
```

## Design Principles

1. LLMs **never** create alerts, modify rules, or override deterministic
   decisions.
2. Core monitoring works **without** any LLM or Colab connection.
3. Raw data files are **immutable** — never modified after download.
4. Every observation is **traceable** back to its source.
5. External source failures are **isolated** — one down source does not
   take the system down.
6. All thresholds are marked `illustrative` until scientifically validated.
7. Synthetic data **never** produces alerts labeled as real measurements.

## Testing

Run the complete local CI suite from the repository root:

```bash
./scripts/check_ci.sh
```

## Continuous Integration

GitHub Actions runs Rust formatting, workspace tests, Clippy, Python contract
validation, and acquisition/pivot/import tests on every push and pull request.
The same full suite can be run locally with `scripts/check_ci.sh`.

Install repository-local Git hooks on each clone with:

```bash
./scripts/install_git_hooks.sh
```

The pre-commit hook checks formatting, workspace tests, and contracts; the
pre-push hook runs the full CI suite. These hooks are local safeguards and can
be bypassed, so protect the default branch on GitHub and require the
**Rust format, tests, and lint** and **Python contracts and pipeline tests**
checks before merging. CI verifies
changes but does not deploy the service; a deployment target and credentials
have not been configured.

## Project Status

**Prototype in active development — not delivery-ready.** Implemented
today: schemas, ingestion/storage, the deterministic rules engine
(including persistence and AND/OR composites), the alert lifecycle, the
temporal health-state API, and offline BM25 search with a
citation-preserving assistant fallback.

Not yet delivered: analog-data import, composite alert persistence during
ingestion, an automated source-refresh pipeline, archived source pages, and
audio/vision adapters. The Colab chat relay remains optional and requires a
running notebook heartbeat.

All clinical thresholds are illustrative/provisional; trend analysis is
descriptive until rules receive scientific validation. See
[`docs/PROGRESS.md`](docs/PROGRESS.md) for the detailed, up-to-date report.

## Documentation

| Document | Content |
|----------|---------|
| [`contracts/api.md`](contracts/api.md) | Authoritative API contract (v0) |
| [`docs/api/openapi.yaml`](docs/api/openapi.yaml) | OpenAPI description of implemented routes |
| [`docs/PROGRESS.md`](docs/PROGRESS.md) | Detailed implementation status |
| [`docs/architecture/`](docs/architecture/README.md) | Architecture notes |
| [`docs/data_sources/`](docs/data_sources/README.md) | External data sources |
| [`colab/README.md`](colab/README.md) | Dynamic Colab endpoint and assistant fallback |
| [`docs/scientific_validation/`](docs/scientific_validation/README.md) | Validation approach |

## License

NASA Space Apps Challenge 2026 — Open Innovation.
