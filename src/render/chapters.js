// src/render/chapters.js
// Chapter/timestamp generation from authoritative script segments
// PHASE PRO-V0: Publishable packaging with chapters export

import { promises as fs } from 'fs';
import path from 'path';
import { getConfirmedLocalization, isLocalizationConfirmed } from '../utils/scriptLocalization.js';
import { SupportedLanguages } from '../utils/scriptArtifact.js';

/**
 * Generate chapter title from segment
 * @param {object} segment - Script segment
 * @param {number} index - Segment index
 * @returns {string} Chapter title
 */
export function generateChapterTitle(segment, index) {
  // Map segment types to readable chapter titles
  const typeToTitle = {
    introduction: 'Introduction',
    component_overview: 'Components',
    setup: 'Setup',
    turn_structure: 'Turn Structure',
    gameplay: 'Gameplay',
    scoring: 'Scoring',
    winning: 'Winning',
    conclusion: 'Conclusion'
  };
  
  // Use type-based title or fallback to generic
  const baseTitle = typeToTitle[segment.type] || `Chapter ${index + 1}`;
  
  return baseTitle;
}

/**
 * Generate chapters JSON from script segments
 * @param {Array<object>} segments - Script segments with timing
 * @param {string} language - Language code for titles
 * @returns {Array<object>} Array of chapter objects
 */
export function generateChaptersFromSegments(segments, language = 'en') {
  if (!segments || segments.length === 0) {
    throw new Error('No segments provided for chapter generation');
  }
  
  const chapters = segments.map((segment, index) => {
    return {
      title: generateChapterTitle(segment, index),
      startTimeSeconds: segment.startTime || 0,
      endTimeSeconds: segment.endTime || (segment.startTime || 0) + 5,
      segmentType: segment.type,
      segmentIndex: index
    };
  });
  
  return chapters;
}

/**
 * Generate chapters JSON file from script artifact
 * @param {object} script - Script artifact (authoritative or localized)
 * @param {string} outputDir - Output directory
 * @param {string} language - Language code ('en' or 'fr')
 * @returns {Promise<string>} Path to generated chapters file
 */
export async function generateChaptersFromScript(script, outputDir, language = 'en') {
  if (!script) {
    throw new Error('No script provided for chapter generation');
  }
  
  let segments;
  let filename;
  
  if (language === SupportedLanguages.EN) {
    // Use authoritative EN script
    segments = script.scriptSegments || [];
    filename = 'chapters_en.json';
  } else if (language === SupportedLanguages.FR) {
    // Use FR localization
    if (!isLocalizationConfirmed(script, language)) {
      throw new Error(
        `French localization is not confirmed. ` +
        `Localization must be confirmed via CONFIRM_LOCALIZATION_FR gate before rendering.`
      );
    }
    
    const localization = getConfirmedLocalization(script, language);
    segments = localization.segments || [];
    filename = 'chapters_fr.json';
  } else {
    throw new Error(`Unsupported language: ${language}`);
  }
  
  if (segments.length === 0) {
    throw new Error(`No segments found for language: ${language}`);
  }
  
  // Generate chapters
  const chapters = generateChaptersFromSegments(segments, language);
  
  // Create chapters object with metadata
  const chaptersData = {
    version: '1.0',
    language,
    generatedAt: new Date().toISOString(),
    totalChapters: chapters.length,
    chapters
  };
  
  // Write to file
  const outputPath = path.join(outputDir, filename);
  await fs.writeFile(outputPath, JSON.stringify(chaptersData, null, 2), 'utf-8');
  
  console.log(`✅ Generated ${language} chapters: ${outputPath}`);
  
  return outputPath;
}

export default {
  generateChapterTitle,
  generateChaptersFromSegments,
  generateChaptersFromScript
};
