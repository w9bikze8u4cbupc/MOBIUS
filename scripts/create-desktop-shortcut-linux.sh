#!/usr/bin/env bash
NAME="${1:-Mobius Tutorial Generator}"
URL="${2:-http://localhost:3000}"
DESKTOP="${XDG_DESKTOP_DIR:-$HOME/Desktop}"
if [ ! -d "$DESKTOP" ]; then
  mkdir -p "$DESKTOP" || { echo "Error: cannot create Desktop dir"; exit 1; }
fi
FILE="$DESKTOP/$NAME.desktop"

cat > "$FILE" <<EOF
[Desktop Entry]
Name=$NAME
Exec=xdg-open "$URL"
Type=Application
Terminal=false
EOF

chmod +x "$FILE"
echo "Created $FILE (executable)"