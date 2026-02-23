// src/utils/scriptArtifact.js
// ScriptArtifact model: versioned, diffable, with provenance
// PHASE F: Scripts are derived artifacts with explicit operator authority

import crypto from 'crypto';

/**
 * Script artifact status
 */
export const ScriptStatus = {
  CANDIDATE: 'candidate',
  AUTHORITATIVE: 'authoritative',
  REJECTED: 'rejected'
};

/**
 * Localization status
 */
export const LocalizationStatus = {
  PENDING: 'pending',           // Generated but not reviewed
  CONFIRMED: 'confirmed',       // Reviewed and approved
  REJECTED: 'rejected'          // Rejected, needs revision
};

/**
 * Supported languages
 */
export const SupportedLanguages = {
  EN: 'en',  // English (authoritative)
  FR: 'fr'   // French (derived)
};

/**
 * Script segment types
 */
export const SegmentType = {
  INTRODUCTION: 'introduction',
  COMPONENT_OVERVIEW: 'component_overview',
  SETUP: 'setup',
  OBJECTIVE: 'objective',
  GAMEPLAY: 'gameplay',
  TURN_STRUCTURE: 'turn_structure',
  SPECIAL_RULES: 'special_rules',
  EXAMPLE_TURN: 'example_turn',
  END_GAME: 'end_game',
  SCORING: 'scoring',
  TIPS: 'tips',
  VARIANTS: 'variants',
  RECAP: 'recap'
};

/**
 * Create a hash of input data for provenance tracking
 * @param {object} inputs - Input data (ingestion report, metadata, etc.)
 * @returns {string} SHA-256 hash
 */
export function hashInputs(inputs) {
  const normalized = JSON.stringify(inputs, Object.keys(inputs).sort());
  return crypto.createHash('sha256').update(normalized).digest('hex');
}

/**
 * Create a hash of prompt for provenance tracking
 * @param {string} prompt - Prompt text
 * @returns {string} SHA-256 hash
 */
export function hashPrompt(prompt) {
  return crypto.createHash('sha256').update(prompt).digest('hex');
}

/**
 * Normalize script artifact shape
 * @param {object} data - Raw script artifact data
 * @returns {object} Normalized script artifact
 */
export function normalizeScriptArtifact(data) {
  return {
    id: data.id || crypto.randomUUID(),
    projectId: data.projectId,
    language: data.language || 'en',
    authoritativeLanguage: data.authoritativeLanguage || 'en', // Always EN
    status: data.status || ScriptStatus.CANDIDATE,
    createdAt: data.createdAt || new Date().toISOString(),
    model: data.model || 'gpt-4',
    promptHash: data.promptHash || null,
    inputsHash: data.inputsHash || null,
    scriptSegments: data.scriptSegments || [],
    rawScript: data.rawScript || null, // Full text for backward compatibility
    warnings: data.warnings || [],
    violations: data.violations || [],
    localizations: data.localizations || {}, // { fr: LocalizedScript, ... }
    metadata: {
      wordCount: data.metadata?.wordCount || 0,
      segmentCount: data.metadata?.segmentCount || 0,
      ...data.metadata
    }
  };
}

/**
 * Parse raw script text into structured segments
 * Simple heuristic-based parsing
 * @param {string} rawScript - Raw script text
 * @returns {Array<object>} Array of segments
 */
export function parseScriptSegments(rawScript) {
  if (!rawScript) return [];
  
  const segments = [];
  const lines = rawScript.split('\n');
  
  let currentSegment = null;
  let currentContent = [];
  
  // Common section headers (case-insensitive)
  const headerPatterns = {
    [SegmentType.INTRODUCTION]: /^(introduction|intro|welcome|opening)/i,
    [SegmentType.COMPONENT_OVERVIEW]: /^(component|components|what's in the box|contents)/i,
    [SegmentType.SETUP]: /^(setup|game setup|preparation|setting up)/i,
    [SegmentType.OBJECTIVE]: /^(objective|goal|how to win|winning)/i,
    [SegmentType.GAMEPLAY]: /^(gameplay|how to play|playing the game)/i,
    [SegmentType.TURN_STRUCTURE]: /^(turn structure|player turn|turn sequence|your turn)/i,
    [SegmentType.SPECIAL_RULES]: /^(special rules|key rules|important rules)/i,
    [SegmentType.EXAMPLE_TURN]: /^(example|example turn|sample turn)/i,
    [SegmentType.END_GAME]: /^(end game|ending|game end)/i,
    [SegmentType.SCORING]: /^(scoring|points|calculating score)/i,
    [SegmentType.TIPS]: /^(tips|strategy|advice|common mistakes)/i,
    [SegmentType.VARIANTS]: /^(variants|expansions|optional rules)/i,
    [SegmentType.RECAP]: /^(recap|summary|conclusion|closing)/i
  };
  
  for (const line of lines) {
    const trimmed = line.trim();
    
    // Check if this is a section header
    let isHeader = false;
    let segmentType = null;
    
    for (const [type, pattern] of Object.entries(headerPatterns)) {
      if (pattern.test(trimmed)) {
        isHeader = true;
        segmentType = type;
        break;
      }
    }
    
    if (isHeader && segmentType) {
      // Save previous segment
      if (currentSegment && currentContent.length > 0) {
        segments.push({
          type: currentSegment,
          content: currentContent.join('\n').trim()
        });
      }
      
      // Start new segment
      currentSegment = segmentType;
      currentContent = [];
    } else if (trimmed.length > 0) {
      // Add content to current segment
      currentContent.push(line);
    }
  }
  
  // Save final segment
  if (currentSegment && currentContent.length > 0) {
    segments.push({
      type: currentSegment,
      content: currentContent.join('\n').trim()
    });
  }
  
  // If no segments detected, treat entire script as one segment
  if (segments.length === 0 && rawScript.trim().length > 0) {
    segments.push({
      type: 'full_script',
      content: rawScript.trim()
    });
  }
  
  return segments;
}

/**
 * Calculate simple diff between two scripts (segment-level)
 * @param {object} oldScript - Old script artifact
 * @param {object} newScript - New script artifact
 * @returns {object} Diff summary
 */
export function calculateScriptDiff(oldScript, newScript) {
  const diff = {
    segmentsAdded: [],
    segmentsRemoved: [],
    segmentsModified: [],
    unchanged: []
  };
  
  if (!oldScript || !newScript) {
    return diff;
  }
  
  const oldSegments = oldScript.scriptSegments || [];
  const newSegments = newScript.scriptSegments || [];
  
  // Create maps by segment type
  const oldMap = new Map(oldSegments.map(s => [s.type, s.content]));
  const newMap = new Map(newSegments.map(s => [s.type, s.content]));
  
  // Find added segments
  for (const [type, content] of newMap) {
    if (!oldMap.has(type)) {
      diff.segmentsAdded.push({ type, content });
    }
  }
  
  // Find removed segments
  for (const [type, content] of oldMap) {
    if (!newMap.has(type)) {
      diff.segmentsRemoved.push({ type, content });
    }
  }
  
  // Find modified segments
  for (const [type, newContent] of newMap) {
    if (oldMap.has(type)) {
      const oldContent = oldMap.get(type);
      if (oldContent !== newContent) {
        diff.segmentsModified.push({
          type,
          oldContent,
          newContent,
          lengthDelta: newContent.length - oldContent.length
        });
      } else {
        diff.unchanged.push(type);
      }
    }
  }
  
  return diff;
}

/**
 * Validate script artifact structure
 * @param {object} artifact - Script artifact
 * @returns {object} { valid: boolean, errors: string[] }
 */
export function validateScriptArtifact(artifact) {
  const errors = [];
  
  if (!artifact) {
    errors.push('Script artifact is null or undefined');
    return { valid: false, errors };
  }
  
  if (!artifact.id) {
    errors.push('Script artifact missing id');
  }
  
  if (!artifact.projectId) {
    errors.push('Script artifact missing projectId');
  }
  
  if (!Object.values(ScriptStatus).includes(artifact.status)) {
    errors.push(`Invalid status: ${artifact.status}`);
  }
  
  if (!artifact.scriptSegments || !Array.isArray(artifact.scriptSegments)) {
    errors.push('Script artifact missing or invalid scriptSegments array');
  }
  
  if (artifact.violations && artifact.violations.length > 0 && artifact.status === ScriptStatus.AUTHORITATIVE) {
    errors.push('Cannot mark script with violations as authoritative');
  }
  
  return {
    valid: errors.length === 0,
    errors
  };
}

export default {
  ScriptStatus,
  LocalizationStatus,
  SupportedLanguages,
  SegmentType,
  hashInputs,
  hashPrompt,
  normalizeScriptArtifact,
  parseScriptSegments,
  calculateScriptDiff,
  validateScriptArtifact
};
