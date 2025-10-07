#!/usr/bin/env bash
NAME="${1:-Mobius Tutorial Generator}"
URL="${2:-http://localhost:3000}"
DESKTOP="$HOME/Desktop"
FILE="$DESKTOP/$NAME.desktop"

cat > "$FILE" <<EOF
[Desktop Entry]
Name=$NAME
Exec=xdg-open $URL
Icon=applications-internet
Type=Application
Terminal=false
EOF

chmod +x "$FILE"
echo "Created $FILE (executable)"