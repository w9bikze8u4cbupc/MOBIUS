#!/usr/bin/env bash
# Cross-platform desktop shortcut verification script

NAME="${1:-Mobius Tutorial Generator}"
URL="${2:-http://localhost:3000}"

# Detect OS
OS="unknown"
if [[ "$OSTYPE" == "darwin"* ]]; then
  OS="macOS"
elif [[ "$OSTYPE" == "linux-gnu"* ]]; then
  OS="Linux"
fi

function test_desktop_shortcut() {
  local desktop_paths=("$HOME/Desktop")
  local shortcut_path=""
  
  # Add additional desktop paths if they exist
  if [[ -n "$XDG_DESKTOP_DIR" && -d "$XDG_DESKTOP_DIR" ]]; then
    desktop_paths+=("$XDG_DESKTOP_DIR")
  fi
  
  # Check each desktop path
  for desktop in "${desktop_paths[@]}"; do
    case "$OS" in
      "macOS")
        shortcut_path="$desktop/$NAME.webloc"
        ;;
      "Linux")
        shortcut_path="$desktop/$NAME.desktop"
        ;;
      *)
        shortcut_path="$desktop/$NAME.lnk"
        ;;
    esac
    
    if [[ -f "$shortcut_path" ]]; then
      echo "✅ Desktop shortcut found: $shortcut_path"
      return 0
    fi
  done
  
  echo "❌ Desktop shortcut not found in any checked locations:"
  for desktop in "${desktop_paths[@]}"; do
    case "$OS" in
      "macOS")
        echo "   Checked: $desktop/$NAME.webloc"
        ;;
      "Linux")
        echo "   Checked: $desktop/$NAME.desktop"
        ;;
      *)
        echo "   Checked: $desktop/$NAME.lnk"
        ;;
    esac
  done
  return 1
}

# Main execution
echo "🔍 Verifying desktop shortcut for '$NAME'"
echo "🔗 Expected URL: $URL"
echo ""

if test_desktop_shortcut; then
  echo ""
  echo "✅ Desktop shortcut verification PASSED"
  exit 0
else
  echo ""
  echo "❌ Desktop shortcut verification FAILED"
  echo "💡 Tip: Run the appropriate create-desktop-shortcut script for your platform"
  exit 1
fi