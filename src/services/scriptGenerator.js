import OpenAI from 'openai';
import dotenv from 'dotenv';

dotenv.config();

const DEFAULT_MODEL = 'gpt-5';
const SUPPORTED_LANGUAGES = new Set(['en', 'fr-CA']);
const SCENE_KEYS = [
  'sectionTitle',
  'narrationText',
  'imageKeyword',
  'themeBorderColor',
  'durationInFrames',
];
const WORDS_PER_MINUTE = 150;
const FRAMES_PER_SECOND = 30;
const MARKDOWN_MARKERS = /[*#`]/g;

let generateWithOpenAI;

function getOpenAIGenerator() {
  if (!generateWithOpenAI) {
    const openai = new OpenAI({
      baseURL: process.env.AI_INTEGRATIONS_OPENAI_BASE_URL || undefined,
      apiKey: process.env.AI_INTEGRATIONS_OPENAI_API_KEY || process.env.OPENAI_API_KEY,
    });
    generateWithOpenAI = createRemotionScriptGenerator(openai);
  }
  return generateWithOpenAI;
}

function createGenerationError(code, message) {
  const error = new Error(message);
  error.code = code;
  return error;
}

function assertNonEmptyString(value, fieldName) {
  if (typeof value !== 'string' || value.trim() === '') {
    throw createGenerationError(
      'REMOTION_SCRIPT_INVALID_RESPONSE',
      `Scene ${fieldName} must be a non-empty string.`,
    );
  }
  return value.trim();
}

function hasExactSceneKeys(scene) {
  const actualKeys = Object.keys(scene).sort();
  const expectedKeys = [...SCENE_KEYS].sort();
  return actualKeys.length === expectedKeys.length
    && actualKeys.every((key, index) => key === expectedKeys[index]);
}

export function cleanNarrationText(value) {
  return value
    .replace(MARKDOWN_MARKERS, '')
    .replace(/\s+/g, ' ')
    .trim();
}

export function estimateDurationInFrames(narrationText) {
  const wordCount = narrationText.trim().split(/\s+/).filter(Boolean).length;
  const estimatedSeconds = (wordCount / WORDS_PER_MINUTE) * 60;
  return Math.max(1, Math.round(estimatedSeconds * FRAMES_PER_SECOND));
}

function validateAndNormalizeScenes(payload) {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    throw createGenerationError(
      'REMOTION_SCRIPT_INVALID_RESPONSE',
      'LLM output must be a JSON object containing a scenes array.',
    );
  }

  const payloadKeys = Object.keys(payload);
  if (payloadKeys.length !== 1 || payloadKeys[0] !== 'scenes' || !Array.isArray(payload.scenes) || payload.scenes.length === 0) {
    throw createGenerationError(
      'REMOTION_SCRIPT_INVALID_RESPONSE',
      'LLM output must contain only a non-empty scenes array.',
    );
  }

  return payload.scenes.map((scene, index) => {
    if (!scene || typeof scene !== 'object' || Array.isArray(scene) || !hasExactSceneKeys(scene)) {
      throw createGenerationError(
        'REMOTION_SCRIPT_INVALID_RESPONSE',
        `Scene ${index + 1} does not match the required schema.`,
      );
    }

    const sectionTitle = assertNonEmptyString(scene.sectionTitle, 'sectionTitle');
    const rawNarration = assertNonEmptyString(scene.narrationText, 'narrationText');
    const narrationText = cleanNarrationText(rawNarration);
    const imageKeyword = assertNonEmptyString(scene.imageKeyword, 'imageKeyword');
    const themeBorderColor = assertNonEmptyString(scene.themeBorderColor, 'themeBorderColor');

    if (!narrationText) {
      throw createGenerationError(
        'REMOTION_SCRIPT_INVALID_RESPONSE',
        `Scene ${index + 1} narration becomes empty after Markdown cleanup.`,
      );
    }
    if (!/^#[0-9a-fA-F]{6}$/.test(themeBorderColor)) {
      throw createGenerationError(
        'REMOTION_SCRIPT_INVALID_RESPONSE',
        `Scene ${index + 1} themeBorderColor must be a six-digit CSS hex color.`,
      );
    }
    if (!Number.isInteger(scene.durationInFrames) || scene.durationInFrames <= 0) {
      throw createGenerationError(
        'REMOTION_SCRIPT_INVALID_RESPONSE',
        `Scene ${index + 1} durationInFrames must be a positive integer.`,
      );
    }

    return {
      sectionTitle,
      narrationText,
      imageKeyword,
      themeBorderColor,
      // The service, not the model, owns speech timing so output stays consistent.
      durationInFrames: estimateDurationInFrames(narrationText),
    };
  });
}

function buildPrompt(rulesText, gameName, language) {
  const languageInstruction = language === 'fr-CA'
    ? 'Write every scene field in Canadian French (fr-CA).'
    : 'Write every scene field in English.';

  return `Create a concise, beginner-friendly Remotion tutorial script for the board game "${gameName}".

${languageInstruction}
Use only facts present in the supplied extracted rules. Divide the explanation into logical scenes.

Return STRICT JSON only. Return one object with exactly this shape:
{
  "scenes": [
    {
      "sectionTitle": "short plain-text title",
      "narrationText": "plain-text narration without Markdown",
      "imageKeyword": "concise visual search keyword",
      "themeBorderColor": "#RRGGBB color chosen to match the game's theme",
      "durationInFrames": 90
    }
  ]
}

Every scene object must contain exactly those five keys. Do not use Markdown, code fences, asterisks, hashtags, backticks, commentary, or additional keys. narrationText must be clean plain text. durationInFrames must be a positive integer estimated for speech at 150 words per minute and 30 frames per second.

Extracted rules:\n${rulesText}`;
}

export function createRemotionScriptGenerator(client) {
  if (!client?.chat?.completions?.create) {
    throw new TypeError('An OpenAI-compatible chat completions client is required.');
  }

  return async function generateWithClient(rulesText, gameName, language) {
    if (typeof rulesText !== 'string' || rulesText.trim() === '') {
      throw createGenerationError('REMOTION_SCRIPT_INPUT_INVALID', 'rulesText must be a non-empty string.');
    }
    if (typeof gameName !== 'string' || gameName.trim() === '') {
      throw createGenerationError('REMOTION_SCRIPT_INPUT_INVALID', 'gameName must be a non-empty string.');
    }
    if (!SUPPORTED_LANGUAGES.has(language)) {
      throw createGenerationError('REMOTION_SCRIPT_LANGUAGE_INVALID', 'language must be "en" or "fr-CA".');
    }

    const response = await client.chat.completions.create({
      model: DEFAULT_MODEL,
      temperature: 0,
      max_completion_tokens: 3000,
      response_format: { type: 'json_object' },
      messages: [
        {
          role: 'system',
          content: 'You produce only valid JSON matching the requested schema. Do not add Markdown or prose.',
        },
        {
          role: 'user',
          content: buildPrompt(rulesText.trim(), gameName.trim(), language),
        },
      ],
    });

    const content = response?.choices?.[0]?.message?.content;
    if (typeof content !== 'string' || content.trim() === '') {
      throw createGenerationError('REMOTION_SCRIPT_INVALID_RESPONSE', 'LLM response did not contain JSON content.');
    }

    let payload;
    try {
      payload = JSON.parse(content);
    } catch {
      throw createGenerationError('REMOTION_SCRIPT_INVALID_RESPONSE', 'LLM response was not valid JSON.');
    }

    return validateAndNormalizeScenes(payload);
  };
}

/**
 * Generate validated Remotion scene data from extracted game rules.
 *
 * @param {string} rulesText Extracted rulebook text from the ingestion pipeline.
 * @param {string} gameName Display name of the game.
 * @param {'fr-CA' | 'en'} language Requested narration language.
 * @returns {Promise<Array<{sectionTitle: string, narrationText: string, imageKeyword: string, themeBorderColor: string, durationInFrames: number}>>}
 */
export async function generateRemotionScript(rulesText, gameName, language) {
  return getOpenAIGenerator()(rulesText, gameName, language);
}
