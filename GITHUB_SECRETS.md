# GitHub Actions Secret Setup

## Required Secrets

The CI workflow requires the following secret to be configured in your GitHub repository:

### ALLOWED_TOKEN

- **Purpose**: Used for runtime authentication during backend API smoke tests
- **Value**: Any string value (e.g., a UUID or random token)
- **Usage**: The backend `/api/status` endpoint validates this token is configured

### How to Set Up Secrets

1. Go to your GitHub repository
2. Navigate to **Settings** → **Secrets and variables** → **Actions**
3. Click **"New repository secret"**
4. Add the secret:
   - **Name**: `ALLOWED_TOKEN`
   - **Value**: Generate a secure token (e.g., using `openssl rand -hex 32` or online UUID generator)
5. Click **"Add secret"**

### Example

```bash
# Generate a secure token
openssl rand -hex 32
# Output: e.g., 8a7b9c2d4e5f6789012345678901abcd2345678901bcdef234567890abcdef12
```

Use the generated token as the `ALLOWED_TOKEN` secret value.

## Testing Locally

To test the backend locally with the token:

```bash
cd backend
export ALLOWED_TOKEN="your_test_token_here"
python -m uvicorn main:app --host 0.0.0.0 --port 8000
```

Then test the endpoints:
```bash
curl http://localhost:8000/health
curl http://localhost:8000/api/status
```