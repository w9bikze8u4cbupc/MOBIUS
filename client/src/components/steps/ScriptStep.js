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
  error,
}) {
  const canGenerate = rulebookText?.trim() && gameName?.trim();
  
  return (
    <div className="pipeline-section fade-in">
      <h3>Script Generation & Edit</h3>
      <p className="pipeline-muted" style={{ marginBottom: 16 }}>
        Generate a professional tutorial script from your rulebook using AI. 
        The script will include visual cues and timing suggestions for video production.
      </p>
      
      <div className="pipeline-actions" style={{ marginBottom: 16 }}>
        <button 
          className="pipeline-btn pipeline-btn-primary"
          onClick={onSummarize} 
          disabled={loading || !canGenerate}
        >
          {loading ? (
            <>
              <span className="loading-spinner"></span>
              Generating Script...
            </>
          ) : (
            "Generate Tutorial Script"
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
      
      {error && (
        <div className="status-badge status-badge-error" style={{ display: 'block', padding: '10px 14px', marginBottom: 12 }}>
          {error}
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
            placeholder={loading ? "Generating your tutorial script..." : "Generated script will appear here. Click 'Generate Tutorial Script' to begin."}
            disabled={loading}
          />
        </div>
        <div>
          <h4>Preview</h4>
          <div 
            className="pipeline-card" 
            style={{ 
              maxHeight: 380, 
              overflow: "auto",
              background: loading ? '#f9f9f9' : 'white'
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
              <p className="pipeline-muted">
                No script yet. Generate one to see the preview here.
              </p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
