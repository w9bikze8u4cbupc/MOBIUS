// src/utils/confidence.js
// Confidence scoring heuristics and normalization for ingestion claims
// All ingestion outputs are treated as "claims" requiring operator confirmation

/**
 * Confidence levels with semantic meaning
 */
export const ConfidenceLevel = {
  HIGH: 'high',       // 0.8-1.0: Strong evidence, multiple sources agree
  MEDIUM: 'medium',   // 0.5-0.79: Reasonable evidence, some ambiguity
  LOW: 'low',         // 0.2-0.49: Weak evidence, significant uncertainty
  NONE: 'none'        // 0.0-0.19: No evidence or failed extraction
};

/**
 * Normalize a raw confidence score (0-1) to a confidence level
 * @param {number} score - Raw confidence score between 0 and 1
 * @returns {string} ConfidenceLevel
 */
export function normalizeConfidence(score) {
  if (score >= 0.8) return ConfidenceLevel.HIGH;
  if (score >= 0.5) return ConfidenceLevel.MEDIUM;
  if (score >= 0.2) return ConfidenceLevel.LOW;
  return ConfidenceLevel.NONE;
}

/**
 * Calculate confidence for BGG metadata field
 * @param {*} value - The field value
 * @param {object} context - Additional context (e.g., API response status)
 * @returns {object} { score: number, level: string, warnings: string[] }
 */
export function calculateBGGFieldConfidence(value, context = {}) {
  const warnings = [];
  let score = 0.5; // Default medium confidence for BGG API
  
  // No value = no confidence
  if (value === null || value === undefined || value === '') {
    warnings.push('Field is empty or missing');
    return { score: 0.0, level: ConfidenceLevel.NONE, warnings };
  }
  
  // Check for placeholder/error values
  const strValue = String(value).toLowerCase();
  if (strValue.includes('not found') || strValue.includes('n/a') || strValue === '?') {
    warnings.push('Field contains placeholder or error value');
    return { score: 0.1, level: ConfidenceLevel.NONE, warnings };
  }
  
  // BGG API is generally reliable when it returns data
  score = 0.85;
  
  // Reduce confidence for very old games (data may be incomplete)
  if (context.yearPublished && context.yearPublished < 1990) {
    score -= 0.1;
    warnings.push('Older game - metadata may be incomplete');
  }
  
  // Reduce confidence for games with few ratings
  if (context.usersRated && context.usersRated < 100) {
    score -= 0.15;
    warnings.push('Low rating count - metadata may be less reliable');
  }
  
  return {
    score: Math.max(0, Math.min(1, score)),
    level: normalizeConfidence(score),
    warnings
  };
}

/**
 * Calculate confidence for PDF extraction
 * @param {object} extractionResult - Result from PDF parser
 * @returns {object} { score: number, level: string, warnings: string[] }
 */
export function calculatePDFExtractionConfidence(extractionResult) {
  const warnings = [];
  let score = 0.5;
  
  const { source, text, textConfidence, parsedPages } = extractionResult;
  
  // OCR is inherently less reliable than native text extraction
  if (source === 'ocr') {
    score = 0.4;
    warnings.push('Text extracted via OCR - may contain errors');
  } else if (source === 'pdf-parse') {
    score = 0.8;
    warnings.push('Text extracted from native PDF');
  }
  
  // Very short text suggests extraction failure
  if (text && text.length < 100) {
    score *= 0.3;
    warnings.push('Very short text extracted - possible extraction failure');
  }
  
  // Check for low-text pages (likely image-heavy or scanned)
  if (parsedPages) {
    const lowTextPages = parsedPages.filter(p => (p.text || '').length < 200);
    if (lowTextPages.length > parsedPages.length * 0.5) {
      score *= 0.6;
      warnings.push(`${lowTextPages.length}/${parsedPages.length} pages have low text content`);
    }
  }
  
  // Use explicit textConfidence if provided
  if (textConfidence !== undefined && textConfidence !== null) {
    score = (score + textConfidence) / 2; // Average with explicit confidence
  }
  
  return {
    score: Math.max(0, Math.min(1, score)),
    level: normalizeConfidence(score),
    warnings
  };
}

/**
 * Calculate confidence for AI-extracted data
 * @param {object} aiResponse - Response from AI model
 * @param {object} context - Additional context (e.g., prompt, model)
 * @returns {object} { score: number, level: string, warnings: string[] }
 */
export function calculateAIConfidence(aiResponse, context = {}) {
  const warnings = [];
  let score = 0.6; // Default medium-low confidence for AI
  
  // Check if response is valid JSON
  if (context.expectedFormat === 'json') {
    try {
      if (typeof aiResponse === 'string') {
        JSON.parse(aiResponse);
      }
      score += 0.1;
    } catch (e) {
      score -= 0.3;
      warnings.push('AI response is not valid JSON');
    }
  }
  
  // Check for AI hedging language
  const hedgingPatterns = [
    /not sure/i,
    /unclear/i,
    /possibly/i,
    /might be/i,
    /could be/i,
    /appears to/i,
    /seems to/i
  ];
  
  const responseText = typeof aiResponse === 'string' ? aiResponse : JSON.stringify(aiResponse);
  const hedgingCount = hedgingPatterns.filter(p => p.test(responseText)).length;
  
  if (hedgingCount > 0) {
    score -= hedgingCount * 0.1;
    warnings.push(`AI response contains ${hedgingCount} hedging phrase(s)`);
  }
  
  // Check response length (very short = likely incomplete)
  if (responseText.length < 50) {
    score -= 0.2;
    warnings.push('AI response is very short - may be incomplete');
  }
  
  // AI hallucination warning (always present)
  warnings.push('AI-generated content - verify accuracy');
  
  return {
    score: Math.max(0, Math.min(1, score)),
    level: normalizeConfidence(score),
    warnings
  };
}

/**
 * Calculate confidence for component extraction
 * @param {object} component - Extracted component
 * @param {string} extractionMethod - Method used (e.g., 'header_based', 'fallback_scan')
 * @returns {object} { score: number, level: string, warnings: string[] }
 */
export function calculateComponentConfidence(component, extractionMethod) {
  const warnings = [];
  let score = component.confidence || 0.5;
  
  // Adjust based on extraction method
  const methodConfidence = {
    'quantity_first': 0.9,        // "7 Cards"
    'quantity_parentheses': 0.85, // "Cards (7)"
    'quantity_separator': 0.8,    // "Cards: 7"
    'of_each': 0.75,
    'per_player': 0.7,
    'space_separated': 0.65,
    'quantity_range': 0.6,
    'set_per_player': 0.7,
    'indefinite_quantity': 0.4,   // "several cards"
    'name_only': 0.3,
    'fallback': 0.1,
    'header_based': 0.8,
    'fallback_scan': 0.4
  };
  
  const methodScore = methodConfidence[component.parseMethod || extractionMethod] || 0.5;
  score = (score + methodScore) / 2;
  
  // Check for suspicious patterns
  if (!component.quantity) {
    score -= 0.1;
    warnings.push('No quantity specified');
  }
  
  if (component.name && component.name.length < 3) {
    score -= 0.2;
    warnings.push('Component name is very short');
  }
  
  if (component.note) {
    warnings.push(`Note: ${component.note}`);
  }
  
  return {
    score: Math.max(0, Math.min(1, score)),
    level: normalizeConfidence(score),
    warnings
  };
}

/**
 * Aggregate confidence scores from multiple sources
 * @param {Array<object>} confidenceScores - Array of { score, level, warnings }
 * @returns {object} Aggregated confidence
 */
export function aggregateConfidence(confidenceScores) {
  if (!confidenceScores || confidenceScores.length === 0) {
    return {
      score: 0.0,
      level: ConfidenceLevel.NONE,
      warnings: ['No confidence scores provided']
    };
  }
  
  // Calculate weighted average (can be customized)
  const avgScore = confidenceScores.reduce((sum, c) => sum + c.score, 0) / confidenceScores.length;
  
  // Collect all warnings
  const allWarnings = confidenceScores.flatMap(c => c.warnings || []);
  
  return {
    score: avgScore,
    level: normalizeConfidence(avgScore),
    warnings: [...new Set(allWarnings)] // Deduplicate
  };
}

export default {
  ConfidenceLevel,
  normalizeConfidence,
  calculateBGGFieldConfidence,
  calculatePDFExtractionConfidence,
  calculateAIConfidence,
  calculateComponentConfidence,
  aggregateConfidence
};
