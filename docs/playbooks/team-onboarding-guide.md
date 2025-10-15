# Team Onboarding Guide: Deployment Infrastructure

This guide helps new team members understand and use the Mobius Preview Worker deployment infrastructure effectively.

## Overview

The deployment infrastructure consists of:
1. Cross-platform deployment scripts (PowerShell and Bash)
2. A unified CLI tool for simplified operations
3. GitHub Actions workflows for CI/CD
4. Automated testing for deployment scripts
5. Comprehensive documentation and checklists

## Prerequisites

### Required Tools
- **Docker**: For building and running containers
- **Kubernetes CLI (kubectl)**: For interacting with Kubernetes clusters
- **Node.js**: For running the CLI tool (version 14 or higher)
- **Git**: For version control

### Required Access
- **GitHub Account**: With access to the repository
- **GHCR PAT**: Personal Access Token for GitHub Container Registry
- **Kubernetes Access**: kubeconfig file for target clusters

## Setting Up Your Environment

### 1. Install Required Tools

#### Windows
```powershell
# Install Docker Desktop
# Download from: https://www.docker.com/products/docker-desktop

# Install Node.js
# Download from: https://nodejs.org/

# Git is usually included with GitHub Desktop
```

#### macOS
```bash
# Install Homebrew if not already installed
/bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"

# Install required tools
brew install docker kubectl node git
```

#### Linux (Ubuntu/Debian)
```bash
# Update package index
sudo apt update

# Install Docker
sudo apt install docker.io

# Install kubectl
sudo apt install kubectl

# Install Node.js
sudo apt install nodejs npm

# Install Git
sudo apt install git
```

### 2. Configure GitHub Access

#### Generate GHCR PAT
1. Go to GitHub Settings → Developer settings → Personal access tokens
2. Generate new token with `read:packages` and `write:packages` scopes
3. Save the token securely

#### Configure Docker Authentication
```bash
# Login to GHCR
echo YOUR_PAT | docker login ghcr.io -u YOUR_USERNAME --password-stdin
```

### 3. Configure Kubernetes Access

#### Set up kubeconfig
1. Obtain the kubeconfig file from your system administrator
2. Place it in `~/.kube/config` or set the `KUBECONFIG` environment variable

#### Verify Access
```bash
# Check current context
kubectl config current-context

# List available contexts
kubectl config get-contexts

# Test connection
kubectl get nodes
```

## First Deployment

### 1. Clone the Repository
```bash
git clone <repository-url>
cd mobius-games-tutorial-generator
```

### 2. Run a Dry Run
```bash
# Test the deployment process without making changes
node cli/mobius-deploy.js deploy --dry-run
```

### 3. Deploy to Staging
```bash
# Deploy to staging environment
node cli/mobius-deploy.js deploy --namespace staging
```

### 4. Verify Deployment
```bash
# Verify the deployment was successful
node cli/mobius-deploy.js verify --namespace staging
```

### 5. Check Status
```bash
# Check the deployment status
node cli/mobius-deploy.js status --namespace staging
```

## Daily Workflow

### Morning Check
```bash
# Check status of production deployment
node cli/mobius-deploy.js status --namespace production

# View recent logs if needed
node cli/mobius-deploy.js logs --namespace production --tail 50
```

### Deploying Changes
```bash
# 1. Make code changes
# 2. Commit and push to feature branch
# 3. Create pull request
# 4. After merge, CI/CD will automatically deploy to staging
# 5. Manually deploy to production after verification:
node cli/mobius-deploy.js deploy --namespace production
```

### Troubleshooting
```bash
# 1. Check status
node cli/mobius-deploy.js status --namespace production

# 2. View logs
node cli/mobius-deploy.js logs --namespace production

# 3. If issues found, rollback
node cli/mobius-deploy.js rollback --namespace production
```

## Best Practices

### Code Changes
1. Always create feature branches for changes
2. Write clear commit messages
3. Follow the pull request process
4. Ensure all tests pass before merging

### Deployments
1. Always use `--dry-run` first
2. Deploy to staging before production
3. Verify deployments after they complete
4. Monitor logs after deployments
5. Have a rollback plan ready

### Security
1. Never commit PATs or other secrets to the repository
2. Use environment variables for sensitive data
3. Rotate PATs regularly
4. Follow the principle of least privilege

### Collaboration
1. Communicate deployment activities to the team
2. Document any issues and their solutions
3. Update documentation when making changes
4. Participate in code reviews

## Common Tasks

### Building and Pushing Images
```bash
# Build and push a new image
node cli/mobius-deploy.js build-push
```

### Updating Manifests
```bash
# Update Kubernetes manifests with a specific image tag
node cli/mobius-deploy.js update-manifests --image-tag ghcr.io/w9bikze8u4cbupc/mobius-preview-worker:v1.2.3
```

### Applying Manifests
```bash
# Apply manifests to a specific namespace
node cli/mobius-deploy.js apply-manifests --namespace production
```

### Viewing Logs
```bash
# View recent logs
node cli/mobius-deploy.js logs --namespace production

# View logs with more context
node cli/mobius-deploy.js logs --namespace production --tail 100
```

### Rolling Back
```bash
# Rollback a deployment
node cli/mobius-deploy.js rollback --namespace production
```

## Troubleshooting Guide

### Deployment Fails
1. Check the error message
2. Verify all prerequisites are met
3. Run `status` command to check current state
4. View logs for more details
5. If needed, rollback the deployment

### Cannot Connect to Kubernetes
1. Verify kubeconfig is correct
2. Check that the cluster is running
3. Verify network connectivity
4. Contact system administrator if issues persist

### Image Pull Errors
1. Verify the image exists in GHCR
2. Check that the image tag is correct
3. Verify GHCR credentials
4. Check image pull secrets in Kubernetes

### Scripts Not Found
1. Ensure you're in the project root directory
2. Verify all files are present
3. Check file permissions (especially on Unix systems)

## Resources

### Documentation
- [CLI_DEPLOYMENT_TOOL.md](file:///c%3A/Users/danie/Documents/mobius-games-tutorial-generator/CLI_DEPLOYMENT_TOOL.md): Complete CLI documentation
- [CLI_USAGE_EXAMPLES.md](file:///c%3A/Users/danie/Documents/mobius-games-tutorial-generator/CLI_USAGE_EXAMPLES.md): Practical usage examples
- [DEPLOYMENT_CHECKLIST.md](file:///c%3A/Users/danie/Documents/mobius-games-tutorial-generator/DEPLOYMENT_CHECKLIST.md): Deployment checklist
- [DEPLOYMENT_ENHANCEMENTS_SUMMARY.md](file:///c%3A/Users/danie/Documents/mobius-games-tutorial-generator/DEPLOYMENT_ENHANCEMENTS_SUMMARY.md): Summary of deployment enhancements
- [CROSS_PLATFORM_DEPLOYMENT_SCRIPTS.md](file:///c%3A/Users/danie/Documents/mobius-games-tutorial-generator/CROSS_PLATFORM_DEPLOYMENT_SCRIPTS.md): Cross-platform script documentation

### Workflows
- [.github/workflows/preview-worker-build.yaml](file:///c%3A/Users/danie/Documents/mobius-games-tutorial-generator/.github/workflows/preview-worker-build.yaml): Build workflow
- [.github/workflows/preview-worker-deploy.yaml](file:///c%3A/Users/danie/Documents/mobius-games-tutorial-generator/.github/workflows/preview-worker-deploy.yaml): Deploy workflow
- [.github/workflows/test-deployment-scripts.yaml](file:///c%3A/Users/danie/Documents/mobius-games-tutorial-generator/.github/workflows/test-deployment-scripts.yaml): Test workflow

### Scripts
- PowerShell scripts: `*.ps1` files in the project root
- Bash scripts: `*.sh` files in the project root

## Getting Help

### Internal Resources
- Contact your team lead for access issues
- Check the team wiki for additional documentation
- Ask in the team chat for quick questions

### External Resources
- [Kubernetes Documentation](https://kubernetes.io/docs/)
- [Docker Documentation](https://docs.docker.com/)
- [GitHub Documentation](https://docs.github.com/)

## Feedback and Improvements

We're always looking to improve our deployment infrastructure. If you:
- Encounter issues or bugs
- Have suggestions for improvements
- Find documentation gaps
- Want to add new features

Please:
1. Create an issue in the GitHub repository
2. Discuss in team meetings
3. Submit a pull request with fixes/improvements