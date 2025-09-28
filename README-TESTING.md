# Testing Guide - MOBIUS FastAPI Backend

This guide covers all testing aspects of the MOBIUS FastAPI ingestion service.

## Test Structure

```
backend/
├── main.py                 # Main application
├── test_api.py            # Integration tests
├── requirements.txt       # Dependencies (includes pytest)
└── README-TESTING.md      # This file
```

## Quick Test Commands

```bash
cd backend

# Install dependencies
pip install -r requirements.txt

# Run all tests
pytest test_api.py -v

# Run with coverage
pytest test_api.py -v --cov=main --cov-report=html

# Run specific test
pytest test_api.py::test_health_endpoint -v

# Run tests with output
pytest test_api.py -v -s
```

## Test Categories

### 1. Unit Tests

**Health Check:**
- Tests `/health` endpoint returns proper status
- Validates response structure and content

**Authentication:**
- Valid token acceptance
- Invalid token rejection  
- Missing token handling

### 2. Integration Tests

**Job Lifecycle:**
- Job creation via `/api/ingest`
- Status tracking via `/api/status/{job_id}`
- Job listing via `/api/jobs`
- Complete workflow from creation to completion

**File Upload:**
- Metadata + file upload
- File information storage
- Error handling for invalid uploads

**WebSocket Communication:**
- Connection establishment
- Ping/pong functionality
- Real-time job updates

### 3. API Contract Tests

**Request/Response Validation:**
- Pydantic model validation
- Required field enforcement
- Data type validation
- Error response formats

## Test Data and Fixtures

### Authentication Setup
```python
TEST_TOKEN = "test_token_123"
auth_headers = {"Authorization": f"Bearer {TEST_TOKEN}"}
```

### Sample Metadata
```python
metadata = {
    "source": "test-unit",
    "type": "validation",
    "description": "Test case data"
}
```

### File Upload Test
```python
test_file_content = b"test file content"
files = {"file": ("test.txt", test_file_content, "text/plain")}
```

## Running Tests in Different Environments

### Local Development
```bash
# Start backend first
uvicorn main:app --reload --port 8000

# Run tests in another terminal
cd backend
pytest test_api.py -v
```

### Docker Environment
```bash
# Build and run with docker-compose
docker-compose up -d backend

# Run tests in container
docker-compose exec backend pytest test_api.py -v

# Or run tests from host
pytest test_api.py -v
```

### CI Environment
```bash
# Install dependencies
pip install -r requirements.txt

# Set test environment variables
export ALLOWED_TOKEN=test_token_123

# Run tests with JUnit output
pytest test_api.py -v --junit-xml=test-results.xml
```

## Test Configuration

### Environment Variables for Testing
```bash
export ALLOWED_TOKEN=test_token_123
export PORT=8000
export LOG_LEVEL=INFO
```

### Pytest Configuration
Add to `pytest.ini` (optional):
```ini
[tool:pytest]
testpaths = .
python_files = test_*.py
python_functions = test_*
addopts = -v --tb=short
asyncio_mode = auto
```

## Manual Testing

### 1. Smoke Test Checklist

**Health Check:**
```bash
curl -f http://localhost:8000/health
# Expected: 200 OK with health status
```

**Authentication Test:**
```bash
# Valid token
curl -X POST "http://localhost:8000/api/ingest" \
  -H "Authorization: Bearer test_token_123" \
  -F 'metadata={"source":"smoke-test"}'
# Expected: 200 OK with job creation

# Invalid token
curl -X POST "http://localhost:8000/api/ingest" \
  -H "Authorization: Bearer invalid" \
  -F 'metadata={"source":"smoke-test"}'
# Expected: 401 Unauthorized
```

**Job Lifecycle:**
```bash
# 1. Create job and capture job_id
JOB_ID=$(curl -s -X POST "http://localhost:8000/api/ingest" \
  -H "Authorization: Bearer test_token_123" \
  -F 'metadata={"source":"manual-test"}' | \
  python3 -c "import sys, json; print(json.load(sys.stdin)['job_id'])")

# 2. Check initial status (should be "processing")
curl "http://localhost:8000/api/status/$JOB_ID"

# 3. Wait and check final status (should be "completed" or "failed")
sleep 3
curl "http://localhost:8000/api/status/$JOB_ID"
```

### 2. File Upload Test
```bash
# Create test file
echo "test content" > test_upload.txt

# Upload with metadata
curl -X POST "http://localhost:8000/api/ingest" \
  -H "Authorization: Bearer test_token_123" \
  -F 'metadata={"source":"file-test","description":"Upload test"}' \
  -F 'file=@test_upload.txt'

# Cleanup
rm test_upload.txt
```

### 3. WebSocket Test (with JavaScript)

```html
<!DOCTYPE html>
<html>
<head><title>WebSocket Test</title></head>
<body>
<div id="output"></div>
<script>
const ws = new WebSocket('ws://localhost:8000/api/ws');
const output = document.getElementById('output');

ws.onopen = () => {
    output.innerHTML += '<p>WebSocket connected</p>';
    ws.send('ping');
};

ws.onmessage = (event) => {
    output.innerHTML += `<p>Received: ${event.data}</p>`;
};

ws.onclose = () => {
    output.innerHTML += '<p>WebSocket closed</p>';
};
</script>
</body>
</html>
```

## Performance Testing

### Basic Load Test with curl
```bash
# Simple concurrent requests
for i in {1..10}; do
  curl -X POST "http://localhost:8000/api/ingest" \
    -H "Authorization: Bearer test_token_123" \
    -F "metadata={\"source\":\"load-test-$i\"}" &
done
wait
```

### Using Python for Load Testing
```python
import asyncio
import aiohttp
import json

async def create_job(session, i):
    async with session.post(
        'http://localhost:8000/api/ingest',
        data={'metadata': json.dumps({'source': f'load-test-{i}'})},
        headers={'Authorization': 'Bearer test_token_123'}
    ) as response:
        return await response.json()

async def load_test():
    async with aiohttp.ClientSession() as session:
        tasks = [create_job(session, i) for i in range(50)]
        results = await asyncio.gather(*tasks)
        print(f"Created {len(results)} jobs")

# Run: python -c "import asyncio; asyncio.run(load_test())"
```

## Test Reporting

### Coverage Report
```bash
# Generate HTML coverage report
pytest test_api.py --cov=main --cov-report=html

# View report
open htmlcov/index.html  # macOS
xdg-open htmlcov/index.html  # Linux
start htmlcov/index.html  # Windows
```

### JUnit XML for CI
```bash
pytest test_api.py --junit-xml=test-results.xml
```

### Custom Test Output
```bash
# Verbose output with timings
pytest test_api.py -v --durations=10

# Show local variables on failure
pytest test_api.py -v --tb=long -l
```

## Troubleshooting Tests

### Common Test Failures

**Connection Refused:**
- Ensure backend is running on correct port
- Check `PORT` environment variable
- Verify no firewall blocking connections

**Authentication Errors:**
- Verify `ALLOWED_TOKEN` environment variable
- Check token format in test headers
- Ensure token matches between test and application

**Async Test Issues:**
- Install `pytest-asyncio`: `pip install pytest-asyncio`
- Use `@pytest.mark.asyncio` decorator
- Ensure proper await usage

### Debug Mode Testing
```bash
# Enable debug logging
export LOG_LEVEL=DEBUG

# Run specific test with output
pytest test_api.py::test_job_lifecycle -v -s --log-cli-level=DEBUG
```

### Test Isolation
```bash
# Run tests in random order to catch dependencies
pip install pytest-randomly
pytest test_api.py --randomly-seed=1234
```

## Continuous Integration

### GitHub Actions Example
```yaml
- name: Test Backend
  run: |
    cd backend
    python -m pytest test_api.py -v --junit-xml=test-results.xml
    
- name: Upload Test Results
  uses: actions/upload-artifact@v3
  if: always()
  with:
    name: test-results
    path: backend/test-results.xml
```

### Docker Test Runner
```bash
# Build test image
docker build -f Dockerfile.test -t mobius-backend-test .

# Run tests in container
docker run --rm mobius-backend-test
```

## Test Maintenance

### Updating Tests for New Features
1. Add test cases for new endpoints
2. Update fixtures for new data models
3. Add integration tests for new workflows
4. Update performance test scenarios

### Test Data Management
- Keep test data minimal and focused
- Use factories for complex test objects
- Clean up test artifacts after each test
- Use separate test database if applicable

### Best Practices
- One assertion per test when possible
- Descriptive test names explaining behavior
- Independent tests that can run in any order
- Mock external dependencies
- Test error conditions and edge cases