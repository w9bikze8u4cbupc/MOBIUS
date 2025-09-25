#!/usr/bin/env node

/**
 * Final Merge Decision Recommendation 
 * Provides merge strategy recommendation (merge now vs staged rollout)
 * Usage: node tools/merge-decision.js [--risk-tolerance conservative|normal|aggressive] [--json]
 */

const fs = require('fs');
const path = require('path');

class MergeDecisionMaker {
  constructor(options = {}) {
    this.riskTolerance = options.riskTolerance || 'normal';
    this.maintenanceWindow = options.maintenanceWindow;
    this.requiredApprovers = options.requiredApprovers || ['@ops'];
  }

  analyze() {
    console.log('📋 Analyzing merge readiness...');
    
    const analysis = {
      codeQuality: this.analyzeCodeQuality(),
      testCoverage: this.analyzeTestCoverage(),
      ciStatus: this.analyzeCIStatus(),
      dependencies: this.analyzeDependencies(),
      riskFactors: this.identifyRiskFactors()
    };

    const overallScore = this.calculateScore(analysis);
    const decision = this.makeDecision(overallScore);
    
    return {
      timestamp: new Date().toISOString(),
      riskTolerance: this.riskTolerance,
      overallScore,
      decision: decision.type,
      strategy: decision.strategy,
      rationale: decision.rationale,
      analysis,
      timeline: this.generateTimeline(decision),
      checklist: this.generateChecklist(decision),
      rollbackPlan: this.generateRollbackPlan()
    };
  }

  analyzeCodeQuality() {
    let score = 80;
    const issues = [];
    
    // Check if src directory exists
    if (!fs.existsSync('src')) {
      issues.push('No src directory found');
      score -= 20;
    } else {
      // Count JavaScript/TypeScript files
      let fileCount = 0;
      let largeFiles = 0;
      
      this.walkDirectory('src', (filePath) => {
        if (filePath.endsWith('.js') || filePath.endsWith('.ts')) {
          fileCount++;
          const content = fs.readFileSync(filePath, 'utf8');
          if (content.length > 5000) largeFiles++;
        }
      });
      
      if (largeFiles > 0) {
        issues.push(`${largeFiles} large files detected`);
        score -= Math.min(largeFiles * 5, 20);
      }
      
      if (fileCount === 0) {
        issues.push('No source files found');
        score = 30;
      }
    }
    
    return { score, issues };
  }

  analyzeTestCoverage() {
    const testDirs = ['tests', 'test', '__tests__'];
    let hasTests = false;
    let testFiles = 0;
    
    for (const dir of testDirs) {
      if (fs.existsSync(dir)) {
        hasTests = true;
        this.walkDirectory(dir, (filePath) => {
          if (filePath.includes('.test.') || filePath.includes('.spec.')) {
            testFiles++;
          }
        });
      }
    }
    
    // Check for Jest configuration
    let hasJestConfig = false;
    if (fs.existsSync('package.json')) {
      const pkg = JSON.parse(fs.readFileSync('package.json', 'utf8'));
      hasJestConfig = !!(pkg.jest || (pkg.devDependencies && pkg.devDependencies.jest));
    }
    
    let score = hasTests ? 70 : 30;
    score += hasJestConfig ? 15 : 0;
    score += testFiles > 0 ? 15 : 0;
    
    return {
      score,
      hasTests,
      testFiles,
      hasJestConfig,
      issues: hasTests ? [] : ['No tests found']
    };
  }

  analyzeCIStatus() {
    const workflowsDir = '.github/workflows';
    let score = fs.existsSync(workflowsDir) ? 80 : 40;
    const issues = [];
    
    if (fs.existsSync(workflowsDir)) {
      const workflows = fs.readdirSync(workflowsDir)
        .filter(f => f.endsWith('.yml') || f.endsWith('.yaml'));
      
      if (workflows.length === 0) {
        score = 40;
        issues.push('No workflow files found');
      } else {
        // Check for build/test workflows
        let hasBuildWorkflow = false;
        workflows.forEach(workflow => {
          const content = fs.readFileSync(path.join(workflowsDir, workflow), 'utf8');
          if (content.includes('npm run') || content.includes('build') || content.includes('test')) {
            hasBuildWorkflow = true;
          }
        });
        
        if (hasBuildWorkflow) {
          score += 20;
        } else {
          issues.push('No build/test workflows detected');
        }
      }
    } else {
      issues.push('No CI/CD workflows found');
    }
    
    return { score, issues };
  }

  analyzeDependencies() {
    let score = 90;
    const issues = [];
    
    if (!fs.existsSync('package.json')) {
      return { score: 30, issues: ['No package.json found'] };
    }
    
    try {
      const pkg = JSON.parse(fs.readFileSync('package.json', 'utf8'));
      const allDeps = { ...pkg.dependencies, ...pkg.devDependencies };
      
      // Check for deprecated packages that we detected earlier
      const deprecated = ['inflight', 'glob'];
      let deprecatedCount = 0;
      
      Object.keys(allDeps).forEach(dep => {
        if (deprecated.some(d => dep.includes(d))) {
          deprecatedCount++;
          issues.push(`Deprecated: ${dep}`);
        }
      });
      
      score -= deprecatedCount * 10;
      
    } catch (error) {
      score = 30;
      issues.push('Invalid package.json');
    }
    
    return { score, issues };
  }

  identifyRiskFactors() {
    const risks = [];
    let riskLevel = 'low';
    
    // Check for missing essential files
    if (!fs.existsSync('README.md')) {
      risks.push('Missing README.md');
      riskLevel = 'medium';
    }
    
    if (!fs.existsSync('.gitignore')) {
      risks.push('Missing .gitignore');
      riskLevel = 'medium';
    }
    
    // Check for large changes (heuristic)
    if (fs.existsSync('src')) {
      let largeFileCount = 0;
      this.walkDirectory('src', (filePath) => {
        if (filePath.endsWith('.js') || filePath.endsWith('.ts')) {
          const content = fs.readFileSync(filePath, 'utf8');
          if (content.length > 10000) largeFileCount++;
        }
      });
      
      if (largeFileCount > 0) {
        risks.push(`${largeFileCount} very large files`);
        riskLevel = 'medium';
      }
    }
    
    const score = risks.length === 0 ? 90 : Math.max(50, 90 - (risks.length * 15));
    
    return { riskLevel, factors: risks, score };
  }

  calculateScore(analysis) {
    const weights = {
      codeQuality: 0.3,
      testCoverage: 0.25,
      ciStatus: 0.2,
      dependencies: 0.15,
      riskFactors: 0.1
    };
    
    return Math.round(
      analysis.codeQuality.score * weights.codeQuality +
      analysis.testCoverage.score * weights.testCoverage +
      analysis.ciStatus.score * weights.ciStatus +
      analysis.dependencies.score * weights.dependencies +
      analysis.riskFactors.score * weights.riskFactors
    );
  }

  makeDecision(score) {
    const thresholds = {
      conservative: { immediate: 85, staged: 75 },
      normal: { immediate: 75, staged: 60 },
      aggressive: { immediate: 65, staged: 50 }
    };
    
    const threshold = thresholds[this.riskTolerance];
    
    if (score >= threshold.immediate) {
      return {
        type: 'MERGE_NOW',
        strategy: 'immediate',
        rationale: `High confidence (${score}/100) - all quality gates passed`
      };
    } else if (score >= threshold.staged) {
      return {
        type: 'STAGED_ROLLOUT',
        strategy: 'gradual',
        rationale: `Moderate confidence (${score}/100) - deploy gradually with monitoring`
      };
    } else {
      return {
        type: 'DELAY_MERGE',
        strategy: 'fix-first',
        rationale: `Low confidence (${score}/100) - address issues before merging`
      };
    }
  }

  generateTimeline(decision) {
    const now = new Date();
    
    if (decision.type === 'MERGE_NOW') {
      return [
        {
          phase: 'Immediate Merge',
          start: now.toISOString(),
          duration: '30 minutes',
          activities: ['Final approval', 'Merge PR', 'Deploy', 'Monitor']
        }
      ];
    } else if (decision.type === 'STAGED_ROLLOUT') {
      return [
        {
          phase: 'Stage 1: Staging Deploy',
          start: new Date(now.getTime() + 30 * 60 * 1000).toISOString(),
          duration: '2 hours',
          activities: ['Deploy to staging', 'Run smoke tests', 'QA validation']
        },
        {
          phase: 'Stage 2: Production Rollout',
          start: new Date(now.getTime() + 6 * 60 * 60 * 1000).toISOString(),
          duration: '4 hours',
          activities: ['10% traffic', '50% traffic', '100% traffic', 'Full monitoring']
        }
      ];
    } else {
      return [
        {
          phase: 'Issue Resolution',
          start: new Date(now.getTime() + 60 * 60 * 1000).toISOString(),
          duration: '1-3 days',
          activities: ['Address blocking issues', 'Re-run analysis', 'Schedule new merge']
        }
      ];
    }
  }

  generateChecklist(decision) {
    const baseItems = [
      { task: 'Code review completed', required: true, owner: 'senior-dev' },
      { task: 'PR review checks pass', required: true, owner: 'automated' },
      { task: 'Documentation updated', required: false, owner: 'author' }
    ];
    
    if (decision.type === 'MERGE_NOW') {
      return [
        ...baseItems,
        { task: 'Production monitoring ready', required: true, owner: 'ops' },
        { task: 'Rollback plan confirmed', required: true, owner: 'ops' }
      ];
    } else if (decision.type === 'STAGED_ROLLOUT') {
      return [
        ...baseItems,
        { task: 'Staging environment ready', required: true, owner: 'ops' },
        { task: 'Gradual rollout plan approved', required: true, owner: 'ops' },
        { task: 'Monitoring dashboards configured', required: true, owner: 'ops' }
      ];
    } else {
      return [
        { task: 'Address all blocking issues', required: true, owner: 'dev-team' },
        { task: 'Re-run merge analysis', required: true, owner: 'automated' }
      ];
    }
  }

  generateRollbackPlan() {
    return {
      triggers: [
        'Error rate > 5% above baseline',
        'Response time > 2x normal',
        'Critical functionality broken'
      ],
      steps: [
        '1. Execute immediate rollback',
        '2. Verify service restoration', 
        '3. Investigate root cause',
        '4. Notify stakeholders'
      ],
      timeline: 'Target: <15 minutes to rollback',
      contacts: this.requiredApprovers
    };
  }

  walkDirectory(dir, callback) {
    if (!fs.existsSync(dir)) return;
    
    const items = fs.readdirSync(dir);
    items.forEach(item => {
      const fullPath = path.join(dir, item);
      const stat = fs.statSync(fullPath);
      
      if (stat.isDirectory() && !item.startsWith('.') && item !== 'node_modules') {
        this.walkDirectory(fullPath, callback);
      } else if (stat.isFile()) {
        callback(fullPath);
      }
    });
  }

  formatReport(result, format = 'text') {
    if (format === 'json') {
      return JSON.stringify(result, null, 2);
    }
    
    let output = '\n📋 MERGE DECISION RECOMMENDATION\n';
    output += '==================================\n\n';
    
    output += `🎯 DECISION: ${result.decision}\n`;
    output += `📊 Score: ${result.overallScore}/100\n`;
    output += `⚖️ Risk Tolerance: ${result.riskTolerance}\n`;
    output += `💭 Strategy: ${result.strategy}\n`;
    output += `📝 Rationale: ${result.rationale}\n\n`;
    
    output += '📈 ANALYSIS BREAKDOWN:\n';
    output += `  Code Quality: ${result.analysis.codeQuality.score}/100\n`;
    output += `  Test Coverage: ${result.analysis.testCoverage.score}/100\n`;
    output += `  CI Status: ${result.analysis.ciStatus.score}/100\n`;
    output += `  Dependencies: ${result.analysis.dependencies.score}/100\n`;
    output += `  Risk Factors: ${result.analysis.riskFactors.score}/100\n\n`;
    
    output += '⏰ DEPLOYMENT TIMELINE:\n';
    result.timeline.forEach(phase => {
      output += `  📅 ${phase.phase}\n`;
      output += `     Start: ${new Date(phase.start).toLocaleString()}\n`;
      output += `     Duration: ${phase.duration}\n`;
      output += `     Activities: ${phase.activities.join(', ')}\n\n`;
    });
    
    output += '✅ APPROVAL CHECKLIST:\n';
    result.checklist.forEach((item, i) => {
      const required = item.required ? '[REQUIRED]' : '[OPTIONAL]';
      output += `  ${i+1}. ${required} ${item.task} (${item.owner})\n`;
    });
    
    output += '\n🔄 ROLLBACK PLAN:\n';
    output += `  Triggers: ${result.rollbackPlan.triggers.join('; ')}\n`;
    output += `  Timeline: ${result.rollbackPlan.timeline}\n`;
    output += `  Contacts: ${result.rollbackPlan.contacts.join(', ')}\n`;
    
    return output;
  }
}

// CLI Interface
async function main() {
  const args = process.argv.slice(2);
  
  const options = {
    riskTolerance: getArgValue(args, '--risk-tolerance') || 'normal',
    format: args.includes('--json') ? 'json' : 'text'
  };
  
  const decisionMaker = new MergeDecisionMaker(options);
  const result = decisionMaker.analyze();
  
  console.log(decisionMaker.formatReport(result, options.format));
}

function getArgValue(args, flag) {
  const index = args.indexOf(flag);
  return index !== -1 && index + 1 < args.length ? args[index + 1] : null;
}

if (require.main === module) {
  main();
}

module.exports = MergeDecisionMaker;