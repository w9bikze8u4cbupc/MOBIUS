import React from "react";
import ReactMarkdown from "react-markdown";

export function ScriptStep({
  loading,
  rulebookText,
  gameName,
  onSummarize,
  summary,
  editedSummary,
  onEdit,
  onSave,
  translationStatus,
  summaryWarning,
  aiStatus,
  aiStatusLoading,
  onRefreshAiStatus,
}) {
  const canGenerate = rulebookText?.trim() && gameName?.trim();
  const aiReady = Boolean(aiStatus?.ready);
  const aiMessage = aiStatusLoading
    ? 'Loading local AI configuration…'
    : (aiStatus?.message || 'AI readiness has not been checked yet.');

  return (
    <div className="pipeline-section fade-in">
      <h3>Script Generation & Edit</h3>
      <p className="pipeline-muted" style={{ marginBottom: 16 }}>
        Generate an optional AI tutorial summary from your rulebook. This does not affect document structure analysis or Ingestion Review confirmation.
      </p>

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

        {!canGenerate && !loading && (
          <span className="status-badge status-badge-warning">
            Enter game name and rulebook text first
          </span>
        )}
      </div>

      {loading && (
        <div className="progress-bar-container">
          <div className="progress-bar-fill progress-bar-indeterminate"></div>
        </div>
      )}

      {summaryWarning && (
        <div className="status-badge status-badge-warning" style={{ display: 'block', padding: '10px 14px', marginBottom: 12 }}>
          {summaryWarning}
        </div>
      )}

      {translationStatus?.error && (
        <div className="status-badge status-badge-warning" style={{ display: 'block', padding: '10px 14px', marginBottom: 12 }}>
          {translationStatus.error}
        </div>
      )}

      {summary && (
        <div className="status-badge status-badge-success" style={{ marginBottom: 12 }}>
          Script generated successfully
        </div>
      )}

      <div className="pipeline-grid-two">
        <div>
          <h4 style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            Editable Script
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
    </div>
  );
}
