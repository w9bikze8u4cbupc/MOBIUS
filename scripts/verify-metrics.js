#!/usr/bin/env node

/**
 * Simple verification script for the metrics functionality
 */

import http from 'http';
import { startMetricsServer } from '../src/render/metrics.js';
import { render } from '../src/render/index.js';

async function verifyMetrics() {
  console.log('Starting metrics verification...');
  
  // Start metrics server
  const server = startMetricsServer(9464);
  
  // Wait a moment for server to start
  await new Promise(resolve => setTimeout(resolve, 1000));
  
  // Run a simple render to generate some metrics
  console.log('Running a simple render to generate metrics...');
  
  const job = {
    images: ['test1.jpg', 'test2.jpg'],
    audioFile: 'test.mp3',
    outputDir: './out'
  };
  
  const options = {
    dryRun: true,
    sessionId: 'verify-session',
    jobId: 'verify-job'
  };
  
  try {
    await render(job, options);
    console.log('Render completed successfully');
  } catch (error) {
    console.error('Render failed:', error.message);
  }
  
  // Check metrics endpoint
  console.log('Checking metrics endpoint...');
  
  return new Promise((resolve, reject) => {
    const req = http.get('http://localhost:9464/metrics', (res) => {
      let data = '';
      res.on('data', (chunk) => {
        data += chunk;
      });
      
      res.on('end', () => {
        console.log('Metrics response status:', res.statusCode);
        
        // Check for our custom metrics
        if (data.includes('mobius_render_started_total')) {
          console.log('✓ mobius_render_started_total metric found');
        } else {
          console.log('✗ mobius_render_started_total metric not found');
        }
        
        if (data.includes('mobius_render_completed_total')) {
          console.log('✓ mobius_render_completed_total metric found');
        } else {
          console.log('✗ mobius_render_completed_total metric not found');
        }
        
        if (data.includes('mobius_render_failed_total')) {
          console.log('✓ mobius_render_failed_total metric found');
        } else {
          console.log('✗ mobius_render_failed_total metric not found');
        }
        
        // Close server
        server.close(() => {
          console.log('Metrics server stopped');
          resolve();
        });
      });
    });
    
    req.on('error', (error) => {
      console.error('Error checking metrics endpoint:', error.message);
      server.close(() => {
        resolve();
      });
    });
  });
}

// Run verification
verifyMetrics().catch(console.error);