# IRCO Backend API Contract v0

> **Status:** Draft — version 0.1.0  
> **Server:** Rust / Axum on port 3080  
> **Format:** JSON by default; observation exports may be CSV or JSONL.  
> **Authentication:** Optional bearer token via `IRCO_API_TOKEN`; when set, all
> routes except public health/version/OpenAPI and the separately authenticated
> Colab registration/heartbeat routes require it.

---

## Base URL

```
http://localhost:3080/api/v1
```

---

## Implemented API v0.1 routes

The following inventory is the implemented surface, distinct from the planned
routes later in this draft. Business routes are versioned under `/api/v1`;
`/health`, `/version`, and `/openapi.json` are root-level service endpoints.
`docs/api/openapi.yaml` describes their request and response schemas.

| Method | Path |
|---|---|
| GET | `/health` |
| GET | `/version` |
| GET | `/openapi.json` |
| GET | `/api/v1/health` |
| GET | `/api/v1/rules` |
| POST | `/api/v1/admin/rules/reload` |
| POST | `/api/v1/admin/colab/register` |
| DELETE | `/api/v1/admin/colab/register` |
| POST | `/api/v1/admin/colab/heartbeat` |
| GET | `/api/v1/colab/status` |
| GET | `/api/v1/colab/capabilities` |
| GET | `/api/v1/indicators` |
| GET | `/api/v1/indicators/{indicator_id}` |
| GET | `/api/v1/indicators/{indicator_id}/history` |
| GET | `/api/v1/state` |
| GET | `/api/v1/state/{subject_id}` |
| GET | `/api/v1/dashboard` |
| GET | `/api/v1/dashboard/events` |
| GET | `/api/v1/mission` |
| GET | `/api/v1/routine` |
| POST | `/api/v1/routine/done` |
| POST | `/api/v1/checkin` |
| GET | `/api/v1/observations` |
| GET | `/api/v1/observations/export` |
| POST | `/api/v1/ingest` |
| GET | `/api/v1/alerts` |
| PATCH | `/api/v1/alerts/{alert_id}` |
| POST | `/api/v1/alerts/{alert_id}/followup` |
| GET | `/api/v1/knowledge/search` |
| POST | `/api/v1/assistant/chat` |
| GET | `/api/v1/knowledge/health` |
| GET | `/api/v1/knowledge/hazards` |
| GET | `/api/v1/knowledge/indicator/{indicator_id}` |
| GET | `/api/v1/demo/scenarios` |
| GET | `/api/v1/demo/replay` |
| GET | `/api/v1/demo/scenario` |
| POST | `/api/v1/demo/reset` |

Colab registration additionally requires `IRCO_COLAB_ADMIN_TOKEN`; when
`IRCO_API_TOKEN` is configured, both tokens are required for registration and
revocation. The heartbeat uses the one-time session token returned during
registration. Runtime status omits the upstream URL and API key.

---

## 1. System

### `GET /health`

Health check endpoint. Always available.

**Response 200:**
```json
{
  "status": "ok",
  "version": "0.1.0",
  "uptime_seconds": 3600,
  "database": "connected",
  "rules_loaded": 12,
  "indicators_loaded": 24,
  "ai_available": false,
  "colab_available": false,
  "knowledge_available": true
}
```

---

### Colab runtime registration and status

When the existing heartbeat registry is configured, it is the source of truth
for Colab availability and the active runtime URL. IRCO reads
`IRCO_COLAB_REGISTRY_URL` (default
`http://127.0.0.1:8765/api/backends/internal`) with
`X-Internal-Token: <IRCO_COLAB_REGISTRY_TOKEN>`; `HB_SECRET` is accepted as a
fallback for the token setting. Registry access has a two-second timeout.
`IRCO_COLAB_TTL_SECONDS` controls the accepted heartbeat age
(30–3600 seconds, default 600). A stale, missing, malformed, or inaccessible
registry results in `colab_available: false` and local assistant fallback.

The older direct registration routes remain for compatibility when the
heartbeat registry is not configured. Registration replaces any current
in-memory session and returns a new session ID and heartbeat token; the old
token cannot refresh the replacement session. A process restart clears this
legacy registration and requires a new one.

`POST /api/v1/admin/colab/register` requires `IRCO_COLAB_ADMIN_TOKEN` and JSON:
```json
{
  "api_base": "https://colab.example/v1",
  "api_key": "runtime-key",
  "model": "qwen-instruct",
  "capabilities": {
    "chat": true,
    "asr": false,
    "tts": false,
    "vision": false,
    "vlm": false,
    "image": false,
    "multi": false,
    "streaming": true
  }
}
```

The `api_key` is stored only in process memory and is never returned by status
or capability endpoints. The registration response contains a bearer
`heartbeat_token`; send it to `POST /api/v1/admin/colab/heartbeat` together
with `session_id`. A heartbeat may update the URL, model, key, and capabilities.
An expired, revoked, or replaced session cannot be revived with an old token.
`DELETE /api/v1/admin/colab/register` revokes the active session.

`GET /api/v1/colab/status` and `GET /api/v1/colab/capabilities` expose current
liveness, model, enabled modules, and remaining TTL, but not the tunnel URL or
credentials. `/health` reports the same TTL-based liveness in
`colab_available` and `ai_available`. With the existing heartbeat registry,
availability follows that service's active backend and TTL rather than an
IRCO-owned in-memory registration. Chat requests use the active runtime's
`/v1/chat/completions` route with a 15-second timeout; streaming and
multimodal routes are not relayed.

---

### `GET /api/v1/rules`

Return the currently active validated deterministic ruleset.

### `POST /api/v1/admin/rules/reload`

Reload the configured rules file (`IRCO_RULES_PATH`, default
`rules/rules.json`) without restarting the API. The new document is
semantically validated before an atomic swap. An invalid or unreadable file
returns the standard error envelope and leaves the active rules unchanged.

**Response 200:**
```json
{ "version": "0.1.0", "rules_loaded": 12 }
```

---

## 2. Data Platform (Partie 1)

### `POST /api/v1/ingest`

Ingest one or more observations from the Python pipeline.

**Request:**
```json
{
  "observations": [
    {
      "id": "iss-rr1-000001",
      "timestamp": "2014-09-20T03:59:00Z",
      "subject_id": null,
      "indicator": "temperature_iss",
      "value": 24.1,
      "unit": "degC",
      "source": "NASA_OSDR_EDA",
      "data_class": "measured_real",
      "context": { "mission": "RR-1", "environment": "ISS_cabin" },
      "provenance": { "dataset": "RR-1", "sha256": "abc...def" }
    }
  ],
  "validate": true,
  "reject_on_error": false
}
```

**Response 200:**
```json
{
  "accepted": 1,
  "rejected": 0,
  "errors": [],
  "duplicates_skipped": 0,
  "alerts_created": 0
}
```

`alerts_created` counts new persisted alerts produced by enabled deterministic
rules for observations whose quality status is `valid`. Replaying an identical
batch does not create duplicate alerts. Observations with missing or non-valid
quality are stored but do not trigger rules.

**Response 400:** Schema validation failure  
**Response 422:** Business rule violation (e.g., unknown indicator, invalid data_class)

---

### `GET /api/v1/observations`

Query observations with filters and pagination.

**Query parameters:**

| Param | Type | Description |
|-------|------|-------------|
| `subject_id` | string | Filter by subject |
| `indicator` | string | Filter by indicator name |
| `source` | string | Filter by source |
| `data_class` | string | Filter by data class |
| `from` | datetime | Start of time range (inclusive) |
| `to` | datetime | End of time range (inclusive) |
| `limit` | integer | Max results (default 100, max 10000) |
| `offset` | integer | Pagination offset |
| `order` | string | `asc` or `desc` by timestamp |

**Response 200:**
```json
{
  "total": 5400,
  "limit": 100,
  "offset": 0,
  "observations": [ ... ]
}
```

---

### `GET /api/v1/observations/export`

Export observations as CSV or JSONL.

**Query parameters:** Same as `/observations` plus `format=csv|jsonl`

**Response 200:** Streaming response with appropriate Content-Type.

---

### `GET /api/v1/sources` — planned, not implemented

List all ingested data sources with their status.

**Response 200:**
```json
{
  "sources": [
    {
      "name": "NASA_OSDR_EDA",
      "data_class": "measured_real",
      "observation_count": 12450,
      "first_timestamp": "2014-09-20T03:59:00Z",
      "last_timestamp": "2014-10-22T18:00:00Z",
      "indicators": ["temperature_iss", "humidity_iss", "co2_cabin"],
      "license": "public_domain"
    }
  ]
}
```

---

### `GET /api/v1/manifests` — planned, not implemented

List data acquisition manifests.

**Response 200:**
```json
{
  "manifests": [
    {
      "source": "NASA_OSDR_EDA",
      "download_url": "https://...",
      "download_date": "2026-11-14T22:00:00Z",
      "file_size_bytes": 706969,
      "sha256": "abc...def",
      "http_status": 200,
      "license": "public_domain"
    }
  ]
}
```

---

### `GET /api/v1/provenance/{observation_id}` — planned, not implemented

Trace an observation back to its raw source.

**Response 200:**
```json
{
  "observation_id": "iss-rr1-000001",
  "source": "NASA_OSDR_EDA",
  "data_class": "measured_real",
  "provenance": {
    "dataset": "RR-1",
    "original_file": "data/raw/eda_rr1_dashboard.json",
    "original_record": "temperature_iss[0]",
    "sha256": "abc...def",
    "download_url": "https://visualization.osdr.nasa.gov/eda/dashboard_RR-1",
    "download_date": "2026-11-14T22:00:00Z",
    "license": "public_domain"
  }
}
```

---

## 3. Health Intelligence (Partie 2)

### `GET /api/v1/dashboard`

Returns a live snapshot from persisted observations by default. Each request
reads the latest stored values; the frontend can listen to
`GET /api/v1/dashboard/events` for ingestion notifications and refetch the
snapshot. The service never invents or interpolates real measurements. Choose
`mode=demo` (or provide `day`/`scenario`) for a deterministic synthetic replay.
Demo data is explicitly labelled and is not mixed with measured data.

The dashboard returns all registered indicators with latest value, bounded
history, personal baseline when sufficient valid samples exist, data quality,
and freshness. Missing or stale inputs remain explicit. `quality` describes
the measurement; `data_class` identifies its provenance. Reference ranges
retain their registry status and are not diagnostic cutoffs. The demo mission
context is illustrative and is not used in real mode.

**Query parameters:** `subject` or `subject_id` (default `A-01`),
`mode=real|demo` (default `real`), `data_class` (default `measured_real` in
real mode, `synthetic` in demo mode), `scenario=a01|nominal|dropout`,
`day=1..124`, or `as_of` (UTC timestamp in real mode).

**Response 200:**
```json
{
  "mode": "demo",
  "subject_id": "A-01",
  "data_class": "synthetic",
  "mission": {
    "mission_id": "IRCO-DEMO",
    "mission_day": 1,
    "environment": "deep_space",
    "earth_delay_min": 12,
    "mode": "autonomous",
    "simulated": true
  },
  "global": {
    "level": "green",
    "confidence": "low_synthetic",
    "badges": ["simulated"]
  },
  "indicators": [
    {
      "id": "heart_rate",
      "value": 62,
      "unit": "bpm",
      "last_updated": "2026-01-01T06:00:00Z",
      "trend": "insufficient_data",
      "quality": "synthetic",
      "measurement_quality": "valid",
      "data_class": "synthetic",
      "status": "fresh",
      "data_status": "fresh",
      "source": "SYNTHETIC_A01",
      "spark": [62],
      "history": [
        { "timestamp": "2026-01-01T06:00:00Z", "value": 62, "quality": "valid" }
      ],
      "baseline": null,
      "threshold_status": "provisional",
      "thresholds": { "reference_min": 40, "reference_max": 120 }
    },
    {
      "id": "co2_cabin",
      "value": null,
      "unit": "ppm",
      "last_updated": null,
      "trend": "no_data",
      "quality": "synthetic",
      "measurement_quality": "no_data",
      "data_class": "synthetic",
      "status": "no_data",
      "data_status": "no_data",
      "source": null,
      "spark": [],
      "baseline": null,
      "threshold_status": "provisional",
      "thresholds": { "reference_min": 0.0, "reference_max": 5000.0 }
    }
  ],
  "active_alerts": [],
  "triggered_rules": [],
  "anomalies": {
    "available": false,
    "items": [],
    "reason": "No validated anomaly detector is configured."
  },
  "clinical_assessment": {
    "available": false,
    "diagnoses": [],
    "reason": "IRCO does not diagnose diseases."
  },
  "hazards": [
    { "id": "radiation", "level": "no_data", "indicators": [] },
    { "id": "isolation", "level": "no_data", "indicators": [] },
    { "id": "hostile_environment", "level": "no_data", "indicators": [] },
    { "id": "distance_from_earth", "level": "no_data", "indicators": [] },
    { "id": "altered_gravity", "level": "no_data", "indicators": [] }
  ],
  "routine": { "subject_id": "A-01", "date": "2026-01-01", "tasks": [], "progress": { "completed": 0, "total": 4, "percentage": 0 } },
  "data_quality": {
    "data_class": "synthetic",
    "valid": 3,
    "suspect": 0,
    "no_data": 15
  },
  "services": { "engine": "ok", "ai": "offline", "knowledge": "ok" },
  "last_updated": "2026-01-01T06:00:00Z"
}
```

`active_alerts` can contain a simulated, non-persisted rule evaluation in demo
mode. It is not a persisted crew alert. Alerts are deterministic rule outputs,
not diagnoses. Disease diagnosis is deliberately unavailable; clinical
decision-support rules require validated evidence before they can be enabled.
Anomalies are explicitly unavailable until a validated detector is implemented.

### `GET /api/v1/dashboard/events`

Server-Sent Events stream. A successful observation ingestion emits
`observations_updated` with the subject, data class, timestamp, and changed
indicator IDs. Clients should refetch the dashboard snapshot after receiving
the event. If the bounded stream buffer overflows, `resync_required` instructs
the client to refetch.

**Query parameters:** `subject_id` and `data_class` (required).

---

### `GET /api/v1/mission`

Mission metadata.

**Response 200:**
```json
{
  "mission_id": "IRCO-DEMO",
  "name": "Integrated Risk and Countermeasure Observatory Demo Mission",
  "start_date": "2026-01-01T00:00:00Z",
  "duration_days": 124,
  "crew_size": 1,
  "subject_id": "A-01",
  "environment": "deep_space",
  "earth_delay_min": 12,
  "simulated": true
}
```

---

### `GET /api/v1/routine`

Daily routine tasks for a subject.

**Query parameters:** `subject_id` (default: `A-01`), `date` (YYYY-MM-DD, default: today)

**Response 200:**
```json
{
  "subject_id": "A-01",
  "date": "2026-01-15",
  "tasks": [
    {
      "id": "morning-vitals",
      "name": "Morning Vitals Check",
      "category": "health",
      "due_time": "08:00",
      "completed": false,
      "priority": "high"
    },
    {
      "id": "exercise-cardio",
      "name": "Cardiovascular Exercise",
      "category": "exercise",
      "duration_min": 30,
      "due_time": "10:00",
      "completed": false,
      "priority": "high"
    }
  ],
  "progress": {
    "completed": 0,
    "total": 4,
    "percentage": 0
  }
}
```

---

### `POST /api/v1/routine/done`

Mark a routine task as completed.

**Request:**
```json
{
  "subject_id": "A-01",
  "task_id": "morning-vitals",
  "completed_at": "2026-01-15T08:05:00Z"
}
```

**Response 200:**
```json
{
  "subject_id": "A-01",
  "task_id": "morning-vitals",
  "completed_at": "2026-01-15T08:05:00Z",
  "date": "2026-01-15",
  "status": "completed"
}
```

Completion is persisted by subject, task, and UTC date. Repeating the request
updates the stored completion timestamp without creating duplicate progress.

---

### `POST /api/v1/checkin`

Submit a single indicator measurement with unit validation.

**Request:**
```json
{
  "subject_id": "A-01",
  "indicator": "heart_rate",
  "value": 72.0,
  "unit": "bpm",
  "timestamp": "2026-01-15T08:00:00Z"
}
```

**Response 200:**
```json
{
  "subject_id": "A-01",
  "indicator": "heart_rate",
  "value": 72.0,
  "unit": "bpm",
  "timestamp": "2026-01-15T08:00:00Z",
  "data_class": "measured_real",
  "quality": { "status": "valid", "flags": [], "original_resolution": "manual" },
  "status": "accepted",
  "persisted": true,
  "alerts_created": 0,
  "notice": "Decision support only; this observation does not establish a diagnosis."
}
```

The handler uses the standard observation-ingestion and alert-evaluation path.
It accepts a registry-approved manual unit/source, writes the observation to
SQLite, and emits a dashboard update. Reference ranges are descriptive until
validated; an out-of-reference observation is not rejected or called a disease.

**Errors:**
- `400 unit_mismatch` — submitted unit does not match registry
- `404 indicator_not_found` — indicator not in registry
- `503 indicator_registry_unavailable` — registry not loaded

---

### `GET /api/v1/state`

Current health state for subjects with observations in one explicitly selected
data class. The endpoint never combines measured, analog, and synthetic records.

**Query parameters:** `data_class` (required; `measured_real`, `analog`, or
`synthetic`) and `as_of` (optional UTC evaluation timestamp; defaults to now).

**Response 200:**
```json
{
  "data_class": "synthetic",
  "subjects": [
    {
      "subject_id": "A-01",
      "data_class": "synthetic",
      "as_of": "2026-01-15T08:00:00Z",
      "vigilance": "green",
      "supported_vigilance": "green",
      "last_updated": "2026-01-15T08:00:00Z",
      "indicators": {
        "heart_rate": {
          "latest": 88,
          "unit": "bpm",
          "last_updated": "2026-01-15T08:00:00Z",
          "trend": "rising",
          "slope_per_day": 1.2,
          "quality": "valid",
          "source": "SYNTHETIC_A01",
          "data_status": "fresh"
        }
      },
      "missing_indicators": [],
      "triggered_rules": [],
      "alerts": [],
      "thresholds_status": "illustrative",
      "skipped_rules": [],
      "history_truncated": false
    }
  ]
}
```

`as_of` is an optional RFC 3339 timestamp used to evaluate freshness without
mutating stored observations. Each indicator reports `data_status` as `fresh`,
`stale`, or `invalid`; `missing_indicators` includes configured missing-data
indicators with no prior valid measurement or a stale series. `no_data` means no
valid current measurement is available. `supported_vigilance` is computed by
deterministic rules; `triggered_rules` can include configured composites of
rule IDs that triggered for this same subject and data class. Skipped rules are
listed separately. These are decision-support outputs, not diagnoses.

---

### `GET /api/v1/state/{subject_id}`

Detailed state for a specific subject. Accepts the same required `data_class`
and optional UTC `as_of` query parameters as the overview endpoint.

---

### `GET /api/v1/indicators/{indicator_id}/history`

Historical time series with baseline, trend, and thresholds for a single indicator.

**Path parameters:** `indicator_id` (e.g., `heart_rate`, `radiation_dose_daily`)

**Query parameters:**
- `subject` or `subject_id` or `scenario` (default: `A-01`)
- `data_class` (required: `measured_real`, `analog`, or `synthetic`)
- `days` (default: 30, max: 365)
- `as_of` (optional ISO 8601 UTC timestamp)
- `day` (optional mission day for demo scenarios)

**Response 200:**
```json
{
  "subject_id": "A-01",
  "indicator": "heart_rate",
  "unit": "bpm",
  "data_class": "synthetic",
  "period": {
    "from": "2026-01-01T00:00:00Z",
    "to": "2026-01-30T23:59:59Z"
  },
  "measurements": [
    { "timestamp": "2026-01-01T08:00:00Z", "value": 72.0, "quality": "valid", "source": "demo_a01" },
    { "timestamp": "2026-01-02T08:00:00Z", "value": 74.0, "quality": "valid", "source": "demo_a01" }
  ],
  "baseline": {
    "mean": 68.5,
    "median": 67.0,
    "standard_deviation": 4.2,
    "sample_count": 30
  },
  "trend": {
    "direction": "stable",
    "slope_per_day": 0.02,
    "minimum": 62.0,
    "maximum": 78.0,
    "mean": 68.5
  },
  "thresholds": {
    "reference_min": 40.0,
    "reference_max": 120.0,
    "reference_source": "Standard clinical range",
    "status": "provisional"
  },
  "data_quality": {
    "valid": 28,
    "suspect": 2,
    "total": 30
  }
}
```

**Errors:**
- `404 indicator_not_found` — indicator not in registry
- `400 data_class_required` — missing or invalid `data_class`
- `503 indicator_registry_unavailable` — registry not loaded

---

### `GET /api/v1/indicator/{indicator_name}` — planned, not implemented

Indicator definition and current values across all subjects.

**Response 200:**
```json
{
  "indicator": {
    "id": "heart_rate",
    "name": "Heart Rate",
    "family": "cardiovascular",
    "unit": "bpm",
    "reference_range": { "min": 40, "max": 120, "source": "illustrative", "status": "illustrative" },
    "active_rules": ["HR_THRESHOLD_001", "HR_TREND_002", "HR_PERSISTENT_003"],
    "subjects": {
      "A-01": {
        "latest": 88,
        "baseline": 65,
        "trend": "rising",
        "vigilance": "amber"
      }
    }
  }
}
```

---

### `GET /api/v1/alerts`

List alerts with optional filters.

**Query parameters:** `subject_id`, `vigilance`, `state`, `from`, `to`, `limit`, `offset`

**Response 200:**
```json
{
  "total": 5,
  "alerts": [
    {
      "id": "alert-001",
      "created_at": "2026-01-15T06:00:00Z",
      "subject_id": "A-01",
      "vigilance": "amber",
      "state": "created",
      "rules_triggered": ["HR_TREND_002"],
      "data_quality": "synthetic",
      "justification": "Heart rate trending upward at 2.3 bpm/day over 7 days (baseline: 65 bpm).",
      "suggested_action": "request_reassessment"
    }
  ]
}
```

---

### `GET /api/v1/alerts/{alert_id}` — planned, not implemented

Full alert detail including event history.

---

### `POST /api/v1/alerts/{alert_id}/acknowledge` — planned, not implemented

Acknowledge an alert. Transitions state from `created` to `acknowledged`.

---

### `POST /api/v1/alerts/{alert_id}/action` — planned, not implemented

Record an action taken on an alert.

**Request:**
```json
{
  "action": "reassessment_requested",
  "detail": "Crew member asked to re-measure heart rate at rest."
}
```

---

### `POST /api/v1/alerts/{alert_id}/close` — planned, not implemented

Close an alert with a resolution.

**Request:**
```json
{
  "resolution": "Values returned to baseline after rest period.",
  "final_vigilance": "green"
}
```

---

### `POST /api/v1/followup/evaluate` — planned, not implemented

Trigger a follow-up evaluation for a subject. Re-runs the analysis and decision engine.

**Request:**
```json
{
  "subject_id": "A-01"
}
```

**Response 200:**
```json
{
  "subject_id": "A-01",
  "previous_vigilance": "amber",
  "current_vigilance": "amber",
  "alerts_created": 0,
  "alerts_updated": 1,
  "alerts_closed": 0,
  "rules_evaluated": 12,
  "rules_triggered": ["HR_TREND_002"]
}
```

---

### `GET /api/v1/report/{subject_id}` — planned, not implemented

Generate a structured health report for a subject.

**Query parameters:** `from`, `to`, `format=json|text`

**Response 200:**
```json
{
  "subject_id": "A-01",
  "period": { "from": "2026-01-01", "to": "2026-01-15" },
  "data_class": "synthetic",
  "vigilance_timeline": [
    { "date": "2026-01-01", "vigilance": "green" },
    { "date": "2026-01-10", "vigilance": "amber", "trigger": "HR_TREND_002" }
  ],
  "indicators": { ... },
  "alerts_summary": { "total": 2, "open": 1, "closed": 1 },
  "data_quality_summary": { "total_observations": 1860, "valid": 1850, "suspect": 10 }
}
```

---

## 4. Knowledge & AI (Partie 3)

### `GET /api/v1/knowledge/search`

BM25 search over the scientific knowledge base.

**Query parameters:** `q` (search query), `limit`, `hazard`, `indicator`

**Response 200:**
```json
{
  "available": true,
  "source_not_found": false,
  "hits": [
    {
      "score": 2.4,
      "evidence": "Curated summary of the source content.",
      "evidence_kind": "curated_summary",
      "citation": {
        "document_id": "nasa-hrp-hazards",
        "title": "NASA HRP Five Hazards",
        "publisher": "NASA",
        "url": "https://www.nasa.gov/hrp/",
        "section": "Radiation",
        "page_numbers": null,
        "document_date": null
      },
      "hazard": "radiation",
      "indicators_related": ["radiation_dose_daily"],
      "confidence": "curated_summary"
    }
  ]
}
```

---

### `GET /api/v1/knowledge/sources` — planned, not implemented

Planned; this endpoint is not implemented. Use `GET /api/v1/knowledge/health`
and `GET /api/v1/knowledge/search` in the current API.

**Response 200:**
```json
{
  "sources": [
    {
      "name": "NASA HRP Five Hazards",
      "url": "https://...",
      "sections": 24,
      "last_indexed": "2026-11-14T20:00:00Z"
    }
  ]
}
```

---

### `POST /api/v1/assistant/chat`

Find and cite relevant corpus evidence. When an active Colab chat session is
registered, relevant evidence may be sent to that OpenAI-compatible runtime;
otherwise the local extractive answer is used. Current health state is included
only when explicitly requested with both `subject_id` and `data_class`. The
assistant never modifies observations, rules, alerts, or vigilance.

**Request:**
```json
{
  "question": "What does NASA say about radiation?",
  "hazard": "radiation",
  "indicator": "radiation_dose_daily",
  "subject_id": "crew-01",
  "data_class": "synthetic"
}
```

`subject_id` and `data_class` must be supplied together. If present, the
deterministic state summary is sent to an active registered Colab runtime
alongside the retrieved evidence. It is not included in the local extractive
answer.

**Response 200:**
```json
{
  "answer": "The local scientific corpus contains this curated source summary: ...",
  "citations": [
    {
      "document_id": "csa-space-radiation-effects",
      "title": "How does radiation affect the human body in space?",
      "publisher": "Canadian Space Agency",
      "url": "https://www.asc-csa.gc.ca/eng/astronauts/space-medicine/radiation.asp",
      "section": "Space radiation exposure and monitoring",
      "page_numbers": null,
      "document_date": "2006-08-18"
    }
  ],
  "source_not_found": false,
  "disclaimer": "Decision support, not a diagnosis.",
  "provider": "extractive_fallback"
}
```

---

### `POST /api/v1/assistant/explain` — planned, not implemented

Request an explanation of a specific alert or health state.

**Request:**
```json
{
  "alert_id": "alert-001"
}
```

---

### `POST /api/v1/multimodal/transcription` — planned, not implemented

Transcribe audio to text (requires Colab or external ASR).

**Request:** `multipart/form-data` with audio file  
**Response 200:**
```json
{
  "text": "...",
  "language": "en",
  "duration_seconds": 12.5,
  "model": "whisper-v3"
}
```

**Response 503:** ASR service unavailable
```json
{
  "error": "asr_unavailable",
  "message": "Audio transcription service is not connected. Text input is available."
}
```

---

### `POST /api/v1/multimodal/vision` — planned, not implemented

Analyze an image with context (requires VLM).

**Request:** `multipart/form-data` with image + JSON context  
**Response 200:**
```json
{
  "description": "...",
  "observations_suggested": [ ... ],
  "model": "llava-v1.6",
  "confidence": "low",
  "note": "Visual observations are recorded as 'reported' and require verification."
}
```

**Response 503:** VLM service unavailable

---

### `POST /api/v1/multimodal/speech` — planned, not implemented

Generate speech from text (TTS).

**Request:**
```json
{
  "text": "Your heart rate has been trending upward over the past 7 days.",
  "language": "en"
}
```

**Response 200:** Audio stream (audio/wav or audio/mp3)  
**Response 503:** TTS service unavailable

---

## 5. Error Responses

All errors follow this format:

```json
{
  "error": "error_code",
  "message": "Human-readable description",
  "details": { ... }
}
```

**Standard codes:**

| HTTP | Code | Meaning |
|------|------|---------|
| 400 | `bad_request` | Malformed request |
| 404 | `not_found` | Resource not found |
| 422 | `validation_error` | Business rule violation |
| 429 | `rate_limited` | Too many requests |
| 500 | `internal_error` | Server error |
| 503 | `service_unavailable` | External dependency down (Colab, etc.) |

---

## 6. Non-negotiable API Rules

1. **Data class transparency:** Every response that contains observation data MUST include the `data_class` field. Synthetic data is NEVER presented as real.
2. **Graceful degradation:** If Colab/LLM is unavailable, endpoints return `fallback_used: true` with cached or rule-based responses. They NEVER return 503 for core health functions.
3. **Provenance traceability:** Any observation can be traced back to its source file via `/provenance/{id}`.
4. **No autonomous medical decisions by AI:** The LLM cannot create alerts, modify rules, or override the deterministic engine.
5. **Independent failure:** If one data source (e.g., NASA EDA) is down, all other endpoints continue working.
6. **Audit trail:** All alert state transitions are logged with timestamp and actor.

---

## 7. Versioning

- All endpoints are prefixed with `/api/v1`.
- Breaking changes increment the version.
- The `/health` endpoint is unversioned and always available.
