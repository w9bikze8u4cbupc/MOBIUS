#!/usr/bin/env node

/**
 * Integrated PR Review and Merge Decision Workflow
 * Implements the recommended quick path: (1) PR reviewer, (2) merge decision, (8) PR command
 * Usage: node tools/pr-workflow.js [--risk-tolerance normal] [--json]
 */

const FocusedPRReviewer = require('./pr-reviewer.js');
const MergeDecisionMaker = require('./merge-decision.js');
const PRCreateCommand = require('./pr-create-command.js');

class PRWorkflow {
  constructor(options = {}) {
    this.options = {
      riskTolerance: options.riskTolerance || 'normal',
      format: options.format || 'text',
      autoCreate: options.autoCreate || false,
      ...options
    };
    this.results = {};
  }

  async execute() {
    console.log('🎯 PR REVIEW & MERGE DECISION WORKFLOW');
    console.log('Quick path implementation: options (1) + (2) + (8)\n');

    try {
      // Step 1: Focused PR Reviewer Pass
      console.log('=' .repeat(50));
      console.log('STEP 1: FOCUSED PR REVIEWER PASS');
      console.log('=' .repeat(50));
      
      const reviewer = new FocusedPRReviewer();
      const reviewResult = reviewer.analyze();
      this.results.review = reviewResult;
      
      if (this.options.format !== 'json') {
        console.log(reviewer.formatReport(reviewResult, 'text'));
      }
      console.log('✅ Step 1 complete\n');

      // Step 2: Final Merge Decision Recommendation  
      console.log('=' .repeat(50));
      console.log('STEP 2: MERGE DECISION RECOMMENDATION');
      console.log('=' .repeat(50));
      
      const decisionMaker = new MergeDecisionMaker({
        riskTolerance: this.options.riskTolerance
      });
      const decisionResult = decisionMaker.analyze();
      this.results.decision = decisionResult;
      
      if (this.options.format !== 'json') {
        console.log(decisionMaker.formatReport(decisionResult, 'text'));
      }
      console.log('✅ Step 2 complete\n');

      // Step 3: GitHub CLI PR Creation Command
      console.log('=' .repeat(50));
      console.log('STEP 3: GITHUB CLI PR COMMAND');
      console.log('=' .repeat(50));
      
      const commandGenerator = new PRCreateCommand({
        title: this.generatePRTitle(),
        labels: this.generatePRLabels(),
        draft: this.shouldCreateDraft()
      });
      
      const commandResult = commandGenerator.generate();
      this.results.command = commandResult;
      
      if (this.options.format !== 'json') {
        console.log(commandGenerator.formatOutput(commandResult, 'text'));
      }
      console.log('✅ Step 3 complete\n');

      // Generate comprehensive summary
      this.generateSummary();
      
      return this.results;
      
    } catch (error) {
      console.error(`❌ Workflow failed: ${error.message}`);
      throw error;
    }
  }

  generatePRTitle() {
    // Use default title or customize based on analysis
    if (this.results.review && this.results.review.issues.blockers.length > 0) {
      return 'WIP: Address critical issues before merge';
    }
    
    return this.options.title || 'Implement PR review and merge decision workflow';
  }

  generatePRLabels() {
    const labels = [];
    
    if (this.results.review) {
      if (this.results.review.issues.blockers.length > 0) {
        labels.push('blocked', 'needs-work');
      } else if (this.results.review.issues.quickFixes.length > 5) {
        labels.push('code-quality', 'enhancement');
      } else {
        labels.push('enhancement');
      }
    }
    
    if (this.results.decision) {
      if (this.results.decision.decision === 'STAGED_ROLLOUT') {
        labels.push('staged-deployment');
      } else if (this.results.decision.decision === 'DELAY_MERGE') {
        labels.push('blocked');
      }
    }
    
    // Add workflow label
    labels.push('pr-workflow');
    
    return [...new Set(labels)]; // Remove duplicates
  }

  shouldCreateDraft() {
    // Create as draft if there are blockers or merge should be delayed
    if (this.results.review && this.results.review.issues.blockers.length > 0) {
      return true;
    }
    
    if (this.results.decision && this.results.decision.decision === 'DELAY_MERGE') {
      return true;
    }
    
    return false;
  }

  generateSummary() {
    if (this.options.format === 'json') {
      console.log(JSON.stringify(this.results, null, 2));
      return;
    }
    
    console.log('=' .repeat(60));
    console.log('🎯 WORKFLOW SUMMARY & RECOMMENDATIONS');
    console.log('=' .repeat(60));
    
    // Quick overview
    console.log('\n📊 ANALYSIS OVERVIEW:');
    
    if (this.results.review) {
      const r = this.results.review;
      console.log(`  Code Review: ${r.summary.total} issues found`);
      console.log(`    🚫 ${r.summary.blockers} blockers`);  
      console.log(`    ⚡ ${r.summary.quickFixes} quick fixes`);
      console.log(`    💡 ${r.summary.suggestions} suggestions`);
      console.log(`    → ${r.recommendation.action}`);
    }
    
    if (this.results.decision) {
      const d = this.results.decision;
      console.log(`  Merge Decision: ${d.decision} (${d.overallScore}/100)`);
      console.log(`    Strategy: ${d.strategy}`);
      console.log(`    Risk Tolerance: ${d.riskTolerance}`);
    }
    
    // Key recommendations
    console.log('\n🚀 KEY RECOMMENDATIONS:');
    
    const hasBlockers = this.results.review && this.results.review.issues.blockers.length > 0;
    const delayMerge = this.results.decision && this.results.decision.decision === 'DELAY_MERGE';
    
    if (hasBlockers || delayMerge) {
      console.log('  1. ⚠️  DO NOT MERGE YET - Critical issues identified');
      console.log('  2. Address blocking issues first');
      console.log('  3. Re-run this workflow after fixes');
      console.log('  4. PR will be created as DRAFT for safety');
    } else if (this.results.decision && this.results.decision.decision === 'STAGED_ROLLOUT') {
      console.log('  1. ✅ Proceed with STAGED ROLLOUT');
      console.log('  2. Use gradual deployment strategy');
      console.log('  3. Monitor metrics closely during rollout');
      console.log('  4. Execute PR command to create PR');
    } else {
      console.log('  1. ✅ Ready for IMMEDIATE MERGE');
      console.log('  2. All quality gates passed');
      console.log('  3. Execute PR command to create PR');
      console.log('  4. Proceed with standard merge process');
    }
    
    // Next steps
    console.log('\n📋 NEXT STEPS:');
    console.log('  1. Review analysis results above');
    console.log('  2. Address any critical issues if present');
    console.log('  3. Use saved PR command: CREATE_PR_COMMAND.txt');
    console.log('  4. Follow the deployment timeline provided');
    
    console.log('\n💡 WORKFLOW NOTES:');
    console.log('  • All analysis results saved for reference');
    console.log('  • Re-run workflow after making changes');
    console.log('  • Use --risk-tolerance conservative for safer merging');
    console.log('  • Individual tools available: pr-reviewer, merge-decision, pr-create-command');
    
    console.log('\n' + '=' .repeat(60));
  }
}

// CLI Interface
async function main() {
  const args = process.argv.slice(2);
  
  const options = {
    riskTolerance: getArgValue(args, '--risk-tolerance') || 'normal',
    format: args.includes('--json') ? 'json' : 'text',
    title: getArgValue(args, '--title'),
    autoCreate: args.includes('--auto-create')
  };
  
  // Validate risk tolerance
  const validRiskLevels = ['conservative', 'normal', 'aggressive'];
  if (!validRiskLevels.includes(options.riskTolerance)) {
    console.error(`❌ Invalid risk tolerance: ${options.riskTolerance}`);
    console.error(`Valid options: ${validRiskLevels.join(', ')}`);
    process.exit(1);
  }
  
  try {
    const workflow = new PRWorkflow(options);
    const results = await workflow.execute();
    
    // Auto-create PR if requested and safe to do so
    if (options.autoCreate && results.command && !workflow.shouldCreateDraft()) {
      console.log('\n🚀 Auto-creating PR...');
      try {
        const { execSync } = require('child_process');
        execSync(results.command.command, { stdio: 'inherit' });
        console.log('✅ PR created successfully!');
      } catch (error) {
        console.error('❌ Failed to auto-create PR. Use the saved command manually.');
      }
    }
    
  } catch (error) {
    console.error(`❌ Workflow error: ${error.message}`);
    process.exit(1);
  }
}

function getArgValue(args, flag) {
  const index = args.indexOf(flag);
  return index !== -1 && index + 1 < args.length ? args[index + 1] : null;
}

if (require.main === module) {
  main().catch(console.error);
}

module.exports = PRWorkflow;