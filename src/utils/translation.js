const fetch = require('node-fetch');

const LT_URL = process.env.LT_URL || 'http://localhost:5002/translate';
const TRANSLATE_MODE = (process.env.TRANSLATE_MODE || 'optional').toLowerCase();
// optional modes: 'disabled' | 'optional' | 'required'

async function translateText(text, targetLanguage) {
    try {
        if (!text) return '';
        
        // Handle disabled mode
        if (TRANSLATE_MODE === 'disabled') {
            return { text, provider: 'libretranslate', mode: 'disabled', skipped: true };
        }
        
        // Pre-process text to remove unwanted headers
        text = text.replace(/^(Introduction|Outro|Présentation du jeu|Composants et mise en place|Aperçu du gameplay|Actions possibles|Phase de score|Conditions de fin de partie):?\n+/gmi, '');
        
        const response = await fetch(LT_URL, {
            method: 'POST',
            body: JSON.stringify({
                q: text,
                source: 'en',
                target: targetLanguage,
                format: 'text'
            }),
            headers: { 'Content-Type': 'application/json' }
        });

        if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);

        const data = await response.json();
        
        // Post-process translation to improve quality
        let translation = data.translatedText
            .replace(/\[pause\]/g, '[PAUSE 2s]')
            .replace(/\.\s/g, '. [PAUSE 1s] ')
            .replace(/\b(Introduction|Outro)\b/gi, '')
            .replace(/\[Image:.*?\]/g, '');
            
        return translation;
    } catch (error) {
        if (TRANSLATE_MODE === 'optional') {
            // Graceful fallback with warning
            console.warn('[translate] optional mode: network error, returning source text');
            return { text, provider: 'libretranslate', mode: 'optional', error: String(error) };
        }
        console.error("Translation error:", error);
        throw error;
    }
}

module.exports = { translateText };