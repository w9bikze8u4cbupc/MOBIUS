/**
 * Cross-platform desktop shortcut creation script
 * This script creates desktop shortcuts for the Mobius Tutorial Generator
 */

// add near the top of file (ESM __dirname helpers)
import { fileURLToPath } from 'url';
import { dirname } from 'path';
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

import { exec } from 'child_process';
import { promisify } from 'util';
import fs from 'fs';
import path from 'path';
import os from 'os';

const execPromise = promisify(exec);

// Guard against import-time side effects in tests
const runningUnderTest = process.env.NODE_ENV === 'test' || !!process.env.JEST_WORKER_ID;

// Skip execution in CI environments when not explicitly requested
// This prevents test failures while still allowing normal usage
if (!runningUnderTest && process.env.CI && process.env.GITHUB_ACTIONS && !process.env.FORCE_DESKTOP_SHORTCUT_RUN) {
  console.log('SKIP: desktop shortcut creation in CI');
  process.exit(0);
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

async function createWindowsShortcut() {
  try {
    console.log('Creating Windows shortcut...');
    
    // Run the PowerShell script with absolute path
    const winScript = path.resolve(__dirname, 'create-desktop-shortcut.ps1');
    const cmd = `powershell -NoProfile -NonInteractive -ExecutionPolicy Bypass -File "${winScript}" -Name "Mobius Tutorial Generator" -Url "http://localhost:3000"`;
    const { stdout, stderr } = await execPromise(cmd);
    
    console.log('PowerShell script output:', stdout);
    if (stderr) console.error('PowerShell script errors:', stderr);
    
    // Parse the created path from PowerShell output (optionally quoted)
    const createdPathMatch = stdout.match(/Created:\s*("?)(.+?)\1\s*$/m);
    if (createdPathMatch) {
      const createdPath = createdPathMatch[2].trim();
      if (fs.existsSync(createdPath)) {
        console.log('✅ Windows shortcut created successfully at:', createdPath);
        return true;
      }
    }
    
    // Fallback: check candidate desktop folders for the expected filename
    const filename = 'Mobius Tutorial Generator.lnk';
    for (const d of candidatesForDesktop()) {
      const p = path.join(d, filename);
      if (fs.existsSync(p)) {
        console.log('✅ Windows shortcut created successfully at:', p);
        return true;
      }
    }
    
    console.log('❌ Windows shortcut was not created');
    return false;
  } catch (error) {
    console.error('Error creating Windows shortcut:', error.message);
    return false;
  }
}

async function createMacShortcut() {
  try {
    console.log('Creating macOS shortcut...');
    
    // Run the script with absolute path
    const macScript = path.resolve(__dirname, 'create-desktop-shortcut-mac.sh');
    await execPromise(`chmod +x "${macScript}"`);
    const { stdout, stderr } = await execPromise(`"${macScript}" "Mobius Tutorial Generator" "http://localhost:3000"`);
    
    console.log('Bash script output:', stdout);
    if (stderr) console.error('Bash script errors:', stderr);
    
    // Check if the shortcut was created
    const desktopPath = path.join(os.homedir(), 'Desktop');
    const shortcutPath = path.join(desktopPath, 'Mobius Tutorial Generator.webloc');
    
    if (fs.existsSync(shortcutPath)) {
      console.log('✅ macOS shortcut created successfully at:', shortcutPath);
      return true;
    } else {
      console.log('❌ macOS shortcut was not created');
      return false;
    }
  } catch (error) {
    console.error('Error creating macOS shortcut:', error.message);
    return false;
  }
}

async function createLinuxShortcut() {
  try {
    console.log('Creating Linux shortcut...');
    
    // Run the script with absolute path
    const linuxScript = path.resolve(__dirname, 'create-desktop-shortcut-linux.sh');
    await execPromise(`chmod +x "${linuxScript}"`);
    const { stdout, stderr } = await execPromise(`"${linuxScript}" "Mobius Tutorial Generator" "http://localhost:3000"`);
    
    console.log('Bash script output:', stdout);
    if (stderr) console.error('Bash script errors:', stderr);
    
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
      console.log('✅ Linux shortcut created successfully at:', shortcutPath);
      return true;
    } else {
      console.log('❌ Linux shortcut was not created');
      return false;
    }
  } catch (error) {
    console.error('Error creating Linux shortcut:', error.message);
    return false;
  }
}

async function createDesktopShortcut() {
  console.log('Creating desktop shortcut for Mobius Tutorial Generator...\n');
  
  const platform = os.platform();
  let success = false;
  
  switch (platform) {
    case 'win32':
      success = await createWindowsShortcut();
      break;
    case 'darwin':
      success = await createMacShortcut();
      break;
    case 'linux':
      success = await createLinuxShortcut();
      break;
    default:
      console.log('Unsupported platform:', platform);
      console.log('Please run the appropriate platform-specific script manually.');
      return false;
  }
  
  console.log('\n--- Result ---');
  if (success) {
    console.log('🎉 Desktop shortcut created successfully!');
    console.log('You can now double-click the shortcut on your desktop to launch the Mobius Tutorial Generator.');
  } else {
    console.log('❌ Failed to create desktop shortcut');
    console.log('Please check the error messages above and try again.');
  }
  
  return success;
}

// Export main function to prevent import-time side effects
export async function main() {
  return createDesktopShortcut();
}

// Guard top-level execution
if (!runningUnderTest && (!process.env.CI || !process.env.GITHUB_ACTIONS || process.env.FORCE_DESKTOP_SHORTCUT_RUN)) {
  main().then(success => {
    process.exit(success ? 0 : 1);
  }).catch(error => {
    console.error('Unexpected error:', error);
    process.exit(1);
  });
}