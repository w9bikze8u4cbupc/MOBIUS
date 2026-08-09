import React from "react";

export function VoiceStep({
  sections,
  audio,
  audioLoading,
  onPlayAudio,
}) {
  return (
    <div className="pipeline-section">
      <h3>Voice & TTS</h3>
      {sections.length === 0 && <p className="pipeline-muted">Generate a script to unlock sectioned audio.</p>}
      {sections.map((section, index) => (
        <div key={index} className="pipeline-section" style={{ background: "#f9fafb" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <strong>Section {index + 1}</strong>
            <button onClick={() => onPlayAudio(section, index)} disabled={audioLoading[index]}>
              {audioLoading[index] ? "Generating…" : audio[index] ? "Play" : "Generate audio"}
            </button>
          </div>
          <p style={{ whiteSpace: "pre-wrap" }}>{section}</p>
          {audio[index] && <audio id={`audio-${index}`} src={audio[index]} controls style={{ width: "100%" }} />}
        </div>
      ))}
    </div>
  );
}
