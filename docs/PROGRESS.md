# IRCO Development Progress

## Current status

**M0–M1 and a partial Rust API/engine are implemented. The backend is not
delivery-ready.** This report records implemented behavior, not the full
requested mission.

### Implemented

- Validated the four JSON schemas as Draft 7; checked rules and pivot fixtures.
- SQLite observation ingestion, idempotent exact replay, conflict rejection,
  indexed queries, temporal summaries, data-class filtering and CSV/JSONL
  exports.
- Deterministic absolute-threshold, explicit personal-baseline deviation and
  signed trend-slope rules, plus persistent deviation over a configured count
  of consecutive valid readings. Persistence requires an explicit nonzero
  `context.individual_baseline` and a direction (`above`, `below`, or `either`);
  both trend and persistence use one subject/class/indicator/unit and a bounded
  time window. Trigger evidence is retained in persistent, idempotent alerts.
  Missing or non-valid quality is insufficient evidence. The missing-data
  evaluator uses an explicit evaluation time, the latest prior valid sample,
  and a positive configured gap; without a valid prior sample it reports
  insufficient evidence rather than claiming the measurement is healthy.
- Persistent alert lifecycle and follow-up measurements. Valid rule triggers
  during ingestion produce persisted, idempotent alerts with rule validation
  status, source, data class and a non-diagnostic notice.
- Rust API for health/version, contracts/rules/indicators, ingest/history/export,
  temporal state, alert lifecycle, demo replay, BM25 search and extractive
  citation-aware assistant fallback.
- Added a current-health overview endpoint, `GET /api/v1/state?data_class=...`,
  returning one full health-state record per subject in that class. It requires
  an explicit class and never merges real, analog and synthetic timelines.
- Added numeric personal-baseline deviation evaluation and preflight semantic
  rule validation. `POST /api/v1/admin/rules/reload` atomically applies a valid
  rules file without restarting the server; invalid changes leave the active
  set untouched.
- Implemented persistent deviation as a temporal rule: consecutive valid
  samples are evaluated within a configured window, scoped to one subject,
  indicator, unit and data class, using an explicit baseline and deviation
  direction; a non-valid measurement breaks the qualifying streak. All
  currently enabled illustrative rules are restricted to
  synthetic data. The heart-rate missing-data rule is illustrative, enabled
  only for synthetic data, and uses a 36-hour demo freshness interval; composite
  rules remain disabled. A-01 now holds nominal values through day 94, then
  drifts to the specified day-124 values; configured evaluation transitions
  from green on day 1 to amber on day 97 and red on day 117.
- Integrated missing-data evaluation into the health-state API. `as_of` is an
  optional UTC query parameter for deterministic replay; indicator state now
  includes `data_status`, the response lists missing indicators and triggered
  rules, and state reads do not modify stored observations. Aggregate
  `no_data` now means no valid current measurement is available, rather than a
  skipped trend rule suppressing otherwise supported vigilance.
- Implemented deterministic `and`/`or` composite evaluation over configured
  rule IDs already triggered for one subject and data class. Rule validation
  rejects empty, duplicate, unknown, or nested composite references and invalid
  operators. The configured fatigue composite remains disabled because its
  illustrative relationship has not been validated; enabling it would not
  establish a medical correlation. Composite alert persistence during ingestion
  remains unimplemented.
- Demo replay now computes the requested day's vigilance and triggered rules
  through the active deterministic engine without persisting observations.
  The new A-01 timeline was tested through the HTTP replay endpoint at days 1,
  97, 117, and 124.
- Moved knowledge, assistant, and demo operations under `/api/v1` so the
  implemented business routes share one versioned prefix; health/version and
  OpenAPI remain root-level service endpoints. Updated the OpenAPI paths,
  walkthrough, and API route inventory together.
- Dashboard route audit: state overview, observation queries, alert lifecycle,
  demo replay, knowledge search, and citation-preserving assistant are
  implemented. Indicator trend/history with personal baseline and threshold
  metadata is not yet a single endpoint; dedicated decision-chain explanation,
  medical report, environment/radiation and mission context endpoints, SSE,
  Colab relay, image upload, static frontend hosting, and frozen demo bundle
  remain missing. CORS and standard JSON errors exist. Auth is optional, but
  when `IRCO_API_TOKEN` is configured browser requests need a trusted same-origin
  proxy; the token must not be embedded in frontend code.
- Documented the currently implemented API subset separately from the larger
  planned contract, and added an offline demo walkthrough with executable
  requests. The planned routes are not represented as implemented features.
- Clarified that a configured bearer token protects all routes except health,
  version and the OpenAPI document; synchronized the OpenAPI security metadata
  and verified protected demo access in an API test.
- Offline synthetic scenarios `a01`, `nominal` and `dropout`; they remain
  classified as synthetic.
- Bounded Python acquisition utility for NOAA SWPC, UCI MHEALTH and CELSS:
  retries transient errors, resumes byte ranges, caches downloads, computes
  SHA-256, enforces a run-wide byte cap and updates a versioned provenance
  manifest per source. Source classes and licenses are explicit.
- Acquired the real NOAA GOES X-ray and RTSW solar-wind feeds (4,591,811 and
  2,873,790 bytes); their raw files are preserved under `data/raw/`. Replaced
  the retired NOAA solar-wind endpoint after confirming its HTTP 404.
- Acquired the NASA OSDR RR-1 mission dashboard (706,969 bytes) using the
  per-mission dashboard fallback rather than `/eda/data_tables`. It supplies
  36,261 ISS temperature, humidity and CO₂ observations; timezone uncertainty
  is explicitly flagged, so they cannot trigger rules or trends. Radiation
  fields are deferred until units/period semantics are verified.
- Acquired the UCI MHEALTH raw archive (75,567,983 bytes) with its analog class
  and CC-BY-4.0 license in the manifest. Its per-sample timestamps are absent,
  so it is retained unmodified and not mapped to fabricated calendar times.
- Acquired the CELSS supplementary archive (945,025 bytes, CC BY 4.0) and
  recorded its SHA-256. Inspection found two JPEG figures and no machine-readable
  measurements; the archive is preserved as analog source material but is not
  converted into pivot observations.
- Added a provenance-preserving NOAA-to-pivot builder. It selected the GOES
  short band and active wind records, normalized UTC timestamps, retained row
  and SHA-256 provenance, and schema-validated each JSONL observation. Current
  NOAA feeds produced 11,506 measured-real observations and logged 3
  missing-speed rows without imputing them. Combined output contains 47,767
  observations; the rejection log also records deferred NASA series/fields.
- Added a streaming pivot importer with per-row schema validation, bounded
  batches, optional bearer token and idempotent retry behavior.
- OpenAPI YAML/JSON synchronization test and updated README limitations.

### Verification

- `CARGO_BUILD_JOBS=1 cargo test --manifest-path /home/ubuntu/webapp/nase/Cargo.toml --workspace` — 50 tests passed.
- `python3 tests/contracts_test.py` — 6 tests passed, including validation of the acquired manifest and all 47,767 normalized observations.
- `python3 tests/test_pivot_builder.py -v` — 3 tests passed.
- `python3 tests/test_import_pivot.py -v` — 3 tests passed.
- `cargo fmt --manifest-path /home/ubuntu/webapp/nase/Cargo.toml --all -- --check` — passed.
- `python3 tests/test_acquire_data.py -v` — 3 tests passed, including cache,
  resumable transfer, byte cap and permanent 404 handling.
- `python3 scripts/acquire_data.py --source noaa_xray --source noaa_solar_wind --max-mb 8` — both sources returned HTTP 200 with SHA-256 recorded.
- `python3 scripts/build_pivot.py` — accepted 47,767 pivot observations and logged 5 rejected/deferred source rows.
- `python3 scripts/import_pivot.py --dry-run --batch-size 100` — validated all 47,767 combined NASA/NOAA rows.
- End-to-end HTTP test on a temporary local SQLite database — imported 47,767 rows in 478 batches, retrieved NASA and NOAA samples with `data_class=measured_real`, confirmed suspect NASA timestamps do not create alerts, then confirmed persistence after API restart. Temporary database was removed.
- Earlier live API smoke test using a temporary SQLite database verified
  health, nine BM25 entries, and a CSA Radi-N2 citation through the then-root
  knowledge/search/assistant paths. Those business routes have since moved
  under `/api/v1`; the process and database were removed afterward.
- `CARGO_BUILD_JOBS=1 cargo clippy --manifest-path /home/ubuntu/webapp/nase/Cargo.toml --workspace --all-targets -- -D warnings` — passed after resolving two existing lint findings.
- A generic `unittest discover` from the unrelated shell working directory selected installed site-packages tests and failed due to their missing dependency; the repository's targeted contract test command passed.
- Previous verified rerun: Rust workspace tests (57), `cargo fmt --check` and workspace
  Clippy with `-D warnings` passed. Python contract/acquisition/pivot/import
  tests (16) passed; contract tests check the corpus and OpenAPI JSON/YAML synchronization
  and authentication metadata against the public routes.
- Latest missing-data integration verification: `cargo fmt --all -- --check`,
  all 63 Rust workspace tests, and workspace Clippy with `-D warnings` passed.
  `python3 tests/contracts_test.py -v` passed all 7 contract tests, including
  Draft 7 schema validation, rules/fixture validation, and OpenAPI YAML/JSON
  synchronization.
- Latest composite-rule verification: all 67 Rust workspace tests, workspace
  Clippy with `-D warnings`, formatting check, and all 7 contract tests passed.
- Latest dashboard corrections: 24 `irco-api` tests pass, including live HTTP
  replay assertions for A-01 green/amber/red at days 1/97/117 and final values
  on day 124. All 8 Python contract tests pass, including a new exact route
  inventory check across Axum, OpenAPI, and this contract.
- Rebuilt the pivot after adding the CELSS manifest entry: 47,767 observations
  accepted, 5 records rejected/deferred; offline importer dry-run validated all
  47,767 rows without sending batches.
- Current resource snapshot: 11 GiB RAM total, 2.3 GiB available, root
  filesystem 97% used with 7.0 GB free; project `target/` is 3.0 GB and `data/`
  is 121 MB. Keep build parallelism and downloads bounded.

### Remaining limitations

- `absolute_threshold`, `baseline_deviation`, `trend_slope` and
  `persistent_deviation` are evaluated, along with configured missing-data
  freshness checks and AND/OR composites in health-state reads. Automated
  follow-up across multiple measurements is incomplete.
- Rule engine does not yet form a full temporal health/vigilance profile.
- NASA EDA/BDAPI, MIMIC-IV, Sleep-EDF, MIT-BIH and UCI MHEALTH do not yet have
  complete source-specific import pipelines. The acquired CELSS archive has no
  machine-readable measurements to import. NOAA and the NASA RR-1 dashboard are
  converted to pivot data; analog physiology has not been imported, and no
  calibration set is available.
- Shipped a 9-entry curated NASA/CSA knowledge summary corpus for offline BM25
  retrieval, with source URLs, section locations, source-reported dates when
  available, and separate extraction timestamps. These are labeled curated
  summaries, not archived source documents or verbatim excerpts. Automated
  source refresh, citation-version checks and full corpus ingestion remain
  outstanding.
- Colab adapter, SSE, static hosting, frozen demo bundle, service/backup and
  resource/load testing remain outstanding.
- OpenAPI describes implemented routes but does not yet match every planned
  route in the long-form contract. There is no Git repository here, so commits
  cannot be created without changing the project's setup.
- All current thresholds and demo rules are illustrative/provisional, not
  validated medical thresholds or diagnostic guidance.

### Next

Continue with NASA OSDR/BDAPI and analog-data import pipelines. Add composite
alert persistence without inventing clinical thresholds.
Automate source refresh and version comparison for the curated corpus; implement
Colab only as an optional adapter after core operation remains independent.
