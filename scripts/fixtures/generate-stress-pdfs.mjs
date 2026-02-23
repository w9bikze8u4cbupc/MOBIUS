#!/usr/bin/env node
// scripts/fixtures/generate-stress-pdfs.mjs
// Generates synthetic PDF fixtures for stress testing
// Uses pdf-lib (already in dependencies) to create deterministic test PDFs

import { PDFDocument, rgb, StandardFonts } from 'pdf-lib';
import { writeFileSync, mkdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const OUTPUT_DIR = join(__dirname, '..', '..', 'data', 'fixtures', 'stress');

// Ensure output directory exists
mkdirSync(OUTPUT_DIR, { recursive: true });

console.log('Generating synthetic stress test PDF fixtures...');
console.log(`Output directory: ${OUTPUT_DIR}`);
console.log('');

// ============================================================================
// FIXTURE 1: Poor OCR Quality (Simulated)
// ============================================================================

async function generatePoorOCRPDF() {
  console.log('1. Generating poor-ocr-quality.pdf...');
  
  const pdfDoc = await PDFDocument.create();
  const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const boldFont = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
  
  // Page 1: Title and warning
  const page1 = pdfDoc.addPage([595, 842]); // A4 size
  
  page1.drawText('SYNTHETIC TEST FIXTURE', {
    x: 50,
    y: 800,
    size: 20,
    font: boldFont,
    color: rgb(1, 0, 0)
  });
  
  page1.drawText('NOT A REAL RULEBOOK', {
    x: 50,
    y: 775,
    size: 16,
    font: boldFont,
    color: rgb(1, 0, 0)
  });
  
  page1.drawText('Purpose: Simulate poor OCR quality / low confidence extraction', {
    x: 50,
    y: 740,
    size: 10,
    font
  });
  
  // Simulate poor OCR by using very small, hard-to-read text
  page1.drawText('Game Rules', {
    x: 50,
    y: 700,
    size: 24,
    font: boldFont
  });
  
  // Add text that would be hard to OCR (very small, poor spacing)
  const poorText = [
    'Th1s t3xt c0nta1ns numb3rs m1x3d w1th l3tt3rs',
    'l I 1 | (lowercase L, uppercase I, number 1, pipe)',
    'O 0 (uppercase O, zero)',
    'S 5 $ (uppercase S, five, dollar sign)',
    'Ambiguous characters: rn vs m, cl vs d',
    'Poor spacing:T h i s  i s  h a r d  t o  r e a d',
    'Rotated text would go here (simulated)',
    'Faded or low contrast text (simulated)',
    'Text with artifacts: .,.,.,.,.,.,.,.',
    'Overlapping characters: WWWWWWWWWW'
  ];
  
  let y = 650;
  for (const line of poorText) {
    page1.drawText(line, {
      x: 50,
      y,
      size: 8, // Very small text
      font
    });
    y -= 15;
  }
  
  // Page 2: More ambiguous content
  const page2 = pdfDoc.addPage([595, 842]);
  
  page2.drawText('SYNTHETIC TEST FIXTURE - Page 2', {
    x: 50,
    y: 800,
    size: 12,
    font: boldFont,
    color: rgb(1, 0, 0)
  });
  
  page2.drawText('Components:', {
    x: 50,
    y: 750,
    size: 14,
    font: boldFont
  });
  
  // Add components with OCR-confusing formatting
  const components = [
    '- 52 Cards (or is it 5Z Cards?)',
    '- 1O Tokens (10 or IO?)',
    '- 6 D1ce (Dice or D1ce?)',
    '- 1 Board (or l Board?)',
    '- 4 P1ayer Markers (Player or P1ayer?)'
  ];
  
  y = 720;
  for (const comp of components) {
    page2.drawText(comp, {
      x: 60,
      y,
      size: 10,
      font
    });
    y -= 20;
  }
  
  const pdfBytes = await pdfDoc.save();
  const outputPath = join(OUTPUT_DIR, 'poor-ocr-quality.pdf');
  writeFileSync(outputPath, pdfBytes);
  console.log(`   ✅ Created: ${outputPath} (${pdfBytes.length} bytes)`);
}

// ============================================================================
// FIXTURE 2: No Table of Contents
// ============================================================================

async function generateNoTOCPDF() {
  console.log('2. Generating no-toc.pdf...');
  
  const pdfDoc = await PDFDocument.create();
  const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const boldFont = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
  
  // Page 1: Unstructured content
  const page1 = pdfDoc.addPage([595, 842]);
  
  page1.drawText('SYNTHETIC TEST FIXTURE', {
    x: 50,
    y: 800,
    size: 20,
    font: boldFont,
    color: rgb(1, 0, 0)
  });
  
  page1.drawText('NOT A REAL RULEBOOK', {
    x: 50,
    y: 775,
    size: 16,
    font: boldFont,
    color: rgb(1, 0, 0)
  });
  
  page1.drawText('Purpose: No clear structure or table of contents', {
    x: 50,
    y: 740,
    size: 10,
    font
  });
  
  // Add unstructured text without clear sections
  const unstructuredText = [
    'This is a game about collecting things. Players take turns.',
    'You need cards and tokens. The board goes in the middle.',
    'Someone should be the dealer. Shuffle the cards first.',
    'Each player gets some tokens. Maybe 5 or 6.',
    'The goal is to get the most points. Points come from cards.',
    'When someone runs out of cards, the game ends.',
    'Count up your points. Highest score wins.',
    'There are special cards that do different things.',
    'Some cards are worth more points than others.',
    'You can trade cards with other players sometimes.'
  ];
  
  let y = 700;
  for (const line of unstructuredText) {
    page1.drawText(line, {
      x: 50,
      y,
      size: 11,
      font
    });
    y -= 25;
  }
  
  // Page 2: More unstructured content
  const page2 = pdfDoc.addPage([595, 842]);
  
  page2.drawText('SYNTHETIC TEST FIXTURE - Page 2', {
    x: 50,
    y: 800,
    size: 12,
    font: boldFont,
    color: rgb(1, 0, 0)
  });
  
  const moreText = [
    'The tokens are used for tracking. Put them on the board.',
    'Cards have numbers on them. Higher numbers are better.',
    'If you draw a special card, follow its instructions.',
    'Players can challenge each other. The winner gets a bonus.',
    'Keep playing until someone wins. Then start over.',
    'Advanced players can use optional rules.',
    'The game takes about 30 minutes to play.',
    'Suitable for ages 8 and up. 2-4 players recommended.'
  ];
  
  y = 750;
  for (const line of moreText) {
    page2.drawText(line, {
      x: 50,
      y,
      size: 11,
      font
    });
    y -= 25;
  }
  
  const pdfBytes = await pdfDoc.save();
  const outputPath = join(OUTPUT_DIR, 'no-toc.pdf');
  writeFileSync(outputPath, pdfBytes);
  console.log(`   ✅ Created: ${outputPath} (${pdfBytes.length} bytes)`);
}

// ============================================================================
// FIXTURE 3: Missing Components
// ============================================================================

async function generateMissingComponentsPDF() {
  console.log('3. Generating missing-components.pdf...');
  
  const pdfDoc = await PDFDocument.create();
  const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const boldFont = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
  
  // Page 1: Setup without components section
  const page1 = pdfDoc.addPage([595, 842]);
  
  page1.drawText('SYNTHETIC TEST FIXTURE', {
    x: 50,
    y: 800,
    size: 20,
    font: boldFont,
    color: rgb(1, 0, 0)
  });
  
  page1.drawText('NOT A REAL RULEBOOK', {
    x: 50,
    y: 775,
    size: 16,
    font: boldFont,
    color: rgb(1, 0, 0)
  });
  
  page1.drawText('Purpose: Missing explicit component list', {
    x: 50,
    y: 740,
    size: 10,
    font
  });
  
  page1.drawText('Game Setup', {
    x: 50,
    y: 700,
    size: 18,
    font: boldFont
  });
  
  // Setup instructions that mention components inline but no list
  const setupText = [
    '1. Place the board in the center of the table.',
    '2. Shuffle the deck and deal 7 cards to each player.',
    '3. Put the tokens within reach of all players.',
    '4. Choose a starting player using any method.',
    '5. The starting player takes the first turn.',
    '',
    'Gameplay',
    '',
    'On your turn, draw a card from the deck.',
    'Then play a card from your hand.',
    'Use tokens to mark your progress on the board.',
    'The game continues clockwise around the table.'
  ];
  
  let y = 660;
  for (const line of setupText) {
    if (line === '') {
      y -= 10;
      continue;
    }
    
    const isHeader = line === 'Gameplay';
    page1.drawText(line, {
      x: 50,
      y,
      size: isHeader ? 18 : 11,
      font: isHeader ? boldFont : font
    });
    y -= isHeader ? 30 : 20;
  }
  
  const pdfBytes = await pdfDoc.save();
  const outputPath = join(OUTPUT_DIR, 'missing-components.pdf');
  writeFileSync(outputPath, pdfBytes);
  console.log(`   ✅ Created: ${outputPath} (${pdfBytes.length} bytes)`);
}

// ============================================================================
// FIXTURE 4: Conflicting Setup
// ============================================================================

async function generateConflictingSetupPDF() {
  console.log('4. Generating conflicting-setup.pdf...');
  
  const pdfDoc = await PDFDocument.create();
  const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const boldFont = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
  
  // Page 1: Contradictory setup instructions
  const page1 = pdfDoc.addPage([595, 842]);
  
  page1.drawText('SYNTHETIC TEST FIXTURE', {
    x: 50,
    y: 800,
    size: 20,
    font: boldFont,
    color: rgb(1, 0, 0)
  });
  
  page1.drawText('NOT A REAL RULEBOOK', {
    x: 50,
    y: 775,
    size: 16,
    font: boldFont,
    color: rgb(1, 0, 0)
  });
  
  page1.drawText('Purpose: Conflicting/contradictory setup instructions', {
    x: 50,
    y: 740,
    size: 10,
    font
  });
  
  page1.drawText('Components', {
    x: 50,
    y: 700,
    size: 18,
    font: boldFont
  });
  
  const components = [
    '- 52 Playing Cards',
    '- 20 Tokens',
    '- 1 Game Board',
    '- 4 Player Markers',
    '- 2 Dice'
  ];
  
  let y = 670;
  for (const comp of components) {
    page1.drawText(comp, {
      x: 60,
      y,
      size: 11,
      font
    });
    y -= 20;
  }
  
  page1.drawText('Setup Instructions', {
    x: 50,
    y: y - 20,
    size: 18,
    font: boldFont
  });
  
  y -= 50;
  
  // Contradictory instructions
  const conflictingInstructions = [
    '1. Deal 7 cards to each player.',
    '2. Each player starts with 5 tokens.',
    '3. Place the board in the center.',
    '',
    'Alternative Setup (for 3-4 players):',
    '1. Deal 5 cards to each player.', // Conflicts with step 1
    '2. Each player starts with 10 tokens.', // Conflicts with step 2
    '3. Do not use the board for this variant.', // Conflicts with step 3
    '',
    'Note: For beginners, deal 10 cards to each player.', // Another conflict
    'Advanced players should start with no tokens.' // Another conflict
  ];
  
  for (const line of conflictingInstructions) {
    if (line === '') {
      y -= 10;
      continue;
    }
    
    const isHeader = line.includes('Alternative') || line.includes('Note:');
    page1.drawText(line, {
      x: 50,
      y,
      size: isHeader ? 12 : 11,
      font: isHeader ? boldFont : font
    });
    y -= 20;
  }
  
  const pdfBytes = await pdfDoc.save();
  const outputPath = join(OUTPUT_DIR, 'conflicting-setup.pdf');
  writeFileSync(outputPath, pdfBytes);
  console.log(`   ✅ Created: ${outputPath} (${pdfBytes.length} bytes)`);
}

// ============================================================================
// MAIN
// ============================================================================

async function main() {
  try {
    await generatePoorOCRPDF();
    await generateNoTOCPDF();
    await generateMissingComponentsPDF();
    await generateConflictingSetupPDF();
    
    console.log('');
    console.log('✅ All stress test PDF fixtures generated successfully!');
    console.log('');
    console.log('Run stress tests with: npm run e2e:stress');
  } catch (error) {
    console.error('❌ Error generating fixtures:', error);
    process.exit(1);
  }
}

main();
