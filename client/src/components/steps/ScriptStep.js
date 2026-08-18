import React from "react";
import ReactMarkdown from "react-markdown";
import { SCRIPT_PROVENANCE } from "../../projectContext";

export function ScriptStep({
  loading,
  projectId,
  rulebookText,
  gameName,
  language,
  components = [],
  scriptInputReadiness,
  onSummarize,
  scriptProvenance,
  summary,
  scriptPackage,
  editedSummary,
  onEdit,
  onSave,
  translationStatus,
  summaryWarning,
  generationStatus,
  aiStatus,
  aiStatusLoading,
  onRefreshAiStatus,
}) {
  const readiness = scriptInputReadiness || {
    ready: false,
    message: 'Cannot generate: Script input readiness has not been established.',
  };
  const canGenerate = readiness.ready;
  const aiReady = Boolean(aiStatus?.ready);
  const aiMessage = aiStatusLoading
    ? 'Loading local AI configuration…'
    : (aiStatus?.message || 'AI readiness has not been checked yet.');
  const hasSourceCompleteGeneration = scriptProvenance === SCRIPT_PROVENANCE.GENERATED_SOURCE_COMPLETE
    && generationStatus?.sourceComplete === true
    && Boolean(summary?.trim());
  const discardedLegacyFallback = scriptProvenance === SCRIPT_PROVENANCE.LEGACY_INVALID_FALLBACK;

  return (
    <div className="pipeline-section fade-in">
      <h3>Script Generation & Edit</h3>
      <p className="pipeline-muted" style={{ marginBottom: 16 }}>
        Generate an optional AI tutorial summary from your rulebook. This does not affect document structure analysis or Ingestion Review confirmation.
      </p>

      <div className="pipeline-card" style={{ marginBottom: 16 }} aria-label="Script input readiness">
        <h4 style={{ marginTop: 0 }}>Script Input Readiness</h4>
        <dl className="pipeline-grid-two" style={{ margin: 0 }}>
          <div><dt>Project ID</dt><dd>{projectId || 'Missing'}</dd></div>
          <div><dt>Game name</dt><dd>{gameName || 'Missing'}</dd></div>
          <div><dt>Rulebook text</dt><dd>{`${(rulebookText || '').length.toLocaleString()} characters`}</dd></div>
          <div><dt>Validated components</dt><dd>{`${Array.isArray(components) ? components.length : 0} components`}</dd></div>
          <div><dt>Language</dt><dd>{language || 'Missing'}</dd></div>
        </dl>
        {!canGenerate && (
          <p className="status-badge status-badge-warning" style={{ display: 'block', padding: '10px 14px', marginBottom: 0 }}>
            {readiness.message}
          </p>
        )}
      </div>

      <div className="pipeline-card" style={{ marginBottom: 16 }} aria-label="AI readiness">
        <h4 style={{ marginTop: 0 }}>AI readiness</h4>
        <p className={aiReady ? 'status-badge status-badge-success' : 'status-badge status-badge-warning'} style={{ display: 'block', padding: '10px 14px' }}>
          {aiMessage}
        </p>
        <button
          className="pipeline-btn pipeline-btn-secondary"
          onClick={onRefreshAiStatus}
          disabled={loading || aiStatusLoading}
        >
          {aiStatusLoading ? 'Refreshing AI status…' : 'Refresh AI status'}
        </button>
      </div>

      <div className="pipeline-actions" style={{ marginBottom: 16 }}>
        <button
          className="pipeline-btn pipeline-btn-primary"
          onClick={onSummarize}
          disabled={loading || !canGenerate || !aiReady}
        >
          {loading ? (
            <>
              <span className="loading-spinner"></span>
              Generating Script...
            </>
          ) : (
            'Generate optional AI summary'
          )}
        </button>
        <button
          className="pipeline-btn pipeline-btn-secondary"
          onClick={onSave}
          disabled={!editedSummary || loading}
        >
          Save Edits
        </button>

      </div>

      {loading && (
        <div className="progress-bar-container">
          <div className="progress-bar-fill progress-bar-indeterminate"></div>
        </div>
      )}

      {discardedLegacyFallback && (
        <div className="status-badge status-badge-warning" style={{ display: 'block', padding: '10px 14px', marginBottom: 12 }}>
          A previous incomplete fallback was discarded. Generate a source-complete script to continue.
        </div>
      )}

      {summaryWarning && !discardedLegacyFallback && (
        <div className="status-badge status-badge-warning" style={{ display: 'block', padding: '10px 14px', marginBottom: 12 }}>
          {summaryWarning}
        </div>
      )}

      {generationStatus && (
        <div className="status-badge status-badge-info" aria-label="Generation status" style={{ display: 'block', padding: '10px 14px', marginBottom: 12 }}>
          Source: {Number(generationStatus.sourceChars || 0).toLocaleString()} chars · Chunks: {generationStatus.completedChunks || 0}/{generationStatus.chunkCount || 0} · Final script: {Number(generationStatus.finalScriptLength || 0).toLocaleString()} chars
        </div>
      )}

      {translationStatus?.error && (
        <div className="status-badge status-badge-warning" style={{ display: 'block', padding: '10px 14px', marginBottom: 12 }}>
          {translationStatus.error}
        </div>
      )}

      {hasSourceCompleteGeneration && (
        <div className="status-badge status-badge-success" style={{ marginBottom: 12 }}>
          Script generated successfully
        </div>
      )}

      <div className="pipeline-grid-two">
        <div>
          <h4 style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            Narration (spoken text only)
            {editedSummary && <span className="status-badge status-badge-info">Editable</span>}
          </h4>
          <textarea
            className="pipeline-textarea"
            rows={16}
            value={editedSummary}
            onChange={onEdit}
            placeholder={loading ? 'Generating your tutorial script...' : "Generated script will appear here. Click 'Generate Tutorial Script' to begin."}
            disabled={loading}
          />
        </div>
        <div>
          <h4>Preview</h4>
          <div
            className="pipeline-card"
            style={{
              maxHeight: 380,
              overflow: 'auto',
              background: loading ? '#f9f9f9' : 'white',
            }}
          >
            {loading ? (
              <div>
                <div className="skeleton" style={{ height: 20, width: '80%', marginBottom: 12 }}></div>
                <div className="skeleton" style={{ height: 16, width: '100%', marginBottom: 8 }}></div>
                <div className="skeleton" style={{ height: 16, width: '90%', marginBottom: 8 }}></div>
                <div className="skeleton" style={{ height: 16, width: '95%', marginBottom: 16 }}></div>
                <div className="skeleton" style={{ height: 20, width: '60%', marginBottom: 12 }}></div>
                <div className="skeleton" style={{ height: 16, width: '85%', marginBottom: 8 }}></div>
                <div className="skeleton" style={{ height: 16, width: '100%' }}></div>
              </div>
            ) : summary ? (
              <ReactMarkdown>{summary}</ReactMarkdown>
            ) : (
              <p className="pipeline-muted">No script yet. Generate one to see the preview here.</p>
            )}
          </div>
        </div>
      </div>

      {scriptPackage?.sections?.length > 0 && (
        <div className="pipeline-card" aria-label="Visual directions and sources" style={{ marginTop: 16 }}>
          <h4 style={{ marginTop: 0 }}>Visual directions & source provenance (non-spoken)</h4>
          {scriptPackage.sections.map((section) => (
            <details key={section.id || section.order} style={{ marginBottom: 8 }}>
              <summary><strong>{section.title}</strong> — {section.visualDirections?.length || 0} visual directions, {section.sources?.length || 0} sources</summary>
              <p><strong>Visual directions:</strong> {section.visualDirections?.length
                ? section.visualDirections.map((direction) => direction.instruction || direction.onScreenText || 'Production direction').join(' · ')
                : 'None provided.'}</p>
              <p><strong>Sources:</strong> {section.sources?.length
                ? section.sources.map((source) => `Section ${source.section}, offsets ${source.startOffset}-${source.endOffset}${source.uncertainty ? ` (${source.uncertainty})` : ''}`).join(' · ')
                : 'No structured provenance (legacy editable script).'}</p>
            </details>
          ))}
        </div>
      )}
    </div>
  );
}
