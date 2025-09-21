#!/usr/bin/env node

import fs from 'fs';

import { extractComponentsFromText } from './src/api/utils.js';

/**
 * Verbose component extraction for debugging
 */
function extractTextVerbose(pdfText) {
  console.log('🔍 VERBOSE COMPONENT EXTRACTION');
  console.log('='.repeat(50));

  const START_RE = /(?:^|\n)\s*(contents\s*&\s*setup|components|box contents|game components)\b/i;
  const END_RE =
    /(?:^|\n)\s*(object of the game|game overview|setup ends|1\s+plot at court|setup\b(?!.*contents))/i;

  // Slice to the components section
  const start = START_RE.exec(pdfText);
  let slice = pdfText;
  if (start) {
    console.log('\n📋 SECTION BOUNDARIES:');
    console.log(`   Start: Found "${start[1]}" at position ${start.index}`);
    const rest = pdfText.slice(start.index + start[0].length);
    const end = END_RE.exec(rest);
    if (end) {
      console.log(`   End: Found "${end[1]}" at position ${end.index}`);
      slice = rest.slice(0, end.index);
    } else {
      console.log('   End: Not found, using rest of document');
      slice = rest;
    }
  } else {
    console.log('\n📋 SECTION BOUNDARIES: No section headers found, using entire text');
  }

  const lines = slice
    .split(/\r?\n/)
    .map((s) => s.replace(/\s+/g, ' ').trim())
    .filter(Boolean);

  console.log(`\n📄 SCOPED LINES (${lines.length} lines):`);
  lines.forEach((line, i) => {
    console.log(`   ${i + 1}. ${line}`);
  });

  // Run the actual extraction
  const components = extractComponentsFromText(pdfText);

  console.log(`\n✅ FINAL COMPONENTS (${components.length} items):`);
  components.forEach((comp, i) => {
    console.log(
      `   ${i + 1}. ${comp.name}${comp.count !== null ? ` — ${comp.count}` : ''}${comp.note ? ` [${comp.note}]` : ''}`,
    );
  });

  return components;
}

// Check if a file path was provided
if (process.argv.length > 2) {
  const filePath = process.argv[2];
  try {
    const pdfText = fs.readFileSync(filePath, 'utf8');
    extractTextVerbose(pdfText);
  } catch (error) {
    console.error(`Error reading file ${filePath}:`, error.message);
    process.exit(1);
  }
} else {
  // Use sample Abyss text
  const sampleText = `
  Contents & Setup
  
  1 Game board
  71 Exploration cards (65 Allies & 6 Monsters)
  35 Lords
  20 Locations
  20 Monster tokens (2 of value 4, 9 of value 3, and 9 of value 2)
  1 Threat token
  10 Key tokens
  Pearls (supply; quantity not specified in the excerpt)
  Plastic cups (used for the Treasury; quantity not specified in the excerpt)
  
  Game Overview
  Abyss is a game of exploration and political maneuvering...
  
  On the 6th space, they win 2 Pearls...
  Draw 1, 2, 3, or 4 Locations...
  Front of a Location
  Back of a Location
  The Traitor card
  Master of Magic
  `;

  extractTextVerbose(sampleText);
}
