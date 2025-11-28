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
  onDrop,
  extractingName,
  loading,
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

  const hasFile = !!file;
  const isProcessing = loading || extractingName;

  return (
    <div className="pipeline-section">
      <h3>Project Setup</h3>
      
      <div 
        ref={dropRef}
        className="pdf-drop-zone"
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        onClick={() => !isProcessing && fileInputRef.current?.click()}
        style={{
          border: hasFile ? '2px solid #43a047' : '3px dashed #1976d2',
          borderRadius: 16,
          padding: hasFile ? 24 : 48,
          textAlign: 'center',
          cursor: isProcessing ? 'wait' : 'pointer',
          marginBottom: 24,
          backgroundColor: hasFile ? '#e8f5e9' : '#e3f2fd',
          transition: 'all 0.3s ease',
          minHeight: hasFile ? 'auto' : 180
        }}
      >
        <input
          ref={fileInputRef}
          type="file"
          accept=".pdf"
          onChange={onFileChange}
          style={{ display: 'none' }}
        />
        
        {isProcessing ? (
          <div>
            <div className="loading-spinner" style={{ width: 48, height: 48, margin: '0 auto 16px' }}></div>
            <div style={{ fontSize: 18, fontWeight: 'bold', color: '#1976d2' }}>
              {loading ? 'Extracting text from PDF...' : 'Identifying game name...'}
            </div>
            <div className="pipeline-muted" style={{ marginTop: 8 }}>
              This may take a moment
            </div>
          </div>
        ) : hasFile ? (
          <div>
            <div style={{ fontSize: 32, marginBottom: 8 }}>✅</div>
            <div style={{ fontSize: 18, fontWeight: 'bold', color: '#2e7d32', marginBottom: 8 }}>
              {file.name}
            </div>
            <div className="pipeline-muted">
              {rulebookText ? `${rulebookText.length.toLocaleString()} characters extracted` : 'Processing...'}
            </div>
            <div style={{ marginTop: 12, fontSize: 13, color: '#666' }}>
              Click to upload a different PDF
            </div>
          </div>
        ) : (
          <div>
            <div style={{ fontSize: 64, marginBottom: 16, opacity: 0.8 }}>📄</div>
            <div style={{ fontSize: 20, fontWeight: 'bold', marginBottom: 8, color: '#1565c0' }}>
              Drop your rulebook PDF here
            </div>
            <div className="pipeline-muted" style={{ fontSize: 15 }}>
              or click to browse
            </div>
            <div style={{ marginTop: 16, padding: '8px 16px', backgroundColor: '#bbdefb', borderRadius: 8, display: 'inline-block' }}>
              We'll automatically extract the game name and content
            </div>
          </div>
        )}
      </div>

      {hasFile && !isProcessing && (
        <div className="fade-in">
          <div className="pipeline-grid-two">
            <label>
              Game Name
              <input
                type="text"
                value={gameName}
                onChange={(e) => setGameName(e.target.value)}
                placeholder="Extracted from PDF"
                style={{ 
                  fontWeight: gameName ? 'bold' : 'normal',
                  backgroundColor: gameName ? '#fff' : '#fff3e0'
                }}
              />
              {!gameName && (
                <span style={{ fontSize: 12, color: '#f57c00' }}>
                  Please enter the game name manually
                </span>
              )}
            </label>
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
              Detail Level
              <select value={detailPercentage} onChange={(e) => setDetailPercentage(Number(e.target.value))}>
                <option value={5}>Concise (5%)</option>
                <option value={10}>Brief (10%)</option>
                <option value={25}>Standard (25%)</option>
                <option value={50}>Detailed (50%)</option>
              </select>
            </label>
            <label>
              Render Resolution
              <select value={renderResolution} onChange={(e) => setRenderResolution(e.target.value)}>
                <option value="1920x1080">1080p HD</option>
                <option value="3840x2160">4K Ultra HD</option>
              </select>
            </label>
          </div>
        </div>
      )}
      
      {!hasFile && (
        <p className="pipeline-muted" style={{ textAlign: 'center', marginTop: 0 }}>
          Start by uploading your board game rulebook PDF above
        </p>
      )}
    </div>
  );
}
