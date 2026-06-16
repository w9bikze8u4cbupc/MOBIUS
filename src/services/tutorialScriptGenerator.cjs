/**
 * Deterministic tutorial script generator for MOBIUS vertical slice.
 *
 * Converts a game fixture into beginner-first script segments following
 * the Elite Video Standard S1 ordering. No LLM calls, no network access.
 * All narration is derived directly from fixture data with source references.
 */

const { computeTextDuration } = require('../storyboard/storyboard_timing');
const { SEGMENT_TYPES, ELITE_S1_REQUIRED_ORDER, validateSegment, validateEliteOrdering } = require('./tutorialScriptSchema.cjs');

/**
 * Generate a deterministic tutorial script from a game fixture.
 *
 * @param {object} fixture - Game fixture data (see tests/fixtures/tutorial-vertical-slice/)
 * @returns {{ segments: Array, warnings: string[], metadata: object }}
 */
function generateTutorialScript(fixture) {
  if (!fixture || typeof fixture !== 'object') {
    throw new Error('SCRIPT_GENERATION_FAILED: fixture is required');
  }

  const segments = [];
  const warnings = [];
  const gameName = fixture.gameName || 'Unknown Game';
  const gameId = fixture.gameId || 'unknown';

  // --- Hook (0-10s) ---
  const hookText = `After this video, you'll know how to play ${gameName} and score your first game.`;
  segments.push(makeSegment('hook', hookText, { sourceField: 'gameName' }));

  // --- Game Identity ---
  const playerRange = fixture.playerCount
    ? `${fixture.playerCount.min}–${fixture.playerCount.max} players`
    : null;
  const identityParts = [`Game: ${gameName}`];
  if (playerRange) identityParts.push(`Players: ${playerRange}`);
  if (fixture.duration) identityParts.push(`Duration: ${fixture.duration}`);
  const identityText = identityParts.join('. ') + '.';
  segments.push(makeSegment('game_identity', identityText, { sourceField: 'playerCount,duration' }));

  // --- Objective (Elite S1 required) ---
  if (fixture.objective) {
    segments.push(makeSegment('objective', fixture.objective, { sourceField: 'objective' }));
  } else {
    warnings.push('Missing fixture.objective — segment skipped');
  }

  // --- Components (optional) ---
  if (Array.isArray(fixture.components) && fixture.components.length > 0) {
    const compText = 'You will need: ' + fixture.components
      .map((c) => `${c.quantity} ${c.name}`)
      .join(', ') + '.';
    segments.push(makeSegment('components', compText, { sourceField: 'components' }));
  }

  // --- Setup (optional) ---
  if (Array.isArray(fixture.setup) && fixture.setup.length > 0) {
    const setupText = fixture.setup
      .map((step, i) => `Step ${i + 1}: ${step}`)
      .join(' ');
    segments.push(makeSegment('setup', setupText, { sourceField: 'setup' }));
  }

  // --- Turn Structure (Elite S1 required) ---
  if (fixture.turnStructure) {
    let turnText = fixture.turnStructure.description || '';
    if (fixture.turnStructure.phases && fixture.turnStructure.phases.length) {
      turnText += ` Each turn has ${fixture.turnStructure.phases.length} phases: ${fixture.turnStructure.phases.join(', ')}.`;
    }
    if (fixture.turnStructure.endCondition) {
      turnText += ` ${fixture.turnStructure.endCondition}`;
    }
    segments.push(makeSegment('turn_structure', turnText.trim(), { sourceField: 'turnStructure' }));
  } else {
    warnings.push('Missing fixture.turnStructure — segment skipped');
  }

  // --- Core Mechanic (Elite S1 required) ---
  if (fixture.coreMechanic) {
    let mechText = fixture.coreMechanic.description || '';
    if (fixture.coreMechanic.name) {
      mechText = `The core mechanic is ${fixture.coreMechanic.name}. ${mechText}`;
    }
    segments.push(makeSegment('core_mechanic', mechText.trim(), { sourceField: 'coreMechanic' }));
  } else {
    warnings.push('Missing fixture.coreMechanic — segment skipped');
  }

  // --- Scoring (Elite S1 required) ---
  if (fixture.scoring) {
    let scoreText = fixture.scoring.description || '';
    if (fixture.scoring.winCondition) {
      scoreText += ` ${fixture.scoring.winCondition}`;
    }
    segments.push(makeSegment('scoring', scoreText.trim(), { sourceField: 'scoring' }));
  } else {
    warnings.push('Missing fixture.scoring — segment skipped');
  }

  // --- Edge Cases (Elite S1 required) ---
  if (Array.isArray(fixture.edgeCases) && fixture.edgeCases.length > 0) {
    const edgeText = 'A few things to watch out for: ' + fixture.edgeCases.join(' ');
    segments.push(makeSegment('edge_cases', edgeText, { sourceField: 'edgeCases' }));
  } else {
    warnings.push('Missing fixture.edgeCases — segment skipped');
  }

  // --- Recap ---
  const recapText = `That's everything you need to start playing ${gameName}. Remember: ${fixture.objective || 'have fun!'}`;
  segments.push(makeSegment('recap', recapText, { sourceField: 'objective' }));

  // --- End Card ---
  segments.push(makeSegment('end_card', `You're ready to play ${gameName}!`, { sourceField: 'gameName' }));

  // Validate Elite ordering
  const orderingResult = validateEliteOrdering(segments);
  if (!orderingResult.valid) {
    warnings.push(...orderingResult.errors);
  }

  const totalDurationSec = segments.reduce((sum, s) => sum + s.durationSec, 0);

  const metadata = {
    gameId,
    gameName,
    segmentCount: segments.length,
    totalDurationSec: Math.round(totalDurationSec * 100) / 100,
    eliteS1Valid: orderingResult.valid,
    generatedBy: 'mobius-tutorial-script-generator',
    version: '1.0.0'
  };

  return { segments, warnings, metadata };
}

function makeSegment(type, narration, options = {}) {
  const durationSec = computeTextDuration(narration);
  return {
    id: `segment-${type}`,
    type,
    narration,
    durationSec,
    sourceRef: options.sourceField || null,
    confidence: 1.0
  };
}

module.exports = {
  generateTutorialScript
};
