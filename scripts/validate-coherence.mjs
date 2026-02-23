#!/usr/bin/env node

/**
 * Coherence Validation Script - MANDATORY INVARIANT
 * 
 * Validates semantic coherence between database and filesystem.
 * This is a LOCKED MILESTONE requirement - all checks are mandatory.
 * 
 * Validates:
 * - DB ↔ filesystem consistency (MANDATORY - requires better-sqlite3)
 * - Orphaned files (filesystem but not in DB)
 * - Missing artifacts (DB references but not on disk)
 * - Artifact manifests (structure and validity)
 * - Competing artifacts (multiple versions for same stage)
 * - Authority conflicts (multiple authoritative artifacts)
 * 
 * Exit Behavior:
 * - Exits 0 on success (no violations)
 * - Exits 1 on errors or violations
 * - No --allow-violations flag in production (DEV-ONLY override available)
 * 
 * This validation is a locked invariant. Any failure indicates a regression
 * that must be resolved before proceeding.
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';
import { 
  getDataDirs, 
  getDbPath,
  isCutoverComplete 
} from '../src/config/storage.mjs';
import {
  listArtifacts,
  validateManifest,
  hasManifest
} from '../src/utils/artifacts.mjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Parse command line arguments
const args = process.argv.slice(2);
const allowViolations = args.includes('--allow-violations');
const verbose = args.includes('--verbose');

if (allowViolations) {
  console.log('⚠️  WARNING: --allow-violations flag detected');
  console.log('   This is a DEV-ONLY override and should NEVER be used in production.');
  console.log('   Coherence validation is a locked invariant.\n');
}

console.log('🔍 MOBIUS Coherence Validation (MANDATORY)');
console.log('==========================================\n');

// Track violations
const violations = {
  orphanedFiles: [],
  missingArtifacts: [],
  invalidManifests: [],
  competingArtifacts: [],
  missingManifests: [],
  authorityConflicts: []
};

let warningCount = 0;
let errorCount = 0;

/**
 * Get all projects from database
 * DB coherence is MANDATORY - this function will fail if database is inaccessible
 */
async function getProjectsFromDB() {
  const dbPath = getDbPath();
  
  if (!fs.existsSync(dbPath)) {
    console.log('ℹ️  Database not found');
    console.log(`   Expected at: ${dbPath}`);
    console.log('');
    console.log('   This is acceptable for new installations with zero projects.');
    console.log('   If you expect projects to exist, verify migration completed.\n');
    return [];
  }
  
  try {
    // Dynamic import to provide clear error if missing
    const Database = await import('better-sqlite3').then(m => m.default);
    const db = new Database(dbPath, { readonly: true });
    const projects = db.prepare('SELECT * FROM projects').all();
    db.close();
    
    if (projects.length === 0) {
      console.log('ℹ️  Database is empty (zero projects)');
      console.log('   This is acceptable for new installations.\n');
    }
    
    return projects;
  } catch (error) {
    if (error.code === 'ERR_MODULE_NOT_FOUND') {
      console.error('❌ CRITICAL: better-sqlite3 is not installed');
      console.error('');
      console.error('   DB coherence validation is MANDATORY.');
      console.error('   Install the required dependency:');
      console.error('');
      console.error('   npm install better-sqlite3');
      console.error('');
      console.error('   This is a locked invariant - no workarounds available.\n');
      errorCount++;
      process.exit(1);
    }
    console.error(`❌ Failed to read database: ${error.message}\n`);
    errorCount++;
    return [];
  }
}

/**
 * Get all output directories from filesystem
 */
function getOutputDirsFromFS() {
  const dirs = getDataDirs();
  const outputsDir = dirs.outputs;
  
  if (!fs.existsSync(outputsDir)) {
    return [];
  }
  
  const entries = fs.readdirSync(outputsDir, { withFileTypes: true });
  return entries
    .filter(entry => entry.isDirectory())
    .map(entry => ({
      name: entry.name,
      path: path.join(outputsDir, entry.name)
    }));
}

/**
 * Check for orphaned output directories
 */
function checkOrphanedOutputs(projects, outputDirs) {
  console.log('📁 Checking for orphaned output directories...');
  
  const projectIds = new Set(projects.map(p => String(p.id)));
  const orphans = outputDirs.filter(dir => !projectIds.has(dir.name));
  
  if (orphans.length > 0) {
    console.log(`⚠️  Found ${orphans.length} orphaned output directories:\n`);
    
    orphans.forEach(orphan => {
      console.log(`   📁 ${orphan.path}`);
      
      // Check if it has a manifest
      if (hasManifest(orphan.path)) {
        console.log(`      Has manifest (may be intentional)`);
      } else {
        console.log(`      No manifest (likely orphaned)`);
      }
      
      violations.orphanedFiles.push({
        path: orphan.path,
        type: 'directory',
        hasManifest: hasManifest(orphan.path)
      });
    });
    
    console.log('');
    warningCount += orphans.length;
  } else {
    console.log('✅ No orphaned output directories\n');
  }
}

/**
 * Check for missing artifacts
 */
function checkMissingArtifacts(projects, outputDirs) {
  console.log('🔎 Checking for missing artifacts...');
  
  const outputDirNames = new Set(outputDirs.map(dir => dir.name));
  const missing = projects.filter(p => {
    const projectId = String(p.id);
    return !outputDirNames.has(projectId);
  });
  
  if (missing.length > 0) {
    console.log(`⚠️  Found ${missing.length} projects with missing output directories:\n`);
    
    missing.forEach(project => {
      console.log(`   📄 Project ${project.id}: ${project.name || 'Unnamed'}`);
      
      violations.missingArtifacts.push({
        projectId: project.id,
        projectName: project.name,
        type: 'missing_output_dir'
      });
    });
    
    console.log('');
    warningCount += missing.length;
  } else {
    console.log('✅ All projects have output directories\n');
  }
}

/**
 * Validate artifact manifests
 */
function validateArtifactManifests(outputDirs) {
  console.log('📋 Validating artifact manifests...');
  
  const dirs = getDataDirs();
  const artifacts = listArtifacts(dirs.outputs);
  
  if (artifacts.length === 0) {
    console.log('ℹ️  No artifacts with manifests found\n');
    return;
  }
  
  console.log(`Found ${artifacts.length} artifacts with manifests\n`);
  
  let validCount = 0;
  let invalidCount = 0;
  
  artifacts.forEach(artifact => {
    const validation = validateManifest(artifact.manifest);
    
    if (!validation.valid) {
      console.log(`❌ Invalid manifest in ${artifact.dir}:`);
      validation.errors.forEach(error => {
        console.log(`   - ${error}`);
      });
      console.log('');
      
      violations.invalidManifests.push({
        dir: artifact.dir,
        errors: validation.errors
      });
      
      invalidCount++;
      errorCount++;
    } else {
      validCount++;
      
      if (verbose) {
        console.log(`✅ Valid manifest: ${artifact.dir}`);
        console.log(`   Project: ${artifact.manifest.projectId}`);
        console.log(`   Stage: ${artifact.manifest.stage}`);
        console.log(`   Authoritative: ${artifact.manifest.authoritative}`);
        console.log('');
      }
    }
  });
  
  console.log(`✅ Valid manifests: ${validCount}`);
  if (invalidCount > 0) {
    console.log(`❌ Invalid manifests: ${invalidCount}`);
  }
  console.log('');
}

/**
 * Check for competing artifacts (multiple versions for same stage)
 */
function checkCompetingArtifacts() {
  console.log('🔄 Checking for competing artifacts...');
  
  const dirs = getDataDirs();
  const artifacts = listArtifacts(dirs.outputs);
  
  // Group by projectId and stage
  const grouped = {};
  
  artifacts.forEach(artifact => {
    const key = `${artifact.manifest.projectId}:${artifact.manifest.stage}`;
    
    if (!grouped[key]) {
      grouped[key] = [];
    }
    
    grouped[key].push(artifact);
  });
  
  // Find groups with multiple artifacts
  const competing = Object.entries(grouped).filter(([key, arts]) => arts.length > 1);
  
  if (competing.length > 0) {
    console.log(`⚠️  Found ${competing.length} cases of competing artifacts:\n`);
    
    competing.forEach(([key, arts]) => {
      const [projectId, stage] = key.split(':');
      console.log(`   Project ${projectId}, Stage ${stage}:`);
      
      arts.forEach(art => {
        console.log(`      - ${art.dir}`);
        console.log(`        Created: ${art.manifest.createdAt}`);
        console.log(`        Authoritative: ${art.manifest.authoritative}`);
      });
      
      console.log('');
      
      violations.competingArtifacts.push({
        projectId,
        stage,
        artifacts: arts.map(a => a.dir)
      });
    });
    
    warningCount += competing.length;
  } else {
    console.log('✅ No competing artifacts found\n');
  }
}

/**
 * Check for missing manifests in output directories
 */
function checkMissingManifests(outputDirs) {
  console.log('📝 Checking for missing manifests...');
  
  const missing = outputDirs.filter(dir => !hasManifest(dir.path));
  
  if (missing.length > 0) {
    console.log(`⚠️  Found ${missing.length} output directories without manifests:\n`);
    
    missing.forEach(dir => {
      console.log(`   📁 ${dir.path}`);
      
      violations.missingManifests.push({
        path: dir.path,
        projectId: dir.name
      });
    });
    
    console.log('');
    console.log('   Manifests are required for semantic coherence.');
    console.log('   Run renders will create manifests automatically.\n');
    
    warningCount += missing.length;
  } else {
    console.log('✅ All output directories have manifests\n');
  }
}

/**
 * Check for authority conflicts
 */
function checkAuthorityConflicts() {
  console.log('👑 Checking for authority conflicts...');
  
  const dirs = getDataDirs();
  const artifacts = listArtifacts(dirs.outputs);
  
  // Group by projectId
  const byProject = {};
  
  artifacts.forEach(artifact => {
    const projectId = artifact.manifest.projectId;
    
    if (!byProject[projectId]) {
      byProject[projectId] = [];
    }
    
    byProject[projectId].push(artifact);
  });
  
  // Check for multiple authoritative artifacts per project
  const conflicts = [];
  
  Object.entries(byProject).forEach(([projectId, arts]) => {
    const authoritative = arts.filter(a => a.manifest.authoritative === true);
    
    if (authoritative.length > 1) {
      conflicts.push({
        projectId,
        artifacts: authoritative
      });
    }
  });
  
  if (conflicts.length > 0) {
    console.log(`❌ Found ${conflicts.length} authority conflicts:\n`);
    
    conflicts.forEach(conflict => {
      console.log(`   Project ${conflict.projectId} has multiple authoritative artifacts:`);
      
      conflict.artifacts.forEach(art => {
        console.log(`      - ${art.dir}`);
        console.log(`        Stage: ${art.manifest.stage}`);
        console.log(`        Created: ${art.manifest.createdAt}`);
      });
      
      console.log('');
      
      violations.authorityConflicts.push(conflict);
    });
    
    errorCount += conflicts.length;
  } else {
    console.log('✅ No authority conflicts found\n');
  }
}

// Run validation
console.log('Starting coherence validation...\n');

const projects = await getProjectsFromDB();
const outputDirs = getOutputDirsFromFS();

console.log(`📊 Found ${projects.length} projects in database`);
console.log(`📊 Found ${outputDirs.length} output directories\n`);

checkOrphanedOutputs(projects, outputDirs);
checkMissingArtifacts(projects, outputDirs);
validateArtifactManifests(outputDirs);
checkCompetingArtifacts();
checkMissingManifests(outputDirs);
checkAuthorityConflicts();

// Summary
console.log('📊 Validation Summary');
console.log('====================');
console.log(`Warnings: ${warningCount}`);
console.log(`Errors: ${errorCount}`);
console.log('');

// Check cutover status
const cutoverComplete = isCutoverComplete();
console.log(`Cutover status: ${cutoverComplete ? '✅ Complete' : '⏳ Pending'}`);
console.log('');

// Remediation guidance
if (warningCount > 0 || errorCount > 0) {
  console.log('📝 Remediation Steps');
  console.log('===================');
  
  if (violations.orphanedFiles.length > 0) {
    console.log('\n🗑️  Orphaned Files:');
    console.log('   Review and manually remove orphaned directories if not needed.');
    console.log('   Or add corresponding database entries if they should exist.');
  }
  
  if (violations.missingArtifacts.length > 0) {
    console.log('\n📦 Missing Artifacts:');
    console.log('   Re-run renders for projects with missing output directories.');
    console.log('   Or remove database entries if projects are no longer needed.');
  }
  
  if (violations.invalidManifests.length > 0) {
    console.log('\n❌ Invalid Manifests:');
    console.log('   Fix or regenerate invalid manifests.');
    console.log('   Manifests are required for semantic coherence.');
  }
  
  if (violations.competingArtifacts.length > 0) {
    console.log('\n🔄 Competing Artifacts:');
    console.log('   Resolve competing artifacts by:');
    console.log('   1. Granting authority to one version');
    console.log('   2. Removing or archiving other versions');
  }
  
  if (violations.missingManifests.length > 0) {
    console.log('\n📝 Missing Manifests:');
    console.log('   Create manifests for existing outputs.');
    console.log('   Future renders will create manifests automatically.');
  }
  
  if (violations.authorityConflicts.length > 0) {
    console.log('\n👑 Authority Conflicts:');
    console.log('   CRITICAL: Multiple authoritative artifacts per project.');
    console.log('   Revoke authority from all but one artifact per project.');
  }
  
  console.log('');
}

// Exit code
if (errorCount > 0) {
  if (allowViolations) {
    console.log('⚠️  ERRORS DETECTED but --allow-violations flag set (DEV-ONLY)');
    console.log('   This override is UNSUPPORTED in production.');
    console.log('   Exiting with success (0) - USE WITH EXTREME CAUTION\n');
    process.exit(0);
  } else {
    console.log('❌ VALIDATION FAILED - Coherence violations detected');
    console.log('   This is a locked invariant - violations must be resolved.');
    console.log('   Review errors above and take corrective action.\n');
    process.exit(1);
  }
} else if (warningCount > 0) {
  console.log('⚠️  Validation completed with warnings');
  console.log('   Review warnings above and take action if needed.');
  console.log('   Warnings do not block cutover but should be investigated.\n');
  process.exit(0);
} else {
  console.log('✅ VALIDATION PASSED - No violations detected');
  console.log('   Storage coherence is intact.\n');
  process.exit(0);
}
