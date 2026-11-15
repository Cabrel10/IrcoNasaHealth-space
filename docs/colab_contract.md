# Existing Colab heartbeat integration

IRCO reads the active runtime from the existing heartbeat registry. The
notebook continues sending heartbeats to that service; IRCO does not ask the
notebook to register a second session.

## Connection

- Heartbeat registry: `http://127.0.0.1:8765/api/backends/internal` by default.
- Override the URL with `IRCO_COLAB_REGISTRY_URL`.
- Set `IRCO_COLAB_REGISTRY_TOKEN` to the same value the existing bridge uses
  for its internal registry access. `HB_SECRET` is accepted as a fallback.
- The token is sent in `X-Internal-Token`; do not put its value in source,
  documentation, commands, or logs.
- Registry fetch timeout: 2 seconds. IRCO reads it for status and assistant
  requests; a failed fetch leaves Colab unavailable and uses the local answer.

The registry response needs an `active` account and a matching entry in
`backends`, with `api_base`, `api_key`, `model`, and `age_sec`. `session_id`
and `stale` are optional. IRCO uses only the active entry, and rejects it if
it is marked stale or its age exceeds `IRCO_COLAB_TTL_SECONDS` (default
600 seconds). This matches the running heartbeat service's 600-second stale
window. The existing registry remains the source of truth when its URL and
token are configured. The older IRCO registration endpoints remain available
for compatibility only when the heartbeat registry is not configured.

## Chat relay

The current relay supports text chat only:

- IRCO sends `POST /v1/chat/completions` to the active runtime's `api_base`.
- It sends `Authorization: Bearer <api_key>` and a standard OpenAI-compatible
  JSON body containing `model`, `messages`, and generation settings.
- The assistant uses up to five relevant local knowledge passages, requires
  valid `[S1]`-style citations, and falls back to the local extractive answer
  on missing/stale registry data, network errors, provider errors, or invalid
  citations. The request timeout is 15 seconds.
- Colab does not update IRCO observations, rules, alerts, or vigilance.
- `/v1/multi`, audio, vision, VLM, and SSE are not relayed by this integration.

`GET /api/v1/colab/status` reports the active model and chat availability
without exposing the runtime URL or API key. `/health` reflects the same
availability. The actual chat API remains on the configured IRCO API port
(`IRCO_PORT`, default `3080`); the notebook should not send its heartbeat to
that port. It should continue using the existing heartbeat service on `8765`.

No live notebook or real heartbeat was used for the integration tests. Mocked
tests cover active, stale, malformed, and unauthorized registry responses.
