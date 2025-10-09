#!/usr/bin/env bash
# Manual commands for updating preview worker image

# create branch
git fetch origin
git checkout -b feat/preview-worker-k8s-final-image

# replace placeholder (GNU sed or perl fallback)
# Using Perl (cross-platform):
find k8s/preview-worker -type f -name '*.yaml' -print0 | xargs -0 -n1 perl -0777 -pe "s/\QYOUR_REGISTRY/mobius-preview-worker:TAG\E/registry.example.com\/mobius-preview-worker:1.0.0/g" -i.bak

# stage, review, commit, push
git add k8s/preview-worker
git diff --staged -- k8s/preview-worker | sed -n '1,200p'
kubectl apply --dry-run=client -f k8s/preview-worker || true
git commit -m "chore(k8s): update preview-worker image -> registry.example.com/mobius-preview-worker:1.0.0"
git push -u origin feat/preview-worker-k8s-final-image