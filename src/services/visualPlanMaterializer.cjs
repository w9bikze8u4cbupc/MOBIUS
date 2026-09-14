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

const VISUAL_PLAN_MATERIALIZER_CONTRACT = 'mobius-visual-plan-materializer-v1';

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
 return assets.map(asset=>({...asset,instructionalSequences:[...(asset.instructionalSequences||[]),...reviewed.filter(r=>r.assetId===asset.id)]}));
}

// A production may resume an already-prepared state composition while the
// broader source-discovery batch is intentionally exhausted. Keep the same
// durable ledger, but allow an operator-owned runtime policy to reserve an
// explicitly capped group for that final composition measurement.
function compositionReviewEnvironment(env = process.env) {
 const group=String(env.MOBIUS_VISUAL_COMPOSITION_BUDGET_GROUP||'').trim();
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

module.exports = { reviewPreparedSequences, attachSequenceReviewEvidence, compositionReviewEnvironment, VISUAL_PLAN_MATERIALIZER_CONTRACT, cellsFor, materializeVisualPlanFrames, materializeTrackStateFrames, chooseTrackCandidate, canonicalTeachingPresentation, materializeInstructionalStill };
