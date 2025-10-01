#!/usr/bin/env bash
set -euo pipefail

# CONFIG - adjust if needed
NODE_VERSION="20.18.1"
REPO_URL="https://github.com/w9bikze8u4cbupc/MOBIUS.git"
REPO_DIR="$HOME/mobius"
SMOKE_TARGET="http://localhost:5001"
SMOKE_TIMEOUT=30
SMOKE_RETRIES=2

echo "=== 1) Install nvm & Node ${NODE_VERSION} (if needed) ==="
if ! command -v node >/dev/null 2>&1 || [[ "$(node -v)" != "v${NODE_VERSION}" ]]; then
  if ! command -v nvm >/dev/null 2>&1; then
    echo "Installing nvm..."
    curl -fsSL https://raw.githubusercontent.com/nvm-sh/nvm/v0.39.6/install.sh | bash
    export NVM_DIR="$HOME/.nvm"
    [ -s "$NVM_DIR/nvm.sh" ] && \. "$NVM_DIR/nvm.sh"
  else
    export NVM_DIR="$HOME/.nvm"
    [ -s "$NVM_DIR/nvm.sh" ] && \. "$NVM_DIR/nvm.sh"
  fi
  echo "Installing Node ${NODE_VERSION}..."
  nvm install "${NODE_VERSION}"
  nvm use "${NODE_VERSION}"
fi
echo "node $(node -v) / npm $(npm -v)"

echo "=== 2) Ensure ffmpeg installed ==="
if ! command -v ffmpeg >/dev/null 2>&1; then
  echo "Installing ffmpeg..."
  sudo apt-get update -y
  sudo apt-get install -y ffmpeg
fi
echo "ffmpeg $(ffmpeg -version | head -n1)"

echo "=== 3) Check Docker availability ==="
if ! command -v docker >/dev/null 2>&1; then
  echo "ERROR: docker CLI not available in WSL. Start Docker Desktop and enable WSL integration."
  exit 2
fi
if ! docker info >/dev/null 2>&1; then
  echo "ERROR: docker daemon not accessible. Open Docker Desktop and ensure WSL integration is enabled for this distro."
  exit 2
fi
echo "Docker is available."

echo "=== 4) Clone repo (or update) ==="
if [ -d "$REPO_DIR" ]; then
  echo "Repo directory exists: $REPO_DIR — pulling latest on current branch"
  cd "$REPO_DIR"
  git pull --ff-only || true
else
  git clone "$REPO_URL" "$REPO_DIR"
  cd "$REPO_DIR"
fi

echo "=== 5) Install project deps ==="
# Use npm ci for clean install if package-lock.json exists
if [ -f package-lock.json ]; then
  npm ci
else
  npm install
fi

echo "=== 6) Run verification ==="
npm run verify-clean-genesis --silent || {
  echo "verify-clean-genesis failed — inspect verification-reports/ or run with -- --verbose"
  ls -la verification-reports || true
  exit 3
}
echo "Verification passed."

echo "=== 7) Build CI image ==="
docker build -f Dockerfile.ci -t mobius-api-ci:local .

echo "=== 8) Start compose stack ==="
docker compose -f docker-compose.staging.yml up -d --build

# small wait before smoke-tests
sleep 3

echo "=== 9) Run smoke-tests (logs saved to smoke-tests.log) ==="
./scripts/ci/smoke-tests.sh "${SMOKE_TARGET}" "${SMOKE_TIMEOUT}" "${SMOKE_RETRIES}" > smoke-tests.log 2>&1 || {
  echo "Smoke tests failed. Collecting artifacts..."
  docker compose -f docker-compose.staging.yml logs --no-color > compose-logs.log || true
  echo "Listing verification-reports"
  ls -lah verification-reports || true
  echo "Artifacts saved: smoke-tests.log, compose-logs.log, verification-reports/*"
  # keep containers up for debugging (do not auto-down). Exit non-zero
  exit 4
}

echo "=== 10) Tear down ==="
docker compose -f docker-compose.staging.yml down --volumes --remove-orphans

echo "SUCCESS: Mobius stack smoke-tests passed locally."
