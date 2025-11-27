import React from "react";

export function StoryboardStep({
  onGenerateStoryboard,
  storyboardManifest,
  storyboardError,
  storyboarding,
}) {
  return (
    <div className="pipeline-section">
      <h3>Storyboard Generation & Review</h3>
      <div className="pipeline-actions">
        <button onClick={onGenerateStoryboard} disabled={storyboarding}>
          {storyboarding ? "Generating storyboard…" : "Generate storyboard"}
        </button>
      </div>
      {storyboardError && <p style={{ color: "red" }}>{storyboardError}</p>}
      {storyboardManifest && (
        <div className="pipeline-section">
          <h4>Storyboard scenes</h4>
          <ul>
            {storyboardManifest.scenes.map((scene) => (
              <li key={scene.id}>
                {scene.id}: {scene.motion?.type || "motion"} · {scene.durationMs}ms
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
