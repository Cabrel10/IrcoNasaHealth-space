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

Notebook cell 8 can register its current HTTPS tunnel directly with IRCO. Add
these Colab secrets (never to notebook source or Git):

| Secret | Value |
|---|---|
| `irco_api_base` | HTTPS base URL of the IRCO API, without `/api/v1` |
| `irco_admin_token` | The VPS `IRCO_COLAB_ADMIN_TOKEN` |

It uses the notebook's existing `api_key` as the upstream chat key, advertises
chat only, and refreshes the session every 60 seconds. The returned heartbeat
token stays in notebook memory; after a `401` it re-registers. The older `vps`
and `hex` secrets remain optional for the separate Colab bridge. The notebook
does not enable or advertise ASR, TTS, vision, multimodal, or streaming routes.

Do not copy or commit the VPS `.env`, heartbeat secrets, account files,
generated tunnel URLs, or notebook outputs into this repository.
