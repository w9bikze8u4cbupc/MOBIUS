#!/usr/bin/env bash
set -euo pipefail
DEST="${1:-$PWD/MOBIUS}"
SOURCES=(./old_frontend ./legacy ./backup ./client_backup)  # edit to match your repo
mkdir -p "$DEST"
echo "Consolidating into $DEST"

for s in "${SOURCES[@]}"; do
  if [[ -d "$s" ]]; then
    echo "Copying $s -> $DEST/$(basename $s)"
    rsync -a --info=progress2 "$s" "$DEST/"
  else
    echo "Source not found: $s"
  fi
done

echo "Done. Please review $DEST and remove duplicates as needed."