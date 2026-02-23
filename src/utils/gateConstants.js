// src/utils/gateConstants.js
// Gate IDs and semantics for ingestion truth gates
// Shared between backend and frontend

/**
 * Gate IDs - each represents a required operator confirmation
 */
export const GateId = {
  CONFIRM_METADATA: 'confirm_metadata',
  CONFIRM_COMPONENTS: 'confirm_components',
  CONFIRM_SETUP_LOGIC: 'confirm_setup_logic',
  CONFIRM_TURN_STRUCTURE: 'confirm_turn_structure',
  CONFIRM_OCR_HAZARDS: 'confirm_ocr_hazards',
  // PHASE F: Script and Storyboard gates
  CONFIRM_SCRIPT: 'confirm_script',
  CONFIRM_STORYBOARD: 'confirm_storyboard', // Stub for next phase
  // HEPHAESTUS: Component image extraction gate
  CONFIRM_COMPONENT_IMAGES: 'confirm_component_images',
  // PHASE P1-B: Localization gate
  CONFIRM_LOCALIZATION_FR: 'confirm_localization_fr'
};

/**
 * Gate status values
 */
export const GateStatus = {
  PENDING: 'pending',
  CONFIRMED: 'confirmed',
  CORRECTED: 'corrected',
  REJECTED: 'rejected'
};

/**
 * Gate definitions with metadata
 */
export const GateDefinitions = {
  [GateId.CONFIRM_METADATA]: {
    id: GateId.CONFIRM_METADATA,
    title: 'Confirm Game Metadata',
    description: 'Verify game title, designer, publisher, player count, and other basic information',
    required: true,
    requiredWhen: () => true // Always required
  },
  [GateId.CONFIRM_COMPONENTS]: {
    id: GateId.CONFIRM_COMPONENTS,
    title: 'Confirm Game Components',
    description: 'Verify the list of physical components extracted from the rulebook',
    required: true,
    requiredWhen: () => true // Always required
  },
  [GateId.CONFIRM_SETUP_LOGIC]: {
    id: GateId.CONFIRM_SETUP_LOGIC,
    title: 'Confirm Setup Instructions',
    description: 'Verify the game setup sequence and initial board state',
    required: false,
    requiredWhen: (report) => {
      // Required if setup section was extracted
      return report?.fields?.setup?.value?.length > 0;
    }
  },
  [GateId.CONFIRM_TURN_STRUCTURE]: {
    id: GateId.CONFIRM_TURN_STRUCTURE,
    title: 'Confirm Turn Structure',
    description: 'Verify the turn sequence and player actions',
    required: false,
    requiredWhen: (report) => {
      // Required if turn structure was extracted
      return report?.fields?.turnStructure?.value?.length > 0;
    }
  },
  [GateId.CONFIRM_OCR_HAZARDS]: {
    id: GateId.CONFIRM_OCR_HAZARDS,
    title: 'Confirm OCR Extraction Quality',
    description: 'Review text extracted via OCR for potential errors or misreadings',
    required: false,
    requiredWhen: (report) => {
      // Required if OCR was used for extraction
      const usedOCR = report?.fields && Object.values(report.fields).some(
        field => field.source === 'pdf_ocr' || field.metadata?.extractionMethod === 'ocr'
      );
      return usedOCR;
    }
  },
  // PHASE F: Script Authority Gate
  [GateId.CONFIRM_SCRIPT]: {
    id: GateId.CONFIRM_SCRIPT,
    title: 'Confirm Tutorial Script',
    description: 'Review and confirm the generated tutorial script as authoritative',
    required: false,
    requiredWhen: (report, context) => {
      // Required if script candidates exist
      return context?.hasScriptCandidates || false;
    }
  },
  // PHASE F: Storyboard Gate (Stub for next phase)
  [GateId.CONFIRM_STORYBOARD]: {
    id: GateId.CONFIRM_STORYBOARD,
    title: 'Confirm Storyboard',
    description: 'Review and confirm the storyboard mapping (future phase)',
    required: false,
    requiredWhen: (report, context) => {
      // Stub: will be required when storyboard exists
      return context?.hasStoryboard || false;
    }
  },
  // HEPHAESTUS: Component Image Extraction Gate
  [GateId.CONFIRM_COMPONENT_IMAGES]: {
    id: GateId.CONFIRM_COMPONENT_IMAGES,
    title: 'Confirm Component Images',
    description: 'Review and confirm extracted component images from HEPHAESTUS',
    required: false,
    requiredWhen: (report, context) => {
      // Required if HEPHAESTUS extraction has been run and images imported
      return context?.hasExtractedImages || false;
    }
  },
  // PHASE P1-B: Localization Gate
  [GateId.CONFIRM_LOCALIZATION_FR]: {
    id: GateId.CONFIRM_LOCALIZATION_FR,
    title: 'Confirm French Localization',
    description: 'Review and confirm French localized script',
    required: false,
    requiredWhen: (report, context) => {
      // Required if FR localization exists and needs confirmation
      return context?.hasFrLocalization || false;
    }
  }
};

/**
 * Whitelisted fields that can be patched via corrections
 * Format: { fieldPath: { type, maxLength?, validator? } }
 */
export const PatchableFields = {
  'fields.title.value': { type: 'string', maxLength: 200 },
  'fields.designer.value': { type: 'string', maxLength: 200 },
  'fields.artist.value': { type: 'string', maxLength: 200 },
  'fields.publisher.value': { type: 'string', maxLength: 200 },
  'fields.year.value': { type: 'number', min: 1800, max: 2100 },
  'fields.playerCount.value': { type: 'string', maxLength: 50 },
  'fields.playTime.value': { type: 'string', maxLength: 50 },
  'fields.minAge.value': { type: 'number', min: 0, max: 99 },
  'fields.components.value': { type: 'array', maxItems: 200 }
};

/**
 * Error codes for gate-related failures
 */
export const GateErrorCode = {
  GATE_BLOCKED: 'GATE_BLOCKED',
  INVALID_GATE_ID: 'INVALID_GATE_ID',
  INVALID_STATUS: 'INVALID_STATUS',
  INVALID_PATCH: 'INVALID_PATCH',
  GATE_ALREADY_CONFIRMED: 'GATE_ALREADY_CONFIRMED',
  NO_INGESTION_REPORT: 'NO_INGESTION_REPORT'
};

/**
 * Get required gate IDs for a given ingestion report
 * PHASE F: Now accepts optional context for script/storyboard gates
 * @param {object} report - Ingestion report
 * @param {object} context - Optional context (hasScriptCandidates, hasStoryboard)
 * @returns {Array<string>} Array of required gate IDs
 */
export function getRequiredGateIds(report, context = {}) {
  if (!report) return [];
  
  return Object.values(GateDefinitions)
    .filter(def => def.required || def.requiredWhen(report, context))
    .map(def => def.id);
}

/**
 * Check if all required gates are satisfied
 * @param {object} gateStates - Gate states object
 * @param {Array<string>} requiredGateIds - Required gate IDs
 * @returns {boolean}
 */
export function areGatesSatisfied(gateStates, requiredGateIds) {
  if (!gateStates || !requiredGateIds) return false;
  
  return requiredGateIds.every(gateId => {
    const state = gateStates[gateId];
    return state && (
      state.status === GateStatus.CONFIRMED ||
      state.status === GateStatus.CORRECTED
    );
  });
}

/**
 * Get blocked reasons for unsatisfied gates
 * @param {object} gateStates - Gate states object
 * @param {Array<string>} requiredGateIds - Required gate IDs
 * @returns {Array<object>} Array of { gateId, title, reason }
 */
export function getBlockedReasons(gateStates, requiredGateIds) {
  if (!requiredGateIds) return [];
  
  const blocked = [];
  
  requiredGateIds.forEach(gateId => {
    const state = gateStates?.[gateId];
    const def = GateDefinitions[gateId];
    
    if (!state || state.status === GateStatus.PENDING) {
      blocked.push({
        gateId,
        title: def?.title || gateId,
        reason: 'Awaiting operator confirmation'
      });
    } else if (state.status === GateStatus.REJECTED) {
      blocked.push({
        gateId,
        title: def?.title || gateId,
        reason: 'Rejected by operator - requires correction'
      });
    }
  });
  
  return blocked;
}

/**
 * Create initial gate states for required gates
 * @param {Array<string>} requiredGateIds - Required gate IDs
 * @returns {object} Initial gate states
 */
export function createInitialGateStates(requiredGateIds) {
  const states = {};
  
  requiredGateIds.forEach(gateId => {
    states[gateId] = {
      gateId,
      status: GateStatus.PENDING,
      confirmedAt: null,
      notes: null,
      patch: null
    };
  });
  
  return states;
}

export default {
  GateId,
  GateStatus,
  GateDefinitions,
  PatchableFields,
  GateErrorCode,
  getRequiredGateIds,
  areGatesSatisfied,
  getBlockedReasons,
  createInitialGateStates
};
