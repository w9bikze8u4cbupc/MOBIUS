// src/api/db.js
// SQLite database implementation for Mobius Games Tutorial Generator
// Uses better-sqlite3 for performance and reliability
// Extended with ingestion truth gates support

import Database from 'better-sqlite3';
import { getDbPath, ensureDataDirs } from '../config/storage.mjs';

// Ensure all data directories exist
ensureDataDirs();

// Get canonical database path
const dbPath = getDbPath();

// Initialize database
const db = new Database(dbPath);

// Create tables if they don't exist
db.exec(`
  CREATE TABLE IF NOT EXISTS projects (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    metadata TEXT,
    components TEXT,
    images TEXT,
    script TEXT,
    audio TEXT,
    ingestion_report TEXT,
    gate_states TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )
`);

// Create index for faster lookups
db.exec(`
  CREATE INDEX IF NOT EXISTS idx_projects_name ON projects(name)
`);

// Migration: Add ingestion_report and gate_states columns if they don't exist
try {
  db.exec(`ALTER TABLE projects ADD COLUMN ingestion_report TEXT`);
  console.log('✅ Added ingestion_report column to projects table');
} catch (e) {
  // Column already exists
  if (!e.message.includes('duplicate column name')) {
    console.error('Error adding ingestion_report column:', e.message);
  }
}

try {
  db.exec(`ALTER TABLE projects ADD COLUMN gate_states TEXT`);
  console.log('✅ Added gate_states column to projects table');
} catch (e) {
  // Column already exists
  if (!e.message.includes('duplicate column name')) {
    console.error('Error adding gate_states column:', e.message);
  }
}

// PHASE F: Add script_artifacts column
try {
  db.exec(`ALTER TABLE projects ADD COLUMN script_artifacts TEXT`);
  console.log('✅ Added script_artifacts column to projects table');
} catch (e) {
  // Column already exists
  if (!e.message.includes('duplicate column name')) {
    console.error('Error adding script_artifacts column:', e.message);
  }
}

// HEPHAESTUS: Add extraction_metadata column
try {
  db.exec(`ALTER TABLE projects ADD COLUMN extraction_metadata TEXT`);
  console.log('✅ Added extraction_metadata column to projects table');
} catch (e) {
  // Column already exists
  if (!e.message.includes('duplicate column name')) {
    console.error('Error adding extraction_metadata column:', e.message);
  }
}

/**
 * Get ingestion report for a project
 * @param {number} projectId - Project ID
 * @returns {object|null} Parsed ingestion report or null
 */
export function getIngestionReport(projectId) {
  const stmt = db.prepare('SELECT ingestion_report FROM projects WHERE id = ?');
  const row = stmt.get(projectId);
  
  if (!row || !row.ingestion_report) {
    return null;
  }
  
  try {
    return JSON.parse(row.ingestion_report);
  } catch (e) {
    console.error(`Failed to parse ingestion_report for project ${projectId}:`, e);
    return null;
  }
}

/**
 * Set ingestion report for a project
 * @param {number} projectId - Project ID
 * @param {object} report - Ingestion report object
 * @returns {boolean} Success
 */
export function setIngestionReport(projectId, report) {
  const stmt = db.prepare(`
    UPDATE projects 
    SET ingestion_report = ?, updated_at = CURRENT_TIMESTAMP 
    WHERE id = ?
  `);
  
  try {
    const result = stmt.run(JSON.stringify(report), projectId);
    return result.changes > 0;
  } catch (e) {
    console.error(`Failed to set ingestion_report for project ${projectId}:`, e);
    return false;
  }
}

/**
 * Get gate states for a project
 * @param {number} projectId - Project ID
 * @returns {object|null} Parsed gate states or null
 */
export function getGateStates(projectId) {
  const stmt = db.prepare('SELECT gate_states FROM projects WHERE id = ?');
  const row = stmt.get(projectId);
  
  if (!row || !row.gate_states) {
    return null;
  }
  
  try {
    return JSON.parse(row.gate_states);
  } catch (e) {
    console.error(`Failed to parse gate_states for project ${projectId}:`, e);
    return null;
  }
}

/**
 * Set gate states for a project
 * @param {number} projectId - Project ID
 * @param {object} gateStates - Gate states object
 * @returns {boolean} Success
 */
export function setGateStates(projectId, gateStates) {
  const stmt = db.prepare(`
    UPDATE projects 
    SET gate_states = ?, updated_at = CURRENT_TIMESTAMP 
    WHERE id = ?
  `);
  
  try {
    const result = stmt.run(JSON.stringify(gateStates), projectId);
    return result.changes > 0;
  } catch (e) {
    console.error(`Failed to set gate_states for project ${projectId}:`, e);
    return false;
  }
}

/**
 * Update gate states transactionally
 * @param {number} projectId - Project ID
 * @param {Function} updateFn - Function that receives current states and returns updated states
 * @returns {object|null} Updated gate states or null on failure
 */
export function updateGateStatesTransaction(projectId, updateFn) {
  const transaction = db.transaction(() => {
    const currentStates = getGateStates(projectId) || {};
    const updatedStates = updateFn(currentStates);
    
    if (setGateStates(projectId, updatedStates)) {
      return updatedStates;
    }
    
    throw new Error('Failed to update gate states');
  });
  
  try {
    return transaction();
  } catch (e) {
    console.error(`Transaction failed for project ${projectId}:`, e);
    return null;
  }
}

/**
 * Get project with ingestion data
 * @param {number} projectId - Project ID
 * @returns {object|null} Project with parsed ingestion_report and gate_states
 */
export function getProjectWithIngestion(projectId) {
  const stmt = db.prepare('SELECT * FROM projects WHERE id = ?');
  const row = stmt.get(projectId);
  
  if (!row) {
    return null;
  }
  
  // Parse JSON fields
  const project = { ...row };
  
  if (row.metadata) {
    try {
      project.metadata = JSON.parse(row.metadata);
    } catch (e) {
      console.error('Failed to parse metadata:', e);
    }
  }
  
  if (row.components) {
    try {
      project.components = JSON.parse(row.components);
    } catch (e) {
      console.error('Failed to parse components:', e);
    }
  }
  
  if (row.images) {
    try {
      project.images = JSON.parse(row.images);
    } catch (e) {
      console.error('Failed to parse images:', e);
    }
  }
  
  if (row.ingestion_report) {
    try {
      project.ingestion_report = JSON.parse(row.ingestion_report);
    } catch (e) {
      console.error('Failed to parse ingestion_report:', e);
    }
  }
  
  if (row.gate_states) {
    try {
      project.gate_states = JSON.parse(row.gate_states);
    } catch (e) {
      console.error('Failed to parse gate_states:', e);
    }
  }
  
  return project;
}

/**
 * CENTRALIZED GATE CHECK - Use this everywhere to check if gates are satisfied
 * This is the single source of truth for gate satisfaction
 * @param {number} projectId - Project ID
 * @returns {boolean} True if gates are satisfied or not applicable
 */
export function areRequiredGatesSatisfied(projectId) {
  const report = getIngestionReport(projectId);
  
  // Backward compatibility: no report = gates not applicable
  if (!report) {
    return true;
  }
  
  // Import gate helpers (avoid circular dependency by importing here)
  const gateConstants = require('../utils/gateConstants.js');
  
  // PHASE F: Check if script candidates exist for context
  const scriptArtifacts = getScriptArtifacts(projectId);
  
  // HEPHAESTUS: Check if extracted images exist for context
  const extractionMetadata = getExtractionMetadata(projectId);
  const hasExtractedImages = extractionMetadata && 
    extractionMetadata.importedAssets && 
    extractionMetadata.importedAssets.length > 0;
  
  const context = {
    hasScriptCandidates: scriptArtifacts && scriptArtifacts.length > 0,
    hasStoryboard: false, // Stub for next phase
    hasExtractedImages
  };
  
  const requiredGateIds = gateConstants.getRequiredGateIds(report, context);
  
  // No required gates = satisfied
  if (requiredGateIds.length === 0) {
    return true;
  }
  
  const gateStates = getGateStates(projectId);
  
  // No gate states but required gates exist = not satisfied
  if (!gateStates) {
    return false;
  }
  
  // Check if all required gates are satisfied
  return gateConstants.areGatesSatisfied(gateStates, requiredGateIds);
}

// ============================================================================
// PHASE F: SCRIPT ARTIFACT PERSISTENCE
// ============================================================================

/**
 * Get all script artifacts for a project
 * @param {number} projectId - Project ID
 * @returns {Array<object>|null} Array of script artifacts or null
 */
export function getScriptArtifacts(projectId) {
  const stmt = db.prepare('SELECT script_artifacts FROM projects WHERE id = ?');
  const row = stmt.get(projectId);
  
  if (!row || !row.script_artifacts) {
    return null;
  }
  
  try {
    return JSON.parse(row.script_artifacts);
  } catch (e) {
    console.error(`Failed to parse script_artifacts for project ${projectId}:`, e);
    return null;
  }
}

/**
 * Add a script artifact candidate (never overwrites)
 * @param {number} projectId - Project ID
 * @param {object} artifact - Script artifact
 * @returns {boolean} Success
 */
export function addScriptArtifact(projectId, artifact) {
  const existing = getScriptArtifacts(projectId) || [];
  existing.push(artifact);
  
  const stmt = db.prepare(`
    UPDATE projects 
    SET script_artifacts = ?, updated_at = CURRENT_TIMESTAMP 
    WHERE id = ?
  `);
  
  try {
    const result = stmt.run(JSON.stringify(existing), projectId);
    return result.changes > 0;
  } catch (e) {
    console.error(`Failed to add script_artifact for project ${projectId}:`, e);
    return false;
  }
}

/**
 * Get authoritative script artifact
 * @param {number} projectId - Project ID
 * @returns {object|null} Authoritative script artifact or null
 */
export function getAuthoritativeScript(projectId) {
  const artifacts = getScriptArtifacts(projectId);
  if (!artifacts) return null;
  
  return artifacts.find(a => a.status === 'authoritative') || null;
}

/**
 * Set a script artifact as authoritative (marks others as candidates)
 * @param {number} projectId - Project ID
 * @param {string} artifactId - Artifact ID to mark as authoritative
 * @returns {boolean} Success
 */
export function setAuthoritativeScript(projectId, artifactId) {
  const artifacts = getScriptArtifacts(projectId);
  if (!artifacts) return false;
  
  // Mark all as candidate, then mark selected as authoritative
  artifacts.forEach(a => {
    a.status = a.id === artifactId ? 'authoritative' : 'candidate';
  });
  
  const stmt = db.prepare(`
    UPDATE projects 
    SET script_artifacts = ?, updated_at = CURRENT_TIMESTAMP 
    WHERE id = ?
  `);
  
  try {
    const result = stmt.run(JSON.stringify(artifacts), projectId);
    return result.changes > 0;
  } catch (e) {
    console.error(`Failed to set authoritative script for project ${projectId}:`, e);
    return false;
  }
}

/**
 * PHASE F: Confirm authoritative script and update gate state (transactional)
 * @param {number} projectId - Project ID
 * @param {string} candidateId - Candidate ID to confirm
 * @param {string} notes - Optional confirmation notes
 * @returns {object|null} { success: boolean, authoritative: object, gateStates: object }
 */
export function confirmAuthoritativeScript(projectId, candidateId, notes = null) {
  const transaction = db.transaction(() => {
    // Set authoritative script
    const success = setAuthoritativeScript(projectId, candidateId);
    if (!success) {
      throw new Error('Failed to set authoritative script');
    }
    
    // Get the now-authoritative script
    const authoritative = getAuthoritativeScript(projectId);
    if (!authoritative) {
      throw new Error('Failed to retrieve authoritative script after setting');
    }
    
    // Update CONFIRM_SCRIPT gate state
    const gateStates = getGateStates(projectId) || {};
    const GateId = require('../utils/gateConstants.js').GateId;
    const GateStatus = require('../utils/gateConstants.js').GateStatus;
    
    gateStates[GateId.CONFIRM_SCRIPT] = {
      gateId: GateId.CONFIRM_SCRIPT,
      status: GateStatus.CONFIRMED,
      confirmedAt: new Date().toISOString(),
      notes: notes,
      patch: null
    };
    
    const gateSuccess = setGateStates(projectId, gateStates);
    if (!gateSuccess) {
      throw new Error('Failed to update gate states');
    }
    
    return { success: true, authoritative, gateStates };
  });
  
  try {
    return transaction();
  } catch (e) {
    console.error(`Transaction failed for confirmAuthoritativeScript (project ${projectId}):`, e);
    return null;
  }
}

// ============================================================================
// HEPHAESTUS: EXTRACTION METADATA PERSISTENCE
// ============================================================================

/**
 * Get HEPHAESTUS extraction metadata for a project
 * @param {number} projectId - Project ID
 * @returns {object|null} Extraction metadata or null
 */
export function getExtractionMetadata(projectId) {
  const stmt = db.prepare('SELECT extraction_metadata FROM projects WHERE id = ?');
  const row = stmt.get(projectId);
  
  if (!row || !row.extraction_metadata) {
    return null;
  }
  
  try {
    return JSON.parse(row.extraction_metadata);
  } catch (e) {
    console.error(`Failed to parse extraction_metadata for project ${projectId}:`, e);
    return null;
  }
}

/**
 * Set HEPHAESTUS extraction metadata for a project
 * @param {number} projectId - Project ID
 * @param {object} metadata - Extraction metadata
 * @returns {boolean} Success
 */
export function setExtractionMetadata(projectId, metadata) {
  const stmt = db.prepare(`
    UPDATE projects 
    SET extraction_metadata = ?, updated_at = CURRENT_TIMESTAMP 
    WHERE id = ?
  `);
  
  try {
    const result = stmt.run(JSON.stringify(metadata), projectId);
    return result.changes > 0;
  } catch (e) {
    console.error(`Failed to set extraction_metadata for project ${projectId}:`, e);
    return false;
  }
}

/**
 * Add HEPHAESTUS extraction run to metadata
 * @param {number} projectId - Project ID
 * @param {object} extractionRun - Extraction run data
 * @returns {boolean} Success
 */
export function addExtractionRun(projectId, extractionRun) {
  const existing = getExtractionMetadata(projectId) || { runs: [], importedAssets: [] };
  
  // Add run to history
  existing.runs = existing.runs || [];
  existing.runs.push({
    extractionId: extractionRun.extractionId,
    timestamp: extractionRun.timestamp,
    outputDir: extractionRun.outputDir,
    manifestPath: extractionRun.manifestPath,
    stats: extractionRun.stats,
    status: 'pending_review'
  });
  
  return setExtractionMetadata(projectId, existing);
}

/**
 * Import HEPHAESTUS assets and update gate state (transactional)
 * @param {number} projectId - Project ID
 * @param {string} extractionId - Extraction ID
 * @param {Array<object>} selectedAssets - Selected ImageAssets to import
 * @param {string} notes - Optional confirmation notes
 * @returns {object|null} { success: boolean, importedCount: number, gateStates: object }
 */
export function importHephaestusAssets(projectId, extractionId, selectedAssets, notes = null) {
  const transaction = db.transaction(() => {
    // Get existing metadata
    const metadata = getExtractionMetadata(projectId) || { runs: [], importedAssets: [] };
    
    // Find the extraction run
    const run = metadata.runs?.find(r => r.extractionId === extractionId);
    if (!run) {
      throw new Error(`Extraction run ${extractionId} not found`);
    }
    
    // Mark run as imported
    run.status = 'imported';
    run.importedAt = new Date().toISOString();
    run.importedCount = selectedAssets.length;
    
    // Add assets to imported list
    metadata.importedAssets = metadata.importedAssets || [];
    selectedAssets.forEach(asset => {
      metadata.importedAssets.push({
        ...asset,
        extractionId,
        importedAt: new Date().toISOString(),
        status: 'confirmed' // Mark as confirmed upon import
      });
    });
    
    // Save metadata
    const metadataSuccess = setExtractionMetadata(projectId, metadata);
    if (!metadataSuccess) {
      throw new Error('Failed to update extraction metadata');
    }
    
    // Update CONFIRM_COMPONENT_IMAGES gate state
    const gateStates = getGateStates(projectId) || {};
    const GateId = require('../utils/gateConstants.js').GateId;
    const GateStatus = require('../utils/gateConstants.js').GateStatus;
    
    gateStates[GateId.CONFIRM_COMPONENT_IMAGES] = {
      gateId: GateId.CONFIRM_COMPONENT_IMAGES,
      status: GateStatus.CONFIRMED,
      confirmedAt: new Date().toISOString(),
      notes: notes,
      patch: null,
      metadata: {
        extractionId,
        importedCount: selectedAssets.length
      }
    };
    
    const gateSuccess = setGateStates(projectId, gateStates);
    if (!gateSuccess) {
      throw new Error('Failed to update gate states');
    }
    
    return { 
      success: true, 
      importedCount: selectedAssets.length, 
      gateStates 
    };
  });
  
  try {
    return transaction();
  } catch (e) {
    console.error(`Transaction failed for importHephaestusAssets (project ${projectId}):`, e);
    return null;
  }
}

/**
 * Get imported HEPHAESTUS assets for a project
 * @param {number} projectId - Project ID
 * @returns {Array<object>} Array of imported ImageAssets
 */
export function getImportedAssets(projectId) {
  const metadata = getExtractionMetadata(projectId);
  return metadata?.importedAssets || [];
}

export default db;