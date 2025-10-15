#!/bin/bash

# Test script for verification scripts
echo "=== Testing Verification Scripts ==="

# Test 1: Check that all required scripts exist
echo "Test 1: Checking script existence..."
required_scripts=(
    "build-and-push.ps1"
    "build-and-push.sh"
    "update-manifests.ps1"
    "update-manifests.sh"
    "apply-manifests.ps1"
    "apply-manifests.sh"
    "deploy-preview-worker.ps1"
    "deploy-preview-worker.sh"
    "verify-deployment.ps1"
    "verify-deployment.sh"
)

all_exist=true
for script in "${required_scripts[@]}"; do
    if [ -f "$script" ]; then
        echo "  [PASS] $script exists"
    else
        echo "  [FAIL] $script missing"
        all_exist=false
    fi
done

if [ "$all_exist" = false ]; then
    echo "Test 1 FAILED: Some required scripts are missing"
    exit 1
else
    echo "Test 1 PASSED: All required scripts exist"
fi

# Test 2: Check that bash scripts have proper shebang
echo "Test 2: Checking bash scripts for proper shebang..."
sh_scripts=$(find . -name "*.sh")
proper_shebang=true

for script in $sh_scripts; do
    first_line=$(head -n 1 "$script")
    if [ "$first_line" = "#!/bin/bash" ]; then
        echo "  [PASS] $(basename "$script") has proper shebang"
    else
        echo "  [FAIL] $(basename "$script") missing or incorrect shebang"
        proper_shebang=false
    fi
done

if [ "$proper_shebang" = true ]; then
    echo "Test 2 PASSED: All bash scripts have proper shebang"
else
    echo "Test 2 FAILED: Some bash scripts missing proper shebang"
    exit 1
fi

# Test 3: Check that scripts are executable
echo "Test 3: Checking script permissions..."
all_executable=true

for script in $sh_scripts; do
    if [ -x "$script" ]; then
        echo "  [PASS] $(basename "$script") is executable"
    else
        echo "  [FAIL] $(basename "$script") is not executable"
        all_executable=false
    fi
done

if [ "$all_executable" = true ]; then
    echo "Test 3 PASSED: All bash scripts are executable"
else
    echo "Test 3 FAILED: Some bash scripts are not executable"
    exit 1
fi

# Test 4: Check for idempotent design patterns
echo "Test 4: Checking for idempotent design patterns..."
idempotent_patterns=true

# Look for common idempotent patterns in our scripts
for script in $(find . -name "*.sh" -o -name "*.ps1"); do
    # Check for create namespace patterns (should include error handling or check first)
    if grep -q "kubectl create namespace" "$script" && ! grep -q "2>/dev/null\|exists\|get namespace" "$script"; then
        echo "  [WARN] $(basename "$script") may not be idempotent (namespace creation)"
    fi
    
    # Check for apply patterns (generally idempotent)
    if grep -q "kubectl apply" "$script"; then
        echo "  [PASS] $(basename "$script") uses idempotent apply operations"
    fi
done

echo "Test 4 INFO: Idempotent design check complete"

echo "=== Verification Script Tests Complete ==="
echo "Summary: All critical tests passed. Ready for CI/CD integration."