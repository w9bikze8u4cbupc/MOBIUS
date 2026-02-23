// src/api/aiUtils.js
// AI utility functions with defensive parsing and validation
// All AI outputs are treated as "claims" requiring validation

import OpenAI from 'openai';
import { validateAIResponseJSON, validateAgainstSchema } from '../utils/validation.js';
import { calculateAIConfidence } from '../utils/confidence.js';

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

/**
 * Explain a text chunk with AI (with defensive handling)
 * @param {string} chunk - Text chunk to explain
 * @param {string} language - Target language ('en' or 'fr')
 * @returns {Promise<object>} { explanation: string, confidence: object, warnings: string[] }
 */
export async function explainChunkWithAI(chunk, language = 'en') {
  const warnings = [];

  if (!chunk || typeof chunk !== 'string') {
    throw new Error('Invalid chunk: must be a non-empty string');
  }

  if (chunk.length > 10000) {
    warnings.push('Chunk is very long - truncating to 10000 characters');
    chunk = chunk.substring(0, 10000);
  }

  const languagePrompts = {
    en: 'Explain the following board game rule text in clear, simple English suitable for a tutorial video:',
    fr: 'Expliquez le texte de règle de jeu de société suivant en français clair et simple, adapté pour une vidéo tutorielle:'
  };

  const prompt = languagePrompts[language] || languagePrompts.en;

  try {
    const response = await openai.chat.completions.create({
      model: 'gpt-4',
      messages: [
        {
          role: 'system',
          content: 'You are a board game educator. Provide clear, concise explanations suitable for video tutorials. Do not add information not present in the source text.'
        },
        {
          role: 'user',
          content: `${prompt}\n\n${chunk}`
        }
      ],
      max_tokens: 300,
      temperature: 0.7
    });

    const explanation = response.choices[0].message.content.trim();

    // Calculate confidence
    const confidence = calculateAIConfidence(explanation, {
      expectedFormat: 'text',
      model: 'gpt-4'
    });

    return {
      explanation,
      confidence,
      warnings: [...warnings, ...confidence.warnings]
    };
  } catch (error) {
    console.error('AI explanation error:', error);
    throw new Error(`Failed to generate explanation: ${error.message}`);
  }
}

/**
 * Extract components from text using AI (with validation and repair)
 * @param {string} text - Rulebook text
 * @returns {Promise<object>} { components: Array, confidence: object, warnings: string[] }
 */
export async function extractComponentsWithAI(text) {
  const warnings = [];

  if (!text || typeof text !== 'string') {
    throw new Error('Invalid text: must be a non-empty string');
  }

  if (text.length > 20000) {
    warnings.push('Text is very long - using first 20000 characters');
    text = text.substring(0, 20000);
  }

  const schema = {
    type: 'object',
    required: ['components'],
    properties: {
      components: {
        type: 'array',
        items: {
          type: 'object',
          required: ['name'],
          properties: {
            name: { type: 'string' },
            quantity: { type: 'number' },
            description: { type: 'string' }
          }
        }
      }
    }
  };

  const prompt = `Extract all game components from the following rulebook text. Return ONLY a valid JSON object with this exact structure:

{
  "components": [
    {
      "name": "Component name",
      "quantity": 10,
      "description": "Brief description"
    }
  ]
}

Rules:
- Include ONLY components explicitly mentioned in the text
- Use exact names from the rulebook
- If quantity is not specified, omit the quantity field
- Keep descriptions brief (under 50 characters)
- Return ONLY the JSON object, no additional text

Rulebook text:
${text}`;

  let attempts = 0;
  const maxAttempts = 3;
  let lastError = null;

  while (attempts < maxAttempts) {
    attempts++;

    try {
      const response = await openai.chat.completions.create({
        model: 'gpt-4',
        messages: [
          {
            role: 'system',
            content: 'You are a precise data extractor. Return ONLY valid JSON with no additional commentary.'
          },
          {
            role: 'user',
            content: prompt
          }
        ],
        max_tokens: 1000,
        temperature: 0.3
      });

      let responseText = response.choices[0].message.content.trim();

      // Try to extract JSON if wrapped in markdown code blocks
      const jsonMatch = responseText.match(/```(?:json)?\s*(\{[\s\S]*\})\s*```/);
      if (jsonMatch) {
        responseText = jsonMatch[1];
        warnings.push('AI response was wrapped in markdown - extracted JSON');
      }

      // Validate JSON structure
      const validation = validateAIResponseJSON(responseText, schema);
      if (!validation.isValid) {
        lastError = new Error(`Invalid AI response: ${validation.errors.map(e => e.message).join(', ')}`);
        warnings.push(`Attempt ${attempts} failed validation`);
        continue;
      }

      const parsed = JSON.parse(responseText);

      // Additional validation
      if (!Array.isArray(parsed.components)) {
        lastError = new Error('Components field is not an array');
        warnings.push(`Attempt ${attempts}: components is not an array`);
        continue;
      }

      if (parsed.components.length === 0) {
        warnings.push('AI returned zero components');
      }

      // Calculate confidence
      const confidence = calculateAIConfidence(responseText, {
        expectedFormat: 'json',
        model: 'gpt-4'
      });

      return {
        components: parsed.components,
        confidence,
        warnings: [...warnings, ...confidence.warnings],
        attempts
      };

    } catch (error) {
      lastError = error;
      warnings.push(`Attempt ${attempts} failed: ${error.message}`);
      
      // Wait before retry
      if (attempts < maxAttempts) {
        await new Promise(resolve => setTimeout(resolve, 1000 * attempts));
      }
    }
  }

  // All attempts failed
  console.error('AI component extraction failed after', maxAttempts, 'attempts:', lastError);
  
  return {
    components: [],
    confidence: {
      score: 0.0,
      level: 'none',
      warnings: ['AI extraction failed after multiple attempts']
    },
    warnings: [...warnings, 'Extraction failed - returning empty array'],
    attempts: maxAttempts,
    error: lastError.message
  };
}

/**
 * Extract metadata from rulebook text using AI
 * @param {string} text - Rulebook text
 * @returns {Promise<object>} { metadata: object, confidence: object, warnings: string[] }
 */
export async function extractMetadataWithAI(text) {
  const warnings = [];

  if (!text || typeof text !== 'string') {
    throw new Error('Invalid text: must be a non-empty string');
  }

  // Use first 5000 characters for metadata extraction
  const excerpt = text.substring(0, 5000);
  if (text.length > 5000) {
    warnings.push('Using first 5000 characters for metadata extraction');
  }

  const schema = {
    type: 'object',
    properties: {
      title: { type: 'string' },
      designer: { type: 'string' },
      artist: { type: 'string' },
      publisher: { type: 'string' },
      year: { type: 'number' },
      playerCount: { type: 'string' },
      playTime: { type: 'string' },
      minAge: { type: 'number' }
    }
  };

  const prompt = `Extract game metadata from the following rulebook text. Return ONLY a valid JSON object:

{
  "title": "Game Title",
  "designer": "Designer Name",
  "artist": "Artist Name",
  "publisher": "Publisher Name",
  "year": 2020,
  "playerCount": "2-4",
  "playTime": "30-60 minutes",
  "minAge": 10
}

Rules:
- Include ONLY information explicitly stated in the text
- If a field is not found, omit it from the JSON
- Return ONLY the JSON object, no additional text

Rulebook text:
${excerpt}`;

  try {
    const response = await openai.chat.completions.create({
      model: 'gpt-4',
      messages: [
        {
          role: 'system',
          content: 'You are a precise metadata extractor. Return ONLY valid JSON with no additional commentary.'
        },
        {
          role: 'user',
          content: prompt
        }
      ],
      max_tokens: 500,
      temperature: 0.3
    });

    let responseText = response.choices[0].message.content.trim();

    // Extract JSON if wrapped
    const jsonMatch = responseText.match(/```(?:json)?\s*(\{[\s\S]*\})\s*```/);
    if (jsonMatch) {
      responseText = jsonMatch[1];
      warnings.push('AI response was wrapped in markdown - extracted JSON');
    }

    // Validate
    const validation = validateAIResponseJSON(responseText, schema);
    if (!validation.isValid) {
      warnings.push(...validation.errors.map(e => e.message));
    }

    const parsed = JSON.parse(responseText);

    // Calculate confidence
    const confidence = calculateAIConfidence(responseText, {
      expectedFormat: 'json',
      model: 'gpt-4'
    });

    return {
      metadata: parsed,
      confidence,
      warnings: [...warnings, ...confidence.warnings]
    };

  } catch (error) {
    console.error('AI metadata extraction error:', error);
    
    return {
      metadata: {},
      confidence: {
        score: 0.0,
        level: 'none',
        warnings: ['AI extraction failed']
      },
      warnings: [...warnings, `Extraction failed: ${error.message}`],
      error: error.message
    };
  }
}

export default {
  explainChunkWithAI,
  extractComponentsWithAI,
  extractMetadataWithAI
};
