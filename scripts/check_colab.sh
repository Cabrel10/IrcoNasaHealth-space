#!/usr/bin/env bash
# check_colab.sh — verify the Colab / AI relay chain of IRCO.
#
# Usage:
#   scripts/check_colab.sh                  # status + assistant probe (read-only)
#   scripts/check_colab.sh --register       # register the notebook runtime first
#
# Environment:
#   IRCO_BASE         Backend base URL              (default http://127.0.0.1:3081)
#   IRCO_API_TOKEN    Admin bearer token            (required with --register)
#   COLAB_API_BASE    Public HTTPS URL of the notebook OpenAI-compatible API
#                     (must start with https://, e.g. an ngrok/cloudflared URL)
#   COLAB_API_KEY     API key accepted by the notebook
#   COLAB_MODEL       Model id served by the notebook (e.g. Qwen/Qwen3-4B-Instruct)
#   COLAB_CAPABILITIES  JSON capabilities (default: chat only)
#
# Exit codes: 0 = relay reachable; 1 = backend/assistant unreachable;
#             2 = --register requested but required variables are missing.
set -euo pipefail

BASE="${IRCO_BASE:-http://127.0.0.1:3081}"
CAPS="${COLAB_CAPABILITIES:-{\"chat\":true}}"

say() { printf '%s\n' "$*"; }
jqget() { python3 -c 'import json,sys; d=json.load(sys.stdin); print(json.dumps(d, indent=1))'; }

say "== IRCO AI relay check =="
say "backend: $BASE"

health="$(curl -fsS "$BASE/api/v1/health")" || {
  say "FAIL: backend unreachable at $BASE"
  exit 1
}
say "-- /api/v1/health"
printf '%s' "$health" | python3 -c 'import json,sys; d=json.load(sys.stdin); print(json.dumps({k:d.get(k) for k in ("status","ai_available","colab_available","knowledge_available","rules_loaded","indicators_loaded")}, indent=1))'

say "-- /api/v1/colab/status"
curl -fsS "$BASE/api/v1/colab/status" | jqget

say "-- /api/v1/colab/capabilities"
curl -fsS "$BASE/api/v1/colab/capabilities" | jqget || say "(no capabilities route response)"

if [[ "${1:-}" == "--register" ]]; then
  if [[ -z "${IRCO_API_TOKEN:-}" || -z "${COLAB_API_BASE:-}" || -z "${COLAB_API_KEY:-}" || -z "${COLAB_MODEL:-}" ]]; then
    say "FAIL: --register needs IRCO_API_TOKEN, COLAB_API_BASE, COLAB_API_KEY, COLAB_MODEL"
    exit 2
  fi
  case "$COLAB_API_BASE" in
    https://*) : ;;
    *) say "FAIL: COLAB_API_BASE must start with https:// (the API rejects non-HTTPS)"; exit 2 ;;
  esac
  say "-- POST /api/v1/admin/colab/register"
  curl -fsS -X POST "$BASE/api/v1/admin/colab/register" \
    -H "Authorization: Bearer $IRCO_API_TOKEN" \
    -H 'Content-Type: application/json' \
    -d "$(python3 - "$COLAB_API_BASE" "$COLAB_API_KEY" "$COLAB_MODEL" "$CAPS" <<'PY'
import json, sys
print(json.dumps({"api_base": sys.argv[1], "api_key": sys.argv[2],
                  "model": sys.argv[3], "capabilities": json.loads(sys.argv[4])}))
PY
)" | jqget
fi

say "-- assistant probe (real request through the relay)"
answer="$(curl -fsS -X POST "$BASE/api/v1/assistant/chat" \
  -H 'Content-Type: application/json' \
  -d '{"question":"What does NASA HRP say about radiation exposure for astronauts?"}')" || {
  say "FAIL: assistant route unreachable"
  exit 1
}
printf '%s' "$answer" | python3 -c '
import json, sys
d = json.load(sys.stdin)
print(json.dumps({
  "provider": d.get("provider"),
  "source_not_found": d.get("source_not_found"),
  "citations": [c.get("document_id") for c in d.get("citations", [])],
  "answer_chars": len(d.get("answer", "")),
}, indent=1))
'
provider="$(printf '%s' "$answer" | python3 -c 'import json,sys; print(json.load(sys.stdin).get("provider",""))')"
case "$provider" in
  extractive_fallback) say "RESULT: assistant OK (local cited fallback — notebook not registered or unreachable)." ;;
  *) say "RESULT: assistant OK via provider '$provider'." ;;
esac
say "NOTE: only text chat is relayed. ASR/TTS/vision/VLM run in the notebook"
say "      and are not exposed by the IRCO API (see README, Colab section)."
