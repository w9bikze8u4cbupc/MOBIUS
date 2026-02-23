#!/usr/bin/env node
// scripts/elite/verify-pro-video-elite.mjs
// Elite verifier skeleton: score computation + HARD_FAIL gate (no ffmpeg extraction yet)

import { readFileSync, writeFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { pathToFileURL } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const REPO_ROOT = join(__dirname, '../..');

const CONTRACT_PATH = join(REPO_ROOT, 'config/elite/MOBIUS_ELITE_VIDEO_STANDARD_v1.json');
const DEFAULT_METRICS_PATH = join(__dirname, 'sample-elite-metrics.json');
const DEFAULT_OUTPUT_PATH = join(process.cwd(), 'elite_qc_report.json');

// Parse CLI args
function parseArgs() {
  const args = process.argv.slice(2);
  let metricsPath = DEFAULT_METRICS_PATH;
  let outputPath = DEFAULT_OUTPUT_PATH;

  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--metrics' && i + 1 < args.length) {
      metricsPath = args[i + 1];
      i++;
    } else if (args[i] === '--out' && i + 1 < args.length) {
      outputPath = args[i + 1];
      i++;
    }
  }

  return { metricsPath, outputPath };
}

// Evaluate a single rule against metrics
function evaluateRule(rule, metrics) {
  const metric = metrics[rule.id];
  
  if (!metric) {
    // Missing metric - treat as fail but include severity
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
        {
          // Handle resolution check (V1) with min_width/min_height
          if (threshold.min_width !== undefined && threshold.min_height !== undefined) {
            if (typeof actual === 'object' && actual !== null) {
              passed = actual.width >= threshold.min_width && actual.height >= threshold.min_height;
            } else {
              passed = false;
            }
          } else {
            passed = actual >= threshold.target;
          }
        }
        break;

      case '<':
        passed = actual < threshold.target;
        break;

      case '>':
        passed = actual > threshold.target;
        break;

      case 'within_tolerance':
        {
          const delta = Math.abs(actual - threshold.target);
          passed = delta <= threshold.tolerance;
        }
        break;

      case 'within_range':
        passed = actual >= threshold.min && actual <= threshold.max;
        break;

      case 'matches_sequence':
        {
          if (!Array.isArray(actual)) {
            passed = false;
            break;
          }
          const required = threshold.required_sequence;
          if (actual.length !== required.length) {
            passed = false;
            break;
          }
          passed = actual.every((val, idx) => val === required[idx]);
        }
        break;

      case 'intro_duration_lte_or_cold_open':
        {
          if (typeof actual === 'object' && actual !== null) {
            const introDuration = actual.intro_duration;
            const coldOpen = actual.cold_open;
            passed = (introDuration <= threshold.intro_max) || coldOpen === true;
          } else {
            passed = false;
          }
        }
        break;

      case 'combinatorial_compression_required':
        {
          // S4: Check if any subsystem exceeds thresholds without proper referral
          if (typeof actual === 'object' && actual !== null) {
            const triggers = threshold.triggers;
            const maxBranch = actual.max_branch_count || 0;
            const maxLayers = actual.max_exception_layers || 0;
            const maxVars = actual.max_interaction_variables || 0;
            const maxRuntime = actual.max_projected_runtime_seconds || 0;
            
            // Check if ANY threshold exceeded
            const triggered = (
              maxBranch >= triggers.branch_count ||
              maxLayers >= triggers.exception_layers ||
              maxVars >= triggers.interaction_variables ||
              maxRuntime >= triggers.projected_runtime_seconds
            );
            
            if (!triggered) {
              // No subsystem exceeds thresholds - pass
              passed = true;
            } else {
              // At least one subsystem triggered - check if all have referrals
              const subsystemsWithReferral = actual.subsystems_with_referral || [];
              // For now, pass if triggered subsystems have referrals
              // Future: validate referral block structure
              passed = subsystemsWithReferral.length > 0 || !triggered;
            }
          } else {
            passed = false;
          }
        }
        break;

      default:
        // Unknown operator - treat as fail
        passed = false;
        break;
    }
  } catch (error) {
    // Evaluation error - treat as fail
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

// Main verification function
function verifyElite(contract, metrics) {
  const results = [];
  let eliteScore = 0;
  let hardFailCount = 0;
  let softWarnCount = 0;

  // Evaluate each rule
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

  // Sort results by ID for determinism
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

// Main function
async function main() {
  const { metricsPath, outputPath } = parseArgs();

  console.log('Elite Verifier Skeleton');
  console.log('======================');
  console.log(`Contract: ${CONTRACT_PATH}`);
  console.log(`Metrics:  ${metricsPath}`);
  console.log(`Output:   ${outputPath}`);
  console.log('');

  // Load contract
  const contract = JSON.parse(readFileSync(CONTRACT_PATH, 'utf8'));
  console.log(`✓ Loaded contract: ${contract.contract_id} v${contract.contract_version}`);

  // Load metrics
  const metrics = JSON.parse(readFileSync(metricsPath, 'utf8'));
  console.log(`✓ Loaded metrics: ${Object.keys(metrics).length} rule metrics`);

  // Verify
  const report = verifyElite(contract, metrics);
  console.log('');
  console.log('Results:');
  console.log(`  Elite Score:       ${report.eliteScore} / ${report.score_total}`);
  console.log(`  Threshold:         ${report.elite_threshold_score}`);
  console.log(`  HARD_FAIL count:   ${report.hardFailCount}`);
  console.log(`  SOFT_WARN count:   ${report.softWarnCount}`);
  console.log(`  Passed threshold:  ${report.passed_elite_threshold ? 'YES' : 'NO'}`);
  console.log('');

  // Write report
  writeFileSync(outputPath, JSON.stringify(report, null, 2) + '\n', 'utf8');
  console.log(`✓ Report written: ${outputPath}`);

  // Exit code
  if (report.hardFailCount > 0) {
    console.log('');
    console.log('❌ HARD_FAIL rules failed - blocking release');
    process.exit(2);
  } else if (!report.passed_elite_threshold) {
    console.log('');
    console.log('⚠️  Score below Elite threshold');
    process.exit(3);
  } else {
    console.log('');
    console.log('✅ Elite verification passed');
    process.exit(0);
  }
}

// ESM main guard
if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    console.error('Error:', error.message);
    process.exit(1);
  });
}

// Export for testing
export { evaluateRule, verifyElite };

// Programmatic API for release harness integration
export async function verifyEliteMetrics({ metricsPath, outputPath, contractPath }) {
  // Load contract
  const contract = JSON.parse(readFileSync(contractPath || CONTRACT_PATH, 'utf8'));
  
  // Load metrics
  const metrics = JSON.parse(readFileSync(metricsPath, 'utf8'));
  
  // Verify
  const report = verifyElite(contract, metrics);
  
  // Write output if path provided
  if (outputPath) {
    writeFileSync(outputPath, JSON.stringify(report, null, 2) + '\n', 'utf8');
  }
  
  return report;
}
