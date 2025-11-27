import React from "react";

export function VoiceStep({
  sections,
  audio,
  audioLoading,
  onPlayAudio,
  availableCaptionLocales = [],
  selectedCaptionLocales = [],
  onToggleCaptionLocale = () => {},
}) {
  return (
    <div className="pipeline-section">
      <h3>Voice & TTS</h3>
      {sections.length === 0 && <p className="pipeline-muted">Generate a script to unlock sectioned audio.</p>}
      {sections.map((section, idx) => (
        <div key={idx} className="pipeline-section" style={{ background: "#f9fafb" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <strong>Section {idx + 1}</strong>
            <button onClick={() => onPlayAudio(section, idx)} disabled={audioLoading[idx]}>
              {audioLoading[idx] ? "Generating…" : audio[idx] ? "Play" : "Generate audio"}
            </button>
          </div>
          <p style={{ whiteSpace: "pre-wrap" }}>{section}</p>
          {audio[idx] && <audio id={`audio-${idx}`} src={audio[idx]} controls style={{ width: "100%" }} />}
        </div>
      ))}

      {availableCaptionLocales.length > 0 && (
        <div className="pipeline-section" style={{ background: "#f5f7fb" }}>
          <h4 style={{ marginTop: 0 }}>Caption languages</h4>
          <p className="pipeline-muted">Choose which locales should generate caption tracks.</p>
          <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
            {availableCaptionLocales.map((locale) => (
              <label key={locale} style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <input
                  type="checkbox"
                  checked={selectedCaptionLocales.includes(locale)}
                  onChange={() => onToggleCaptionLocale(locale)}
                />
                {locale}
              </label>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
