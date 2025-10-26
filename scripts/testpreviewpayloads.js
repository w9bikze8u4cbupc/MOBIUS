// scripts/testPreviewPayloads.js
const { validatePayload } = require('./validatePreviewPayload.js');

// Test cases
console.log('=== Preview Payload Validation Tests ===\n');

// Test 1: Valid minimal payload
console.log('Test 1: Valid minimal payload');
try {
  const minimalPayload = require('../preview_payload_minimal.json');
  const errors = validatePayload(minimalPayload);
  if (errors.length === 0) {
    console.log('✓ PASS: Minimal payload is valid\n');
  } else {
    console.log('✗ FAIL: Minimal payload has errors:');
    errors.forEach(e => console.log('  -', e));
    console.log();
  }
} catch (err) {
  console.log('✗ ERROR: Could not load minimal payload:', err.message, '\n');
}

// Test 2: Valid full payload
console.log('Test 2: Valid full payload');
try {
  const fullPayload = require('../preview_payload_full.json');
  const errors = validatePayload(fullPayload);
  if (errors.length === 0) {
    console.log('✓ PASS: Full payload is valid\n');
  } else {
    console.log('✗ FAIL: Full payload has errors:');
    errors.forEach(e => console.log('  -', e));
    console.log();
  }
} catch (err) {
  console.log('✗ ERROR: Could not load full payload:', err.message, '\n');
}

// Test 3: Missing dryRun field
console.log('Test 3: Missing dryRun field');
try {
  const minimalPayload = require('../preview_payload_minimal.json');
  const payloadWithoutDryRun = { ...minimalPayload };
  delete payloadWithoutDryRun.dryRun;
  
  const errors = validatePayload(payloadWithoutDryRun);
  if (errors.includes('dryRun (boolean) required')) {
    console.log('✓ PASS: Correctly identified missing dryRun field\n');
  } else {
    console.log('✗ FAIL: Should have reported missing dryRun field\n');
  }
} catch (err) {
  console.log('✗ ERROR:', err.message, '\n');
}

// Test 4: Wrong types
console.log('Test 4: Wrong types (steps as object, audio as array)');
try {
  const minimalPayload = require('../preview_payload_minimal.json');
  const payloadWithWrongTypes = { 
    ...minimalPayload,
    previewRequest: {
      ...minimalPayload.previewRequest,
      steps: {}, // Should be array
      audio: []  // Should be object
    }
  };
  
  const errors = validatePayload(payloadWithWrongTypes);
  const hasStepsError = errors.includes('previewRequest.steps (array) required');
  const hasAudioError = errors.includes('previewRequest.audio (object) required');
  
  if (hasStepsError && hasAudioError) {
    console.log('✓ PASS: Correctly identified wrong types for steps and audio\n');
  } else {
    console.log('✗ FAIL: Should have reported wrong types for steps and audio');
    console.log('Errors found:', errors, '\n');
  }
} catch (err) {
  console.log('✗ ERROR:', err.message, '\n');
}

console.log('=== All Tests Complete ===');