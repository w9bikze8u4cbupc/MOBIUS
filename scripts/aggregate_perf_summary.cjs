#!/usr/bin/env node

// Script to aggregate perf reports into a consistent summary
const fs = require('fs');
const path = require('path');

function aggregatePerfSummary() {
  const perfDir = process.env.PERF_DIR || 'reports/perf';
  const summaryPath = process.env.SUMMARY_PATH || 'reports/perf_summary.txt';
  
  if (!fs.existsSync(perfDir)) {
    console.log('No perf reports found');
    return;
  }
  
  const perfFiles = fs.readdirSync(perfDir).filter(f => f.endsWith('.json'));
  
  if (perfFiles.length === 0) {
    console.log('No perf reports found');
    return;
  }
  
  const summaries = [];
  
  for (const f of perfFiles) {
    try {
      const reportPath = path.join(perfDir, f);
      const report = JSON.parse(fs.readFileSync(reportPath, 'utf8'));
      
      // Handle both single report and array of reports
      const reports = Array.isArray(report) ? report : [report];
      
      for (const r of reports) {
        const summary = {
          game: r.game,
          platform: r.platform,
          resolution: r.resolution,
          codec: r.codec,
          fps: r.fps ? r.fps.toFixed(2) : 'N/A',
          budget: r.budget_fps ? r.budget_fps.toFixed(2) : 'N/A',
          pass: r.pass ? 'PASS' : (r.warn_only ? 'WARN' : 'FAIL'),
          extraction_time: r.extraction_time_ms ? (r.extraction_time_ms / 1000).toFixed(2) + 's' : 'N/A'
        };
        
        // Add hardware info if available
        if (r.hardware) {
          summary.hardware = {
            cpu: r.hardware.cpu_model,
            cores: r.hardware.cpu_count,
            memory: Math.round(r.hardware.total_memory / (1024 * 1024 * 1024)) + 'GB',
            runner: r.hardware.github_runner || 'local'
          };
        }
        
        summaries.push(summary);
      }
    } catch (err) {
      console.warn(`Warning: Could not process perf report ${f}: ${err.message}`);
    }
  }
  
  // Write summary to file
  const lines = [
    '# Performance Summary',
    '',
    '| Game | Platform | Resolution | Codec | FPS | Budget | Status | Time |',
    '|------|----------|------------|-------|-----|--------|--------|------|'
  ];
  
  for (const s of summaries) {
    lines.push(`| ${s.game} | ${s.platform} | ${s.resolution} | ${s.codec} | ${s.fps} | ${s.budget} | ${s.pass} | ${s.extraction_time} |`);
  }
  
  fs.writeFileSync(summaryPath, lines.join('\n'));
  console.log(`Performance summary written to ${summaryPath}`);
  
  // Also output to console for CI
  console.log('\n' + lines.join('\n'));
}

// Run the aggregation
aggregatePerfSummary();