#!/bin/bash

# VARIABLES (edit only if needed)
IMAGE="ghcr.io/w9bikze8u4cbupc/mobius-preview-worker:staging-1"  # <-- note: repo part is lowercase
GHCR_USER="w9bikze8u4cbupc"    # replace with your GitHub username
GHCR_EMAIL="you@example.com"    # replace with your email
BRANCH="chore/harden-preview-worker"
K8S_DIR="k8s/preview-worker"     # directory containing manifests to apply
NAMESPACE="preview-worker"
IMAGE_PULL_SECRET_NAME="ghcr-regcred"

# 0) quick env sanity checks
echo "Checking Docker..."
if ! command -v docker &> /dev/null; then
    echo "Docker not available or not running. Start Docker Desktop and retry."
    exit 1
fi
echo "Docker OK."

echo "Checking kubectl connectivity..."
if ! command -v kubectl &> /dev/null; then
    echo "kubectl not available"
    exit 1
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

# 4) Update manifests: replace first image: field occurrences under $K8S_DIR (idempotent)
echo "Updating manifests in $K8S_DIR to use image $IMAGE ..."

# Find all yaml/yml files and update them
find "$K8S_DIR" -type f \( -name "*.yaml" -o -name "*.yml" \) -exec sed -i.bak \
  -e "s|YOUR_REGISTRY/mobius-preview-worker:ci|$IMAGE|g" \
  -e "s|ghcr.io/mobius-org/mobius-preview-worker:1.0.0|$IMAGE|g" {} \;

# Remove backup files
find "$K8S_DIR" -type f -name "*.bak" -delete

echo "Updated manifests in $K8S_DIR"

# 5) Commit & push (optional) - create branch if not exists, commit changed manifests
echo "Committing manifest changes to branch $BRANCH ..."
if ! git rev-parse --verify "$BRANCH" &>/dev/null; then
    git checkout -b "$BRANCH"
else
    git checkout "$BRANCH"
fi

git add "$K8S_DIR"
git commit -m "chore(k8s): set preview-worker image to $IMAGE" || echo "No changes to commit."
git push -u origin "$BRANCH"

# 6) Create imagePullSecret (idempotent) for GHCR using --dry-run=client | apply
echo "Creating imagePullSecret $IMAGE_PULL_SECRET_NAME in namespace $NAMESPACE ..."
kubectl create secret docker-registry "$IMAGE_PULL_SECRET_NAME" \
  --docker-server=ghcr.io \
  --docker-username="$GHCR_USER" \
  --docker-password="$GHCR_PAT" \
  --docker-email="$GHCR_EMAIL" \
  --namespace "$NAMESPACE" --dry-run=client -o yaml | kubectl apply -f -

if [ $? -ne 0 ]; then
    echo "Failed to create or apply imagePullSecret"
    exit 4
fi

# 7) Patch ServiceAccount (optional) to include imagePullSecret (safe to re-run)
SA_NAME="preview-worker"   # adjust if different
echo "Patching ServiceAccount $SA_NAME in namespace $NAMESPACE to include imagePullSecret..."
kubectl -n "$NAMESPACE" patch serviceaccount "$SA_NAME" -p "{\"imagePullSecrets\":[{\"name\":\"$IMAGE_PULL_SECRET_NAME\"}]}" --dry-run=client -o yaml | kubectl apply -f - || echo "Patch may have failed (check SA name or cluster connectivity)."

# 8) Apply manifests (idempotent)
echo "Creating namespace $NAMESPACE if it doesn't exist..."
kubectl create namespace "$NAMESPACE" 2>/dev/null || echo "Namespace $NAMESPACE already exists or creation failed."

echo "Applying manifests from $K8S_DIR to namespace $NAMESPACE ..."
kubectl -n "$NAMESPACE" apply -f "$K8S_DIR"
if [ $? -ne 0 ]; then
    echo "kubectl apply failed"
    exit 6
fi

# 9) Wait for rollout
echo "Waiting for rollout of deployment/preview-worker..."
kubectl -n "$NAMESPACE" rollout status deployment/preview-worker --timeout=180s || echo "Rollout failed or timed out. Run: kubectl -n $NAMESPACE get pods -o wide && kubectl -n $NAMESPACE describe pod <podname>"

# 10) Smoke test (run a transient curl container to check /healthz and /metrics)
echo "Running smoke tests (health + metrics) using a transient curl image..."
kubectl -n "$NAMESPACE" run --rm -i --restart=Never smoke-curl --image=curlimages/curl --command -- sh -c "echo 'Checking /healthz...'; if curl -fsS http://preview-worker/healthz; then echo 'healthz OK'; else echo 'healthz FAILED' >&2; exit 2; fi; echo 'Checking /metrics...'; if curl -fsS http://preview-worker/metrics | head -n 5; then echo 'metrics OK'; else echo 'metrics FAILED' >&2; exit 3; fi"

if [ $? -ne 0 ]; then
    echo "Smoke test failed. Get pod logs: kubectl -n $NAMESPACE logs -l app=preview-worker --tail=200"
fi

# 11) Rollback one-liner (if needed)
echo "If you need to rollback: kubectl -n $NAMESPACE rollout undo deployment/preview-worker"

# Clear plaintext PAT from memory variables
unset GHCR_PAT
echo "Done."