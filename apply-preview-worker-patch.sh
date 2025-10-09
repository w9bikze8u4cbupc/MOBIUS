#!/usr/bin/env bash
set -euo pipefail

IMAGE_TAG="registry.example.com/mobius-preview-worker:1.0.0"
BRANCH="feat/preview-worker-k8s-final-image"
K8S_DIR="k8s/preview-worker"
PATCH_FILE="update-preview-worker-image.patch"

echo "Creating branch ${BRANCH}..."
git checkout -b "${BRANCH}"

echo "Applying patch to update image tag to ${IMAGE_TAG}..."
git apply "${PATCH_FILE}"

# Show diffs for review
echo "Showing git diff of changes:"
git diff -- "${K8S_DIR}" || true

echo "Validating manifests with kubectl --dry-run=client (no cluster changes)..."
if command -v kubectl >/dev/null 2>&1; then
  kubectl apply --dry-run=client -f "${K8S_DIR}"
else
  echo "kubectl not found in PATH — skipping dry-run validation. Install kubectl to validate."
fi

echo "Staging and committing changes..."
git add "${K8S_DIR}"
git commit -m "chore(k8s): update preview-worker image -> ${IMAGE_TAG}" || echo "Nothing to commit (no changes)."

echo "Pushing branch to origin/${BRANCH}..."
git push -u origin "${BRANCH}"

echo "Done. Branch ${BRANCH} pushed. Open a PR from this branch to main."