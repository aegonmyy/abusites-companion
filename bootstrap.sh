#!/usr/bin/env bash
# Grinnish Local — zero-touch bootstrap for Linux/macOS.
#
# Usage (one line, on a machine with nothing installed):
#   curl -fsSL https://raw.githubusercontent.com/aegonmyy/abusites-companion/main/bootstrap.sh | bash
#
# Unlike setup.sh (which assumes Node/Ollama/git are already installed and
# just checks for them), this script installs whatever is missing, clones
# the repo, and starts the app — meant for a machine you've never touched
# before (a judge's laptop, a demo machine), not just your own dev box.
#
# What this does, in order:
#   1. Installs git if missing (via the system's package manager).
#   2. Clones the repo into $HOME/grinnish-local (or pulls latest if it's
#      already there).
#   3. Installs Node.js 20+ if missing/too old — via the official static
#      binary from nodejs.org, not a package manager, so this works
#      identically across every Linux distro and macOS without guessing
#      which package manager (or its exact package name) is present.
#   4. Asks which model source to set up (or reads GRINNISH_MODEL_SOURCE,
#      see below) — Local (Ollama) or Cloud (Google AI Studio). Local
#      installs Ollama if missing, starts it in the background if it isn't
#      running, and pulls gemma4:e2b if needed (~7GB, one-time, needs
#      internet). Cloud skips all of that entirely — no multi-GB download,
#      no local inference — since a low-RAM machine may not be able to run
#      a local model at all; the app still runs, you add your own API key
#      in Settings after it starts.
#   5. Runs the same npm install / prisma migrate / seed / build steps as
#      setup.sh.
#   6. Starts the app in the background and opens it in the browser.
#
# Safe to re-run: every step checks before acting, so running this again
# on a machine that already has everything just starts the app.
#
# Non-interactive: set GRINNISH_MODEL_SOURCE=local or =cloud to skip the
# prompt (needed since a piped `curl | bash` has no free stdin for an
# interactive read unless a real terminal is attached), e.g.:
#   curl -fsSL <url>/bootstrap.sh | GRINNISH_MODEL_SOURCE=cloud bash

set -euo pipefail

REPO_URL="https://github.com/aegonmyy/abusites-companion.git"
INSTALL_DIR="${GRINNISH_INSTALL_DIR:-$HOME/grinnish-local}"
MODEL="gemma4:e2b"
NODE_MIN_MAJOR=20
NODE_VERSION="v22.14.0"

RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'; NC='\033[0m'
info()  { echo -e "${GREEN}==>${NC} $1"; }
warn()  { echo -e "${YELLOW}==>${NC} $1"; }
fail()  { echo -e "${RED}==>${NC} $1"; exit 1; }

OS_RAW="$(uname -s)"
ARCH_RAW="$(uname -m)"

# --------------------------------------------------------- model source ----
MODEL_SOURCE="${GRINNISH_MODEL_SOURCE:-}"
if [ "$MODEL_SOURCE" != "local" ] && [ "$MODEL_SOURCE" != "cloud" ]; then
  if [ -r /dev/tty ]; then
    echo
    echo "Which model source do you want to set up?"
    echo "  1) Local (Ollama)  — installs Ollama + downloads the ~7GB model, fully offline after that"
    echo "  2) Cloud (Google AI Studio) — skips Ollama entirely, needs your own API key + some internet"
    read -r -p "Enter 1 or 2 [1]: " choice < /dev/tty || choice=""
    case "$choice" in
      2) MODEL_SOURCE="cloud" ;;
      *) MODEL_SOURCE="local" ;;
    esac
  else
    MODEL_SOURCE="local"
  fi
fi
info "Model source: $MODEL_SOURCE"

# ---------------------------------------------------------------- git ----
if ! command -v git >/dev/null 2>&1; then
  info "git not found — installing…"
  if [ "$OS_RAW" = "Darwin" ]; then
    if command -v brew >/dev/null 2>&1; then
      brew install git
    else
      fail "git is missing and Homebrew isn't installed. Install git from https://git-scm.com/downloads, then re-run this script."
    fi
  elif command -v apt-get >/dev/null 2>&1; then sudo apt-get update -y && sudo apt-get install -y git
  elif command -v dnf >/dev/null 2>&1; then sudo dnf install -y git
  elif command -v yum >/dev/null 2>&1; then sudo yum install -y git
  elif command -v pacman >/dev/null 2>&1; then sudo pacman -Sy --noconfirm git
  elif command -v zypper >/dev/null 2>&1; then sudo zypper install -y git
  elif command -v apk >/dev/null 2>&1; then sudo apk add git
  else
    fail "git is missing and no known package manager was found. Install git from https://git-scm.com/downloads, then re-run this script."
  fi
fi
info "git OK ($(git --version))."

# --------------------------------------------------------- clone/pull ----
if [ -d "$INSTALL_DIR/.git" ]; then
  info "Repo already exists at $INSTALL_DIR — checking for updates…"
  git -C "$INSTALL_DIR" fetch origin main --quiet
  LOCAL_HEAD=$(git -C "$INSTALL_DIR" rev-parse HEAD)
  REMOTE_HEAD=$(git -C "$INSTALL_DIR" rev-parse origin/main)
  if [ "$LOCAL_HEAD" = "$REMOTE_HEAD" ]; then
    info "Already up to date, skipping download."
  else
    info "Updating to latest…"
    git -C "$INSTALL_DIR" pull --ff-only
  fi
else
  info "Cloning into $INSTALL_DIR…"
  git clone "$REPO_URL" "$INSTALL_DIR"
fi
cd "$INSTALL_DIR"

# ------------------------------------------------------------ Node.js ----
node_needs_install() {
  command -v node >/dev/null 2>&1 || return 0
  local major
  major=$(node -e 'console.log(process.versions.node.split(".")[0])' 2>/dev/null || echo 0)
  [ "$major" -lt "$NODE_MIN_MAJOR" ]
}

if node_needs_install; then
  case "$OS_RAW" in
    Darwin) NODE_OS="darwin" ;;
    Linux) NODE_OS="linux" ;;
    *) fail "Unsupported OS for auto Node install: $OS_RAW. Install Node 20+ manually from https://nodejs.org." ;;
  esac
  case "$ARCH_RAW" in
    x86_64|amd64) NODE_ARCH="x64" ;;
    arm64|aarch64) NODE_ARCH="arm64" ;;
    *) fail "Unsupported architecture for auto Node install: $ARCH_RAW. Install Node 20+ manually from https://nodejs.org." ;;
  esac

  NODE_DIST="node-${NODE_VERSION}-${NODE_OS}-${NODE_ARCH}"
  NODE_ROOT="$HOME/.grinnish-local-node"
  NODE_DIR="$NODE_ROOT/$NODE_DIST"

  if [ ! -x "$NODE_DIR/bin/node" ]; then
    info "Installing Node.js $NODE_VERSION (official static binary, no package manager needed)…"
    mkdir -p "$NODE_ROOT"
    curl -fsSL "https://nodejs.org/dist/${NODE_VERSION}/${NODE_DIST}.tar.xz" -o "/tmp/${NODE_DIST}.tar.xz"
    tar -xJf "/tmp/${NODE_DIST}.tar.xz" -C "$NODE_ROOT"
    rm -f "/tmp/${NODE_DIST}.tar.xz"
  fi
  export PATH="$NODE_DIR/bin:$PATH"
  info "Node $(node -v) ready (installed to $NODE_DIR)."
  warn "To use this Node in new terminals later, add: export PATH=\"$NODE_DIR/bin:\$PATH\""
else
  info "Node $(node -v) OK."
fi

# ------------------------------------------------------------- Ollama ----
if [ "$MODEL_SOURCE" = "local" ]; then
  if ! command -v ollama >/dev/null 2>&1; then
    info "Installing Ollama…"
    curl -fsSL https://ollama.com/install.sh | sh
  fi
  command -v ollama >/dev/null 2>&1 || fail "Ollama install did not complete. Install manually from https://ollama.com/download, then re-run."

  if ! curl -s -o /dev/null --max-time 3 http://localhost:11434/api/tags; then
    info "Starting Ollama in the background…"
    nohup ollama serve >/tmp/grinnish-ollama.log 2>&1 &
    disown || true
    for _ in $(seq 1 20); do
      curl -s -o /dev/null --max-time 1 http://localhost:11434/api/tags && break
      sleep 1
    done
  fi
  curl -s -o /dev/null --max-time 3 http://localhost:11434/api/tags \
    || fail "Ollama still isn't responding on :11434. Start it manually with 'ollama serve' and re-run."
  info "Ollama is running."

  info "Checking for local model ($MODEL)…"
  if ollama list 2>/dev/null | awk '{print $1}' | grep -qx "$MODEL"; then
    info "$MODEL already present."
  else
    warn "$MODEL not found locally — pulling now (one-time, needs internet, ~7GB)…"
    ollama pull "$MODEL"
  fi
else
  info "Cloud mode selected — skipping Ollama install and model download."
fi

# --------------------------------------------------------------- app -----
info "Installing npm dependencies (this also runs prisma generate)…"
npm install

info "Ensuring local SQLite schema exists…"
mkdir -p data
npx prisma migrate deploy

info "Seeding the local catalog from the bundled dataset (no credentials, no network)…"
npm run seed

info "Building production bundle…"
npm run build

info "Starting the app in the background…"
nohup npm start >/tmp/grinnish-app.log 2>&1 &
disown || true

for _ in $(seq 1 30); do
  curl -s -o /dev/null --max-time 1 http://localhost:3000 && break
  sleep 1
done

info "Setup complete."
if command -v xdg-open >/dev/null 2>&1; then
  xdg-open http://localhost:3000 >/dev/null 2>&1 &
elif command -v open >/dev/null 2>&1; then
  open http://localhost:3000
else
  echo "Open http://localhost:3000 in your browser."
fi
echo
echo "  App:      http://localhost:3000"
echo "  Repo:     $INSTALL_DIR"
if [ "$MODEL_SOURCE" = "cloud" ]; then
  echo "  Logs:     /tmp/grinnish-app.log"
  echo
  echo "  Cloud mode: open Settings in the app, choose Cloud (Google AI"
  echo "  Studio), and paste your API key (get one at"
  echo "  https://aistudio.google.com/apikey) before using it."
else
  echo "  Logs:     /tmp/grinnish-app.log  and  /tmp/grinnish-ollama.log"
fi
echo
