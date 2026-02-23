// src/utils/ingestionReport.js
// IngestionReport builder and serializer
// Treats all ingestion outputs as "claims" requiring operator confirmation

import { ConfidenceLevel, aggregateConfidence } from './confidence.js';

/**
 * Field status for operator truth gates
 */
export const FieldStatus = {
  PENDING: 'pending',       // Awaiting operator review
  CONFIRMED: 'confirmed',   // Operator confirmed as accurate
  CORRECTED: 'corrected',   // Operator corrected the value
  REJECTED: 'rejected'      // Operator rejected as inaccurate
};

/**
 * Ingestion source types
 */
export const SourceType = {
  BGG_API: 'bgg_api',
  PDF_NATIVE: 'pdf_native',
  PDF_OCR: 'pdf_ocr',
  AI_EXTRACTION: 'ai_extraction',
  USER_INPUT: 'user_input',
  FALLBACK: 'fallback'
};

/**
 * Create a field claim with source attribution and confidence
 * @param {string} fieldName - Name of the field
 * @param {*} value - Extracted value
 * @param {string} source - Source type (from SourceType)
 * @param {object} confidence - Confidence object { score, level, warnings }
 * @param {object} metadata - Additional metadata
 * @returns {object} Field claim
 */
export function createFieldClaim(fieldName, value, source, confidence, metadata = {}) {
  return {
    fieldName,
    value,
    source,
    confidence: {
      score: confidence.score,
      level: confidence.level,
      warnings: confidence.warnings || []
    },
    status: FieldStatus.PENDING,
    metadata: {
      extractedAt: new Date().toISOString(),
      ...metadata
    }
  };
}

/**
 * IngestionReport builder class
 */
export class IngestionReportBuilder {
  constructor(projectId, projectName) {
    this.report = {
      projectId,
      projectName,
      version: '1.0',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      fields: {},
      overallConfidence: null,
      progressionLocked: true, // Block progression until confirmed
      warnings: [],
      errors: []
    };
  }

  /**
   * Add a field claim to the report
   * @param {string} fieldName - Name of the field
   * @param {*} value - Extracted value
   * @param {string} source - Source type
   * @param {object} confidence - Confidence object
   * @param {object} metadata - Additional metadata
   * @returns {IngestionReportBuilder} For chaining
   */
  addField(fieldName, value, source, confidence, metadata = {}) {
    this.report.fields[fieldName] = createFieldClaim(
      fieldName,
      value,
      source,
      confidence,
      metadata
    );
    return this;
  }

  /**
   * Add multiple fields at once
   * @param {Array<object>} fields - Array of field objects
   * @returns {IngestionReportBuilder} For chaining
   */
  addFields(fields) {
    fields.forEach(field => {
      this.addField(
        field.fieldName,
        field.value,
        field.source,
        field.confidence,
        field.metadata
      );
    });
    return this;
  }

  /**
   * Add a warning to the report
   * @param {string} message - Warning message
   * @param {string} context - Context (e.g., field name, source)
   * @returns {IngestionReportBuilder} For chaining
   */
  addWarning(message, context = null) {
    this.report.warnings.push({
      message,
      context,
      timestamp: new Date().toISOString()
    });
    return this;
  }

  /**
   * Add an error to the report
   * @param {string} message - Error message
   * @param {string} context - Context
   * @param {Error} error - Original error object
   * @returns {IngestionReportBuilder} For chaining
   */
  addError(message, context = null, error = null) {
    this.report.errors.push({
      message,
      context,
      error: error ? {
        name: error.name,
        message: error.message,
        stack: error.stack
      } : null,
      timestamp: new Date().toISOString()
    });
    return this;
  }

  /**
   * Calculate and set overall confidence
   * @returns {IngestionReportBuilder} For chaining
   */
  calculateOverallConfidence() {
    const fieldConfidences = Object.values(this.report.fields).map(f => f.confidence);
    this.report.overallConfidence = aggregateConfidence(fieldConfidences);
    return this;
  }

  /**
   * Build and return the final report
   * @returns {object} Complete ingestion report
   */
  build() {
    // Calculate overall confidence if not already done
    if (!this.report.overallConfidence) {
      this.calculateOverallConfidence();
    }

    // Update timestamp
    this.report.updatedAt = new Date().toISOString();

    return this.report;
  }

  /**
   * Serialize report to JSON
   * @returns {string} JSON string
   */
  toJSON() {
    return JSON.stringify(this.build(), null, 2);
  }
}

/**
 * Update field status (operator confirmation/correction)
 * @param {object} report - Ingestion report
 * @param {string} fieldName - Field to update
 * @param {string} status - New status (from FieldStatus)
 * @param {*} correctedValue - Corrected value (if status is CORRECTED)
 * @returns {object} Updated report
 */
export function updateFieldStatus(report, fieldName, status, correctedValue = null) {
  if (!report.fields[fieldName]) {
    throw new Error(`Field "${fieldName}" not found in report`);
  }

  const field = report.fields[fieldName];
  field.status = status;
  field.metadata.reviewedAt = new Date().toISOString();

  if (status === FieldStatus.CORRECTED && correctedValue !== null) {
    field.metadata.originalValue = field.value;
    field.value = correctedValue;
    field.source = SourceType.USER_INPUT;
    field.confidence = {
      score: 1.0,
      level: ConfidenceLevel.HIGH,
      warnings: ['User-corrected value']
    };
  }

  report.updatedAt = new Date().toISOString();
  return report;
}

/**
 * Check if all required fields are confirmed
 * @param {object} report - Ingestion report
 * @param {Array<string>} requiredFields - List of required field names
 * @returns {boolean} True if all required fields are confirmed/corrected
 */
export function areRequiredFieldsConfirmed(report, requiredFields) {
  return requiredFields.every(fieldName => {
    const field = report.fields[fieldName];
    return field && (
      field.status === FieldStatus.CONFIRMED ||
      field.status === FieldStatus.CORRECTED
    );
  });
}

/**
 * Unlock progression if all required fields are confirmed
 * @param {object} report - Ingestion report
 * @param {Array<string>} requiredFields - List of required field names
 * @returns {object} Updated report
 */
export function unlockProgression(report, requiredFields) {
  if (areRequiredFieldsConfirmed(report, requiredFields)) {
    report.progressionLocked = false;
    report.metadata = report.metadata || {};
    report.metadata.unlockedAt = new Date().toISOString();
  }
  return report;
}

/**
 * Get summary statistics for the report
 * @param {object} report - Ingestion report
 * @returns {object} Summary statistics
 */
export function getReportSummary(report) {
  const fields = Object.values(report.fields);
  const totalFields = fields.length;
  
  const statusCounts = {
    [FieldStatus.PENDING]: 0,
    [FieldStatus.CONFIRMED]: 0,
    [FieldStatus.CORRECTED]: 0,
    [FieldStatus.REJECTED]: 0
  };

  const confidenceCounts = {
    [ConfidenceLevel.HIGH]: 0,
    [ConfidenceLevel.MEDIUM]: 0,
    [ConfidenceLevel.LOW]: 0,
    [ConfidenceLevel.NONE]: 0
  };

  fields.forEach(field => {
    statusCounts[field.status]++;
    confidenceCounts[field.confidence.level]++;
  });

  return {
    totalFields,
    statusCounts,
    confidenceCounts,
    overallConfidence: report.overallConfidence,
    progressionLocked: report.progressionLocked,
    warningCount: report.warnings.length,
    errorCount: report.errors.length
  };
}

export default {
  FieldStatus,
  SourceType,
  createFieldClaim,
  IngestionReportBuilder,
  updateFieldStatus,
  areRequiredFieldsConfirmed,
  unlockProgression,
  getReportSummary
};
