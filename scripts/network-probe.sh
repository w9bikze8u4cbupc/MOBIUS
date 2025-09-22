#!/bin/bash

# Network Probe Script for Mobius Games Tutorial Generator
# Tests connectivity to external APIs and reports issues

set -e

echo "🔍 Network Probe - Testing API Connectivity"
echo "================================================"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Track failures
FAILURES=0

# Function to test endpoint connectivity
test_endpoint() {
    local name="$1"
    local url="$2"
    local expected_status="$3"
    
    echo -n "Testing $name ($url)... "
    
    if command -v curl >/dev/null 2>&1; then
        if timeout 10 curl -s -I -L "$url" > /dev/null 2>&1; then
            echo -e "${GREEN}✓ OK${NC}"
            return 0
        else
            echo -e "${RED}✗ FAILED${NC}"
            echo "  └─ Could not connect to $url"
            FAILURES=$((FAILURES + 1))
            return 1
        fi
    else
        echo -e "${YELLOW}⚠ SKIPPED${NC}"
        echo "  └─ curl not available"
        return 0
    fi
}

# Function to test DNS resolution
test_dns() {
    local domain="$1"
    echo -n "Testing DNS resolution for $domain... "
    
    if command -v nslookup >/dev/null 2>&1; then
        if nslookup "$domain" > /dev/null 2>&1; then
            echo -e "${GREEN}✓ OK${NC}"
            return 0
        else
            echo -e "${RED}✗ FAILED${NC}"
            echo "  └─ Could not resolve $domain"
            FAILURES=$((FAILURES + 1))
            return 1
        fi
    else
        echo -e "${YELLOW}⚠ SKIPPED${NC}"
        echo "  └─ nslookup not available"
        return 0
    fi
}

# Test DNS resolution first
echo "📋 DNS Resolution Tests:"
test_dns "api.openai.com"
test_dns "api.elevenlabs.io"

echo ""

# Test API endpoints
echo "🌐 API Connectivity Tests:"
test_endpoint "OpenAI API" "https://api.openai.com/v1/models" "200"
test_endpoint "ElevenLabs API" "https://api.elevenlabs.io/v1/voices" "200"

echo ""

# Test local services
echo "🏠 Local Service Tests:"
if command -v curl > /dev/null && curl -s "http://localhost:5002/translate" > /dev/null 2>&1; then
    echo -e "Testing LibreTranslate (localhost:5002)... ${GREEN}✓ OK${NC}"
else
    echo -e "Testing LibreTranslate (localhost:5002)... ${YELLOW}⚠ NOT RUNNING${NC}"
    echo "  └─ LibreTranslate service not detected (this is normal in CI)"
fi

echo ""
echo "================================================"

# Summary
if [ $FAILURES -eq 0 ]; then
    echo -e "${GREEN}🎉 All network tests passed!${NC}"
    exit 0
else
    echo -e "${RED}❌ $FAILURES network test(s) failed${NC}"
    echo ""
    echo "🔧 Troubleshooting:"
    echo "  1. Check firewall rules for blocked domains"
    echo "  2. Verify corporate proxy settings"
    echo "  3. Test from the same network environment"
    echo "  4. See pr_body.md for detailed troubleshooting guide"
    echo ""
    echo "📋 For support, run: ./scripts/network-diagnostics.sh"
    
    # Don't fail CI, just warn
    exit 0
fi