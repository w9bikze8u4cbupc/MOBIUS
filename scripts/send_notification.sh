#!/bin/bash
set -euo pipefail

# MOBIUS Notification Script
# Usage: ./send_notification.sh --type <type> [options]

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

# Default values
NOTIFICATION_TYPE=""
ENVIRONMENT=""
WEBHOOK_URL="${SLACK_WEBHOOK_URL:-}"
DRY_RUN=false

log() {
    echo "[$(date +'%Y-%m-%d %H:%M:%S')] $*"
}

error() {
    echo "[$(date +'%Y-%m-%d %H:%M:%S')] ERROR: $*" >&2
    exit 1
}

usage() {
    cat << EOF
Usage: $0 --type <notification_type> [options]

Notification Types:
    deploy_start       Deployment started
    deploy_success     Deployment completed successfully
    deploy_failed      Deployment failed
    alert              System alert/warning
    rollback_started   Rollback initiated
    rollback_completed Rollback completed

Common Options:
    --environment ENV  Target environment (staging|production)
    --dry-run         Show what would be sent without sending
    --help            Show this help message

Deploy-specific Options:
    --release TAG     Release tag/version
    --deploy-lead USER Deploy lead username
    --duration TIME   Deployment duration
    --error MSG       Error message (for failed deployments)

Alert-specific Options:
    --alert-type TYPE    Type of alert
    --metric NAME        Metric name
    --current-value VAL  Current metric value
    --threshold VAL      Alert threshold value
    --alert-duration TIME How long alert has been active

Rollback-specific Options:
    --backup FILE     Backup file used for rollback
    --rollback-reason REASON Why rollback was initiated

Environment Variables:
    SLACK_WEBHOOK_URL  Slack webhook URL
    TEAMS_WEBHOOK_URL  Teams webhook URL
    DISCORD_WEBHOOK_URL Discord webhook URL
EOF
    exit 1
}

parse_args() {
    while [[ $# -gt 0 ]]; do
        case $1 in
            --type)
                NOTIFICATION_TYPE="$2"
                shift 2
                ;;
            --environment)
                ENVIRONMENT="$2"
                shift 2
                ;;
            --release)
                RELEASE_TAG="$2"
                shift 2
                ;;
            --deploy-lead)
                DEPLOY_LEAD="$2"
                shift 2
                ;;
            --duration)
                DURATION="$2"
                shift 2
                ;;
            --error)
                ERROR_MESSAGE="$2"
                shift 2
                ;;
            --alert-type)
                ALERT_TYPE="$2"
                shift 2
                ;;
            --metric)
                METRIC_NAME="$2"
                shift 2
                ;;
            --current-value)
                CURRENT_VALUE="$2"
                shift 2
                ;;
            --threshold)
                THRESHOLD_VALUE="$2"
                shift 2
                ;;
            --alert-duration)
                ALERT_DURATION="$2"
                shift 2
                ;;
            --backup)
                BACKUP_FILE="$2"
                shift 2
                ;;
            --rollback-reason)
                ROLLBACK_REASON="$2"
                shift 2
                ;;
            --dry-run)
                DRY_RUN=true
                shift
                ;;
            --help)
                usage
                ;;
            *)
                error "Unknown option: $1"
                ;;
        esac
    done

    if [[ -z "$NOTIFICATION_TYPE" ]]; then
        error "Notification type is required (--type)"
    fi
}

get_emoji_for_type() {
    case "$NOTIFICATION_TYPE" in
        deploy_start) echo "🚀" ;;
        deploy_success) echo "✅" ;;
        deploy_failed) echo "❌" ;;
        alert) echo "⚠️" ;;
        rollback_started) echo "🔄" ;;
        rollback_completed) echo "✅" ;;
        *) echo "📢" ;;
    esac
}

get_color_for_type() {
    case "$NOTIFICATION_TYPE" in
        deploy_start) echo "#0099cc" ;;
        deploy_success) echo "#28a745" ;;
        deploy_failed) echo "#dc3545" ;;
        alert) echo "#ffc107" ;;
        rollback_started) echo "#fd7e14" ;;
        rollback_completed) echo "#28a745" ;;
        *) echo "#6f42c1" ;;
    esac
}

create_slack_message() {
    local emoji
    local title
    local color
    
    emoji=$(get_emoji_for_type)
    color=$(get_color_for_type)
    
    case "$NOTIFICATION_TYPE" in
        deploy_start)
            title="MOBIUS Deploy Started"
            ;;
        deploy_success)
            title="MOBIUS Deploy Completed"
            ;;
        deploy_failed)
            title="MOBIUS Deploy Failed"
            ;;
        alert)
            title="MOBIUS Alert - ${ALERT_TYPE:-System Alert}"
            ;;
        rollback_started)
            title="MOBIUS Rollback Initiated"
            ;;
        rollback_completed)
            title="MOBIUS Rollback Completed"
            ;;
    esac

    cat << EOF
{
    "text": "$emoji **$title**",
    "attachments": [
        {
            "color": "$color",
            "fields": [
                {
                    "title": "Environment",
                    "value": "\`${ENVIRONMENT}\`",
                    "short": true
                }
EOF

    # Add type-specific fields
    case "$NOTIFICATION_TYPE" in
        deploy_start|deploy_success|deploy_failed)
            cat << EOF
                ,{
                    "title": "Release",
                    "value": "\`${RELEASE_TAG:-unknown}\`",
                    "short": true
                },
                {
                    "title": "Deploy Lead", 
                    "value": "${DEPLOY_LEAD:-@ops}",
                    "short": true
                }
EOF
            if [[ -n "${DURATION:-}" ]]; then
                cat << EOF
                ,{
                    "title": "Duration",
                    "value": "${DURATION}",
                    "short": true
                }
EOF
            fi
            
            if [[ -n "${ERROR_MESSAGE:-}" ]]; then
                cat << EOF
                ,{
                    "title": "Error",
                    "value": "${ERROR_MESSAGE}",
                    "short": false
                }
EOF
            fi
            ;;
            
        alert)
            cat << EOF
                ,{
                    "title": "Alert Type",
                    "value": "${ALERT_TYPE:-Unknown}",
                    "short": true
                },
                {
                    "title": "Metric",
                    "value": "${METRIC_NAME:-unknown}",
                    "short": true
                },
                {
                    "title": "Current Value", 
                    "value": "${CURRENT_VALUE:-unknown}",
                    "short": true
                },
                {
                    "title": "Threshold",
                    "value": "${THRESHOLD_VALUE:-unknown}",
                    "short": true
                }
EOF
            ;;
            
        rollback_started|rollback_completed)
            cat << EOF
                ,{
                    "title": "Backup File",
                    "value": "\`${BACKUP_FILE:-unknown}\`",
                    "short": false
                }
EOF
            if [[ -n "${ROLLBACK_REASON:-}" ]]; then
                cat << EOF
                ,{
                    "title": "Reason",
                    "value": "${ROLLBACK_REASON}",
                    "short": false
                }
EOF
            fi
            ;;
    esac

    cat << EOF
            ],
            "footer": "MOBIUS Deployment System",
            "ts": $(date +%s)
        }
    ]
}
EOF
}

send_slack_notification() {
    if [[ -z "$WEBHOOK_URL" ]]; then
        log "Warning: No Slack webhook URL configured (SLACK_WEBHOOK_URL)"
        return 0
    fi
    
    local message
    message=$(create_slack_message)
    
    if [[ "$DRY_RUN" == true ]]; then
        log "DRY RUN: Would send to Slack:"
        echo "$message" | jq .
        return 0
    fi
    
    log "Sending Slack notification..."
    
    if curl -s -X POST -H 'Content-type: application/json' \
        --data "$message" \
        "$WEBHOOK_URL" | grep -q "ok"; then
        log "✓ Slack notification sent successfully"
    else
        log "✗ Failed to send Slack notification"
        return 1
    fi
}

send_simple_webhook() {
    local webhook_url="$1"
    local service_name="$2"
    
    if [[ -z "$webhook_url" ]]; then
        log "Warning: No $service_name webhook URL configured"
        return 0
    fi
    
    local simple_message
    emoji=$(get_emoji_for_type)
    
    simple_message=$(cat << EOF
{
    "content": "$emoji **MOBIUS ${NOTIFICATION_TYPE}** in \`${ENVIRONMENT}\` - ${RELEASE_TAG:-${ALERT_TYPE:-${BACKUP_FILE:-notification}}}"
}
EOF
    )
    
    if [[ "$DRY_RUN" == true ]]; then
        log "DRY RUN: Would send to $service_name:"
        echo "$simple_message" | jq .
        return 0
    fi
    
    log "Sending $service_name notification..."
    
    if curl -s -X POST -H 'Content-type: application/json' \
        --data "$simple_message" \
        "$webhook_url" >/dev/null; then
        log "✓ $service_name notification sent successfully"
    else
        log "✗ Failed to send $service_name notification"
        return 1
    fi
}

main() {
    log "Sending $NOTIFICATION_TYPE notification..."
    
    if [[ "$DRY_RUN" == true ]]; then
        log "DRY RUN mode enabled - notifications will not actually be sent"
    fi
    
    # Send to configured services
    local services_sent=0
    
    # Slack
    if send_slack_notification; then
        ((services_sent++))
    fi
    
    # Teams
    if [[ -n "${TEAMS_WEBHOOK_URL:-}" ]]; then
        if send_simple_webhook "$TEAMS_WEBHOOK_URL" "Teams"; then
            ((services_sent++))
        fi
    fi
    
    # Discord
    if [[ -n "${DISCORD_WEBHOOK_URL:-}" ]]; then
        if send_simple_webhook "$DISCORD_WEBHOOK_URL" "Discord"; then
            ((services_sent++))
        fi
    fi
    
    if [[ $services_sent -gt 0 ]]; then
        log "Notification sent to $services_sent service(s)"
    else
        log "Warning: No notifications were sent (no webhooks configured or all failed)"
    fi
}

parse_args "$@"
main