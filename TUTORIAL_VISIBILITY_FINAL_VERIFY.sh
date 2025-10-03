#!/bin/bash

# Final verification script for tutorial visibility feature

echo -e "\033[0;32m=== Tutorial Visibility Feature - Final Verification ===\033[0m"
echo

# Check that all required files exist
requiredFiles=(
    "TUTORIAL_VISIBILITY_SQUASH_COMMIT_MSG.txt"
    "TUTORIAL_VISIBILITY_RELEASE_NOTE.md"
    "TUTORIAL_VISIBILITY_POST_MERGE_COMMANDS.md"
    "TUTORIAL_VISIBILITY_SMOKE_TEST.md"
    "TUTORIAL_VISIBILITY_MONITORING.md"
    "TUTORIAL_VISIBILITY_ROLLBACK.md"
    "TUTORIAL_VISIBILITY_REVIEWER_GUIDANCE.md"
    "TUTORIAL_VISIBILITY_FINAL_SUMMARY.md"
    "TUTORIAL_VISIBILITY_PROJECT_DELIVERY.md"
    "CREATE_TUTORIAL_VISIBILITY_PR.sh"
    "CREATE_TUTORIAL_VISIBILITY_PR.bat"
)

echo -e "\033[1;33mChecking for required files...\033[0m"
allFilesExist=true
for file in "${requiredFiles[@]}"; do
    if [ -f "$file" ]; then
        echo -e "  \033[0;32m[OK]\033[0m $file"
    else
        echo -e "  \033[0;31m[MISSING]\033[0m $file"
        allFilesExist=false
    fi
done

echo
if [ "$allFilesExist" = true ]; then
    echo -e "\033[0;32m✅ All required files are present!\033[0m"
else
    echo -e "\033[0;31m❌ Some required files are missing!\033[0m"
    exit 1
fi

# Check git status
echo
echo -e "\033[1;33mChecking git status...\033[0m"
git status --porcelain

# Check current branch
echo
echo -e "\033[1;33mChecking current branch...\033[0m"
currentBranch=$(git rev-parse --abbrev-ref HEAD)
if [ "$currentBranch" = "feat/tutorial-visibility" ]; then
    echo -e "  \033[0;32m[OK]\033[0m Current branch is '$currentBranch'"
else
    echo -e "  \033[1;33m[WARN]\033[0m Current branch is '$currentBranch', expected 'feat/tutorial-visibility'"
fi

# Check that the branch has been pushed
echo
echo -e "\033[1;33mChecking if branch has been pushed...\033[0m"
upstreamBranch=$(git rev-parse --abbrev-ref @{u} 2>/dev/null)
if [ -n "$upstreamBranch" ]; then
    echo -e "  \033[0;32m[OK]\033[0m Branch is tracking '$upstreamBranch'"
else
    echo -e "  \033[1;33m[WARN]\033[0m Branch is not tracking an upstream branch"
fi

echo
echo -e "\033[0;32m=== Verification Complete ===\033[0m"
echo
echo -e "\033[1;33mNext steps:\033[0m"
echo -e "\033[0;36m1. Create the PR using one of these methods:\033[0m"
echo -e "   \033[0;36m- Run CREATE_TUTORIAL_VISIBILITY_PR.sh (macOS/Linux)\033[0m"
echo -e "   \033[0;36m- Run CREATE_TUTORIAL_VISIBILITY_PR.bat (Windows)\033[0m"
echo -e "   \033[0;36m- Or manually create a PR on GitHub\033[0m"
echo -e "\033[0;36m2. Paste the contents of TUTORIAL_VISIBILITY_REVIEWER_GUIDANCE.md as a PR comment\033[0m"
echo