import React from "react";

export function MetadataInputStep({
  bggUrl,
  setBggUrl,
  metadata,
  handleMetadataChange,
  file,
  dragActive,
  onDrag,
  onDrop,
  fileInputRef,
  onFileChange,
  rulebookText,
  onTextChange,
  error,
}) {
  return (
    <div className="pipeline-section">
      <h3>Game Metadata & Inputs</h3>
      <div className="pipeline-grid-two">
        <label>
          BGG URL
          <input
            type="url"
            placeholder="https://boardgamegeek.com/boardgame/..."
            value={bggUrl}
            onChange={(e) => setBggUrl(e.target.value)}
          />
        </label>
        {Object.keys(metadata).map((key) => (
          <label key={key}>
            {key.charAt(0).toUpperCase() + key.slice(1)}
            <input
              type="text"
              value={metadata[key]}
              onChange={(e) => handleMetadataChange(key, e.target.value)}
              placeholder={`Enter ${key}`}
              style={{ color: metadata[key] === "Not found" ? "red" : "inherit" }}
            />
          </label>
        ))}
      </div>

      <div
        className="pipeline-section"
        onDragEnter={onDrag}
        onDragOver={onDrag}
        onDragLeave={onDrag}
        onDrop={onDrop}
        style={{
          border: dragActive ? "2px solid #1976d2" : "2px dashed #aaa",
          background: dragActive ? "#e3f2fd" : "#fafbfc",
          cursor: "pointer",
        }}
        onClick={() => fileInputRef.current?.click()}
      >
        <input
          ref={fileInputRef}
          type="file"
          accept="application/pdf"
          style={{ display: "none" }}
          onChange={onFileChange}
        />
        <div>{file ? `Selected: ${file.name}` : "Drag & drop a PDF or click to upload"}</div>
      </div>

      <textarea
        rows={10}
        style={{ width: "100%", boxSizing: "border-box" }}
        placeholder="Or paste rulebook text here..."
        value={rulebookText}
        onChange={onTextChange}
      />

      {error && <p style={{ color: "red" }}>{error}</p>}
    </div>
  );
}
