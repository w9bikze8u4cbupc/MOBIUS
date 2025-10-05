#!/usr/bin/env node

/**
 * MOBIUS Verification Orchestrator
 * Cross-platform verification script using Node.js
 */

import { spawn, exec } from 'child_process';
import { promisify } from 'util';
import http from 'http';
import fs from 'fs';
import path from 'path';

const execPromise = promisify(exec);

const BACKEND_PORT = 5001;
const FRONTEND_PORT = 3000;
const ROOT_DIR = process.cwd();
const CLIENT_DIR = path.join(ROOT_DIR, 'client');

console.log('🚀 MOBIUS Verification Orchestrator');
console.log('====================================');

// Function to check if a service is responding
function checkService(port, path = '') {
  return new Promise((resolve) => {
    const req = http.get(`http://localhost:${port}${path}`, (res) => {
      resolve(res.statusCode === 200);
    });
    req.on('error', () => resolve(false));
    req.end();
  });
}

// Function to wait for a service to be ready
async function waitForService(port, path = '', timeout = 60000) {
  const startTime = Date.now();
  while (Date.now() - startTime < timeout) {
    if (await checkService(port, path)) {
      return true;
    }
    await new Promise(resolve => setTimeout(resolve, 1000));
  }
  return false;
}

// Function to kill processes on specific ports (cross-platform)
async function killPortProcesses() {
  console.log('🧹 Killing processes on ports 5001 and 3000...');
  
  if (process.platform === 'win32') {
    // Windows
    try {
      await execPromise('powershell -Command "Get-NetTCPConnection -LocalPort 5001 -ErrorAction SilentlyContinue | ForEach-Object { Stop-Process -Id $_.OwningProcess -Force -ErrorAction SilentlyContinue }"');
      await execPromise('powershell -Command "Get-NetTCPConnection -LocalPort 3000 -ErrorAction SilentlyContinue | ForEach-Object { Stop-Process -Id $_.OwningProcess -Force -ErrorAction SilentlyContinue }"');
      console.log('✅ Port cleanup complete (Windows)');
    } catch (error) {
      console.log('⚠️  Port cleanup warning (Windows):', error.message);
    }
  } else {
    // Unix-like systems
    try {
      await execPromise('lsof -ti :5001 | xargs kill -9 2>/dev/null || true');
      await execPromise('lsof -ti :3000 | xargs kill -9 2>/dev/null || true');
      console.log('✅ Port cleanup complete (Unix)');
    } catch (error) {
      console.log('⚠️  Port cleanup warning (Unix):', error.message);
    }
  }
}

// Start services
async function startServices() {
  console.log('🔄 Starting backend and frontend services...');
  
  // Kill any existing processes first
  await killPortProcesses();
  
  // Small delay to ensure ports are freed
  await new Promise(resolve => setTimeout(resolve, 2000));
  
  // Start backend
  const backend = spawn('npm', ['run', 'server'], { 
    shell: true,
    cwd: ROOT_DIR
  });
  
  // Start frontend
  const frontend = spawn('npm', ['run', 'client'], { 
    shell: true,
    cwd: ROOT_DIR
  });

  // Monitor backend output
  backend.stdout.on('data', (data) => {
    fs.appendFileSync(path.join(process.env.TEMP || '/tmp', 'mobius-backend.log'), data.toString());
  });

  backend.stderr.on('data', (data) => {
    fs.appendFileSync(path.join(process.env.TEMP || '/tmp', 'mobius-backend.log'), data.toString());
  });

  // Monitor frontend output
  frontend.stdout.on('data', (data) => {
    fs.appendFileSync(path.join(process.env.TEMP || '/tmp', 'mobius-frontend.log'), data.toString());
  });

  frontend.stderr.on('data', (data) => {
    fs.appendFileSync(path.join(process.env.TEMP || '/tmp', 'mobius-frontend.log'), data.toString());
  });

  return { backend, frontend };
}

// Main verification logic
async function runVerification() {
  let backend, frontend;
  
  try {
    // Start services
    const services = await startServices();
    backend = services.backend;
    frontend = services.frontend;
    
    // Wait for services to be ready
    console.log('\n⏳ Waiting for services to start...');
    
    // Wait for backend health check
    console.log('   Waiting for backend health endpoint...');
    const backendHealthy = await waitForService(BACKEND_PORT, '/healthz');
    if (!backendHealthy) {
      console.error('❌ Backend failed to start or respond to health check');
      throw new Error('Backend not healthy');
    }
    console.log('✅ Backend health check passed');
    
    // Wait for frontend to be ready
    console.log('   Waiting for frontend to respond...');
    const frontendReady = await waitForService(FRONTEND_PORT);
    if (!frontendReady) {
      console.error('❌ Frontend failed to start');
      throw new Error('Frontend not ready');
    }
    console.log('✅ Frontend is responding');
    
    // Small delay to ensure everything is fully loaded
    await new Promise(resolve => setTimeout(resolve, 5000));
    
    // Run smoke test
    console.log('\n🧪 Running smoke tests...');
    const { stdout, stderr } = await execPromise('npm run test:smoke', { 
      cwd: ROOT_DIR,
      timeout: 60000
    });
    
    console.log(stdout);
    if (stderr) {
      console.error(stderr);
    }
    
    console.log('\n🎉 All verification tests passed!');
    
  } catch (error) {
    console.error('❌ Verification failed:', error.message);
    process.exit(1);
  } finally {
    // Clean up processes
    console.log('\n🧹 Cleaning up processes...');
    if (backend && backend.pid) {
      try {
        process.kill(backend.pid, 'SIGTERM');
      } catch (e) {
        // Process might already be dead
      }
    }
    
    if (frontend && frontend.pid) {
      try {
        process.kill(frontend.pid, 'SIGTERM');
      } catch (e) {
        // Process might already be dead
      }
    }
  }
}

// Run verification
runVerification();