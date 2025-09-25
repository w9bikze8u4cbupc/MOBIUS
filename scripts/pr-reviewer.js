#!/usr/bin/env node

/**
 * Focused PR Reviewer Pass
 * Generates a prioritized issues list with exact file/line references
 * 
 * Usage: node scripts/pr-reviewer.js [--diff-file <path>] [--pr-link <url>] [--format <text|json>]
 */

const fs = require('fs');
const path = require('path');

class PRReviewer {
  constructor() {
    this.issues = {
      blockers: [],
      quickFixes: [],
      suggestions: []
    };
  }

  /**
   * Analyze repository files for common issues
   */
  async analyzeRepository() {
    console.log('🔍 Starting focused PR review...');
    
    // Check package.json dependencies and scripts
    this.checkPackageJson();
    
    // Check GitHub Actions workflows
    this.checkGitHubWorkflows();
    
    // Check for test coverage and quality
    this.checkTestStructure();
    
    // Check JavaScript/TypeScript code quality
    await this.checkCodeQuality();
    
    // Check for security issues
    this.checkSecurity();
    
    console.log('✅ PR review analysis complete');
    return this.generateReport();
  }

  /**
   * Check package.json for potential issues
   */
  checkPackageJson() {
    const packagePath = path.join(process.cwd(), 'package.json');
    if (!fs.existsSync(packagePath)) {
      this.addIssue('blockers', 'Missing package.json file', packagePath);
      return;
    }

    try {
      const pkg = JSON.parse(fs.readFileSync(packagePath, 'utf8'));
      
      // Check for deprecated dependencies
      const deprecatedPackages = ['inflight', 'glob'];
      if (pkg.dependencies || pkg.devDependencies) {
        const allDeps = { ...pkg.dependencies, ...pkg.devDependencies };
        for (const [dep, version] of Object.entries(allDeps)) {
          if (deprecatedPackages.includes(dep)) {
            this.addIssue('quickFixes', `Deprecated dependency: ${dep}@${version}`, packagePath);
          }
        }
      }

      // Check scripts for potential improvements
      if (pkg.scripts) {
        if (!pkg.scripts.lint) {
          this.addIssue('suggestions', 'Consider adding a lint script for code quality', packagePath, 'scripts');
        }
        if (!pkg.scripts.build && !pkg.scripts['build:prod']) {
          this.addIssue('suggestions', 'Consider adding a build script', packagePath, 'scripts');
        }
      }

    } catch (error) {
      this.addIssue('blockers', `Invalid JSON in package.json: ${error.message}`, packagePath);
    }
  }

  /**
   * Check GitHub Actions workflows
   */
  checkGitHubWorkflows() {
    const workflowsDir = path.join(process.cwd(), '.github/workflows');
    if (!fs.existsSync(workflowsDir)) {
      this.addIssue('suggestions', 'No GitHub Actions workflows found', workflowsDir);
      return;
    }

    const workflows = fs.readdirSync(workflowsDir).filter(f => f.endsWith('.yml') || f.endsWith('.yaml'));
    
    for (const workflow of workflows) {
      const workflowPath = path.join(workflowsDir, workflow);
      const content = fs.readFileSync(workflowPath, 'utf8');
      
      // Check for hardcoded Node version without matrix
      const nodeVersionMatch = content.match(/node-version:\s*['"]?(\d+)['"]?/);
      if (nodeVersionMatch && !content.includes('matrix:')) {
        this.addIssue('suggestions', 
          `Hardcoded Node.js version ${nodeVersionMatch[1]} - consider using matrix strategy`, 
          workflowPath, 
          this.findLineNumber(content, nodeVersionMatch[0])
        );
      }

      // Check for missing timeout in jobs
      if (content.includes('run:') && !content.includes('timeout-minutes:')) {
        this.addIssue('suggestions', 
          'Consider adding timeout-minutes to prevent hanging jobs', 
          workflowPath
        );
      }

      // Check for setup-node caching
      if (content.includes('setup-node@') && !content.includes('cache:')) {
        this.addIssue('quickFixes', 
          'Enable npm caching in setup-node action for faster builds', 
          workflowPath,
          this.findLineNumber(content, 'setup-node@')
        );
      }
    }
  }

  /**
   * Check test structure and coverage
   */
  checkTestStructure() {
    const testDirs = ['tests', 'test', '__tests__', 'src/__tests__'];
    let hasTests = false;

    for (const testDir of testDirs) {
      if (fs.existsSync(path.join(process.cwd(), testDir))) {
        hasTests = true;
        break;
      }
    }

    if (!hasTests) {
      this.addIssue('suggestions', 'No test directory found - consider adding tests', process.cwd());
    }

    // Check Jest configuration
    const packagePath = path.join(process.cwd(), 'package.json');
    if (fs.existsSync(packagePath)) {
      const pkg = JSON.parse(fs.readFileSync(packagePath, 'utf8'));
      if (pkg.jest && !pkg.jest.collectCoverageFrom) {
        this.addIssue('suggestions', 'Configure Jest coverage collection for better test insights', packagePath, 'jest');
      }
    }
  }

  /**
   * Check JavaScript/TypeScript code quality
   */
  async checkCodeQuality() {
    const srcDir = path.join(process.cwd(), 'src');
    if (!fs.existsSync(srcDir)) return;

    this.walkDirectory(srcDir, (filePath) => {
      if (filePath.endsWith('.js') || filePath.endsWith('.ts')) {
        this.analyzeJSFile(filePath);
      }
    });
  }

  /**
   * Analyze individual JavaScript/TypeScript files
   */
  analyzeJSFile(filePath) {
    const content = fs.readFileSync(filePath, 'utf8');
    const lines = content.split('\n');

    lines.forEach((line, index) => {
      const lineNum = index + 1;
      
      // Check for console.log in production code
      if (line.includes('console.log') && !filePath.includes('test')) {
        this.addIssue('quickFixes', 
          'Remove or replace console.log with proper logging', 
          filePath, 
          lineNum
        );
      }

      // Check for TODO/FIXME comments
      if (line.includes('TODO') || line.includes('FIXME')) {
        this.addIssue('suggestions', 
          `Unresolved TODO/FIXME: ${line.trim()}`, 
          filePath, 
          lineNum
        );
      }

      // Check for try-catch without proper error handling
      if (line.includes('catch') && line.includes('{}')) {
        this.addIssue('blockers', 
          'Empty catch block - proper error handling needed', 
          filePath, 
          lineNum
        );
      }
    });
  }

  /**
   * Check for security issues
   */
  checkSecurity() {
    const packagePath = path.join(process.cwd(), 'package.json');
    if (fs.existsSync(packagePath)) {
      const pkg = JSON.parse(fs.readFileSync(packagePath, 'utf8'));
      
      // Check for security-sensitive packages
      const securityPackages = ['eval', 'vm2'];
      const allDeps = { ...pkg.dependencies, ...pkg.devDependencies };
      
      for (const dep of Object.keys(allDeps)) {
        if (securityPackages.includes(dep)) {
          this.addIssue('blockers', 
            `Security risk: ${dep} package should be reviewed carefully`, 
            packagePath
          );
        }
      }
    }

    // Check for .env files in git
    const gitignorePath = path.join(process.cwd(), '.gitignore');
    if (fs.existsSync(gitignorePath)) {
      const gitignore = fs.readFileSync(gitignorePath, 'utf8');
      if (!gitignore.includes('.env')) {
        this.addIssue('blockers', 
          'Add .env files to .gitignore to prevent secrets leakage', 
          gitignorePath
        );
      }
    }
  }

  /**
   * Add an issue to the appropriate category
   */
  addIssue(category, message, file, line = null) {
    const issue = {
      message,
      file: path.relative(process.cwd(), file),
      line,
      timestamp: new Date().toISOString()
    };
    
    this.issues[category].push(issue);
  }

  /**
   * Find line number of a pattern in content
   */
  findLineNumber(content, pattern) {
    const lines = content.split('\n');
    for (let i = 0; i < lines.length; i++) {
      if (lines[i].includes(pattern)) {
        return i + 1;
      }
    }
    return null;
  }

  /**
   * Walk directory recursively
   */
  walkDirectory(dir, callback) {
    const files = fs.readdirSync(dir);
    
    for (const file of files) {
      const fullPath = path.join(dir, file);
      const stat = fs.statSync(fullPath);
      
      if (stat.isDirectory() && !file.startsWith('.') && file !== 'node_modules') {
        this.walkDirectory(fullPath, callback);
      } else if (stat.isFile()) {
        callback(fullPath);
      }
    }
  }

  /**
   * Generate prioritized report
   */
  generateReport() {
    const totalIssues = this.issues.blockers.length + this.issues.quickFixes.length + this.issues.suggestions.length;
    
    return {
      summary: {
        total: totalIssues,
        blockers: this.issues.blockers.length,
        quickFixes: this.issues.quickFixes.length,
        suggestions: this.issues.suggestions.length,
        timestamp: new Date().toISOString()
      },
      issues: this.issues,
      priority: this.getPriorityRecommendation()
    };
  }

  /**
   * Get priority recommendation
   */
  getPriorityRecommendation() {
    if (this.issues.blockers.length > 0) {
      return 'BLOCK_MERGE - Critical issues must be resolved before merging';
    } else if (this.issues.quickFixes.length > 5) {
      return 'QUICK_FIXES_RECOMMENDED - Address quick fixes before merge';
    } else {
      return 'PROCEED_WITH_CAUTION - Review suggestions, merge decision pending';
    }
  }

  /**
   * Format report as text
   */
  formatTextReport(report) {
    let output = `\n🔍 FOCUSED PR REVIEW REPORT\n`;
    output += `==========================================\n\n`;
    
    output += `📊 SUMMARY:\n`;
    output += `  Total Issues: ${report.summary.total}\n`;
    output += `  🚫 Blockers: ${report.summary.blockers}\n`;
    output += `  ⚡ Quick Fixes: ${report.summary.quickFixes}\n`;
    output += `  💡 Suggestions: ${report.summary.suggestions}\n\n`;
    
    output += `🎯 PRIORITY: ${report.priority}\n\n`;

    // Blockers
    if (report.issues.blockers.length > 0) {
      output += `🚫 BLOCKERS (Must Fix Before Merge):\n`;
      output += `=====================================\n`;
      report.issues.blockers.forEach((issue, i) => {
        output += `${i + 1}. ${issue.message}\n`;
        output += `   📁 ${issue.file}${issue.line ? `:${issue.line}` : ''}\n\n`;
      });
    }

    // Quick Fixes
    if (report.issues.quickFixes.length > 0) {
      output += `⚡ QUICK FIXES (Easy Wins):\n`;
      output += `===========================\n`;
      report.issues.quickFixes.forEach((issue, i) => {
        output += `${i + 1}. ${issue.message}\n`;
        output += `   📁 ${issue.file}${issue.line ? `:${issue.line}` : ''}\n\n`;
      });
    }

    // Suggestions
    if (report.issues.suggestions.length > 0) {
      output += `💡 SUGGESTIONS (Nice to Have):\n`;
      output += `===============================\n`;
      report.issues.suggestions.forEach((issue, i) => {
        output += `${i + 1}. ${issue.message}\n`;
        output += `   📁 ${issue.file}${issue.line ? `:${issue.line}` : ''}\n\n`;
      });
    }

    return output;
  }
}

// CLI interface
async function main() {
  const args = process.argv.slice(2);
  const format = args.includes('--json') ? 'json' : 'text';
  
  const reviewer = new PRReviewer();
  const report = await reviewer.analyzeRepository();
  
  if (format === 'json') {
    console.log(JSON.stringify(report, null, 2));
  } else {
    console.log(reviewer.formatTextReport(report));
  }

  // Exit with non-zero code if blockers found
  process.exit(report.issues.blockers.length > 0 ? 1 : 0);
}

if (require.main === module) {
  main().catch(console.error);
}

module.exports = PRReviewer;