import OpenAI from 'openai';
import dotenv from 'dotenv';

dotenv.config();

// This uses Replit's AI Integrations service for OpenAI-compatible API access
// Falls back to direct OpenAI API key if AI Integrations is not configured
const openai = new OpenAI({
  baseURL: process.env.AI_INTEGRATIONS_OPENAI_BASE_URL || undefined,
  apiKey: process.env.AI_INTEGRATIONS_OPENAI_API_KEY || process.env.OPENAI_API_KEY,
});

// the newest OpenAI model is "gpt-5" which was released August 7, 2025
// do not change this unless explicitly requested by the user
const DEFAULT_MODEL = 'gpt-5';

export async function explainChunkWithAI(chunk, language = 'en') {
  if (!chunk || chunk.trim().length === 0) {
    return language === 'fr' 
      ? 'Aucun texte fourni pour l\'explication.' 
      : 'No text provided for explanation.';
  }

  const systemPrompt = language === 'fr'
    ? 'Vous êtes un expert en jeux de société. Expliquez ce passage de manière claire et concise, adapté à un tutoriel vidéo YouTube. Utilisez un ton amical et engageant.'
    : 'You are a board game expert. Explain this passage clearly and concisely, suitable for a YouTube video tutorial. Use a friendly and engaging tone.';

  const userPrompt = language === 'fr'
    ? `Expliquez ce passage de règles de jeu de société pour un tutoriel vidéo:\n\n${chunk}`
    : `Explain this board game rules passage for a video tutorial:\n\n${chunk}`;

  try {
    const response = await openai.chat.completions.create({
      model: DEFAULT_MODEL,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt }
      ],
      max_completion_tokens: 500,
      temperature: 0.7,
    });

    return response.choices[0].message.content.trim();
  } catch (error) {
    console.error('Error in explainChunkWithAI:', error);
    return language === 'fr'
      ? 'Erreur lors de la génération de l\'explication.'
      : 'Error generating explanation.';
  }
}

export async function extractComponentsWithAI(rulebookText) {
  if (!rulebookText || rulebookText.trim().length === 0) {
    return [];
  }

  const prompt = `You are an expert at analyzing board game rulebooks. 
Extract all game components mentioned in the following rulebook text.

For each component, provide:
- name: The name of the component
- quantity: The number of this component (if mentioned)
- description: A brief description of the component
- visualCharacteristics: Any visual details mentioned (color, size, shape, etc.)

Return a JSON array of objects with these fields. If a field is not mentioned, use "N/A" or leave empty.

Rulebook text:
${rulebookText.slice(0, 4000)}

Return ONLY a valid JSON array, no additional text.`;

  try {
    const response = await openai.chat.completions.create({
      model: DEFAULT_MODEL,
      messages: [
        { 
          role: 'system', 
          content: 'You are a precise component extractor for board games. You always return valid JSON arrays.'
        },
        { role: 'user', content: prompt }
      ],
      max_completion_tokens: 1500,
      temperature: 0.3,
    });

    const content = response.choices[0].message.content.trim();
    
    // Try to parse JSON from the response
    let components;
    try {
      // Handle case where response might have markdown code blocks
      const jsonMatch = content.match(/\[[\s\S]*\]/);
      if (jsonMatch) {
        components = JSON.parse(jsonMatch[0]);
      } else {
        components = JSON.parse(content);
      }
    } catch (parseError) {
      console.error('Failed to parse AI response as JSON:', parseError);
      return [];
    }

    // Ensure it's an array
    if (!Array.isArray(components)) {
      return [];
    }

    // Normalize component objects
    return components.map(c => ({
      name: c.name || 'Unknown Component',
      quantity: c.quantity || 'N/A',
      description: c.description || '',
      visualCharacteristics: c.visualCharacteristics || ''
    }));

  } catch (error) {
    console.error('Error in extractComponentsWithAI:', error);
    return [];
  }
}
