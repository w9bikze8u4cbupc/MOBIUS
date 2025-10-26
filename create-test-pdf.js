import { createWriteStream, existsSync, mkdirSync } from 'fs';
import pdfkit from 'pdfkit';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

// Get __dirname equivalent in ES modules
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Ensure directory exists
const batch2Dir = join(__dirname, 'uploads', 'batch2');
if (!existsSync(batch2Dir)) {
  mkdirSync(batch2Dir, { recursive: true });
}

// Create a document
const doc = new pdfkit();

// Pipe its output somewhere, like to a file or HTTP response
const filePath = join(__dirname, 'uploads', 'batch2', 'cyclades.pdf');
doc.pipe(createWriteStream(filePath));

// Embed a font, set the font size, and render some text
doc.fontSize(25).text('Cyclades Game Rules', 100, 100);

// Add some content
doc.fontSize(16).text(`
Table of Contents:
1. Introduction
2. Setup
3. Gameplay
4. Components

Introduction:
Welcome to Cyclades, a game of mythology and strategy for 2-5 players.

Setup:
1. Place the board in the center
2. Give each player a color
3. Shuffle the cards

Gameplay:
Players take turns performing actions using their gods.

Components:
- Board
- Player pieces
- Cards
- Dice
`, 100, 150);

// Finalize PDF file
doc.end();

console.log(`Test PDF created at: ${filePath}`);