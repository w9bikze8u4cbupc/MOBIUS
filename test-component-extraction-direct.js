import { extractComponentsFromText } from './src/api/utils.js';

// Simulate text that would be extracted from a real board game PDF
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

const components = extractComponentsFromText(sampleGameText);
console.log('Extracted components:');
console.log(JSON.stringify(components, null, 2));
