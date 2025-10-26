// src/api/summarize.js
// Endpoint for summarizing rulebook text into tutorial scripts

import express from 'express';
import { fetchBGG } from '../ingest/bgg.js';

const router = express.Router();

/**
 * Summarize rulebook text into a tutorial script
 */
router.post('/', async (req, res) => {
  try {
    const { rulebookText, language, gameName, metadata, detailPercentage } = req.body;
    
    // Validate required fields
    if (!rulebookText) {
      return res.status(400).json({ 
        success: false, 
        error: 'Rulebook text is required' 
      });
    }
    
    if (!gameName) {
      return res.status(400).json({ 
        success: false, 
        error: 'Game name is required' 
      });
    }
    
    // Generate request ID for tracing
    const requestId = Math.random().toString(36).substring(2, 15) + 
                     Math.random().toString(36).substring(2, 15);
    
    console.log(`[${requestId}] Starting summarization for: ${gameName}`);
    
    // If we need theme but don't have it, request it from the frontend
    const theme = metadata?.theme;
    if (!theme || theme === "Not found") {
      console.log(`[${requestId}] Theme required for summarization`);
      return res.json({
        needsTheme: true,
        metadata: {
          ...metadata,
          theme: "Not found"
        }
      });
    }
    
    // Fetch BGG metadata if we have a BGG ID or URL
    let bggMetadata = null;
    if (metadata?.bggId || metadata?.bggUrl) {
      try {
        bggMetadata = await fetchBGG({
          bggId: metadata.bggId,
          bggUrl: metadata.bggUrl,
          titleGuess: gameName
        });
      } catch (error) {
        console.warn(`[${requestId}] Failed to fetch BGG metadata:`, error.message);
      }
    }
    
    // Generate the tutorial script (mock implementation)
    // In a real implementation, this would use an AI service like OpenAI or similar
    const summary = generateMockSummary(rulebookText, gameName, theme, bggMetadata, detailPercentage);
    
    // Combine metadata
    const combinedMetadata = {
      ...metadata,
      ...(bggMetadata || {})
    };
    
    console.log(`[${requestId}] Summarization completed successfully`);
    
    res.json({
      success: true,
      summary: summary,
      metadata: combinedMetadata,
      requestId: requestId
    });
    
  } catch (error) {
    console.error('Summarization error:', error);
    res.status(500).json({ 
      success: false, 
      error: error.message 
    });
  }
});

/**
 * Generate a mock summary for testing purposes
 * In a real implementation, this would use an AI service
 */
function generateMockSummary(rulebookText, gameName, theme, bggMetadata, detailPercentage) {
  // Extract some basic information from the rulebook text
  const wordCount = rulebookText.split(/\s+/).length;
  const estimatedPlayTime = Math.max(30, Math.min(180, Math.floor(wordCount / 100) * 5));
  
  // Use BGG metadata if available
  const playerCount = bggMetadata?.players || '2-4';
  const age = bggMetadata?.age || '10+';
  
  // Generate a mock tutorial script
  return `# How to Play ${gameName}

## Game Overview
${gameName} is a ${theme} game for ${playerCount} players, recommended for ages ${age} and up. A typical game takes about ${estimatedPlayTime} minutes to play.

## Setup
1. Place the game board in the center of the table
2. Each player chooses a color and takes the corresponding pieces
3. Shuffle the deck and deal cards as specified in the rules

## Objective
The objective of ${gameName} is to [game-specific objective would be detailed here].

## Game Flow
1. **Beginning of Turn**: [Actions at start of turn]
2. **Main Phase**: [Main gameplay actions]
3. **End of Turn**: [Actions at end of turn]

## Winning the Game
The first player to [win condition] wins the game!

## Tips and Strategies
- [Strategy tip 1]
- [Strategy tip 2]
- [Strategy tip 3]

## Components Overview
${bggMetadata?.description ? bggMetadata.description.substring(0, 200) + '...' : 'Detailed component descriptions would be included here.'}

Enjoy your game of ${gameName}!`;
}

export default router;