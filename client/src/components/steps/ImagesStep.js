import React from "react";

export function ImagesStep() {
  return (
    <div className="pipeline-section">
      <h3>Images</h3>
      <p className="pipeline-muted">
        Image sourcing and cropping will surface BGG, rulebook, and manual assets with component targets. This build exposes a
        placeholder so the pipeline can proceed while the backend stabilizes.
      </p>
      <div style={{ padding: "12px", border: "1px dashed #aaa", borderRadius: 6, background: "#fdfdfd" }}>
        Coming soon: component galleries, crop selectors, and attribution helpers.
      </div>
    </div>
  );
}
