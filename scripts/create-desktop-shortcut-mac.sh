#!/usr/bin/env bash
NAME="${1:-Mobius Tutorial Generator}"
URL="${2:-http://localhost:3000}"
DESKTOP="$HOME/Desktop"
FILE="$DESKTOP/$NAME.webloc"

cat > "$FILE" <<EOF
<?xml version="1.0" encoding="UTF-8"?>
<plist version="1.0">
  <dict>
    <key>URL</key>
    <string>$URL</string>
  </dict>
</plist>
EOF

echo "Created $FILE"
# make it show as link in Finder; user can double-click to open