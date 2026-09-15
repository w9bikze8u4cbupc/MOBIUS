'use strict';

const fs = require('node:fs');
const path = require('node:path');
const sharp = require('sharp');
const { spawnSync } = require('node:child_process');
const { buildTeachingScene } = require('../storyboard/tutorial_presentation.cjs');
const { teachingSceneLayout, containedDisplayBounds, PRESENTATION_TOKENS } = require('./presentationDesignSystem.cjs');
const crypto = require('node:crypto');
const sha = value => crypto.createHash('sha256').update(value).digest('hex');
const xml = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&apos;'}[c]));
const VISUAL_PLAN_MATERIALIZER_CONTRACT = 'mobius-visual-plan-materializer-v9';
const STATE_SEQUENCE_CONTRACT = 'mobius-source-measured-state-sequence-v2';
const SEMANTIC_SEQUENCE_CONTRACT = 'mobius-source-grounded-semantic-sequence-v2';
const INSTRUCTIONAL_DIAGRAM_CONTRACT = 'mobius-source-grounded-instructional-diagram-v2';
const TRACK_SEQUENCE_CONTRACT = 'mobius-source-measured-track-sequence-v2';
const TEXT_TEACHING_STILL_CONTRACT = 'mobius-source-grounded-text-teaching-still-v1';

function stateValueLabel(item = {}) {
  if (item.diagramStage === 'before') return 'État initial';
  if (item.diagramStage === 'action') return 'Action en cours';
  if (item.diagramStage === 'after') return 'État obtenu';
  if (item.instructionalDiagramOnly) return 'Composant source';
  if (item.removed || item.visibility === 'REMOVED') return 'Retiré';
  if (item.consumed || item.availability === 'CONSUMED') return 'Utilisé';
  if (item.availability === 'UNAVAILABLE') return 'Indisponible';
  if (item.faceState === 'FACE_DOWN') return 'Face cachée';
  if (item.faceState === 'FACE_UP') return 'Face visible';
  if (item.trackPosition != null) return `Position ${item.trackPosition}`;
  if (item.quantity != null) return `Quantité ${item.quantity}`;
  // Locations and orientations originate in the authoritative rulebook and
  // may not be French. The localized instructional sentence above the image
  // carries their exact meaning; this compact physical-state badge must not
  // leak source-language prose or clip it into a misleading fragment.
  if (item.location) return 'Placement indiqué';
  if (item.orientation) return 'Orientation indiquée';
  return 'En jeu';
}

function stateBadgeLines(item = {}, requirement = {}, stage = {}) {
  const terminal = ['after', 'result', 'final'].includes(String(stage.id || stage.diagramStage || '').toLowerCase());
  const primary = terminal && requirement.discardPileRequired ? 'Défausse'
    : terminal && requirement.setupPlacementRequired && item.location ? 'Emplacement final'
      : stateValueLabel(item);
  const values = [primary];
  if (item.quantity != null) values.push(`× ${item.quantity}`);
  if (item.coveredBy?.length) values.push('Recouvert');
  if (item.covers?.length) values.push('Au-dessus');
  return values.flatMap((value) => wrapSvgText(value, 24, 2)).slice(0, 2);
}

function instructionalRelationshipKind(requirement = {}) {
  const relationship = String(requirement.requiredRelationship || requirement.requiredState || '').toLocaleLowerCase('fr-CA');
  if (!relationship) return 'NONE';
  if (/\b(?:not|without|outside|off|absent|ne\s+.+\s+pas|sans|hors)\b/.test(relationship)) return 'SEPARATE';
  return 'RELATED';
}

function relationshipOverlay(states = [], requirement = {}, stage = {}) {
  if (states.length < 2 || !['action', 'after'].includes(String(stage.id || stage.diagramStage || '').toLowerCase())) return '';
  const kind = instructionalRelationshipKind(requirement);
  if (kind === 'NONE') return '';
  const first = states[0], last = states[states.length - 1];
  const x1 = first.left + first.width / 2, y1 = first.top + first.height / 2;
  const x2 = last.left + last.width / 2, y2 = last.top + last.height / 2;
  if (kind === 'SEPARATE') {
    const cx = (x1 + x2) / 2, cy = (y1 + y2) / 2;
    return `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="#ec6c3b" stroke-width="8" stroke-dasharray="18 14"/><circle cx="${cx}" cy="${cy}" r="34" fill="#231811" stroke="#ec6c3b" stroke-width="6"/><line x1="${cx - 22}" y1="${cy + 22}" x2="${cx + 22}" y2="${cy - 22}" stroke="#ec6c3b" stroke-width="7"/>`;
  }
  return `<path d="M ${x1} ${y1} L ${x2} ${y2}" stroke="#f4d35e" stroke-width="9" fill="none" marker-end="url(#mobius-arrow)"/><circle cx="${x1}" cy="${y1}" r="17" fill="#f4d35e"/><circle cx="${x2}" cy="${y2}" r="22" fill="none" stroke="#fff3d9" stroke-width="6"/>`;
}

function wrapSvgText(value, max = 58, maximumLines = 3) {
  const lines = [];
  let line = '';
  for (const word of String(value || '').replace(/\s+/g, ' ').trim().split(' ')) {
    if (!word) continue;
    if (line && line.length + word.length + 1 > max) {
      lines.push(line);
      line = word;
      if (lines.length >= maximumLines) break;
    } else {
      line += `${line ? ' ' : ''}${word}`;
    }
  }
  if (line && lines.length < maximumLines) lines.push(line);
  return lines;
}

// The canonical compiler stores the localized visual teaching object directly.
// Older persisted projects wrapped the same object under `visualTeaching`.
// Accept both shapes at this boundary so a replay never falls back to the
// English provider requirement merely because its transport shape changed.
function localizedVisualTeaching(scene = {}) {
  const teaching = scene.localizedTeaching || {};
  const candidate = teaching.visualTeaching && typeof teaching.visualTeaching === 'object'
    ? teaching.visualTeaching
    : teaching;
  return {
    beforeState: String(candidate.beforeState || '').trim(),
    actionState: String(candidate.actionState || '').trim(),
    afterState: String(candidate.afterState || '').trim(),
  };
}

function statefulTeachingLayout(referentCount = 1) {
  const componentRegion = { x: 130, y: 430, width: 1660, height: 460 };
  return {
    componentRegion,
    cells: gridCells(referentCount, componentRegion.width, componentRegion.height, 0)
      .map((cell) => ({ ...cell, x: cell.x + componentRegion.x, y: cell.y + componentRegion.y })),
    typography: {
      headlinePx: 64,
      stagePx: 48,
      instructionalPx: 52,
      instructionalLineHeightPx: 60,
      componentLabelPx: 42,
      footerPx: 40,
    },
  };
}

function stageStateSignature(stage = {}, referents = []) {
  return JSON.stringify(referents.map((referent) => {
    const item = (stage.items || []).find((entry) => entry.componentRef === referent || entry.id === referent) || {};
    return [referent, item.location || null, item.orientation || null, item.faceState || null,
      item.visibility || null, item.quantity ?? null, item.trackPosition ?? null,
      item.availability || null, Boolean(item.consumed), Boolean(item.removed),
      item.coveredBy || [], item.covers || []];
  }));
}

function statefulComponentDisplayBounds(asset = {}, { referentCount = 1, position = 0 } = {}) {
  const cell = statefulTeachingLayout(referentCount).cells[position];
  if (!cell) return { width: 0, height: 0 };
  const sourceWidth = Number(asset.nativeWidthPx || asset.width || 0);
  const sourceHeight = Number(asset.nativeHeightPx || asset.height || 0);
  if (!(sourceWidth > 0) || !(sourceHeight > 0)) return { width: cell.width, height: cell.height };
  const detailWidth = Number(asset.trueDetailDimensions?.width || sourceWidth);
  const detailHeight = Number(asset.trueDetailDimensions?.height || sourceHeight);
  // Keep at least 0.8 true source pixels per displayed pixel.  A large
  // derivative canvas never grants permission to enlarge a small underlying
  // raster; it is rendered smaller and left for final phone/composition QA.
  const detailScale = Math.min(detailWidth / sourceWidth / .8, detailHeight / sourceHeight / .8);
  const scale = Math.min(cell.width / sourceWidth, cell.height / sourceHeight, 1.15, detailScale);
  return {
    width: Math.max(1, Math.floor(sourceWidth * scale)),
    height: Math.max(1, Math.floor(sourceHeight * scale)),
  };
}

function sourceMeasuredComponentCandidate({ scene, referent, assets = [], referentCount = 1, position = 0 } = {}) {
  const { objectEvidenceFor, evaluateCandidate } = require('./sourceAssetResolver.cjs');
  const requirement = { actualGameAssetRequired: true, requiredObjects: [referent], evidenceSceneId: scene.id };
  const candidates = assets.map((asset) => {
    const component = objectEvidenceFor(asset, referent, scene.id, { allowReusableIdentity: true });
    if (!(component?.present && component.complete && component.isolated && component.stateCompatible
      && Number(component.confidence) >= .9) || !sourceFile(asset) || !fs.existsSync(sourceFile(asset))) return null;
    // Evaluate source detail against the exact bounded footprint used by
    // renderStatefulFrame.  The former fixed 900x700 box could reject an
    // independently measured component even though the normal renderer would
    // display it at its native size (or at most 1.15x).  Final composition and
    // phone-scale review remain responsible for whether that truthful source
    // component teaches the whole scene.
    const measured = evaluateCandidate(asset, requirement,
      statefulComponentDisplayBounds(asset, { referentCount, position }));
    return measured.valid ? { asset, component, measured } : null;
  }).filter(Boolean);
  return candidates.sort((left, right) => right.measured.confidence - left.measured.confidence
    || right.measured.trueSourcePixelsPerDisplayPixel - left.measured.trueSourcePixelsPerDisplayPixel
    || String(left.asset.id).localeCompare(String(right.asset.id)))[0] || null;
}

async function renderStatefulFrame({ projectId, scene, sequenceId, stage, index, total, selected, outputDir } = {}) {
  const frameWidth = 1920, frameHeight = 1080;
  // Reserve a truthful source-grounded explanation band above the physical
  // components. It never draws a new game token/card; it only labels the
  // exact state or rule fact already cited by the RuleAtom.
  const teachingLayout = statefulTeachingLayout(selected.length);
  const { cells, componentRegion, typography } = teachingLayout;
  const primary = sourceFile(selected[0].asset);
  const backdrop = await sharp(primary).resize(frameWidth, frameHeight, { fit: 'cover' }).blur(40)
    .modulate({ brightness: .19, saturation: .5 }).png().toBuffer();
  const layers = [{ input: backdrop, left: 0, top: 0 }];
  const states = [];
  let minimumSourcePixelsPerDisplayPixel = Infinity;
  for (const [position, entry] of selected.entries()) {
    const cell = cells[position];
    const item = (stage.items || []).find((value) => value.componentRef === entry.referent || value.id === entry.referent);
    if (!item) return null;
    const metadata = await sharp(sourceFile(entry.asset)).metadata();
    const sourceWidth = Number(entry.asset.nativeWidthPx || metadata.width || 0);
    const sourceHeight = Number(entry.asset.nativeHeightPx || metadata.height || 0);
    if (!sourceWidth || !sourceHeight) return null;
    const detailWidth = Number(entry.asset.trueDetailDimensions?.width || sourceWidth);
    const detailHeight = Number(entry.asset.trueDetailDimensions?.height || sourceHeight);
    const detailScale = Math.min(detailWidth / sourceWidth / .8, detailHeight / sourceHeight / .8);
    const scale = Math.min(cell.width / sourceWidth, cell.height / sourceHeight, 1.15, detailScale);
    const width = Math.max(1, Math.floor(sourceWidth * scale));
    const height = Math.max(1, Math.floor(sourceHeight * scale));
    const sourcePixelsPerDisplayPixel = Math.min(sourceWidth / width, sourceHeight / height);
    if (sourcePixelsPerDisplayPixel < .8) return null;
    minimumSourcePixelsPerDisplayPixel = Math.min(minimumSourcePixelsPerDisplayPixel, sourcePixelsPerDisplayPixel);
    const image = await sharp(sourceFile(entry.asset)).resize(width, height, { fit: 'contain' }).png().toBuffer();
    const requirement = scene.visualRequirement || {};
    const terminalStage = ['after', 'result', 'final'].includes(String(stage.id || stage.diagramStage || '').toLowerCase())
      || index === total - 1;
    const transitionLane = selected.length === 1 && total > 1
      && (requirement.setupPlacementRequired || requirement.requiredRelationship || item.location
        || item.semanticInstructionOnly || item.instructionalDiagramOnly);
    const centeredLeft = cell.x + Math.floor((cell.width - width) / 2);
    const laneTravel = transitionLane ? Math.min(360, Math.max(120, Math.floor((cell.width - width) * .3))) : 0;
    const stageProgress = total > 1 ? index / (total - 1) : .5;
    const left = centeredLeft + (transitionLane ? Math.round((stageProgress * 2 - 1) * laneTravel) : 0);
    const top = cell.y + Math.floor((cell.height - height) / 2);
    const quantity = Number.isInteger(item.quantity) && item.quantity > 1 ? item.quantity : 1;
    // A discard/deck pile is a relationship, not an exact numeric claim.
    // Two offset copies make the cited pile visible without inventing a card
    // count. Explicit quantities continue to use their measured value.
    const pileCopies = terminalStage && requirement.discardPileRequired
      && (selected.length === 1 || /discard|défausse/i.test(String(item.location || ''))) ? 2 : 1;
    const visibleCopies = Math.max(pileCopies, Math.min(quantity, 4));
    const copyOffset = visibleCopies > 1 ? Math.min(26, Math.floor((cell.width - width) / Math.max(1, visibleCopies - 1))) : 0;
    for (let copy = visibleCopies - 1; copy >= 0; copy -= 1) {
      layers.push({ input: image, left: left + copy * copyOffset, top: top - copy * Math.min(12, copyOffset),
        opacity: (item.removed || item.visibility === 'REMOVED') ? .24 : 1 });
    }
    states.push({ referent: entry.referent, assetId: entry.asset.id, label: stateValueLabel(item),
      left, top, width: width + copyOffset * (visibleCopies - 1), height, item,
      transitionLane, terminalStage, pileVisual: pileCopies > 1,
      faceMask: item.faceState === 'FACE_DOWN' });
  }
  const labels = states.map((value) => {
    const lines = stateBadgeLines(value.item, scene.visualRequirement || {}, stage);
    const labelTop = Math.max(338, value.top - (lines.length > 1 ? 102 : 66));
    const labelHeight = lines.length > 1 ? 92 : 56;
    const crossed = (value.item.removed || value.item.visibility === 'REMOVED')
      ? `<line x1="${value.left}" y1="${value.top}" x2="${value.left + value.width}" y2="${value.top + value.height}" stroke="#ec6c3b" stroke-width="10"/><line x1="${value.left + value.width}" y1="${value.top}" x2="${value.left}" y2="${value.top + value.height}" stroke="#ec6c3b" stroke-width="10"/>`
      : '';
    const faceMask = value.faceMask
      ? `<rect x="${value.left}" y="${value.top}" width="${value.width}" height="${value.height}" rx="14" fill="#231811" fill-opacity=".88" stroke="#e1c184" stroke-width="5" stroke-dasharray="18 12"/><text x="${value.left + value.width / 2}" y="${value.top + value.height / 2}" text-anchor="middle" fill="#fff3d9" font-family="Arial" font-size="42" font-weight="bold">FACE CACHÉE</text>`
      : '';
    const zone = value.transitionLane
      ? `<rect x="${value.left - 28}" y="${value.top - 28}" width="${value.width + 56}" height="${value.height + 56}" rx="22" fill="none" stroke="${value.terminalStage ? '#f4d35e' : '#7f6a52'}" stroke-width="4" stroke-dasharray="16 12"/>`
      : '';
    return `${zone}<rect x="${value.left}" y="${labelTop}" width="${Math.max(180, value.width)}" height="${labelHeight}" rx="12" fill="#231811" fill-opacity=".94" stroke="#be9a58" stroke-width="2"/>${lines.map((line, lineIndex) => `<text x="${value.left + 16}" y="${labelTop + 40 + lineIndex * 38}" fill="#fff3d9" font-family="Arial" font-size="${Math.min(typography.componentLabelPx, 38)}" font-weight="bold">${xml(line)}</text>`).join('')}${faceMask}${crossed}`;
  }).join('');
  const headline = String(scene.on_screen_text || scene.title || scene.visualRequirement?.purpose || '').split(/\n/)[0].slice(0, 120);
  const headlineLines = wrapSvgText(headline, 46, 2);
  const headlineText = headlineLines.map((line, lineIndex) => `<text x="96" y="${104 + lineIndex * 58}" fill="#fff3d9" font-family="Arial" font-size="56" font-weight="bold">${xml(line)}</text>`).join('');
  const stageY = 116 + headlineLines.length * 58;
  const instructionY = stageY + 60;
  const instructionalLines = wrapSvgText(stage.instructionalText, 58, 2);
  const instructionalText = instructionalLines.map((line, lineIndex) => `<text x="96" y="${instructionY + lineIndex * typography.instructionalLineHeightPx}" fill="#fff3d9" font-family="Arial" font-size="${typography.instructionalPx}">${xml(line)}</text>`).join('');
  const presentationKind = (stage.items || []).some((item) => item.instructionalDiagramOnly)
    ? 'Illustration explicative fondée sur le livret'
    : ((stage.items || []).some((item) => item.semanticInstructionOnly) ? 'Explication fondée sur le livret' : 'État source du jeu');
  const progress = Array.from({ length: total }, (_, step) => `<rect x="${1390 + step * 92}" y="126" width="70" height="12" rx="6" fill="${step === index ? '#f4d35e' : '#6a5745'}"/>`).join('');
  const relationship = relationshipOverlay(states, scene.visualRequirement || {}, stage);
  const panelSvg = Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${frameWidth}" height="${frameHeight}"><rect x="42" y="38" width="1836" height="1004" rx="32" fill="#231811" fill-opacity=".86" stroke="#be9a58" stroke-width="3"/></svg>`);
  const overlaySvg = Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${frameWidth}" height="${frameHeight}"><defs><marker id="mobius-arrow" markerWidth="14" markerHeight="14" refX="12" refY="7" orient="auto"><path d="M0,0 L14,7 L0,14 z" fill="#f4d35e"/></marker></defs>${headlineText}<text x="96" y="${stageY}" fill="#e1c184" font-family="Arial" font-size="${typography.stagePx}" font-weight="bold">${xml(stage.label || `Étape ${index + 1}`)}</text>${progress}${instructionalText}${relationship}${labels}<text x="96" y="1000" fill="#fff3d9" font-family="Arial" font-size="${typography.footerPx}">${index + 1} / ${total} · ${xml(presentationKind)} · Livret p. ${xml((scene.source_pages || []).join(', '))}</text></svg>`);
  layers.splice(1, 0, { input: panelSvg, left: 0, top: 0 });
  layers.push({ input: overlaySvg, left: 0, top: 0 });
  const target = path.resolve(outputDir, `${sequenceId}-state-${index + 1}.png`);
  const materialized = target.replace(/\.png$/, '.materialized.png');
  await sharp({ create: { width: frameWidth, height: frameHeight, channels: 4, background: { r: 31, g: 21, b: 16, alpha: 1 } } }).composite(layers).png().toFile(materialized);
  const configPath = target.replace(/\.png$/, '.render-config.json');
  const renderScene = { id: `${sequenceId}-state-${index + 1}`, type: 'teaching', durationSec: 1,
    narrationText: scene.narration, layout: { mode: 'visual-first-full-frame' }, background: { image: materialized }, overlays: [] };
  await fs.promises.writeFile(configPath, JSON.stringify({ projectId, video: { resolution: { width: frameWidth, height: frameHeight }, fps: 30 }, scenes: [renderScene] }, null, 2));
  const rendered = spawnSync(process.execPath, [path.resolve(__dirname, '../../scripts/render-storyboard-ffmpeg.mjs'), '--config', configPath, '--out', target, '--still'], { encoding: 'utf8', windowsHide: true });
  await fs.promises.writeFile(target.replace(/\.png$/, '.render.log'), `${rendered.stdout || ''}${rendered.stderr || ''}`);
  if (rendered.status !== 0) throw new Error('NORMAL_STATEFUL_STILL_RENDER_FAILED');
  const phonePath = target.replace(/\.png$/, '.phone.png');
  await sharp(target).resize(390, 219).png().toFile(phonePath);
  return { id: `${sequenceId}-state-${index + 1}`, outputPath: target, phonePath, renderConfigPath: configPath,
    narration: scene.narration, stage, sourcePixelsPerDisplayPixel: minimumSourcePixelsPerDisplayPixel,
    actualDisplayBounds: { left: componentRegion.x, top: componentRegion.y, width: componentRegion.width, height: componentRegion.height },
    typography, visualState: states.map(({ referent, assetId, left, top, width, height, transitionLane, terminalStage, pileVisual, faceMask }) => ({ referent, assetId, left, top, width, height, transitionLane, terminalStage, pileVisual, faceMask })),
    phoneTypographyPx: Object.fromEntries(Object.entries(typography).map(([key, value]) => [key, Number((value * 390 / 1920).toFixed(2))])),
    preparedOnly: true, validated: false };
}

/**
 * Build a reviewable sequence only when every required physical component has
 * independently measured pixels and the canonical physical state contains a
 * real, source-cited change. The provider then verifies the FINAL composition.
 */
async function materializeStatefulInstructionalFrames({ projectId, scene, assets, outputDir } = {}) {
  const requirement = scene.visualRequirement || {};
  const referents = requirement.requiredObjects || [];
  const state = scene.physicalState || {};
  if (requirement.trackStateRequired || !referents.length || referents.length > 4
    || !(requirement.transitionRequired || requirement.setupPlacementRequired || requirement.layeredStateRequired
      || requirement.oneShotMarkerRequired || requirement.requiredRelationship || requirement.requiredState)) return null;
  const stages = state.stages || [];
  if (state.reviewState !== 'accepted' || stages.length < 2 || stages.length > 6
    || new Set(stages.map((stage) => stageStateSignature(stage, referents))).size < 2) return null;
  if (stages.some((stage) => !stage.sourceRefs?.length || referents.some((referent) => !(stage.items || []).some((item) => item.componentRef === referent || item.id === referent)))) return null;
  if (requirement.requiredRelationship && !(state.relationshipAssertions || []).every((entry) => entry.sourceRefs?.length)) return null;
  const selected = referents.map((referent, position) => {
    const candidate = sourceMeasuredComponentCandidate({ scene, referent, assets, referentCount: referents.length, position });
    return candidate && { ...candidate, referent };
  });
  if (selected.some((entry) => !entry)) return null;
  const sequenceId = String(scene.id).replace(/[^a-z0-9_-]+/gi, '-');
  await fs.promises.mkdir(outputDir, { recursive: true });
  const frames = [];
  for (const [index, stage] of stages.entries()) {
    const frame = await renderStatefulFrame({ projectId, scene, sequenceId, stage, index, total: stages.length, selected, outputDir });
    if (!frame) return null;
    frames.push(frame);
  }
  return { contract: STATE_SEQUENCE_CONTRACT, materializerContract: VISUAL_PLAN_MATERIALIZER_CONTRACT, sceneId: scene.id, ruleAtomId: scene.atomId,
    assetId: selected[0].asset.id, sourceAssets: selected.map((entry) => ({ assetId: entry.asset.id,
      sourceImageSha256: sha(fs.readFileSync(sourceFile(entry.asset))), sourcePdfSha256: entry.asset.sourcePdfSha256,
      componentEvidence: entry.component })), frames, sourceComponentEvidence: selected.map((entry) => entry.component),
    preparedOnly: true, validated: false };
}

function semanticTeachingStages(scene = {}) {
  const requirement = scene.visualRequirement || {};
  const localized = localizedVisualTeaching(scene);
  const sourceRefs = (scene.sourceRefs || []).filter((ref) => Number.isInteger(Number(ref?.page)) && Number(ref.page) > 0);
  // A semantic sequence teaches a cited change *about* a real component.  It
  // is not a substitute for a measured arrangement, orientation, quantity or
  // face-state.  Those requirements continue through the physical-state
  // materializer and Cockpit when source pixels cannot prove them.
  const concretePhysicalClaim = requirement.trackStateRequired || requirement.setupPlacementRequired
    || requirement.layeredStateRequired || requirement.faceStateRequired || requirement.oneShotMarkerRequired
    || requirement.requiredOrientation || requirement.requiredRelationship
    || requirement.requiredQuantities?.length || requirement.physicalState
    || requirement.physicalStateRequirement;
  if (!requirement.transitionRequired || concretePhysicalClaim || !sourceRefs.length) return [];
  const candidates = [
    ['before', 'Avant', localized.beforeState || requirement.beforeState],
    ['action', 'Action', localized.actionState || requirement.actionState],
    ['after', 'Après', localized.afterState || requirement.afterState],
  ].map(([id, label, instructionalText]) => ({ id, label, instructionalText: String(instructionalText || '').replace(/\s+/g, ' ').trim() }))
    .filter((stage) => stage.instructionalText);
  const distinct = new Set(candidates.map((stage) => stage.instructionalText.toLocaleLowerCase('fr-CA')));
  if (candidates.length < 2 || distinct.size < 2) return [];
  return candidates.map((stage) => ({
    ...stage,
    sourceRefs,
  }));
}

function instructionalDiagramStages(scene = {}) {
  const requirement = scene.visualRequirement || {};
  const localized = localizedVisualTeaching(scene);
  const sourceRefs = (scene.sourceRefs || []).filter((ref) => Number.isInteger(Number(ref?.page)) && Number(ref.page) > 0);
  // This is intentionally narrower than a generic text card. It exists when
  // an accepted rule has a concrete visual requirement but no source photo of
  // the whole state. The final provider review owns the question whether the
  // exact source-component collage and cited explanation really teach it.
  const concreteTeaching = requirement.transitionRequired || requirement.setupPlacementRequired
    || requirement.layeredStateRequired || requirement.oneShotMarkerRequired
    || requirement.requiredRelationship || requirement.requiredState
    || requirement.requiredOrientation || requirement.requiredQuantities?.length
    || requirement.faceStateRequired;
  if (!concreteTeaching || !requirement.actualGameAssetRequired || !sourceRefs.length) return [];
  const candidates = [
    ['before', 'Avant', localized.beforeState || requirement.beforeState],
    ['action', 'Action', localized.actionState || requirement.actionState],
    ['after', 'Résultat', localized.afterState || requirement.afterState],
  ].map(([id, label, instructionalText]) => ({ id, label, instructionalText: String(instructionalText || '').replace(/\s+/g, ' ').trim() }))
    .filter((stage) => stage.instructionalText);
  const distinct = new Set(candidates.map((stage) => stage.instructionalText.toLocaleLowerCase('fr-CA')));
  if (candidates.length < 2 || distinct.size < 2) return [];
  return candidates.map((stage) => ({ ...stage, sourceRefs }));
}

/**
 * Some rules describe a real transition but do not supply enough evidence to
 * draw a new physical arrangement.  Do not invent that arrangement.  When a
 * complete source-measured component exists, teach the source-grounded rule
 * as a labelled semantic sequence and require a provider verdict on the final
 * rendered frames. This is deliberately distinct from a physical-state
 * sequence: annotations explain the cited rule; they never masquerade as
 * photographed marker/card movement.
 */
async function materializeSemanticInstructionalFrames({ projectId, scene, assets, outputDir } = {}) {
  const requirement = scene.visualRequirement || {};
  const referents = requirement.requiredObjects || [];
  const stages = semanticTeachingStages(scene);
  if (!referents.length || referents.length > 4 || !stages.length) return null;
  const selected = referents.map((referent, position) => {
    const candidate = sourceMeasuredComponentCandidate({ scene, referent, assets, referentCount: referents.length, position });
    return candidate && { ...candidate, referent };
  });
  if (selected.some((entry) => !entry)) return null;
  const sequenceId = String(scene.id).replace(/[^a-z0-9_-]+/gi, '-');
  await fs.promises.mkdir(outputDir, { recursive: true });
  const frames = [];
  for (const [index, baseStage] of stages.entries()) {
    const stage = {
      ...baseStage,
      items: selected.map((entry) => ({
        id: entry.referent,
        componentRef: entry.referent,
        visibility: 'VISIBLE',
        faceState: 'NOT_APPLICABLE',
        availability: 'UNKNOWN',
        sourceRefs: baseStage.sourceRefs,
        confidence: Number(entry.component.confidence || 0),
        reviewState: 'accepted',
        semanticInstructionOnly: true,
      })),
    };
    const frame = await renderStatefulFrame({ projectId, scene, sequenceId, stage, index, total: stages.length, selected, outputDir });
    if (!frame) return null;
    frames.push(frame);
  }
  return {
    contract: SEMANTIC_SEQUENCE_CONTRACT,
    materializerContract: VISUAL_PLAN_MATERIALIZER_CONTRACT,
    sceneId: scene.id,
    ruleAtomId: scene.atomId,
    assetId: selected[0].asset.id,
    semanticTeaching: true,
    sourceTeaching: stages.map(({ id, label, instructionalText, sourceRefs }) => ({ id, label, instructionalText, sourceRefs })),
    sourceAssets: selected.map((entry) => ({
      assetId: entry.asset.id,
      sourceImageSha256: sha(fs.readFileSync(sourceFile(entry.asset))),
      sourcePdfSha256: entry.asset.sourcePdfSha256,
      componentEvidence: entry.component,
    })),
    frames,
    sourceComponentEvidence: selected.map((entry) => entry.component),
    preparedOnly: true,
    validated: false,
  };
}

/**
 * A component collage can faithfully teach a cited placement, lifecycle or
 * relationship when every displayed component has independently measured
 * source pixels, but the rulebook does not include a photograph of the exact
 * resulting table state. The labels are source-grounded and the provider
 * must approve the FINAL composition; this never promotes a component proof
 * into proof that the original photograph showed the relationship.
 */
async function materializeSourceGroundedInstructionalDiagram({ projectId, scene, assets, outputDir } = {}) {
  const requirement = scene.visualRequirement || {};
  const referents = requirement.requiredObjects || [];
  const stages = instructionalDiagramStages(scene);
  if (!referents.length || referents.length > 4 || !stages.length) return null;
  const selected = referents.map((referent, position) => {
    const candidate = sourceMeasuredComponentCandidate({ scene, referent, assets, referentCount: referents.length, position });
    return candidate && { ...candidate, referent };
  });
  if (selected.some((entry) => !entry)) return null;
  const sequenceId = String(scene.id).replace(/[^a-z0-9_-]+/gi, '-');
  await fs.promises.mkdir(outputDir, { recursive: true });
  const frames = [];
  for (const baseStage of stages) {
    const stage = {
      ...baseStage,
      items: selected.map((entry) => ({
        id: entry.referent,
        componentRef: entry.referent,
        visibility: 'VISIBLE',
        faceState: 'NOT_APPLICABLE',
        availability: 'UNKNOWN',
        sourceRefs: baseStage.sourceRefs,
        confidence: Number(entry.component.confidence || 0),
        reviewState: 'accepted',
        instructionalDiagramOnly: true,
        diagramStage: baseStage.id,
      })),
    };
    const frame = await renderStatefulFrame({ projectId, scene, sequenceId, stage, index: frames.length, total: stages.length, selected, outputDir });
    if (!frame) return null;
    frames.push(frame);
  }
  return {
    contract: INSTRUCTIONAL_DIAGRAM_CONTRACT,
    materializerContract: VISUAL_PLAN_MATERIALIZER_CONTRACT,
    sceneId: scene.id,
    ruleAtomId: scene.atomId,
    assetId: selected[0].asset.id,
    instructionalDiagram: true,
    sourceTeaching: stages.map(({ id, label, instructionalText, sourceRefs }) => ({ id, label, instructionalText, sourceRefs })),
    sourceAssets: selected.map((entry) => ({
      assetId: entry.asset.id,
      sourceImageSha256: sha(fs.readFileSync(sourceFile(entry.asset))),
      sourcePdfSha256: entry.asset.sourcePdfSha256,
      componentEvidence: entry.component,
    })),
    frames,
    sourceComponentEvidence: selected.map((entry) => entry.component),
    preparedOnly: true,
    validated: false,
  };
}

function trackCandidateQuality({ asset, component, track }) {
  const stages = track.stateStages || [];
  const distinctPositions = new Set(stages.map((stage) => stage.position)).size;
  const sourceArea = Number(asset.nativeWidthPx || 0) * Number(asset.nativeHeightPx || 0);
  // Authority, measured object integrity and a source-grounded sequence are
  // pedagogical evidence. Native area breaks ties; it cannot select a larger
  // asset whose state proof is weaker.
  return [
    track.isolated === true ? 1 : 0,
    component.isolated === true ? 1 : 0,
    Number(track.confidence || 0),
    Number(component.confidence || 0),
    distinctPositions,
    stages.length,
    sourceArea,
  ];
}

function chooseTrackCandidate(candidates = []) {
  return [...candidates].sort((left, right) => {
    const a = trackCandidateQuality(left);
    const b = trackCandidateQuality(right);
    for (let index = 0; index < a.length; index += 1) {
      if (a[index] !== b[index]) return b[index] - a[index];
    }
    return String(left.asset.id).localeCompare(String(right.asset.id));
  })[0] || null;
}

/** Source-measured track + provider-written states; preparation is NOT acceptance. */
async function materializeTrackStateFrames({ projectId, scene, assets, outputDir } = {}) {
  const req=scene.visualRequirement || {};
  if(!req.trackStateRequired || req.requiredObjects?.length!==1)return null;
  const referent=req.requiredObjects[0];
  const {objectEvidenceFor}=require('./sourceAssetResolver.cjs');
  const candidates=assets.map(asset=>({asset,component:objectEvidenceFor(asset,referent,scene.id),
    track:(asset.objectVisualEvidence||[]).find(r=>r.visualRole==='TRACK'&&r.sceneId===scene.id&&r.requiredObject===referent&&r.assetId===asset.id)}))
    .filter(({asset,component,track})=>component?.present&&component.complete&&component.isolated&&component.confidence>=.9
      &&track?.confidence>=.9&&track.complete&&track.trackPoints?.length>1&&track.stateStages?.length>=2&&track.stateStages.length<=8
      &&track.imageSha256===sha(fs.readFileSync(sourceFile(asset)))&&/^[a-f0-9]{64}$/.test(asset.sourcePdfSha256||''));
  if(!candidates.length)return null;
  const selectedCandidate=chooseTrackCandidate(candidates);
  const {asset,track}=selectedCandidate;
  const points=new Map(track.trackPoints.map(p=>[p.value,p]));
  const pages=new Set(scene.source_pages||[]);
  if(track.stateStages.some(s=>!points.has(s.position)||!s.sourcePages?.length||s.sourcePages.some(p=>!pages.has(p))))return null;
  const file=sourceFile(asset), meta=await sharp(file).metadata();
  // Source fidelity caps enlargement; the rest of the available space teaches
  // state and progression in large vector text rather than inventing detail.
  const scale=Math.min(760/meta.width,650/meta.height,
    1.15*(asset.nativeWidthPx||meta.width)/meta.width,1.15*(asset.nativeHeightPx||meta.height)/meta.height);
  const size={width:Math.floor(meta.width*scale),height:Math.floor(meta.height*scale)};
  const ratio=Math.min((asset.nativeWidthPx||meta.width)/size.width,(asset.nativeHeightPx||meta.height)/size.height);
  if(ratio<.8)return null;
  const left=90+Math.floor((780-size.width)/2),top=240+Math.floor((620-size.height)/2);
  const frames=[];
  await fs.promises.mkdir(outputDir,{recursive:true});
  const board=await sharp(file).resize(size.width,size.height).png().toBuffer();
  const backdrop=await sharp(file).resize(1920,1080,{fit:'cover'}).blur(40).modulate({brightness:.20,saturation:.45}).png().toBuffer();
  const wrap=(value,max=32)=>{const lines=[];let line='';for(const word of String(value).split(/\s+/)){if(line.length+word.length+1>max){lines.push(line);line='';}line+=(line?' ':'')+word;}if(line)lines.push(line);return lines;};
  for(const [index,stage] of track.stateStages.entries()){
    const point=points.get(stage.position);
    const x=Math.round(left+point.x*size.width),y=Math.round(top+point.y*size.height);
    const caption=wrap(stage.caption);
    if(caption.length>4)throw new Error('TRACK_CAPTION_GEOMETRY_REQUIRES_REVIEW');
    const svg=Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="1920" height="1080"><rect x="42" y="160" width="1836" height="770" rx="28" fill="#231811" fill-opacity=".84" stroke="#be9a58" stroke-width="3"/><text x="88" y="110" fill="#fff3d9" font-family="Arial" font-size="64" font-weight="bold">${xml(track.trackLabelFrench)}</text><text x="980" y="285" fill="#e1c184" font-family="Arial" font-size="56">${xml(stage.label)}</text><text x="980" y="445" fill="#fff3d9" font-family="Arial" font-size="126" font-weight="bold">${xml(stage.position)}</text>${caption.map((s,i)=>`<text x="980" y="${555+i*60}" fill="#fff3d9" font-family="Arial" font-size="48">${xml(s)}</text>`).join('')}<text x="88" y="994" fill="#fff3d9" font-family="Arial" font-size="40">${index+1} / ${track.stateStages.length} · ${xml(stage.isExample?'Exemple conditionnel':'État du jeu')} · Livret p. ${xml(stage.sourcePages.join(', '))}</text></svg>`);
    const pointer=Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="1920" height="1080"><path d="M 918 431 L ${x} ${y}" stroke="#f4d35e" stroke-width="5" fill="none"/><circle cx="${x}" cy="${y}" r="23" fill="none" stroke="#fff3d9" stroke-width="6"/><circle cx="${x}" cy="${y}" r="17" fill="none" stroke="#ec6c3b" stroke-width="5"/></svg>`);
    const target=path.resolve(outputDir,`${scene.id}-state-${index+1}.png`);
    const materialized=target.replace(/\.png$/,'.materialized.png');
    await sharp(backdrop).composite([{input:svg,left:0,top:0},{input:board,left,top},{input:pointer,left:0,top:0}]).png().toFile(materialized);
    const configPath=target.replace(/\.png$/,'.render-config.json');
    const renderScene={id:`${scene.id}-state-${index+1}`,type:'teaching',durationSec:1,
      narrationText:stage.narration,layout:{mode:'visual-first-full-frame'},background:{image:materialized},overlays:[]};
    await fs.promises.writeFile(configPath,JSON.stringify({projectId,video:{resolution:{width:1920,height:1080},fps:30},scenes:[renderScene]},null,2));
    const rendered=spawnSync(process.execPath,[path.resolve(__dirname,'../../scripts/render-storyboard-ffmpeg.mjs'),'--config',configPath,'--out',target,'--still'],{encoding:'utf8',windowsHide:true});
    await fs.promises.writeFile(target.replace(/\.png$/,'.render.log'),`${rendered.stdout||''}${rendered.stderr||''}`);
    if(rendered.status!==0)throw new Error('NORMAL_TRACK_STILL_RENDER_FAILED');
    const phone=target.replace(/\.png$/,'.phone.png');await sharp(target).resize(390,219).png().toFile(phone);
    frames.push({id:`${scene.id}-state-${index+1}`,outputPath:target,phonePath:phone,renderConfigPath:configPath,narration:stage.narration,stage,
      sourceAssetId:asset.id,sourceImageSha256:track.imageSha256,sourcePdfSha256:asset.sourcePdfSha256,sourceRefs:asset.sourceRefs,
      actualDisplayBounds:{left,top,...size},sourcePixelsPerDisplayPixel:ratio,
      measuredMarkerCenter:{x,y},preparedOnly:true,validated:false});
  }
  return {contract:TRACK_SEQUENCE_CONTRACT,materializerContract:VISUAL_PLAN_MATERIALIZER_CONTRACT,sceneId:scene.id,ruleAtomId:scene.atomId,assetId:asset.id,
    frames,trackEvidence:track,sourceComponentEvidence:selectedCandidate.component,preparedOnly:true,validated:false};
}

function canonicalTeachingPresentation(scene, index = 0, asset = {}) {
  const displayText = String(scene.on_screen_text || '');
  const result = buildTeachingScene({ id: scene.id, index, section: scene.section,
    narration: scene.narration, onScreenText: scene.on_screen_text, sourcePages: scene.source_pages || [],
    background: { image: sourceFile(asset) }, visualKind: scene.renderVisual?.kind || 'automatic-component',
    durationSec: 1, preserveLineBreaks: displayText.includes('\n') });
  result.durationSec = 1;
  result.layout.visualAspectRatio = Number(asset.width) / Number(asset.height) || 1;
  // Keep a static identity object large enough for phone recognition without
  // enlarging its true source pixels beyond the canonical 0.8 px/display-px
  // floor. The layout solver evaluates this preference together with the
  // text panel; it is not a quality verdict and cannot rescue weak evidence.
  const sourceWidth = Number(asset.nativeWidthPx || asset.width || 0);
  const sourceHeight = Number(asset.nativeHeightPx || asset.height || 0);
  if (sourceWidth > 0 && sourceHeight > 0) {
    result.layout.maximumImageWidthPx = Number((sourceWidth / .8).toFixed(3));
    result.layout.maximumImageHeightPx = Number((sourceHeight / .8).toFixed(3));
  }
  return result;
}

function hasSceneSpecificRequirement(requirement = {}) {
  return Boolean(requirement.transitionRequired || requirement.setupPlacementRequired
    || requirement.layeredStateRequired || requirement.trackStateRequired
    || requirement.oneShotMarkerRequired || requirement.progressiveScoringRequired
    || requirement.comparisonGroupRequired || requirement.semanticFocusRequired
    || requirement.discardPileRequired || requirement.deckIdentityRequired
    || requirement.cardFamilyRequired || requirement.representativeExamplesRequired
    || requirement.requiredRelationship || requirement.requiredState
    || requirement.beforeState || requirement.actionState || requirement.afterState
    || requirement.requiredOrientation || requirement.faceStateRequired
    || requirement.requiredQuantities?.length || requirement.requiredLabels?.length
    || Object.keys(requirement.physicalStateRequirement || requirement.physicalState || {}).length);
}

async function validateDeterministicIdentityStill({ state, scene, asset, selected, presentation, layout, outputPath, phonePath, configPath } = {}) {
  const requirement = scene.visualRequirement || {};
  const referents = requirement.requiredObjects || [];
  const plan = (state.visualPlans || []).find((row) => row.ruleAtomId === scene.atomId) || {};
  const sourcePath = sourceFile(asset);
  const actualDisplayBounds = containedDisplayBounds(asset, { width: layout.imageWidth, height: layout.imageHeight });
  const phoneDisplayBounds = {
    width: Math.ceil(actualDisplayBounds.width * 390 / 1920),
    height: Math.ceil(actualDisplayBounds.height * 219 / 1080),
  };
  const reasons = [];
  if (referents.length !== 1 || hasSceneSpecificRequirement(requirement)) reasons.push('not-static-single-object-identity');
  const selectedAssetIds = selected?.selectedAssetIds || (selected?.selectedAssets || []).map((row) => row.id);
  if (selected?.status !== 'AUTO_ACCEPTED' || !selectedAssetIds.includes(asset.id)) reasons.push('source-binding-not-auto-accepted');
  if (!sourcePath || !fs.existsSync(sourcePath)) reasons.push('source-file-missing');
  const sourceRefs = asset.sourceRefs || [];
  if (!sourceRefs.some((row) => Number(row.page) > 0) || !asset.sourcePdfSha256) reasons.push('source-provenance-incomplete');
  if (!asset.sourceAuthority || asset.sourceAuthority === 'UNKNOWN' || Number(asset.sourceAuthorityRank || 0) <= 0) reasons.push('source-authority-unverified');
  const { evaluateCandidate, objectEvidenceFor } = require('./sourceAssetResolver.cjs');
  const objectEvidence = referents.length === 1
    ? objectEvidenceFor(asset, referents[0], scene.id, { allowReusableIdentity: true })
    : null;
  if (!(objectEvidence?.visualRole === 'COMPONENT' && objectEvidence.present === true
    && objectEvidence.complete === true && objectEvidence.isolated === true
    && objectEvidence.stateCompatible === true && Number(objectEvidence.confidence) >= .9)) {
    reasons.push('component-pixel-evidence-incomplete');
  }
  const evaluation = evaluateCandidate(asset, { ...requirement, evidenceSceneId: scene.id }, actualDisplayBounds);
  if (!evaluation.valid) reasons.push(...evaluation.hardViolations.map((reason) => `source:${reason}`));
  const mobileMinimum = Number(plan.mobileMinimumAssetWidthPx || 0);
  if (mobileMinimum > 0 && phoneDisplayBounds.width < mobileMinimum) reasons.push('phone-object-width-below-plan-minimum');
  const outputMetadata = fs.existsSync(outputPath) ? await sharp(outputPath).metadata() : {};
  const phoneMetadata = fs.existsSync(phonePath) ? await sharp(phonePath).metadata() : {};
  if (outputMetadata.width !== 1920 || outputMetadata.height !== 1080) reasons.push('desktop-render-dimensions-invalid');
  if (phoneMetadata.width !== 390 || phoneMetadata.height !== 219) reasons.push('phone-render-dimensions-invalid');
  const valid = reasons.length === 0;
  return {
    contract: 'mobius-deterministic-static-identity-composition-v1',
    valid,
    reasons,
    requirementClass: 'STATIC_SINGLE_OBJECT_IDENTITY',
    sourceAssetId: asset.id,
    requiredObject: referents[0] || null,
    sourceImageSha256: sourcePath && fs.existsSync(sourcePath) ? sha(fs.readFileSync(sourcePath)) : null,
    objectEvidenceHash: objectEvidence ? sha(JSON.stringify(objectEvidence)) : null,
    objectEvidenceConfidence: Number(objectEvidence?.confidence || 0),
    sourceAuthority: asset.sourceAuthority || null,
    sourceRefs,
    sourcePixelsPerDisplayPixel: evaluation.trueSourcePixelsPerDisplayPixel,
    actualDisplayBounds,
    phoneDisplayBounds,
    mobileMinimumAssetWidthPx: mobileMinimum,
    renderConfigSha256: fs.existsSync(configPath) ? sha(fs.readFileSync(configPath)) : null,
    outputSha256: fs.existsSync(outputPath) ? sha(fs.readFileSync(outputPath)) : null,
    phoneSha256: fs.existsSync(phonePath) ? sha(fs.readFileSync(phonePath)) : null,
    rendererLayout: presentation.layout?.mode || null,
  };
}

// A prepared still is a review artifact, never a new accepted binding. A complete
// mono-object candidate can be shown for detail/layout inspection while its
// source-quality gate remains blocked. Multi-object/state transitions must use
// their existing materialized composition, not an isolated object substituted here.
async function materializeInstructionalStill({ state, sceneId, outputDir, allowReviewCandidate = false } = {}) {
  const scene = state.scenes.find(s => s.id === sceneId);
  if (!scene) throw new Error('Unknown canonical scene');
  const requirement = scene.visualRequirement || {};
  const selected = state.sourceSelections.find(s => s.ruleAtomId === scene.atomId);
  let asset = state.assets.find(a => a.id === scene.renderVisual?.assetId);
  let preparedOnly = false;
  if (!asset && allowReviewCandidate && requirement.requiredObjects?.length === 1
    && !requirement.transitionRequired && !requirement.setupPlacementRequired && !requirement.requiredRelationship
    && !requirement.requiredState && !requirement.requiredQuantities?.length) {
    const { objectEvidenceFor } = require('./sourceAssetResolver.cjs');
    asset = (selected?.ranked || []).map(e => e.candidate).find(a => {
      const proof = objectEvidenceFor(a, requirement.requiredObjects[0], scene.id);
      return proof?.visualRole === 'COMPONENT' && proof.present === true && proof.complete === true
        && proof.isolated === true && proof.stateCompatible === true && proof.confidence >= 0.9;
    });
    preparedOnly = Boolean(asset);
  }
  if (!asset) return { sceneId, produced: false, validated: false, reason: 'No safe complete object/composition available; requirements retained.' };
  const presentation = canonicalTeachingPresentation(scene, state.scenes.indexOf(scene), asset);
  const layout = teachingSceneLayout(presentation);
  const outputPath = path.resolve(outputDir, `${scene.id}.png`);
  const configPath = path.resolve(outputDir, `${scene.id}.render-config.json`);
  await fs.promises.mkdir(path.resolve(outputDir), { recursive: true });
  const config = { projectId: state.projectId, video: { resolution: { width: 1920, height: 1080 }, fps: 30 }, scenes: [presentation] };
  await fs.promises.writeFile(configPath, JSON.stringify(config, null, 2));
  const rendered = spawnSync(process.execPath, [path.resolve(__dirname, '../../scripts/render-storyboard-ffmpeg.mjs'), '--config', configPath, '--out', outputPath, '--still'], { encoding: 'utf8', windowsHide: true });
  await fs.promises.writeFile(path.resolve(outputDir, `${scene.id}.render.log`), `${rendered.stdout || ''}${rendered.stderr || ''}`);
  if (rendered.status !== 0) throw new Error('Normal storyboard still rendering failed; see render log.');
  const phonePath = path.resolve(outputDir, `${scene.id}.phone.png`);
  await sharp(outputPath).resize(390, 219, { fit: 'contain' }).png().toFile(phonePath);
  const deterministicValidation = preparedOnly ? null : await validateDeterministicIdentityStill({
    state, scene, asset, selected, presentation, layout, outputPath, phonePath, configPath,
  });
  return { sceneId, produced: true, validated: deterministicValidation?.valid === true, preparedOnly, outputPath, phonePath, configPath,
    sourceAssetId: asset.id, sourcePath: sourceFile(asset), sourceRefs: asset.sourceRefs,
    bindingStatus: selected?.status, requirement, actualDisplayBounds: containedDisplayBounds(asset, { width: layout.imageWidth, height: layout.imageHeight }),
    deterministicValidation,
    reason: deterministicValidation?.valid
      ? 'Static single-object identity composition passed deterministic source, layout, detail, and phone-scale validation.'
      : 'Normal renderer output requires physical/composition review; production state and decisions unchanged.' };
}

function sourceFile(asset = {}) {
  return asset.displayPath || asset.renderPath || asset.filePath || asset.path || asset.sourceImage || null;
}

/** Render an abstract/source-grounded rule that has no physical referent.
 * This is the normal presentation renderer, not a substitute image. It may be
 * accepted deterministically only when the canonical requirement explicitly
 * says that actual game pixels are not required and valid rulebook citations
 * remain visible in the scene metadata. */
async function materializeSourceGroundedTextStill({ state, scene, outputDir } = {}) {
  const requirement = scene?.visualRequirement || {};
  const plan = (state.visualPlans || []).find((row) => row.ruleAtomId === scene?.atomId) || {};
  const sourceRefs = (scene?.sourceRefs || []).filter((ref) => Number(ref?.page) > 0);
  if (!scene || requirement.actualGameAssetRequired !== false || (requirement.requiredObjects || []).length
    || plan.validation?.valid === false || !sourceRefs.length || !String(scene.on_screen_text || '').trim()) return null;
  const folder = path.resolve(outputDir);
  await fs.promises.mkdir(folder, { recursive: true });
  const presentation = canonicalTeachingPresentation(scene, state.scenes.indexOf(scene), {});
  presentation.background = { color: '#1f1510' };
  // Reuse the renderer's canonical text-teaching presentation path. It keeps
  // the brand typography and source citation in one centered, phone-safe
  // panel without pretending that an empty visual pane contains game pixels.
  presentation.layout.mode = 'text-teaching';
  presentation.layout.metadataCard = true;
  presentation.layout.presentationLayout = {
    ...(presentation.layout.presentationLayout || {}),
    contentType: 'metadata',
    minimumFontPx: 44,
    preferredFontPx: 50,
  };
  const outputPath = path.join(folder, `${scene.id}.png`);
  const configPath = path.join(folder, `${scene.id}.render-config.json`);
  await fs.promises.writeFile(configPath, JSON.stringify({
    projectId: state.projectId,
    video: { resolution: { width: 1920, height: 1080 }, fps: 30 },
    scenes: [presentation],
  }, null, 2));
  const rendered = spawnSync(process.execPath, [path.resolve(__dirname, '../../scripts/render-storyboard-ffmpeg.mjs'),
    '--config', configPath, '--out', outputPath, '--still'], { encoding: 'utf8', windowsHide: true });
  await fs.promises.writeFile(path.join(folder, `${scene.id}.render.log`), `${rendered.stdout || ''}${rendered.stderr || ''}`);
  if (rendered.status !== 0) throw new Error('NORMAL_TEXT_TEACHING_STILL_RENDER_FAILED');
  const phonePath = path.join(folder, `${scene.id}.phone.png`);
  await sharp(outputPath).resize(390, 219).png().toFile(phonePath);
  const desktop = await sharp(outputPath).metadata();
  const phone = await sharp(phonePath).metadata();
  const validation = {
    contract: TEXT_TEACHING_STILL_CONTRACT,
    valid: desktop.width === 1920 && desktop.height === 1080 && phone.width === 390 && phone.height === 219,
    actualGameAssetRequired: false,
    requiredObjects: [],
    sourceRefs,
    renderConfigSha256: sha(fs.readFileSync(configPath)),
    outputSha256: sha(fs.readFileSync(outputPath)),
    phoneSha256: sha(fs.readFileSync(phonePath)),
  };
  return { contract: TEXT_TEACHING_STILL_CONTRACT, sceneId: scene.id, ruleAtomId: scene.atomId,
    produced: true, validated: validation.valid, outputPath, phonePath, configPath, validation,
    sourceRefs, preparedOnly: false };
}

function gridCells(count, width, height, inset = 44) {
  const columns = count <= 3 ? count : Math.min(4, Math.ceil(Math.sqrt(count)));
  const rows = Math.ceil(count / columns);
  const gap = 28;
  const cellWidth = Math.floor((width - inset * 2 - gap * (columns - 1)) / columns);
  const cellHeight = Math.floor((height - inset * 2 - gap * (rows - 1)) / rows);
  return Array.from({ length: count }, (_, index) => ({
    x: inset + (index % columns) * (cellWidth + gap),
    y: inset + Math.floor(index / columns) * (cellHeight + gap),
    width: cellWidth,
    height: cellHeight,
  }));
}

function setupCells(count, width, height) {
  if (count < 2) return gridCells(count, width, height);
  const inset = 44;
  const gap = 28;
  const primaryWidth = Math.floor((width - inset * 2 - gap) * 0.64);
  const supportWidth = width - inset * 2 - gap - primaryWidth;
  const supportHeight = Math.floor((height - inset * 2 - gap * Math.max(0, count - 2)) / (count - 1));
  return [
    { x: inset, y: inset, width: primaryWidth, height: height - inset * 2 },
    ...Array.from({ length: count - 1 }, (_, index) => ({
      x: inset + primaryWidth + gap,
      y: inset + index * (supportHeight + gap),
      width: supportWidth,
      height: supportHeight,
    })),
  ];
}

function cellsFor(plan, count, width, height) {
  return /^REAL_SETUP_(?:PLACEMENT|LAYOUT)$/.test(plan.compositionType || '')
    ? setupCells(count, width, height)
    : gridCells(count, width, height);
}

async function containedImage(file, cell) {
  return sharp(path.resolve(file), { limitInputPixels: false })
    .rotate()
    .resize(cell.width, cell.height, {
      fit: 'contain',
      background: { r: 0, g: 0, b: 0, alpha: 0 },
      withoutEnlargement: true,
    })
    .png()
    .toBuffer();
}

async function materializeVisualPlanFrames({ state, outputDir, width = 1400, height = 860 } = {}) {
  if (!state?.scenes || !Array.isArray(state.assets)) throw new Error('VisualPlan materialization requires canonical production state.');
  if (!outputDir) throw new Error('VisualPlan materialization requires outputDir.');
  const absoluteOutput = path.resolve(outputDir);
  await fs.promises.mkdir(absoluteOutput, { recursive: true });
  const byId = new Map(state.assets.map((asset) => [asset.id, asset]));
  const records = [];
  const scenes = [];
  for (const scene of state.scenes) {
    if(scene.instructionalSequence){scenes.push(scene);records.push(scene.instructionalSequence);continue;}
    const textTeachingStill = await materializeSourceGroundedTextStill({
      state, scene, outputDir: path.join(absoluteOutput, 'text-teaching-stills'),
    });
    if (textTeachingStill) {
      records.push(textTeachingStill);
      scenes.push({ ...scene, textTeachingStill,
        renderVisual: { path: textTeachingStill.outputPath, assetId: `text-teaching:${scene.atomId}`,
          kind: 'source-grounded-text-teaching', fullFrame: true, confidence: 1,
          reason: 'Canonical non-physical rule rendered as a source-grounded French teaching card.',
          sourcePage: textTeachingStill.sourceRefs[0]?.page || null, provenance: textTeachingStill.sourceRefs } });
      continue;
    }
    const trackSequence=await materializeTrackStateFrames({projectId:state.projectId,scene,assets:state.assets,outputDir:path.join(absoluteOutput,'track-sequences')});
    if(trackSequence){
      records.push(trackSequence);
      // Keep the original requirement/review boundary until final sequence QA.
      scenes.push({...scene,preparedTrackSequence:trackSequence});
      continue;
    }
    const statefulSequence=await materializeStatefulInstructionalFrames({projectId:state.projectId,scene,assets:state.assets,outputDir:path.join(absoluteOutput,'state-sequences')});
    if(statefulSequence){
      records.push(statefulSequence);
      scenes.push({...scene,preparedStatefulSequence:statefulSequence});
      continue;
    }
    const semanticSequence=await materializeSemanticInstructionalFrames({projectId:state.projectId,scene,assets:state.assets,outputDir:path.join(absoluteOutput,'semantic-sequences')});
    if(semanticSequence){
      records.push(semanticSequence);
      scenes.push({...scene,preparedSemanticSequence:semanticSequence});
      continue;
    }
    const instructionalDiagram=await materializeSourceGroundedInstructionalDiagram({projectId:state.projectId,scene,assets:state.assets,outputDir:path.join(absoluteOutput,'instructional-diagrams')});
    if(instructionalDiagram){
      records.push(instructionalDiagram);
      scenes.push({...scene,preparedInstructionalDiagram:instructionalDiagram});
      continue;
    }
    const plan = scene.canonicalVisualPlan || {};
    const assets = (plan.actualGameAssetIds || []).map((id) => byId.get(id)).filter((asset) => {
      const file = sourceFile(asset);
      return file && fs.existsSync(path.resolve(file));
    });
    const staticIdentityEligible = assets.length === 1
      && scene.visualRequirement?.actualGameAssetRequired === true
      && scene.visualRequirement?.requiredObjects?.length === 1
      && !hasSceneSpecificRequirement(scene.visualRequirement);
    if (staticIdentityEligible) {
      const instructionalStill = await materializeInstructionalStill({
        state,
        sceneId: scene.id,
        outputDir: path.join(absoluteOutput, 'static-identity-stills'),
      });
      if (instructionalStill.produced) {
        records.push(instructionalStill);
        if (instructionalStill.validated) {
          scenes.push({
            ...scene,
            instructionalStill,
            renderVisual: {
              path: instructionalStill.outputPath,
              assetId: instructionalStill.sourceAssetId,
              kind: 'automatic-visual-plan-composite',
              fullFrame: true,
              confidence: Number(instructionalStill.deterministicValidation?.objectEvidenceConfidence || 0),
              reason: 'Canonical static identity scene passed exact-source, component-integrity, detail, and phone-scale validation.',
              sourcePage: instructionalStill.sourceRefs?.[0]?.page || null,
              provenance: instructionalStill.sourceRefs,
            },
          });
        } else {
          // Rendering a reviewable still must not turn an unresolved binding or
          // a stateful requirement into accepted production state.
          scenes.push({ ...scene, preparedInstructionalStill: instructionalStill });
        }
        continue;
      }
    }
    if (assets.length <= 1) {
      scenes.push(scene);
      continue;
    }
    const outputPath = path.join(absoluteOutput, `${String(scene.id).replace(/[^a-z0-9_-]+/gi, '-')}.png`);
    const primary = sourceFile(assets[0]);
    const background = await sharp(path.resolve(primary), { limitInputPixels: false })
      .rotate().resize(width, height, { fit: 'cover' }).blur(28).modulate({ brightness: 0.34, saturation: 0.7 }).png().toBuffer();
    const cells = cellsFor(plan, assets.length, width, height);
    const layers = [{ input: background, left: 0, top: 0 }];
    for (let index = 0; index < assets.length; index += 1) {
      const image = await containedImage(sourceFile(assets[index]), cells[index]);
      const metadata = await sharp(image).metadata();
      layers.push({
        input: image,
        left: cells[index].x + Math.max(0, Math.floor((cells[index].width - Number(metadata.width || 0)) / 2)),
        top: cells[index].y + Math.max(0, Math.floor((cells[index].height - Number(metadata.height || 0)) / 2)),
      });
    }
    const tint = Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}"><rect width="100%" height="100%" fill="#160f0b" fill-opacity=".32"/><rect x="18" y="18" width="${width - 36}" height="${height - 36}" rx="26" fill="none" stroke="#c9a760" stroke-opacity=".55" stroke-width="3"/></svg>`);
    layers.splice(1, 0, { input: tint, left: 0, top: 0 });
    await sharp({ create: { width, height, channels: 4, background: { r: 31, g: 21, b: 16, alpha: 1 } } })
      .composite(layers).png().toFile(outputPath);
    const provenance = {
      contract: VISUAL_PLAN_MATERIALIZER_CONTRACT,
      compositionType: plan.compositionType,
      sourceAssetIds: assets.map((asset) => asset.id),
      sourceFiles: assets.map((asset) => sourceFile(asset)),
      sourceRefs: assets.flatMap((asset) => asset.sourceRefs || []),
      noInventedGamePixels: true,
    };
    records.push({ sceneId: scene.id, outputPath, width, height, provenance });
    scenes.push({
      ...scene,
      renderVisual: {
        path: outputPath,
        assetId: `visual-plan-frame:${scene.atomId}`,
        kind: 'automatic-visual-plan-composite',
        confidence: plan.confidence,
        reason: 'Canonical multi-asset VisualPlan materialized by the normal production path.',
        sourcePage: scene.source_pages?.[0] || scene.sourceRefs?.[0]?.page || null,
        provenance,
      },
    });
  }
  return { contract: VISUAL_PLAN_MATERIALIZER_CONTRACT, outputDir: absoluteOutput, records, scenes };
}

/** Connect normal provider reports to the candidate catalog; this does not
 * accept candidates. The source resolver rechecks pixels, scope and quality. */
function attachSequenceReviewEvidence({ assets, records, reviewPaths=[] }) {
 const reviewed=records.map(record=>{
   const review=reviewPaths.map(p=>JSON.parse(fs.readFileSync(p))).find(r=>r.scenes?.some(s=>s.scene_id===record.sceneId));
   return review?{...record,review}:null;
 }).filter(Boolean);
 // A reviewed sequence is the current active evidence for its scene. Replays
 // must replace that scene's former materialization instead of appending an
 // unbounded history to every source asset. Historical reports remain on disk;
 // the canonical active graph keeps one content-identical sequence per asset.
 const replacedSceneIds=new Set(reviewed.map(record=>record.sceneId).filter(Boolean));
 return assets.map(asset=>{
   const existing=(asset.instructionalSequences||[]).filter(sequence=>!replacedSceneIds.has(sequence?.sceneId));
   const incoming=reviewed.filter(record=>(record.sourceAssets||[{assetId:record.assetId}])
     .some(source=>source.assetId===asset.id));
   const seen=new Set();
   const instructionalSequences=[...existing,...incoming].filter(sequence=>{
     const identity=sha(JSON.stringify(sequence));
     if(seen.has(identity))return false;
     seen.add(identity);
     return true;
   });
   return {...asset,instructionalSequences};
 });
}

// A production may resume an already-prepared state composition while the
// broader source-discovery batch is intentionally exhausted. Keep the same
// durable ledger, but allow an operator-owned runtime policy to reserve an
// explicitly capped group for that final composition measurement.
function compositionReviewEnvironment(env = process.env) {
 const group=String(env.MOBIUS_VISUAL_COMPOSITION_BUDGET_GROUP||'').trim();
 if(String(env.MOBIUS_VISUAL_REQUIRE_BUDGET_LEDGER||'').toLowerCase()==='true'&&!String(env.MOBIUS_VISUAL_BUDGET_LEDGER||'').trim()){
   throw new Error('VISUAL_BUDGET_LEDGER_REQUIRED_BEFORE_COMPOSITION_PROVIDER_CALL');
 }
 return group ? {...env,MOBIUS_VISUAL_BUDGET_GROUP:group} : env;
}

async function reviewPreparedSequences({state,materialized,outputDir,env=process.env}){
  const reviewPaths=[];
 for(const sequence of materialized.records.filter(r=>r.frames?.length && !r.validated)){
  const scene=state.scenes.find(s=>s.id===sequence.sceneId);
  const folder=path.resolve(outputDir,sequence.sceneId);fs.mkdirSync(folder,{recursive:true});
  const inputPath=path.join(folder,'input.json');
  fs.writeFileSync(inputPath,JSON.stringify({scene,frames:sequence.frames,outputPath:sequence.frames[0].outputPath,
    phonePath:sequence.frames[0].phonePath,
    materializerContract:sequence.materializerContract,
    sequenceContract:sequence.contract,
    semanticTeaching:sequence.semanticTeaching===true,
    instructionalDiagram:sequence.instructionalDiagram===true,
    sourceTeaching:sequence.sourceTeaching||null,
    componentTerms:Object.fromEntries((state.knowledgeModel.components||[]).map(c=>[c.id,c.name]))}));
  const result=spawnSync(process.execPath,[path.resolve(__dirname,'../../scripts/prepare-source-visuals.mjs'),
    '--composition-review',inputPath,'--output-dir',folder],{env:compositionReviewEnvironment(env),windowsHide:true,encoding:'utf8',timeout:180000});
  fs.writeFileSync(path.join(folder,'execution.log'),`${result.stdout||''}${result.stderr||''}`);
  const reviewPath=path.join(folder,'composition-review.json');
  if(result.status!==0 || !fs.existsSync(reviewPath))throw new Error('COMPOSITION_REVIEW_EXECUTION_FAILED');
  reviewPaths.push(reviewPath);
  if(JSON.parse(fs.readFileSync(reviewPath)).summary?.providerBlocker)break;
 }
 return {assets:attachSequenceReviewEvidence({assets:state.assets,records:materialized.records,reviewPaths}),reviewPaths};
}

module.exports = { reviewPreparedSequences, attachSequenceReviewEvidence, compositionReviewEnvironment, VISUAL_PLAN_MATERIALIZER_CONTRACT, STATE_SEQUENCE_CONTRACT, SEMANTIC_SEQUENCE_CONTRACT, INSTRUCTIONAL_DIAGRAM_CONTRACT, TRACK_SEQUENCE_CONTRACT, TEXT_TEACHING_STILL_CONTRACT, cellsFor, localizedVisualTeaching, statefulTeachingLayout, statefulComponentDisplayBounds, sourceMeasuredComponentCandidate, materializeVisualPlanFrames, materializeTrackStateFrames, materializeStatefulInstructionalFrames, materializeSemanticInstructionalFrames, materializeSourceGroundedInstructionalDiagram, materializeSourceGroundedTextStill, semanticTeachingStages, instructionalDiagramStages, chooseTrackCandidate, canonicalTeachingPresentation, materializeInstructionalStill, validateDeterministicIdentityStill };
