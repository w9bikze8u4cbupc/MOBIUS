import { generatePipelineSummary } from './scripts/generate-pipeline-summary.js';
import { writeFileSync } from 'fs';

console.log('Debugging generatePipelineSummary function...');

// Generate the pipeline summary
const summary = generatePipelineSummary();

// Write to file
writeFileSync('summary.json', JSON.stringify(summary, null, 2));

console.log('Pipeline summary generated and saved to summary.json');
console.log('Summary:', JSON.stringify(summary, null, 2));