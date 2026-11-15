# Colab runtime integration

The VPS Colab runtime updates the aichat configuration after each notebook
heartbeat. IRCO reads that file for each assistant request, so a refreshed
Cloudflare URL or model name takes effect without restarting the API.

By default, IRCO reads `~/.config/aichat/config.yaml`. Set
`COLAB_AICHAT_CONFIG` if the API runs under another account or the file is
mounted elsewhere. For a container, mount the configuration read-only and
restrict access to the service account; the file contains the upstream API key.

The configured aichat client must be named `local` and use the
`openai-compatible` type, with `api_base`, `api_key`, and a model name. IRCO
appends `/v1/chat/completions` when needed. It rereads this configuration on
every assistant request.

The assistant sends at most five BM25 hits with scores of at least `0.25` to
Colab, waits at most eight seconds, and accepts only answers that cite known
`[S1]`-style sources. With no relevant evidence, invalid citations, or a relay
failure, it uses the local extractive answer. The model cannot change
observations, rules, alerts, or vigilance.

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
