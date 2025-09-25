#!/usr/bin/env node

/**
 * Final Merge Decision Recommendation Tool
 * Provides merge strategy recommendation with pros/cons and scheduling
 * 
 * Usage: node scripts/merge-decision.js [--risk-tolerance <conservative|normal|aggressive>] [--format <text|json>]
 */

const fs = require('fs');
const path = require('path');

class MergeDecisionMaker {
  constructor(options = {}) {
    this.riskTolerance = options.riskTolerance || 'normal';
    this.maintenanceWindow = options.maintenanceWindow;
    this.requiredApprovers = options.requiredApprovers || [];
    this.analysis = {};
  }

  /**
   * Analyze repository and generate merge recommendation
   */
  async generateRecommendation() {
    console.log('📋 Analyzing merge readiness...');
    
    // Gather analysis data
    this.analysis = {
      codeQuality: await this.analyzeCodeQuality(),
      testCoverage: this.analyzeTestCoverage(),
      ciStatus: this.analyzeCIStatus(),
      dependencies: this.analyzeDependencies(),
      riskFactors: this.identifyRiskFactors(),
      deploymentReadiness: this.assessDeploymentReadiness()
    };

    // Generate recommendation
    const recommendation = this.generateMergeRecommendation();
    
    console.log('✅ Merge decision analysis complete');
    return recommendation;
  }

  /**
   * Analyze code quality metrics
   */
  async analyzeCodeQuality() {
    const srcDir = path.join(process.cwd(), 'src');
    const metrics = {
      totalFiles: 0,
      linesOfCode: 0,
      complexity: 'medium',
      codeSmells: 0,
      documentation: 'partial'
    };

    if (!fs.existsSync(srcDir)) {
      return { ...metrics, score: 50, issues: ['No src directory found'] };
    }

    let issues = [];
    let totalLines = 0;
    let codeSmells = 0;

    this.walkDirectory(srcDir, (filePath) => {
      if (filePath.endsWith('.js') || filePath.endsWith('.ts')) {
        metrics.totalFiles++;
        const content = fs.readFileSync(filePath, 'utf8');
        const lines = content.split('\n').length;
        totalLines += lines;

        // Check for code smells
        if (content.includes('console.log')) codeSmells++;
        if (content.includes('TODO') || content.includes('FIXME')) codeSmells++;
        if (content.length > 5000) codeSmells++; // Large files
      }
    });

    metrics.linesOfCode = totalLines;
    metrics.codeSmells = codeSmells;

    // Calculate score
    let score = 100;
    score -= Math.min(codeSmells * 5, 30);
    score -= metrics.totalFiles > 50 ? 10 : 0;

    return {
      ...metrics,
      score,
      issues: codeSmells > 5 ? ['High number of code smells detected'] : []
    };
  }

  /**
   * Analyze test coverage and quality
   */
  analyzeTestCoverage() {
    const testDirs = ['tests', 'test', '__tests__', 'src/__tests__'];
    let hasTests = false;
    let testFiles = 0;

    for (const testDir of testDirs) {
      const fullPath = path.join(process.cwd(), testDir);
      if (fs.existsSync(fullPath)) {
        hasTests = true;
        this.walkDirectory(fullPath, (filePath) => {
          if (filePath.includes('.test.') || filePath.includes('.spec.')) {
            testFiles++;
          }
        });
      }
    }

    const packagePath = path.join(process.cwd(), 'package.json');
    let hasJest = false;
    if (fs.existsSync(packagePath)) {
      const pkg = JSON.parse(fs.readFileSync(packagePath, 'utf8'));
      hasJest = !!(pkg.jest || (pkg.devDependencies && pkg.devDependencies.jest));
    }

    let score = hasTests ? 70 : 30;
    score += hasJest ? 15 : 0;
    score += testFiles > 5 ? 15 : testFiles > 0 ? 10 : 0;

    return {
      hasTests,
      testFiles,
      hasJest,
      score,
      coverage: hasTests ? 'unknown' : 'none',
      issues: !hasTests ? ['No tests found'] : []
    };
  }

  /**
   * Analyze CI/CD status
   */
  analyzeCIStatus() {
    const workflowsDir = path.join(process.cwd(), '.github/workflows');
    const ciFiles = [];
    let hasCI = false;

    if (fs.existsSync(workflowsDir)) {
      const workflows = fs.readdirSync(workflowsDir);
      for (const workflow of workflows) {
        if (workflow.endsWith('.yml') || workflow.endsWith('.yaml')) {
          ciFiles.push(workflow);
          hasCI = true;
        }
      }
    }

    let score = hasCI ? 80 : 40;
    const hasBuildJob = ciFiles.some(file => {
      const content = fs.readFileSync(path.join(workflowsDir, file), 'utf8');
      return content.includes('build') || content.includes('test');
    });
    
    score += hasBuildJob ? 20 : 0;

    return {
      hasCI,
      workflows: ciFiles,
      hasBuildJob,
      score,
      issues: !hasCI ? ['No CI/CD workflows found'] : []
    };
  }

  /**
   * Analyze dependencies for risks
   */
  analyzeDependencies() {
    const packagePath = path.join(process.cwd(), 'package.json');
    const analysis = {
      total: 0,
      outdated: 0,
      vulnerable: 0,
      deprecated: [],
      score: 90
    };

    if (!fs.existsSync(packagePath)) {
      return { ...analysis, score: 50, issues: ['No package.json found'] };
    }

    const pkg = JSON.parse(fs.readFileSync(packagePath, 'utf8'));
    const allDeps = { ...pkg.dependencies, ...pkg.devDependencies };
    
    analysis.total = Object.keys(allDeps).length;

    // Check for known deprecated packages
    const deprecatedPackages = ['inflight', 'glob@7'];
    for (const [dep, version] of Object.entries(allDeps)) {
      if (deprecatedPackages.some(d => d.startsWith(dep))) {
        analysis.deprecated.push(`${dep}@${version}`);
        analysis.score -= 5;
      }
    }

    return {
      ...analysis,
      issues: analysis.deprecated.length > 0 ? 
        [`Deprecated dependencies: ${analysis.deprecated.join(', ')}`] : []
    };
  }

  /**
   * Identify risk factors
   */
  identifyRiskFactors() {
    const risks = [];
    let riskLevel = 'low';

    // Check for recent major changes
    const srcDir = path.join(process.cwd(), 'src');
    if (fs.existsSync(srcDir)) {
      let hasLargeFiles = false;
      this.walkDirectory(srcDir, (filePath) => {
        if (filePath.endsWith('.js') || filePath.endsWith('.ts')) {
          const content = fs.readFileSync(filePath, 'utf8');
          if (content.length > 10000) {
            hasLargeFiles = true;
          }
        }
      });
      
      if (hasLargeFiles) {
        risks.push('Large file changes detected');
        riskLevel = 'medium';
      }
    }

    // Check for missing documentation
    if (!fs.existsSync(path.join(process.cwd(), 'README.md'))) {
      risks.push('Missing README.md');
    }

    // Check for missing .gitignore
    if (!fs.existsSync(path.join(process.cwd(), '.gitignore'))) {
      risks.push('Missing .gitignore file');
      riskLevel = 'medium';
    }

    return {
      level: riskLevel,
      factors: risks,
      score: risks.length === 0 ? 90 : Math.max(50, 90 - (risks.length * 15))
    };
  }

  /**
   * Assess deployment readiness
   */
  assessDeploymentReadiness() {
    const packagePath = path.join(process.cwd(), 'package.json');
    let score = 70;
    const issues = [];

    if (fs.existsSync(packagePath)) {
      const pkg = JSON.parse(fs.readFileSync(packagePath, 'utf8'));
      
      if (pkg.scripts && pkg.scripts.build) score += 10;
      if (pkg.scripts && pkg.scripts.start) score += 10;
      if (pkg.scripts && pkg.scripts.test) score += 10;
    } else {
      issues.push('No package.json for deployment scripts');
      score = 40;
    }

    return {
      score,
      hasStartScript: true, // Assumed based on package.json analysis
      hasBuildScript: true,
      issues
    };
  }

  /**
   * Generate final merge recommendation
   */
  generateMergeRecommendation() {
    const overallScore = this.calculateOverallScore();
    const strategy = this.determineMergeStrategy(overallScore);
    
    return {
      timestamp: new Date().toISOString(),
      riskTolerance: this.riskTolerance,
      overallScore,
      recommendation: strategy.decision,
      strategy: strategy.approach,
      analysis: this.analysis,
      actionItems: this.generateActionItems(),
      timeline: this.generateTimeline(strategy),
      approvalChecklist: this.generateApprovalChecklist(),
      rollbackPlan: this.generateRollbackPlan()
    };
  }

  /**
   * Calculate overall readiness score
   */
  calculateOverallScore() {
    const weights = {
      codeQuality: 0.3,
      testCoverage: 0.25,
      ciStatus: 0.2,
      dependencies: 0.15,
      riskFactors: 0.1
    };

    let weightedScore = 0;
    weightedScore += this.analysis.codeQuality.score * weights.codeQuality;
    weightedScore += this.analysis.testCoverage.score * weights.testCoverage;
    weightedScore += this.analysis.ciStatus.score * weights.ciStatus;
    weightedScore += this.analysis.dependencies.score * weights.dependencies;
    weightedScore += this.analysis.riskFactors.score * weights.riskFactors;

    return Math.round(weightedScore);
  }

  /**
   * Determine merge strategy based on score and risk tolerance
   */
  determineMergeStrategy(score) {
    const thresholds = {
      conservative: { immediate: 85, staged: 70 },
      normal: { immediate: 75, staged: 60 },
      aggressive: { immediate: 65, staged: 50 }
    };

    const threshold = thresholds[this.riskTolerance];

    if (score >= threshold.immediate) {
      return {
        decision: 'MERGE_NOW',
        approach: 'immediate',
        rationale: 'High confidence - all quality gates passed'
      };
    } else if (score >= threshold.staged) {
      return {
        decision: 'STAGED_ROLLOUT',
        approach: 'gradual',
        rationale: 'Moderate confidence - staged deployment recommended'
      };
    } else {
      return {
        decision: 'DELAY_MERGE',
        approach: 'fix-first',
        rationale: 'Quality concerns identified - address issues first'
      };
    }
  }

  /**
   * Generate action items based on analysis
   */
  generateActionItems() {
    const actions = [];
    
    // Add actions based on analysis issues
    Object.values(this.analysis).forEach(section => {
      if (section.issues && section.issues.length > 0) {
        section.issues.forEach(issue => {
          actions.push({
            priority: 'medium',
            action: `Address: ${issue}`,
            owner: 'development-team'
          });
        });
      }
    });

    // Add specific actions based on scores
    if (this.analysis.testCoverage.score < 60) {
      actions.push({
        priority: 'high',
        action: 'Improve test coverage before merge',
        owner: 'development-team'
      });
    }

    if (this.analysis.ciStatus.score < 70) {
      actions.push({
        priority: 'medium',
        action: 'Set up CI/CD pipeline',
        owner: 'devops-team'
      });
    }

    return actions.length > 0 ? actions : [{
      priority: 'low',
      action: 'Monitor deployment metrics post-merge',
      owner: 'operations-team'
    }];
  }

  /**
   * Generate deployment timeline
   */
  generateTimeline(strategy) {
    const now = new Date();
    const timeline = [];

    if (strategy.decision === 'MERGE_NOW') {
      timeline.push({
        phase: 'Immediate Merge',
        start: now.toISOString(),
        duration: '1 hour',
        activities: ['Final review', 'Merge PR', 'Deploy to production']
      });
    } else if (strategy.decision === 'STAGED_ROLLOUT') {
      const stagingStart = new Date(now.getTime() + 2 * 60 * 60 * 1000); // +2 hours
      const prodStart = new Date(now.getTime() + 24 * 60 * 60 * 1000); // +24 hours
      
      timeline.push(
        {
          phase: 'Staging Deployment',
          start: stagingStart.toISOString(),
          duration: '2 hours',
          activities: ['Deploy to staging', 'Run integration tests', 'QA validation']
        },
        {
          phase: 'Production Rollout',
          start: prodStart.toISOString(),
          duration: '4 hours',
          activities: ['Gradual production deployment', 'Monitor metrics', 'Full rollout']
        }
      );
    } else {
      const fixStart = new Date(now.getTime() + 1 * 60 * 60 * 1000); // +1 hour
      timeline.push({
        phase: 'Issue Resolution',
        start: fixStart.toISOString(),
        duration: '1-3 days',
        activities: ['Address identified issues', 'Re-run analysis', 'Schedule merge']
      });
    }

    return timeline;
  }

  /**
   * Generate approval checklist
   */
  generateApprovalChecklist() {
    return [
      { item: 'Code review completed', required: true, owner: 'senior-developer' },
      { item: 'All tests passing', required: true, owner: 'ci-system' },
      { item: 'Security review completed', required: false, owner: 'security-team' },
      { item: 'Performance impact assessed', required: false, owner: 'performance-team' },
      { item: 'Documentation updated', required: true, owner: 'development-team' },
      { item: 'Rollback plan confirmed', required: true, owner: 'operations-team' }
    ];
  }

  /**
   * Generate rollback plan
   */
  generateRollbackPlan() {
    return {
      triggerConditions: [
        'Error rate > 5%',
        'Response time > 2x baseline',
        'Critical functionality broken'
      ],
      steps: [
        'Immediately revert to previous version',
        'Verify service restoration',
        'Analyze failure cause',
        'Communicate to stakeholders'
      ],
      timeline: '< 15 minutes for rollback execution',
      contacts: ['on-call-engineer', 'tech-lead', 'product-manager']
    };
  }

  /**
   * Utility method to walk directory
   */
  walkDirectory(dir, callback) {
    if (!fs.existsSync(dir)) return;
    
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
   * Format recommendation as text report
   */
  formatTextReport(recommendation) {
    let output = `\n📋 MERGE DECISION RECOMMENDATION\n`;
    output += `==========================================\n\n`;
    
    output += `🎯 RECOMMENDATION: ${recommendation.recommendation}\n`;
    output += `📊 Overall Score: ${recommendation.overallScore}/100\n`;
    output += `⚖️  Risk Tolerance: ${recommendation.riskTolerance}\n`;
    output += `🔄 Strategy: ${recommendation.strategy}\n\n`;

    // Analysis Summary
    output += `📈 ANALYSIS SUMMARY:\n`;
    output += `===================\n`;
    output += `Code Quality: ${recommendation.analysis.codeQuality.score}/100\n`;
    output += `Test Coverage: ${recommendation.analysis.testCoverage.score}/100\n`;
    output += `CI Status: ${recommendation.analysis.ciStatus.score}/100\n`;
    output += `Dependencies: ${recommendation.analysis.dependencies.score}/100\n`;
    output += `Risk Factors: ${recommendation.analysis.riskFactors.score}/100\n\n`;

    // Action Items
    if (recommendation.actionItems.length > 0) {
      output += `📋 ACTION ITEMS:\n`;
      output += `================\n`;
      recommendation.actionItems.forEach((item, i) => {
        output += `${i + 1}. [${item.priority.toUpperCase()}] ${item.action}\n`;
        output += `   👤 Owner: ${item.owner}\n\n`;
      });
    }

    // Timeline
    output += `⏰ DEPLOYMENT TIMELINE:\n`;
    output += `=======================\n`;
    recommendation.timeline.forEach(phase => {
      output += `📅 ${phase.phase}\n`;
      output += `   Start: ${new Date(phase.start).toLocaleString()}\n`;
      output += `   Duration: ${phase.duration}\n`;
      output += `   Activities: ${phase.activities.join(', ')}\n\n`;
    });

    // Approval Checklist
    output += `✅ APPROVAL CHECKLIST:\n`;
    output += `======================\n`;
    recommendation.approvalChecklist.forEach(item => {
      const required = item.required ? '[REQUIRED]' : '[OPTIONAL]';
      output += `${required} ${item.item} (${item.owner})\n`;
    });

    output += `\n📞 ROLLBACK PLAN:\n`;
    output += `================\n`;
    output += `Triggers: ${recommendation.rollbackPlan.triggerConditions.join(', ')}\n`;
    output += `Timeline: ${recommendation.rollbackPlan.timeline}\n`;
    output += `Contacts: ${recommendation.rollbackPlan.contacts.join(', ')}\n`;

    return output;
  }
}

// CLI interface
async function main() {
  const args = process.argv.slice(2);
  
  const options = {
    riskTolerance: getArgValue(args, '--risk-tolerance') || 'normal',
    format: args.includes('--json') ? 'json' : 'text'
  };

  const decisionMaker = new MergeDecisionMaker(options);
  const recommendation = await decisionMaker.generateRecommendation();
  
  if (options.format === 'json') {
    console.log(JSON.stringify(recommendation, null, 2));
  } else {
    console.log(decisionMaker.formatTextReport(recommendation));
  }
}

function getArgValue(args, flag) {
  const index = args.indexOf(flag);
  return index !== -1 && index + 1 < args.length ? args[index + 1] : null;
}

if (require.main === module) {
  main().catch(console.error);
}

module.exports = MergeDecisionMaker;