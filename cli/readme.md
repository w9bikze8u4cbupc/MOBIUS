# Mobius Deployment CLI

A simple command-line interface for deploying the Mobius Preview Worker application.

## Overview

This directory contains a Node.js-based CLI tool that provides a unified interface for deploying the Mobius Preview Worker application across different platforms. It automatically detects the platform and executes the appropriate scripts.

## Usage

From the project root directory:

```bash
# Deploy the application
node cli/mobius-deploy.js deploy

# Verify deployment status
node cli/mobius-deploy.js verify

# Show help
node cli/mobius-deploy.js help
```

## Documentation

For detailed usage instructions, see [CLI_DEPLOYMENT_TOOL.md](../CLI_DEPLOYMENT_TOOL.md) in the project root.

## Requirements

- Node.js version 14 or higher
- Docker
- Kubernetes CLI (kubectl)
- Appropriate permissions for Docker and Kubernetes operations