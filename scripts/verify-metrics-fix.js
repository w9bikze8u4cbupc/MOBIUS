#!/usr/bin/env node

/**
 * Verification script for the metrics fix
 */

import http from 'http';
import { startMetricsServer } from '../src/render/metrics.js';

async function verifyMetricsFix() {
  console.log('Starting metrics verification...');
  
  // Start metrics server
  const server = startMetricsServer(9464);
  
  // Wait a moment for server to start
  await new Promise(resolve => setTimeout(resolve, 1000));
  
  // Import the metrics and test labeling
  const { renderFailed, renderTimeout } = await import('../src/render/metrics.js');
  
  // Test incrementing counters with labels
  console.log('Testing labeled metrics...');
  renderFailed.inc({ reason: 'test_failure' });
  renderTimeout.inc({ reason: 'test_timeout' });
  
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
        
        // Check for our custom metrics with labels
        if (data.includes('mobius_render_failed_total{reason="test_failure"} 1')) {
          console.log('✓ mobius_render_failed_total with label found');
        } else {
          console.log('✗ mobius_render_failed_total with label not found');
          console.log('Looking for: mobius_render_failed_total{reason="test_failure"} 1');
        }
        
        if (data.includes('mobius_render_timeout_total{reason="test_timeout"} 1')) {
          console.log('✓ mobius_render_timeout_total with label found');
        } else {
          console.log('✗ mobius_render_timeout_total with label not found');
          console.log('Looking for: mobius_render_timeout_total{reason="test_timeout"} 1');
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
verifyMetricsFix().catch(console.error);