import { extractComponentsFromText } from './src/api/utils.js';

// Debug the Abyss extraction with verbose output
const abyssText = `
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
`;

console.log('🔍 DEBUGGING ABYSS EXTRACTION WITH VERBOSE OUTPUT');
console.log('='.repeat(60));

const components = extractComponentsFromText(abyssText, true);

console.log('\n📊 FINAL RESULTS:');
console.log(`Found ${components.length} components`);
components.forEach((comp, i) => {
  console.log(`${i + 1}. ${comp.name}${comp.count !== null ? ` — ${comp.count}` : ''}${comp.note ? ` [${comp.note}]` : ''}`);
});