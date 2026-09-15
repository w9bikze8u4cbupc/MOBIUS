'use strict';

const fs = require('node:fs');
const path = require('node:path');
const sharp = require('sharp');
const { spawnSync } = require('node:child_process');
const { buildTeachingScene } = require('../storyboard/tutorial_presentation.cjs');
const { teachingSceneLayout, containedDisplayBounds } = require('./presentationDesignSystem.cjs');
const crypto = require('node:crypto');
const sha = value => crypto.createHash('sha256').update(value).digest('hex');
const xml = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&apos;'}[c]));

function stateValueLabel(item = {}) {
  if (item.instructionalDiagramOnly) return 'Référent source';
  if (item.removed || item.visibility === 'REMOVED') return 'Retiré';
  if (item.consumed || item.availability === 'CONSUMED') return 'Utilisé';
  if (item.availability === 'UNAVAILABLE') return 'Indisponible';
  if (item.faceState === 'FACE_DOWN') return 'Face cachée';
  if (item.faceState === 'FACE_UP') return 'Face visible';
  if (item.trackPosition != null) return `Position ${item.trackPosition}`;
  if (item.quantity != null) return `Quantité ${item.quantity}`;
  return 'En jeu';
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

function stageStateSignature(stage = {}, referents = []) {
  return JSON.stringify(referents.map((referent) => {
    const item = (stage.items || []).find((entry) => entry.componentRef === referent || entry.id === referent) || {};
    return [referent, item.location || null, item.orientation || null, item.faceState || null,
      item.visibility || null, item.quantity ?? null, item.trackPosition ?? null,
      item.availability || null, Boolean(item.consumed), Boolean(item.removed),
      item.coveredBy || [], item.covers || []];
  }));
}

function sourceMeasuredComponentCandidate({ scene, referent, assets = [] } = {}) {
  const { objectEvidenceFor, evaluateCandidate } = require('./sourceAssetResolver.cjs');
  const requirement = { actualGameAssetRequired: true, requiredObjects: [referent], evidenceSceneId: scene.id };
  const candidates = assets.map((asset) => {
    const component = objectEvidenceFor(asset, referent, scene.id, { allowReusableIdentity: true });
    if (!(component?.present && component.complete && component.isolated && component.stateCompatible
      && Number(component.confidence) >= .9) || !sourceFile(asset) || !fs.existsSync(sourceFile(asset))) return null;
    const measured = evaluateCandidate(asset, requirement, { width: 900, height: 700 });
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
  const cells = gridCells(selected.length, 1660, 420, 0).map((cell) => ({ ...cell, x: cell.x + 130, y: cell.y + 440 }));
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
    const scale = Math.min(cell.width / sourceWidth, cell.height / sourceHeight, 1.15);
    const width = Math.max(1, Math.floor(sourceWidth * scale));
    const height = Math.max(1, Math.floor(sourceHeight * scale));
    const sourcePixelsPerDisplayPixel = Math.min(sourceWidth / width, sourceHeight / height);
    if (sourcePixelsPerDisplayPixel < .8) return null;
    minimumSourcePixelsPerDisplayPixel = Math.min(minimumSourcePixelsPerDisplayPixel, sourcePixelsPerDisplayPixel);
    const image = await sharp(sourceFile(entry.asset)).resize(width, height, { fit: 'contain' }).png().toBuffer();
    const left = cell.x + Math.floor((cell.width - width) / 2);
    const top = cell.y + Math.floor((cell.height - height) / 2);
    layers.push({ input: image, left, top, opacity: (item.removed || item.visibility === 'REMOVED') ? .28 : 1 });
    states.push({ referent: entry.referent, assetId: entry.asset.id, label: stateValueLabel(item),
      left, top, width, height, item });
  }
  const labels = states.map((value) => `<rect x="${value.left}" y="${Math.max(382, value.top - 58)}" width="${value.width}" height="44" rx="12" fill="#231811" fill-opacity=".9"/><text x="${value.left + 16}" y="${Math.max(413, value.top - 27)}" fill="#fff3d9" font-family="Arial" font-size="28" font-weight="bold">${xml(value.label)}</text>`).join('');
  const headline = String(scene.on_screen_text || scene.title || scene.visualRequirement?.purpose || '').split(/\n/)[0].slice(0, 150);
  const instructionalLines = wrapSvgText(stage.instructionalText, 72, 3);
  const instructionalText = instructionalLines.map((line, lineIndex) => `<text x="96" y="${238 + lineIndex * 38}" fill="#fff3d9" font-family="Arial" font-size="30">${xml(line)}</text>`).join('');
  const presentationKind = (stage.items || []).some((item) => item.instructionalDiagramOnly)
    ? 'Illustration explicative fondée sur le livret'
    : ((stage.items || []).some((item) => item.semanticInstructionOnly) ? 'Explication fondée sur le livret' : 'État source du jeu');
  const svg = Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${frameWidth}" height="${frameHeight}"><rect x="42" y="38" width="1836" height="1004" rx="32" fill="#231811" fill-opacity=".86" stroke="#be9a58" stroke-width="3"/><text x="96" y="112" fill="#fff3d9" font-family="Arial" font-size="46" font-weight="bold">${xml(headline)}</text><text x="96" y="184" fill="#e1c184" font-family="Arial" font-size="38">${xml(stage.label || `Étape ${index + 1}`)}</text>${instructionalText}${labels}<text x="96" y="1000" fill="#fff3d9" font-family="Arial" font-size="34">${index + 1} / ${total} · ${xml(presentationKind)} · Livret p. ${xml((scene.source_pages || []).join(', '))}</text></svg>`);
  layers.splice(1, 0, { input: svg, left: 0, top: 0 });
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
    actualDisplayBounds: { left: 130, top: 440, width: 1660, height: 420 }, preparedOnly: true, validated: false };
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
  const selected = referents.map((referent) => {
    const candidate = sourceMeasuredComponentCandidate({ scene, referent, assets });
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
  return { contract: 'mobius-source-measured-state-sequence-v1', sceneId: scene.id, ruleAtomId: scene.atomId,
    assetId: selected[0].asset.id, sourceAssets: selected.map((entry) => ({ assetId: entry.asset.id,
      sourceImageSha256: sha(fs.readFileSync(sourceFile(entry.asset))), sourcePdfSha256: entry.asset.sourcePdfSha256,
      componentEvidence: entry.component })), frames, sourceComponentEvidence: selected.map((entry) => entry.component),
    preparedOnly: true, validated: false };
}

function semanticTeachingStages(scene = {}) {
  const requirement = scene.visualRequirement || {};
  const localized = scene.localizedTeaching?.visualTeaching || {};
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
  const localized = scene.localizedTeaching?.visualTeaching || {};
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
  const selected = referents.map((referent) => {
    const candidate = sourceMeasuredComponentCandidate({ scene, referent, assets });
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
    contract: 'mobius-source-grounded-semantic-sequence-v1',
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
  const selected = referents.map((referent) => {
    const candidate = sourceMeasuredComponentCandidate({ scene, referent, assets });
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
      })),
    };
    const frame = await renderStatefulFrame({ projectId, scene, sequenceId, stage, index: frames.length, total: stages.length, selected, outputDir });
    if (!frame) return null;
    frames.push(frame);
  }
  return {
    contract: 'mobius-source-grounded-instructional-diagram-v1',
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
  return {contract:'mobius-source-measured-track-sequence-v1',sceneId:scene.id,ruleAtomId:scene.atomId,assetId:asset.id,
    frames,trackEvidence:track,sourceComponentEvidence:selectedCandidate.component,preparedOnly:true,validated:false};
}

function canonicalTeachingPresentation(scene, index = 0, asset = {}) {
  const result = buildTeachingScene({ id: scene.id, index, section: scene.section,
    narration: scene.narration, onScreenText: scene.on_screen_text, sourcePages: scene.source_pages || [],
    background: { image: sourceFile(asset) }, visualKind: scene.renderVisual?.kind || 'automatic-component',
    durationSec: 1, preserveLineBreaks: true });
  result.durationSec = 1;
  result.layout.visualAspectRatio = Number(asset.width) / Number(asset.height) || 1;
  return result;
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
  return { sceneId, produced: true, validated: false, preparedOnly, outputPath, phonePath, configPath,
    sourceAssetId: asset.id, sourcePath: sourceFile(asset), sourceRefs: asset.sourceRefs,
    bindingStatus: selected?.status, requirement, actualDisplayBounds: containedDisplayBounds(asset, { width: layout.imageWidth, height: layout.imageHeight }),
    reason: 'Normal renderer output requires physical/composition review; production state and decisions unchanged.' };
}

const VISUAL_PLAN_MATERIALIZER_CONTRACT = 'mobius-visual-plan-materializer-v4';

function sourceFile(asset = {}) {
  return asset.displayPath || asset.renderPath || asset.filePath || asset.path || asset.sourceImage || null;
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
 return assets.map(asset=>({...asset,instructionalSequences:[...(asset.instructionalSequences||[]),...reviewed.filter(r=>(r.sourceAssets||[{assetId:r.assetId}]).some(source=>source.assetId===asset.id))]}));
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

module.exports = { reviewPreparedSequences, attachSequenceReviewEvidence, compositionReviewEnvironment, VISUAL_PLAN_MATERIALIZER_CONTRACT, cellsFor, materializeVisualPlanFrames, materializeTrackStateFrames, materializeStatefulInstructionalFrames, materializeSemanticInstructionalFrames, materializeSourceGroundedInstructionalDiagram, semanticTeachingStages, instructionalDiagramStages, chooseTrackCandidate, canonicalTeachingPresentation, materializeInstructionalStill };
