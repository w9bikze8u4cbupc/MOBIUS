#!/usr/bin/env bash
set -euo pipefail

# Change this if you want a different final tag
IMAGE_TAG="registry.example.com/mobius-preview-worker:1.0.0"
BRANCH="feat/preview-worker-k8s-final-image"
K8S_DIR="k8s/preview-worker"

echo "Creating branch ${BRANCH}..."
git fetch origin
git checkout -b "${BRANCH}"

echo "Replacing any mobius-preview-worker image references with '${IMAGE_TAG}' in ${K8S_DIR}..."
# Only operate on YAML files inside k8s/preview-worker
find "${K8S_DIR}" -type f -name "*.yaml" -print0 \
  | xargs -0 -n1 perl -0777 -pe "s/\b\S*mobius-preview-worker:[^\s\"']+\b/${IMAGE_TAG}/g" -i.bak

echo "Staging changes for review..."
git add -A "${K8S_DIR}"

echo "Showing staged diff (first 300 lines)..."
git --no-pager diff --staged -- "${K8S_DIR}" | sed -n '1,300p' || true

if command -v kubectl >/dev/null 2>&1; then
  echo "Validating manifests with kubectl --dry-run=client..."
  kubectl apply --dry-run=client -f "${K8S_DIR}"
else
  echo "kubectl not found; skipping dry-run validation."
fi

echo "Committing changes..."
git commit -m "chore(k8s): update preview-worker image -> ${IMAGE_TAG}" || echo "Nothing to commit (no changes)."

echo "Pushing branch to origin/${BRANCH}..."
git push -u origin "${BRANCH}"

echo "Cleaning up .bak backup files..."
find "${K8S_DIR}" -type f -name "*.bak" -delete

echo "Done. Branch ${BRANCH} pushed. Create a PR from this branch to main and use the existing PR body file."