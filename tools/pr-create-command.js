#!/usr/bin/env node

/**
 * GitHub CLI PR Creation Command Generator
 * Produces exact gh CLI command to create PR
 * Usage: node tools/pr-create-command.js [options]
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

class PRCreateCommand {
  constructor(options = {}) {
    this.options = {
      repo: options.repo || this.detectRepo(),
      headBranch: options.headBranch || this.getCurrentBranch(),
      baseBranch: options.baseBranch || 'main',
      title: options.title || this.generateTitle(),
      body: options.body,
      reviewers: options.reviewers || [],
      assignees: options.assignees || [],
      labels: options.labels || this.suggestLabels(),
      draft: options.draft || false
    };
  }

  generate() {
    console.log('🚀 Generating GitHub CLI PR creation command...');
    
    // Validate inputs
    if (!this.options.repo || this.options.repo === 'owner/repo') {
      throw new Error('Repository could not be detected. Use --repo owner/repo');
    }
    
    if (!this.options.headBranch) {
      throw new Error('Current branch could not be detected. Use --head branch-name');
    }
    
    const command = this.buildCommand();
    const metadata = this.generateMetadata();
    
    // Save to file for easy access
    this.saveCommand(command);
    
    return {
      command,
      metadata,
      options: this.options
    };
  }

  detectRepo() {
    try {
      const remoteUrl = execSync('git remote get-url origin', { encoding: 'utf8' }).trim();
      
      // Parse GitHub URL (HTTPS or SSH)
      const httpsMatch = remoteUrl.match(/https:\/\/github\.com\/([^\/]+\/[^\/]+?)(?:\.git)?$/);
      const sshMatch = remoteUrl.match(/git@github\.com:([^\/]+\/[^\/]+?)(?:\.git)?$/);
      
      return httpsMatch?.[1] || sshMatch?.[1] || null;
    } catch (error) {
      console.warn('⚠️ Could not detect repository from git remote');
      return null;
    }
  }

  getCurrentBranch() {
    try {
      return execSync('git branch --show-current', { encoding: 'utf8' }).trim();
    } catch (error) {
      console.warn('⚠️ Could not detect current branch');
      return null;
    }
  }

  generateTitle() {
    
    try {
      // Try to get from the most recent commit
      const lastCommit = execSync('git log -1 --pretty=format:%s', { encoding: 'utf8' }).trim();
      if (lastCommit && !lastCommit.startsWith('Merge') && lastCommit.length > 10) {
        return lastCommit;
      }
      
      // Fallback to branch name
      const branch = this.options.headBranch;
      if (branch) {
        return this.formatBranchName(branch);
      }
      
      return 'Update from development branch';
    } catch (error) {
      return 'Update from development branch';
    }
  }

  formatBranchName(branch) {
    return branch
      .replace(/^(feature|fix|hotfix|chore|docs)\//, '')
      .replace(/[-_]/g, ' ')
      .replace(/\b\w/g, l => l.toUpperCase());
  }

  suggestLabels() {
    const labels = [];
    const branch = this.options.headBranch?.toLowerCase() || '';
    
    // Branch-based labels
    if (branch.includes('feature')) labels.push('enhancement');
    if (branch.includes('fix') || branch.includes('bug')) labels.push('bug');
    if (branch.includes('docs')) labels.push('documentation');
    if (branch.includes('test')) labels.push('testing');
    if (branch.includes('chore')) labels.push('maintenance');
    
    // Default if no specific labels
    if (labels.length === 0) labels.push('enhancement');
    
    return labels;
  }

  buildCommand() {
    const parts = ['gh pr create'];
    
    // Required parameters
    parts.push(`--repo "${this.options.repo}"`);
    parts.push(`--head "${this.options.headBranch}"`);
    parts.push(`--base "${this.options.baseBranch}"`);
    parts.push(`--title "${this.escapeQuotes(this.options.title)}"`);
    
    // Body
    if (this.options.body) {
      // For multiline body, we'll use a simple approach
      parts.push(`--body "${this.escapeQuotes(this.options.body)}"`);
    } else {
      // Generate a simple body
      const defaultBody = this.generateDefaultBody();
      parts.push(`--body "${this.escapeQuotes(defaultBody)}"`);
    }
    
    // Optional parameters
    if (this.options.draft) {
      parts.push('--draft');
    }
    
    if (this.options.reviewers.length > 0) {
      parts.push(`--reviewer "${this.options.reviewers.join(',')}"`);
    }
    
    if (this.options.assignees.length > 0) {
      parts.push(`--assignee "${this.options.assignees.join(',')}"`);
    }
    
    if (this.options.labels.length > 0) {
      parts.push(`--label "${this.options.labels.join(',')}"`);
    }
    
    // Format as multiline command for readability
    return parts.join(' \\\n  ');
  }

  generateDefaultBody() {
    const branch = this.options.headBranch;
    return `## Summary
Brief description of changes in this PR.

## Changes Made
- [ ] Feature updates
- [ ] Bug fixes
- [ ] Documentation updates

## Testing
- [ ] All tests pass
- [ ] Manual testing completed

---
*PR created from branch: \`${branch}\`*`;
  }

  escapeQuotes(str) {
    if (!str) return '';
    return str.replace(/"/g, '\\"');
  }

  generateMetadata() {
    return {
      timestamp: new Date().toISOString(),
      repository: this.options.repo,
      branches: {
        head: this.options.headBranch,
        base: this.options.baseBranch
      },
      stats: this.getRepoStats()
    };
  }

  getRepoStats() {
    try {
      const stats = {};
      
      // Get recent commits count
      try {
        const commitCount = execSync('git rev-list --count HEAD', { encoding: 'utf8' });
        stats.totalCommits = parseInt(commitCount.trim());
      } catch (e) {
        stats.totalCommits = 'unknown';
      }
      
      // Get current diff stats (if any)
      try {
        const diffStat = execSync('git diff --stat', { encoding: 'utf8' });
        if (diffStat) {
          const match = diffStat.match(/(\d+) files? changed/);
          stats.modifiedFiles = match ? parseInt(match[1]) : 0;
        } else {
          stats.modifiedFiles = 0;
        }
      } catch (e) {
        stats.modifiedFiles = 'unknown';
      }
      
      return stats;
    } catch (error) {
      return { error: 'Could not fetch repository statistics' };
    }
  }

  saveCommand(command) {
    const commandFile = path.join(process.cwd(), 'CREATE_PR_COMMAND.txt');
    fs.writeFileSync(commandFile, command, 'utf8');
    return commandFile;
  }

  formatOutput(result, format = 'text') {
    if (format === 'json') {
      return JSON.stringify(result, null, 2);
    }
    
    let output = '\n🚀 GITHUB CLI PR CREATION COMMAND\n';
    output += '===================================\n\n';
    
    output += '📋 PR Configuration:\n';
    output += `  Repository: ${result.options.repo}\n`;
    output += `  Branch: ${result.options.headBranch} → ${result.options.baseBranch}\n`;
    output += `  Title: ${result.options.title}\n`;
    output += `  Draft: ${result.options.draft ? 'Yes' : 'No'}\n`;
    
    if (result.options.labels.length > 0) {
      output += `  Labels: ${result.options.labels.join(', ')}\n`;
    }
    
    if (result.options.reviewers.length > 0) {
      output += `  Reviewers: ${result.options.reviewers.join(', ')}\n`;
    }
    
    output += '\n🔧 COMMAND:\n';
    output += '===========\n';
    output += result.command + '\n\n';
    
    output += '💡 NEXT STEPS:\n';
    output += '==============\n';
    output += '1. Review the command above\n';
    output += '2. Ensure gh CLI is installed: https://cli.github.com/\n';
    output += '3. Authenticate: gh auth login\n';
    output += '4. Run the command to create PR\n';
    output += '5. Command also saved to: CREATE_PR_COMMAND.txt\n\n';
    
    return output;
  }
}

// CLI Interface
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
    const generator = new PRCreateCommand(options);
    const result = generator.generate();
    
    console.log(generator.formatOutput(result, options.format));
    
    if (options.format !== 'json') {
      console.log('✅ PR command generated successfully!\n');
    }
    
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
  main();
}

module.exports = PRCreateCommand;