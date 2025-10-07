/**
 * Cross-platform desktop shortcut creation script
 * This script creates desktop shortcuts for the Mobius Tutorial Generator
 */

import { exec } from 'child_process';
import { promisify } from 'util';
import fs from 'fs';
import path from 'path';
import os from 'os';

const execPromise = promisify(exec);

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

async function createWindowsShortcut() {
  try {
    console.log('Creating Windows shortcut...');
    
    // Run the PowerShell script
    const { stdout, stderr } = await execPromise(
      'powershell -ExecutionPolicy Bypass -File ./scripts/create-desktop-shortcut.ps1 -Name "Mobius Tutorial Generator" -Url "http://localhost:3000"'
    );
    
    console.log('PowerShell script output:', stdout);
    if (stderr) console.error('PowerShell script errors:', stderr);
    
    // Parse the created path from PowerShell output
    const createdPathMatch = stdout.match(/Created:\s*(.+)$/m);
    if (createdPathMatch) {
      const createdPath = createdPathMatch[1].trim();
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
    
    // Make the script executable
    await execPromise('chmod +x ./scripts/create-desktop-shortcut-mac.sh');
    
    // Run the script
    const { stdout, stderr } = await execPromise(
      './scripts/create-desktop-shortcut-mac.sh "Mobius Tutorial Generator" "http://localhost:3000"'
    );
    
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
    
    // Make the script executable
    await execPromise('chmod +x ./scripts/create-desktop-shortcut-linux.sh');
    
    // Run the script
    const { stdout, stderr } = await execPromise(
      './scripts/create-desktop-shortcut-linux.sh "Mobius Tutorial Generator" "http://localhost:3000"'
    );
    
    console.log('Bash script output:', stdout);
    if (stderr) console.error('Bash script errors:', stderr);
    
    // Check if the shortcut was created
    const desktopPath = path.join(os.homedir(), 'Desktop');
    const shortcutPath = path.join(desktopPath, 'Mobius Tutorial Generator.desktop');
    
    if (fs.existsSync(shortcutPath)) {
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

// Run the script
createDesktopShortcut().then(success => {
  process.exit(success ? 0 : 1);
});