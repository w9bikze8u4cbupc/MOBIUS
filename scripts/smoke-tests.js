#!/usr/bin/env node

// scripts/smoke-tests.js
// Smoke test suite for MOBIUS video generation pipeline

const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

function parseArgs() {
  const args = process.argv.slice(2);
  const options = {
    quick: false,
    help: false,
    verbose: false
  };

  for (let i = 0; i < args.length; i++) {
    switch (args[i]) {
      case '--quick':
        options.quick = true;
        break;
      case '--verbose':
        options.verbose = true;
        break;
      case '--help':
        options.help = true;
        break;
      default:
        console.error(`Unknown option: ${args[i]}`);
        showUsage();
        process.exit(1);
    }
  }

  return options;
}

function showUsage() {
  console.log(`
Usage: node scripts/smoke-tests.js [options]

Smoke test suite for MOBIUS video generation pipeline.

Options:
  --quick          Run only essential smoke tests (faster)
  --verbose        Show detailed output from tests
  --help           Show this help

Examples:
  node scripts/smoke-tests.js --quick
  node scripts/smoke-tests.js --verbose
`);
}

function log(message, level = 'info') {
  const timestamp = new Date().toISOString();
  const prefix = level.toUpperCase();
  console.log(`[${timestamp}] [${prefix}] ${message}`);
}

function runCommand(command, args, options = {}) {
  const result = spawnSync(command, args, {
    encoding: 'utf8',
    stdio: options.verbose ? 'inherit' : 'pipe',
    ...options
  });
  
  return {
    success: result.status === 0,
    status: result.status,
    stdout: result.stdout,
    stderr: result.stderr,
    error: result.error
  };
}

function testNodejsEnvironment() {
  log('Testing Node.js environment...');
  
  const tests = [
    {
      name: 'Node.js version',
      test: () => {
        const result = runCommand('node', ['--version']);
        if (!result.success) return { success: false, error: 'Node.js not available' };
        
        const version = result.stdout.trim();
        const majorVersion = parseInt(version.replace(/^v/, '').split('.')[0]);
        
        if (majorVersion < 14) {
          return { success: false, error: `Node.js version too old: ${version}. Requires v14+` };
        }
        
        return { success: true, version };
      }
    },
    {
      name: 'npm availability',
      test: () => {
        const result = runCommand('npm', ['--version']);
        if (!result.success) return { success: false, error: 'npm not available' };
        return { success: true, version: result.stdout.trim() };
      }
    }
  ];

  return runTestSuite('Node.js Environment', tests);
}

function testSystemDependencies() {
  log('Testing system dependencies...');
  
  const tests = [
    {
      name: 'FFmpeg availability',
      test: () => {
        const result = runCommand('ffmpeg', ['-version']);
        if (!result.success) return { success: false, error: 'FFmpeg not available' };
        
        const output = result.stdout || result.stderr || '';
        const versionMatch = output.match(/ffmpeg version ([^\s]+)/);
        const version = versionMatch ? versionMatch[1] : 'unknown';
        
        return { success: true, version };
      }
    },
    {
      name: 'Python availability',
      test: () => {
        const result = runCommand('python3', ['--version']);
        if (!result.success) {
          // Try 'python' fallback
          const fallback = runCommand('python', ['--version']);
          if (!fallback.success) {
            return { success: false, error: 'Python not available' };
          }
          return { success: true, version: fallback.stdout.trim() };
        }
        return { success: true, version: result.stdout.trim() };
      }
    }
  ];

  return runTestSuite('System Dependencies', tests);
}

function testProjectStructure() {
  log('Testing project structure...');
  
  const requiredPaths = [
    { path: 'package.json', type: 'file', description: 'Package configuration' },
    { path: 'src/', type: 'directory', description: 'Source code directory' },
    { path: 'scripts/', type: 'directory', description: 'Scripts directory' },
    { path: 'scripts/check_golden.js', type: 'file', description: 'Golden test checker' },
    { path: 'scripts/generate_golden.js', type: 'file', description: 'Golden test generator' }
  ];

  const tests = requiredPaths.map(item => ({
    name: `${item.description} (${item.path})`,
    test: () => {
      const exists = fs.existsSync(item.path);
      if (!exists) {
        return { success: false, error: `${item.type} not found: ${item.path}` };
      }
      
      const stats = fs.statSync(item.path);
      const isCorrectType = item.type === 'file' ? stats.isFile() : stats.isDirectory();
      
      if (!isCorrectType) {
        return { success: false, error: `Expected ${item.type} but found ${stats.isFile() ? 'file' : 'directory'}: ${item.path}` };
      }
      
      return { success: true };
    }
  }));

  return runTestSuite('Project Structure', tests);
}

function testPackageDependencies() {
  log('Testing package dependencies...');
  
  const tests = [
    {
      name: 'package.json validity',
      test: () => {
        try {
          const packageJson = JSON.parse(fs.readFileSync('package.json', 'utf8'));
          if (!packageJson.name) return { success: false, error: 'package.json missing name field' };
          if (!packageJson.version) return { success: false, error: 'package.json missing version field' };
          return { success: true, name: packageJson.name, version: packageJson.version };
        } catch (error) {
          return { success: false, error: `Invalid package.json: ${error.message}` };
        }
      }
    },
    {
      name: 'node_modules existence',
      test: () => {
        const exists = fs.existsSync('node_modules');
        if (!exists) {
          return { success: false, error: 'node_modules not found. Run npm install.' };
        }
        return { success: true };
      }
    }
  ];

  return runTestSuite('Package Dependencies', tests);
}

function testVideoProcessingCapabilities(quick = false) {
  log('Testing video processing capabilities...');
  
  const tests = [
    {
      name: 'FFmpeg basic functionality',
      test: () => {
        // Test FFmpeg help command
        const result = runCommand('ffmpeg', ['-f', 'lavfi', '-i', 'testsrc=duration=1:size=320x240:rate=1', '-frames:v', '1', '-f', 'null', '-'], { timeout: 10000 });
        if (!result.success) {
          return { success: false, error: `FFmpeg test failed: ${result.stderr || 'Unknown error'}` };
        }
        return { success: true };
      }
    }
  ];

  if (!quick) {
    tests.push({
      name: 'Golden test scripts executable',
      test: () => {
        const scripts = ['check_golden.js', 'generate_golden.js'];
        for (const script of scripts) {
          const scriptPath = path.join('scripts', script);
          if (!fs.existsSync(scriptPath)) {
            return { success: false, error: `Script not found: ${scriptPath}` };
          }
          
          // Test that the script can be executed (just show help)
          const result = runCommand('node', [scriptPath, '--help']);
          if (!result.success && result.status !== 1) { // Some scripts exit 1 on --help
            return { success: false, error: `Script not executable: ${scriptPath}` };
          }
        }
        return { success: true };
      }
    });
  }

  return runTestSuite('Video Processing Capabilities', tests);
}

function testGoldenTestInfrastructure(quick = false) {
  log('Testing golden test infrastructure...');
  
  const tests = [
    {
      name: 'Golden test directory structure',
      test: () => {
        const goldenDir = 'tests/golden';
        if (!fs.existsSync(goldenDir)) {
          return { success: false, error: `Golden test directory not found: ${goldenDir}` };
        }
        
        const entries = fs.readdirSync(goldenDir, { withFileTypes: true });
        const subdirs = entries.filter(entry => entry.isDirectory()).map(entry => entry.name);
        
        if (subdirs.length === 0) {
          return { success: false, error: 'No golden test subdirectories found' };
        }
        
        return { success: true, subdirs };
      }
    }
  ];

  if (!quick) {
    // Additional golden test infrastructure tests could go here
    tests.push({
      name: 'Golden test data validity',
      test: () => {
        const goldenDir = 'tests/golden';
        const subdirs = fs.readdirSync(goldenDir, { withFileTypes: true })
          .filter(entry => entry.isDirectory())
          .map(entry => entry.name);
        
        let validTests = 0;
        for (const subdir of subdirs) {
          const containerPath = path.join(goldenDir, subdir, 'container.json');
          if (fs.existsSync(containerPath)) {
            try {
              JSON.parse(fs.readFileSync(containerPath, 'utf8'));
              validTests++;
            } catch (error) {
              // Invalid JSON, but don't fail the entire test
            }
          }
        }
        
        if (validTests === 0) {
          return { success: false, error: 'No valid golden test data found' };
        }
        
        return { success: true, validTests, totalDirs: subdirs.length };
      }
    });
  }

  return runTestSuite('Golden Test Infrastructure', tests);
}

function runTestSuite(suiteName, tests) {
  log(`Running ${suiteName} tests...`);
  
  const results = {
    suite: suiteName,
    tests: [],
    passed: 0,
    failed: 0,
    total: tests.length
  };

  for (const test of tests) {
    try {
      const result = test.test();
      results.tests.push({
        name: test.name,
        ...result
      });

      if (result.success) {
        results.passed++;
        log(`  ✓ ${test.name}`, 'debug');
      } else {
        results.failed++;
        log(`  ✗ ${test.name}: ${result.error}`, 'error');
      }
    } catch (error) {
      results.failed++;
      results.tests.push({
        name: test.name,
        success: false,
        error: error.message
      });
      log(`  ✗ ${test.name}: ${error.message}`, 'error');
    }
  }

  log(`${suiteName}: ${results.passed}/${results.total} tests passed`);
  return results;
}

function generateReport(allResults) {
  const totalTests = allResults.reduce((sum, suite) => sum + suite.total, 0);
  const totalPassed = allResults.reduce((sum, suite) => sum + suite.passed, 0);
  const totalFailed = allResults.reduce((sum, suite) => sum + suite.failed, 0);

  console.log('\n' + '='.repeat(60));
  console.log('SMOKE TEST REPORT');
  console.log('='.repeat(60));
  console.log(`Total Tests: ${totalTests}`);
  console.log(`Passed: ${totalPassed}`);
  console.log(`Failed: ${totalFailed}`);
  console.log(`Success Rate: ${((totalPassed / totalTests) * 100).toFixed(1)}%`);
  console.log('');

  for (const suite of allResults) {
    console.log(`${suite.suite}: ${suite.passed}/${suite.total}`);
    if (suite.failed > 0) {
      const failedTests = suite.tests.filter(test => !test.success);
      for (const test of failedTests) {
        console.log(`  ✗ ${test.name}: ${test.error}`);
      }
    }
  }

  return {
    total: totalTests,
    passed: totalPassed,
    failed: totalFailed,
    successRate: (totalPassed / totalTests) * 100,
    suites: allResults
  };
}

async function main() {
  const options = parseArgs();
  
  if (options.help) {
    showUsage();
    return;
  }

  log('MOBIUS Smoke Test Suite Starting');
  log(`Mode: ${options.quick ? 'Quick' : 'Full'}`);
  console.log('');

  try {
    const testSuites = [
      () => testNodejsEnvironment(),
      () => testSystemDependencies(),
      () => testProjectStructure(),
      () => testPackageDependencies(),
      () => testVideoProcessingCapabilities(options.quick),
      () => testGoldenTestInfrastructure(options.quick)
    ];

    const results = [];
    for (const testSuite of testSuites) {
      results.push(testSuite());
    }

    const report = generateReport(results);

    if (report.failed === 0) {
      log('✓ All smoke tests passed!');
      process.exit(0);
    } else {
      log(`✗ ${report.failed} smoke tests failed`);
      process.exit(1);
    }
  } catch (error) {
    log(`Smoke tests failed with unexpected error: ${error.message}`, 'error');
    console.error(error.stack);
    process.exit(1);
  }
}

if (require.main === module) {
  main();
}