import React, { useRef } from "react";

export function ProjectSetupStep({
  projectId,
  setProjectId,
  gameName,
  setGameName,
  language,
  setLanguage,
  voice,
  setVoice,
  getLanguageVoices,
  detailPercentage,
  setDetailPercentage,
  renderLang,
  setRenderLang,
  renderResolution,
  setRenderResolution,
  file,
  rulebookText,
  onFileChange,
  onTextChange,
  onDrop,
  extractingName,
}) {
  const voices = getLanguageVoices(language);
  const dropRef = useRef(null);
  const fileInputRef = useRef(null);

  const handleDragOver = (e) => {
    e.preventDefault();
    e.stopPropagation();
    if (dropRef.current) {
      dropRef.current.classList.add('drag-over');
    }
  };

  const handleDragLeave = (e) => {
    e.preventDefault();
    e.stopPropagation();
    if (dropRef.current) {
      dropRef.current.classList.remove('drag-over');
    }
  };

  const handleDrop = (e) => {
    e.preventDefault();
    e.stopPropagation();
    if (dropRef.current) {
      dropRef.current.classList.remove('drag-over');
    }
    if (onDrop) {
      onDrop(e);
    }
  };

  return (
    <div className="pipeline-section">
      <h3>Project Setup</h3>
      
      <div 
        ref={dropRef}
        className="pdf-drop-zone"
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        onClick={() => fileInputRef.current?.click()}
        style={{
          border: '2px dashed #1976d2',
          borderRadius: 12,
          padding: 32,
          textAlign: 'center',
          cursor: 'pointer',
          marginBottom: 20,
          backgroundColor: file ? '#e3f2fd' : '#fafafa',
          transition: 'all 0.2s ease'
        }}
      >
        <input
          ref={fileInputRef}
          type="file"
          accept=".pdf"
          onChange={onFileChange}
          style={{ display: 'none' }}
        />
        {file ? (
          <div>
            <div style={{ fontSize: 18, fontWeight: 'bold', color: '#1976d2', marginBottom: 8 }}>
              {file.name}
            </div>
            <div className="pipeline-muted">
              {rulebookText ? `${rulebookText.length.toLocaleString()} characters extracted` : 'Processing...'}
            </div>
            {extractingName && (
              <div style={{ marginTop: 12, color: '#f57c00' }}>
                <span className="loading-spinner" style={{ marginRight: 8 }}></span>
                Extracting game name from rulebook...
              </div>
            )}
          </div>
        ) : (
          <div>
            <div style={{ fontSize: 40, marginBottom: 12 }}>📄</div>
            <div style={{ fontSize: 16, fontWeight: 'bold', marginBottom: 8 }}>
              Drop your rulebook PDF here
            </div>
            <div className="pipeline-muted">
              or click to browse
            </div>
          </div>
        )}
      </div>

      <div className="pipeline-grid-two">
        <label>
          Project ID
          <input
            type="text"
            value={projectId}
            onChange={(e) => setProjectId(e.target.value)}
            placeholder="Auto-generated from game name"
          />
        </label>
        <label>
          Game Name
          <input
            type="text"
            value={gameName}
            onChange={(e) => setGameName(e.target.value)}
            placeholder={extractingName ? "Extracting from PDF..." : "Board game name"}
            disabled={extractingName}
          />
          {!gameName && rulebookText && !extractingName && (
            <span className="pipeline-muted" style={{ fontSize: 12 }}>
              Could not auto-detect. Please enter manually.
            </span>
          )}
        </label>
        <label>
          Output Language
          <select value={language} onChange={(e) => setLanguage(e.target.value)}>
            <option value="english">English</option>
            <option value="french">French</option>
          </select>
        </label>
        <label>
          Voice
          <select value={voice} onChange={(e) => setVoice(e.target.value)} disabled={!voices.length}>
            {voices.map((v) => (
              <option key={v.id} value={v.id}>
                {v.name}
              </option>
            ))}
            {!voices.length && <option value="">No voices available</option>}
          </select>
        </label>
        <label>
          Detail % Increase
          <select value={detailPercentage} onChange={(e) => setDetailPercentage(Number(e.target.value))}>
            <option value={5}>5%</option>
            <option value={10}>10%</option>
            <option value={25}>25%</option>
            <option value={50}>50%</option>
          </select>
        </label>
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
      
      <p className="pipeline-muted" style={{ marginTop: 16 }}>
        Upload your rulebook PDF to automatically extract the game name and content.
      </p>
    </div>
  );
}
