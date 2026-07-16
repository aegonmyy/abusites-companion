#!/usr/bin/env bash
# Grinnish Local — one-command setup for Linux/macOS.
#
# What this does, in order:
#   1. Checks Node.js and npm are present (>=20).
#   2. Checks Ollama is installed and reachable; pulls the shipped model
#      (gemma4:e2b) if it isn't already present locally.
#   3. npm install (this also runs `prisma generate` via postinstall).
#   4. Creates/updates the local SQLite schema (prisma migrate deploy), then
#      seeds the course/past-questions catalog from the static bundle
#      committed at prisma/seed-bundle/catalog.json (`npm run seed`). This
#      needs no credentials and no network access — it's plain JSON already
#      in the repo — so it always runs, unconditionally, on every setup.
#      Seeding upserts by id, so it's idempotent and safe on repeat runs.
#   5. Production build (npm run build).
#
# After this finishes: `npm start`, then open http://localhost:3000.
# Ollama must be running (`ollama serve`) whenever the app is running —
# this script does not manage that as a background service; see README.

set -euo pipefail

RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'; NC='\033[0m'
info()  { echo -e "${GREEN}==>${NC} $1"; }
warn()  { echo -e "${YELLOW}==>${NC} $1"; }
fail()  { echo -e "${RED}==>${NC} $1"; exit 1; }

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

MODEL="gemma4:e2b"

info "Checking Node.js…"
command -v node >/dev/null 2>&1 || fail "Node.js not found. Install Node 20+ from https://nodejs.org and re-run this script."
NODE_MAJOR=$(node -e 'console.log(process.versions.node.split(".")[0])')
if [ "$NODE_MAJOR" -lt 20 ]; then
  fail "Node.js $NODE_MAJOR found; this app needs Node 20+. Upgrade and re-run."
fi
info "Node $(node -v) OK."

command -v npm >/dev/null 2>&1 || fail "npm not found alongside Node — reinstall Node.js."

info "Checking Ollama…"
if ! command -v ollama >/dev/null 2>&1; then
  fail "Ollama not found. Install it from https://ollama.com/download, then re-run this script."
fi

if ! curl -s -o /dev/null --max-time 3 http://localhost:11434/api/tags; then
  warn "Ollama is installed but doesn't seem to be running."
  warn "Start it in another terminal with: ollama serve"
  warn "Then re-run this script."
  exit 1
fi
info "Ollama is running."

info "Checking for local model ($MODEL)…"
if ollama list 2>/dev/null | awk '{print $1}' | grep -qx "$MODEL"; then
  info "$MODEL already present."
else
  warn "$MODEL not found locally — pulling now (one-time, needs internet, ~7GB)."
  ollama pull "$MODEL"
fi

info "Installing npm dependencies (this also runs prisma generate)…"
npm install

info "Ensuring local SQLite schema exists…"
mkdir -p data
npx prisma migrate deploy

info "Seeding the local catalog from the bundled dataset (no credentials, no network)…"
npm run seed

info "Building production bundle…"
npm run build

info "Setup complete."
echo
echo "  1. Make sure Ollama is running:  ollama serve"
echo "  2. Start the app:                npm start"
echo "  3. Open:                         http://localhost:3000"
echo
