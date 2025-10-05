#!/bin/bash

# Verification script for Mobius launch scripts
echo -e "\033[0;36mVerifying Mobius launch scripts...\033[0m"

# Check if required files exist
required_files=("start-mobius.cmd" "start-mobius.ps1" "start-mobius.sh")
all_exist=true

for file in "${required_files[@]}"; do
    if [ -f "$file" ]; then
        echo -e "\033[0;32m✓ $file exists\033[0m"
    else
        echo -e "\033[0;31m✗ $file missing\033[0m"
        all_exist=false
    fi
done

# Check package.json for required scripts
required_scripts=("server" "client" "start:full")

for script in "${required_scripts[@]}"; do
    if grep -q "\"$script\":" package.json; then
        echo -e "\033[0;32m✓ package.json script '$script' exists\033[0m"
    else
        echo -e "\033[0;31m✗ package.json script '$script' missing\033[0m"
        all_exist=false
    fi
done

# Check if concurrently is installed
if npm list concurrently >/dev/null 2>&1; then
    echo -e "\033[0;32m✓ concurrently is installed\033[0m"
else
    echo -e "\033[0;31m✗ concurrently is not installed\033[0m"
    all_exist=false
fi

# Check client/.env for correct API base
if grep -q "REACT_APP_API_BASE=http://localhost:3001" client/.env; then
    echo -e "\033[0;32m✓ client/.env has correct REACT_APP_API_BASE\033[0m"
else
    echo -e "\033[0;31m✗ client/.env REACT_APP_API_BASE is incorrect or missing\033[0m"
    all_exist=false
fi

if [ "$all_exist" = true ]; then
    echo -e "\n\033[0;32m✓ All verification checks passed!\033[0m"
    echo -e "\033[0;33mYou can now use the launch scripts to start Mobius.\033[0m"
else
    echo -e "\n\033[0;31m✗ Some verification checks failed!\033[0m"
    echo -e "\033[0;33mPlease review the issues above and fix them before using the launch scripts.\033[0m"
fi