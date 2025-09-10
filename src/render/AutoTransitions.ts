// src/render/AutoTransitions.ts
import { LabelGen } from './LabelGen';
import { buildXFade, buildAcrossfade, XFadeParams } from './TransitionUtils';

export type Seg = {
  v: string; a?: string;
  start: number; end: number;  // absolute timeline seconds
};

export type XFadePolicy = {
  minOverlap?: number;     // only crossfade if we have at least this much overlap (default 0.1s)
  maxDur?: number;         // cap crossfade duration (default 0.5s)
  defaultDur?: number;     // default if small overlap (default 0.35s)
  transition?: XFadeParams['transition'];
  audioCurve?: 'tri'|'qsin'|'esin'|'hsin'|'log'|'par'|'qua'|'cub';
};

// Given sequential segments, compute transitions and their offsets/durations.
// Returns a linearized video/audio label after injecting transitions and the added graph.
export function planAndBuildCrossfades(
  lb: LabelGen,
  segs: Seg[],
  policy?: XFadePolicy
) {
  const p = {
    minOverlap: 0.1,
    maxDur: 0.5,
    defaultDur: 0.35,
    transition: 'fade' as const,
    audioCurve: 'tri' as const,
    ...policy,
  };

  if (segs.length === 0) throw new Error('No segments to stitch');

  let v = segs[0].v;
  let a = segs[0].a ?? undefined;
  let graph = '';

  for (let i = 1; i < segs.length; i++) {
    const prev = segs[i - 1];
    const curr = segs[i];
    const overlap = Math.max(0, prev.end - curr.start);

    if (overlap >= p.minOverlap) {
      // Crossfade within the overlapping window (clamped by maxDur)
      const dur = Math.min(p.maxDur, overlap);
      const offset = Math.max(curr.start, prev.end - dur);

      const xf = buildXFade(lb, v, curr.v, { transition: p.transition, duration: dur, offset });
      graph += xf.graph + '\n';
      v = xf.outV;

      if (a && curr.a) {
        const ax = buildAcrossfade(lb, a, curr.a, { duration: dur, curveA: p.audioCurve, curveB: p.audioCurve });
        graph += ax.graph + '\n';
        a = ax.outA;
      } else {
        a = curr.a ?? a;
      }
    } else {
      // Hard cut (butt splice)
      // You can also insert a tiny crossfade using defaultDur if you prefer always-smooth cuts:
      const dur = p.defaultDur;
      const offset = Math.max(prev.end - dur * 0.5, curr.start); // approximate midpoint
      const xf = buildXFade(lb, v, curr.v, { transition: p.transition, duration: Math.min(dur, p.maxDur), offset });
      graph += xf.graph + '\n';
      v = xf.outV;

      if (a && curr.a) {
        const ax = buildAcrossfade(lb, a, curr.a, { duration: Math.min(dur, p.maxDur), curveA: p.audioCurve, curveB: p.audioCurve });
        graph += ax.graph + '\n';
        a = ax.outA;
      } else {
        a = curr.a ?? a;
      }
    }
  }

  return { outV: v, outA: a, graph: graph.trim() };
}