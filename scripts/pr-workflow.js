#!/usr/bin/env node

/**
 * Focused PR Review and Merge Decision Workflow
 * Integrates all three tools: PR Review, Merge Decision, and PR Creation
 * 
 * Usage: node scripts/pr-workflow.js [--risk-tolerance <conservative|normal|aggressive>] [--auto-create-pr]
 */

const PRReviewer = require('./pr-reviewer.js');
const MergeDecisionMaker = require('./merge-decision.js');
const PRCommandGenerator = require('./create-pr-command.js');

class PRWorkflow {
  constructor(options = {}) {
    this.options = options;
    this.results = {};
  }

  /**
   * Execute the complete workflow as recommended (options 1, 2, 8)
   */
  async executeWorkflow() {
    console.log('🚀 Starting Focused PR Review and Merge Decision Workflow...\n');
    console.log('This workflow includes:');
    console.log('1. 📋 Focused PR reviewer pass');
    console.log('2. 🎯 Final merge decision recommendation'); 
    console.log('3. 🔧 GitHub CLI PR creation command\n');

    // Step 1: Focused PR Review
    console.log('=' .repeat(60));
    console.log('STEP 1: FOCUSED PR REVIEWER PASS');
    console.log('=' .repeat(60));
    
    const reviewer = new PRReviewer();
    const reviewResults = await reviewer.analyzeRepository();
    this.results.review = reviewResults;
    
    console.log(reviewer.formatTextReport(reviewResults));
    console.log('\n');

    // Step 2: Merge Decision 
    console.log('=' .repeat(60));
    console.log('STEP 2: FINAL MERGE DECISION RECOMMENDATION');
    console.log('=' .repeat(60));
    
    const decisionMaker = new MergeDecisionMaker({
      riskTolerance: this.options.riskTolerance || 'normal'
    });
    const decisionResults = await decisionMaker.generateRecommendation();
    this.results.decision = decisionResults;
    
    console.log(decisionMaker.formatTextReport(decisionResults));
    console.log('\n');

    // Step 3: PR Command Generation
    console.log('=' .repeat(60));
    console.log('STEP 3: GITHUB CLI PR CREATION COMMAND');
    console.log('=' .repeat(60));
    
    const commandGenerator = new PRCommandGenerator({
      title: this.options.title || 'Implement focused PR review and merge decision tools',
      labels: this.suggestLabelsFromAnalysis(),
      draft: this.shouldCreateDraft()
    });
    
    try {
      const commandResults = commandGenerator.generateCommand();
      this.results.command = commandResults;
      
      console.log(commandGenerator.formatTextOutput(commandResults));
    } catch (error) {
      console.error(`❌ Error generating PR command: ${error.message}`);
      console.log('\n💡 You can manually create the PR or provide missing parameters.');
    }

    // Generate Final Summary
    this.generateFinalSummary();
    
    return this.results;
  }

  /**
   * Suggest labels based on analysis results
   */
  suggestLabelsFromAnalysis() {
    const labels = ['enhancement'];
    
    if (this.results.review) {
      if (this.results.review.issues.blockers.length > 0) {
        labels.push('needs-work');
      }
      if (this.results.review.issues.quickFixes.length > 10) {
        labels.push('code-quality');
      }
    }

    if (this.results.decision) {
      if (this.results.decision.recommendation === 'STAGED_ROLLOUT') {
        labels.push('staged-deployment');
      } else if (this.results.decision.recommendation === 'DELAY_MERGE') {
        labels.push('blocked');
      }
    }

    return labels;
  }

  /**
   * Determine if PR should be created as draft
   */
  shouldCreateDraft() {
    if (this.results.review && this.results.review.issues.blockers.length > 0) {
      return true;
    }
    
    if (this.results.decision && this.results.decision.recommendation === 'DELAY_MERGE') {
      return true;
    }

    return false;
  }

  /**
   * Generate comprehensive final summary
   */
  generateFinalSummary() {
    console.log('\n');
    console.log('=' .repeat(80));
    console.log('🎯 WORKFLOW SUMMARY & RECOMMENDATIONS');
    console.log('=' .repeat(80));

    // Quick Stats
    if (this.results.review) {
      const review = this.results.review;
      console.log('\n📊 CODE QUALITY SUMMARY:');
      console.log(`   • Total Issues Found: ${review.summary.total}`);
      console.log(`   • 🚫 Blockers: ${review.summary.blockers}`);
      console.log(`   • ⚡ Quick Fixes: ${review.summary.quickFixes}`);
      console.log(`   • 💡 Suggestions: ${review.summary.suggestions}`);
      console.log(`   • Priority: ${review.priority}`);
    }

    if (this.results.decision) {
      const decision = this.results.decision;
      console.log('\n🎯 MERGE RECOMMENDATION:');
      console.log(`   • Decision: ${decision.recommendation}`);
      console.log(`   • Overall Score: ${decision.overallScore}/100`);
      console.log(`   • Strategy: ${decision.strategy}`);
      console.log(`   • Risk Tolerance: ${decision.riskTolerance}`);
    }

    // Next Steps
    console.log('\n🚀 RECOMMENDED NEXT STEPS:');
    console.log('   1. Review the analysis results above');
    
    if (this.results.review && this.results.review.issues.blockers.length > 0) {
      console.log('   2. ⚠️  ADDRESS BLOCKERS before proceeding');
      console.log('   3. Re-run this workflow after fixes');
    } else if (this.results.review && this.results.review.issues.quickFixes.length > 5) {
      console.log('   2. Consider addressing quick fixes for better code quality');
      console.log('   3. Use the generated PR command to create the PR');
    } else {
      console.log('   2. Use the generated PR command to create the PR');
      console.log('   3. Follow the merge timeline provided');
    }

    // Command Access
    if (this.results.command) {
      console.log('\n📋 PR CREATION:');
      console.log('   • Command saved to: CREATE_PR_COMMAND.txt');
      console.log('   • Review and execute the command when ready');
    }

    console.log('\n💡 TIPS:');
    console.log('   • Run with --risk-tolerance conservative for safer merging');
    console.log('   • Use --json flag on individual tools for programmatic access');
    console.log('   • Re-run analysis after making changes');
    
    console.log('\n' + '=' .repeat(80));
  }
}

// CLI interface
async function main() {
  const args = process.argv.slice(2);
  
  const options = {
    riskTolerance: getArgValue(args, '--risk-tolerance') || 'normal',
    title: getArgValue(args, '--title'),
    autoCreatePR: args.includes('--auto-create-pr')
  };

  console.log('🎯 FOCUSED PR REVIEW & MERGE DECISION WORKFLOW');
  console.log('Recommended by the quick path: options 1 + 2 + 8\n');

  try {
    const workflow = new PRWorkflow(options);
    await workflow.executeWorkflow();
    
    if (options.autoCreatePR && workflow.results.command) {
      console.log('\n🚀 Auto-creating PR...');
      const { execSync } = require('child_process');
      try {
        execSync(workflow.results.command.command, { stdio: 'inherit' });
        console.log('✅ PR created successfully!');
      } catch (error) {
        console.error('❌ Failed to create PR automatically. Use the saved command manually.');
      }
    }

  } catch (error) {
    console.error(`❌ Workflow failed: ${error.message}`);
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