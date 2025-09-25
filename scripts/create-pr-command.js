#!/usr/bin/env node

/**
 * GitHub CLI PR Creation Command Generator
 * Generates exact gh CLI command to create PR with proper settings
 * 
 * Usage: node scripts/create-pr-command.js [options]
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

class PRCommandGenerator {
  constructor(options = {}) {
    this.options = {
      repo: options.repo || this.detectRepo(),
      headBranch: options.headBranch || this.getCurrentBranch(),
      baseBranch: options.baseBranch || 'main',
      title: options.title || this.generateTitle(),
      body: options.body || this.generateBody(),
      reviewers: options.reviewers || [],
      assignees: options.assignees || [],
      labels: options.labels || this.suggestLabels(),
      draft: options.draft !== undefined ? options.draft : false,
      ...options
    };
  }

  /**
   * Generate the complete gh CLI command
   */
  generateCommand() {
    console.log('🚀 Generating GitHub CLI PR creation command...');
    
    const validation = this.validateInputs();
    if (!validation.valid) {
      throw new Error(`Invalid inputs: ${validation.errors.join(', ')}`);
    }

    const command = this.buildCommand();
    const metadata = this.generateMetadata();
    
    console.log('✅ PR command generation complete');
    
    return {
      command,
      metadata,
      validation: validation.warnings || []
    };
  }

  /**
   * Detect repository from git remote
   */
  detectRepo() {
    try {
      const remoteUrl = execSync('git remote get-url origin', { encoding: 'utf8' }).trim();
      
      // Parse GitHub URL (supports both HTTPS and SSH)
      let match = remoteUrl.match(/github\.com[:/]([^/]+\/[^/]+?)(?:\.git)?$/);
      if (match) {
        return match[1];
      }
      
      throw new Error('Could not parse GitHub repository from remote URL');
    } catch (error) {
      console.warn('⚠️  Could not detect repository automatically');
      return 'owner/repo'; // Placeholder
    }
  }

  /**
   * Get current branch name
   */
  getCurrentBranch() {
    try {
      const branch = execSync('git branch --show-current', { encoding: 'utf8' }).trim();
      return branch || 'feature/branch';
    } catch (error) {
      console.warn('⚠️  Could not detect current branch');
      return 'feature/branch';
    }
  }

  /**
   * Generate PR title from branch name or recent commits
   */
  generateTitle() {
    // If title was provided in options, use that
    if (this.options.title && this.options.title !== null) {
      return this.options.title;
    }
    
    try {
      // First, try to get from recent commit
      const lastCommit = execSync('git log -1 --pretty=%s', { encoding: 'utf8' }).trim();
      if (lastCommit && !lastCommit.startsWith('Merge') && lastCommit.length > 10) {
        return lastCommit;
      }

      // Fallback to branch name
      const branch = this.options.headBranch || this.getCurrentBranch();
      return this.formatBranchAsTitle(branch);
    } catch (error) {
      return 'Update repository';
    }
  }

  /**
   * Format branch name as human-readable title
   */
  formatBranchAsTitle(branch) {
    if (!branch) return 'Update Repository';
    
    return branch
      .replace(/^(feature|fix|hotfix|chore|docs)\//, '') // Remove prefixes
      .replace(/[-_]/g, ' ') // Replace hyphens and underscores with spaces
      .replace(/\b\w/g, l => l.toUpperCase()) // Capitalize words
      .trim();
  }

  /**
   * Generate PR body with template
   */
  generateBody() {
    const template = this.loadPRTemplate();
    if (template) {
      return template;
    }

    // Default template
    return this.createDefaultTemplate();
  }

  /**
   * Load PR template if exists
   */
  loadPRTemplate() {
    const templatePaths = [
      '.github/pull_request_template.md',
      '.github/PULL_REQUEST_TEMPLATE.md',
      '.github/pull_request_template/default.md'
    ];

    for (const templatePath of templatePaths) {
      const fullPath = path.join(process.cwd(), templatePath);
      if (fs.existsSync(fullPath)) {
        return fs.readFileSync(fullPath, 'utf8');
      }
    }

    return null;
  }

  /**
   * Create default PR template
   */
  createDefaultTemplate() {
    const branch = this.getCurrentBranch();
    const hasTests = this.detectTests();
    const hasCI = this.detectCI();

    return `## Summary
Brief description of changes made in this PR.

## Changes
- [ ] Feature implementation
- [ ] Bug fixes
- [ ] Documentation updates
- [ ] Configuration changes

## Testing
${hasTests ? '- [ ] All existing tests pass\n- [ ] New tests added for changes' : '- [ ] Manual testing completed'}

## Checklist
- [ ] Code follows project style guidelines
- [ ] Self-review completed
${hasCI ? '- [ ] CI checks pass' : '- [ ] Manual verification completed'}
- [ ] Documentation updated (if needed)

## Related Issues
Fixes #<issue-number>

---
*Generated from branch: \`${branch}\`*`;
  }

  /**
   * Detect if project has tests
   */
  detectTests() {
    const testPaths = ['tests', 'test', '__tests__', 'src/__tests__'];
    return testPaths.some(dir => fs.existsSync(path.join(process.cwd(), dir)));
  }

  /**
   * Detect if project has CI
   */
  detectCI() {
    return fs.existsSync(path.join(process.cwd(), '.github/workflows'));
  }

  /**
   * Suggest labels based on branch name and changes
   */
  suggestLabels() {
    const branch = this.getCurrentBranch().toLowerCase();
    const labels = [];

    // Branch-based labels
    if (branch.includes('feature')) labels.push('enhancement');
    if (branch.includes('fix') || branch.includes('bug')) labels.push('bug');
    if (branch.includes('hotfix')) labels.push('critical', 'bug');
    if (branch.includes('docs')) labels.push('documentation');
    if (branch.includes('chore') || branch.includes('refactor')) labels.push('maintenance');
    if (branch.includes('test')) labels.push('testing');

    // Content-based labels
    try {
      const changedFiles = execSync('git diff --name-only HEAD~1..HEAD', { encoding: 'utf8' });
      
      if (changedFiles.includes('.github/workflows/')) labels.push('ci/cd');
      if (changedFiles.includes('package.json') || changedFiles.includes('package-lock.json')) {
        labels.push('dependencies');
      }
      if (changedFiles.includes('README.md') || changedFiles.includes('.md')) {
        labels.push('documentation');
      }
    } catch (error) {
      // Ignore if can't detect changes
    }

    return [...new Set(labels)]; // Remove duplicates
  }

  /**
   * Validate all inputs
   */
  validateInputs() {
    const errors = [];
    const warnings = [];

    // Required fields
    if (!this.options.repo || this.options.repo === 'owner/repo') {
      errors.push('Repository not specified or could not be detected');
    }

    if (!this.options.headBranch) {
      errors.push('Head branch not specified');
    }

    if (!this.options.title || this.options.title.length < 5) {
      warnings.push('PR title might be too short');
    }

    // GitHub-specific validations
    if (this.options.title && this.options.title.length > 200) {
      warnings.push('PR title is very long (>200 chars)');
    }

    // Reviewers validation
    if (this.options.reviewers && this.options.reviewers.length > 10) {
      warnings.push('Large number of reviewers requested (>10)');
    }

    return {
      valid: errors.length === 0,
      errors,
      warnings
    };
  }

  /**
   * Build the actual gh CLI command
   */
  buildCommand() {
    const parts = ['gh pr create'];

    // Basic options
    parts.push(`--repo "${this.options.repo}"`);
    parts.push(`--head "${this.options.headBranch}"`);
    parts.push(`--base "${this.options.baseBranch}"`);
    parts.push(`--title "${this.escapeQuotes(this.options.title)}"`);

    // Body (handle multiline)
    if (this.options.body) {
      const bodyFile = this.writeBodyToTempFile(this.options.body);
      parts.push(`--body-file "${bodyFile}"`);
    }

    // Draft
    if (this.options.draft) {
      parts.push('--draft');
    }

    // Reviewers
    if (this.options.reviewers && this.options.reviewers.length > 0) {
      parts.push(`--reviewer "${this.options.reviewers.join(',')}"`);
    }

    // Assignees
    if (this.options.assignees && this.options.assignees.length > 0) {
      parts.push(`--assignee "${this.options.assignees.join(',')}"`);
    }

    // Labels
    if (this.options.labels && this.options.labels.length > 0) {
      parts.push(`--label "${this.options.labels.join(',')}"`);
    }

    return parts.join(' \\\n  ');
  }

  /**
   * Write PR body to temporary file for --body-file option
   */
  writeBodyToTempFile(body) {
    const tempDir = '/tmp';
    const tempFile = path.join(tempDir, `pr-body-${Date.now()}.md`);
    
    // Ensure temp directory exists
    if (!fs.existsSync(tempDir)) {
      fs.mkdirSync(tempDir, { recursive: true });
    }
    
    fs.writeFileSync(tempFile, body, 'utf8');
    return tempFile;
  }

  /**
   * Escape quotes in strings
   */
  escapeQuotes(str) {
    if (!str) return '';
    return str.replace(/"/g, '\\"');
  }

  /**
   * Generate metadata about the PR
   */
  generateMetadata() {
    return {
      timestamp: new Date().toISOString(),
      repository: this.options.repo,
      branches: {
        head: this.options.headBranch,
        base: this.options.baseBranch
      },
      stats: this.getRepoStats(),
      environment: {
        nodeVersion: process.version,
        platform: process.platform,
        cwd: process.cwd()
      }
    };
  }

  /**
   * Get basic repository statistics
   */
  getRepoStats() {
    try {
      const stats = {
        totalCommits: 0,
        changedFiles: 0,
        additions: 0,
        deletions: 0
      };

      // Get commit count
      try {
        const commitCount = execSync('git rev-list --count HEAD', { encoding: 'utf8' });
        stats.totalCommits = parseInt(commitCount.trim());
      } catch (e) {}

      // Get diff stats
      try {
        const diffStat = execSync('git diff --stat HEAD~1..HEAD', { encoding: 'utf8' });
        const match = diffStat.match(/(\d+) files? changed(?:, (\d+) insertions?)?(?:, (\d+) deletions?)?/);
        if (match) {
          stats.changedFiles = parseInt(match[1]) || 0;
          stats.additions = parseInt(match[2]) || 0;
          stats.deletions = parseInt(match[3]) || 0;
        }
      } catch (e) {}

      return stats;
    } catch (error) {
      return { error: 'Could not fetch repository stats' };
    }
  }

  /**
   * Format output as text
   */
  formatTextOutput(result) {
    let output = `\n🚀 GITHUB PR CREATION COMMAND\n`;
    output += `=====================================\n\n`;
    
    output += `📋 PR DETAILS:\n`;
    output += `Repository: ${this.options.repo}\n`;
    output += `Branch: ${this.options.headBranch} → ${this.options.baseBranch}\n`;
    output += `Title: ${this.options.title}\n`;
    output += `Draft: ${this.options.draft ? 'Yes' : 'No'}\n`;
    
    if (this.options.labels.length > 0) {
      output += `Labels: ${this.options.labels.join(', ')}\n`;
    }
    
    if (this.options.reviewers.length > 0) {
      output += `Reviewers: ${this.options.reviewers.join(', ')}\n`;
    }
    
    output += `\n🔧 COMMAND TO EXECUTE:\n`;
    output += `======================\n`;
    output += result.command + '\n\n';

    if (result.validation.length > 0) {
      output += `⚠️  WARNINGS:\n`;
      output += `=============\n`;
      result.validation.forEach(warning => {
        output += `• ${warning}\n`;
      });
      output += '\n';
    }

    output += `💡 NEXT STEPS:\n`;
    output += `==============\n`;
    output += `1. Review the command above\n`;
    output += `2. Ensure you have 'gh' CLI installed and authenticated\n`;
    output += `3. Run the command to create the PR\n`;
    output += `4. Monitor CI checks and address any issues\n`;

    return output;
  }
}

// CLI interface
async function main() {
  const args = process.argv.slice(2);
  
  const options = {
    repo: getArgValue(args, '--repo'),
    headBranch: getArgValue(args, '--head') || getArgValue(args, '--head-branch'),
    baseBranch: getArgValue(args, '--base') || getArgValue(args, '--base-branch') || 'main',
    title: getArgValue(args, '--title'),
    body: getArgValue(args, '--body'),
    reviewers: getArgArray(args, '--reviewers'),
    assignees: getArgArray(args, '--assignees'),
    labels: getArgArray(args, '--labels'),
    draft: args.includes('--draft'),
    format: args.includes('--json') ? 'json' : 'text'
  };

  try {
    const generator = new PRCommandGenerator(options);
    const result = generator.generateCommand();
    
    if (options.format === 'json') {
      console.log(JSON.stringify({ ...result, options }, null, 2));
    } else {
      console.log(generator.formatTextOutput(result));
    }

    // Also save command to file for easy access
    const commandFile = path.join(process.cwd(), 'CREATE_PR_COMMAND.txt');
    fs.writeFileSync(commandFile, result.command + '\n', 'utf8');
    console.log(`\n📝 Command saved to: ${commandFile}`);

  } catch (error) {
    console.error(`❌ Error: ${error.message}`);
    process.exit(1);
  }
}

function getArgValue(args, flag) {
  const index = args.indexOf(flag);
  return index !== -1 && index + 1 < args.length ? args[index + 1] : null;
}

function getArgArray(args, flag) {
  const value = getArgValue(args, flag);
  return value ? value.split(',').map(s => s.trim()) : [];
}

if (require.main === module) {
  main().catch(console.error);
}

module.exports = PRCommandGenerator;