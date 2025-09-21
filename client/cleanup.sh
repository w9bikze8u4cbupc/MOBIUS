#!/bin/bash

# Cleanup Script for fetchJson Implementation Validation
# This script removes all validation-related files and restores the environment

echo -e "\033[0;32m=== Cleanup fetchJson Implementation Validation ===\033[0m"
echo

# Confirm with user before proceeding
echo -e "\033[1;33mThis script will remove all validation-related files and restore the environment.\033[0m"
echo -e "\033[1;33mDo you want to proceed? (y/N)\033[0m"
read -r confirmation
if [[ "$confirmation" != "y" && "$confirmation" != "Y" ]]; then
    echo -e "\033[1;33mCleanup cancelled.\033[0m"
    exit 0
fi

# Remove validation files
echo -e "\033[1;33m1. Removing validation files...\033[0m"
validation_files=(
    "VALIDATION_STEPS.md"
    "MIGRATION_EXAMPLE.md"
    "IMPLEMENTATION_SUMMARY.md"
    "validation.ps1"
    "validation.sh"
    "VALIDATION_README.md"
    "FINAL_SUMMARY.md"
    "final_validation.ps1"
    "final_validation.sh"
    "cleanup.ps1"
    "cleanup.sh"
)

for file in "${validation_files[@]}"; do
    if [ -f "$file" ]; then
        rm "$file"
        echo -e "   \033[0;32m✓ Removed $file\033[0m"
    else
        echo -e "   \033[1;33m! $file not found\033[0m"
    fi
done

# Remove DevTestPage component
echo -e "\033[1;33m2. Removing DevTestPage component...\033[0m"
if [ -f "src/components/DevTestPage.jsx" ]; then
    rm "src/components/DevTestPage.jsx"
    echo -e "   \033[0;32m✓ Removed src/components/DevTestPage.jsx\033[0m"
else
    echo -e "   \033[1;33m! src/components/DevTestPage.jsx not found\033[0m"
fi

# Restore index.js to original state
echo -e "\033[1;33m3. Restoring index.js to original state...\033[0m"
if grep -q "DevTestPage" src/index.js 2>/dev/null; then
    # Remove the DevTestPage import and conditional rendering
    sed -i '/DevTestPage/d' src/index.js
    sed -i '/REACT_APP_SHOW_DEV_TEST/d' src/index.js
    
    # Restore original App rendering
    sed -i 's/const app = (.*)/const app = (\
  <ToastProvider>\
    <App \/>\
  <\/ToastProvider>\
);/' src/index.js
    
    echo -e "   \033[0;32m✓ Restored src/index.js to original state\033[0m"
else
    echo -e "   \033[1;33m! src/index.js already in original state\033[0m"
fi

# Update .env file
echo -e "\033[1;33m4. Updating .env file...\033[0m"
if grep -q "REACT_APP_SHOW_DEV_TEST" .env 2>/dev/null; then
    grep -v "REACT_APP_SHOW_DEV_TEST" .env > .env.tmp && mv .env.tmp .env
    echo -e "   \033[0;32m✓ Removed REACT_APP_SHOW_DEV_TEST from .env\033[0m"
else
    echo -e "   \033[1;33m! REACT_APP_SHOW_DEV_TEST not found in .env\033[0m"
fi

echo
echo -e "\033[0;32m=== Cleanup Complete ===\033[0m"
echo -e "\033[0;32mAll validation files have been removed and the environment has been restored.\033[0m"
echo -e "\033[1;33mTo verify the cleanup, please restart your development server.\033[0m"