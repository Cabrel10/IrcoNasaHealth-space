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

## Notebook response contract (text chat)

IRCO sends a fixed OpenAI-compatible request to `{api_base}/v1/chat/completions`:

```json
{
  "model": "<registered model id>",
  "temperature": 0.2,
  "top_p": 0.9,
  "max_tokens": 400,
  "seed": 42,
  "messages": [
    {"role": "system", "content": "…explain, never diagnose, read-only vigilance…"},
    {"role": "user", "content": "Question: …\n\nSources:\n[S1] <title> — <section> (curated summary, not a quotation)\n<evidence>\n…"}
  ]
}
```

The notebook must answer with the standard OpenAI response shape:

```json
{"choices": [{"message": {"role": "assistant", "content": "… [S1] …"}}]}
```

Acceptance rules enforced by IRCO (anything else is discarded and replaced by
the local cited extractive answer):

- `choices[0].message.content` is a non-empty string;
- the text cites at least one valid `[Sn]` marker, with `1 <= n <=` the number
  of sources actually sent (maximum five);
- the text does not invent measurements, thresholds, or a vigilance level;
- the text does not claim to change the vigilance level. IRCO never writes the
  model output back into observations, rules, alerts, or `/state`.

The current notebook serves text chat only. Audio (`/v1/audio/*`), vision,
VLM, and `/v1/multi` remain notebook demos: IRCO does not relay them, and the
demo must present them as notebook-only.

## What the notebook needs from the operator

1. Start the notebook and its HTTPS tunnel, then keep the heartbeat running.
2. Confirm `GET /api/v1/colab/status` reports `available: true` and the model
   name, and `GET /api/v1/health` reports `colab_available: true`.
3. Send one English question with an indicator (for example sleep and fatigue)
   and confirm the answer contains `[S1]` and returns in under nine seconds.
4. Stop the notebook (or let the registry TTL expire) and confirm the same
   question still returns HTTP 200 with `provider: extractive_fallback` and a
   citation.

