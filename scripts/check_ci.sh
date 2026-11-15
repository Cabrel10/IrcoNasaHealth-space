#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

export CARGO_BUILD_JOBS="${CARGO_BUILD_JOBS:-1}"

cargo fmt --all -- --check
cargo test --workspace
cargo clippy --workspace --all-targets -- -D warnings

python3 tests/contracts_test.py -v
python3 tests/test_acquire_data.py -v
python3 tests/test_pivot_builder.py -v
python3 tests/test_import_pivot.py -v
