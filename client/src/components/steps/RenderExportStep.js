import React from "react";

export function RenderExportStep({
  onStartRender,
  renderJobState,
  renderJobError,
  renderJobLoading,
  backgroundMusicFile,
  setBackgroundMusicFile,
  backgroundMusicVolume,
  setBackgroundMusicVolume,
}) {
  return (
    <div className="pipeline-section">
      <h3>Render & Export</h3>
      <p className="pipeline-muted">
        Remotion renders a 1080p tutorial with generated narration and a calm bundled music bed; you may optionally replace it with your own background music.
      </p>
      <div className="pipeline-actions">
        <button onClick={onStartRender} disabled={renderJobLoading}>
          {renderJobLoading ? "Starting render…" : "Start render"}
        </button>
      </div>

      <div className="pipeline-grid-two">
        <label style={{ display: "block" }}>
          Background music
          <input
            type="file"
            accept="audio/mpeg,audio/mp4,audio/ogg,audio/wav,.mp3,.m4a,.ogg,.wav"
            onChange={(event) => setBackgroundMusicFile(event.target.files?.[0] || null)}
          />
          <span className="pipeline-muted" style={{ display: "block", marginTop: 6 }}>
            {backgroundMusicFile
              ? `Selected: ${backgroundMusicFile.name}`
              : "Optional: MP3, M4A, OGG, or WAV (25 MB maximum). MOBIUS uses its bundled underwater music bed when no file is selected."}
          </span>
        </label>
        <label style={{ display: "block" }}>
          Music volume: {Math.round(backgroundMusicVolume * 100)}%
          <input
            type="range"
            min="0"
            max="0.4"
            step="0.01"
            value={backgroundMusicVolume}
            onChange={(event) => setBackgroundMusicVolume(Number(event.target.value))}
          />
        </label>
      </div>

      {renderJobError && <p style={{ color: "red" }}>{renderJobError}</p>}
      {renderJobState && (
        <div className="pipeline-section">
          <h4 style={{ marginTop: 0 }}>Render job</h4>
          <p>Status: <strong>{renderJobState.status || "pending"}</strong></p>
          <p>Progress: {renderJobState.progress ?? 0}%</p>
          {renderJobState.renderer === "remotion" && (
            <p className="pipeline-muted">Renderer: Remotion with mixed background music</p>
          )}
          {renderJobState.outputFilePath && (
            <p className="pipeline-muted">Output: {renderJobState.outputFilePath}</p>
          )}
          {renderJobState.error && (
            <p style={{ color: "red" }}>Error: {renderJobState.error}</p>
          )}
          {renderJobState.resultPaths?.length > 0 && (
            <div>
              <strong>Artifacts:</strong>
              <ul>
                {renderJobState.resultPaths.map((outputPath, index) => (
                  <li key={index}>{outputPath}</li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
