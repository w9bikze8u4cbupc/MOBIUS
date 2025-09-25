# Exit Codes Documentation

This document defines the exit codes used throughout the MOBIUS pipeline for CI job interpretation and debugging.

## Standard Exit Codes

### General Scripts
- **0**: Success - Operation completed successfully
- **1**: Input/Configuration Error - Invalid arguments, missing files, or configuration issues
- **2**: Processing Failure - Operation failed during execution (e.g., golden check failures)
- **3**: Environment Error - Missing dependencies, system requirements not met
- **4**: Timeout Error - Operation exceeded allowed time limit
- **5**: Resource Error - Insufficient disk space, memory, or other resources

### Media Processing Scripts

#### `scripts/check_golden.js`
- **0**: All golden checks passed
- **1**: Input file not found or invalid arguments
- **2**: Golden check failed (SSIM, audio metrics, or container validation)
- **3**: Missing FFmpeg or other media tools

#### `scripts/generate_golden.js`  
- **0**: Golden artifacts generated successfully
- **1**: Invalid input parameters or missing source files
- **2**: Media processing failed (FFmpeg errors)
- **3**: Output directory creation failed or permission issues

## CI Job Mapping

### GitHub Actions Interpretation
- **Exit 0**: ✅ Step succeeds, continues pipeline
- **Exit 1-5**: ❌ Step fails, stops pipeline (unless `continue-on-error: true`)
- **Timeout**: ⏰ Step cancelled, treated as failure

### Error Categorization for Monitoring
- **Exit 1**: Configuration/Setup issues → DevOps alert
- **Exit 2**: Quality gate failures → QA team notification  
- **Exit 3**: Infrastructure issues → SRE escalation
- **Exit 4**: Performance regression → Performance team alert
- **Exit 5**: Capacity planning → Infrastructure team notification

## Implementation Guidelines

### For New Scripts
```bash
#!/bin/bash
# Script template with proper exit codes

# Validate inputs
if [[ -z "$1" ]]; then
  echo "Error: Missing required input" >&2
  exit 1
fi

# Check environment
if ! command -v ffmpeg &> /dev/null; then
  echo "Error: FFmpeg not found" >&2
  exit 3
fi

# Process with timeout
timeout 300 some_long_operation || {
  echo "Error: Operation timed out" >&2
  exit 4
}

# Check resources
if [[ $(df / | tail -1 | awk '{print $4}') -lt 1000000 ]]; then
  echo "Error: Insufficient disk space" >&2  
  exit 5
fi

echo "Success: Operation completed"
exit 0
```

### Error Logging Integration
All scripts should log errors with structured information:

```javascript
const logger = require('../src/utils/logger');

// Log with exit code context
logger.error('Golden check failed', { 
  exitCode: 2, 
  category: 'quality_gate',
  failures: failures.length 
});
process.exit(2);
```

## Monitoring Integration

### Log Aggregation Queries
- **Configuration Errors**: `exitCode:1`
- **Quality Gates**: `exitCode:2` 
- **Infrastructure**: `exitCode:3`
- **Performance**: `exitCode:4`
- **Capacity**: `exitCode:5`

### Alert Thresholds
- **Exit 1** > 3/hour → Configuration drift alert
- **Exit 2** > 5/hour → Quality regression alert  
- **Exit 3** > 1/hour → Infrastructure investigation
- **Exit 4** > 1/day → Performance review
- **Exit 5** > 1/week → Capacity planning review

## Testing Exit Codes

### Unit Tests
```bash
# Test success case
npm run golden:check:sushi
echo "Exit code: $?"  # Should be 0

# Test failure case  
npm run golden:check:sushi -- --input nonexistent.mp4
echo "Exit code: $?"  # Should be 1
```

### Integration Tests
```yaml
# .github/workflows/test-exit-codes.yml
- name: Test exit codes
  run: |
    set -e
    
    # Test success
    npm run test-command && echo "SUCCESS: Got exit 0" 
    
    # Test expected failure
    ! npm run test-failing-command && echo "SUCCESS: Got non-zero exit"
    
    # Test specific exit code
    npm run test-input-error || [[ $? -eq 1 ]] && echo "SUCCESS: Got exit 1"
```

Last updated: $(date)