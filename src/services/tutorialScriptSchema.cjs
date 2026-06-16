/**
 * Tutorial script segment schema and types for MOBIUS vertical slice.
 *
 * Follows the Elite Video Standard S1 required ordering:
 *   objective → turn_structure → core_mechanic → scoring → edge_cases
 * Plus optional segments: hook, game_identity, components, setup, recap, end_card
 */

const SEGMENT_TYPES = [
  'hook',
  'game_identity',
  'objective',
  'components',
  'setup',
  'turn_structure',
  'core_mechanic',
  'scoring',
  'edge_cases',
  'recap',
  'end_card'
];

// Elite S1 required ordering (these must appear in this order)
const ELITE_S1_REQUIRED_ORDER = [
  'objective',
  'turn_structure',
  'core_mechanic',
  'scoring',
  'edge_cases'
];

/**
 * Validate a script segment shape.
 * @param {object} segment
 * @returns {{ valid: boolean, errors: string[] }}
 */
function validateSegment(segment) {
  const errors = [];
  if (!segment) { errors.push('Segment is null/undefined'); return { valid: false, errors }; }
  if (!segment.id) errors.push('Missing segment.id');
  if (!segment.type || !SEGMENT_TYPES.includes(segment.type)) {
    errors.push(`Invalid segment type: ${segment.type}`);
  }
  if (!segment.narration || typeof segment.narration !== 'string') {
    errors.push('Missing or invalid segment.narration');
  }
  if (typeof segment.durationSec !== 'number' || segment.durationSec <= 0) {
    errors.push('Invalid segment.durationSec');
  }
  return { valid: errors.length === 0, errors };
}

/**
 * Validate Elite S1 ordering in a script.
 * @param {Array} segments
 * @returns {{ valid: boolean, errors: string[] }}
 */
function validateEliteOrdering(segments) {
  const errors = [];
  const requiredPresent = segments
    .filter((s) => ELITE_S1_REQUIRED_ORDER.includes(s.type))
    .map((s) => s.type);

  let lastIdx = -1;
  for (const type of requiredPresent) {
    const orderIdx = ELITE_S1_REQUIRED_ORDER.indexOf(type);
    if (orderIdx < lastIdx) {
      errors.push(`Elite S1 ordering violated: ${type} appears after a later-ordered segment`);
    }
    lastIdx = Math.max(lastIdx, orderIdx);
  }

  return { valid: errors.length === 0, errors };
}

module.exports = {
  SEGMENT_TYPES,
  ELITE_S1_REQUIRED_ORDER,
  validateSegment,
  validateEliteOrdering
};
