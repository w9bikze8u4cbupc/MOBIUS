import React from "react";

const TRANSITIONS = ['fade-in', 'slide-left', 'slide-right', 'zoom-on-component', 'highlight-pulse'];
const BACKEND_URL = process.env.REACT_APP_BACKEND_URL !== undefined ? process.env.REACT_APP_BACKEND_URL : '';

function formatDuration(durationMs) {
  const seconds = Math.round((Number(durationMs) || 0) / 100) / 10;
  return `${seconds}s`;
}

function sourceLabel(source) {
  return `Section ${source.section}, ${source.startOffset}–${source.endOffset}`;
}

export function preserveVisualDirectionMetadata(existingDirections = [], value = '') {
  const existing = Array.isArray(existingDirections) ? existingDirections : [];
  const instructions = String(value).split('\n').map((instruction) => instruction.trim()).filter(Boolean);
  const byInstruction = new Map();
  existing.forEach((direction, index) => {
    const instruction = String(direction?.instruction || '').trim();
    if (!instruction) return;
    const matches = byInstruction.get(instruction) || [];
    matches.push({ direction, index });
    byInstruction.set(instruction, matches);
  });
  const usedIndexes = new Set();
  const reconciled = instructions.map((instruction) => {
    const match = byInstruction.get(instruction)?.shift();
    if (!match) return null;
    usedIndexes.add(match.index);
    return { ...match.direction, instruction };
  });
  const unmatchedExisting = existing.filter((_direction, index) => !usedIndexes.has(index));
  const unmatchedIndexes = reconciled.flatMap((direction, index) => direction ? [] : [index]);
  // A single changed line is an edit; multiple unmatched lines are structural changes and get fresh metadata.
  if (unmatchedExisting.length === 1 && unmatchedIndexes.length === 1) {
    reconciled[unmatchedIndexes[0]] = { ...unmatchedExisting[0], instruction: instructions[unmatchedIndexes[0]] };
  }
  return reconciled.map((direction, index) => direction || ({
    instruction: instructions[index], onScreenText: '', camera: '', highlights: [], arrows: [], componentRefs: [],
  }));
}

function assetThumbnailUrl(projectId, assetId) {
  return projectId && assetId
    ? `${BACKEND_URL}/api/projects/${encodeURIComponent(projectId)}/images/${encodeURIComponent(assetId)}/file?variant=thumbnail`
    : null;
}

function VisualAsset({ projectId, assetId, label }) {
  const src = assetThumbnailUrl(projectId, assetId);
  return <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, marginRight: 8 }}>
    {src && <img src={src} alt={label || assetId} style={{ width: 52, height: 52, objectFit: 'cover', border: '1px solid #d0d7de', borderRadius: 4 }} />}
    <code>{assetId}</code>
  </span>;
}

export function StoryboardStep({
  onGenerateStoryboard,
  onUpdateScene,
  projectId,
  images = [],
  storyboardManifest,
  storyboardError,
  storyboarding,
}) {
  const scenes = storyboardManifest?.scenes || [];
  const summary = scenes.reduce((result, scene) => {
    const plan = scene.visualPlan || {};
    result.totalDurationMs += Number(scene.durationMs) || 0;
    if (plan.reviewState === 'resolved') result.resolved += 1;
    if (plan.reviewState === 'blocked') result.blocked += 1;
    if (plan.reviewState !== 'resolved' && plan.reviewState !== 'blocked') result.unresolved += 1;
    if (plan.selectionMethod === 'approved_component_link') result.approvedComponentLinked += 1;
    if (plan.selectionMethod === 'operator_selected') result.operatorSelected += 1;
    if (plan.overviewExceptionAllowed && plan.reviewState === 'resolved') result.overviewExceptions += 1;
    return result;
  }, { totalDurationMs: 0, resolved: 0, unresolved: 0, blocked: 0, approvedComponentLinked: 0, operatorSelected: 0, overviewExceptions: 0 });
  const imageById = new Map(images.filter((image) => image?.id).map((image) => [image.id, image]));

  const updateVisualSelection = (scene, selectedAssetIds, selectionMethod) => onUpdateScene(scene.id, {
    imageAssetIds: selectedAssetIds,
    visualReviewState: selectedAssetIds.length ? 'matched' : 'needs_visual_review',
    visualPlan: {
      ...(scene.visualPlan || {}),
      selectedAssetIds,
      selectionMethod: selectedAssetIds.length ? selectionMethod : 'unresolved',
      reviewState: selectedAssetIds.length ? 'resolved' : 'needs_visual_review',
      reviewReason: selectedAssetIds.length ? 'Operator selected a project-owned visual asset.' : 'No selected visual asset.',
      overviewSelectionConfirmed: scene.visualPlan?.overviewExceptionAllowed ? false : scene.visualPlan?.overviewSelectionConfirmed === true,
      manualSelectionReviewed: selectedAssetIds.length === 0,
    },
  });

  return (
    <div className="pipeline-section">
      <h3>Storyboard Generation & Review</h3>
      <div className="pipeline-actions">
        <button onClick={onGenerateStoryboard} disabled={storyboarding}>
          {storyboarding ? "Generating storyboard…" : "Generate storyboard"}
        </button>
      </div>
      {storyboardError && <p style={{ color: "red" }}>{storyboardError}</p>}
      {storyboardManifest && (
        <div className="pipeline-section">
          <h4>Storyboard visual review</h4>
          <p data-testid="storyboard-summary">
            {scenes.length} scenes · {formatDuration(summary.totalDurationMs)} estimated · {summary.resolved} resolved · {summary.unresolved} unresolved · {summary.blocked} blocked · {summary.approvedComponentLinked} approved component-linked · {summary.operatorSelected} operator-selected · {summary.overviewExceptions} branded overview/outro exceptions
          </p>
          {storyboardManifest.durationWarning && <p style={{ color: '#9c6500' }}>{storyboardManifest.durationWarning}</p>}
          {scenes.map((scene) => {
            const plan = scene.visualPlan || { assetCandidates: [], selectedAssetIds: [], reviewState: 'needs_visual_review', selectionMethod: 'unresolved', reviewReason: 'Visual plan is unavailable.' };
            const candidatesByComponent = (plan.assetCandidates || []).reduce((groups, candidate) => {
              const key = candidate.componentId || 'scene reference';
              groups[key] = groups[key] || [];
              groups[key].push(candidate);
              return groups;
            }, {});
            const selectedIds = plan.selectedAssetIds || scene.imageAssetIds || [];
            return <article key={scene.id} style={{ border: '1px solid #d0d7de', borderRadius: 8, padding: 12, marginBottom: 12 }}>
              <strong>{scene.order || scene.index + 1}. {scene.title}</strong>
              <p><code>{scene.id}</code> · section <code>{scene.sectionId || scene.sourceId}</code></p>
              <label>Spoken narration
                <textarea aria-label={`Narration for ${scene.id}`} value={scene.spokenText || ''} onChange={(event) => onUpdateScene(scene.id, { spokenText: event.target.value })} rows={3} style={{ width: '100%' }} />
              </label>
              <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginTop: 8 }}>
                <label>Duration (ms)
                  <input aria-label={`Duration for ${scene.id}`} type="number" min="100" step="100" value={scene.durationMs || ''} onChange={(event) => onUpdateScene(scene.id, { durationMs: Number(event.target.value) })} />
                </label>
                <label>Transition
                  <select aria-label={`Transition for ${scene.id}`} value={scene.transition || 'fade-in'} onChange={(event) => onUpdateScene(scene.id, { transition: event.target.value })}>
                    {TRANSITIONS.map((transition) => <option key={transition} value={transition}>{transition}</option>)}
                  </select>
                </label>
                <label>Visual state
                  <select aria-label={`Visual state for ${scene.id}`} value={plan.reviewState || 'needs_visual_review'} onChange={(event) => onUpdateScene(scene.id, {
                    visualReviewState: event.target.value === 'resolved' ? 'matched' : event.target.value,
                    visualPlan: { ...plan, reviewState: event.target.value, reviewReason: event.target.value === 'blocked' ? 'Operator blocked this visual plan.' : plan.reviewReason },
                  })}>
                    <option value="needs_visual_review">needs visual review</option><option value="resolved">resolved</option><option value="blocked">blocked</option>
                  </select>
                </label>
              </div>
              <label>Visual directions
                <textarea aria-label={`Visual directions for ${scene.id}`} value={(scene.visualDirections || []).map((direction) => direction.instruction).filter(Boolean).join('\n')} onChange={(event) => onUpdateScene(scene.id, {
                  visualDirections: preserveVisualDirectionMetadata(scene.visualDirections, event.target.value),
                })} rows={2} style={{ width: '100%' }} />
              </label>
              <p><strong>Referenced components:</strong> {(plan.componentRefs || []).length ? plan.componentRefs.join(', ') : 'none'}</p>
              <p><strong>Source references:</strong> {(plan.sourceReferences || scene.sources || []).length ? (plan.sourceReferences || scene.sources).map(sourceLabel).join('; ') : 'None'}</p>
              <p><strong>Visual plan:</strong> {plan.reviewState} · {plan.selectionMethod} · {plan.reviewReason}</p>
              <p><strong>Selected visual assets:</strong> {selectedIds.length ? selectedIds.map((assetId) => <span key={assetId}><VisualAsset projectId={projectId} assetId={assetId} label={imageById.get(assetId)?.name || assetId} /><button type="button" aria-label={`Remove ${assetId} from ${scene.id}`} onClick={() => updateVisualSelection(scene, selectedIds.filter((id) => id !== assetId), plan.selectionMethod)}>Remove</button></span>) : 'none'}</p>
              {Object.entries(candidatesByComponent).map(([componentId, candidates]) => <div key={componentId} style={{ marginBottom: 8 }}>
                <strong>Candidate assets for {componentId}</strong>
                {candidates.map((candidate) => <div key={`${candidate.componentId}-${candidate.assetId}`} style={{ margin: '6px 0' }}>
                  <VisualAsset projectId={projectId} assetId={candidate.assetId} label={imageById.get(candidate.assetId)?.name || candidate.assetId} />
                  <span>{candidate.source}{candidate.approved ? ' · approved component link' : ' · curated suggestion'}</span>
                  <button type="button" aria-label={`Use ${candidate.assetId} for ${scene.id}`} onClick={() => updateVisualSelection(scene, [...new Set([...selectedIds, candidate.assetId])], candidate.approved ? 'approved_component_link' : 'operator_selected')}>Use visual</button>
                </div>)}
              </div>)}
              <label>Project asset selection
                <select aria-label={`Project asset for ${scene.id}`} defaultValue="" onChange={(event) => {
                  if (event.target.value) updateVisualSelection(scene, [...new Set([...selectedIds, event.target.value])], 'operator_selected');
                  event.target.value = '';
                }}>
                  <option value="">Choose a current project asset</option>
                  {images.map((image) => <option key={image.id} value={image.id}>{image.name || image.id}</option>)}
                </select>
              </label>
              {plan.overviewExceptionAllowed && <label>Overview selection method
                <select aria-label={`Overview method for ${scene.id}`} value={plan.selectionMethod === 'brand_asset' || plan.selectionMethod === 'rulebook_reference' ? plan.selectionMethod : 'brand_asset'} onChange={(event) => onUpdateScene(scene.id, {
                  imageAssetIds: selectedIds,
                  visualReviewState: selectedIds.length ? 'matched' : 'needs_visual_review',
                  visualPlan: { ...plan, selectedAssetIds: selectedIds, selectionMethod: event.target.value, reviewState: selectedIds.length ? 'resolved' : 'needs_visual_review', overviewSelectionConfirmed: true, reviewReason: `Operator designated this project-owned asset as a ${event.target.value === 'brand_asset' ? 'named brand/box/assembled-game visual' : 'rulebook reference'}.` },
                })}>
                  <option value="brand_asset">named brand/box/assembled-game asset</option><option value="rulebook_reference">rulebook reference</option>
                </select>
              </label>}
              <label>Image asset IDs (current project only)
                <input aria-label={`Image assets for ${scene.id}`} value={selectedIds.join(', ')} onChange={(event) => updateVisualSelection(scene, event.target.value.split(',').map((assetId) => assetId.trim()).filter(Boolean), plan.selectionMethod)} style={{ width: '100%' }} />
              </label>
              <label>Review notes
                <textarea aria-label={`Review notes for ${scene.id}`} value={scene.reviewNotes || ''} onChange={(event) => onUpdateScene(scene.id, { reviewNotes: event.target.value })} rows={2} style={{ width: '100%' }} />
              </label>
              {(scene.overlay?.onScreenText || []).length > 0 && <p><strong>Overlay:</strong> {scene.overlay.onScreenText.join(' · ')}</p>}
            </article>;
          })}
        </div>
      )}
    </div>
  );
}
