// orb/OrbTutorialInfoBadge.tsx

import React from "react";
import type { G4ClarityInsightBundle } from "./clarityInsight";
import { buildClarityBadgeState } from "./clarityInsight";

type Props = {
  g4Bundle: G4ClarityInsightBundle;
};

export const OrbTutorialInfoBadge: React.FC<Props> = ({ g4Bundle }) => {
  const badge = buildClarityBadgeState(g4Bundle);

  return (
    <div className="orb-tutorial-info-badge">
      <div className="orb-tutorial-info-badge__title">
        Tutorial {g4Bundle.identity.tutorialId} · Seq {g4Bundle.identity.seqIndex}
      </div>
      <div className="orb-tutorial-info-badge__grade">Quality Grade: {badge.grade}</div>
      <div className="orb-tutorial-info-badge__clarity">
        Clarity Score: {(badge.clarityScore * 100).toFixed(0)}%
      </div>
      <div className="orb-tutorial-info-badge__summary">{badge.summary}</div>
    </div>
  );
};
