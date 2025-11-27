import React from "react";

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
}) {
  const voices = getLanguageVoices(language);
  return (
    <div className="pipeline-section">
      <h3>Project Setup</h3>
      <div className="pipeline-grid-two">
        <label>
          Project ID
          <input
            type="text"
            value={projectId}
            onChange={(e) => setProjectId(e.target.value)}
            placeholder="Unique project identifier"
          />
        </label>
        <label>
          Game Name
          <input
            type="text"
            value={gameName}
            onChange={(e) => setGameName(e.target.value)}
            placeholder="Board game name"
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
      <p className="pipeline-muted">Provide identifiers and defaults before supplying source material.</p>
    </div>
  );
}
