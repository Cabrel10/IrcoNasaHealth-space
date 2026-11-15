# Colab runtime integration

The assistant reads the active runtime from the existing Colab heartbeat
registry on the VPS. The notebook keeps using that heartbeat service; it does
not need to register a second session with IRCO. See
[`../docs/colab_contract.md`](../docs/colab_contract.md) for the backend
configuration and contract.

The assistant sends at most five BM25 hits with scores of at least `0.25` to
Colab, waits at most fifteen seconds, and accepts only answers that cite known
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

IRCO reads the active backend entry, including its current tunnel URL, from
the existing heartbeat registry. The registry token is configured on the VPS
as `IRCO_COLAB_REGISTRY_TOKEN` (or `HB_SECRET`) and must not be copied into
notebook source or Git. The notebook should continue sending its heartbeat to
the existing heartbeat service on port `8765`; IRCO's chat API is on port
`3080` by default. Only text chat is relayed through IRCO at this time.

Do not copy or commit the VPS `.env`, heartbeat secrets, account files,
generated tunnel URLs, or notebook outputs into this repository.
