#!/usr/bin/env bash
set -euo pipefail

echo "🔍 Validating deployment readiness framework..."

# Check required scripts
SCRIPTS=(
  "github/scripts/branch-protection-setup.sh"
  "github/scripts/send-notification.js"
)

for script in "${SCRIPTS[@]}"; do
  if [[ -x "$script" ]]; then
    echo "✅ $script (executable)"
  elif [[ -f "$script" ]]; then
    echo "⚠️  $script (not executable)"
  else
    echo "❌ $script (missing)"
  fi
done

# Check required templates
TEMPLATES=(
  ".github/pull_request_template.md"
  ".github/ci-pr-comment.md"
  ".github/deploy-cheatsheet.md"
  ".github/branch-protection-setup.md"
  ".github/slack-notifications.md"
  ".github/teams-notifications.md"
  ".github/notification-script-examples.md"
)

for template in "${TEMPLATES[@]}"; do
  if [[ -f "$template" ]]; then
    echo "✅ $template"
  else
    echo "❌ $template (missing)"
  fi
done

# Check workflows
WORKFLOWS=(
  ".github/workflows/ci.yml"
  ".github/workflows/premerge-validation.yml"
)

for workflow in "${WORKFLOWS[@]}"; do
  if [[ -f "$workflow" ]]; then
    echo "✅ $workflow"
  else
    echo "❌ $workflow (missing)"
  fi
done

# Check example JSON files
JSON_FILES=(
  "slack_deploy_started.json"
  "teams_deploy_started.json"
)

for json_file in "${JSON_FILES[@]}"; do
  if [[ -f "$json_file" ]]; then
    echo "✅ $json_file"
  else
    echo "❌ $json_file (missing)"
  fi
done

echo ""
echo "🧪 Testing notification script..."
if node github/scripts/send-notification.js --service slack --template deployment-started --release v1.0.0 --pr 123 --env staging --lead "Test User" --dry-run > /dev/null 2>&1; then
  echo "✅ Notification script test passed"
else
  echo "❌ Notification script test failed"
fi

echo ""
echo "✅ Validation complete!"