/**
 * Translation helper with sandbox-aware fetch fallback.
 *
 * The function first tries to use the built-in global `fetch` (available in
 * Node 18+). When absent—as in constrained CI containers—it lazily requires
 * `node-fetch`. If the LibreTranslate service cannot be reached the function
 * returns the sanitized source text so downstream prompt building continues to
 * work with a best-effort fallback.
 */
let fetchImpl = null;

if (typeof globalThis.fetch === 'function') {
    fetchImpl = (...args) => globalThis.fetch(...args);
} else {
    const nodeFetch = require('node-fetch');
    fetchImpl = (...args) => nodeFetch(...args);
}

const libreTranslateURL = 'http://localhost:5002/translate';

async function translateText(text, targetLanguage) {
    if (!text) {
        return '';
    }

    const sanitizedText = text.replace(
        /^(Introduction|Outro|Présentation du jeu|Composants et mise en place|Aperçu du gameplay|Actions possibles|Phase de score|Conditions de fin de partie):?\n+/gmi,
        ''
    );

    try {
        const response = await fetchImpl(libreTranslateURL, {
            method: 'POST',
            body: JSON.stringify({
                q: sanitizedText,
                source: 'en',
                target: targetLanguage,
                format: 'text'
            }),
            headers: { 'Content-Type': 'application/json' }
        });

        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }

        const data = await response.json();

        return data.translatedText
            .replace(/\[pause\]/g, '[PAUSE 2s]')
            .replace(/\.\s/g, '. [PAUSE 1s] ')
            .replace(/\b(Introduction|Outro)\b/gi, '')
            .replace(/\[Image:.*?\]/g, '');
    } catch (error) {
        console.warn('Translation fallback activated; returning source text.', error);
        return sanitizedText;
    }
}

module.exports = { translateText };
