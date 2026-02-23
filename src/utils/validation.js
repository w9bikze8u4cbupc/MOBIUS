// src/utils/validation.js
// Lightweight validators for ingestion DTOs
// Defensive validation for hostile inputs

import path from 'path';
import crypto from 'crypto';

/**
 * Validation result structure
 */
export class ValidationResult {
  constructor(isValid = true, errors = [], warnings = []) {
    this.isValid = isValid;
    this.errors = errors;
    this.warnings = warnings;
  }

  addError(message, field = null) {
    this.isValid = false;
    this.errors.push({ message, field, timestamp: new Date().toISOString() });
    return this;
  }

  addWarning(message, field = null) {
    this.warnings.push({ message, field, timestamp: new Date().toISOString() });
    return this;
  }

  merge(other) {
    if (!other.isValid) {
      this.isValid = false;
    }
    this.errors.push(...other.errors);
    this.warnings.push(...other.warnings);
    return this;
  }
}

/**
 * Validate BGG ID
 * @param {*} bggId - BGG ID to validate
 * @returns {ValidationResult}
 */
export function validateBGGId(bggId) {
  const result = new ValidationResult();

  if (bggId === null || bggId === undefined || bggId === '') {
    return result.addError('BGG ID is required', 'bggId');
  }

  const id = String(bggId).trim();

  // Check for SQL injection patterns
  if (/['";\\]|--|\bOR\b|\bAND\b|\bDROP\b|\bSELECT\b/i.test(id)) {
    return result.addError('BGG ID contains suspicious characters', 'bggId');
  }

  // Must be numeric
  if (!/^\d+$/.test(id)) {
    return result.addError('BGG ID must be numeric', 'bggId');
  }

  // Reasonable range (BGG IDs are typically 1-7 digits)
  const numId = parseInt(id, 10);
  if (numId < 1 || numId > 9999999) {
    return result.addError('BGG ID out of valid range (1-9999999)', 'bggId');
  }

  return result;
}

/**
 * Validate BGG URL
 * @param {string} url - BGG URL to validate
 * @returns {ValidationResult}
 */
export function validateBGGUrl(url) {
  const result = new ValidationResult();

  if (!url || typeof url !== 'string') {
    return result.addError('BGG URL must be a string', 'bggUrl');
  }

  const trimmed = url.trim();

  // Check for XSS patterns
  if (/<script|javascript:|onerror=|onload=/i.test(trimmed)) {
    return result.addError('BGG URL contains suspicious patterns', 'bggUrl');
  }

  // Must be a valid BGG URL
  if (!trimmed.includes('boardgamegeek.com')) {
    return result.addError('URL must be from boardgamegeek.com', 'bggUrl');
  }

  // Must use HTTPS
  if (!trimmed.startsWith('https://')) {
    result.addWarning('BGG URL should use HTTPS', 'bggUrl');
  }

  // Extract and validate ID from URL
  const idMatch = trimmed.match(/\/boardgame\/(\d+)/);
  if (!idMatch) {
    return result.addError('Could not extract game ID from BGG URL', 'bggUrl');
  }

  // Validate the extracted ID
  const idValidation = validateBGGId(idMatch[1]);
  result.merge(idValidation);

  return result;
}

/**
 * Validate PDF file path
 * @param {string} filePath - File path to validate
 * @returns {ValidationResult}
 */
export function validatePDFPath(filePath) {
  const result = new ValidationResult();

  if (!filePath || typeof filePath !== 'string') {
    return result.addError('PDF path must be a string', 'pdfPath');
  }

  const trimmed = filePath.trim();

  // Check for path traversal attacks
  if (/\.\.\/|\.\.\\/.test(trimmed)) {
    return result.addError('PDF path contains path traversal patterns', 'pdfPath');
  }

  // Check for null bytes
  if (trimmed.includes('\0')) {
    return result.addError('PDF path contains null bytes', 'pdfPath');
  }

  // Must end with .pdf
  if (!trimmed.toLowerCase().endsWith('.pdf')) {
    return result.addError('File must be a PDF', 'pdfPath');
  }

  // Check for excessively long paths
  if (trimmed.length > 500) {
    return result.addError('PDF path is too long', 'pdfPath');
  }

  return result;
}

/**
 * Validate AI response JSON
 * @param {string} jsonString - JSON string to validate
 * @param {object} schema - Expected schema (optional)
 * @returns {ValidationResult}
 */
export function validateAIResponseJSON(jsonString, schema = null) {
  const result = new ValidationResult();

  if (!jsonString || typeof jsonString !== 'string') {
    return result.addError('AI response must be a string', 'aiResponse');
  }

  // Check for excessively large responses (potential DoS)
  if (jsonString.length > 1000000) { // 1MB limit
    return result.addError('AI response is too large', 'aiResponse');
  }

  // Try to parse JSON
  let parsed;
  try {
    parsed = JSON.parse(jsonString);
  } catch (e) {
    return result.addError(`Invalid JSON: ${e.message}`, 'aiResponse');
  }

  // Check for null or undefined
  if (parsed === null || parsed === undefined) {
    return result.addError('AI response is null or undefined', 'aiResponse');
  }

  // Validate against schema if provided
  if (schema) {
    const schemaValidation = validateAgainstSchema(parsed, schema);
    result.merge(schemaValidation);
  }

  return result;
}

/**
 * Validate object against a simple schema
 * @param {object} obj - Object to validate
 * @param {object} schema - Schema definition
 * @returns {ValidationResult}
 */
export function validateAgainstSchema(obj, schema) {
  const result = new ValidationResult();

  if (typeof obj !== 'object' || obj === null) {
    return result.addError('Value must be an object', 'schema');
  }

  // Check required fields
  if (schema.required) {
    schema.required.forEach(field => {
      if (!(field in obj)) {
        result.addError(`Missing required field: ${field}`, field);
      }
    });
  }

  // Check field types
  if (schema.properties) {
    Object.keys(schema.properties).forEach(field => {
      if (field in obj) {
        const expectedType = schema.properties[field].type;
        const actualType = Array.isArray(obj[field]) ? 'array' : typeof obj[field];

        if (expectedType && actualType !== expectedType) {
          result.addError(
            `Field "${field}" should be ${expectedType}, got ${actualType}`,
            field
          );
        }
      }
    });
  }

  return result;
}

/**
 * Validate component object
 * @param {object} component - Component to validate
 * @returns {ValidationResult}
 */
export function validateComponent(component) {
  const result = new ValidationResult();

  if (!component || typeof component !== 'object') {
    return result.addError('Component must be an object', 'component');
  }

  // Name is required
  if (!component.name || typeof component.name !== 'string') {
    result.addError('Component name is required and must be a string', 'name');
  } else {
    // Check for suspicious patterns in name
    if (/<script|javascript:|onerror=/i.test(component.name)) {
      result.addError('Component name contains suspicious patterns', 'name');
    }

    // Check for excessively long names
    if (component.name.length > 200) {
      result.addWarning('Component name is very long', 'name');
    }
  }

  // Quantity validation (if present)
  if (component.quantity !== null && component.quantity !== undefined) {
    const qtyStr = String(component.quantity);
    
    // Allow numbers or ranges like "2-4"
    if (!/^\d+$|^\d+-\d+$/.test(qtyStr)) {
      result.addWarning('Component quantity should be a number or range', 'quantity');
    }
  }

  return result;
}

/**
 * Validate metadata object
 * @param {object} metadata - Metadata to validate
 * @returns {ValidationResult}
 */
export function validateMetadata(metadata) {
  const result = new ValidationResult();

  if (!metadata || typeof metadata !== 'object') {
    return result.addError('Metadata must be an object', 'metadata');
  }

  // Validate common fields
  const stringFields = ['title', 'publisher', 'designer', 'artist'];
  stringFields.forEach(field => {
    if (field in metadata && typeof metadata[field] !== 'string') {
      result.addError(`${field} must be a string`, field);
    }
  });

  // Validate year
  if ('year' in metadata) {
    const year = parseInt(metadata.year, 10);
    if (isNaN(year) || year < 1800 || year > new Date().getFullYear() + 5) {
      result.addWarning('Year seems out of valid range', 'year');
    }
  }

  // Validate player count
  if ('player_count' in metadata) {
    const pc = String(metadata.player_count);
    if (!/^\d+(-\d+)?(\+)?$/.test(pc)) {
      result.addWarning('Player count format may be invalid', 'player_count');
    }
  }

  return result;
}

/**
 * Sanitize string input (remove dangerous characters)
 * @param {string} input - Input string
 * @param {object} options - Sanitization options
 * @returns {string} Sanitized string
 */
export function sanitizeString(input, options = {}) {
  if (typeof input !== 'string') {
    return '';
  }

  let sanitized = input;

  // Remove null bytes
  sanitized = sanitized.replace(/\0/g, '');

  // Remove control characters (except newlines/tabs if allowed)
  if (!options.allowNewlines) {
    sanitized = sanitized.replace(/[\x00-\x1F\x7F]/g, '');
  } else {
    sanitized = sanitized.replace(/[\x00-\x08\x0B-\x0C\x0E-\x1F\x7F]/g, '');
  }

  // Remove HTML tags if not allowed
  if (!options.allowHTML) {
    sanitized = sanitized.replace(/<[^>]*>/g, '');
  }

  // Trim whitespace
  sanitized = sanitized.trim();

  // Limit length
  if (options.maxLength && sanitized.length > options.maxLength) {
    sanitized = sanitized.substring(0, options.maxLength);
  }

  return sanitized;
}

/**
 * Validate a patch object against patchable fields
 * @param {object} patch - Patch object with field paths and values
 * @param {object} patchableFields - Patchable fields definition
 * @returns {ValidationResult}
 */
export function validatePatch(patch, patchableFields) {
  const result = new ValidationResult();

  if (!patch || typeof patch !== 'object') {
    return result.addError('Patch must be an object', 'patch');
  }

  // Validate each patch entry
  for (const [fieldPath, value] of Object.entries(patch)) {
    const fieldDef = patchableFields[fieldPath];

    if (!fieldDef) {
      result.addError(`Field "${fieldPath}" is not patchable`, fieldPath);
      continue;
    }

    // Type validation
    const actualType = Array.isArray(value) ? 'array' : typeof value;
    if (actualType !== fieldDef.type) {
      result.addError(
        `Field "${fieldPath}" must be ${fieldDef.type}, got ${actualType}`,
        fieldPath
      );
      continue;
    }

    // String length validation
    if (fieldDef.type === 'string' && fieldDef.maxLength) {
      if (value.length > fieldDef.maxLength) {
        result.addError(
          `Field "${fieldPath}" exceeds max length ${fieldDef.maxLength}`,
          fieldPath
        );
        continue;
      }
    }

    // Number range validation
    if (fieldDef.type === 'number') {
      if (fieldDef.min !== undefined && value < fieldDef.min) {
        result.addError(
          `Field "${fieldPath}" must be >= ${fieldDef.min}`,
          fieldPath
        );
        continue;
      }
      if (fieldDef.max !== undefined && value > fieldDef.max) {
        result.addError(
          `Field "${fieldPath}" must be <= ${fieldDef.max}`,
          fieldPath
        );
        continue;
      }
    }

    // Array length validation
    if (fieldDef.type === 'array' && fieldDef.maxItems) {
      if (value.length > fieldDef.maxItems) {
        result.addError(
          `Field "${fieldPath}" exceeds max items ${fieldDef.maxItems}`,
          fieldPath
        );
        continue;
      }
    }

    // Custom validator
    if (fieldDef.validator) {
      const customResult = fieldDef.validator(value);
      if (!customResult.isValid) {
        result.merge(customResult);
        continue;
      }
    }
  }

  return result;
}

/**
 * Apply a validated patch to an ingestion report (mutates report)
 * @param {object} report - Ingestion report
 * @param {object} patch - Validated patch object
 */
export function applyPatchToReport(report, patch) {
  for (const [fieldPath, value] of Object.entries(patch)) {
    const parts = fieldPath.split('.');
    let current = report;

    // Navigate to parent object
    for (let i = 0; i < parts.length - 1; i++) {
      if (!current[parts[i]]) {
        current[parts[i]] = {};
      }
      current = current[parts[i]];
    }

    // Set value
    const lastPart = parts[parts.length - 1];
    const oldValue = current[lastPart];
    current[lastPart] = value;

    // Update metadata if field object exists
    const fieldObj = current;
    if (fieldObj && typeof fieldObj === 'object' && fieldObj.metadata) {
      fieldObj.metadata.patchedAt = new Date().toISOString();
      fieldObj.metadata.originalValue = oldValue;
    }
  }
}

/**
 * Validate extractor input/output paths
 * Prevents path traversal and enforces canonical storage roots
 * @param {string} targetPath - Path to validate
 * @param {string} projectId - Project ID for scoping
 * @param {object} options - Validation options
 * @returns {Promise<ValidationResult>}
 */
export async function validateExtractorPath(targetPath, projectId, options = {}) {
  const result = new ValidationResult();

  if (!targetPath || typeof targetPath !== 'string') {
    return result.addError('Path must be a non-empty string', 'path');
  }

  const trimmed = targetPath.trim();

  // Check for path traversal attacks
  if (/\.\.\/|\.\.\\/.test(trimmed)) {
    return result.addError('Path contains path traversal patterns', 'path');
  }

  // Check for null bytes
  if (trimmed.includes('\0')) {
    return result.addError('Path contains null bytes', 'path');
  }

  // Check for absolute paths (should be relative within project)
  if (path.isAbsolute(trimmed) && !options.allowAbsolute) {
    return result.addError('Path must be relative to project directory', 'path');
  }

  // Check for excessively long paths
  if (trimmed.length > 500) {
    return result.addError('Path is too long', 'path');
  }

  // Validate against canonical project directory
  if (projectId && !options.skipCanonicalCheck) {
    const { getDataDirs } = await import('../config/storage.mjs');
    const dataDirs = getDataDirs();
    const projectDir = path.join(dataDirs.uploads, `project_${projectId}`);
    
    // Resolve path and check it's within project directory
    const resolvedPath = path.resolve(projectDir, trimmed);
    const normalizedProjectDir = path.normalize(projectDir);
    
    if (!resolvedPath.startsWith(normalizedProjectDir)) {
      return result.addError(
        'Path must be within canonical project directory',
        'path'
      );
    }
  }

  // Check for suspicious patterns
  const suspiciousPatterns = [
    /\bsystem32\b/i,
    /\betc\/passwd\b/i,
    /\bproc\//i,
    /\bdev\//i,
    /\$\{/,  // Template injection
    /`/,     // Command injection
  ];

  for (const pattern of suspiciousPatterns) {
    if (pattern.test(trimmed)) {
      return result.addError('Path contains suspicious patterns', 'path');
    }
  }

  return result;
}

/**
 * Sanitize extractor manifest
 * Validates and sanitizes manifest from untrusted extractor
 * @param {object} manifest - Raw manifest from extractor
 * @param {string} projectId - Project ID for path validation
 * @returns {Promise<object>} { valid: boolean, sanitized: object, errors: Array }
 */
export async function sanitizeExtractorManifest(manifest, projectId) {
  const errors = [];
  
  if (!manifest || typeof manifest !== 'object') {
    return {
      valid: false,
      sanitized: null,
      errors: ['Manifest must be an object']
    };
  }

  // Validate version
  if (!manifest.version || typeof manifest.version !== 'string') {
    errors.push('Manifest must have a version string');
  }

  // Validate images array
  if (!Array.isArray(manifest.images)) {
    return {
      valid: false,
      sanitized: null,
      errors: ['Manifest must have an images array']
    };
  }

  // Sanitize each image entry
  const sanitizedImages = [];
  
  for (let i = 0; i < manifest.images.length; i++) {
    const img = manifest.images[i];
    
    // Validate required fields
    if (!img.filename || typeof img.filename !== 'string') {
      errors.push(`Image ${i}: filename is required`);
      continue;
    }

    if (!img.relativePath || typeof img.relativePath !== 'string') {
      errors.push(`Image ${i}: relativePath is required`);
      continue;
    }

    // Validate path
    const pathValidation = await validateExtractorPath(img.relativePath, projectId);
    if (!pathValidation.isValid) {
      errors.push(`Image ${i}: ${pathValidation.errors[0].message}`);
      continue;
    }

    // Sanitize and normalize
    sanitizedImages.push({
      id: img.id || crypto.randomUUID(),
      filename: sanitizeString(img.filename, { maxLength: 255 }),
      relativePath: img.relativePath,
      pageNumber: typeof img.pageNumber === 'number' ? img.pageNumber : null,
      boundingBox: img.boundingBox && typeof img.boundingBox === 'object' 
        ? {
            x: Number(img.boundingBox.x) || 0,
            y: Number(img.boundingBox.y) || 0,
            width: Number(img.boundingBox.width) || 0,
            height: Number(img.boundingBox.height) || 0
          }
        : null,
      confidence: typeof img.confidence === 'number' 
        ? Math.max(0, Math.min(1, img.confidence))
        : null,
      detectedType: sanitizeString(img.detectedType || 'unknown', { maxLength: 50 }),
      hash: img.hash && typeof img.hash === 'string' 
        ? sanitizeString(img.hash, { maxLength: 128 })
        : null,
      metadata: img.metadata && typeof img.metadata === 'object'
        ? img.metadata
        : {}
    });
  }

  // Limit number of images (prevent DoS)
  if (sanitizedImages.length > 500) {
    errors.push('Manifest contains too many images (max 500)');
    return {
      valid: false,
      sanitized: null,
      errors
    };
  }

  const sanitized = {
    version: sanitizeString(manifest.version, { maxLength: 20 }),
    extractedAt: manifest.extractedAt || new Date().toISOString(),
    pdfPath: manifest.pdfPath 
      ? sanitizeString(manifest.pdfPath, { maxLength: 500 })
      : null,
    pdfHash: manifest.pdfHash 
      ? sanitizeString(manifest.pdfHash, { maxLength: 128 })
      : null,
    images: sanitizedImages,
    stats: manifest.stats && typeof manifest.stats === 'object'
      ? {
          totalPages: Number(manifest.stats.totalPages) || 0,
          imagesExtracted: sanitizedImages.length,
          averageConfidence: Number(manifest.stats.averageConfidence) || null
        }
      : null
  };

  return {
    valid: errors.length === 0,
    sanitized,
    errors
  };
}

export default {
  ValidationResult,
  validateBGGId,
  validateBGGUrl,
  validatePDFPath,
  validateAIResponseJSON,
  validateAgainstSchema,
  validateComponent,
  validateMetadata,
  sanitizeString,
  validatePatch,
  applyPatchToReport,
  validateExtractorPath,
  sanitizeExtractorManifest
};
