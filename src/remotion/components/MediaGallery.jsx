import React from 'react';
import { Img, interpolate, spring, useCurrentFrame, useVideoConfig } from 'remotion';

const clamp = {
  extrapolateLeft: 'clamp',
  extrapolateRight: 'clamp',
};

const IMAGE_HOLD_SECONDS = 2.5;

/**
 * Displays one image at a time from a scene gallery. The image changes on a
 * predictable cadence so it remains compatible with offline rendering.
 */
export const MediaGallery = ({ imageUrls, label }) => {
  const frame = useCurrentFrame();
  const { fps, width } = useVideoConfig();
  const validImageUrls = Array.isArray(imageUrls)
    ? imageUrls.filter((url) => typeof url === 'string' && url.trim() !== '')
    : [];

  if (validImageUrls.length === 0) {
    return null;
  }

  const galleryEntrance = spring({
    fps,
    frame: frame - 9,
    config: { damping: 17, mass: 0.9, stiffness: 110 },
  });
  const galleryOpacity = interpolate(galleryEntrance, [0, 1], [0, 1], clamp);
  const galleryScale = interpolate(galleryEntrance, [0, 1], [0.93, 1], clamp);
  const framesPerImage = Math.max(1, Math.round(fps * IMAGE_HOLD_SECONDS));
  const activeIndex = Math.floor(Math.max(0, frame - 9) / framesPerImage) % validImageUrls.length;
  const imageFrame = Math.max(0, frame - 9 - (activeIndex * framesPerImage));
  const imageEntrance = spring({
    fps,
    frame: imageFrame,
    config: { damping: 19, mass: 0.7, stiffness: 125 },
  });
  const imageOpacity = interpolate(imageEntrance, [0, 1], [0, 1], clamp);
  const imageTranslateX = interpolate(imageEntrance, [0, 1], [42, 0], clamp);
  const borderRadius = Math.max(18, Math.round(width * 0.013));

  return (
    <section
      aria-label={label ? `${label} media gallery` : 'Tutorial media gallery'}
      style={{
        backgroundColor: '#1e293b',
        borderRadius,
        boxShadow: '0 24px 70px rgba(0, 0, 0, 0.3)',
        flex: '1 1 0',
        minWidth: 0,
        opacity: galleryOpacity,
        overflow: 'hidden',
        position: 'relative',
        transform: `scale(${galleryScale})`,
      }}
    >
      <Img
        key={validImageUrls[activeIndex]}
        src={validImageUrls[activeIndex]}
        style={{
          height: '100%',
          objectFit: 'cover',
          opacity: imageOpacity,
          position: 'absolute',
          transform: `translateX(${imageTranslateX}px)`,
          width: '100%',
        }}
      />
      {validImageUrls.length > 1 ? (
        <div
          style={{
            backgroundColor: 'rgba(15, 23, 42, 0.76)',
            borderRadius: 999,
            bottom: 24,
            color: '#f8fafc',
            fontSize: Math.max(24, Math.round(width * 0.015)),
            fontWeight: 700,
            padding: '10px 18px',
            position: 'absolute',
            right: 24,
          }}
        >
          {activeIndex + 1} / {validImageUrls.length}
        </div>
      ) : null}
    </section>
  );
};

export default MediaGallery;
