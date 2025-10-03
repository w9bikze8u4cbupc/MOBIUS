#!/bin/bash

# Validation script for TutorialOrchestrator visibility feature
echo "🔍 Validating TutorialOrchestrator visibility implementation..."

# Check if required files exist
echo "📁 Checking for required files..."
REQUIRED_FILES=(
  "client/src/utils/env.js"
  "client/src/utils/__tests__/env.test.js"
  "client/src/components/TutorialOrchestrator.test.jsx"
  "client/.env.example"
)

for file in "${REQUIRED_FILES[@]}"; do
  if [ -f "$file" ]; then
    echo "  ✅ $file"
  else
    echo "  ❌ $file (MISSING)"
    exit 1
  fi
done

# Check for README updates
echo "📄 Checking README documentation..."
if grep -q "REACT_APP_SHOW_TUTORIAL" "client/README.md"; then
  echo "  ✅ README updated with REACT_APP_SHOW_TUTORIAL documentation"
else
  echo "  ❌ README not updated with REACT_APP_SHOW_TUTORIAL documentation"
  exit 1
fi

if grep -q "REACT_APP_DEBUG_TUTORIAL" "client/README.md"; then
  echo "  ✅ README updated with REACT_APP_DEBUG_TUTORIAL documentation"
else
  echo "  ❌ README not updated with REACT_APP_DEBUG_TUTORIAL documentation"
  exit 1
fi

# Check for env helper usage in TutorialOrchestrator
echo "🔧 Checking TutorialOrchestrator.jsx for env helper usage..."
if grep -q "getShowTutorial" "client/src/components/TutorialOrchestrator.jsx"; then
  echo "  ✅ TutorialOrchestrator.jsx uses getShowTutorial helper"
else
  echo "  ❌ TutorialOrchestrator.jsx does not use getShowTutorial helper"
  exit 1
fi

# Check for conditional debug logging
echo "🐛 Checking TutorialOrchestrator.jsx for conditional debug logging..."
if grep -q "REACT_APP_DEBUG_TUTORIAL" "client/src/components/TutorialOrchestrator.jsx"; then
  echo "  ✅ TutorialOrchestrator.jsx has conditional debug logging"
else
  echo "  ❌ TutorialOrchestrator.jsx does not have conditional debug logging"
  exit 1
fi

# Run tests
echo "🧪 Running tests..."
cd client
npm test -- --watchAll=false --passWithNoTests
TEST_RESULT=$?

if [ $TEST_RESULT -eq 0 ]; then
  echo "  ✅ All tests passed"
else
  echo "  ❌ Some tests failed"
  exit 1
fi

# Run linting
echo "🧹 Running linting..."
npm run lint -- --quiet
LINT_RESULT=$?

if [ $LINT_RESULT -eq 0 ]; then
  echo "  ✅ No linting errors"
else
  echo "  ❌ Linting errors found"
  exit 1
fi

cd ..

echo "🎉 All validations passed!"
echo ""
echo "To manually verify the feature:"
echo "1. Start the development server: cd client && npm start"
echo "2. Edit client/.env and set REACT_APP_DEBUG_TUTORIAL=true"
echo "3. Restart the development server"
echo "4. Open the browser console and look for the diagnostic message"
echo "5. Edit client/.env and toggle REACT_APP_SHOW_TUTORIAL between true/false"
echo "6. Restart the development server and verify the tutorial shows/hides accordingly"