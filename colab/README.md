# Colab runtime integration

The assistant uses the active, unexpired runtime session in IRCO's Colab
registry. Registration and heartbeat updates immediately affect subsequent
assistant requests; the API does not read aichat configuration files.

The assistant sends at most five BM25 hits with scores of at least `0.25` to
Colab, waits at most eight seconds, and accepts only answers that cite known
`[S1]`-style sources. It sends current deterministic health state only when a
request explicitly includes both `subject_id` and `data_class`; that context is
included in the outbound request only when an active runtime is registered,
is read-only, and is kept separate from source citations. With no relevant
evidence, invalid citations, or a relay failure, it uses the local extractive
answer. The model cannot change observations, rules, alerts, or vigilance.

The current VPS notebook exposes OpenAI-compatible chat completions only. It
does not expose compatible audio or image endpoints, so IRCO does not advertise
multimodal capabilities yet. A future multimodal notebook must expose and
document those endpoints before they can be enabled.

The notebook currently sends its heartbeat to the separate Colab bridge, not
to IRCO's registry. Until that notebook is wired to IRCO registration, use the
registration API explicitly with the administrator credential held outside
Git. Keep the returned heartbeat token only in the notebook runtime and send
it as a bearer token on heartbeat requests; re-register after either side
restarts or the session expires.

Do not copy or commit the VPS `.env`, heartbeat secrets, account files,
generated tunnel URLs, or notebook outputs into this repository.
