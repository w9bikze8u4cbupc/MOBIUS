#!/usr/bin/env bash
# Script to track deprecated alias usage for dashboard metrics
# This script can be called from CI to increment counters when deprecated aliases are used

set -Eeuo pipefail
IFS=$'\n\t'

# Counter file location
COUNTER_FILE="${COUNTER_FILE:-/tmp/mobius_alias_usage.count}"

# Function to increment counter
increment_counter() {
  local alias_name="$1"
  if [[ -f "$COUNTER_FILE" ]]; then
    # Read existing counters
    declare -A counters
    while IFS='=' read -r key value; do
      counters["$key"]="$value"
    done < "$COUNTER_FILE"
    
    # Increment the specific counter
    current_value="${counters[$alias_name]:-0}"
    counters["$alias_name"]=$((current_value + 1))
    
    # Write back all counters
    > "$COUNTER_FILE"  # Clear file
    for key in "${!counters[@]}"; do
      echo "$key=${counters[$key]}" >> "$COUNTER_FILE"
    done
  else
    # Create new counter file
    echo "$alias_name=1" > "$COUNTER_FILE"
  fi
}

# Parse arguments to see which deprecated aliases were used
while [[ $# -gt 0 ]]; do
  case "$1" in
    --metrics-token-legacy) 
      increment_counter "metrics_token_legacy"
      shift 2;;
    --timeout) 
      increment_counter "timeout"
      shift 2;;
    --json-out) 
      increment_counter "json_out"
      shift 2;;
    --junit-out) 
      increment_counter "junit_out"
      shift 2;;
    --retries) 
      increment_counter "retries"
      shift 2;;
    *) shift;;
  esac
done

# Output current counters for dashboard
if [[ -f "$COUNTER_FILE" ]]; then
  echo "Deprecated alias usage counters:"
  cat "$COUNTER_FILE"
else
  echo "No deprecated aliases used"
fi