// Quick status check script for the Mobius Tutorial Generator validation environment
import fs from 'fs';
import path from 'path';
import { spawn } from 'child_process';

console.log('Mobius Tutorial Generator - Validation Environment Status Check');
console.log('================================================================');

// Check if required files exist
console.log('\n1. Checking required files...');
const requiredFiles = [
    '.env',
    'client/.env',
    'validation/Mobius_Tutorial_Generator_Simple_End_to_End_Checklist.md',
    'validation/Local_End_to_End_Validation_Plan.md',
    'validation/validation_execution_tracker.md'
];

let allFilesPresent = true;
for (const file of requiredFiles) {
    if (fs.existsSync(file)) {
        console.log(`✅ ${file}`);
    } else {
        console.log(`❌ ${file}`);
        allFilesPresent = false;
    }
}

// Check if required directories exist
console.log('\n2. Checking required directories...');
const requiredDirs = [
    'validation/batch1',
    'validation/batch2',
    'validation/batch3',
    'validation/batch4',
    'validation/batch5'
];

let allDirsPresent = true;
for (const dir of requiredDirs) {
    if (fs.existsSync(dir)) {
        console.log(`✅ ${dir}`);
    } else {
        console.log(`❌ ${dir}`);
        allDirsPresent = false;
    }
}

// Check if servers are running
console.log('\n3. Checking server status...');

function checkPort(port) {
    return new Promise((resolve) => {
        const command = process.platform === 'win32' 
            ? `netstat -an | findstr :${port}` 
            : `lsof -i :${port}`;
        
        const child = spawn(command, { shell: true });
        
        let output = '';
        child.stdout.on('data', (data) => {
            output += data.toString();
        });
        
        child.on('close', () => {
            resolve(output.includes(port.toString()));
        });
    });
}

async function checkServers() {
    const backendRunning = await checkPort(5001);
    const frontendRunning = await checkPort(3000);
    
    console.log(`Backend Server (5001): ${backendRunning ? '✅ Running' : '❌ Not Running'}`);
    console.log(`Frontend Server (3000): ${frontendRunning ? '✅ Running' : '❌ Not Running'}`);
    
    return { backendRunning, frontendRunning };
}

// Check health endpoint
console.log('\n4. Checking health endpoint...');

async function checkHealth() {
    try {
        const response = await fetch('http://localhost:5001/health');
        const status = response.status;
        console.log(`Health Endpoint: ${status === 200 ? '✅ Accessible' : `❌ Status ${status}`}`);
        return status === 200;
    } catch (error) {
        console.log(`Health Endpoint: ❌ Not Accessible (${error.message})`);
        return false;
    }
}

// Main status check function
async function checkStatus() {
    console.log(`\n=== Status Summary ===`);
    
    const filesStatus = allFilesPresent ? '✅ All required files present' : '❌ Some required files missing';
    const dirsStatus = allDirsPresent ? '✅ All required directories present' : '❌ Some required directories missing';
    
    console.log(filesStatus);
    console.log(dirsStatus);
    
    const { backendRunning, frontendRunning } = await checkServers();
    const healthOk = await checkHealth();
    
    const serversStatus = (backendRunning && frontendRunning) ? '✅ All servers running' : '❌ Some servers not running';
    const healthStatus = healthOk ? '✅ Health endpoint accessible' : '❌ Health endpoint not accessible';
    
    console.log(serversStatus);
    console.log(healthStatus);
    
    const overallReady = allFilesPresent && allDirsPresent && backendRunning && frontendRunning && healthOk;
    
    console.log(`\nOverall Status: ${overallReady ? '✅ READY FOR VALIDATION' : '⚠️  NOT READY FOR VALIDATION'}`);
    
    if (!overallReady) {
        console.log('\nNext Steps:');
        if (!allFilesPresent) console.log('- Create missing required files');
        if (!allDirsPresent) console.log('- Create missing required directories');
        if (!backendRunning) console.log('- Start backend server: npm run server');
        if (!frontendRunning) console.log('- Start frontend server: npm run ui');
        if (!healthOk) console.log('- Check backend server health endpoint');
    } else {
        console.log('\n✅ Environment is ready for validation!');
        console.log('Next step: Begin Batch 1 execution (Sections A & B)');
    }
}

// Run the status check
checkStatus().catch(console.error);