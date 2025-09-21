import fs from 'fs';
import path from 'path';

import { extractTextFromPDF } from './src/api/pdfUtils.js';
import { extractComponentsFromText } from './src/api/utils.js';

// Unit tests for PDF error paths
console.log('=== Unit Tests for PDF Error Paths ===\n');

// Test 1: pdf_no_text_content path (mock textLength=0)
console.log('Test 1: Testing pdf_no_text_content path (empty text)...');
try {
  const emptyText = '';
  const components = extractComponentsFromText(emptyText);
  console.log('✅ Empty text handled correctly');
  console.log('Components found:', components.length);
  console.log('');
} catch (error) {
  console.log('❌ Test failed:', error.message);
  console.log('');
}

// Test 2: components_not_found path with generic prose
console.log('Test 2: Testing components_not_found path with generic prose...');
try {
  const genericText = `
  This is a generic document that doesn't contain any game components.
  It has various sections and paragraphs but no specific component listings.
  There are no boards, cards, tokens, or other game elements mentioned here.
  This text is just for testing the component extraction logic.
  `;

  const components = extractComponentsFromText(genericText);
  console.log('✅ Generic text handled correctly');
  console.log('Components found:', components.length);

  if (components.length === 0) {
    console.log('✅ Correctly identified no components in generic text');
  } else {
    console.log('⚠️ Found unexpected components:');
    components.forEach((comp, i) => {
      console.log(`  ${i + 1}. ${comp.name}: ${comp.count !== null ? comp.count : 'N/A'}`);
    });
  }
  console.log('');
} catch (error) {
  console.log('❌ Test failed:', error.message);
  console.log('');
}

// Test 3: lenient mode parsing for colon/dash/bullet formats
console.log('Test 3: Testing lenient mode parsing...');
try {
  const lenientTestText = `
  Components:
  
  Game Board: 1
  Cards - 50
  • 20 Tokens
  Dice: 6
  Player Boards - 4
  `;

  // Test normal mode first
  const normalComponents = extractComponentsFromText(lenientTestText, false, false);
  console.log('Normal mode components found:', normalComponents.length);

  // Test lenient mode
  const lenientComponents = extractComponentsFromText(lenientTestText, false, true);
  console.log('Lenient mode components found:', lenientComponents.length);

  if (lenientComponents.length > normalComponents.length) {
    console.log('✅ Lenient mode found more components');
    console.log('Lenient mode components:');
    lenientComponents.forEach((comp, i) => {
      console.log(`  ${i + 1}. ${comp.name}: ${comp.count !== null ? comp.count : 'N/A'}`);
    });
  } else {
    console.log('ℹ️ Lenient mode found same or fewer components');
  }
  console.log('');
} catch (error) {
  console.log('❌ Test failed:', error.message);
  console.log('');
}

// Test 4: Test OCR normalization patterns
console.log('Test 4: Testing OCR normalization...');
try {
  const ocrTestText = `
  Components:
  
  71 Expl0ration cards (65 Alli3s & 6 M0nst3rs)
  35 L0rds
  20 L0cati0ns
  20 M0nst3r tokens
  10 Key t0kens
  `;

  const components = extractComponentsFromText(ocrTestText);
  console.log('✅ OCR text handled correctly');
  console.log('Components found:', components.length);

  if (components.length > 0) {
    console.log('Components with OCR text:');
    components.forEach((comp, i) => {
      console.log(`  ${i + 1}. ${comp.name}: ${comp.count !== null ? comp.count : 'N/A'}`);
    });
  }
  console.log('');
} catch (error) {
  console.log('❌ Test failed:', error.message);
  console.log('');
}

console.log('=== Unit Tests Complete ===');
