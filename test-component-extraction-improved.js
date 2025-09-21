import { extractComponentsFromText } from './src/api/utils.js';

// Simulate text that would be extracted from a real board game PDF with proper formatting
const sampleGameText = `
Test Board Game
Rulebook

Contents & Setup

1 Game board
50 Cards
4 Player boards
100 Tokens
6 Dice

Object of the Game

The goal is to collect the most points by the end of the game.
`;

console.log('Testing component extraction with sample game text:');
console.log('===================================================');
console.log(sampleGameText);
console.log('===================================================');

const components = extractComponentsFromText(sampleGameText, true);
console.log('\nExtracted components:');
console.log(JSON.stringify(components, null, 2));

// Let's also test with a more detailed format that matches the patterns
const detailedGameText = `
Abyss

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

Object of the Game

You are a Master of the Abyss, and you want to gain the most Glory 
by recruiting powerful Lords and exploring dangerous Locations.
`;

console.log('\n\nTesting with detailed Abyss format:');
console.log('===================================');
console.log(detailedGameText);
console.log('===================================');

const detailedComponents = extractComponentsFromText(detailedGameText, true);
console.log('\nExtracted components from detailed text:');
console.log(JSON.stringify(detailedComponents, null, 2));
