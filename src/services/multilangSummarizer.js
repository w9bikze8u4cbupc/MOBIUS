const { Configuration, OpenAIApi } = require('openai');
const Cohere = require('cohere-ai');
require('dotenv').config();

const openai = new OpenAIApi(new Configuration({
  apiKey: process.env.OPENAI_API_KEY,
}));

Cohere.init(process.env.COHERE_API_KEY);

async function summarizeEnglish(text) {
  if (!text) throw new Error('No text provided for English summarization');

  const response = await openai.createChatCompletion({
    model: 'gpt-4',
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
    max_tokens: 1000,
    temperature: 0.7,
  });

  return response.data.choices[0].message.content.trim();
}

async function summarizeFrench(text) {
  if (!text) throw new Error('No text provided for French summarization');

  const response = await Cohere.generate({
    model: 'xlarge',
    prompt: `Résumez le texte suivant de manière claire et concise:\n\n${text}`,
    max_tokens: 300,
    temperature: 0.7,
    k: 0,
    p: 1,
    frequency_penalty: 0,
    presence_penalty: 0,
    stop_sequences: [],
  });

  return response.body.generations[0].text.trim();
}

async function summarizeText(text, language) {
  if (language === 'french') {
    return await summarizeFrench(text);
  } else {
    return await summarizeEnglish(text);
  }
}

module.exports = { summarizeText };