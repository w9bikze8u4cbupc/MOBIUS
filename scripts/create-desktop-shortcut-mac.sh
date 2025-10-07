#!/usr/bin/env bash
NAME="${1:-Mobius Tutorial Generator}"
URL="${2:-http://localhost:3000}"
DESKTOP="$HOME/Desktop"
if [ ! -d "$DESKTOP" ]; then
  mkdir -p "$DESKTOP" || { echo "Error: cannot create Desktop dir"; exit 1; }
fi
FILE="$DESKTOP/$NAME.webloc"

# escape XML characters for URL then write .webloc
URL_ESCAPED=$(printf '%s' "$URL" | sed 's/&/\&amp;/g; s/</\&lt;/g; s/>/\&gt;/g; s/"/\&quot;/g; s/'"'"'/\&apos;/g')
cat > "$FILE" <<EOF
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
  <dict>
    <key>URL</key>
    <string>$URL_ESCAPED</string>
  </dict>
</plist>
EOF

echo "Created $FILE"
# make it show as link in Finder; user can double-click to open