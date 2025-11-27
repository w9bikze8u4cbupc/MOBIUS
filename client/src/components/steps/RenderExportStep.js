import React from "react";

export function RenderExportStep({
  projectId,
  renderLang,
  setRenderLang,
  renderResolution,
  setRenderResolution,
  onGenerateConfig,
  renderJobConfig,
  renderConfigError,
  showRenderConfigJson,
  setShowRenderConfigJson,
  onStartRender,
  renderJobState,
  renderJobError,
  renderJobLoading,
}) {
  return (
    <div className="pipeline-section">
      <h3>Render & Export</h3>
      <div className="pipeline-actions">
        <button onClick={onGenerateConfig}>Generate render job config</button>
        <button onClick={onStartRender} disabled={renderJobLoading}>
          {renderJobLoading ? "Starting render…" : "Start render"}
        </button>
      </div>
      <div className="pipeline-grid-two">
        <label>
          Render Language
          <select value={renderLang} onChange={(e) => setRenderLang(e.target.value)}>
            <option value="en">English</option>
            <option value="fr">French</option>
          </select>
        </label>
        <label>
          Render Resolution
          <select value={renderResolution} onChange={(e) => setRenderResolution(e.target.value)}>
            <option value="1920x1080">1080p</option>
            <option value="3840x2160">4K</option>
          </select>
        </label>
      </div>

      {renderConfigError && <p style={{ color: "red" }}>{renderConfigError}</p>}
      {renderJobConfig && (
        <div className="pipeline-section">
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <h4 style={{ margin: 0 }}>Render job config</h4>
            <button onClick={() => setShowRenderConfigJson((prev) => !prev)}>
              {showRenderConfigJson ? "Hide JSON" : "Show JSON"}
            </button>
          </div>
          <p className="pipeline-muted">Project: {renderJobConfig?.projectId || projectId}</p>
          {showRenderConfigJson && (
            <pre style={{ maxHeight: 200, overflow: "auto" }}>{JSON.stringify(renderJobConfig, null, 2)}</pre>
          )}
        </div>
      )}

      {renderJobError && <p style={{ color: "red" }}>{renderJobError}</p>}
      {renderJobState && (
        <div className="pipeline-section">
          <h4 style={{ marginTop: 0 }}>Render job</h4>
          <p>Status: {renderJobState.status || "pending"}</p>
          <p>Progress: {renderJobState.progress ?? 0}%</p>
          {renderJobState.artifacts?.length ? (
            <ul>
              {renderJobState.artifacts.map((artifact) => (
                <li key={artifact.name}>{artifact.name}</li>
              ))}
            </ul>
          ) : (
            <p className="pipeline-muted">No artifacts yet.</p>
          )}
        </div>
      )}
    </div>
  );
}
