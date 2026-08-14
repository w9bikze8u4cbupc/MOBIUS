import { getAiClient, getAiConfig, getAiModel, getGenerationOptions, requireAiReady } from '../config/aiConfig.js';

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
    await requireAiReady();
    const response = await getAiClient().chat.completions.create({
      model: getAiModel(),
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt },
      ],
      ...getGenerationOptions(getAiConfig(), {
        max_completion_tokens: 500,
        temperature: 0.7,
      }),
    });

    return response.choices[0].message.content.trim();
  } catch (error) {
    console.error('Error in explainChunkWithAI:', error.message);
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
    await requireAiReady();
    const response = await getAiClient().chat.completions.create({
      model: getAiModel(),
      messages: [
        {
          role: 'system',
          content: 'You are a precise component extractor for board games. You always return valid JSON arrays.',
        },
        { role: 'user', content: prompt },
      ],
      ...getGenerationOptions(getAiConfig(), {
        max_completion_tokens: 1500,
        temperature: 0.3,
      }),
    });

    const content = response.choices[0].message.content.trim();
    let components;
    try {
      const jsonMatch = content.match(/\[[\s\S]*\]/);
      components = JSON.parse(jsonMatch ? jsonMatch[0] : content);
    } catch (parseError) {
      console.error('Failed to parse AI response as JSON:', parseError.message);
      return [];
    }

    if (!Array.isArray(components)) return [];
    return components.map((component) => ({
      name: component.name || 'Unknown Component',
      quantity: component.quantity || 'N/A',
      description: component.description || '',
      visualCharacteristics: component.visualCharacteristics || '',
    }));
  } catch (error) {
    console.error('Error in extractComponentsWithAI:', error.message);
    return [];
  }
}
