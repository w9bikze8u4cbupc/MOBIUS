#!/usr/bin/env node

const { execSync, spawn } = require('child_process');
const fs = require('fs');
const path = require('path');
const os = require('os');

// Simple CLI tool for deploying Mobius Preview Worker
const args = process.argv.slice(2);
const command = args[0];

function showHelp() {
    console.log(`
Mobius Preview Worker Deployment CLI
Usage: node mobius-deploy.js [command] [options]

Commands:
  build-push        Build and push Docker image
  update-manifests  Update Kubernetes manifests
  apply-manifests   Apply Kubernetes manifests
  deploy            Full deployment (build, update, apply)
  verify            Verify deployment status
  rollback          Rollback to previous deployment
  status            Show current deployment status
  logs              Show deployment logs
  help              Show this help message

Options:
  --platform        Specify platform (auto-detected by default)
                    Values: win, unix
  --namespace       Specify Kubernetes namespace (default: preview-worker)
  --image-tag       Specify Docker image tag
  --dry-run         Perform a dry run without making changes
`);
}

function detectPlatform() {
    const platform = os.platform();
    if (platform === 'win32') {
        return 'win';
    } else {
        return 'unix';
    }
}

function getScriptExtension(platform) {
    return platform === 'win' ? '.ps1' : '.sh';
}

function runScript(scriptName, platform, additionalArgs = []) {
    const ext = getScriptExtension(platform);
    const scriptPath = path.join(__dirname, '..', scriptName + ext);
    
    if (!fs.existsSync(scriptPath)) {
        console.error(`Error: Script ${scriptPath} not found`);
        process.exit(1);
    }
    
    console.log(`Running ${scriptName} on ${platform} platform...`);
    
    // Combine script path with additional arguments
    const fullArgs = [scriptPath, ...additionalArgs];
    
    if (platform === 'win') {
        // On Windows, use PowerShell
        const child = spawn('powershell.exe', ['-ExecutionPolicy', 'Bypass', '-File', ...fullArgs], {
            stdio: 'inherit'
        });
        
        child.on('close', (code) => {
            process.exit(code);
        });
    } else {
        // On Unix systems, make sure script is executable and run it
        try {
            execSync(`chmod +x "${scriptPath}"`, { stdio: 'inherit' });
        } catch (e) {
            // Ignore chmod errors on Windows
        }
        
        const child = spawn('bash', fullArgs, {
            stdio: 'inherit'
        });
        
        child.on('close', (code) => {
            process.exit(code);
        });
    }
}

function getKubernetesContext() {
    try {
        const namespace = getNamespace();
        const result = execSync(`kubectl config current-context`, { encoding: 'utf-8' });
        return result.trim();
    } catch (e) {
        return 'none';
    }
}

function getNamespace() {
    const namespaceIndex = args.indexOf('--namespace');
    if (namespaceIndex !== -1 && namespaceIndex + 1 < args.length) {
        return args[namespaceIndex + 1];
    }
    return 'preview-worker';
}

function getImageTag() {
    const tagIndex = args.indexOf('--image-tag');
    if (tagIndex !== -1 && tagIndex + 1 < args.length) {
        return args[tagIndex + 1];
    }
    return null;
}

function isDryRun() {
    return args.includes('--dry-run');
}

function showStatus() {
    const platform = detectPlatform();
    const namespace = getNamespace();
    
    console.log('=== Deployment Status ===');
    console.log(`Platform: ${platform}`);
    console.log(`Namespace: ${namespace}`);
    console.log(`Kubernetes Context: ${getKubernetesContext()}`);
    
    // Check if Docker is running
    try {
        execSync('docker version', { stdio: 'ignore' });
        console.log('Docker: Running');
    } catch (e) {
        console.log('Docker: Not running or not installed');
    }
    
    // Check if kubectl is available
    try {
        execSync('kubectl version --client', { stdio: 'ignore' });
        console.log('Kubectl: Available');
    } catch (e) {
        console.log('Kubectl: Not available');
    }
    
    // Check if namespace exists
    try {
        execSync(`kubectl get namespace ${namespace}`, { stdio: 'ignore' });
        console.log(`Namespace ${namespace}: Exists`);
        
        // Check deployments
        try {
            const deployments = execSync(`kubectl -n ${namespace} get deployments --no-headers`, { encoding: 'utf-8' });
            if (deployments.trim()) {
                console.log(`Deployments in ${namespace}:`);
                deployments.split('\n').filter(line => line.trim()).forEach(line => {
                    const name = line.split(' ')[0];
                    console.log(`  - ${name}`);
                });
            } else {
                console.log(`No deployments found in ${namespace}`);
            }
        } catch (e) {
            console.log(`Unable to list deployments in ${namespace}`);
        }
    } catch (e) {
        console.log(`Namespace ${namespace}: Does not exist`);
    }
}

function showLogs() {
    const namespace = getNamespace();
    const deployment = 'preview-worker';
    
    console.log(`Showing logs for ${deployment} in namespace ${namespace}...`);
    
    try {
        execSync(`kubectl -n ${namespace} logs deployment/${deployment} --tail=50`, { stdio: 'inherit' });
    } catch (e) {
        console.error('Failed to retrieve logs');
        process.exit(1);
    }
}

function rollback() {
    const namespace = getNamespace();
    const deployment = 'preview-worker';
    
    console.log(`Rolling back ${deployment} in namespace ${namespace}...`);
    
    try {
        execSync(`kubectl -n ${namespace} rollout undo deployment/${deployment}`, { stdio: 'inherit' });
        console.log('Rollback completed successfully');
    } catch (e) {
        console.error('Rollback failed');
        process.exit(1);
    }
}

function main() {
    if (!command || command === 'help') {
        showHelp();
        return;
    }
    
    // Detect platform unless specified
    let platform = args.includes('--platform') ? args[args.indexOf('--platform') + 1] : detectPlatform();
    
    // Collect additional arguments for scripts
    const additionalArgs = [];
    if (getImageTag()) {
        additionalArgs.push('--image-tag', getImageTag());
    }
    if (isDryRun()) {
        additionalArgs.push('--dry-run');
    }
    
    switch (command) {
        case 'build-push':
            runScript('build-and-push', platform, additionalArgs);
            break;
        case 'update-manifests':
            runScript('update-manifests', platform, additionalArgs);
            break;
        case 'apply-manifests':
            runScript('apply-manifests', platform, additionalArgs);
            break;
        case 'deploy':
            runScript('deploy-preview-worker', platform, additionalArgs);
            break;
        case 'verify':
            runScript('verify-deployment', platform, additionalArgs);
            break;
        case 'status':
            showStatus();
            break;
        case 'logs':
            showLogs();
            break;
        case 'rollback':
            rollback();
            break;
        default:
            console.error(`Unknown command: ${command}`);
            showHelp();
            process.exit(1);
    }
}

main();