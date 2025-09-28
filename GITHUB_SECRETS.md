# GitHub Repository Secrets

This document describes the required repository secrets for the MOBIUS CI pipeline.

## Required Secrets

### ALLOWED_TOKEN

**Purpose**: Authentication token used by the FastAPI backend for API endpoints and Docker smoke tests during CI.

**Usage**: 
- Required for the Docker smoke test in CI pipeline
- Used by the FastAPI service for basic token-based authentication
- Passed as environment variable to the containerized application during testing

**Configuration**:
1. Go to Repository Settings → Secrets and variables → Actions
2. Click "New repository secret"
3. Name: `ALLOWED_TOKEN`
4. Value: A secure, randomly generated token (see suggested format below)

**Suggested Value Format**:
```
mobius-ci-$(openssl rand -hex 16)-$(date +%Y%m)
```

Example: `mobius-ci-a1b2c3d4e5f6789abcdef0123456789a-202412`

**Security Considerations**:
- This token is intended for **development and CI use only**
- Do **NOT** use production authentication tokens
- Rotate the token monthly for security
- The token should be unique and not shared with other environments

**Scope**: Limited to CI/CD smoke testing and development authentication

## Future Secrets (Production Hardening)

The following secrets will be needed for production deployment (not required for CI):

- **OPENAI_API_KEY**: For AI-powered document processing
- **REDIS_URL**: For durable job store
- **DATABASE_URL**: For persistent storage
- **S3_CREDENTIALS**: For file uploads
- **JWT_SECRET**: For OAuth2/JWT authentication

## Security Best Practices

1. **Rotation**: Rotate secrets regularly (suggested: monthly)
2. **Scope**: Use different tokens for different environments
3. **Monitoring**: Monitor secret usage in Actions logs
4. **Access**: Limit repository access to necessary team members
5. **Documentation**: Keep this file updated when secrets change

## Troubleshooting

### CI failing with authentication errors:
- Verify `ALLOWED_TOKEN` is set in repository secrets
- Check the token value matches the expected format
- Ensure there are no trailing spaces or special characters

### Smoke test container startup issues:
- Check Docker build logs in CI for dependency errors
- Verify the ALLOWED_TOKEN is being passed correctly to the container
- Review health check endpoint logs