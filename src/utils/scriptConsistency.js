// src/utils/scriptConsistency.js
// Validate script candidates against confirmed ingestion report
// PHASE F: Enforce "no contradictions with confirmed ingestion" invariant

/**
 * Violation severity levels
 */
export const ViolationSeverity = {
  ERROR: 'error',     // Blocks confirmation
  WARNING: 'warning'  // Allows confirmation but flags for review
};

/**
 * Violation types
 */
export const ViolationType = {
  UNKNOWN_COMPONENT: 'unknown_component',
  INCONSISTENT_SETUP: 'inconsistent_setup',
  INCONSISTENT_TURN_STRUCTURE: 'inconsistent_turn_structure',
  MISSING_REQUIRED_COMPONENT: 'missing_required_component',
  TERMINOLOGY_MISMATCH: 'terminology_mismatch'
};

/**
 * Extract component references from script text
 * Simple keyword extraction
 * @param {string} text - Script text
 * @returns {Set<string>} Set of component names (normalized)
 */
function extractComponentReferences(text) {
  if (!text) return new Set();
  
  const references = new Set();
  const normalized = text.toLowerCase();
  
  // Common component patterns
  const patterns = [
    /\b(\w+)\s+(card|cards|token|tokens|tile|tiles|board|boards|piece|pieces|die|dice|marker|markers|cube|cubes|meeple|meeples)\b/gi,
    /\bthe\s+(\w+(?:\s+\w+)?)\s+(?:card|token|tile|board|piece|die|marker|cube|meeple)/gi
  ];
  
  for (const pattern of patterns) {
    const matches = text.matchAll(pattern);
    for (const match of matches) {
      const component = match[1].toLowerCase().trim();
      if (component.length > 2) {
        references.add(component);
      }
    }
  }
  
  return references;
}

/**
 * Normalize component name for comparison
 * @param {string} name - Component name
 * @returns {string} Normalized name
 */
function normalizeComponentName(name) {
  return name
    .toLowerCase()
    .trim()
    .replace(/s$/, '') // Remove plural
    .replace(/[^\w\s]/g, '') // Remove punctuation
    .replace(/\s+/g, ' '); // Normalize whitespace
}

/**
 * Check if two component names match (fuzzy)
 * @param {string} name1 - First name
 * @param {string} name2 - Second name
 * @returns {boolean} True if match
 */
function componentsMatch(name1, name2) {
  const norm1 = normalizeComponentName(name1);
  const norm2 = normalizeComponentName(name2);
  
  // Exact match
  if (norm1 === norm2) return true;
  
  // One contains the other
  if (norm1.includes(norm2) || norm2.includes(norm1)) return true;
  
  // Check for common synonyms
  const synonyms = {
    'die': 'dice',
    'card': 'deck',
    'token': 'marker',
    'piece': 'meeple'
  };
  
  for (const [syn1, syn2] of Object.entries(synonyms)) {
    if ((norm1.includes(syn1) && norm2.includes(syn2)) ||
        (norm1.includes(syn2) && norm2.includes(syn1))) {
      return true;
    }
  }
  
  return false;
}

/**
 * Validate script candidate against confirmed ingestion report
 * @param {object} scriptCandidate - Script artifact candidate
 * @param {object} ingestionReport - Confirmed ingestion report
 * @returns {object} { valid: boolean, violations: Array, warnings: Array }
 */
export function validateScriptConsistency(scriptCandidate, ingestionReport) {
  const violations = [];
  const warnings = [];
  
  if (!scriptCandidate || !ingestionReport) {
    return { valid: true, violations, warnings };
  }
  
  // Extract confirmed components from ingestion report
  const confirmedComponents = new Set();
  if (ingestionReport.fields && ingestionReport.fields.components) {
    const componentsField = ingestionReport.fields.components;
    if (Array.isArray(componentsField.value)) {
      componentsField.value.forEach(comp => {
        const name = typeof comp === 'string' ? comp : comp.name;
        if (name) {
          confirmedComponents.add(normalizeComponentName(name));
        }
      });
    }
  }
  
  // If no confirmed components, skip validation (backward compatibility)
  if (confirmedComponents.size === 0) {
    warnings.push({
      type: ViolationType.MISSING_REQUIRED_COMPONENT,
      severity: ViolationSeverity.WARNING,
      message: 'No confirmed components in ingestion report - skipping component validation',
      field: 'components'
    });
    return { valid: true, violations, warnings };
  }
  
  // Extract component references from script
  const scriptText = scriptCandidate.rawScript || 
    scriptCandidate.scriptSegments?.map(s => s.content).join('\n') || '';
  
  const referencedComponents = extractComponentReferences(scriptText);
  
  // Check for unknown components
  for (const referenced of referencedComponents) {
    let found = false;
    for (const confirmed of confirmedComponents) {
      if (componentsMatch(referenced, confirmed)) {
        found = true;
        break;
      }
    }
    
    if (!found) {
      // Check if it's a generic term that might be acceptable
      const genericTerms = ['card', 'token', 'tile', 'board', 'piece', 'die', 'dice', 'marker', 'cube', 'meeple'];
      const isGeneric = genericTerms.some(term => referenced.includes(term) && referenced.split(' ').length === 1);
      
      if (!isGeneric) {
        violations.push({
          type: ViolationType.UNKNOWN_COMPONENT,
          severity: ViolationSeverity.ERROR,
          message: `Script references component "${referenced}" which is not in confirmed components list`,
          field: 'components',
          value: referenced,
          suggestion: 'Remove this component or add it to the confirmed components list'
        });
      }
    }
  }
  
  // Check for missing critical components
  // If script has a component overview section, it should mention key components
  const componentSegment = scriptCandidate.scriptSegments?.find(
    s => s.type === 'component_overview'
  );
  
  if (componentSegment && confirmedComponents.size > 0) {
    const segmentText = componentSegment.content.toLowerCase();
    let mentionedCount = 0;
    
    for (const confirmed of confirmedComponents) {
      if (segmentText.includes(confirmed)) {
        mentionedCount++;
      }
    }
    
    // Warn if less than 50% of components are mentioned
    if (mentionedCount < confirmedComponents.size * 0.5) {
      warnings.push({
        type: ViolationType.MISSING_REQUIRED_COMPONENT,
        severity: ViolationSeverity.WARNING,
        message: `Component overview mentions only ${mentionedCount}/${confirmedComponents.size} confirmed components`,
        field: 'component_overview',
        suggestion: 'Ensure all major components are described in the component overview'
      });
    }
  }
  
  // Validate setup consistency (if setup field exists in ingestion report)
  if (ingestionReport.fields && ingestionReport.fields.setup) {
    const setupSegment = scriptCandidate.scriptSegments?.find(
      s => s.type === 'setup'
    );
    
    if (setupSegment) {
      // Check if setup introduces new components not in confirmed list
      const setupComponents = extractComponentReferences(setupSegment.content);
      
      for (const setupComp of setupComponents) {
        let found = false;
        for (const confirmed of confirmedComponents) {
          if (componentsMatch(setupComp, confirmed)) {
            found = true;
            break;
          }
        }
        
        if (!found) {
          const genericTerms = ['card', 'token', 'tile', 'board', 'piece', 'die', 'dice', 'marker', 'cube', 'meeple'];
          const isGeneric = genericTerms.some(term => setupComp.includes(term) && setupComp.split(' ').length === 1);
          
          if (!isGeneric) {
            violations.push({
              type: ViolationType.INCONSISTENT_SETUP,
              severity: ViolationSeverity.ERROR,
              message: `Setup section references unknown component "${setupComp}"`,
              field: 'setup',
              value: setupComp,
              suggestion: 'Use only confirmed components in setup instructions'
            });
          }
        }
      }
    }
  }
  
  return {
    valid: violations.length === 0,
    violations,
    warnings
  };
}

/**
 * Format violations for display
 * @param {Array} violations - Array of violations
 * @returns {string} Formatted message
 */
export function formatViolations(violations) {
  if (!violations || violations.length === 0) {
    return 'No violations';
  }
  
  return violations.map((v, idx) => 
    `${idx + 1}. [${v.severity.toUpperCase()}] ${v.message}\n   Field: ${v.field}\n   Suggestion: ${v.suggestion || 'N/A'}`
  ).join('\n\n');
}

export default {
  ViolationSeverity,
  ViolationType,
  validateScriptConsistency,
  formatViolations
};
