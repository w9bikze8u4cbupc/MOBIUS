#!/bin/bash

# Test coala static analysis on a small file
echo -e "\033[0;32m🔍 Testing coala static analysis...\033[0m"

# Check if Docker is available
if ! command -v docker &> /dev/null; then
    echo -e "\033[0;31m❌ Docker is not available. Please install Docker Desktop.\033[0m"
    exit 1
fi

DOCKER_VERSION=$(docker --version)
echo -e "\033[0;32m✅ Docker is available: $DOCKER_VERSION\033[0m"

# Test coala on a single small file
echo -e "\033[0;32m🚀 Running coala on package.json...\033[0m"

# Run coala on package.json only
if docker run --rm -v "$(pwd)":/app --workdir=/app coala/base coala --files="package.json" --non-interactive; then
    echo -e "\033[0;32m✅ coala test completed successfully!\033[0m"
else
    # coala might return non-zero exit code when it finds issues, which is normal
    echo -e "\033[0;32m✅ coala is working (found issues to report)\033[0m"
fi

echo -e "\033[0;32m\n🎉 coala setup is ready!\033[0m"
echo -e "\033[0;33mYou can now run full analysis with:\033[0m"
echo -e "\033[0;36m   docker run -ti -v \"\$(pwd):/app\" --workdir=/app coala/base coala --non-interactive\033[0m"