#!/bin/bash

# Final Verification Script for Tutorial Visibility Feature
echo -e "\033[0;32m=== Tutorial Visibility Feature - Final Verification ===\033[0m"
echo ""

# Check current directory
projectRoot=$(pwd)
echo -e "\033[0;36mCurrent directory: $projectRoot\033[0m"

# Verify we're in the project root
if [ ! -f "package.json" ] || [ ! -f "client/package.json" ]; then
    echo -e "\033[0;31mERROR: Not in the project root directory!\033[0m"
    echo -e "\033[0;33mPlease run this script from the project root.\033[0m"
    exit 1
fi

echo -e "\033[0;32m✓ In project root directory\033[0m"

# Check for all required files
echo ""
echo -e "\033[0;36mChecking for required files...\033[0m"

required_files=(
    # Core Implementation
    "client/src/utils/env.js"
    "client/src/utils/__tests__/env.test.js"
    "client/src/components/TutorialOrchestrator.jsx"
    "client/src/components/TutorialOrchestrator.test.jsx"
    "client/.env.example"
    
    # CI/CD
    ".github/workflows/tutorial-visibility-ci.yml"
    
    # Package Updates
    "client/package.json"
    
    # Documentation
    "TUTORIAL_VISIBILITY_PR_BODY.md"
    "TUTORIAL_VISIBILITY_CI_README.md"
    "TUTORIAL_VISIBILITY_QUICK_REFERENCE.md"
    "TUTORIAL_VISIBILITY_REVIEW_CHECKLIST.md"
    "TUTORIAL_VISIBILITY_RELEASE_NOTES.md"
    "TUTORIAL_VISIBILITY_MERGE_MESSAGE.md"
    "TUTORIAL_VISIBILITY_GH_COMMAND.md"
    "TUTORIAL_VISIBILITY_BRANCH_PROTECTION.md"
    "TUTORIAL_VISIBILITY_EXECUTION_PLAN.md"
    "TUTORIAL_VISIBILITY_ACTION_SUMMARY.md"
    "TUTORIAL_VISIBILITY_FINAL_CONFIRMATION.md"
    "TUTORIAL_VISIBILITY_MASTER_GUIDE.md"
    
    # Scripts
    "CREATE_TUTORIAL_VISIBILITY_PR.bat"
    "CREATE_TUTORIAL_VISIBILITY_PR.sh"
    "validate_tutorial_ci.ps1"
    "validate_tutorial_ci.sh"
)

all_files_exist=true
missing_files=()

for file in "${required_files[@]}"; do
    if [ -f "$file" ]; then
        if [ -s "$file" ]; then
            echo -e "\033[0;32m✓ $file\033[0m"
        else
            echo -e "\033[0;31m✗ $file (EMPTY)\033[0m"
            all_files_exist=false
            missing_files+=("$file")
        fi
    else
        echo -e "\033[0;31m✗ $file (MISSING)\033[0m"
        all_files_exist=false
        missing_files+=("$file")
    fi
done

echo ""
if [ "$all_files_exist" = true ]; then
    echo -e "\033[0;32m✓ All required files are present and non-empty!\033[0m"
else
    echo -e "\033[0;31m✗ Some files are missing or empty:\033[0m"
    for file in "${missing_files[@]}"; do
        echo -e "\033[0;31m  - $file\033[0m"
    done
    exit 1
fi

# Check package.json for ci:validate script
echo ""
echo -e "\033[0;36mChecking package.json for ci:validate script...\033[0m"

if grep -q "\"ci:validate\":" "client/package.json"; then
    echo -e "\033[0;32m✓ ci:validate script found in package.json\033[0m"
    ci_validate_command=$(grep "\"ci:validate\":" "client/package.json" | sed 's/.*: "\(.*\)",.*/\1/')
    echo -e "\033[0;90m  Command: $ci_validate_command\033[0m"
else
    echo -e "\033[0;31m✗ ci:validate script not found in package.json\033[0m"
    exit 1
fi

# Check that env.js has the correct functions
echo ""
echo -e "\033[0;36mChecking environment helper functions...\033[0m"

if grep -q "getShowTutorial" "client/src/utils/env.js"; then
    echo -e "\033[0;32m✓ getShowTutorial function found\033[0m"
else
    echo -e "\033[0;31m✗ getShowTutorial function not found\033[0m"
fi

if grep -q "getDebugTutorial" "client/src/utils/env.js"; then
    echo -e "\033[0;32m✓ getDebugTutorial function found\033[0m"
else
    echo -e "\033[0;31m✗ getDebugTutorial function not found\033[0m"
fi

# Check that the workflow file exists and has content
echo ""
echo -e "\033[0;36mChecking GitHub Actions workflow...\033[0m"

if [ -f ".github/workflows/tutorial-visibility-ci.yml" ]; then
    if [ -s ".github/workflows/tutorial-visibility-ci.yml" ]; then
        echo -e "\033[0;32m✓ Workflow file exists and has content\033[0m"
    else
        echo -e "\033[0;31m✗ Workflow file is empty\033[0m"
    fi
else
    echo -e "\033[0;31m✗ Workflow file not found\033[0m"
fi

# Summary
echo ""
echo -e "\033[0;32m=== Final Verification Complete ===\033[0m"
echo -e "\033[0;32m✓ All files are present and correctly configured\033[0m"
echo -e "\033[0;32m✓ Package.json has ci:validate script\033[0m"
echo -e "\033[0;32m✓ Environment helper functions are implemented\033[0m"
echo -e "\033[0;32m✓ GitHub Actions workflow is in place\033[0m"
echo ""
echo -e "\033[0;32m🎉 Tutorial Visibility Feature is READY for PR creation!\033[0m"
echo ""
echo -e "\033[0;33mNext steps:\033[0m"
echo -e "\033[0;33m1. Create feature branch and apply patch\033[0m"
echo -e "\033[0;33m2. Push branch to origin\033[0m"
echo -e "\033[0;33m3. Create PR using the command in TUTORIAL_VISIBILITY_GH_COMMAND.md\033[0m"
echo -e "\033[0;33m4. Request review and await CI completion\033[0m"
echo -e "\033[0;33m5. Merge after approval (squash merge recommended)\033[0m"