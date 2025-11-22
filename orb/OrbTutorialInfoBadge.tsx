// orb/OrbTutorialInfoBadge.tsx

import React from "react";
import type { G3VisualizationBundle } from "./tutorialOverlays";
import { buildClarityOverlayState, buildInsightOverlayState } from "./clarityInsight";

type Props = {
  g3Bundle: G3VisualizationBundle;
};

export const OrbTutorialInfoBadge: React.FC<Props> = ({ g3Bundle }) => {
  const clarity = buildClarityOverlayState(g3Bundle.globalMetrics);
  const insight = buildInsightOverlayState(g3Bundle.globalMetrics);

  const grade =
    clarity.clarityScore >= 0.8 ? "A" :
    clarity.clarityScore >= 0.65 ? "B" :
    clarity.clarityScore >= 0.5 ? "C" : "D";

  return (
    <div className="orb-tutorial-info-badge">
      <div className="orb-tutorial-info-badge__title">
        Tutorial {g3Bundle.identity.tutorialId} · Seq {g3Bundle.identity.seqIndex}
      </div>
      <div className="orb-tutorial-info-badge__grade">Quality Grade: {grade}</div>
      <div className="orb-tutorial-info-badge__summary">{insight.summary}</div>
    </div>
  );
};
