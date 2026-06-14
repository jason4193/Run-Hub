#!/usr/bin/env bash
# Local end-to-end check — run this BEFORE pushing to GitHub.
# Builds the Snapshot from the live intervals.icu API, typechecks, builds the
# site, then serves the production build so you can eyeball it locally.
#
# Usage:  npm run local-test       (or:  bash scripts/local-test.sh)
#         npm run local-test -- --no-fetch    # skip the API call, reuse data/*.json
set -euo pipefail

cd "$(dirname "$0")/.."

SKIP_FETCH=0
for arg in "$@"; do
  case "$arg" in
    --no-fetch) SKIP_FETCH=1 ;;
    *) echo "Unknown arg: $arg" >&2; exit 2 ;;
  esac
done

step() { printf '\n\033[1;36m▶ %s\033[0m\n' "$1"; }

# 1. Credentials
if [[ ! -f .env ]]; then
  if [[ "$SKIP_FETCH" -eq 0 ]]; then
    echo "No .env found. Copy .env.example to .env and add your INTERVALS_API_KEY," >&2
    echo "or re-run with --no-fetch to reuse the committed data/*.json." >&2
    exit 1
  fi
  echo "No .env (continuing because --no-fetch)."
fi

# 2. Dependencies
if [[ ! -d node_modules ]]; then
  step "Installing dependencies (npm install)"
  npm install
fi

# 3. Build the Snapshot from the live API
if [[ "$SKIP_FETCH" -eq 0 ]]; then
  step "Fetching Snapshot from intervals.icu (npm run fetch)"
  npm run fetch
else
  step "Skipping fetch — reusing existing data/*.json"
fi

# 4. Typecheck + production build (also copies data/ into dist/)
step "Building site (npm run build)"
npm run build

# 5. Serve the production build
step "Serving production build — open the printed URL, Ctrl+C to stop"
npm run preview
