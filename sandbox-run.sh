#!/usr/bin/env bash
set -euo pipefail
timeout "${SANDBOX_TIMEOUT_SEC:-900}" bash -lc "$*"