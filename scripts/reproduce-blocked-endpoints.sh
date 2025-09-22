#!/usr/bin/env bash
# scripts/reproduce-blocked-endpoints.sh
# Help infra reproduce "blocked endpoint" scenarios locally by temporarily
# adding /etc/hosts entries that route the target hosts to 127.0.0.1.
#
# Usage:
#   ./scripts/reproduce-blocked-endpoints.sh --block-all
#   ./scripts/reproduce-blocked-endpoints.sh --restore
#
# Note: requires sudo to modify /etc/hosts. Creates a backup of /etc/hosts
# at /tmp/hosts.backup.<timestamp>. Only modifies blocks between markers.

set -euo pipefail
IFS=$'\n\t'

TIMESTAMP=$(date +"%Y%m%dT%H%M%S")
BACKUP="/tmp/hosts.backup.${TIMESTAMP}"
MARKER_START="# >>> repro-blocked-endpoints START >>>"
MARKER_END="# <<< repro-blocked-endpoints END <<<"

HOSTS=(
  "api.openai.com"
  "api.elevenlabs.io"
)

ACTION="${1:-}"
HOSTS_FILE="/etc/hosts"

ensure_sudo() {
  if [ "$EUID" -ne 0 ]; then
    echo "This script needs sudo to modify $HOSTS_FILE. Re-run with sudo."
    exit 1
  fi
}

backup_hosts() {
  cp "$HOSTS_FILE" "$BACKUP"
  echo "Backup of $HOSTS_FILE saved to $BACKUP"
}

block_hosts() {
  backup_hosts
  # Remove existing block marker if any
  sed -i.bak "/$MARKER_START/,/$MARKER_END/d" "$HOSTS_FILE" || true
  {
    echo "$MARKER_START"
    for h in "${HOSTS[@]}"; do
      echo "127.0.0.1 $h"
    done
    echo "$MARKER_END"
  } >> "$HOSTS_FILE"
  echo "Hosts blocked. Run your app to reproduce failure. To restore, run --restore"
}

restore_hosts() {
  if [ ! -f "$BACKUP" ]; then
    # attempt to remove markers if no backup
    sed -i.bak "/$MARKER_START/,/$MARKER_END/d" "$HOSTS_FILE" || true
    echo "No backup found, removed repro markers (if any)."
    return 0
  fi
  cp "$BACKUP" "$HOSTS_FILE"
  echo "Restored $HOSTS_FILE from $BACKUP"
}

usage() {
  cat <<EOF
Usage: $0 --block-all | --restore
  --block-all     Add entries to $HOSTS_FILE to route target hosts to 127.0.0.1
  --restore       Restore original $HOSTS_FILE from backup
EOF
}

case "$ACTION" in
  --block-all)
    ensure_sudo
    block_hosts
    ;;
  --restore)
    ensure_sudo
    restore_hosts
    ;;
  *)
    usage
    exit 2
    ;;
esac