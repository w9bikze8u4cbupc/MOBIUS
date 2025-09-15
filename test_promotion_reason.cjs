#!/usr/bin/env node

// Test script to verify ALLOW_REGRESSION_REASON functionality
const fs = require('fs');
const path = require('path');

// Create a mock baseline file for testing
const mockBaseline = {
  schema: 1,
  entries: [
    {
      game: 'sushi-go',
      platform: 'macos',
      min_fps: 10.0,
      resolution: '1920x1080',
      codec: 'h264'
    }
  ]
};

const baselinePath = path.join(__dirname, 'test_perf_baseline.json');
fs.writeFileSync(baselinePath, JSON.stringify(mockBaseline, null, 2));

// Create a mock perf report with lower FPS
const mockPerfReport = [
  {
    game: 'sushi-go',
    platform: 'macos',
    fps: 8.5, // Lower than baseline
    resolution: '1920x1080',
    codec: 'h264'
  }
];

const perfDir = path.join(__dirname, 'reports', 'perf');
const perfReportPath = path.join(perfDir, 'sushi-go_macos.json');

if (!fs.existsSync(perfDir)) {
  fs.mkdirSync(perfDir, { recursive: true });
}
fs.writeFileSync(perfReportPath, JSON.stringify(mockPerfReport, null, 2));

console.log('Created test files for regression reason validation');
console.log('To test, run:');
console.log('ALLOW_REGRESSION=1 node scripts/promote_baselines.cjs');
console.log('Or to test with reason:');
console.log('ALLOW_REGRESSION=1 ALLOW_REGRESSION_REASON="Hardware upgrade" node scripts/promote_baselines.cjs');