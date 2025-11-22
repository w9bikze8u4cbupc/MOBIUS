// orb/OrbCanvasTutorialLayer.tsx

import React from "react";
import {
  G3VisualizationBundle,
  buildOrbTutorialOverlays,
  polarToCartesian,
  ORB_COLORS,
  densityToOpacity,
  motionToOpacity,
  captionsToOpacity,
  clarityToOpacity,
} from "./tutorialOverlays";

type Props = {
  g3Bundle: G3VisualizationBundle;
};

const StrokeWidthBase = 0.01; // normalized, relative to unit circle

export const OrbCanvasTutorialLayer: React.FC<Props> = ({ g3Bundle }) => {
  const overlays = buildOrbTutorialOverlays(g3Bundle);

  return (
    <g data-layer="tutorial">
      <title>{`Tutorial ${overlays.identity.tutorialId} – seq ${overlays.identity.seqIndex}`}</title>

      {/* Density band: thick arcs in golden amber */}
      {overlays.densitySegments.map((seg, idx) => {
        const start = polarToCartesian(seg.angleStart, seg.radiusOuter);
        const end = polarToCartesian(seg.angleEnd, seg.radiusOuter);
        const largeArcFlag = seg.angleEnd - seg.angleStart > Math.PI ? 1 : 0;
        const opacity = densityToOpacity(seg.densityScore);

        const pathData = [
          `M ${start.x} ${start.y}`,
          `A ${seg.radiusOuter} ${seg.radiusOuter} 0 ${largeArcFlag} 1 ${end.x} ${end.y}`,
        ].join(" ");

        return (
          <path
            key={`density-${idx}`}
            d={pathData}
            fill="none"
            stroke={ORB_COLORS.density}
            strokeWidth={StrokeWidthBase * 3}
            strokeLinecap="round"
            opacity={opacity}
          />
        );
      })}

      {/* Motion ring: outer arcs in magenta */}
      {overlays.motionArcs.map((arc, idx) => {
        const start = polarToCartesian(arc.angleStart, arc.radius);
        const end = polarToCartesian(arc.angleEnd, arc.radius);
        const largeArcFlag = arc.angleEnd - arc.angleStart > Math.PI ? 1 : 0;
        const opacity = motionToOpacity(arc.load);

        const pathData = [
          `M ${start.x} ${start.y}`,
          `A ${arc.radius} ${arc.radius} 0 ${largeArcFlag} 1 ${end.x} ${end.y}`,
        ].join(" ");

        return (
          <path
            key={`motion-${idx}`}
            d={pathData}
            fill="none"
            stroke={ORB_COLORS.motion}
            strokeWidth={StrokeWidthBase * 2}
            strokeLinecap="round"
            opacity={opacity}
          />
        );
      })}

      {/* Caption band: radial quads between inner/outer radii */}
      {overlays.captionBlocks.map((block, idx) => {
        const innerStart = polarToCartesian(block.angleStart, block.radiusInner);
        const innerEnd = polarToCartesian(block.angleEnd, block.radiusInner);
        const outerStart = polarToCartesian(block.angleStart, block.radiusOuter);
        const outerEnd = polarToCartesian(block.angleEnd, block.radiusOuter);
        const largeArcFlag = block.angleEnd - block.angleStart > Math.PI ? 1 : 0;
        const opacity = captionsToOpacity(block.cps);

        const pathData = [
          // outer arc
          `M ${outerStart.x} ${outerStart.y}`,
          `A ${block.radiusOuter} ${block.radiusOuter} 0 ${largeArcFlag} 1 ${outerEnd.x} ${outerEnd.y}`,
          // line to inner end
          `L ${innerEnd.x} ${innerEnd.y}`,
          // inner arc back
          `A ${block.radiusInner} ${block.radiusInner} 0 ${largeArcFlag} 0 ${innerStart.x} ${innerStart.y}`,
          "Z",
        ].join(" ");

        return (
          <path
            key={`caption-${idx}`}
            d={pathData}
            fill={ORB_COLORS.captions}
            stroke="none"
            opacity={opacity}
          />
        );
      })}

      {/* Pacing wave: inner ring polyline */}
      {overlays.pacingWave.length > 1 && (
        <polyline
          points={overlays.pacingWave
            .map((pt) => {
              // amplitude is WPM deviation; compress into a small radial offset
              const amplitudeNorm = Math.max(-40, Math.min(40, pt.amplitude)) / 40; // -1..1
              const radiusOffset = amplitudeNorm * 0.03; // small shift
              const r = pt.radius + radiusOffset;
              const { x, y } = polarToCartesian(pt.angle, r);
              return `${x},${y}`;
            })
            .join(" ")}
          fill="none"
          stroke={ORB_COLORS.pacing}
          strokeWidth={StrokeWidthBase}
          opacity={0.75}
          strokeLinecap="round"
        />
      )}

      {/* Clarity thread: mid-band polyline */}
      {overlays.clarityPoints.length > 1 && (
        <polyline
          points={overlays.clarityPoints
            .map((pt) => {
              const radiusOffset = (pt.clarityScore - 0.5) * 0.05; // small gentle variation
              const r = pt.radius + radiusOffset;
              const { x, y } = polarToCartesian(pt.angle, r);
              return `${x},${y}`;
            })
            .join(" ")}
          fill="none"
          stroke={ORB_COLORS.clarity}
          strokeWidth={StrokeWidthBase}
          opacity={clarityToOpacity(overlays.globalMetrics.avgClarityScore)}
          strokeLinecap="round"
        />
      )}
    </g>
  );
};
