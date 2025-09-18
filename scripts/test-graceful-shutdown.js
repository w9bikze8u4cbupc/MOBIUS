#!/usr/bin/env node

// Script to test graceful shutdown functionality

import { spawn } from 'child_process';
import axios from 'axios';

async function testGracefulShutdown() {
  console.log('Testing graceful shutdown functionality...');
  
  // Start the server in the background
  const serverProcess = spawn('node', ['start-server.js'], {
    stdio: 'pipe',
    env: { ...process.env, PORT: '5002' }
  });
  
  let serverStarted = false;
  
  // Wait for server to start
  serverProcess.stdout.on('data', (data) => {
    const output = data.toString();
    console.log(`[Server] ${output}`);
    
    if (output.includes('Starting server on')) {
      serverStarted = true;
    }
  });
  
  serverProcess.stderr.on('data', (data) => {
    console.error(`[Server Error] ${data}`);
  });
  
  // Wait for server to be ready
  await new Promise((resolve) => {
    const checkServer = setInterval(async () => {
      if (serverStarted) {
        clearInterval(checkServer);
        resolve();
        return;
      }
      
      try {
        await axios.get('http://localhost:5002/api/health');
        serverStarted = true;
        clearInterval(checkServer);
        resolve();
      } catch (error) {
        // Server not ready yet, continue waiting
      }
    }, 1000);
  });
  
  console.log('✅ Server started successfully');
  
  // Send SIGTERM signal to test graceful shutdown
  console.log('Sending SIGTERM signal...');
  serverProcess.kill('SIGTERM');
  
  // Wait for server to shut down gracefully
  const shutdownResult = await new Promise((resolve) => {
    const shutdownTimeout = setTimeout(() => {
      console.log('❌ Server did not shut down within 15 seconds');
      serverProcess.kill('SIGKILL'); // Force kill if needed
      resolve(false);
    }, 15000);
    
    serverProcess.on('exit', (code) => {
      clearTimeout(shutdownTimeout);
      if (code === 0) {
        console.log('✅ Server shut down gracefully');
        resolve(true);
      } else {
        console.log(`❌ Server exited with code ${code}`);
        resolve(false);
      }
    });
  });
  
  return shutdownResult;
}

async function main() {
  console.log('Testing graceful shutdown...\n');
  
  const result = await testGracefulShutdown();
  
  console.log('\n' + '='.repeat(50));
  if (result) {
    console.log('🎉 Graceful shutdown is working correctly!');
  } else {
    console.log('❌ Graceful shutdown is not working correctly.');
    process.exit(1);
  }
}

// Run the test
main().catch(error => {
  console.error('Error during graceful shutdown test:', error);
  process.exit(1);
});