#!/usr/bin/env python3
"""
Validate quality-gates-config.json against schema and best practices
"""

import json
import sys
from typing import Dict, Any, List

def load_config(config_path: str) -> Dict[str, Any]:
    """Load the quality gates configuration file."""
    try:
        with open(config_path, 'r') as f:
            return json.load(f)
    except FileNotFoundError:
        print(f"❌ Error: Configuration file {config_path} not found")
        sys.exit(1)
    except json.JSONDecodeError as e:
        print(f"❌ Error: Invalid JSON in {config_path}: {e}")
        sys.exit(1)

def validate_required_sections(config: Dict[str, Any]) -> List[str]:
    """Validate that all required sections are present."""
    required_sections = [
        'deployment',
        'performance', 
        'infrastructure',
        'quality',
        'monitoring',
        'golden_tests',
        'backup_retention',
        'notifications',
        'placeholders'
    ]
    
    missing = []
    for section in required_sections:
        if section not in config:
            missing.append(section)
    
    return missing

def validate_performance_thresholds(config: Dict[str, Any]) -> List[str]:
    """Validate performance threshold values are reasonable."""
    errors = []
    perf = config.get('performance', {})
    
    # Response time checks
    p95 = perf.get('response_time_p95_ms', 0)
    p99 = perf.get('response_time_p99_ms', 0)
    
    if p95 <= 0:
        errors.append("response_time_p95_ms must be > 0")
    elif p95 > 10000:
        errors.append("response_time_p95_ms seems too high (>10s)")
        
    if p99 <= 0:
        errors.append("response_time_p99_ms must be > 0")  
    elif p99 <= p95:
        errors.append("response_time_p99_ms should be > response_time_p95_ms")
    
    # Error rate checks
    error_rate = perf.get('error_rate_threshold', 1.0)
    if error_rate < 0 or error_rate > 1:
        errors.append("error_rate_threshold must be between 0 and 1")
    
    return errors

def validate_infrastructure_thresholds(config: Dict[str, Any]) -> List[str]:
    """Validate infrastructure threshold values."""
    errors = []
    infra = config.get('infrastructure', {})
    
    thresholds = {
        'cpu_usage_threshold': (0, 1),
        'memory_usage_threshold': (0, 1), 
        'disk_usage_threshold': (0, 1)
    }
    
    for key, (min_val, max_val) in thresholds.items():
        value = infra.get(key, 0)
        if value < min_val or value > max_val:
            errors.append(f"{key} must be between {min_val} and {max_val}")
    
    return errors

def validate_golden_tests(config: Dict[str, Any]) -> List[str]:
    """Validate golden test configuration."""
    errors = []
    golden = config.get('golden_tests', {})
    
    # SSIM threshold should be close to 1.0
    ssim = golden.get('ssim_threshold', 0)
    if ssim < 0.9 or ssim > 1.0:
        errors.append("ssim_threshold should be between 0.9 and 1.0")
    
    # Platforms should include the expected ones
    platforms = golden.get('frame_comparison_platforms', [])
    expected_platforms = {'ubuntu-latest', 'macos-latest', 'windows-latest'}
    actual_platforms = set(platforms)
    
    if not expected_platforms.issubset(actual_platforms):
        missing = expected_platforms - actual_platforms
        errors.append(f"Missing platforms in frame_comparison_platforms: {missing}")
    
    return errors

def check_placeholders(config: Dict[str, Any]) -> List[str]:
    """Check for unresolved placeholders that need attention."""
    warnings = []
    placeholders = config.get('placeholders', {})
    
    for key, value in placeholders.items():
        if isinstance(value, str) and 'Replace with' in value:
            warnings.append(f"Placeholder {key} needs configuration: {value}")
    
    return warnings

def validate_deployment_config(config: Dict[str, Any]) -> List[str]:
    """Validate deployment configuration values."""
    errors = []
    deploy = config.get('deployment', {})
    
    # Check required CI checks
    required_checks = deploy.get('required_ci_checks', [])
    expected_checks = {'CI / build-and-qa', 'premerge-validation', 'premerge-artifacts-upload'}
    actual_checks = set(required_checks)
    
    if not expected_checks.issubset(actual_checks):
        missing = expected_checks - actual_checks  
        errors.append(f"Missing required CI checks: {missing}")
    
    # Validate approval requirements
    approvals = deploy.get('required_approvals', 0)
    if approvals < 2:
        errors.append("required_approvals should be at least 2")
    
    return errors

def main():
    """Main validation function."""
    config_path = 'quality-gates-config.json'
    
    print("🔍 Validating quality-gates-config.json...")
    
    # Load configuration
    config = load_config(config_path)
    print("✅ Configuration loaded successfully")
    
    # Validate structure
    errors = []
    warnings = []
    
    # Check required sections
    missing_sections = validate_required_sections(config)
    if missing_sections:
        errors.extend([f"Missing required section: {section}" for section in missing_sections])
    
    # Validate specific sections
    errors.extend(validate_performance_thresholds(config))
    errors.extend(validate_infrastructure_thresholds(config))
    errors.extend(validate_golden_tests(config))
    errors.extend(validate_deployment_config(config))
    
    # Check placeholders
    placeholder_warnings = check_placeholders(config)
    warnings.extend(placeholder_warnings)
    
    # Report results
    print(f"\n📊 Validation Results:")
    print(f"   Sections validated: {len(config)} found")
    print(f"   Errors: {len(errors)}")
    print(f"   Warnings: {len(warnings)}")
    
    if errors:
        print("\n❌ Errors found:")
        for error in errors:
            print(f"   - {error}")
    
    if warnings:
        print("\n⚠️  Warnings:")
        for warning in warnings:
            print(f"   - {warning}")
    
    if not errors and not warnings:
        print("\n✅ Quality gates configuration is valid and complete!")
        return 0
    elif not errors:
        print("\n✅ Quality gates configuration is valid (warnings can be addressed)")
        return 0
    else:
        print("\n❌ Quality gates configuration has errors that must be fixed")
        return 1

if __name__ == '__main__':
    sys.exit(main())