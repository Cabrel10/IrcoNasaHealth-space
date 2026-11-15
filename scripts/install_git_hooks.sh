#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
git -C "$ROOT" config core.hooksPath .githooks
chmod +x \
  "$ROOT/.githooks/pre-commit" \
  "$ROOT/.githooks/pre-push" \
  "$ROOT/scripts/check_fast.sh" \
  "$ROOT/scripts/check_ci.sh" \
  "$ROOT/scripts/install_git_hooks.sh"
printf 'Git hooks enabled for %s\n' "$ROOT"
