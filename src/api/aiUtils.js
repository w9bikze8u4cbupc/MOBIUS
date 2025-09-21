import OpenAI from 'openai';

import { frenchChunkPrompt, englishChunkPrompt } from './prompts.js';

export async function explainChunkWithAI(chunk, language = 'en') {
  const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

  // Choose the right prompt based on language
  const prompt = language === 'fr' ? frenchChunkPrompt(chunk) : englishChunkPrompt(chunk);

  try {
    const response = await openai.chat.completions.create({
      model: 'gpt-4',
      messages: [{ role: 'user', content: prompt }],
      temperature: 0.2,
      max_tokens: 1200,
    });

    // Return the AI's explanation as plain text
    return response.choices[0].message.content.trim();
  } catch (err) {
    console.error('AI explanation failed:', err.message);
    return 'AI explanation failed.';
  }
}

export async function extractComponentsWithAI(text) {
  // Create the client inside the function, so .env is loaded
  const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

  try {
    const prompt = `
      You are an expert board game component analyzer. Extract ALL game components from this rulebook text.
      Look for: cards, dice, tokens, boards, meeples, figures, miniatures, cubes, tiles, markers, counters, 
      money, coins, scoring tracks, player aids, reference cards, standees, wooden pieces, plastic pieces, 
      wheels, spinners, bags, boxes, dividers, and any other game pieces.
      
      For each component found, return a JSON array with objects containing:
      - "name": descriptive name of the component (e.g., "Player Cards", "Action Tokens", "Gold Coins")
      - "quantity": number if mentioned, or null if not specified
      - "description": brief description if available
      
      IMPORTANT: Be thorough and look for components mentioned throughout the text, not just in a components section.
      Include different types of cards, different colored pieces, special tokens, etc.
      
      Text to analyze:
      ${text.slice(0, 8000)}
    `;
    const response = await openai.chat.completions.create({
      model: 'gpt-4',
      messages: [
        {
          role: 'system',
          content:
            'You are a board game expert specializing in component identification. Always return valid JSON arrays.',
        },
        { role: 'user', content: prompt },
      ],
      temperature: 0.1,
      max_tokens: 2000,
    });
    // Parse the response as needed
    // Robust JSON parsing
    const responseText = response.choices[0].message.content.trim();
    console.log('AI response:', responseText);

    let aiResult;
    try {
      // Try to extract JSON from code block if present
      const jsonMatch = responseText.match(/```(?:json)?\s*([\s\S]*?)\s*```/);
      const jsonText = jsonMatch ? jsonMatch[1] : responseText;
      aiResult = JSON.parse(jsonText);
    } catch (parseErr) {
      console.error('Error parsing AI response as JSON:', parseErr);
      // Fallback: return a single item with the raw response
      aiResult = [
        {
          name: 'AI Extraction (needs review)',
          quantity: null,
          details: responseText.slice(0, 200) + '...',
          selected: true,
        },
      ];
    }
    return aiResult;
  } catch (err) {
    console.error('AI extraction failed:', err.message);
    return [];
  }
}
