#!/usr/bin/env node

/**
 * Check if lychee is available in PATH and provide OS-specific installation guidance
 */

import { execSync } from 'child_process';
import { platform } from 'os';

function checkLychee() {
  try {
    execSync('lychee --version', { stdio: 'pipe' });
    console.log('✅ lychee is available');
    return true;
  } catch (error) {
    console.error('❌ lychee is not installed or not in PATH');
    console.error('');
    console.error('Please install lychee using your platform package manager:');
    console.error('');
    
    const os = platform();
    switch (os) {
      case 'win32':
        console.error('Windows:');
        console.error('  winget install lycheeverse.lychee');
        console.error('  # OR');
        console.error('  choco install lychee');
        console.error('  # OR download from: https://github.com/lycheeverse/lychee/releases');
        break;
      case 'darwin':
        console.error('macOS:');
        console.error('  brew install lychee');
        break;
      case 'linux':
        console.error('Linux:');
        console.error('  # Ubuntu/Debian:');
        console.error('  sudo apt install lychee');
        console.error('  # OR download from: https://github.com/lycheeverse/lychee/releases');
        break;
      default:
        console.error('Please visit: https://github.com/lycheeverse/lychee#installation');
    }
    
    console.error('');
    console.error('After installation, restart your terminal and try again.');
    return false;
  }
}

if (!checkLychee()) {
  process.exit(1);
}