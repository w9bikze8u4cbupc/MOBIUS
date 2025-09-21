import { extractComponentsFromText } from './src/api/utils.js';

// Test the normalization function directly
const utilsModule = await import('./src/api/utils.js');

// Test what "Threat token" normalizes to
const normalizeToCanonical =
  utilsModule.normalizeToCanonical ||
  (() => {
    // Fallback if we can't import the function directly
    console.log('Couldn\'t import normalizeToCanonical directly');
    return null;
  });

console.log('🔍 DEBUGGING NORMALIZATION');
console.log('='.repeat(30));

// Test various tokens
const testTokens = [
  'Threat token',
  'Monster tokens',
  'Monster token',
  'Game board',
  'Locations',
  'Lords',
  'Lord cards',
  'Pearls',
  'Plastic cups',
];

// Since we can't easily import the normalizeToCanonical function,
// let's test by running a simple extraction
const testText = `
Contents & Setup
1 Threat token
Game Overview
`;

console.log('Testing Threat token normalization:');
const components = extractComponentsFromText(testText, true);
console.log('Components found:', components);
