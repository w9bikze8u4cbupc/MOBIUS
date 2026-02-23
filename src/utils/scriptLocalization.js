// src/utils/scriptLocalization.js
// Script localization: EN→FR translation with governance
// PHASE P1-B: Localization as derived artifacts with explicit confirmation

import crypto from 'crypto';
import { LocalizationStatus, SupportedLanguages } from './scriptArtifact.js';

/**
 * Localization error codes
 */
export const LocalizationErrorCode = {
  NO_AUTHORITATIVE_SCRIPT: 'NO_AUTHORITATIVE_SCRIPT',
  INVALID_TARGET_LANGUAGE: 'INVALID_TARGET_LANGUAGE',
  SEGMENT_COUNT_MISMATCH: 'SEGMENT_COUNT_MISMATCH',
  MISSING_SEGMENT_REFERENCE: 'MISSING_SEGMENT_REFERENCE',
  LOCALIZATION_NOT_CONFIRMED: 'LOCALIZATION_NOT_CONFIRMED'
};

/**
 * Create a localized script variant
 * @param {object} authoritativeScript - Authoritative EN script
 * @param {string} targetLang - Target language code ('fr')
 * @param {Array<object>} translatedSegments - Translated segments
 * @param {object} metadata - Translation metadata
 * @returns {object} Localized script variant
 */
export function createLocalizedScript(authoritativeScript, targetLang, translatedSegments, metadata = {}) {
  if (!authoritativeScript || authoritativeScript.language !== SupportedLanguages.EN) {
    throw new Error('Authoritative script must be in English');
  }
  
  if (targetLang !== SupportedLanguages.FR) {
    throw new Error(`Unsupported target language: ${targetLang}`);
  }
  
  // Validate segment count matches
  if (translatedSegments.length !== authoritativeScript.scriptSegments.length) {
    throw new Error(
      `Segment count mismatch: EN has ${authoritativeScript.scriptSegments.length}, ` +
      `${targetLang} has ${translatedSegments.length}`
    );
  }
  
  // Create segment mappings with references to EN segments
  const mappedSegments = translatedSegments.map((translated, index) => {
    const enSegment = authoritativeScript.scriptSegments[index];
    
    return {
      segmentIndex: index,
      type: enSegment.type,
      enSegmentRef: {
        index,
        type: enSegment.type,
        contentHash: hashContent(enSegment.content)
      },
      content: translated.content,
      translatedAt: new Date().toISOString()
    };
  });
  
  return {
    id: crypto.randomUUID(),
    language: targetLang,
    sourceScriptId: authoritativeScript.id,
    sourceLanguage: SupportedLanguages.EN,
    status: LocalizationStatus.PENDING,
    createdAt: new Date().toISOString(),
    segments: mappedSegments,
    metadata: {
      model: metadata.model || 'gpt-4',
      translationMethod: metadata.translationMethod || 'llm',
      wordCount: mappedSegments.reduce((sum, seg) => sum + seg.content.split(/\s+/).length, 0),
      segmentCount: mappedSegments.length,
      ...metadata
    }
  };
}

/**
 * Hash content for reference tracking
 * @param {string} content - Content to hash
 * @returns {string} SHA-256 hash
 */
function hashContent(content) {
  return crypto.createHash('sha256').update(content).digest('hex').substring(0, 16);
}

/**
 * Validate localized script against authoritative source
 * @param {object} localizedScript - Localized script variant
 * @param {object} authoritativeScript - Authoritative EN script
 * @returns {object} { valid: boolean, errors: string[] }
 */
export function validateLocalization(localizedScript, authoritativeScript) {
  const errors = [];
  
  if (!localizedScript) {
    errors.push('Localized script is null or undefined');
    return { valid: false, errors };
  }
  
  if (!authoritativeScript) {
    errors.push('Authoritative script is null or undefined');
    return { valid: false, errors };
  }
  
  // Verify source reference
  if (localizedScript.sourceScriptId !== authoritativeScript.id) {
    errors.push(
      `Source script ID mismatch: localization references ${localizedScript.sourceScriptId}, ` +
      `but authoritative script is ${authoritativeScript.id}`
    );
  }
  
  // Verify segment count
  if (localizedScript.segments.length !== authoritativeScript.scriptSegments.length) {
    errors.push(
      `Segment count mismatch: EN has ${authoritativeScript.scriptSegments.length}, ` +
      `${localizedScript.language} has ${localizedScript.segments.length}`
    );
  }
  
  // Verify segment mappings
  localizedScript.segments.forEach((locSeg, index) => {
    if (locSeg.segmentIndex !== index) {
      errors.push(`Segment ${index}: index mismatch (expected ${index}, got ${locSeg.segmentIndex})`);
    }
    
    if (!locSeg.enSegmentRef) {
      errors.push(`Segment ${index}: missing EN segment reference`);
    }
    
    const enSegment = authoritativeScript.scriptSegments[index];
    if (enSegment && locSeg.type !== enSegment.type) {
      errors.push(
        `Segment ${index}: type mismatch (EN: ${enSegment.type}, ` +
        `${localizedScript.language}: ${locSeg.type})`
      );
    }
  });
  
  return {
    valid: errors.length === 0,
    errors
  };
}

/**
 * Generate localization prompt for LLM
 * @param {object} authoritativeScript - Authoritative EN script
 * @param {string} targetLang - Target language code
 * @returns {string} Prompt for LLM
 */
export function buildLocalizationPrompt(authoritativeScript, targetLang) {
  const langNames = {
    fr: 'French'
  };
  
  const targetLangName = langNames[targetLang] || targetLang;
  
  const segmentsText = authoritativeScript.scriptSegments
    .map((seg, index) => `[Segment ${index}: ${seg.type}]\n${seg.content}`)
    .join('\n\n---\n\n');
  
  return `You are a professional translator specializing in board game tutorial content.

Your task is to translate the following English tutorial script into ${targetLangName}.

CRITICAL REQUIREMENTS:
1. Maintain the EXACT same number of segments
2. Preserve segment types and ordering
3. Keep the same tone and style (friendly, instructional)
4. Use appropriate board game terminology in ${targetLangName}
5. Maintain clarity and accuracy
6. Do NOT add or remove segments
7. Do NOT change segment types

ENGLISH SCRIPT:

${segmentsText}

---

Please provide the translation in the following JSON format:

{
  "segments": [
    {
      "index": 0,
      "type": "segment_type",
      "content": "translated content here"
    },
    ...
  ]
}

Ensure the JSON is valid and contains exactly ${authoritativeScript.scriptSegments.length} segments.`;
}

/**
 * Parse LLM localization response
 * @param {string} response - LLM response text
 * @returns {Array<object>} Parsed segments
 */
export function parseLocalizationResponse(response) {
  // Try to extract JSON from response
  let jsonMatch = response.match(/\{[\s\S]*\}/);
  if (!jsonMatch) {
    throw new Error('No JSON found in localization response');
  }
  
  const parsed = JSON.parse(jsonMatch[0]);
  
  if (!parsed.segments || !Array.isArray(parsed.segments)) {
    throw new Error('Invalid localization response: missing segments array');
  }
  
  return parsed.segments;
}

/**
 * Check if localization is confirmed for a language
 * @param {object} authoritativeScript - Authoritative script with localizations
 * @param {string} targetLang - Target language code
 * @returns {boolean} True if localization is confirmed
 */
export function isLocalizationConfirmed(authoritativeScript, targetLang) {
  if (!authoritativeScript || !authoritativeScript.localizations) {
    return false;
  }
  
  const localization = authoritativeScript.localizations[targetLang];
  return !!(localization && localization.status === LocalizationStatus.CONFIRMED);
}

/**
 * Get confirmed localization for a language
 * @param {object} authoritativeScript - Authoritative script with localizations
 * @param {string} targetLang - Target language code
 * @returns {object|null} Confirmed localization or null
 */
export function getConfirmedLocalization(authoritativeScript, targetLang) {
  if (!isLocalizationConfirmed(authoritativeScript, targetLang)) {
    return null;
  }
  
  return authoritativeScript.localizations[targetLang];
}

export default {
  LocalizationErrorCode,
  createLocalizedScript,
  validateLocalization,
  buildLocalizationPrompt,
  parseLocalizationResponse,
  isLocalizationConfirmed,
  getConfirmedLocalization
};
