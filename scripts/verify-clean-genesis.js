const fs = require('fs');
const path = require('path');

/**
 * verify-clean-genesis.js
 * 
 * Verifies that the genesis state is clean and generates a timestamped report.
 * Exit code 0 indicates success, non-zero indicates failure.
 */

async function verifyCleanGenesis() {
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const reportDir = path.join(process.cwd(), 'verification-reports');
  const reportPath = path.join(reportDir, `genesis-verification-${timestamp}.json`);
  
  const report = {
    timestamp: new Date().toISOString(),
    status: 'success',
    checks: [],
    summary: 'Genesis verification completed successfully'
  };

  try {
    // Ensure report directory exists
    if (!fs.existsSync(reportDir)) {
      fs.mkdirSync(reportDir, { recursive: true });
      console.log(`Created verification reports directory: ${reportDir}`);
    }

    // Perform verification checks
    console.log('Starting genesis verification...');

    // Check 1: Verify package.json exists
    const packageJsonPath = path.join(process.cwd(), 'package.json');
    if (fs.existsSync(packageJsonPath)) {
      report.checks.push({
        name: 'package.json exists',
        status: 'passed',
        message: 'package.json found'
      });
      console.log('✓ package.json exists');
    } else {
      report.checks.push({
        name: 'package.json exists',
        status: 'failed',
        message: 'package.json not found'
      });
      report.status = 'failed';
      console.error('✗ package.json not found');
    }

    // Check 2: Verify required dependencies
    if (fs.existsSync(packageJsonPath)) {
      const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));
      const requiredDeps = ['express', 'cors'];
      const missingDeps = [];

      for (const dep of requiredDeps) {
        if (packageJson.dependencies && packageJson.dependencies[dep]) {
          console.log(`✓ Dependency '${dep}' found: ${packageJson.dependencies[dep]}`);
          report.checks.push({
            name: `dependency: ${dep}`,
            status: 'passed',
            message: `Found ${dep}@${packageJson.dependencies[dep]}`
          });
        } else {
          console.error(`✗ Dependency '${dep}' missing`);
          missingDeps.push(dep);
          report.checks.push({
            name: `dependency: ${dep}`,
            status: 'failed',
            message: `Missing dependency: ${dep}`
          });
        }
      }

      if (missingDeps.length > 0) {
        report.status = 'failed';
        report.summary = `Missing required dependencies: ${missingDeps.join(', ')}`;
      }
    }

    // Check 3: Verify scripts directory exists
    const scriptsDir = path.join(process.cwd(), 'scripts');
    if (fs.existsSync(scriptsDir)) {
      report.checks.push({
        name: 'scripts directory exists',
        status: 'passed',
        message: 'scripts directory found'
      });
      console.log('✓ scripts directory exists');
    } else {
      report.checks.push({
        name: 'scripts directory exists',
        status: 'failed',
        message: 'scripts directory not found'
      });
      report.status = 'failed';
      console.error('✗ scripts directory not found');
    }

    // Write report
    fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));
    console.log(`\nVerification report written to: ${reportPath}`);
    console.log(`\nSummary: ${report.summary}`);
    console.log(`Status: ${report.status}`);

    // Exit with appropriate code
    if (report.status === 'failed') {
      console.error('\n✗ Genesis verification FAILED');
      process.exit(1);
    } else {
      console.log('\n✓ Genesis verification PASSED');
      process.exit(0);
    }
  } catch (error) {
    console.error('Error during verification:', error);
    report.status = 'error';
    report.summary = `Verification error: ${error.message}`;
    report.error = {
      message: error.message,
      stack: error.stack
    };

    // Try to write error report
    try {
      fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));
      console.error(`Error report written to: ${reportPath}`);
    } catch (writeError) {
      console.error('Failed to write error report:', writeError);
    }

    process.exit(2);
  }
}

// Run verification
verifyCleanGenesis();
