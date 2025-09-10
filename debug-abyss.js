import { extractComponentsFromText } from './src/api/utils.js';

/**
 * Debug the Abyss extraction to see what's happening
 */
function debugAbyssExtraction() {
  console.log('🔍 DEBUGGING ABYSS COMPONENT EXTRACTION');
  console.log('='.repeat(50));
  
  // This is what the Abyss PDF actually lists in the "Contents & Setup" section:
  const abyssPdfText = `
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

  console.log('📄 INPUT TEXT (simulating PDF content):');
  console.log(abyssPdfText);
  
  // Let's manually test the regex patterns
  const START_RE = /(?:^|\n)\s*(contents\s*&\s*setup|components|box contents|game components)\b/i;
  const END_RE = /(?:^|\n)\s*(object of the game|game overview|setup ends|1\s+plot at court|setup\b(?!.*contents))/i;
  
  console.log('\n🔍 TESTING SECTION BOUNDARIES:');
  const start = START_RE.exec(abyssPdfText);
  console.log('Start match:', start ? `Found at index ${start.index}: "${start[0]}"` : 'Not found');
  
  if (start) {
    const rest = abyssPdfText.slice(start.index + start[0].length);
    const end = END_RE.exec(rest);
    console.log('End match:', end ? `Found at index ${end.index}: "${end[0]}"` : 'Not found');
    
    const slice = end ? rest.slice(0, end.index) : rest;
    console.log('\n📝 EXTRACTED SECTION:');
    console.log(slice);
    
    console.log('\n🔍 TESTING LINES:');
    const lines = slice
      .split(/\r?\n/)
      .map(s => s.replace(/\s+/g, ' ').trim())
      .filter(Boolean);
      
    lines.forEach((line, i) => {
      console.log(`${i+1}. "${line}"`);
    });
  }
  
  console.log('\n🔍 EXTRACTING COMPONENTS...');
  const components = extractComponentsFromText(abyssPdfText);
  
  console.log('\n✅ EXTRACTION RESULTS:');
  console.log(`Found ${components.length} components`);
  
  components.forEach((comp, i) => {
    console.log(`${i + 1}. ${comp.name}${comp.count ? ` — ${comp.count}` : ' — null'}${comp.note ? ` (note: ${comp.note})` : ''}`);
  });
}

// Run the debug
debugAbyssExtraction();