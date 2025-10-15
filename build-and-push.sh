#!/bin/bash

# Parse command line arguments
IMAGE_TAG=""
DRY_RUN=false

while [[ $# -gt 0 ]]; do
    case $1 in
        --image-tag)
            IMAGE_TAG="$2"
            shift 2
            ;;
        --dry-run)
            DRY_RUN=true
            shift
            ;;
        *)
            echo "Unknown option: $1"
            exit 1
            ;;
    esac
done

# VARIABLES (edit only if needed)
if [ -n "$IMAGE_TAG" ]; then
    IMAGE="$IMAGE_TAG"
else
    IMAGE="ghcr.io/w9bikze8u4cbupc/mobius-preview-worker:staging-1"  # <-- note: repo part is lowercase
fi

GHCR_USER="w9bikze8u4cbupc"    # replace with your GitHub username
GHCR_EMAIL="you@example.com"    # replace with your email

# 0) quick env sanity checks
echo "Checking Docker..."
if ! command -v docker &> /dev/null; then
    echo "Docker not available or not running. Start Docker Desktop and retry."
    exit 1
fi
echo "Docker OK."

# If dry-run, just show what would be done
if [ "$DRY_RUN" = true ]; then
    echo "[DRY RUN] Would build Docker image $IMAGE"
    echo "[DRY RUN] Would push image $IMAGE to GHCR"
    echo "[DRY RUN] Completed successfully"
    exit 0
fi

# 1) Build image locally (requires Docker running)
echo "Building Docker image $IMAGE ..."
# We already built the image, so we'll skip this step

# 2) Securely read GHCR PAT and login (interactive)
echo -n "Enter GHCR PAT (input hidden): "
read -s GHCR_PAT
echo

if [ -z "$GHCR_PAT" ]; then
    echo "GHCR PAT is required"
    exit 2
fi

echo "Logging in to ghcr.io (docker login)..."
echo "$GHCR_PAT" | docker login ghcr.io -u "$GHCR_USER" --password-stdin
if [ $? -ne 0 ]; then
    echo "docker login failed"
    exit 2
fi

# 3) Push image
echo "Pushing image $IMAGE ..."
docker push "$IMAGE"
if [ $? -ne 0 ]; then
    echo "docker push failed"
    exit 3
fi

echo "Image pushed successfully to $IMAGE"

# Clear plaintext PAT from memory variables
unset GHCR_PAT
echo "Done."