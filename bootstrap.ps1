# Grinnish Local — zero-touch bootstrap for Windows.
#
# Usage (one line, on a machine with nothing installed):
#   irm https://raw.githubusercontent.com/aegonmyy/abusites-companion/main/bootstrap.ps1 | iex
#
# Unlike setup.ps1 (which assumes git/Node/Ollama are already installed and
# just checks for them), this script installs whatever is missing via
# winget, clones the repo, and starts the app — meant for a machine you've
# never touched before (a judge's laptop, a demo machine), not just your
# own dev box.
#
# NOTE: written and reviewed for correctness, but not executed on real
# Windows hardware (no Windows machine available in this environment).
# winget package IDs (Git.Git, OpenJS.NodeJS.LTS, Ollama.Ollama) are the
# documented/published IDs for each project as of this writing — verify on
# first real run and adjust if a publisher has renamed their package.
#
# Requires winget (built into Windows 10 21H2+ and all Windows 11). If
# winget isn't present, this fails with a clear manual-install pointer for
# whatever's missing rather than guessing at another package manager.

$ErrorActionPreference = "Stop"

# npm/npx resolve to npm.ps1/npx.ps1 on Windows, which the default execution
# policy (Restricted, on most machines) blocks from running at all, even
# though this script itself just ran via `irm ... | iex`. Process-scoped
# only, reverts when this shell closes, doesn't touch the machine-wide
# policy.
Set-ExecutionPolicy -Scope Process -ExecutionPolicy Bypass -Force

$RepoUrl = "https://github.com/aegonmyy/abusites-companion.git"
$InstallDir = if ($env:GRINNISH_INSTALL_DIR) { $env:GRINNISH_INSTALL_DIR } else { Join-Path $env:USERPROFILE "grinnish-local" }
$Model = "gemma4:e2b"
$NodeMinMajor = 20

function Info($msg) { Write-Host "==> $msg" -ForegroundColor Green }
function Warn($msg) { Write-Host "==> $msg" -ForegroundColor Yellow }
function Fail($msg) { Write-Host "==> $msg" -ForegroundColor Red; exit 1 }

function Test-CommandExists($name) {
  return [bool](Get-Command $name -ErrorAction SilentlyContinue)
}

function Sync-Path {
  # winget-installed tools land on PATH via the registry, not the current
  # process's environment — pull Machine + User PATH fresh so a just-
  # installed command is usable without opening a new shell.
  $machine = [System.Environment]::GetEnvironmentVariable("Path", "Machine")
  $user = [System.Environment]::GetEnvironmentVariable("Path", "User")
  $env:Path = "$machine;$user"
}

$HasWinget = Test-CommandExists "winget"

# --------------------------------------------------------- model source ----
# Set $env:GRINNISH_MODEL_SOURCE to "local" or "cloud" to skip the prompt.
$ModelSource = $env:GRINNISH_MODEL_SOURCE
if ($ModelSource -ne "local" -and $ModelSource -ne "cloud") {
  Write-Host ""
  Write-Host "Which model source do you want to set up?"
  Write-Host "  1) Local (Ollama)  - installs Ollama + downloads the ~7GB model, fully offline after that"
  Write-Host "  2) Cloud (Google AI Studio) - skips Ollama entirely, needs your own API key + some internet"
  $choice = Read-Host "Enter 1 or 2 [1]"
  if ($choice -eq "2") { $ModelSource = "cloud" } else { $ModelSource = "local" }
}
Info "Model source: $ModelSource"

# ----------------------------------------------------------------- git ----
if (-not (Test-CommandExists "git")) {
  if ($HasWinget) {
    Info "git not found - installing via winget..."
    winget install --id Git.Git -e --silent --accept-source-agreements --accept-package-agreements
    Sync-Path
  } else {
    Fail "git is missing and winget isn't available. Install git from https://git-scm.com/downloads, then re-run this script."
  }
}
if (-not (Test-CommandExists "git")) {
  Fail "git install did not complete. Open a new PowerShell window and re-run this script."
}
Info "git OK ($(git --version))."

# --------------------------------------------------------- clone/pull ----
if (Test-Path (Join-Path $InstallDir ".git")) {
  Info "Repo already exists at $InstallDir - pulling latest..."
  git -C $InstallDir pull --ff-only
} else {
  Info "Cloning into $InstallDir..."
  git clone $RepoUrl $InstallDir
}
Set-Location -Path $InstallDir

# ------------------------------------------------------------- Node.js ----
$needNode = $true
if (Test-CommandExists "node") {
  $nodeMajor = [int]((node -e "console.log(process.versions.node.split('.')[0])").Trim())
  if ($nodeMajor -ge $NodeMinMajor) { $needNode = $false }
}
if ($needNode) {
  if ($HasWinget) {
    Info "Installing Node.js LTS via winget..."
    winget install --id OpenJS.NodeJS.LTS -e --silent --accept-source-agreements --accept-package-agreements
    Sync-Path
  } else {
    Fail "Node.js is missing (or too old) and winget isn't available. Install Node 20+ from https://nodejs.org, then re-run this script."
  }
  if (-not (Test-CommandExists "node")) {
    Fail "Node install did not complete. Open a new PowerShell window and re-run this script."
  }
}
Info "Node $(node -v) OK."

# -------------------------------------------------------------- Ollama ----
if ($ModelSource -eq "local") {
  if (-not (Test-CommandExists "ollama")) {
    if ($HasWinget) {
      Info "Installing Ollama via winget..."
      winget install --id Ollama.Ollama -e --silent --accept-source-agreements --accept-package-agreements
      Sync-Path
    } else {
      Fail "Ollama is missing and winget isn't available. Install from https://ollama.com/download, then re-run this script."
    }
  }
  if (-not (Test-CommandExists "ollama")) {
    Fail "Ollama install did not complete. Open a new PowerShell window and re-run this script."
  }

  $ollamaUp = $false
  try {
    Invoke-WebRequest -Uri "http://localhost:11434/api/tags" -TimeoutSec 3 -UseBasicParsing | Out-Null
    $ollamaUp = $true
  } catch { $ollamaUp = $false }

  if (-not $ollamaUp) {
    Info "Starting Ollama in the background..."
    Start-Process -FilePath "ollama" -ArgumentList "serve" -WindowStyle Hidden
    for ($i = 0; $i -lt 20; $i++) {
      Start-Sleep -Seconds 1
      try {
        Invoke-WebRequest -Uri "http://localhost:11434/api/tags" -TimeoutSec 1 -UseBasicParsing | Out-Null
        $ollamaUp = $true
        break
      } catch { }
    }
  }
  if (-not $ollamaUp) {
    Fail "Ollama still isn't responding on :11434. Start it manually (the Ollama app, or 'ollama serve') and re-run."
  }
  Info "Ollama is running."

  Info "Checking for local model ($Model)..."
  $modelList = ollama list 2>$null
  if ($modelList -match [regex]::Escape($Model)) {
    Info "$Model already present."
  } else {
    Warn "$Model not found locally - pulling now (one-time, needs internet, ~7GB)..."
    ollama pull $Model
  }
} else {
  Info "Cloud mode selected - skipping Ollama install and model download."
}

# ---------------------------------------------------------------- app -----
Info "Installing npm dependencies (this also runs prisma generate)..."
npm install

Info "Ensuring local SQLite schema exists..."
New-Item -ItemType Directory -Force -Path data | Out-Null
npx prisma migrate deploy

Info "Seeding the local catalog from the bundled dataset (no credentials, no network)..."
npm run seed

Info "Building production bundle..."
npm run build

Info "Starting the app in the background..."
# npm resolves to npm.cmd on Windows, which Start-Process -FilePath can fail
# to launch directly; routing through cmd.exe avoids that.
Start-Process -FilePath "cmd.exe" -ArgumentList "/c npm start" -WindowStyle Hidden

$appUp = $false
for ($i = 0; $i -lt 30; $i++) {
  Start-Sleep -Seconds 1
  try {
    Invoke-WebRequest -Uri "http://localhost:3000" -TimeoutSec 1 -UseBasicParsing | Out-Null
    $appUp = $true
    break
  } catch { }
}

Info "Setup complete. Opening http://localhost:3000 ..."
Start-Process "http://localhost:3000"

Write-Host ""
Write-Host "  App:   http://localhost:3000"
Write-Host "  Repo:  $InstallDir"
if ($ModelSource -eq "cloud") {
  Write-Host ""
  Write-Host "  Cloud mode: open Settings in the app, choose Cloud (Google AI"
  Write-Host "  Studio), and paste your API key (get one at"
  Write-Host "  https://aistudio.google.com/apikey) before using it."
}
Write-Host ""
