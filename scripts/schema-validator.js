#!/usr/bin/env node

/**
 * JSON Schema validator for storyboard and timeline
 * Uses Ajv for validation
 */

import { readFileSync } from 'fs';
import { join } from 'path';

import Ajv from 'ajv';

// Storyboard schema
const storyboardSchema = {
  type: 'object',
  required: ['storyboard'],
  properties: {
    storyboard: {
      type: 'object',
      required: ['id', 'languageDefault', 'title', 'scenes', 'totalDurationSec'],
      properties: {
        id: { type: 'string' },
        languageDefault: { type: 'string' },
        voice: { type: ['string', 'null'] },
        title: { type: 'string' },
        publishers: { type: 'array', items: { type: 'string' } },
        designers: { type: 'array', items: { type: 'string' } },
        scenes: {
          type: 'array',
          items: {
            type: 'object',
            required: ['id', 'key', 'title', 'titleFr', 'segments'],
            properties: {
              id: { type: 'string' },
              key: { type: 'string' },
              title: { type: 'string' },
              titleFr: { type: 'string' },
              segments: {
                type: 'array',
                items: {
                  type: 'object',
                  required: ['id', 'durationSec', 'textEn', 'textFr'],
                  properties: {
                    id: { type: 'string' },
                    durationSec: { type: 'number', minimum: 0 },
                    image: { type: ['object', 'null'] },
                    textEn: { type: 'string' },
                    textFr: { type: 'string' },
                  },
                },
              },
            },
          },
        },
        totalDurationSec: { type: 'number', minimum: 0 },
        timingMeta: {
          type: 'object',
          properties: {
            baseTotalSec: { type: 'number', minimum: 0 },
            targetTotalSec: { type: 'number', minimum: 0 },
            wordCount: { type: 'number', minimum: 0 },
            wpm: { type: 'number', minimum: 0 },
            visualFactor: { type: 'number', minimum: 0 },
          },
        },
      },
    },
  },
};

// Timeline schema (new format)
const timelineSchema = {
  type: 'object',
  required: ['timeline'],
  properties: {
    timeline: {
      type: 'array',
      items: {
        type: 'object',
        required: ['id', 'type', 'start', 'end'],
        properties: {
          id: { type: 'string' },
          type: { type: 'string' },
          start: { type: 'number', minimum: 0 },
          end: { type: 'number', minimum: 0 },
          data: { type: 'object' },
        },
      },
    },
  },
};

// Timeline schema (old format)
const oldTimelineSchema = {
  type: 'object',
  required: ['fps', 'width', 'height', 'tracks'],
  properties: {
    fps: { type: 'number', minimum: 1 },
    width: { type: 'number', minimum: 1 },
    height: { type: 'number', minimum: 1 },
    tracks: {
      type: 'array',
      items: {
        type: 'object',
        required: ['type', 'clips'],
        properties: {
          type: { type: 'string' },
          clips: {
            type: 'array',
            items: {
              type: 'object',
              required: ['type', 'src', 'start'],
              properties: {
                type: { type: 'string' },
                src: { type: 'string' },
                start: { type: 'number', minimum: 0 },
                duration: { type: ['number', 'null'], minimum: 0 },
              },
            },
          },
        },
      },
    },
  },
};

// Initialize Ajv
const ajv = new Ajv({ allErrors: true });

// Compile schemas
const validateStoryboard = ajv.compile(storyboardSchema);
const validateTimeline = ajv.compile(timelineSchema);
const validateOldTimeline = ajv.compile(oldTimelineSchema);

// Validation functions
function validateStoryboardFile(filePath) {
  try {
    const data = JSON.parse(readFileSync(filePath, 'utf8'));
    const valid = validateStoryboard(data);

    if (valid) {
      console.log(`✅ Storyboard validation passed for ${filePath}`);
      return true;
    } else {
      console.log(`❌ Storyboard validation failed for ${filePath}:`);
      validateStoryboard.errors.forEach((error) => {
        console.log(`  - ${error.instancePath} ${error.message}`);
      });
      return false;
    }
  } catch (error) {
    console.log(`❌ Error reading or parsing storyboard file ${filePath}: ${error.message}`);
    return false;
  }
}

function validateTimelineFile(filePath) {
  try {
    const data = JSON.parse(readFileSync(filePath, 'utf8'));

    // Try new format first
    let valid = validateTimeline(data);
    let schemaName = 'new timeline';

    // If new format fails, try old format
    if (!valid) {
      valid = validateOldTimeline(data);
      schemaName = 'old timeline';
    }

    if (valid) {
      console.log(`✅ ${schemaName} validation passed for ${filePath}`);
      return true;
    } else {
      console.log(`❌ ${schemaName} validation failed for ${filePath}:`);
      const errors =
        schemaName === 'new timeline' ? validateTimeline.errors : validateOldTimeline.errors;
      errors.forEach((error) => {
        console.log(`  - ${error.instancePath} ${error.message}`);
      });
      return false;
    }
  } catch (error) {
    console.log(`❌ Error reading or parsing timeline file ${filePath}: ${error.message}`);
    return false;
  }
}

// Middleware function for Express
function validateStoryboardMiddleware(req, res, next) {
  const { storyboard } = req.body;

  if (!storyboard) {
    return res.status(400).json({ error: 'Storyboard is required' });
  }

  const valid = validateStoryboard({ storyboard });

  if (valid) {
    next();
  } else {
    const errors = validateStoryboard.errors.map((error) => ({
      path: error.instancePath,
      message: error.message,
    }));
    return res.status(400).json({
      error: 'Invalid storyboard format',
      details: errors,
    });
  }
}

function validateTimelineMiddleware(req, res, next) {
  const { timeline } = req.body;

  if (!timeline) {
    return res.status(400).json({ error: 'Timeline is required' });
  }

  // Try new format first
  let valid = validateTimeline({ timeline });

  // If new format fails, try old format
  if (!valid) {
    valid = validateOldTimeline(req.body);
  }

  if (valid) {
    next();
  } else {
    const errors = validateTimeline.errors || validateOldTimeline.errors;
    const errorDetails = errors.map((error) => ({
      path: error.instancePath,
      message: error.message,
    }));
    return res.status(400).json({
      error: 'Invalid timeline format',
      details: errorDetails,
    });
  }
}

// CLI function
async function runValidation() {
  const args = process.argv.slice(2);

  if (args.length === 0) {
    console.log('Usage: node schema-validator.js <file1.json> [file2.json] ...');
    console.log('       node schema-validator.js --storyboard <file.json>');
    console.log('       node schema-validator.js --timeline <file.json>');
    process.exit(1);
  }

  let validationFunction = validateStoryboardFile;
  let files = [];

  if (args[0] === '--storyboard' || args[0] === '--timeline') {
    validationFunction = args[0] === '--storyboard' ? validateStoryboardFile : validateTimelineFile;
    files = args.slice(1);
  } else {
    files = args;
  }

  let allPassed = true;

  for (const file of files) {
    const passed = validationFunction(file);
    if (!passed) {
      allPassed = false;
    }
  }

  if (allPassed) {
    console.log('\n🎉 All files passed validation!');
    process.exit(0);
  } else {
    console.log('\n❌ Some files failed validation.');
    process.exit(1);
  }
}

// Export functions
export {
  validateStoryboardFile,
  validateTimelineFile,
  validateStoryboardMiddleware,
  validateTimelineMiddleware,
  runValidation,
};

// Run CLI if called directly
if (import.meta.url === `file://${process.argv[1]}`) {
  runValidation().catch((error) => {
    console.error('Validation failed with error:', error);
    process.exit(1);
  });
}
