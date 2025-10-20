// Script to demonstrate how to mount the BGG endpoint in the main API
// This is not meant to be run directly, but to show the required changes

/*
In src/api/index.js, add the following lines after the other route mounts:

import ingestRouter from './ingest.js';

// Add this line after the other app.use() calls:
app.use('/api', ingestRouter);
*/

console.log('To fix the BGG endpoint accessibility issue:');
console.log('1. Import the ingest router in src/api/index.js:');
console.log('   import ingestRouter from \'./ingest.js\';');
console.log('');
console.log('2. Mount the router in src/api/index.js:');
console.log('   app.use(\'/api\', ingestRouter);');
console.log('');
console.log('This will make the BGG endpoint accessible at /api/bgg');