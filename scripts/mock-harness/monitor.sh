#!/bin/bash

set -e

echo "=== MOBIUS Monitoring Service ==="

ENVIRONMENT=${ENVIRONMENT:-staging}
MONITORING_DURATION=${MONITORING_DURATION:-300}  # 5 minutes default
ERROR_THRESHOLD=${ERROR_THRESHOLD:-5}             # 5% error rate
LATENCY_THRESHOLD=${LATENCY_THRESHOLD:-2000}      # 2000ms latency threshold

echo "📊 Monitoring Configuration:"
echo "  Environment: $ENVIRONMENT"
echo "  Duration: ${MONITORING_DURATION}s"
echo "  Error Threshold: ${ERROR_THRESHOLD}%"
echo "  Latency Threshold: ${LATENCY_THRESHOLD}ms"

START_TIME=$(date +%s)
END_TIME=$((START_TIME + MONITORING_DURATION))

echo "🔍 Starting adaptive monitoring..."

while [ $(date +%s) -lt $END_TIME ]; do
    CURRENT_TIME=$(date +%s)
    ELAPSED=$((CURRENT_TIME - START_TIME))
    REMAINING=$((END_TIME - CURRENT_TIME))
    
    echo "⏱️  Monitor checkpoint: ${ELAPSED}s elapsed, ${REMAINING}s remaining"
    
    # Mock metrics collection
    ERROR_RATE=$((RANDOM % 10))        # Random 0-9%
    AVG_LATENCY=$((800 + RANDOM % 400)) # Random 800-1200ms
    HEALTH_STATUS=$((RANDOM % 100))     # 0-99, >95 = unhealthy
    
    echo "📈 Current Metrics:"
    echo "  🔴 Error Rate: ${ERROR_RATE}%"
    echo "  ⚡ Avg Latency: ${AVG_LATENCY}ms"
    echo "  💚 Health Score: ${HEALTH_STATUS}/100"
    
    # Check thresholds
    if [ $ERROR_RATE -gt $ERROR_THRESHOLD ]; then
        echo "🚨 ERROR THRESHOLD EXCEEDED: ${ERROR_RATE}% > ${ERROR_THRESHOLD}%"
        echo "🔄 AUTO-ROLLBACK TRIGGERED"
        ./scripts/mock-harness/rollback.sh --to previous --env $ENVIRONMENT --no-dry-run
        ./scripts/mock-harness/notify.sh "AUTO-ROLLBACK: Error rate ${ERROR_RATE}% exceeded threshold" "critical"
        exit 1
    fi
    
    if [ $AVG_LATENCY -gt $LATENCY_THRESHOLD ]; then
        echo "🚨 LATENCY THRESHOLD EXCEEDED: ${AVG_LATENCY}ms > ${LATENCY_THRESHOLD}ms"
        echo "🔄 AUTO-ROLLBACK TRIGGERED"
        ./scripts/mock-harness/rollback.sh --to previous --env $ENVIRONMENT --no-dry-run
        ./scripts/mock-harness/notify.sh "AUTO-ROLLBACK: Latency ${AVG_LATENCY}ms exceeded threshold" "critical"
        exit 1
    fi
    
    if [ $HEALTH_STATUS -lt 90 ]; then
        echo "⚠️  Health degradation detected: ${HEALTH_STATUS}/100"
    fi
    
    sleep 10  # Check every 10 seconds
done

echo "✅ Monitoring completed successfully - no rollback needed"
echo "📊 Final Status: System stable within thresholds"

# Send completion notification
./scripts/mock-harness/notify.sh "Monitoring completed: System stable for ${MONITORING_DURATION}s" "success"