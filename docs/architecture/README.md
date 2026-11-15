# IRCO Backend Architecture

## Design Decision: Modular Monolith

IRCO is a **modular monolith** — a single Rust binary with clearly separated internal crates, plus Python workers for data acquisition and knowledge preparation.

### Why not microservices?
- Single VPS with 11 Gi RAM, 8.7 GB free disk
- No Kubernetes, no container orchestrator
- Simpler deployment, testing, and debugging
- All modules share SQLite — no distributed state

### Why not all-Python?
- Health analysis runs continuously — Rust gives predictable latency and low memory
- Decision engine must be deterministic and auditable — Rust's type system enforces this
- SQLite access from a single compiled binary avoids lock contention

### Why not all-Rust?
- Data acquisition is one-shot, network-heavy — Python's `requests` library is pragmatic
- PDF/HTML extraction has mature Python libraries
- Colab notebook is Python — keeping the knowledge pipeline in Python simplifies integration

---

## Crate Dependency Graph

```
irco-core (types, config, errors)
  ├── irco-data (storage, ingestion, queries)
  │     ├── irco-health (analysis engine)
  │     │     └── irco-decisions (rules, vigilance)
  │     │           └── irco-alerts (lifecycle, followup, audit)
  │     └── irco-knowledge (BM25, corpus, citations)
  │           └── irco-ai (model relay, explain, gateway)
  └── irco-api (Axum server, routes, middleware)
            └── depends on ALL above
```

---

## Data Flow

```
External Sources                Python Pipeline               Rust Engine
─────────────────              ──────────────                ───────────
NASA EDA ──┐                                                
NOAA SWPC ─┤                                                
PhysioNet ─┤──→ collectors/ ──→ normalizers/ ──→ observations.jsonl
UCI ───────┤                                                     │
CELSS ─────┘                                                     │
                                                                 ▼
Synthetic A-01 ──→ generators/ ─────────────────→ POST /ingest ──→ SQLite
                                                                 │
                                                                 ▼
                                                    Health Analysis
                                                    ┌─────────────┐
                                                    │ Temporal     │
                                                    │ Baseline     │
                                                    │ Correlations │
                                                    │ Anomalies    │
                                                    │ Context      │
                                                    └──────┬──────┘
                                                           ▼
                                                    Decision Engine
                                                    ┌─────────────┐
                                                    │ Rules (JSON) │
                                                    │ Vigilance    │
                                                    │ Justification│
                                                    └──────┬──────┘
                                                           ▼
                                                    Alerts & Followup
                                                    ┌─────────────┐
                                                    │ Create      │
                                                    │ Acknowledge  │
                                                    │ Reassess     │
                                                    │ Escalate     │
                                                    │ Close        │
                                                    └──────┬──────┘
                                                           ▼
                                                    API Response
                                                    ┌─────────────┐
                                                    │ GET /state   │
                                                    │ GET /alerts  │
                                                    │ GET /report  │
                                                    └─────────────┘
```

---

## Storage Design

### SQLite Tables (initial schema)

```sql
-- Observations
CREATE TABLE observations (
    id TEXT PRIMARY KEY,
    timestamp TEXT NOT NULL,  -- ISO 8601 UTC
    subject_id TEXT,
    indicator TEXT NOT NULL,
    value REAL NOT NULL,
    unit TEXT NOT NULL,
    source TEXT NOT NULL,
    data_class TEXT NOT NULL CHECK (data_class IN ('measured_real', 'analog', 'synthetic')),
    context TEXT,             -- JSON
    provenance TEXT,          -- JSON
    quality TEXT,             -- JSON
    metadata TEXT,            -- JSON
    ingested_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX idx_obs_subject ON observations(subject_id);
CREATE INDEX idx_obs_indicator ON observations(indicator);
CREATE INDEX idx_obs_timestamp ON observations(timestamp);
CREATE INDEX idx_obs_source ON observations(source);
CREATE INDEX idx_obs_data_class ON observations(data_class);
CREATE INDEX idx_obs_subject_indicator_time ON observations(subject_id, indicator, timestamp);

-- Alerts
CREATE TABLE alerts (
    id TEXT PRIMARY KEY,
    created_at TEXT NOT NULL,
    subject_id TEXT NOT NULL,
    vigilance TEXT NOT NULL CHECK (vigilance IN ('green', 'amber', 'red', 'no_data')),
    state TEXT NOT NULL CHECK (state IN ('created', 'acknowledged', 'in_progress', 'reassessed', 'closed', 'escalated')),
    rules_triggered TEXT,     -- JSON array
    data_class TEXT NOT NULL,
    justification TEXT NOT NULL,
    suggested_action TEXT,
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX idx_alerts_subject ON alerts(subject_id);
CREATE INDEX idx_alerts_state ON alerts(state);
CREATE INDEX idx_alerts_vigilance ON alerts(vigilance);

-- Alert events (audit trail)
CREATE TABLE alert_events (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    alert_id TEXT NOT NULL REFERENCES alerts(id),
    timestamp TEXT NOT NULL DEFAULT (datetime('now')),
    action TEXT NOT NULL,
    detail TEXT,
    actor TEXT DEFAULT 'system'
);

CREATE INDEX idx_alert_events_alert ON alert_events(alert_id);

-- Baselines (individual reference values)
CREATE TABLE baselines (
    subject_id TEXT NOT NULL,
    indicator TEXT NOT NULL,
    baseline_value REAL NOT NULL,
    computed_from INTEGER NOT NULL,  -- number of observations used
    first_observation TEXT NOT NULL,
    last_observation TEXT NOT NULL,
    updated_at TEXT NOT NULL DEFAULT (datetime('now')),
    PRIMARY KEY (subject_id, indicator)
);

-- Manifests (data acquisition records)
CREATE TABLE manifests (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    source TEXT NOT NULL,
    url TEXT,
    local_path TEXT,
    download_date TEXT NOT NULL,
    http_status INTEGER,
    file_size_bytes INTEGER,
    sha256 TEXT,
    license TEXT,
    error TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Knowledge corpus
CREATE TABLE corpus (
    id TEXT PRIMARY KEY,
    title TEXT NOT NULL,
    source TEXT NOT NULL,
    section TEXT,
    url TEXT,
    content TEXT NOT NULL,
    hazard TEXT,
    indicators_related TEXT,  -- JSON array
    organ_systems TEXT,       -- JSON array
    extraction_date TEXT,
    confidence TEXT
);

CREATE INDEX idx_corpus_hazard ON corpus(hazard);
CREATE INDEX idx_corpus_source ON corpus(source);
```

---

## Configuration Files

| File | Purpose |
|------|---------|
| `config/app.toml` | Server host/port, log level, DB path, limits |
| `config/sources.toml` | Data source URLs, timeouts, retry config |
| `config/indicators/registry.toml` | Indicator definitions (loaded at runtime) |
| `rules/rules.json` | Decision rules (loaded at runtime, no recompile) |

---

## Build & Deploy

### Build constraints (908 MB RAM available + 16 GB swap)

```bash
# Safe build command
CARGO_BUILD_JOBS=2 cargo build --release

# If OOM during linking, try:
CARGO_BUILD_JOBS=1 cargo build --release

# Alternative: cross-compile on a dev machine and scp the binary
```

### Run

```bash
# Direct
RUST_LOG=info ./target/release/irco-api

# With systemd (production)
sudo cp scripts/irco.service /etc/systemd/system/
sudo systemctl enable --now irco
```

### Port allocation

| Port | Service |
|------|---------|
| 3080 | IRCO API |
| 5000 | (existing, do not touch) |
| 4173 | (existing, do not touch) |
| 8443 | (existing, do not touch) |
