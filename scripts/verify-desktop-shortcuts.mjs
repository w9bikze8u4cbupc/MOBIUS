/**
 * Robust verification script for desktop shortcuts
 * This script checks if the desktop shortcuts for Mobius Tutorial Generator are working correctly
 * Handles both standard Desktop and OneDrive Desktop paths
 */

import { spawnSync } from 'child_process';
import fs from 'fs';
import path from 'path';
import os from 'os';

function existsSync(p) {
  try { return fs.existsSync(p); } catch { return false; }
}

function windowsVerifyFromOutput(stdout) {
  if (!stdout) return null;
  const m = stdout.match(/Created:\s*(.+)$/m);
  if (m) {
    const p = m[1].trim();
    if (existsSync(p)) return p;
  }
  return null;
}

function candidatesForDesktop() {
  const home = os.homedir();
  const cands = [];
  cands.push(path.join(home, 'Desktop'));
  // handle common OneDrive location via env OneDrive
  if (process.env.OneDrive) cands.push(path.join(process.env.OneDrive, 'Desktop'));
  // also userprofile Desktop
  if (process.env.USERPROFILE) cands.push(path.join(process.env.USERPROFILE, 'Desktop'));
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

function checkLinuxShortcut() {
  try {
    console.log('Checking Linux shortcut...');
    
    const desktopPath = path.join(os.homedir(), 'Desktop');
    const shortcutPath = path.join(desktopPath, 'Mobius Tutorial Generator.desktop');
    
    if (fs.existsSync(shortcutPath)) {
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

function runVerification() {
  console.log('Verifying desktop shortcuts for Mobius Tutorial Generator...\n');
  
  let found = false;
  const platform = os.platform();
  
  if (platform === 'win32') {
    found = checkWindowsShortcut();
  } else if (platform === 'darwin') {
    found = checkMacShortcut();
  } else if (platform === 'linux') {
    found = checkLinuxShortcut();
  } else {
    console.log('Unsupported platform:', platform);
    // Try all platforms
    found = checkWindowsShortcut() || checkMacShortcut() || checkLinuxShortcut();
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

// Run the verification
const result = runVerification();
process.exit(result ? 0 : 1);