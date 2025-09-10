#!/usr/bin/env node

console.log('Test script running...');

// Try to import and test
import('./scripts/harvest-images.js').then(module => {
  console.log('Import successful');
  console.log('Available functions:', Object.keys(module));
}).catch(err => {
  console.error('Import failed:', err.message);
});