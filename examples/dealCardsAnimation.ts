// Example: "Deal N cards" animation (fan + staggered fades) with parameters you can reuse across games

import { ANIMATION_TEMPLATES } from '../src/render/AnimationTemplateRegistry';

/**
 * Creates a "Deal N cards" animation using fan_cards and fade effects
 * @param cardCount Number of cards to deal
 * @param duration Total duration of the animation
 */
export function createDealCardsAnimation(cardCount: number = 5, duration: number = 3.0) {
  // Use the fan_cards template to arrange cards in a fan
  const fanTemplate = ANIMATION_TEMPLATES.fan_cards;
  const fanFilter = fanTemplate.generateFiltergraph({
    count: cardCount,
    spacing: 30,
    rotation: 10
  });
  
  // Create staggered fade-ins for each card
  const fadeTemplate = ANIMATION_TEMPLATES.fade;
  const fadeFilters: string[] = [];
  
  for (let i = 0; i < cardCount; i++) {
    // Stagger the fade-in times
    const delay = (duration / cardCount) * i;
    const fadeFilter = fadeTemplate.generateFiltergraph({
      type: 'in',
      duration: 0.3
    });
    
    // In a real implementation, we would apply this to specific inputs
    fadeFilters.push(fadeFilter);
  }
  
  return {
    fanFilter,
    fadeFilters,
    description: `Deal ${cardCount} cards with fan arrangement and staggered fade-ins over ${duration} seconds`
  };
}

// Example usage:
// const animation = createDealCardsAnimation(5, 3.0);
// console.log(animation);

/**
 * Creates a Ken Burns effect for highlighting a game area
 * @param x X position of the area
 * @param y Y position of the area
 * @param width Width of the area
 * @param height Height of the area
 * @param duration Duration of the effect
 */
export function createAreaHighlight(
  x: number, 
  y: number, 
  width: number, 
  height: number, 
  duration: number = 5.0
) {
  // Create a highlight box
  const highlightTemplate = ANIMATION_TEMPLATES.highlight_box;
  const highlightFilter = highlightTemplate.generateFiltergraph({
    x,
    y,
    width,
    height,
    color: 'yellow',
    alpha: 0.3,
    border: 2
  });
  
  // Create a Ken Burns effect
  const kenBurnsTemplate = ANIMATION_TEMPLATES.ken_burns;
  const kenBurnsFilter = kenBurnsTemplate.generateFiltergraph({
    zoom_start: 1.0,
    zoom_end: 1.2,
    x_start: 0,
    x_end: 50,
    y_start: 0,
    y_end: 30,
    duration
  });
  
  return {
    highlightFilter,
    kenBurnsFilter,
    description: `Highlight area (${x},${y} ${width}x${height}) with Ken Burns effect over ${duration} seconds`
  };
}