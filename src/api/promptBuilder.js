/**
 * Prompt builder utilities for generating localized chunk prompts with
 * translation fallbacks. The builder favours localized prompts (currently
 * English and French) while gracefully degrading to the source text when the
 * sandbox cannot reach the LibreTranslate instance.
 */
const { englishChunkPrompt, frenchChunkPrompt } = require('./prompts.js');
const { translateText } = require('../utils/translation');

const SUPPORTED_LANGUAGES = Object.freeze(['en', 'fr']);
const DEFAULT_LANGUAGE = 'en';

const promptFactories = {
  en: englishChunkPrompt,
  fr: frenchChunkPrompt,
};

/**
 * Builds a localized prompt for a chunk of rulebook text.
 *
 * @param {string} chunk - The raw chunk to explain.
 * @param {Object} [options]
 * @param {string} [options.language='en'] - Target language for the prompt.
 * @param {string} [options.fallbackLanguage='en'] - Language to use when the requested language is unsupported.
 * @param {(text: string, target: string) => Promise<string>} [options.translator=translateText] - Translator function.
 * @param {{ warn?: Function }} [options.logger=console] - Optional logger for fallback events.
 * @returns {Promise<string>} The localized prompt string.
 */
async function buildChunkPrompt(chunk, options = {}) {
  const {
    language = DEFAULT_LANGUAGE,
    fallbackLanguage = DEFAULT_LANGUAGE,
    translator = translateText,
    logger = console,
  } = options;

  const sanitizedChunk = typeof chunk === 'string' ? chunk.trim() : '';
  if (!sanitizedChunk) {
    return '';
  }

  const normalizedLanguage = (language || DEFAULT_LANGUAGE).toLowerCase();
  const promptFactory = promptFactories[normalizedLanguage];

  if (!promptFactory) {
    if (logger && typeof logger.warn === 'function') {
      logger.warn(`Unsupported language "${language}" requested; falling back to "${fallbackLanguage}".`);
    }
    if (normalizedLanguage === (fallbackLanguage || DEFAULT_LANGUAGE).toLowerCase()) {
      return promptFactories[DEFAULT_LANGUAGE](sanitizedChunk);
    }
    return buildChunkPrompt(sanitizedChunk, {
      ...options,
      language: fallbackLanguage,
    });
  }

  let localizedChunk = sanitizedChunk;
  let usedTranslationFallback = false;

  if (normalizedLanguage !== DEFAULT_LANGUAGE && typeof translator === 'function') {
    try {
      const translated = await translator(sanitizedChunk, normalizedLanguage);
      if (translated && typeof translated === 'string') {
        localizedChunk = translated.trim();
      }
    } catch (error) {
      usedTranslationFallback = true;
      if (logger && typeof logger.warn === 'function') {
        logger.warn('Translation service unavailable; using source text for prompt.', error);
      }
    }
  }

  const prompt = promptFactory(localizedChunk);
  if (usedTranslationFallback) {
    return `${prompt}\n\nNOTE: Translation fallback engaged in sandbox environment.`;
  }
  return prompt;
}

module.exports = {
  buildChunkPrompt,
  SUPPORTED_LANGUAGES,
};
