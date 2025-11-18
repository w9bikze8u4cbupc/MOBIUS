const { snapToFrame } = require('./storyboard_timing');

const SAFE_AREA = {
  left: 0.05,
  top: 0.05,
  right: 0.95,
  bottom: 0.95
};

const LAYERS = {
  background: 0,
  board: 5,
  components: 10,
  overlays: 20,
  pointers: 30
};

const OVERLAY_SLOTS = {
  top: {
    x: SAFE_AREA.left,
    y: SAFE_AREA.top,
    width: SAFE_AREA.right - SAFE_AREA.left,
    height: 0.2
  },
  center: {
    x: SAFE_AREA.left,
    y: 0.4,
    width: SAFE_AREA.right - SAFE_AREA.left,
    height: 0.25
  },
  bottom: {
    x: SAFE_AREA.left,
    y: SAFE_AREA.bottom - 0.22,
    width: SAFE_AREA.right - SAFE_AREA.left,
    height: 0.18
  }
};

function overlayPlacementForSlot(slot = 'top') {
  return OVERLAY_SLOTS[slot] || OVERLAY_SLOTS.top;
}

function createOverlay({ id, text, role, durationSec, slot = 'top', startSec = 0 }) {
  const placement = overlayPlacementForSlot(slot);
  const snappedStart = snapToFrame(startSec);
  const snappedEnd = snapToFrame(snappedStart + durationSec);
  return {
    id,
    role,
    text,
    placement,
    startSec: snappedStart,
    endSec: snappedEnd
  };
}

function normalizeComponentId(value) {
  if (typeof value === 'string') return value;
  if (value && typeof value === 'object' && value.id) return value.id;
  return null;
}

function buildComponentGrid(componentIds) {
  const ids = Array.isArray(componentIds)
    ? componentIds.map((value) => normalizeComponentId(value)).filter(Boolean)
    : [];
  if (!ids.length) {
    return { visuals: [], layout: null };
  }

  const maxColumns = 3;
  const columns = Math.min(maxColumns, Math.max(1, Math.ceil(Math.sqrt(ids.length))));
  const rows = Math.ceil(ids.length / columns);
  const safeWidth = SAFE_AREA.right - SAFE_AREA.left;
  const safeHeight = Math.min(0.4, SAFE_AREA.bottom - SAFE_AREA.top);
  const regionTop = Math.min(0.55, SAFE_AREA.bottom - safeHeight);
  const cellWidth = (safeWidth / columns) * 0.9;
  const cellHeight = (safeHeight / rows) * 0.8;
  const visuals = [];
  const cells = [];

  ids.forEach((componentId, index) => {
    const row = Math.floor(index / columns);
    const col = index % columns;
    const x = SAFE_AREA.left + col * (safeWidth / columns) + (safeWidth / columns - cellWidth) / 2;
    const y = regionTop + row * (safeHeight / rows) + (safeHeight / rows - cellHeight) / 2;
    const placement = { x, y, width: cellWidth, height: cellHeight };

    visuals.push({
      id: `visual-component-${componentId}-${index}`,
      assetId: componentId,
      placement,
      layer: LAYERS.components,
      motions: [
        {
          type: 'fade',
          easing: 'linear',
          startSec: 0,
          endSec: 0.5
        }
      ]
    });

    cells.push({ componentId, placement });
  });

  return {
    visuals,
    layout: {
      type: 'grid',
      rows,
      columns,
      regionTop,
      regionHeight: safeHeight,
      safeArea: SAFE_AREA,
      cells
    }
  };
}

function isWithinSafeArea(placement) {
  if (!placement) return true;
  const { x, y, width, height } = placement;
  if ([x, y, width, height].some((v) => typeof v !== 'number')) {
    return false;
  }
  const withinX = x >= SAFE_AREA.left && x + width <= SAFE_AREA.right;
  const withinY = y >= SAFE_AREA.top && y + height <= SAFE_AREA.bottom;
  return withinX && withinY;
}

module.exports = {
  SAFE_AREA,
  LAYERS,
  createOverlay,
  buildComponentGrid,
  overlayPlacementForSlot,
  isWithinSafeArea
};
