# Developer Network Guide

This guide helps developers set up and configure network access for the Mobius Games Tutorial Generator, particularly for external API integrations.

## Required External APIs

The application depends on these external services:

### OpenAI API (`api.openai.com`)
- **Purpose**: Text generation and processing for game tutorials
- **Protocol**: HTTPS (port 443)
- **Endpoints**: `/v1/completions`, `/v1/chat/completions`, `/v1/models`
- **Authentication**: API key in Authorization header
- **Documentation**: https://platform.openai.com/docs/api-reference

### ElevenLabs API (`api.elevenlabs.io`)
- **Purpose**: Text-to-speech for tutorial narration
- **Protocol**: HTTPS (port 443)
- **Endpoints**: `/v1/text-to-speech/*`, `/v1/voices`
- **Authentication**: API key in xi-api-key header
- **Documentation**: https://docs.elevenlabs.io/api-reference

## Development Setup

### 1. Environment Configuration

Create a `.env` file in the project root:
```env
# OpenAI Configuration
OPENAI_API_KEY=sk-your-openai-api-key-here
OPENAI_BASE_URL=https://api.openai.com/v1

# ElevenLabs Configuration
ELEVENLABS_API_KEY=your-elevenlabs-api-key-here
ELEVENLABS_BASE_URL=https://api.elevenlabs.io/v1

# Network Configuration (optional)
HTTP_PROXY=http://your-proxy:port
HTTPS_PROXY=http://your-proxy:port
NO_PROXY=localhost,127.0.0.1,.local
```

### 2. Test Network Connectivity

Before running the application, test API connectivity:
```bash
# Quick connectivity test
./scripts/network-probe.sh

# Comprehensive diagnostics (if issues found)
./scripts/network-diagnostics.sh
```

### 3. Verify API Access

Test API endpoints directly:
```bash
# Test OpenAI API
curl -H "Authorization: Bearer $OPENAI_API_KEY" \
     https://api.openai.com/v1/models

# Test ElevenLabs API
curl -H "xi-api-key: $ELEVENLABS_API_KEY" \
     https://api.elevenlabs.io/v1/voices
```

## Local Development

### Network Requirements

Ensure your development environment can reach:
- `api.openai.com:443` (HTTPS)
- `api.elevenlabs.io:443` (HTTPS)

### Proxy Configuration

If behind a corporate firewall/proxy:

1. **System-wide proxy** (Linux/macOS):
   ```bash
   export HTTP_PROXY=http://proxy.company.com:8080
   export HTTPS_PROXY=http://proxy.company.com:8080
   export NO_PROXY=localhost,127.0.0.1,.local
   ```

2. **Node.js specific**:
   ```bash
   npm config set proxy http://proxy.company.com:8080
   npm config set https-proxy http://proxy.company.com:8080
   ```

3. **Application-level proxy** (in your code):
   ```javascript
   const https = require('https');
   const HttpsProxyAgent = require('https-proxy-agent');
   
   const agent = new HttpsProxyAgent('http://proxy.company.com:8080');
   
   // Use with axios
   const axios = require('axios');
   axios.defaults.httpsAgent = agent;
   ```

### Common Development Issues

#### API Key Issues
```javascript
// Verify API keys are loaded
console.log('OpenAI Key:', process.env.OPENAI_API_KEY ? 'Present' : 'Missing');
console.log('ElevenLabs Key:', process.env.ELEVENLABS_API_KEY ? 'Present' : 'Missing');
```

#### Network Connectivity Issues
```bash
# Test basic connectivity
ping api.openai.com
curl -I https://api.openai.com

# Test with proxy
curl --proxy http://proxy:port -I https://api.openai.com
```

#### SSL/TLS Issues
```bash
# Check certificate
openssl s_client -connect api.openai.com:443 -servername api.openai.com

# Disable SSL verification (development only!)
export NODE_TLS_REJECT_UNAUTHORIZED=0
```

## CI/CD Setup

### GitHub Actions Configuration

Add network probe to your workflow:

```yaml
name: CI
on: [push, pull_request]

jobs:
  build-and-test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      
      # Network connectivity check
      - name: Network Probe
        run: ./scripts/network-probe.sh
        continue-on-error: true
      
      - name: Setup Node.js
        uses: actions/setup-node@v4
        with:
          node-version: '20'
      
      - name: Install dependencies
        run: npm ci
      
      # Your existing steps...
```

### Environment Variables in CI

Set these secrets in your repository settings:
- `OPENAI_API_KEY`: Your OpenAI API key
- `ELEVENLABS_API_KEY`: Your ElevenLabs API key

### Self-Hosted Runners

If using self-hosted runners, ensure they have:
1. Outbound HTTPS access to required APIs
2. DNS resolution for api domains
3. Proper proxy configuration if needed

Example runner configuration:
```yaml
# .github/workflows/ci.yml
jobs:
  build-and-test:
    runs-on: [self-hosted, linux, x64]
    env:
      HTTP_PROXY: ${{ secrets.HTTP_PROXY }}
      HTTPS_PROXY: ${{ secrets.HTTPS_PROXY }}
      NO_PROXY: ${{ secrets.NO_PROXY }}
```

## Docker Development

### Dockerfile Network Configuration

```dockerfile
FROM node:20

# Install network debugging tools
RUN apt-get update && apt-get install -y \
    curl \
    dnsutils \
    netcat-traditional \
    iputils-ping \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app
COPY package*.json ./
RUN npm ci

# Copy network probe scripts
COPY scripts/network-*.sh ./scripts/
RUN chmod +x scripts/network-*.sh

# Test network connectivity during build
RUN ./scripts/network-probe.sh || echo "Network connectivity issues detected"

COPY . .
EXPOSE 3000
CMD ["npm", "start"]
```

### Docker Compose with Proxy

```yaml
version: '3.8'
services:
  app:
    build: .
    environment:
      - HTTP_PROXY=http://proxy.company.com:8080
      - HTTPS_PROXY=http://proxy.company.com:8080
      - NO_PROXY=localhost,127.0.0.1
      - OPENAI_API_KEY=${OPENAI_API_KEY}
      - ELEVENLABS_API_KEY=${ELEVENLABS_API_KEY}
    ports:
      - "3000:3000"
```

### Testing in Docker

```bash
# Test network connectivity inside container
docker run --rm -it your-app ./scripts/network-probe.sh

# Debug network issues
docker run --rm -it your-app bash
> curl https://api.openai.com/v1/models
> nslookup api.openai.com
```

## API Usage Patterns

### Robust API Client

```javascript
const axios = require('axios');

class RobustApiClient {
  constructor(baseURL, apiKey, options = {}) {
    this.client = axios.create({
      baseURL,
      timeout: options.timeout || 30000,
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'User-Agent': 'MobiusGamesGenerator/1.0'
      }
    });

    // Add retry logic
    this.client.interceptors.response.use(
      response => response,
      async error => {
        if (error.code === 'ENOTFOUND' || error.code === 'ECONNREFUSED') {
          console.error('Network connectivity issue:', error.message);
          // Could implement exponential backoff retry here
        }
        throw error;
      }
    );
  }

  async testConnection() {
    try {
      await this.client.get('/models');
      return true;
    } catch (error) {
      console.error('API connection test failed:', error.message);
      return false;
    }
  }
}
```

### Error Handling

```javascript
async function callOpenAI(prompt) {
  try {
    const response = await openai.chat.completions.create({
      model: 'gpt-4',
      messages: [{ role: 'user', content: prompt }]
    });
    return response;
  } catch (error) {
    if (error.code === 'ENOTFOUND') {
      console.error('DNS resolution failed for OpenAI API');
      console.error('Check network connectivity and DNS configuration');
    } else if (error.code === 'ECONNREFUSED') {
      console.error('Connection refused by OpenAI API');
      console.error('Check firewall rules and proxy configuration');
    } else if (error.response?.status === 401) {
      console.error('OpenAI API authentication failed');
      console.error('Check your API key configuration');
    } else {
      console.error('OpenAI API call failed:', error.message);
    }
    throw error;
  }
}
```

## Troubleshooting Workflow

### 1. Initial Checks
```bash
# Check environment variables
env | grep -E "(OPENAI|ELEVENLABS|PROXY)"

# Test basic connectivity
./scripts/network-probe.sh
```

### 2. DNS Issues
```bash
# Check DNS resolution
nslookup api.openai.com
dig +short api.elevenlabs.io

# Try alternative DNS servers
nslookup api.openai.com 8.8.8.8
```

### 3. Firewall/Proxy Issues
```bash
# Test direct connection
curl -v https://api.openai.com/v1/models

# Test with proxy
curl --proxy http://proxy:port -v https://api.openai.com/v1/models
```

### 4. SSL/Certificate Issues
```bash
# Check SSL certificate
openssl s_client -connect api.openai.com:443

# Test with curl showing SSL handshake
curl -v --tlsv1.2 https://api.openai.com/v1/models
```

### 5. Application-Level Issues
```javascript
// Add debugging to your application
const originalRequest = axios.request;
axios.request = function(config) {
  console.log('Making request to:', config.url);
  console.log('Headers:', config.headers);
  return originalRequest.apply(this, arguments)
    .then(response => {
      console.log('Response status:', response.status);
      return response;
    })
    .catch(error => {
      console.error('Request failed:', error.message);
      if (error.config) {
        console.error('URL:', error.config.url);
        console.error('Method:', error.config.method);
      }
      throw error;
    });
};
```

## Performance Considerations

### API Rate Limiting
- OpenAI: Varies by plan and model
- ElevenLabs: Character-based limits

### Caching Strategies
```javascript
// Cache API responses to reduce network calls
const NodeCache = require('node-cache');
const cache = new NodeCache({ stdTTL: 300 }); // 5 minute cache

async function getCachedCompletion(prompt) {
  const cacheKey = `openai:${Buffer.from(prompt).toString('base64')}`;
  let result = cache.get(cacheKey);
  
  if (!result) {
    result = await openai.chat.completions.create({
      model: 'gpt-4',
      messages: [{ role: 'user', content: prompt }]
    });
    cache.set(cacheKey, result);
  }
  
  return result;
}
```

### Connection Pooling
```javascript
// Use keep-alive connections
const https = require('https');
const agent = new https.Agent({
  keepAlive: true,
  maxSockets: 10
});

axios.defaults.httpsAgent = agent;
```

## Security Best Practices

1. **API Key Management**:
   - Store keys in environment variables or secure vaults
   - Never commit API keys to version control
   - Use different keys for different environments
   - Rotate keys regularly

2. **Network Security**:
   - Use HTTPS for all API calls
   - Validate SSL certificates
   - Implement proper timeout handling
   - Log security events

3. **Error Handling**:
   - Don't expose API keys in error messages
   - Log network errors for monitoring
   - Implement circuit breaker patterns for reliability

## Related Resources

- [Network Troubleshooting Guide](./network-troubleshooting.md)
- [OpenAI API Documentation](https://platform.openai.com/docs)
- [ElevenLabs API Documentation](https://docs.elevenlabs.io)
- Network diagnostic scripts in `scripts/` directory