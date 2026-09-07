'use strict';

const VALID_STYLES = new Set(['GOLD_HALO', 'GREEN_HALO', 'OUTLINE', 'DIM_OTHERS', 'NONE']);

function finite(value, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function compileFocusCueTimeline({ sceneId, durationSec, clauses = [], cardSemanticRegions = {} }) {
  const duration = finite(durationSec);
  const violations = [];
  const cues = clauses.map((clause, index) => {
    const region = cardSemanticRegions[clause.semanticRegion];
    const startSec = Math.max(0, finite(clause.startSec));
    const endSec = Math.min(duration, finite(clause.endSec));
    if (!region && clause.focusStyle !== 'NONE') violations.push(`missing-semantic-region:${clause.semanticRegion}`);
    if (endSec <= startSec) violations.push(`invalid-cue-duration:${index}`);
    const focusStyle = VALID_STYLES.has(clause.focusStyle) ? clause.focusStyle : 'GOLD_HALO';
    return {
      sceneId,
      narrationClause: clause.narrationClause,
      startSec: Number(startSec.toFixed(3)),
      endSec: Number(endSec.toFixed(3)),
      assetId: clause.assetId,
      semanticRegion: clause.semanticRegion,
      focusStyle,
      bounds: region ? { ...region } : null,
      confidence: finite(clause.confidence, 1),
      sourceRefs: clause.sourceRefs || [],
    };
  }).sort((left, right) => left.startSec - right.startSec);
  for (let index = 1; index < cues.length; index += 1) {
    if (cues[index].startSec < cues[index - 1].endSec
      && cues[index].assetId === cues[index - 1].assetId
      && cues[index].semanticRegion !== cues[index - 1].semanticRegion) {
      violations.push(`conflicting-overlap:${cues[index - 1].semanticRegion}:${cues[index].semanticRegion}`);
    }
  }
  return {
    contract: 'mobius-focus-cue-timeline-v1',
    sceneId,
    durationSec: duration,
    cues,
    validation: { status: violations.length ? 'FAIL' : 'PASS', violations },
  };
}

function auditFocusCueTimeline({ timeline, narrationClauses = [] }) {
  const violations = [...(timeline?.validation?.violations || [])];
  const cues = timeline?.cues || [];
  for (const clause of narrationClauses) {
    if (!clause.requiredSemanticRegion) continue;
    const matches = cues.filter((cue) => cue.semanticRegion === clause.requiredSemanticRegion
      && cue.startSec <= finite(clause.endSec)
      && cue.endSec >= finite(clause.startSec));
    if (!matches.length) violations.push(`unfocused-required-clause:${clause.requiredSemanticRegion}`);
  }
  return { status: violations.length ? 'FAIL' : 'PASS', violationCount: violations.length, violations };
}

module.exports = { auditFocusCueTimeline, compileFocusCueTimeline };
