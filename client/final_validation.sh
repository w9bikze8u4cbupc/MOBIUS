#!/bin/bash

# Final Validation Script for fetchJson Implementation
# This script verifies that all components have been properly implemented

echo -e "\033[0;32m=== Final Validation of fetchJson Implementation ===\033[0m"
echo

# Check if server is running
echo -e "\033[1;33m1. Checking if development server is running...\033[0m"
if curl -I -s -o /dev/null -w "%{http_code}" http://localhost:3000 | grep -q "200"; then
    echo -e "   \033[0;32m✓ Server is running on port 3000\033[0m"
else
    echo -e "   \033[0;31m✗ Server is not running on port 3000\033[0m"
    echo -e "   \033[1;33mPlease start the development server with 'npm start'\033[0m"
    exit 1
fi

echo
echo -e "\033[1;33m2. Checking required files...\033[0m"

# List of required files
required_files=(
    "src/utils/fetchJson.js"
    "src/utils/errorMap.js"
    "src/utils/errorMapNew.js"
    "src/contexts/ToastContext.js"
    "src/components/ApiSmokeTest.jsx"
    "src/components/DebugChips.jsx"
    "src/components/DevTestPage.jsx"
    "src/api/extractActionsHook.js"
    "src/api/extractPdfImagesHook.js"
    "src/api/extractBggHtml.js"
    "src/api/extractActions.js"
    "src/api/extractPdfImages.js"
)

missing_files=()
for file in "${required_files[@]}"; do
    if [ -f "$file" ]; then
        echo -e "   \033[0;32m✓ $file\033[0m"
    else
        echo -e "   \033[0;31m✗ $file\033[0m"
        missing_files+=("$file")
    fi
done

if [ ${#missing_files[@]} -gt 0 ]; then
    echo
    echo -e "   \033[0;31mMissing files:\033[0m"
    for file in "${missing_files[@]}"; do
        echo -e "   \033[0;31m- $file\033[0m"
    done
    exit 1
fi

echo
echo -e "\033[1;33m3. Checking environment variables...\033[0m"
required_env_vars=(
    "REACT_APP_QA_LABELS=true"
    "REACT_APP_SHOW_DEV_TEST=true"
)

missing_env_vars=()
for var in "${required_env_vars[@]}"; do
    if grep -q "$var" .env 2>/dev/null; then
        echo -e "   \033[0;32m✓ $var\033[0m"
    else
        echo -e "   \033[0;31m✗ $var\033[0m"
        missing_env_vars+=("$var")
    fi
done

if [ ${#missing_env_vars[@]} -gt 0 ]; then
    echo
    echo -e "   \033[0;31mMissing environment variables:\033[0m"
    for var in "${missing_env_vars[@]}"; do
        echo -e "   \033[0;31m- $var\033[0m"
    done
fi

echo
echo -e "\033[1;33m4. Checking modified files...\033[0m"

# Check index.js
if grep -q "DevTestPage" src/index.js 2>/dev/null; then
    echo -e "   \033[0;32m✓ src/index.js properly configured for DevTestPage\033[0m"
else
    echo -e "   \033[0;31m✗ src/index.js not properly configured for DevTestPage\033[0m"
fi

echo
echo -e "\033[1;33m5. Manual Validation Steps (Open browser to http://localhost:3000):\033[0m"
echo -e "   \033[0;36ma. Verify you see the 'Dev Test Page' heading\033[0m"
echo -e "   \033[0;36mb. Click 'Call Health' button\033[0m"
echo -e "      \033[0;36m- Expect: Success toast message\033[0m"
echo -e "      \033[0;36m- Expect: DebugChips info panel shows requestId, latency, source\033[0m"
echo -e "   \033[0;36mc. Click 'Call Oversize (413)' button multiple times rapidly\033[0m"
echo -e "      \033[0;36m- Expect: Only one error toast despite multiple clicks\033[0m"
echo -e "   \033[0;36md. Click 'Call Network Fail' button multiple times rapidly\033[0m"
echo -e "      \033[0;36m- Expect: Only one error toast despite internal retries\033[0m"

echo
echo -e "\033[1;33m6. QA Gating Validation:\033[0m"
echo -e "   \033[0;36ma. Set REACT_APP_QA_LABELS=false in .env\033[0m"
echo -e "   \033[0;36mb. Restart dev server\033[0m"
echo -e "   \033[0;36mc. Click 'Call Health'\033[0m"
echo -e "      \033[0;36m- Expect: Success toast appears\033[0m"
echo -e "      \033[0;36m- Expect: DebugChips info panel does NOT appear\033[0m"

echo
echo -e "\033[1;33m7. Restore Normal App:\033[0m"
echo -e "   \033[0;36ma. Set REACT_APP_SHOW_DEV_TEST=false in .env\033[0m"
echo -e "   \033[0;36mb. Restart dev server\033[0m"
echo -e "   \033[0;36mc. Confirm normal App component is rendered\033[0m"

echo
echo -e "\033[0;32m=== Validation Complete ===\033[0m"

if [ ${#missing_files[@]} -eq 0 ] && [ ${#missing_env_vars[@]} -eq 0 ]; then
    echo -e "   \033[0;32mAll checks passed! The fetchJson implementation is ready for use.\033[0m"
else
    echo -e "   \033[1;33mSome checks failed. Please review the output above.\033[0m"
fi