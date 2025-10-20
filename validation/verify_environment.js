// Simple script to verify that the backend and frontend can start correctly
import { spawn } from 'child_process';
import fs from 'fs';
import path from 'path';

console.log('Mobius Tutorial Generator - Environment Verification');
console.log('==================================================');

// Check if required environment files exist
const requiredFiles = ['.env', 'client/.env'];
const missingFiles = [];

for (const file of requiredFiles) {
    if (!fs.existsSync(file)) {
        missingFiles.push(file);
        console.log(`❌ Missing required file: ${file}`);
    } else {
        console.log(`✅ Found required file: ${file}`);
    }
}

if (missingFiles.length > 0) {
    console.log(`\n⚠️  Warning: ${missingFiles.length} required files are missing. Please create them before proceeding.`);
}

// Check if required ports are available
console.log('\nChecking port availability...');
const { spawn: spawnSync } = await import('child_process');

// Function to check if a port is in use
function checkPort(port) {
    return new Promise((resolve) => {
        const command = process.platform === 'win32' 
            ? `netstat -an | findstr :${port}` 
            : `lsof -i :${port}`;
        
        const child = spawnSync(command, { shell: true });
        
        child.stdout.on('data', (data) => {
            const output = data.toString();
            if (output.includes(port.toString())) {
                resolve(true); // Port is in use
            } else {
                resolve(false); // Port is free
            }
        });
        
        child.stderr.on('data', () => {
            resolve(false); // Error occurred, assume port is free
        });
        
        child.on('close', () => {
            resolve(false); // Process closed, assume port is free
        });
    });
}

// Check ports 5001 (backend) and 3000 (frontend)
async function checkPorts() {
    const backendPort = 5001;
    const frontendPort = 3000;
    
    const backendInUse = await checkPort(backendPort);
    const frontendInUse = await checkPort(frontendPort);
    
    console.log(`Port ${backendPort} (Backend): ${backendInUse ? 'In Use' : 'Free'}`);
    console.log(`Port ${frontendPort} (Frontend): ${frontendInUse ? 'In Use' : 'Free'}`);
    
    return { backendInUse, frontendInUse };
}

// Check if required executables are available
console.log('\nChecking required executables...');
const requiredExecutables = ['node', 'npm'];

function checkExecutable(executable) {
    return new Promise((resolve) => {
        const command = process.platform === 'win32' 
            ? `where ${executable}` 
            : `which ${executable}`;
        
        const child = spawnSync(command, { shell: true });
        
        child.stdout.on('data', () => {
            resolve(true); // Executable found
        });
        
        child.stderr.on('data', () => {
            resolve(false); // Executable not found
        });
        
        child.on('close', () => {
            resolve(false); // Process closed, executable not found
        });
    });
}

async function checkExecutables() {
    const results = {};
    
    for (const executable of requiredExecutables) {
        const found = await checkExecutable(executable);
        results[executable] = found;
        console.log(`${executable}: ${found ? 'Found' : 'Not Found'}`);
    }
    
    // Check for ffmpeg (either system or via ffmpeg-static)
    try {
        const ffmpegStaticPath = await import('ffmpeg-static');
        if (ffmpegStaticPath.default) {
            results['ffmpeg'] = true;
            console.log(`ffmpeg: Found (via ffmpeg-static at ${ffmpegStaticPath.default})`);
        } else {
            results['ffmpeg'] = false;
            console.log('ffmpeg: Not Found');
        }
    } catch (err) {
        // Try to find system ffmpeg
        const found = await checkExecutable('ffmpeg');
        results['ffmpeg'] = found;
        console.log(`ffmpeg: ${found ? 'Found' : 'Not Found'}`);
    }
    
    return results;
}

// Main verification function
async function verifyEnvironment() {
    console.log('\nStarting environment verification...\n');
    
    // Check ports
    const portStatus = await checkPorts();
    
    // Check executables
    const executableStatus = await checkExecutables();
    
    // Summary
    console.log('\n=== Verification Summary ===');
    
    const allExecutablesFound = Object.values(executableStatus).every(status => status);
    
    if (allExecutablesFound) {
        console.log('✅ All required executables are available');
    } else {
        console.log('❌ Some required executables are missing');
    }
    
    if (!portStatus.backendInUse && !portStatus.frontendInUse) {
        console.log('✅ Required ports are free');
    } else {
        console.log('⚠️  Some required ports are in use');
    }
    
    console.log('\nEnvironment verification complete.');
    console.log('Next steps:');
    console.log('1. Start the backend server: npm run server');
    console.log('2. Start the frontend server: npm run ui');
    console.log('3. Verify both servers are running on their respective ports');
}

// Run verification
verifyEnvironment().catch(console.error);