// src/ingest/storyboard_layout.js
// Standard layout patterns for MOBIUS storyboards (normalized coordinates).

const SAFE_MARGIN = 0.05;

/**
 * Intro/end card layout: text box centered, optional logo area at top.
 */
function buildIntroOverlay(titleText) {
  const width = 0.8;
  const height = 0.25;

  return {
    id: "overlay-intro-title",
    text: titleText || "",
    placement: {
      x: 0.5 - width / 2,
      y: 0.5 - height / 2,
      width,
      height
    },
    startSec: 0,
    endSec: 0 // filled in by caller
  };
}

/**
 * Simple setup-step overlay at the top safe area.
 */
function buildStepOverlay(stepId, text, durationSec) {
  const margin = SAFE_MARGIN;
  const height = 0.25;

  return {
    id: `overlay-${stepId}`,
    text: text || "",
    placement: {
      x: margin,
      y: margin,
      width: 1 - 2 * margin,
      height
    },
    startSec: 0,
    endSec: durationSec
  };
}

/**
 * Simple grid layout for components near the bottom of the frame.
 */
function normalizeComponentId(value) {
  if (typeof value === 'string') return value;
  if (value && typeof value === 'object' && value.id) return value.id;
  return null;
}

function buildComponentVisuals(componentIds) {
  if (!Array.isArray(componentIds) || componentIds.length === 0) {
    return [];
  }

  const ids = componentIds
    .map((value) => normalizeComponentId(value))
    .filter(Boolean);
  if (!ids.length) {
    return [];
  }

  const visuals = [];
  const maxPerRow = 3;
  const rows = Math.ceil(ids.length / maxPerRow);
  const rowHeight = 0.2;
  const totalHeight = rowHeight * rows;
  const bottomY = 1 - totalHeight - SAFE_MARGIN;

  let index = 0;
  for (let row = 0; row < rows; row++) {
    const y = bottomY + row * rowHeight;
    const rowCount = Math.min(maxPerRow, ids.length - index);
    const width = 0.8 / rowCount;
    const xStart = 0.1;

    for (let col = 0; col < rowCount; col++) {
      if (index >= ids.length) {
        break;
      }
      const componentId = ids[index];
      const x = xStart + col * width;
      const id = `visual-component-${componentId}`;

      visuals.push({
        id,
        assetId: componentId,
        placement: {
          x,
          y,
          width: width * 0.9,
          height: rowHeight * 0.8
        },
        layer: 10 // components
      });

      index += 1;
    }
  }

  return visuals;
}

module.exports = {
  buildIntroOverlay,
  buildStepOverlay,
  buildComponentVisuals
};
