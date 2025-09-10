// src/render/AreaUtils.ts
export type RelArea = { relX: number; relY: number; relW: number; relH: number };
export type PxArea = { x: number; y: number; w: number; h: number };

export function areaPixelsFromHint(frameW: number, frameH: number, area: RelArea | PxArea): PxArea {
  if ((area as any).relX != null) {
    const a = area as RelArea;
    return {
      x: Math.round(a.relX * frameW),
      y: Math.round(a.relY * frameH),
      w: Math.round(a.relW * frameW),
      h: Math.round(a.relH * frameH),
    };
  }
  return area as PxArea;
}

export function expandRect(px: PxArea, pad: number | { x?: number; y?: number }, clampTo?: { w: number; h: number }): PxArea {
  const padX = typeof pad === 'number' ? pad : (pad.x ?? 0);
  const padY = typeof pad === 'number' ? pad : (pad.y ?? 0);
  let x = px.x - padX, y = px.y - padY, w = px.w + 2*padX, h = px.h + 2*padY;
  if (clampTo) {
    x = Math.max(0, Math.min(x, clampTo.w - 1));
    y = Math.max(0, Math.min(y, clampTo.h - 1));
    w = Math.max(2, Math.min(w, clampTo.w - x));
    h = Math.max(2, Math.min(h, clampTo.h - y));
  }
  return { x, y, w, h };
}