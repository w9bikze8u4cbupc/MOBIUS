#!/bin/bash

set -e

echo "=== MOBIUS Quick Deploy Tool ==="

# Parse arguments
IMAGE_TAG=""
ENVIRONMENT="staging"
DRY_RUN="true"

while [[ $# -gt 0 ]]; do
    case $1 in
        --env)
            ENVIRONMENT="$2"
            shift 2
            ;;
        --no-dry-run)
            DRY_RUN="false"
            shift
            ;;
        --image-tag)
            IMAGE_TAG="$2"
            shift 2
            ;;
        *)
            if [ -z "$IMAGE_TAG" ]; then
                IMAGE_TAG="$1"
            fi
            shift
            ;;
    esac
done

if [ -z "$IMAGE_TAG" ]; then
    echo "❌ Error: Image tag is required"
    echo "Usage: $0 <image-tag> [--env staging|production] [--no-dry-run]"
    echo "Example: $0 v1.2.3 --env staging --no-dry-run"
    exit 1
fi

echo "🚀 Quick Deploy Configuration:"
echo "  Image Tag: $IMAGE_TAG"
echo "  Environment: $ENVIRONMENT"
echo "  Dry Run: $DRY_RUN"
echo ""

# Validate environment
if [[ "$ENVIRONMENT" != "staging" && "$ENVIRONMENT" != "production" ]]; then
    echo "❌ Error: Environment must be 'staging' or 'production'"
    exit 1
fi

# Production safety checks
if [ "$ENVIRONMENT" = "production" ]; then
    echo "🔐 Production deployment detected - additional safety checks required"
    
    # Check if this is a dry run for production
    if [ "$DRY_RUN" = "true" ]; then
        echo "🔍 Production dry run - safe to proceed"
    else
        echo "⚠️  PRODUCTION DEPLOYMENT WARNING ⚠️"
        echo "This will deploy to the production environment!"
        echo "Have you completed the production hardening checklist?"
        echo "- [ ] OAuth2/JWT authentication implemented"
        echo "- [ ] Redis/Celery task processing configured"
        echo "- [ ] Persistent artifact storage configured"
        echo "- [ ] Prometheus metrics enabled"
        echo "- [ ] End-to-end tests passing"
        echo ""
        read -p "Type 'DEPLOY TO PRODUCTION' to confirm: " confirmation
        if [ "$confirmation" != "DEPLOY TO PRODUCTION" ]; then
            echo "❌ Production deployment cancelled"
            exit 1
        fi
    fi
fi

echo "🏁 Starting deployment pipeline..."
echo ""

# Step 1: Pre-deployment checks
echo "1️⃣ Pre-deployment checks..."
if ! command -v docker &> /dev/null; then
    echo "❌ Docker not found - required for deployment"
    exit 1
fi

if ! command -v curl &> /dev/null; then
    echo "❌ curl not found - required for health checks"
    exit 1
fi

echo "✅ Pre-deployment checks passed"
echo ""

# Step 2: Backup
echo "2️⃣ Creating backup..."
if ! ./scripts/mock-harness/backup.sh; then
    echo "❌ Backup failed - aborting deployment"
    exit 1
fi
echo ""

# Step 3: Deploy
echo "3️⃣ Executing deployment..."
if ! ./scripts/mock-harness/deploy-wrapper.sh "$IMAGE_TAG" "$ENVIRONMENT" "$DRY_RUN"; then
    echo "❌ Deployment failed - initiating rollback"
    ./scripts/mock-harness/rollback.sh previous "$ENVIRONMENT" "$DRY_RUN"
    exit 1
fi
echo ""

# Step 4: Monitoring (only for non-dry-run deployments)
if [ "$DRY_RUN" = "false" ]; then
    echo "4️⃣ Starting T+60 adaptive monitoring..."
    echo "Monitoring will run for 5 minutes with auto-rollback triggers"
    
    # Set environment variables for monitoring
    export ENVIRONMENT="$ENVIRONMENT"
    export ERROR_THRESHOLD=5     # 5% error rate threshold
    export LATENCY_THRESHOLD=2000 # 2000ms latency threshold
    
    if ! ./scripts/mock-harness/monitor.sh; then
        echo "❌ Monitoring detected issues - rollback already initiated"
        exit 1
    fi
    
    echo "✅ Monitoring completed successfully - deployment is stable"
else
    echo "4️⃣ Monitoring skipped (dry run mode)"
fi

echo ""
echo "🎉 Quick deploy completed successfully!"
echo "📊 Deployment Summary:"
echo "  Image: $IMAGE_TAG"
echo "  Environment: $ENVIRONMENT"
echo "  Status: $([ "$DRY_RUN" = "true" ] && echo "Dry run completed" || echo "Deployed and stable")"

if [ "$ENVIRONMENT" = "staging" ]; then
    echo ""
    echo "📝 Next Steps for Production:"
    echo "  1. Verify staging deployment at: https://staging.mobius.com"
    echo "  2. Complete production hardening checklist"
    echo "  3. Run: $0 $IMAGE_TAG --env production --no-dry-run"
fi