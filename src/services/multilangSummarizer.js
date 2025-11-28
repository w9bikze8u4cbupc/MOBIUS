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

async function summarizeEnglish(text) {
  if (!text) throw new Error('No text provided for English summarization');

  const response = await openai.chat.completions.create({
    model: DEFAULT_MODEL,
    messages: [
      {
        role: 'system',
        content: 'You are a helpful assistant that summarizes text clearly and concisely.',
      },
      {
        role: 'user',
        content: `Summarize the following text:\n\n${text}`,
      },
    ],
    max_completion_tokens: 1000,
    temperature: 0.7,
  });

  return response.choices[0].message.content.trim();
}

async function summarizeFrench(text) {
  if (!text) throw new Error('No text provided for French summarization');

  // Using GPT-5 for French summarization for better quality
  const response = await openai.chat.completions.create({
    model: DEFAULT_MODEL,
    messages: [
      {
        role: 'system',
        content: 'Vous êtes un assistant qui résume les textes de manière claire et concise en français.',
      },
      {
        role: 'user',
        content: `Résumez le texte suivant de manière claire et concise:\n\n${text}`,
      },
    ],
    max_completion_tokens: 1000,
    temperature: 0.7,
  });

  return response.choices[0].message.content.trim();
}

async function summarizeText(text, language) {
  if (language === 'french') {
    return await summarizeFrench(text);
  } else {
    return await summarizeEnglish(text);
  }
}

export { summarizeText };
