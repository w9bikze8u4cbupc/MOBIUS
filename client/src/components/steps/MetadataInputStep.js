import React from "react";

const fieldLabels = {
  publisher: "Publisher",
  playerCount: "Player Count",
  gameLength: "Play Time",
  minimumAge: "Minimum Age",
  theme: "Theme",
  edition: "Edition"
};

const fieldPlaceholders = {
  publisher: "e.g., Fantasy Flight Games",
  playerCount: "e.g., 2-4 players",
  gameLength: "e.g., 45-60 minutes",
  minimumAge: "e.g., 10+",
  theme: "e.g., Fantasy, Sci-Fi",
  edition: "e.g., 2nd Edition"
};

export function MetadataInputStep({
  bggUrl,
  setBggUrl,
  metadata,
  handleMetadataChange,
  gameName,
  file,
}) {
  const hasAnyMetadata = metadata && Object.values(metadata).some(v => v && v.trim());
  
  return (
    <div className="pipeline-section fade-in">
      <h3>Game Metadata</h3>
      
      {file ? (
        <div className="status-badge status-badge-success" style={{ display: 'inline-block', marginBottom: 16 }}>
          Metadata extracted from: {file.name}
        </div>
      ) : (
        <div className="status-badge status-badge-warning" style={{ display: 'inline-block', marginBottom: 16 }}>
          Upload a PDF in Step 1 to auto-extract metadata
        </div>
      )}
      
      {gameName && (
        <div style={{ marginBottom: 20, padding: 16, backgroundColor: '#e3f2fd', borderRadius: 8 }}>
          <div style={{ fontSize: 12, color: '#666', marginBottom: 4 }}>Game Name</div>
          <div style={{ fontSize: 20, fontWeight: 'bold', color: '#1565c0' }}>{gameName}</div>
        </div>
      )}
      
      <div className="pipeline-card" style={{ marginBottom: 20 }}>
        <h4 style={{ margin: '0 0 16px 0' }}>
          Game Information
          {hasAnyMetadata && (
            <span className="status-badge status-badge-info" style={{ marginLeft: 12, fontSize: 11 }}>
              Auto-filled from PDF
            </span>
          )}
        </h4>
        
        <div className="pipeline-grid-two" style={{ gap: 16 }}>
          {Object.entries(metadata).map(([key, value]) => (
            <label key={key} style={{ marginBottom: 0 }}>
              {fieldLabels[key] || key}
              <input
                type="text"
                value={value || ''}
                onChange={(e) => handleMetadataChange(key, e.target.value)}
                placeholder={fieldPlaceholders[key] || `Enter ${key}`}
                className="pipeline-input"
                style={{ 
                  backgroundColor: value ? '#e8f5e9' : '#fff',
                  borderColor: value ? '#43a047' : '#ddd'
                }}
              />
            </label>
          ))}
        </div>
      </div>
      
      <div className="pipeline-card">
        <h4 style={{ margin: '0 0 16px 0' }}>BoardGameGeek Integration</h4>
        <label style={{ marginBottom: 0 }}>
          BGG URL (optional)
          <input
            type="url"
            placeholder="https://boardgamegeek.com/boardgame/..."
            value={bggUrl || ''}
            onChange={(e) => setBggUrl(e.target.value)}
            className="pipeline-input"
          />
          <span style={{ fontSize: 12, color: '#666', marginTop: 4, display: 'block' }}>
            We'll try to fetch additional metadata from BoardGameGeek if available
          </span>
        </label>
      </div>
      
      <p className="pipeline-muted" style={{ marginTop: 20, fontSize: 13 }}>
        Edit any field above to correct or add missing information. These details will be used in your tutorial video.
      </p>
    </div>
  );
}
