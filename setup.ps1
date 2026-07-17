# Grinnish Local — one-command setup for Windows (PowerShell).
# Mirrors setup.sh — see that file for the full rationale of each step.
#
# NOTE: written and reviewed for correctness, but not executed on real
# Windows hardware as part of this work (no Windows machine available in
# this environment). Treat as a best-effort first pass; flagged as an open
# item for validation on the actual target device (see final report).
#
# Usage (from an elevated or normal PowerShell prompt):
#   powershell -ExecutionPolicy Bypass -File .\setup.ps1

$ErrorActionPreference = "Stop"
$Model = "gemma4:e2b"

function Info($msg)  { Write-Host "==> $msg" -ForegroundColor Green }
function Warn($msg)  { Write-Host "==> $msg" -ForegroundColor Yellow }
function Fail($msg)  { Write-Host "==> $msg" -ForegroundColor Red; exit 1 }

Set-Location -Path $PSScriptRoot

Info "Checking Node.js..."
if (-not (Get-Command node -ErrorAction SilentlyContinue)) {
  Fail "Node.js not found. Install Node 20+ from https://nodejs.org and re-run this script."
}
$nodeMajor = [int]((node -e "console.log(process.versions.node.split('.')[0])").Trim())
if ($nodeMajor -lt 20) {
  Fail "Node.js $nodeMajor found; this app needs Node 20+. Upgrade and re-run."
}
Info "Node $(node -v) OK."

if (-not (Get-Command npm -ErrorAction SilentlyContinue)) {
  Fail "npm not found alongside Node -- reinstall Node.js."
}

# Set $env:GRINNISH_MODEL_SOURCE to "local" or "cloud" to skip the prompt.
$ModelSource = $env:GRINNISH_MODEL_SOURCE
if ($ModelSource -ne "local" -and $ModelSource -ne "cloud") {
  Write-Host ""
  Write-Host "Which model source do you want to set up?"
  Write-Host "  1) Local (Ollama)  - installs/checks Ollama + downloads the ~7GB model, fully offline after that"
  Write-Host "  2) Cloud (Google AI Studio) - skips Ollama entirely, needs your own API key + some internet"
  $choice = Read-Host "Enter 1 or 2 [1]"
  if ($choice -eq "2") { $ModelSource = "cloud" } else { $ModelSource = "local" }
}
Info "Model source: $ModelSource"

if ($ModelSource -eq "local") {
  Info "Checking Ollama..."
  if (-not (Get-Command ollama -ErrorAction SilentlyContinue)) {
    Fail "Ollama not found. Install it from https://ollama.com/download, then re-run this script."
  }

  try {
    Invoke-WebRequest -Uri "http://localhost:11434/api/tags" -TimeoutSec 3 -UseBasicParsing | Out-Null
    Info "Ollama is running."
  } catch {
    Warn "Ollama is installed but doesn't seem to be running."
    Warn "Start it (e.g. from the Ollama app, or 'ollama serve' in another window)."
    Warn "Then re-run this script."
    exit 1
  }

  Info "Checking for local model ($Model)..."
  $modelList = ollama list 2>$null
  if ($modelList -match [regex]::Escape($Model)) {
    Info "$Model already present."
  } else {
    Warn "$Model not found locally -- pulling now (one-time, needs internet, ~7GB)."
    ollama pull $Model
  }
} else {
  Info "Cloud mode selected -- skipping Ollama check and model download."
}

Info "Installing npm dependencies (this also runs prisma generate)..."
npm install

Info "Ensuring local SQLite schema exists..."
New-Item -ItemType Directory -Force -Path data | Out-Null
npx prisma migrate deploy

Info "Seeding the local catalog from the bundled dataset (no credentials, no network)..."
npm run seed

Info "Building production bundle..."
npm run build

Info "Setup complete."
Write-Host ""
if ($ModelSource -eq "cloud") {
  Write-Host "  1. Start the app:  npm start"
  Write-Host "  2. Open:           http://localhost:3000"
  Write-Host "  3. In Settings, choose Cloud (Google AI Studio) and paste your"
  Write-Host "     API key (get one at https://aistudio.google.com/apikey)."
} else {
  Write-Host "  1. Make sure Ollama is running (the Ollama app, or 'ollama serve')"
  Write-Host "  2. Start the app:  npm start"
  Write-Host "  3. Open:           http://localhost:3000"
}
Write-Host ""
