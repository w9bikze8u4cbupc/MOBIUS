import React from "react";

const TRANSITIONS = ['fade-in', 'slide-left', 'slide-right', 'zoom-on-component', 'highlight-pulse'];

function formatDuration(durationMs) {
  const seconds = Math.round((Number(durationMs) || 0) / 100) / 10;
  return `${seconds}s`;
}

function sourceLabel(source) {
  return `Section ${source.section}, ${source.startOffset}–${source.endOffset}`;
}

export function StoryboardStep({
  onGenerateStoryboard,
  onUpdateScene,
  storyboardManifest,
  storyboardError,
  storyboarding,
}) {
  const scenes = storyboardManifest?.scenes || [];
  const summary = {
    totalDurationMs: storyboardManifest?.totalEstimatedDurationMs || scenes.reduce((sum, scene) => sum + (Number(scene.durationMs) || 0), 0),
    needsVisualReview: scenes.filter((scene) => scene.visualReviewState === 'needs_visual_review').length,
    noSources: scenes.filter((scene) => !Array.isArray(scene.sources) || scene.sources.length === 0).length,
    noAssets: scenes.filter((scene) => !Array.isArray(scene.imageAssetIds) || scene.imageAssetIds.length === 0).length,
  };
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
          <h4>Storyboard review</h4>
          <p data-testid="storyboard-summary">
            {scenes.length} scenes · {formatDuration(summary.totalDurationMs)} estimated · {summary.needsVisualReview} need visual review · {summary.noSources} without sources · {summary.noAssets} without matched visual assets
          </p>
          {storyboardManifest.durationWarning && <p style={{ color: '#9c6500' }}>{storyboardManifest.durationWarning}</p>}
          {scenes.map((scene) => (
            <article key={scene.id} style={{ border: '1px solid #d0d7de', borderRadius: 8, padding: 12, marginBottom: 12 }}>
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
                  <select aria-label={`Visual state for ${scene.id}`} value={scene.visualReviewState || 'needs_visual_review'} onChange={(event) => onUpdateScene(scene.id, { visualReviewState: event.target.value })}>
                    <option value="needs_visual_review">needs visual review</option><option value="matched">matched</option><option value="blocked">blocked</option>
                  </select>
                </label>
              </div>
              <label>Visual directions
                <textarea aria-label={`Visual directions for ${scene.id}`} value={(scene.visualDirections || []).map((direction) => direction.instruction).filter(Boolean).join('\n')} onChange={(event) => onUpdateScene(scene.id, { visualDirections: event.target.value.split('\n').map((instruction) => instruction.trim()).filter(Boolean).map((instruction) => ({ instruction, onScreenText: '', camera: '', highlights: [], arrows: [], componentRefs: [] })) })} rows={2} style={{ width: '100%' }} />
              </label>
              <label>Image asset IDs (comma-separated)
                <input aria-label={`Image assets for ${scene.id}`} value={(scene.imageAssetIds || []).join(', ')} onChange={(event) => onUpdateScene(scene.id, { imageAssetIds: event.target.value.split(',').map((assetId) => assetId.trim()).filter(Boolean) })} style={{ width: '100%' }} />
              </label>
              <label>Review notes
                <textarea aria-label={`Review notes for ${scene.id}`} value={scene.reviewNotes || ''} onChange={(event) => onUpdateScene(scene.id, { reviewNotes: event.target.value })} rows={2} style={{ width: '100%' }} />
              </label>
              <p><strong>Sources:</strong> {(scene.sources || []).length ? scene.sources.map(sourceLabel).join('; ') : 'None'}</p>
              <p><strong>Visual match:</strong> {scene.visualReviewState || 'needs_visual_review'} · {(scene.imageAssetIds || []).length ? scene.imageAssetIds.join(', ') : 'no matched asset'}</p>
              {(scene.overlay?.onScreenText || []).length > 0 && <p><strong>Overlay:</strong> {scene.overlay.onScreenText.join(' · ')}</p>}
            </article>
          ))}
        </div>
      )}
    </div>
  );
}
