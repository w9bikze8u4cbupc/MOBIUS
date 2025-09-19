#!/bin/bash

# dev-restart.sh - Convenience wrapper to restart the development environment
# Usage: ./dev-restart.sh [--smoke] [--clean-logs]

dev-restart() {
  script_dir="$(cd -- "$(dirname "${BASH_SOURCE[0]}")" && pwd 2>/dev/null || pwd)"
  ( cd "$script_dir" && ./dev-down.sh "$@" && ./dev-up.sh "$@" )
}

dev-restart "$@"