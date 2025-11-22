import React from "react";
import { G3VisualizationBundle, buildOrbTutorialOverlays } from "./tutorialOverlays";

type Props = {
  g3Bundle: G3VisualizationBundle;
};

export const OrbCanvasTutorialLayer: React.FC<Props> = ({ g3Bundle }) => {
  const overlays = buildOrbTutorialOverlays(g3Bundle);

  // These hooks would delegate to whatever drawing system you use for OrbCanvas.
  // Here we just show the pattern (no actual canvas calls).
  // You can wire this into your existing rendering pipeline.
  return (
    <g data-layer="tutorial">
      {/* Example: you’d replace these with actual drawing primitives */}
      {/* Pacing wave, density band, motion arcs, captions, clarity thread */}
      {/* This component serves as the typed boundary; implementation lives in your canvas renderer */}
      <title>{`Tutorial ${overlays.identity.tutorialId} – seq ${overlays.identity.seqIndex}`}</title>
    </g>
  );
};
