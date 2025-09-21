#!/bin/bash

# Setup coala pre-commit hook
echo "Setting up coala pre-commit hook..."

# Check if we're in a git repository
if [ ! -d ".git" ]; then
    echo "Error: This script must be run from the root of a git repository"
    exit 1
fi

# Create pre-commit hook
HOOK_PATH=".git/hooks/pre-commit"

# Check if pre-commit hook already exists
if [ -f "$HOOK_PATH" ]; then
    echo "Warning: A pre-commit hook already exists. Backing it up..."
    cp "$HOOK_PATH" "${HOOK_PATH}.backup"
fi

# Create the pre-commit hook
cat > "$HOOK_PATH" << 'EOF'
#!/bin/sh

# Run coala static analysis
echo "Running coala pre-commit checks..."

# Activate virtual environment if it exists
if [ -f ".venv/bin/activate" ]; then
    . .venv/bin/activate
elif [ -f ".venv/Scripts/activate" ]; then
    # Windows virtual environment
    . .venv/Scripts/activate
fi

# Run coala in non-interactive mode
coala --non-interactive

# Check the exit code
if [ $? -ne 0 ]; then
    echo "❌ coala found issues that need to be addressed before committing"
    echo "💡 Run 'coala -A' to automatically fix some issues"
    echo "💡 Run 'coala --non-interactive' to see all issues"
    exit 1
fi

echo "✅ coala checks passed"
exit 0
EOF

# Make the hook executable
chmod +x "$HOOK_PATH"

echo "✅ coala pre-commit hook installed successfully!"
echo "💡 The hook will automatically run coala before each commit"
echo "💡 To bypass the hook, use: git commit --no-verify"