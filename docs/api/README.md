# IRCO API documentation

`openapi.yaml` and `openapi.json` describe the currently implemented subset.
`contracts/api.md` is the larger planned contract and is not fully implemented;
do not treat its unimplemented routes as available.

Implemented routes include:

- System: `GET /health`, `GET /version`, `GET /openapi.json`
- Registry/state: `GET /api/v1/rules`, `POST /api/v1/admin/rules/reload`,
  `GET /api/v1/indicators`,
  `GET /api/v1/indicators/{indicator_id}`,
  `GET /api/v1/state?data_class=...`,
  `GET /api/v1/state/{subject_id}?data_class=...`
- Data: `POST /api/v1/ingest`, `GET /api/v1/observations`,
  `GET /api/v1/observations/export`
- Alerts: `GET /api/v1/alerts`, `PATCH /api/v1/alerts/{alert_id}`,
  `POST /api/v1/alerts/{alert_id}/followup`
- Knowledge: `GET /search`, `POST /assistant`, `GET /knowledge/health`,
  `GET /knowledge/hazards`, `GET /knowledge/indicator/{indicator_id}`
- Offline demo: `GET /demo/scenarios`, `GET /demo/replay`,
  `GET /demo/scenario`, `POST /demo/reset`

When `IRCO_API_TOKEN` is configured, every route except `/health`, `/version`
and `/openapi.json` requires a bearer token. API responses never expose
configured credentials. Observation and alert `data_class` values remain
explicit; they are not merged.
Both state routes require an explicit `data_class` query parameter; the overview
returns an empty `subjects` list when no observations exist in that class.
Rule reload validates the entire file before swapping it; invalid changes leave
the active ruleset untouched.

See [`../DEMO.md`](../DEMO.md) for a reproducible offline backend walkthrough
and curl examples.
