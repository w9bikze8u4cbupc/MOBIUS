// src/render/subtitles.js
// SRT subtitle generation from script segments
// PHASE P1-B: Support for multi-language captions

import { promises as fs } from 'fs';
import path from 'path';
import { getConfirmedLocalization, isLocalizationConfirmed } from '../utils/scriptLocalization.js';
import { SupportedLanguages } from '../utils/scriptArtifact.js';

/**
 * Format time in SRT format (HH:MM:SS,mmm)
 * @param {number} seconds - Time in seconds
 * @returns {string} Formatted time string
 */
function formatSrtTime(seconds) {
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const secs = Math.floor(seconds % 60);
  const millis = Math.floor((seconds % 1) * 1000);
  
  return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(secs).padStart(2, '0')},${String(millis).padStart(3, '0')}`;
}

/**
 * Generate SRT content from script segments
 * @param {Array<object>} segments - Script segments with timing
 * @returns {string} SRT formatted content
 */
export function generateSrtContent(segments) {
  if (!segments || segments.length === 0) {
    throw new Error('No segments provided for SRT generation');
  }
  
  let srtContent = '';
  
  segments.forEach((segment, index) => {
    // SRT index (1-based)
    srtContent += `${index + 1}\n`;
    
    // Timing
    const startTime = formatSrtTime(segment.startTime || 0);
    const endTime = formatSrtTime(segment.endTime || segment.startTime + 5);
    srtContent += `${startTime} --> ${endTime}\n`;
    
    // Text content
    srtContent += `${segment.content}\n`;
    
    // Blank line separator
    srtContent += '\n';
  });
  
  return srtContent;
}

/**
 * Write SRT file to disk
 * @param {string} outputPath - Path where SRT file will be written
 * @param {string} content - SRT content
 * @returns {Promise<string>} Path to written file
 */
export async function writeSrtFile(outputPath, content) {
  await fs.writeFile(outputPath, content, 'utf-8');
  return outputPath;
}

/**
 * Generate SRT file from script artifact
 * @param {object} script - Script artifact (authoritative or localized)
 * @param {string} outputDir - Output directory
 * @param {string} language - Language code ('en' or 'fr')
 * @returns {Promise<string>} Path to generated SRT file
 */
export async function generateSrtFromScript(script, outputDir, language = 'en') {
  if (!script) {
    throw new Error('No script provided for SRT generation');
  }
  
  let segments;
  let filename;
  
  if (language === SupportedLanguages.EN) {
    // Use authoritative EN script
    segments = script.scriptSegments || [];
    filename = 'captions_en.srt';
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
    filename = 'captions_fr.srt';
  } else {
    throw new Error(`Unsupported language: ${language}`);
  }
  
  if (segments.length === 0) {
    throw new Error(`No segments found for language: ${language}`);
  }
  
  // Generate SRT content
  const srtContent = generateSrtContent(segments);
  
  // Write to file
  const outputPath = path.join(outputDir, filename);
  await writeSrtFile(outputPath, srtContent);
  
  console.log(`✅ Generated ${language} SRT: ${outputPath}`);
  
  return outputPath;
}

/**
 * Get available caption languages for a script
 * @param {object} script - Script artifact
 * @returns {Array<string>} Array of available language codes
 */
export function getAvailableCaptionLanguages(script) {
  if (!script) {
    return [];
  }
  
  const languages = ['en']; // EN is always available if script exists
  
  // Check for confirmed localizations
  if (script.localizations) {
    Object.keys(script.localizations).forEach(lang => {
      if (isLocalizationConfirmed(script, lang)) {
        languages.push(lang);
      }
    });
  }
  
  return languages;
}

export default {
  formatSrtTime,
  generateSrtContent,
  writeSrtFile,
  generateSrtFromScript,
  getAvailableCaptionLanguages
};
