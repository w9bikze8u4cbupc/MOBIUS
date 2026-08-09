import React from 'react';
import { interpolate, spring, useCurrentFrame, useVideoConfig } from 'remotion';

const clamp = {
  extrapolateLeft: 'clamp',
  extrapolateRight: 'clamp',
};

/** Animated scene ordinal that makes a multi-step tutorial easier to follow. */
export const StepBadge = ({ color, stepNumber = 1 }) => {
  const frame = useCurrentFrame();
  const { fps, width } = useVideoConfig();
  const entrance = spring({
    fps,
    frame: frame - 2,
    config: { damping: 13, mass: 0.6, stiffness: 165 },
  });
  const opacity = interpolate(entrance, [0, 1], [0, 1], clamp);
  const scale = interpolate(entrance, [0, 1], [0.7, 1], clamp);
  const stepLabel = `Step ${String(stepNumber).padStart(2, '0')}`;

  return (
    <div
      aria-label={stepLabel}
      style={{
        alignItems: 'center',
        alignSelf: 'flex-start',
        backgroundColor: `${color}22`,
        border: `3px solid ${color}`,
        borderRadius: 999,
        color,
        display: 'inline-flex',
        fontSize: Math.max(28, Math.round(width * 0.019)),
        fontWeight: 800,
        letterSpacing: 1.2,
        opacity,
        padding: '16px 26px',
        textTransform: 'uppercase',
        transform: `scale(${scale})`,
        transformOrigin: 'left center',
      }}
    >
      {stepLabel}
    </div>
  );
};

export default StepBadge;
