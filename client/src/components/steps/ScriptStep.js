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
  return (
    <div className="pipeline-section">
      <h3>Script Generation & Edit</h3>
      <div className="pipeline-actions">
        <button onClick={onSummarize} disabled={loading || !rulebookText.trim() || !gameName.trim()}>
          {loading ? "Processing…" : "Generate Tutorial Script"}
        </button>
        <button onClick={onSave} disabled={!editedSummary || loading}>
          Save Edits
        </button>
      </div>
      {error && <p style={{ color: "red" }}>{error}</p>}
      {translationStatus?.error && <p style={{ color: "orange" }}>{translationStatus.error}</p>}
      <div className="pipeline-grid-two">
        <div>
          <h4>Editable Script</h4>
          <textarea
            rows={16}
            style={{ width: "100%", boxSizing: "border-box" }}
            value={editedSummary}
            onChange={onEdit}
            placeholder="Generated script will appear here"
          />
        </div>
        <div>
          <h4>Preview</h4>
          <div style={{ border: "1px solid #eee", borderRadius: 6, padding: 10, maxHeight: 340, overflow: "auto" }}>
            {summary ? <ReactMarkdown>{summary}</ReactMarkdown> : <p className="pipeline-muted">No script yet.</p>}
          </div>
        </div>
      </div>
    </div>
  );
}
