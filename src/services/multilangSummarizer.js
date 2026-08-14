import { getAiClient, getAiConfig, getAiModel, getGenerationOptions, requireAiReady } from '../config/aiConfig.js';

async function summarizeEnglish(text) {
  if (!text) throw new Error('No text provided for English summarization');
  await requireAiReady();
  const response = await getAiClient().chat.completions.create({
    model: getAiModel(),
    messages: [
      { role: 'system', content: 'You are a helpful assistant that summarizes text clearly and concisely.' },
      { role: 'user', content: `Summarize the following text:\n\n${text}` },
    ],
    ...getGenerationOptions(getAiConfig(), {
      max_completion_tokens: 1000,
      temperature: 0.7,
    }),
  });

  return response.choices[0].message.content.trim();
}

async function summarizeFrench(text) {
  if (!text) throw new Error('No text provided for French summarization');
  await requireAiReady();
  const response = await getAiClient().chat.completions.create({
    model: getAiModel(),
    messages: [
      { role: 'system', content: 'Vous êtes un assistant qui résume les textes de manière claire et concise en français.' },
      { role: 'user', content: `Résumez le texte suivant de manière claire et concise:\n\n${text}` },
    ],
    ...getGenerationOptions(getAiConfig(), {
      max_completion_tokens: 1000,
      temperature: 0.7,
    }),
  });

  return response.choices[0].message.content.trim();
}

async function summarizeText(text, language) {
  return language === 'french' ? summarizeFrench(text) : summarizeEnglish(text);
}

export { summarizeText };
