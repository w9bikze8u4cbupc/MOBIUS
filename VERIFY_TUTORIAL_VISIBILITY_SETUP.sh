#!/bin/bash

# Verify Tutorial Visibility Setup
echo -e "\033[0;32m=== Tutorial Visibility Setup Verification ===\033[0m"
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

# Check for required files
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
    "TUTORIAL_VISIBILITY_QUICK_REFERENCE.md"
    "TUTORIAL_VISIBILITY_REVIEW_CHECKLIST.md"
    "TUTORIAL_VISIBILITY_EXECUTION_PLAN.md"
    
    # Final Merge Artifacts
    "TUTORIAL_VISIBILITY_SQUASH_COMMIT.md"
    "TUTORIAL_VISIBILITY_RELEASE_NOTE.md"
    "TUTORIAL_VISIBILITY_POST_MERGE_COMMANDS.md"
    "TUTORIAL_VISIBILITY_PR_COMMENT.md"
    "TUTORIAL_VISIBILITY_ROLLBACK.md"
    
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

# Summary
echo ""
echo -e "\033[0;32m=== Verification Complete ===\033[0m"
echo -e "\033[0;32m✓ All files are present and correctly configured\033[0m"
echo ""
echo -e "\033[0;32m🎉 Tutorial Visibility Feature is READY for implementation!\033[0m"
echo ""
echo -e "\033[0;33mNext steps:\033[0m"
echo -e "\033[0;33m1. Run local validation scripts\033[0m"
echo -e "\033[0;33m2. Create feature branch and apply patch\033[0m"
echo -e "\033[0;33m3. Push branch and create PR\033[0m"
echo -e "\033[0;33m4. Add review comment from TUTORIAL_VISIBILITY_PR_COMMENT.md\033[0m"
echo -e "\033[0;33m5. Monitor CI and address any feedback\033[0m"
echo -e "\033[0;33m6. Merge using squash with message from TUTORIAL_VISIBILITY_SQUASH_COMMIT.md\033[0m"