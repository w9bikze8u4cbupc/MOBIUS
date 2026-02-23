// src/api/middleware/gates.js
// Server-side gate enforcement middleware
// Blocks downstream operations when required confirmations are missing
// PHASE 3: Structurally unavoidable - all downstream routes MUST use this
// PHASE F: Extended with script-specific gating

import { getIngestionReport, getGateStates, areRequiredGatesSatisfied, getScriptArtifacts } from '../db.js';
import { 
  getRequiredGateIds, 
  areGatesSatisfied, 
  getBlockedReasons,
  GateErrorCode 
} from '../../utils/gateConstants.js';

// STANDARDIZED ERROR CODES
const INGESTION_GATES_BLOCKED = 'INGESTION_GATES_BLOCKED';
const SCRIPT_GATES_BLOCKED = 'SCRIPT_GATES_BLOCKED';
const SCRIPT_INCONSISTENT_WITH_INGESTION = 'SCRIPT_INCONSISTENT_WITH_INGESTION';

/**
 * Custom error class for gate blocking
 * PHASE 3: Standardized error code and payload shape
 */
export class GateBlockedError extends Error {
  constructor(blockedReasons, requiredGateIds) {
    super('Operation blocked by ingestion truth gates');
    this.name = 'GateBlockedError';
    this.code = INGESTION_GATES_BLOCKED; // Standardized code
    this.statusCode = 409; // Conflict
    this.blockedReasons = blockedReasons;
    this.requiredGateIds = requiredGateIds;
  }

  toJSON() {
    return {
      error: this.message,
      code: this.code,
      blockedReasons: this.blockedReasons,
      requiredGateIds: this.requiredGateIds,
      actionRequired: 'Complete ingestion review and confirm all required gates',
      reviewUrl: `/ingestion-review` // Frontend can use this
    };
  }
}

/**
 * Check if gates are satisfied for a project
 * PHASE 3: Uses centralized helper from db.js
 * @param {number} projectId - Project ID
 * @returns {object} { satisfied: boolean, blockedReasons: Array, requiredGateIds: Array }
 */
export function checkGates(projectId) {
  const report = getIngestionReport(projectId);
  const gateStates = getGateStates(projectId);
  
  // If no report exists, gates are not applicable (backward compatibility)
  if (!report) {
    return {
      satisfied: true,
      blockedReasons: [],
      requiredGateIds: [],
      noReport: true
    };
  }
  
  const requiredGateIds = getRequiredGateIds(report);
  
  // If no required gates, satisfied
  if (requiredGateIds.length === 0) {
    return {
      satisfied: true,
      blockedReasons: [],
      requiredGateIds: []
    };
  }
  
  const satisfied = areGatesSatisfied(gateStates, requiredGateIds);
  const blockedReasons = satisfied ? [] : getBlockedReasons(gateStates, requiredGateIds);
  
  return {
    satisfied,
    blockedReasons,
    requiredGateIds
  };
}

/**
 * Express middleware to enforce gates
 * PHASE 3: MANDATORY for all downstream routes
 * Usage: app.post('/api/projects/:id/render', enforceGates, renderHandler)
 */
export function enforceGates(req, res, next) {
  const projectId = parseInt(req.params.id, 10);
  
  if (isNaN(projectId)) {
    return res.status(400).json({ error: 'Invalid project ID' });
  }
  
  const gateCheck = checkGates(projectId);
  
  if (!gateCheck.satisfied) {
    const error = new GateBlockedError(gateCheck.blockedReasons, gateCheck.requiredGateIds);
    console.warn(`⚠️  GATE BLOCKED: Project ${projectId} - ${gateCheck.blockedReasons.length} gates pending`);
    return res.status(error.statusCode).json(error.toJSON());
  }
  
  // Gates satisfied, proceed
  console.log(`✅ GATES SATISFIED: Project ${projectId} - proceeding to downstream operation`);
  next();
}

/**
 * Express middleware to enforce gates with custom error handler
 * PHASE 3: DEV bypass REMOVED - gates are now mandatory
 * Use enforceGates directly instead
 * @deprecated Use enforceGates instead
 */
export function enforceGatesWithDevBypass(req, res, next) {
  // PHASE 3: DEV bypass removed for production readiness
  // If you need to bypass gates in development, use SKIP_GATES=true environment variable
  // and check it explicitly in your route handler, not here
  console.warn('⚠️  enforceGatesWithDevBypass is deprecated - use enforceGates instead');
  return enforceGates(req, res, next);
}

/**
 * Check gates and return result (for use in route handlers)
 * PHASE 3: Uses centralized helper
 * @param {number} projectId - Project ID
 * @throws {GateBlockedError} If gates are not satisfied
 */
export function assertGatesSatisfied(projectId) {
  const gateCheck = checkGates(projectId);
  
  if (!gateCheck.satisfied) {
    throw new GateBlockedError(gateCheck.blockedReasons, gateCheck.requiredGateIds);
  }
}

/**
 * PHASE 3: Quick check using centralized helper
 * @param {number} projectId - Project ID
 * @returns {boolean} True if gates satisfied
 */
export function areGatesSatisfiedQuick(projectId) {
  return areRequiredGatesSatisfied(projectId);
}

export default {
  INGESTION_GATES_BLOCKED,
  SCRIPT_GATES_BLOCKED,
  SCRIPT_INCONSISTENT_WITH_INGESTION,
  GateBlockedError,
  checkGates,
  enforceGates,
  enforceGatesWithDevBypass,
  assertGatesSatisfied,
  areGatesSatisfiedQuick
};
