import React, { useState } from "react";
import { VisualAssetBrowser, roleIsValidForIntent, validRolesForIntent } from '../VisualAssetBrowser';

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

function VisualAsset({ projectId, asset, assetId }) {
  const label = asset?.label || asset?.name || assetId;
  const src = asset ? assetThumbnailUrl(projectId, assetId) : null;
  return <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, marginRight: 8 }}>
    {src ? <img src={src} alt={`${label} thumbnail`} style={{ width: 52, height: 52, objectFit: 'cover', border: '1px solid #d0d7de', borderRadius: 4 }} /> : <span role="status">Asset unavailable</span>}
    <span>{label}</span>
    <details><summary>debug</summary><code>{assetId}</code></details>
  </span>;
}

export function StoryboardStep({
  onGenerateStoryboard,
  onUpdateScene,
  projectId,
  images = [],
  inventoryStatus = 'ready',
  storyboardManifest,
  storyboardError,
  storyboarding,
}) {
  const scenes = storyboardManifest?.scenes || [];
  const [overrideDrafts, setOverrideDrafts] = useState({});
  const [browserSceneId, setBrowserSceneId] = useState(null);
  const summary = scenes.reduce((result, scene) => {
    const plan = scene.visualPlan || {};
    result.totalDurationMs += Number(scene.durationMs) || 0;
    result[plan.coverageStatus || 'unresolved'] = (result[plan.coverageStatus || 'unresolved'] || 0) + 1;
    if (plan.reviewState === 'blocked') result.blocked += 1;
    if (plan.selectionMethod === 'approved_component_link') result.approvedComponentLinked += 1;
    if (plan.selectionMethod === 'operator_selected') result.operatorSelected += 1;
    if ((plan.assetReuse || []).some((reuse) => reuse.exceedsThreshold)) result.reuseWarnings += 1;
    return result;
  }, { totalDurationMs: 0, resolved: 0, partial: 0, unresolved: 0, operator_override: 0, blocked: 0, approvedComponentLinked: 0, operatorSelected: 0, reuseWarnings: 0 });
  const imageById = new Map((images || []).filter((image) => image?.id).map((image) => [image.id, image]));

  const updateVisualSelection = (scene, requestedAssetIds, selectionMethod, assignment = null) => {
    const selectedAssetIds = [...new Set((requestedAssetIds || []).filter((assetId) => imageById.has(assetId)))];
    const existingAssignments = (scene.visualPlan?.assetAssignments || []).filter((item) => selectedAssetIds.includes(item.assetId));
    const validAssignment = assignment && selectedAssetIds.includes(assignment.assetId)
      && roleIsValidForIntent(scene.visualPlan?.primaryIntent || 'operator_defined', assignment.role)
      ? assignment : null;
    const assetAssignments = validAssignment
      ? [...existingAssignments.filter((item) => item.assetId !== validAssignment.assetId), validAssignment]
      : existingAssignments;
    onUpdateScene(scene.id, {
      imageAssetIds: selectedAssetIds,
      visualReviewState: selectedAssetIds.length ? 'matched' : 'needs_visual_review',
      visualPlan: {
        ...(scene.visualPlan || {}),
        selectedAssetIds,
        assetAssignments,
        selectionMethod: selectedAssetIds.length ? selectionMethod : 'unresolved',
        reviewState: selectedAssetIds.length ? 'resolved' : 'needs_visual_review',
        reviewReason: selectedAssetIds.length ? 'Operator selected a current-project visual asset for review.' : 'No selected visual asset.',
        overviewSelectionConfirmed: scene.visualPlan?.overviewExceptionAllowed ? false : scene.visualPlan?.overviewSelectionConfirmed === true,
        manualSelectionReviewed: selectedAssetIds.length === 0,
      },
    });
  };

  return <div className="pipeline-section">
    <h3>Storyboard Generation & Review</h3>
    <div className="pipeline-actions"><button onClick={onGenerateStoryboard} disabled={storyboarding}>{storyboarding ? 'Generating storyboard…' : 'Generate storyboard'}</button></div>
    {storyboardError && <p style={{ color: 'red' }}>{storyboardError}</p>}
    {storyboardManifest && <div className="pipeline-section">
      <h4>Storyboard visual review</h4>
      <p data-testid="storyboard-summary">{scenes.length} scenes · {formatDuration(summary.totalDurationMs)} estimated · {summary.resolved} resolved by primary evidence · {summary.partial} partial · {summary.unresolved} unresolved · {summary.operator_override} operator overrides · {summary.blocked} blocked · {summary.reuseWarnings} reuse warnings</p>
      {storyboardManifest.durationWarning && <p style={{ color: '#9c6500' }}>{storyboardManifest.durationWarning}</p>}
      {scenes.map((scene) => {
        const plan = scene.visualPlan || { assetCandidates: [], selectedAssetIds: [], reviewState: 'needs_visual_review', selectionMethod: 'unresolved', reviewReason: 'Visual plan is unavailable.' };
        const selectedIds = (plan.selectedAssetIds || scene.imageAssetIds || []).filter((assetId) => imageById.has(assetId));
        const satisfyingAssets = selectedIds.filter((assetId) => (plan.assetAssignments || []).find((item) => item.assetId === assetId)?.role !== 'supporting');
        const supportingAssets = selectedIds.filter((assetId) => (plan.assetAssignments || []).find((item) => item.assetId === assetId)?.role === 'supporting');
        const allowedRoles = validRolesForIntent(plan.primaryIntent || 'operator_defined');
        return <article key={scene.id} style={{ border: '1px solid #d0d7de', borderRadius: 8, padding: 12, marginBottom: 12 }}>
          <strong>{scene.order || scene.index + 1}. {scene.title}</strong>
          <p><code>{scene.id}</code> · section <code>{scene.sectionId || scene.sourceId}</code></p>
          <label>Spoken narration<textarea aria-label={`Narration for ${scene.id}`} value={scene.spokenText || ''} onChange={(event) => onUpdateScene(scene.id, { spokenText: event.target.value })} rows={3} style={{ width: '100%' }} /></label>
          <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginTop: 8 }}>
            <label>Duration (ms)<input aria-label={`Duration for ${scene.id}`} type="number" min="100" step="100" value={scene.durationMs || ''} onChange={(event) => onUpdateScene(scene.id, { durationMs: Number(event.target.value) })} /></label>
            <label>Transition<select aria-label={`Transition for ${scene.id}`} value={scene.transition || 'fade-in'} onChange={(event) => onUpdateScene(scene.id, { transition: event.target.value })}>{TRANSITIONS.map((transition) => <option key={transition} value={transition}>{transition}</option>)}</select></label>
            <label>Visual state<select aria-label={`Visual state for ${scene.id}`} value={plan.reviewState || 'needs_visual_review'} onChange={(event) => onUpdateScene(scene.id, { visualReviewState: event.target.value === 'resolved' ? 'matched' : event.target.value, visualPlan: { ...plan, reviewState: event.target.value, reviewReason: event.target.value === 'blocked' ? 'Operator blocked this visual plan.' : plan.reviewReason } })}><option value="needs_visual_review">needs visual review</option><option value="resolved">resolved</option><option value="blocked">blocked</option></select></label>
          </div>
          <label>Visual directions<textarea aria-label={`Visual directions for ${scene.id}`} value={(scene.visualDirections || []).map((direction) => direction.instruction).filter(Boolean).join('\n')} onChange={(event) => onUpdateScene(scene.id, { visualDirections: preserveVisualDirectionMetadata(scene.visualDirections, event.target.value) })} rows={2} style={{ width: '100%' }} /></label>
          <section aria-label={`Visual coverage for ${scene.id}`} style={{ borderLeft: '4px solid #1976d2', paddingLeft: 10, margin: '10px 0' }}>
            <p><strong>Primary visual intent:</strong> {plan.primaryIntent || 'operator_defined'}</p>
            <p><strong>Primary requirements:</strong> {(plan.primaryComponentRefs || []).length ? plan.primaryComponentRefs.join(', ') : 'explicit overview/brand/rulebook evidence'}</p>
            <p><strong>Supporting requirements:</strong> {(plan.supportingComponentRefs || []).length ? plan.supportingComponentRefs.join(', ') : 'none'}</p>
            <p><strong>Coverage:</strong> {plan.coverageStatus === 'resolved' ? 'Resolved by primary evidence' : plan.coverageStatus === 'partial' ? 'Partial — primary visual still missing' : plan.coverageStatus === 'operator_override' ? 'Resolved by documented operator override' : plan.coverageStatus || 'Unresolved'} · {plan.coverageReason || plan.reviewReason}</p>
            {plan.operatorOverride?.reason && <p style={{ color: '#9c6500' }}><strong>Operator override:</strong> {plan.operatorOverride.reason}</p>}
            <p><strong>Primary/intent assets:</strong> {satisfyingAssets.length ? satisfyingAssets.map((assetId) => imageById.get(assetId)?.name || assetId).join(', ') : 'none'}</p>
            <p><strong>Supporting assets:</strong> {supportingAssets.length ? supportingAssets.map((assetId) => imageById.get(assetId)?.name || assetId).join(', ') : 'none'}</p>
            <button type="button" aria-label={`Browse project assets for ${scene.id}`} onClick={() => setBrowserSceneId(scene.id)}>Browse current-project visuals</button>
          </section>
          <p><strong>Referenced components:</strong> {(plan.componentRefs || []).length ? plan.componentRefs.join(', ') : 'none'}</p>
          <p><strong>Source references:</strong> {(plan.sourceReferences || scene.sources || []).length ? (plan.sourceReferences || scene.sources).map(sourceLabel).join('; ') : 'None'}</p>
          <p><strong>Visual plan:</strong> {plan.reviewState} · {plan.selectionMethod} · {plan.reviewReason}</p>
          <div><strong>Selected visual assets:</strong> {selectedIds.length ? selectedIds.map((assetId) => {
            const assignment = (plan.assetAssignments || []).find((item) => item.assetId === assetId) || { role: allowedRoles.includes('supporting') ? 'supporting' : allowedRoles[0], componentId: null };
            const role = roleIsValidForIntent(plan.primaryIntent || 'operator_defined', assignment.role) ? assignment.role : allowedRoles[0];
            const reuse = (plan.assetReuse || []).find((item) => item.assetId === assetId);
            return <div key={assetId} style={{ margin: '6px 0' }}><VisualAsset projectId={projectId} asset={imageById.get(assetId)} assetId={assetId} />
              <label>role <select aria-label={`Role for ${assetId} in ${scene.id}`} value={role} onChange={(event) => onUpdateScene(scene.id, { visualPlan: { ...plan, assetAssignments: [...(plan.assetAssignments || []).filter((item) => item.assetId !== assetId), { ...assignment, assetId, role: event.target.value }] } })}>{allowedRoles.map((option) => <option key={option} value={option}>{option.replace('_', ' ')}</option>)}</select></label>
              {reuse?.exceedsThreshold && <span style={{ color: '#9c6500' }}> · reuse warning: {reuse.count}/{reuse.threshold}</span>}
              <button type="button" aria-label={`Remove ${assetId} from ${scene.id}`} onClick={() => updateVisualSelection(scene, selectedIds.filter((id) => id !== assetId), plan.selectionMethod)}>Remove</button>
            </div>;
          }) : ' none'}</div>
          <VisualAssetBrowser
            isOpen={browserSceneId === scene.id}
            onClose={() => setBrowserSceneId(null)}
            sceneId={scene.id}
            plan={plan}
            images={images}
            inventoryStatus={inventoryStatus}
            thumbnailUrlForAsset={(asset) => assetThumbnailUrl(projectId, asset.id)}
            onSelect={(asset, assignment) => updateVisualSelection(scene, [...selectedIds, asset.id], 'operator_selected', { assetId: asset.id, ...assignment })}
          />
          {plan.overviewExceptionAllowed && <label>Overview selection method
            <select aria-label={`Overview method for ${scene.id}`} value={plan.selectionMethod === 'brand_asset' || plan.selectionMethod === 'rulebook_reference' ? plan.selectionMethod : 'brand_asset'} onChange={(event) => onUpdateScene(scene.id, {
              imageAssetIds: selectedIds,
              visualReviewState: selectedIds.length ? 'matched' : 'needs_visual_review',
              visualPlan: { ...plan, selectedAssetIds: selectedIds, assetAssignments: selectedIds.map((assetId) => ({ ...(plan.assetAssignments || []).find((item) => item.assetId === assetId), assetId, role: event.target.value === 'brand_asset' ? 'brand' : 'rulebook_reference' })), selectionMethod: event.target.value, reviewState: selectedIds.length ? 'resolved' : 'needs_visual_review', overviewSelectionConfirmed: true, reviewReason: `Operator designated this current-project asset as a ${event.target.value === 'brand_asset' ? 'named brand/box/assembled-game visual' : 'rulebook reference'}.` },
            })}><option value="brand_asset">Confirm as named brand/box/assembled-game asset</option><option value="rulebook_reference">Confirm as rulebook reference</option></select>
          </label>}
          <label>Documented operator override<input aria-label={`Override reason for ${scene.id}`} value={overrideDrafts[scene.id] ?? plan.operatorOverride?.reason ?? ''} onChange={(event) => setOverrideDrafts((previous) => ({ ...previous, [scene.id]: event.target.value }))} placeholder="Concise reason required" style={{ width: '100%' }} /></label>
          <button type="button" aria-label={`Apply override for ${scene.id}`} disabled={!String(overrideDrafts[scene.id] ?? plan.operatorOverride?.reason ?? '').trim()} onClick={() => onUpdateScene(scene.id, { visualPlan: { ...plan, operatorOverride: { reason: String(overrideDrafts[scene.id] ?? plan.operatorOverride?.reason ?? '').trim() } } })}>Apply documented override</button>
          <label>Review notes<textarea aria-label={`Review notes for ${scene.id}`} value={scene.reviewNotes || ''} onChange={(event) => onUpdateScene(scene.id, { reviewNotes: event.target.value })} rows={2} style={{ width: '100%' }} /></label>
          {(scene.overlay?.onScreenText || []).length > 0 && <p><strong>Overlay:</strong> {scene.overlay.onScreenText.join(' · ')}</p>}
        </article>;
      })}
    </div>}
  </div>;
}
