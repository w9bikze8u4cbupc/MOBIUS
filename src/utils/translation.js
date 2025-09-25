const fetch = require('node-fetch');
const logger = require('./logger.cjs');

const libreTranslateURL = 'http://localhost:5002/translate';

async function translateText(text, targetLanguage) {
    try {
        if (!text) return '';
        
        // Pre-process text to remove unwanted headers
        text = text.replace(/^(Introduction|Outro|Présentation du jeu|Composants et mise en place|Aperçu du gameplay|Actions possibles|Phase de score|Conditions de fin de partie):?\n+/gmi, '');
        
        const response = await fetch(libreTranslateURL, {
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
        logger.error('Translation error:', { error: error.message, stack: error.stack });
        throw error;
    }
}

module.exports = { translateText };