// Enhanced Component-Image Matching System
import React, { useState, useEffect, useMemo } from 'react';

// Improved matching algorithm with better scoring
const improvedMatchComponentsToImages = (components, images) => {
  console.log('Starting improved matching with:', { components: components.length, images: images.length });
  
  // Enhanced synonyms dictionary
  const synonyms = {
    'dice': ['die', 'dice', 'd6', 'd4', 'd8', 'd10', 'd12', 'd20', 'six-sided', 'four-sided'],
    'cards': ['card', 'cards', 'deck', 'hand', 'playing card', 'game card'],
    'tokens': ['token', 'tokens', 'marker', 'markers', 'chip', 'chips', 'counter', 'counters'],
    'meeples': ['meeple', 'meeples', 'figure', 'figures', 'pawn', 'pawns', 'worker', 'workers'],
    'board': ['board', 'gameboard', 'game board', 'main board', 'playing board'],
    'tiles': ['tile', 'tiles', 'hex', 'hexes', 'square', 'squares', 'hexagon', 'hexagonal'],
    'cubes': ['cube', 'cubes', 'wooden cube', 'resource cube', 'block', 'blocks'],
    'money': ['money', 'coins', 'coin', 'currency', 'cash', 'dollar', 'euro'],
    'resources': ['resource', 'resources', 'goods', 'materials', 'supplies'],
    'miniatures': ['miniature', 'miniatures', 'mini', 'minis', 'figurine', 'figurines'],
    'standees': ['standee', 'standees', 'stand-up', 'cardboard figure'],
    'rulebook': ['rulebook', 'rules', 'manual', 'instruction', 'guide'],
    'reference': ['reference', 'aid', 'sheet', 'player aid', 'quick reference'],
    'bag': ['bag', 'pouch', 'sack', 'container'],
    'screen': ['screen', 'player screen', 'divider'],
    'track': ['track', 'tracker', 'scoring track', 'score track'],
    'wheel': ['wheel', 'dial', 'spinner', 'rondel'],
    'mat': ['mat', 'player mat', 'individual board']
  };

  // Color keywords for better matching
  const colors = ['red', 'blue', 'green', 'yellow', 'black', 'white', 'purple', 'orange', 'brown', 'pink'];

  // Advanced similarity function
  function advancedSimilarity(str1, str2) {
    if (!str1 || !str2) return 0;
    
    const s1 = str1.toLowerCase().trim();
    const s2 = str2.toLowerCase().trim();
    
    // Exact match
    if (s1 === s2) return 1.0;
    
    // One contains the other
    if (s1.includes(s2) || s2.includes(s1)) return 0.9;
    
    // Levenshtein distance based similarity
    const longer = s1.length > s2.length ? s1 : s2;
    const shorter = s1.length > s2.length ? s2 : s1;
    const editDistance = levenshteinDistance(longer, shorter);
    const lengthSimilarity = (longer.length - editDistance) / longer.length;
    
    // Word overlap similarity
    const words1 = s1.split(/\s+/);
    const words2 = s2.split(/\s+/);
    const commonWords = words1.filter(word => words2.includes(word));
    const wordSimilarity = commonWords.length / Math.max(words1.length, words2.length);
    
    // Return the best similarity score
    return Math.max(lengthSimilarity, wordSimilarity);
  }

  // Check if component matches image using synonyms
  function checkSynonymMatch(componentName, imageName, imageDesc) {
    const compLower = componentName.toLowerCase();
    const imgNameLower = (imageName || '').toLowerCase();
    const imgDescLower = (imageDesc || '').toLowerCase();
    
    for (const [key, syns] of Object.entries(synonyms)) {
      const componentHasSynonym = syns.some(syn => compLower.includes(syn));
      const imageHasSynonym = syns.some(syn => 
        imgNameLower.includes(syn) || imgDescLower.includes(syn)
      );
      
      if (componentHasSynonym && imageHasSynonym) {
        return 0.8; // High confidence for synonym matches
      }
    }
    return 0;
  }

  // Extract meaningful keywords from component name
  function extractKeywords(name) {
    const stopWords = ['the', 'a', 'an', 'and', 'or', 'but', 'in', 'on', 'at', 'to', 'for', 'of', 'with', 'by'];
    return name.toLowerCase()
      .split(/\s+/)
      .filter(word => word.length > 2 && !stopWords.includes(word))
      .filter(word => !/^\d+$/.test(word)); // Remove pure numbers
  }

  // Main matching logic
  return components.map((component, compIndex) => {
    console.log(`\nMatching component ${compIndex}: "${component.name}"`);
    
    let bestMatch = null;
    let bestScore = 0;
    let matchReason = '';
    
    const componentName = component.name.toLowerCase();
    const componentKeywords = extractKeywords(component.name);
    
    images.forEach((img, imgIndex) => {
      const imageName = (img.name || img.filename || '').toLowerCase();
      const imageDesc = (img.description || img.alt || '').toLowerCase();
      const imagePath = img.path || img.url || '';
      
      let score = 0;
      let reasons = [];
      
      // 1. Exact name match (highest priority)
      if (imageName.includes(componentName) || imageDesc.includes(componentName)) {
        score = Math.max(score, 0.95);
        reasons.push('exact name match');
      }
      
      // 2. Synonym matching
      const synonymScore = checkSynonymMatch(component.name, imageName, imageDesc);
      if (synonymScore > 0) {
        score = Math.max(score, synonymScore);
        reasons.push('synonym match');
      }
      
      // 3. Keyword matching
      let keywordMatches = 0;
      componentKeywords.forEach(keyword => {
        if (imageName.includes(keyword) || imageDesc.includes(keyword)) {
          keywordMatches++;
        }
      });
      if (keywordMatches > 0) {
        const keywordScore = 0.6 + (keywordMatches * 0.1);
        score = Math.max(score, keywordScore);
        reasons.push(`${keywordMatches} keyword matches`);
      }
      
      // 4. Filename analysis (extract component hints from filename)
      const filename = imagePath.split('/').pop() || '';
      const filenameScore = advancedSimilarity(componentName, filename);
      if (filenameScore > 0.3) {
        score = Math.max(score, filenameScore * 0.7);
        reasons.push('filename similarity');
      }
      
      // 5. Color matching (if component has color)
      colors.forEach(color => {
        if (componentName.includes(color) && (imageName.includes(color) || imageDesc.includes(color))) {
          score = Math.max(score, 0.7);
          reasons.push('color match');
        }
      });
      
      // 6. Fuzzy string similarity as fallback
      const nameScore = advancedSimilarity(componentName, imageName);
      const descScore = advancedSimilarity(componentName, imageDesc);
      const fuzzyScore = Math.max(nameScore, descScore);
      if (fuzzyScore > 0.4) {
        score = Math.max(score, fuzzyScore * 0.6);
        reasons.push('fuzzy similarity');
      }
      
      // Update best match if this score is better
      if (score > bestScore) {
        bestScore = score;
        bestMatch = img;
        matchReason = reasons.join(', ');
      }
      
      console.log(`  Image ${imgIndex} (${imageName}): score=${score.toFixed(2)}, reasons=[${reasons.join(', ')}]`);
    });
    
    console.log(`  Best match: ${bestMatch ? bestMatch.name : 'none'} (score: ${bestScore.toFixed(2)}, reason: ${matchReason})`);
    
    return {
      ...component,
      suggestedImage: bestMatch,
      matchConfidence: bestScore,
      matchReason: matchReason,
      alternativeMatches: images
        .map(img => ({
          image: img,
          score: calculateImageScore(component, img),
          reason: 'alternative'
        }))
        .filter(match => match.score > 0.2)
        .sort((a, b) => b.score - a.score)
        .slice(0, 3) // Top 3 alternatives
    };
  });
};

// Helper function to calculate score for alternative matches
function calculateImageScore(component, image) {
  const componentName = component.name.toLowerCase();
  const imageName = (image.name || image.filename || '').toLowerCase();
  const imageDesc = (image.description || image.alt || '').toLowerCase();
  
  if (imageName.includes(componentName) || imageDesc.includes(componentName)) {
    return 0.9;
  }
  
  // Add more scoring logic here...
  return 0.3; // Default score for alternatives
}

// Levenshtein distance function (you already have this)
function levenshteinDistance(str1, str2) {
  const matrix = [];
  for (let i = 0; i <= str2.length; i++) {
    matrix[i] = [i];
  }
  for (let j = 0; j <= str1.length; j++) {
    matrix[0][j] = j;
  }
  for (let i = 1; i <= str2.length; i++) {
    for (let j = 1; j <= str1.length; j++) {
      if (str2.charAt(i - 1) === str1.charAt(j - 1)) {
        matrix[i][j] = matrix[i - 1][j - 1];
      } else {
        matrix[i][j] = Math.min(
          matrix[i - 1][j - 1] + 1,
          matrix[i][j - 1] + 1,
          matrix[i - 1][j] + 1
        );
      }
    }
  }
  return matrix[str2.length][str1.length];
}

export { improvedMatchComponentsToImages };