#!/bin/bash

set -e

echo "=== MOBIUS Notification Service ==="

MESSAGE=${1:-"Default notification message"}
NOTIFICATION_TYPE=${2:-"info"}
OUTPUT_DIR=${OUTPUT_DIR:-"./notifications_out"}

# Ensure output directory exists
mkdir -p "$OUTPUT_DIR"

TIMESTAMP=$(date +%Y%m%d_%H%M%S)
NOTIFICATION_FILE="$OUTPUT_DIR/notification_${TIMESTAMP}.json"

echo "📢 Sending notification: $NOTIFICATION_TYPE"
echo "💬 Message: $MESSAGE"

# Create notification payload
cat > "$NOTIFICATION_FILE" << EOF
{
  "timestamp": "$(date -u +%Y-%m-%dT%H:%M:%SZ)",
  "type": "$NOTIFICATION_TYPE",
  "message": "$MESSAGE",
  "source": "mobius-deploy",
  "environment": "${ENVIRONMENT:-staging}",
  "status": "sent"
}
EOF

# Mock notification sending (replace with real notification logic)
echo "📡 Notification channels:"

# Mock Slack notification
echo "  📱 Slack: #deployment-notifications"
echo "    Status: sent (mock)"

# Mock email notification  
echo "  📧 Email: ops@company.com"
echo "    Status: sent (mock)"

# Mock webhook notification
echo "  🔗 Webhook: https://api.company.com/notifications"
echo "    Status: sent (mock)"

echo "✅ Notification sent successfully"
echo "📄 Notification logged: $NOTIFICATION_FILE"

# Output for other scripts
echo "NOTIFICATION_FILE=$NOTIFICATION_FILE" >> "$GITHUB_OUTPUT" 2>/dev/null || true