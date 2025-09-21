#!/bin/bash

# Validation Script for fetchJson Implementation
# Run this script after starting the development server

echo -e "\033[0;32m=== fetchJson Implementation Validation ===\033[0m"
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
echo -e "\033[1;33m2. Checking environment variables...\033[0m"
if grep -q "REACT_APP_SHOW_DEV_TEST=true" .env 2>/dev/null; then
    echo -e "   \033[0;32m✓ REACT_APP_SHOW_DEV_TEST is set to true\033[0m"
else
    echo -e "   \033[1;33m! REACT_APP_SHOW_DEV_TEST is not set to true or .env file not found\033[0m"
    echo -e "   \033[1;33mThe DevTestPage may not be visible\033[0m"
fi

if grep -q "REACT_APP_QA_LABELS=true" .env 2>/dev/null; then
    echo -e "   \033[0;32m✓ REACT_APP_QA_LABELS is set to true\033[0m"
else
    echo -e "   \033[1;33m! REACT_APP_QA_LABELS is not set to true or .env file not found\033[0m"
    echo -e "   \033[1;33mDebugChips may not be visible\033[0m"
fi

echo
echo -e "\033[1;33m3. Manual Validation Steps (Open browser to http://localhost:3000):\033[0m"
echo -e "   \033[0;36ma. Verify you see the 'Dev Test Page' heading\033[0m"
echo -e "   \033[0;36mb. Click 'Call Health' button\033[0m"
echo -e "      \033[0;36m- Expect: Success toast message\033[0m"
echo -e "      \033[0;36m- Expect: DebugChips info panel shows requestId, latency, source\033[0m"
echo -e "   \033[0;36mc. Click 'Call Oversize (413)' button multiple times rapidly\033[0m"
echo -e "      \033[0;36m- Expect: Only one error toast despite multiple clicks\033[0m"
echo -e "   \033[0;36md. Click 'Call Network Fail' button multiple times rapidly\033[0m"
echo -e "      \033[0;36m- Expect: Only one error toast despite internal retries\033[0m"

echo
echo -e "\033[1;33m4. QA Gating Validation:\033[0m"
echo -e "   \033[0;36ma. Set REACT_APP_QA_LABELS=false in .env\033[0m"
echo -e "   \033[0;36mb. Restart dev server\033[0m"
echo -e "   \033[0;36mc. Click 'Call Health'\033[0m"
echo -e "      \033[0;36m- Expect: Success toast appears\033[0m"
echo -e "      \033[0;36m- Expect: DebugChips info panel does NOT appear\033[0m"

echo
echo -e "\033[1;33m5. Restore Normal App:\033[0m"
echo -e "   \033[0;36ma. Set REACT_APP_SHOW_DEV_TEST=false in .env\033[0m"
echo -e "   \033[0;36mb. Restart dev server\033[0m"
echo -e "   \033[0;36mc. Confirm normal App component is rendered\033[0m"

echo
echo -e "\033[0;32m=== Validation Complete ===\033[0m"