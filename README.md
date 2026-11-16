# IRCO — Intelligent Real-time Crew Observer

**NASA Space Apps Challenge 2026 — Healthcare Track**

> Transform heterogeneous observations into coherent, traceable, temporal,
> and explainable health surveillance for astronauts.

![Language](https://img.shields.io/badge/language-Rust%20%2B%20Python-blue)
![API](https://img.shields.io/badge/API-Axum%20(Rust)-orange)
![Tests](https://img.shields.io/badge/tests-94%20Rust%20%2B%208%20contracts-green)
![Status](https://img.shields.io/badge/status-functional%20end--to--end-brightgreen)

---

## 🔗 Project Links

| Resource | Link |
|---|---|
| 🎞️ **Project Demonstration** (slide deck) | [Google Slides](https://docs.google.com/presentation/d/1hyIdhvDaTLG2DtwyJYLbaSgti6Gwfnhe/edit?usp=drive_link) |
| 📄 **Project Report** (PDF) | [Google Drive](https://drive.google.com/file/d/1M-xSFB7F9zB8d6chqWByZGQWHY8zYCfV/view?usp=drive_link) |
| 🖥️ **Live Demo** (may be offline) | http://169.58.67.16:5174/ |
| 🤖 **AI Engine Notebook** (Colab: multimodal chat, speech, vision — explain-only, never decides) | [Google Colab](https://colab.research.google.com/drive/1S_t90rrS8T5woWzmkcaEBzVquNpItbWp#scrollTo=D8NgJ0tYrsn8) |

> The live demo runs a synthetic astronaut (A-01, mission days 1→124: green →
> amber → red). Deep-link any mission day with `/?day=97`.

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

## Collected Data — and Where It Is Used

The project collects real public data. Every file is versioned with a
manifest (`data/manifests/acquisition.json`: URL, SHA-256, license,
timestamp) and every value ingested carries its data class.

| Collected dataset | Volume | Where it is used in IRCO |
|---|---|---|
| **NASA OSDR EDA** — ISS environmental & radiation telemetry (RR-1) | 36,261 measurements, `measured_real` | Ingested into the SQLite store; queryable via `GET /api/v1/observations` and exported CSV/JSONL; feeds the environment indicators of the registry (`co2_cabin`, `radiation_dose_daily`, `temperature_iss`, …) |
| **NOAA SWPC** — GOES X-ray flux (7-day feed) | 11,506 measurements, `measured_real` | Same ingestion path; `xray_flux_short` space-weather context for the crew |
| **NASA HRP + CSA pages** — curated 9-entry knowledge corpus (`data/corpus.jsonl`) | 9 verified summaries | Loaded at startup by `irco-knowledge`; powers `GET /api/v1/assistant/chat` (every answer cites its source) and `GET /api/v1/knowledge/hazards` (hazard → indicator → body-zone map shown in the UI) |
| **Decision rules** (`rules/rules.json`) | 12 versioned rules | Loaded at startup by `irco-decisions`; the engine evaluates absolute, baseline-deviation, trend, persistence, missing-data and composite rules → green/amber/red vigilance |

All of this is verifiable today: run the server
(`IRCO_PORT=3081 cargo run --bin irco-api`) and query
`GET /api/v1/observations?data_class=measured_real`,
`GET /api/v1/knowledge/hazards`, `GET /health` (reports
`rules_loaded`, `indicators_loaded`, `knowledge_available`).

## The Colab AI Engine — What It Does and Why

The AI layer is **optional and strictly subordinate** to the deterministic
engine. It runs in a Google Colab GPU notebook (see
[the notebook](https://colab.research.google.com/drive/1S_t90rrS8T5woWzmkcaEBzVquNpItbWp))
that keeps a heartbeat alive on the VPS; the backend reads the fresh tunnel
URL from that heartbeat registry (token sent only to the registry, never
logged or committed).

**What it does today (verified by unit tests and the live API):**

- When a crew member asks a question via `POST /api/v1/assistant/chat`, the
  backend sends **at most 5 BM25 excerpts** from the NASA/CSA corpus (score
  ≥ 0.25) to the notebook, waits **at most 15 seconds**, and accepts only
  answers that **cite the known `[S1]`-style sources**. Invented citations
  are rejected and the request falls back to the local extractive answer.
- The notebook may receive the **current deterministic health state** only
  when the request explicitly carries `subject_id` and `data_class`; that
  context is read-only and kept separate from the source citations.

**Measured on the notebook** (our interaction tests, November 2026):

| Capability | Measured | Value for a crew member |
|---|---|---|
| Natural-language chat | first token 0.2 s, full answer 6.4 s | Ask freely: "why is my sleep being counted?" — corpus-grounded answer in plain language |
| Speech → text (Whisper) | 0.9 s round trip | Dictate a symptom with occupied hands |
| Text → speech (MMS-TTS) | 140 KB audio in 0.1 s | Receive an instruction out loud |
| Full voice pipeline (`/v1/multi`) | first audio sentence at 1.9 s | Spoken dialogue end-to-end |
| Image description (SmolVLM) | 6.9 s | Describe a photo (a rash, equipment) as an *observation to confirm* |

The notebook provides these capabilities; IRCO currently relays **text
chat** through the API, and audio/vision will be wired into the API only
when the notebook exposes documented, compatible endpoints.

**The advantage:** mission-grade explanation with **zero infrastructure
cost** — and a decisive architecture property. Colab is our **test bench**
for the onboard AI: it demonstrates that a multimodal assistant fits in
**less than 20 GB of unified memory**. In a real mission the same role is
held by a compact quantized model running locally on the onboard computer —
not by a cloud notebook. IRCO's design makes this swap trivial: the
health engine is independent of the AI, which sits behind a standard
OpenAI-compatible interface. **The AI is therefore not optional in a real
mission — it is local and interchangeable; what is truly non-optional is
the deterministic engine, which keeps working when everything else fails**
(`/health` reports `ai_available: false`, `knowledge_available: true`).

**The boundary:** the model cannot create observations, modify rules, raise
alerts, or change the vigilance level — there is no route from the notebook
to the decision engine. We do **not** claim that Colab "works in space" or
that image description is a diagnosis: it produces observations to confirm,
never medical conclusions.


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
| `IRCO_COLAB_ADMIN_TOKEN` | Separate bearer token for legacy direct registration when the existing heartbeat registry is not configured |
| `IRCO_COLAB_REGISTRY_URL` | Existing internal heartbeat registry URL (default `http://127.0.0.1:8765/api/backends/internal`) |
| `IRCO_COLAB_REGISTRY_TOKEN` | Existing heartbeat registry token; falls back to `HB_SECRET` |
| `IRCO_COLAB_TTL_SECONDS` | Maximum heartbeat age in seconds (30–3600, default 600) |
| `IRCO_CORPUS_PATH` | Overrides the default knowledge corpus location (`data/corpus.jsonl`) |

The assistant reads the active runtime from the existing Colab heartbeat
registry and falls back locally when Colab is unavailable. It sends only relevant scientific
sources; health state is sent only when explicitly requested with a subject ID
and data class to an active registered runtime. The current VPS notebook
supports text chat only through IRCO; multimodal endpoints are not enabled.
The notebook continues sending heartbeats on the existing service at port
`8765`; IRCO's API remains on port `3080` by default. See
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
├── frontend/           # React/Vite dashboard (consumes the IRCO API only)
│   ├── src/            # App, views, 3D anatomy module (Three.js)
│   ├── tests/e2e/      # Playwright suites against the real backend
│   └── fixtures/       # Captured API responses
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

**IRCO works end-to-end and is verified by tests.** Delivered and running
today: schemas, ingestion/storage (idempotent replay, conflict rejection),
the deterministic rules engine with persistence and AND/OR composites, the
alert lifecycle, the temporal health-state API, offline BM25 search with a
citation-preserving assistant fallback, a versioned REST API (OpenAPI), and
a React dashboard that only displays what the API returns — validated by
16 API e2e tests and 7 app-integration tests against the live backend
(heart_rate 62 → 108 across demo days 1→124, vigilance green → amber → red).

Known limitations, stated as facts: clinical thresholds are
illustrative/provisional and not clinically validated; astronaut physiology
in the demo is synthetic; analog-data import and an automated source-refresh
pipeline are not yet built; voice and vision run in the Colab notebook and
are not yet integrated into the API. See
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
