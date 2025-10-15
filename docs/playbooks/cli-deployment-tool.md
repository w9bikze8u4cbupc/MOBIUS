# Mobius Preview Worker Deployment CLI

A simple command-line interface for deploying the Mobius Preview Worker application across different platforms.

## Overview

The Mobius Deployment CLI provides a unified interface for deploying the Preview Worker application regardless of the underlying platform (Windows, Linux, or macOS). It automatically detects the platform and executes the appropriate scripts.

## Installation

1. Ensure you have Node.js installed (version 14 or higher)
2. No additional installation is required - the CLI tool is ready to use directly

## Usage

```bash
# From the project root directory
node cli/mobius-deploy.js [command] [options]
```

### Commands

| Command | Description |
|---------|-------------|
| `build-push` | Build and push Docker image to GHCR |
| `update-manifests` | Update Kubernetes manifests with the correct image name |
| `apply-manifests` | Apply Kubernetes manifests to deploy the application |
| `deploy` | Full deployment (build, update, apply) |
| `verify` | Verify deployment status |
| `rollback` | Rollback to previous deployment |
| `status` | Show current deployment status |
| `logs` | Show deployment logs |
| `help` | Show help message |

### Options

| Option | Description |
|--------|-------------|
| `--platform [win|unix]` | Specify platform (auto-detected by default) |
| `--namespace` | Specify Kubernetes namespace (default: preview-worker) |
| `--image-tag` | Specify Docker image tag |
| `--dry-run` | Perform a dry run without making changes |

## Examples

### Build and Push Docker Image
```bash
node cli/mobius-deploy.js build-push
```

### Update Kubernetes Manifests
```bash
node cli/mobius-deploy.js update-manifests
```

### Deploy to Kubernetes
```bash
node cli/mobius-deploy.js deploy
```

### Deploy with Custom Image Tag
```bash
node cli/mobius-deploy.js deploy --image-tag ghcr.io/w9bikze8u4cbupc/mobius-preview-worker:v1.2.3
```

### Deploy to Custom Namespace
```bash
node cli/mobius-deploy.js deploy --namespace production
```

### Perform Dry Run
```bash
node cli/mobius-deploy.js deploy --dry-run
```

### Verify Deployment Status
```bash
node cli/mobius-de verify
```

### Check Deployment Status
```bash
node cli/mobius-deploy.js status
```

### View Deployment Logs
```bash
node cli/mobius-deploy.js logs
```

### Rollback Deployment
```bash
node cli/mobius-deploy.js rollback
```

## Platform Detection

The CLI automatically detects the platform based on the operating system:
- Windows: Uses PowerShell scripts (.ps1)
- Linux/macOS: Uses Bash scripts (.sh)

You can override the platform detection using the `--platform` option:
```bash
# Force Windows scripts on any platform
node cli/mobius-deploy.js deploy --platform win

# Force Unix scripts on any platform
node cli/mobius-deploy.js deploy --platform unix
```

## Security

The CLI tool maintains the same security practices as the underlying scripts:
- GHCR Personal Access Tokens (PATs) are read securely without displaying in console
- PATs are cleared from memory after use
- Docker login uses password-stdin when possible to avoid command-line exposure

## Integration with CI/CD

The CLI can be easily integrated into CI/CD pipelines:

### GitHub Actions
```yaml
- name: Deploy Preview Worker
  run: |
    node cli/mobius-deploy.js deploy --image-tag ${{ github.sha }}
  env:
    GHCR_PAT: ${{ secrets.GHCR_PAT }}
```

### Advanced CI/CD with Rollback on Failure
```yaml
- name: Deploy Preview Worker
  run: |
    node cli/mobius-deploy.js deploy --namespace staging
  env:
    GHCR_PAT: ${{ secrets.GHCR_PAT }}
    
- name: Verify Deployment
  run: |
    node cli/mobius-deploy.js verify --namespace staging
    
- name: Rollback on Failure
  if: failure()
  run: |
    node cli/mobius-deploy.js rollback --namespace staging
```

## Troubleshooting

### Script Not Found Errors
Ensure you're running the CLI from the project root directory where the scripts are located.

### Permission Errors (Unix/Linux/macOS)
Make sure the bash scripts have execute permissions:
```bash
chmod +x *.sh
```

### Platform Detection Issues
If automatic platform detection fails, manually specify the platform using the `--platform` option.

### Kubernetes Connection Issues
Ensure kubectl is properly configured with the correct context:
```bash
kubectl config current-context
kubectl config get-contexts
```