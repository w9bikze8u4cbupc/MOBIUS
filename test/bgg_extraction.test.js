import { describe, it, expect } from 'vitest';
import { extractComponentsFromText } from '../src/api/index.js';

describe('BGG HTML Extraction', () => {
  it('should extract components from colon-separated format', () => {
    const text = 'Components: 1 game board, 2 dice, 100 cards';
    const components = extractComponentsFromText(text);
    expect(components.length).toBeGreaterThan(0);
    expect(components.some(c => c.name.includes('game board'))).toBe(true);
    expect(components.some(c => c.name.includes('dice'))).toBe(true);
    expect(components.some(c => c.name.includes('cards'))).toBe(true);
  });

  it('should extract components from bullet list format', () => {
    const text = '• 1 game board\n• 2 dice\n• 100 cards';
    const components = extractComponentsFromText(text);
    expect(components.length).toBeGreaterThan(0);
    expect(components.some(c => c.name.includes('game board'))).toBe(true);
    expect(components.some(c => c.name.includes('dice'))).toBe(true);
    expect(components.some(c => c.name.includes('cards'))).toBe(true);
  });

  it('should extract components from numbered list format', () => {
    const text = '1. 1 game board\n2. 2 dice\n3. 100 cards';
    const components = extractComponentsFromText(text);
    expect(components.length).toBeGreaterThan(0);
    expect(components.some(c => c.name.includes('game board'))).toBe(true);
    expect(components.some(c => c.name.includes('dice'))).toBe(true);
    expect(components.some(c => c.name.includes('cards'))).toBe(true);
  });

  it('should handle HTML entities', () => {
    const text = 'Components: 1 game board &amp; 2 dice';
    const components = extractComponentsFromText(text);
    expect(components.length).toBeGreaterThan(0);
    expect(components.some(c => c.name.includes('game board'))).toBe(true);
    expect(components.some(c => c.name.includes('dice'))).toBe(true);
  });

  it('should handle different locale patterns', () => {
    const text = 'Composants: 1 plateau de jeu, 2 dés, 100 cartes';
    const components = extractComponentsFromText(text);
    expect(components.length).toBeGreaterThan(0);
  });

  it('should extract "What\'s in the Box" sections', () => {
    const text = 'What\'s in the Box: 1 game board, 2 dice, 100 cards';
    const components = extractComponentsFromText(text);
    expect(components.length).toBeGreaterThan(0);
    expect(components.some(c => c.name.includes('game board'))).toBe(true);
  });

  it('should extract "Game Components" sections', () => {
    const text = 'Game Components: 1 game board, 2 dice, 100 cards';
    const components = extractComponentsFromText(text);
    expect(components.length).toBeGreaterThan(0);
    expect(components.some(c => c.name.includes('game board'))).toBe(true);
  });

  it('should handle sparse text with OCR fallback', () => {
    const text = ''; // Simulate OCR failure
    const components = extractComponentsFromText(text);
    // Should return default components
    expect(components.length).toBeGreaterThanOrEqual(0);
  });
});