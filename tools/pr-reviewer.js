#!/usr/bin/env node

/**
 * Focused PR Reviewer Pass
 * Delivers prioritized issues list with exact file/line references
 * Usage: node tools/pr-reviewer.js [--json]
 */

const fs = require('fs');
const path = require('path');

class FocusedPRReviewer {
  constructor() {
    this.blockers = [];
    this.quickFixes = [];
    this.suggestions = [];
  }

  analyze() {
    console.log('🔍 Starting focused PR review pass...');
    
    // Check critical code quality issues
    this.checkCodeQuality();
    
    // Check CI/CD configuration
    this.checkCIConfiguration();
    
    // Check dependencies for security/deprecation issues
    this.checkDependencies();
    
    // Generate categorized results
    return this.generateReport();
  }

  checkCodeQuality() {
    // Check for console.log usage in production code
    this.scanDirectory('src', ['.js', '.ts'], (file, content, lineNum, line) => {
      if (line.includes('console.log') && !file.includes('test')) {
        this.quickFixes.push({
          severity: 'quick-fix',
          message: 'Remove console.log from production code',
          file: file.replace(process.cwd() + '/', ''),
          line: lineNum,
          category: 'code-quality'
        });
      }
      
      // Check for empty catch blocks (blocker)
      if (line.trim() === 'catch (e) {}' || line.includes('catch') && line.includes('{}')) {
        this.blockers.push({
          severity: 'blocker',
          message: 'Empty catch block - proper error handling required',
          file: file.replace(process.cwd() + '/', ''),
          line: lineNum,
          category: 'error-handling'
        });
      }
      
      // Check for TODO/FIXME comments
      if (line.includes('TODO') || line.includes('FIXME')) {
        this.suggestions.push({
          severity: 'suggestion',
          message: `Unresolved TODO/FIXME: ${line.trim()}`,
          file: file.replace(process.cwd() + '/', ''),
          line: lineNum,
          category: 'technical-debt'
        });
      }
    });
  }

  checkCIConfiguration() {
    const workflowsDir = path.join(process.cwd(), '.github/workflows');
    
    if (!fs.existsSync(workflowsDir)) {
      this.suggestions.push({
        severity: 'suggestion',
        message: 'No GitHub Actions workflows found',
        file: '.github/workflows/',
        category: 'ci-cd'
      });
      return;
    }

    const workflows = fs.readdirSync(workflowsDir)
      .filter(f => f.endsWith('.yml') || f.endsWith('.yaml'));

    workflows.forEach(workflow => {
      const workflowPath = path.join(workflowsDir, workflow);
      const content = fs.readFileSync(workflowPath, 'utf8');
      
      // Check for missing timeout configuration
      if (content.includes('run:') && !content.includes('timeout-minutes:')) {
        this.quickFixes.push({
          severity: 'quick-fix',
          message: 'Add timeout-minutes to prevent hanging jobs',
          file: `.github/workflows/${workflow}`,
          category: 'ci-optimization'
        });
      }
      
      // Check for missing npm caching
      if (content.includes('setup-node@') && !content.includes('cache:')) {
        this.quickFixes.push({
          severity: 'quick-fix',
          message: 'Enable npm caching in setup-node for faster builds',
          file: `.github/workflows/${workflow}`,
          line: this.findLineInContent(content, 'setup-node@'),
          category: 'ci-optimization'
        });
      }
    });
  }

  checkDependencies() {
    const packagePath = path.join(process.cwd(), 'package.json');
    
    if (!fs.existsSync(packagePath)) {
      this.blockers.push({
        severity: 'blocker',
        message: 'Missing package.json file',
        file: 'package.json',
        category: 'project-structure'
      });
      return;
    }

    try {
      const pkg = JSON.parse(fs.readFileSync(packagePath, 'utf8'));
      const allDeps = { ...pkg.dependencies, ...pkg.devDependencies };
      
      // Check for known deprecated packages
      const deprecated = ['inflight', 'glob@7'];
      Object.entries(allDeps).forEach(([dep, version]) => {
        if (deprecated.some(d => d.startsWith(dep.split('@')[0]))) {
          this.quickFixes.push({
            severity: 'quick-fix',
            message: `Deprecated dependency: ${dep}@${version}`,
            file: 'package.json',
            category: 'dependencies'
          });
        }
      });
      
    } catch (error) {
      this.blockers.push({
        severity: 'blocker',
        message: `Invalid package.json: ${error.message}`,
        file: 'package.json',
        category: 'project-structure'
      });
    }
  }

  scanDirectory(dir, extensions, callback) {
    const fullDir = path.join(process.cwd(), dir);
    if (!fs.existsSync(fullDir)) return;

    const scanFile = (filePath) => {
      if (!extensions.some(ext => filePath.endsWith(ext))) return;
      
      const content = fs.readFileSync(filePath, 'utf8');
      const lines = content.split('\n');
      
      lines.forEach((line, index) => {
        callback(filePath, content, index + 1, line);
      });
    };

    const walkDir = (currentDir) => {
      const items = fs.readdirSync(currentDir);
      items.forEach(item => {
        const fullPath = path.join(currentDir, item);
        const stat = fs.statSync(fullPath);
        
        if (stat.isDirectory() && !item.startsWith('.') && item !== 'node_modules') {
          walkDir(fullPath);
        } else if (stat.isFile()) {
          scanFile(fullPath);
        }
      });
    };

    walkDir(fullDir);
  }

  findLineInContent(content, pattern) {
    const lines = content.split('\n');
    for (let i = 0; i < lines.length; i++) {
      if (lines[i].includes(pattern)) {
        return i + 1;
      }
    }
    return null;
  }

  generateReport() {
    const total = this.blockers.length + this.quickFixes.length + this.suggestions.length;
    
    return {
      summary: {
        total,
        blockers: this.blockers.length,
        quickFixes: this.quickFixes.length,
        suggestions: this.suggestions.length,
        timestamp: new Date().toISOString()
      },
      issues: {
        blockers: this.blockers,
        quickFixes: this.quickFixes,
        suggestions: this.suggestions
      },
      recommendation: this.getRecommendation()
    };
  }

  getRecommendation() {
    if (this.blockers.length > 0) {
      return {
        action: 'BLOCK_MERGE',
        message: 'Critical issues must be resolved before merging',
        confidence: 'high'
      };
    } else if (this.quickFixes.length > 10) {
      return {
        action: 'FIX_BEFORE_MERGE',
        message: 'Address quick fixes before merge for better quality',
        confidence: 'medium'
      };
    } else {
      return {
        action: 'PROCEED_WITH_REVIEW',
        message: 'No blockers found, proceed with standard review process',
        confidence: 'high'
      };
    }
  }

  formatReport(report, format = 'text') {
    if (format === 'json') {
      return JSON.stringify(report, null, 2);
    }

    let output = '\n🔍 FOCUSED PR REVIEWER PASS\n';
    output += '================================\n\n';
    
    output += `📊 SUMMARY:\n`;
    output += `  Total Issues: ${report.summary.total}\n`;
    output += `  🚫 Blockers: ${report.summary.blockers}\n`;
    output += `  ⚡ Quick Fixes: ${report.summary.quickFixes}\n`;
    output += `  💡 Suggestions: ${report.summary.suggestions}\n\n`;
    
    output += `🎯 RECOMMENDATION: ${report.recommendation.action}\n`;
    output += `   ${report.recommendation.message}\n\n`;

    // Show blockers first
    if (report.issues.blockers.length > 0) {
      output += '🚫 BLOCKERS (Must Fix Before Merge):\n';
      output += '====================================\n';
      report.issues.blockers.forEach((issue, i) => {
        output += `${i + 1}. ${issue.message}\n`;
        output += `   📁 ${issue.file}${issue.line ? `:${issue.line}` : ''}\n\n`;
      });
    }

    // Show top quick fixes
    if (report.issues.quickFixes.length > 0) {
      output += '⚡ QUICK FIXES (Easy Wins):\n';
      output += '==========================\n';
      report.issues.quickFixes.slice(0, 10).forEach((issue, i) => {
        output += `${i + 1}. ${issue.message}\n`;
        output += `   📁 ${issue.file}${issue.line ? `:${issue.line}` : ''}\n\n`;
      });
      
      if (report.issues.quickFixes.length > 10) {
        output += `... and ${report.issues.quickFixes.length - 10} more quick fixes\n\n`;
      }
    }

    return output;
  }
}

// CLI Interface
async function main() {
  const args = process.argv.slice(2);
  const format = args.includes('--json') ? 'json' : 'text';
  
  const reviewer = new FocusedPRReviewer();
  const report = reviewer.analyze();
  
  console.log(reviewer.formatReport(report, format));
  
  // Exit with error code if blockers found
  process.exit(report.issues.blockers.length > 0 ? 1 : 0);
}

if (require.main === module) {
  main();
}

module.exports = FocusedPRReviewer;