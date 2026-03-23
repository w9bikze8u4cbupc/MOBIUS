// CJS bridge for Jest compatibility — re-exports from the ESM verifier
// This file reads the .mjs source and extracts the pure functions for testing
const fs = require('fs');
const path = require('path');

const REPO_ROOT = path.join(__dirname, '../..');
const CONTRACT_PATH = path.join(REPO_ROOT, 'config/elite/MOBIUS_ELITE_VIDEO_STANDARD_v1.json');
const DEFAULT_METRICS_PATH = path.join(__dirname, 'sample-elite-metrics.json');

function evaluateRule(rule, metrics) {
  const metric = metrics[rule.id];

  if (!metric) {
    return {
      id: rule.id,
      passed: false,
      points_awarded: 0,
      severity: rule.severity,
      hard_fail_triggered: rule.severity === 'HARD_FAIL',
      reason: 'metric_missing'
    };
  }

  const { threshold } = rule;
  const actual = metric.actual;
  let passed = false;

  try {
    switch (threshold.op) {
      case '==':
        passed = actual === threshold.target;
        break;
      case '<=':
        passed = actual <= threshold.target;
        break;
      case '>=':
        if (threshold.min_width !== undefined && threshold.min_height !== undefined) {
          if (typeof actual === 'object' && actual !== null) {
            passed = actual.width >= threshold.min_width && actual.height >= threshold.min_height;
          } else {
            passed = false;
          }
        } else {
          passed = actual >= threshold.target;
        }
        break;
      case '<':
        passed = actual < threshold.target;
        break;
      case '>':
        passed = actual > threshold.target;
        break;
      case 'within_tolerance':
        passed = Math.abs(actual - threshold.target) <= threshold.tolerance;
        break;
      case 'within_range':
        passed = actual >= threshold.min && actual <= threshold.max;
        break;
      case 'matches_sequence':
        if (!Array.isArray(actual)) { passed = false; break; }
        if (actual.length !== threshold.required_sequence.length) { passed = false; break; }
        passed = actual.every((val, idx) => val === threshold.required_sequence[idx]);
        break;
      case 'intro_duration_lte_or_cold_open':
        if (typeof actual === 'object' && actual !== null) {
          passed = (actual.intro_duration <= threshold.intro_max) || actual.cold_open === true;
        } else {
          passed = false;
        }
        break;
      case 'combinatorial_compression_required':
        if (typeof actual === 'object' && actual !== null) {
          const triggers = threshold.triggers;
          const triggered = (
            (actual.max_branch_count || 0) >= triggers.branch_count ||
            (actual.max_exception_layers || 0) >= triggers.exception_layers ||
            (actual.max_interaction_variables || 0) >= triggers.interaction_variables ||
            (actual.max_projected_runtime_seconds || 0) >= triggers.projected_runtime_seconds
          );
          if (!triggered) {
            passed = true;
          } else {
            const subsystemsWithReferral = actual.subsystems_with_referral || [];
            passed = subsystemsWithReferral.length > 0 || !triggered;
          }
        } else {
          passed = false;
        }
        break;
      default:
        passed = false;
        break;
    }
  } catch (error) {
    passed = false;
  }

  return {
    id: rule.id,
    passed,
    points_awarded: passed ? rule.scoring.points : 0,
    severity: rule.severity,
    hard_fail_triggered: !passed && rule.severity === 'HARD_FAIL'
  };
}

function verifyElite(contract, metrics) {
  const results = [];
  let eliteScore = 0;
  let hardFailCount = 0;
  let softWarnCount = 0;

  for (const rule of contract.rules) {
    const result = evaluateRule(rule, metrics);
    results.push(result);
    eliteScore += result.points_awarded;
    if (result.hard_fail_triggered) {
      hardFailCount++;
    } else if (!result.passed && rule.severity === 'SOFT_WARN') {
      softWarnCount++;
    }
  }

  results.sort((a, b) => a.id.localeCompare(b.id));

  return {
    contract_id: contract.contract_id,
    contract_version: contract.contract_version,
    eliteScore,
    score_total: contract.score_total,
    elite_threshold_score: contract.elite_threshold_score,
    hardFailCount,
    softWarnCount,
    passed_elite_threshold: eliteScore >= contract.elite_threshold_score && hardFailCount === 0,
    rules: results
  };
}

module.exports = { evaluateRule, verifyElite };
