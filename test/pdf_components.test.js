import { describe, it, expect } from 'vitest';

import { extractComponentsFromText } from '../src/api/index.js';

describe('PDF Components Parser', () => {
  it('should extract components from "Components:" heading', () => {
    const text = 'Components:\n1 game board\n2 dice\n100 cards';
    const components = extractComponentsFromText(text);
    expect(components.length).toBeGreaterThan(0);
    expect(components.some((c) => c.name.includes('game board'))).toBe(true);
    expect(components.some((c) => c.name.includes('dice'))).toBe(true);
    expect(components.some((c) => c.name.includes('cards'))).toBe(true);
  });

  it('should extract components from "Contents:" heading', () => {
    const text = 'Contents:\n1 game board\n2 dice\n100 cards';
    const components = extractComponentsFromText(text);
    expect(components.length).toBeGreaterThan(0);
    expect(components.some((c) => c.name.includes('game board'))).toBe(true);
  });

  it('should extract components from "What\'s in the Box" heading', () => {
    const text = 'What\'s in the Box:\n1 game board\n2 dice\n100 cards';
    const components = extractComponentsFromText(text);
    expect(components.length).toBeGreaterThan(0);
    expect(components.some((c) => c.name.includes('game board'))).toBe(true);
  });

  it('should extract components from "Game Components" heading', () => {
    const text = 'Game Components:\n1 game board\n2 dice\n100 cards';
    const components = extractComponentsFromText(text);
    expect(components.length).toBeGreaterThan(0);
    expect(components.some((c) => c.name.includes('game board'))).toBe(true);
  });

  it('should handle multi-line component descriptions', () => {
    const text =
      'Components:\n1 game board with special markers\n2 six-sided dice\n100 resource cards (50 wood, 30 brick, 20 sheep)';
    const components = extractComponentsFromText(text);
    expect(components.length).toBeGreaterThan(0);
    expect(components.some((c) => c.name.includes('game board'))).toBe(true);
    expect(components.some((c) => c.name.includes('dice'))).toBe(true);
    expect(components.some((c) => c.name.includes('resource cards'))).toBe(true);
  });

  it('should extract quantities from component descriptions', () => {
    const text = 'Components:\n1 Game Board\n2 Dice\n100 Cards';
    const components = extractComponentsFromText(text);
    const board = components.find((c) => c.name.includes('Game Board'));
    const dice = components.find((c) => c.name.includes('Dice'));
    const cards = components.find((c) => c.name.includes('Cards'));

    expect(board).toBeDefined();
    expect(board.quantity).toBe(1);
    expect(dice).toBeDefined();
    expect(dice.quantity).toBe(2);
    expect(cards).toBeDefined();
    expect(cards.quantity).toBe(100);
  });

  it('should handle sparse text (images-only PDFs)', () => {
    const text = ''; // Simulate images-only PDF
    const components = extractComponentsFromText(text);
    // Should return default components or empty array
    expect(Array.isArray(components)).toBe(true);
  });

  it('should handle fuzzy patterns with special characters', () => {
    const text = 'Components:\n• 1× Game Board\n• 2× Dice\n• 100× Cards';
    const components = extractComponentsFromText(text);
    expect(components.length).toBeGreaterThan(0);
    expect(components.some((c) => c.name.includes('Game Board'))).toBe(true);
  });
});
