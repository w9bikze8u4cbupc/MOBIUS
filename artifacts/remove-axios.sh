#!/bin/bash

# Script to remove axios from package.json after migration

# Check if axios is installed
if grep -q '"axios"' client/package.json; then
  echo "Removing axios from dependencies..."
  # Use npm or yarn to remove axios
  cd client
  npm uninstall axios
  # or use yarn if you prefer: yarn remove axios
  cd ..
  echo "Axios successfully removed from dependencies"
else
  echo "Axios not found in package.json"
fi

# Verify no remaining axios imports
echo "Checking for remaining axios imports..."
if grep -r "import.*axios" client/src --include="*.js" --include="*.jsx" > /dev/null; then
  echo "Warning: Found remaining axios imports in source files"
  grep -r "import.*axios" client/src --include="*.js" --include="*.jsx"
else
  echo "No remaining axios imports found"
fi