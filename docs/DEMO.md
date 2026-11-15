# IRCO offline/backend demonstration

This script exercises the currently implemented backend without Colab or an
LLM. Synthetic scenarios are explicitly marked `synthetic`; they are not
astronaut measurements. The NASA RR-1 and NOAA snapshots are marked
`measured_real`; NASA RR-1 timestamps are `suspect` until their timezone is
verified.

## Start the API

From the repository root:

```bash
CARGO_BUILD_JOBS=1 cargo run --bin irco-api
```

In another terminal:

```bash
curl -sS http://127.0.0.1:3080/health
curl -sS http://127.0.0.1:3080/openapi.json
curl -sS http://127.0.0.1:3080/demo/scenarios
```

If the server was started with `IRCO_API_TOKEN`, add
`-H "Authorization: Bearer $IRCO_API_TOKEN"` to every request except `/health`,
`/version` and `/openapi.json`.

## Drive the synthetic demo

Read day 1 and the final A-01 day. These endpoints are deterministic and do not
write to the observation store:

```bash
curl -sS 'http://127.0.0.1:3080/demo/replay?scenario=a01&day=1'
curl -sS 'http://127.0.0.1:3080/demo/replay?scenario=a01&day=124'
curl -sS 'http://127.0.0.1:3080/demo/scenario?name=nominal&day=124'
curl -sS 'http://127.0.0.1:3080/demo/scenario?name=dropout&day=22'
curl -sS -X POST 'http://127.0.0.1:3080/demo/reset?scenario=a01'
```

The A-01 endpoint ends at 108 bpm, 4.2 hours of sleep and fatigue 8/10 on day
124. The dropout scenario reports missing indicators without filling them.
The stored-observation engine supports absolute thresholds, numeric
`context.individual_baseline` deviations and signed trend-slope rules. Other
condition types remain explicitly unsupported.
Illustrative rules are not validated medical criteria, and these read-only
replay endpoints do not compute alert-level transitions.

## Import cached real observations

The raw source snapshots and the normalized observations are already present
after running the acquisition steps in `docs/data_sources/README.md`. Revalidate
the entire bundle, then ingest in bounded, idempotent API batches:

```bash
python3 scripts/build_pivot.py
python3 scripts/import_pivot.py --dry-run --batch-size 100
python3 scripts/import_pivot.py --api-url http://127.0.0.1:3080 --batch-size 100
curl -sS 'http://127.0.0.1:3080/api/v1/observations?source=NASA_OSDR_EDA&data_class=measured_real&limit=2'
curl -sS 'http://127.0.0.1:3080/api/v1/observations?source=NOAA_SWPC&data_class=measured_real&limit=2'
```

Set `IRCO_API_TOKEN` in the importing terminal if the server is configured with
`IRCO_API_TOKEN`. Do not put credentials in command-line arguments. A successful
batch response reports accepted rows, exact duplicates and newly created
deterministic alerts. Suspect or missing-quality measurements cannot trigger
rules.

## Knowledge/AI degraded mode

From the repository root, the default `data/corpus.jsonl` enables offline
search and citations. Setting `IRCO_CORPUS_PATH` to an unavailable path makes
knowledge health report the corpus unavailable; search/assistant return the
documented unavailable or source-not-found result. Data storage, deterministic
rules and scenario replay remain independent of knowledge and AI services.

```bash
curl -sS http://127.0.0.1:3080/knowledge/health
curl -sS 'http://127.0.0.1:3080/search?q=radiation&limit=3'
```

