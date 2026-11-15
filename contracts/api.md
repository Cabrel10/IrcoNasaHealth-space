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
| GET | `/api/v1/state` |
| GET | `/api/v1/state/{subject_id}` |
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

### `GET /api/v1/sources`

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

### `GET /api/v1/manifests`

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

### `GET /api/v1/provenance/{observation_id}`

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

### `GET /api/v1/indicator/{indicator_name}`

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

### `GET /api/v1/alerts/{alert_id}`

Full alert detail including event history.

---

### `POST /api/v1/alerts/{alert_id}/acknowledge`

Acknowledge an alert. Transitions state from `created` to `acknowledged`.

---

### `POST /api/v1/alerts/{alert_id}/action`

Record an action taken on an alert.

**Request:**
```json
{
  "action": "reassessment_requested",
  "detail": "Crew member asked to re-measure heart rate at rest."
}
```

---

### `POST /api/v1/alerts/{alert_id}/close`

Close an alert with a resolution.

**Request:**
```json
{
  "resolution": "Values returned to baseline after rest period.",
  "final_vigilance": "green"
}
```

---

### `POST /api/v1/followup/evaluate`

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

### `GET /api/v1/report/{subject_id}`

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

### `GET /api/v1/knowledge/sources`

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

### `POST /api/v1/assistant/explain`

Request an explanation of a specific alert or health state.

**Request:**
```json
{
  "alert_id": "alert-001"
}
```

---

### `POST /api/v1/multimodal/transcription`

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

### `POST /api/v1/multimodal/vision`

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

### `POST /api/v1/multimodal/speech`

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
