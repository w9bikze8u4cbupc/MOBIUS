/**
 * Robust verification script for desktop shortcuts
 * This script checks if the desktop shortcuts for Mobius Tutorial Generator are working correctly
 * Handles both standard Desktop and OneDrive Desktop paths
 */

// add near the top of file (ESM __dirname helpers)
import { fileURLToPath } from 'url';
import { dirname } from 'path';
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

import { spawnSync } from 'child_process';
import fs from 'fs';
import path from 'path';
import os from 'os';
import { promisify } from 'util';
import { exec } from 'child_process';
const execPromise = promisify(exec);

// Guard against import-time side effects in tests
const runningUnderTest = process.env.NODE_ENV === 'test' || !!process.env.JEST_WORKER_ID;

// Skip execution in CI environments when not explicitly requested
// This prevents test failures while still allowing normal usage
if (!runningUnderTest && process.env.CI && process.env.GITHUB_ACTIONS && !process.env.FORCE_DESKTOP_SHORTCUT_RUN) {
  console.log('SKIP: desktop shortcut verification in CI');
  process.exit(0);
}

function existsSync(p) {
  try { return fs.existsSync(p); } catch { return false; }
}

function windowsVerifyFromOutput(stdout) {
  if (!stdout) return null;
  // Parse the created path from PowerShell output (optionally quoted)
  const m = stdout.match(/Created:\s*("?)(.+?)\1\s*$/m);
  if (m) {
    const p = m[2].trim();
    if (existsSync(p)) return p;
  }
  return null;
}

function candidatesForDesktop() {
  const home = os.homedir();
  const cands = [];
  cands.push(path.join(home, 'Desktop'));
  if (process.env.OneDrive) cands.push(path.join(process.env.OneDrive, 'Desktop'));
  if (process.env.OneDriveCommercial) cands.push(path.join(process.env.OneDriveCommercial, 'Desktop'));
  if (process.env.OneDriveConsumer) cands.push(path.join(process.env.OneDriveConsumer, 'Desktop'));
  if (process.env.USERPROFILE) cands.push(path.join(process.env.USERPROFILE, 'Desktop'));
  if (process.env.PUBLIC) cands.push(path.join(process.env.PUBLIC, 'Desktop')); // Public desktop
  // uniq and return
  return [...new Set(cands)];
}

function checkWindowsShortcut() {
  try {
    console.log('Checking Windows shortcut...');
    
    // First, try to parse path from PowerShell output if available
    const envOutput = process.env.MOBIUS_DESKTOP_CREATOR_OUTPUT || '';
    const parsed = windowsVerifyFromOutput(envOutput);
    if (parsed) {
      console.log('✅ Windows shortcut found:', parsed, '- found via created output');
      return true;
    }
    
    // Check candidate desktop folders for the expected filename
    const filename = 'Mobius Tutorial Generator.lnk';
    for (const d of candidatesForDesktop()) {
      const p = path.join(d, filename);
      if (existsSync(p)) {
        console.log('✅ Windows shortcut found:', p, '- found in', d);
        return true;
      }
    }
    
    console.log('❌ Windows shortcut not found in candidate Desktop locations');
    return false;
  } catch (error) {
    console.error('Error checking Windows shortcut:', error.message);
    return false;
  }
}

function checkMacShortcut() {
  try {
    console.log('Checking macOS shortcut...');
    
    const desktopPath = path.join(os.homedir(), 'Desktop');
    const shortcutPath = path.join(desktopPath, 'Mobius Tutorial Generator.webloc');
    
    if (fs.existsSync(shortcutPath)) {
      console.log('✅ macOS shortcut found:', shortcutPath);
      return true;
    } else {
      console.log('❌ macOS shortcut not found');
      return false;
    }
  } catch (error) {
    console.error('Error checking macOS shortcut:', error.message);
    return false;
  }
}

async function checkLinuxShortcut() {
  try {
    console.log('Checking Linux shortcut...');
    
    // Linux: use xdg-user-dir DESKTOP + fallback
    const candidates = [];
    try {
      const { stdout: xdgOut } = await execPromise('xdg-user-dir DESKTOP');
      const xdg = (xdgOut || '').trim();
      if (xdg && xdg !== '$HOME/Desktop') candidates.push(xdg);
    } catch (e) { /* ignore if xdg-user-dir not present */ }
    candidates.push(path.join(os.homedir(), 'Desktop'));
    const shortcutName = 'Mobius Tutorial Generator.desktop';
    const shortcutPath = candidates.map(d => path.join(d, shortcutName)).find(p => fs.existsSync(p));
    if (shortcutPath) {
      console.log('✅ Linux shortcut found:', shortcutPath);
      return true;
    } else {
      console.log('❌ Linux shortcut not found');
      return false;
    }
  } catch (error) {
    console.error('Error checking Linux shortcut:', error.message);
    return false;
  }
}

async function runVerification() {
  console.log('Verifying desktop shortcuts for Mobius Tutorial Generator...\n');
  
  let found = false;
  const platform = os.platform();
  
  if (platform === 'win32') {
    found = checkWindowsShortcut();
  } else if (platform === 'darwin') {
    found = checkMacShortcut();
  } else if (platform === 'linux') {
    found = await checkLinuxShortcut();
  } else {
    console.log('Unsupported platform:', platform);
    // Try all platforms
    found = checkWindowsShortcut() || checkMacShortcut() || await checkLinuxShortcut();
  }
  
  console.log('\n--- Verification Results ---');
  if (found) {
    console.log('✅ Desktop shortcut verification PASSED');
    console.log('You can double-click the shortcut on your desktop to launch the Mobius Tutorial Generator');
  } else {
    console.log('❌ Desktop shortcut verification FAILED');
    console.log('Please run the appropriate create-desktop-shortcut script for your platform');
  }
  
  return found;
}

// Export main function to prevent import-time side effects
export async function main() {
  return runVerification();
}

// Guard top-level execution
if (!runningUnderTest && (!process.env.CI || !process.env.GITHUB_ACTIONS || process.env.FORCE_DESKTOP_SHORTCUT_RUN)) {
  main().then(result => {
    process.exit(result ? 0 : 1);
  }).catch(error => {
    console.error('Unexpected error:', error);
    process.exit(1);
  });
}