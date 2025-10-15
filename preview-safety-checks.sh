#!/usr/bin/env bash
# Quick preview & safety checks before running the script

echo "Preview what will be replaced without changing files:"
grep -R --line-number --color=always "mobius-preview-worker:" k8s/preview-worker || true

echo -e "\nShow exact matches:"
grep -R --line-number -o "[-a-zA-Z0-9./]*mobius-preview-worker:[^[:space:]\"']*" k8s/preview-worker || true

echo -e "\nIf you want to test the replacement on a single file before running across the directory, run:"
echo "perl -0777 -pe \"s/\b\S*mobius-preview-worker:[^\s\"']+\b/registry.example.com\/mobius-preview-worker:1.0.0/g\" -i.bak k8s/preview-worker/deployment.yaml"
echo "git add k8s/preview-worker/deployment.yaml"
echo "git diff --staged k8s/preview-worker/deployment.yaml"

echo -e "\nThen revert if needed:"
echo "git restore --staged k8s/preview-worker/deployment.yaml"
echo "mv k8s/preview-worker/deployment.yaml.bak k8s/preview-worker/deployment.yaml"