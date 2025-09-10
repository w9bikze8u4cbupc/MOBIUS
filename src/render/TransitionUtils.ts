// src/render/TransitionUtils.ts
import { fmt } from './ffmpegExpr';
import { LabelGen } from './LabelGen';

export type XFadeParams = {
  transition?: 'fade' | 'wipeleft' | 'wiperight' | 'wipeup' | 'wipedown' | 'circleopen' | 'circleclose' | 'diagtl' | 'diagtr' | 'diagbl' | 'diagbr' | 'hlslice' | 'hrslice' | 'vuslice' | 'vdslice' | 'hblur' | 'fadeblack' | 'fadewhite';
  duration: number; // seconds
  offset: number;   // seconds
};

export function buildXFade(lb: LabelGen, vA: string, vB: string, p: XFadeParams) {
  const t = p.transition ?? 'fade';
  const outV = lb.next('xf');
  const graph = `[${vA}][${vB}]xfade=transition=${t}:duration=${fmt(p.duration)}:offset=${fmt(p.offset)}[${outV}]`;
  return { outV, graph };
}

export type AcrossfadeParams = { 
  duration: number; 
  curveA?: 'tri'|'qsin'|'esin'|'hsin'|'log'|'par'|'qua'|'cub'; 
  curveB?: 'tri'|'qsin'|'esin'|'hsin'|'log'|'par'|'qua'|'cub'; 
};

export function buildAcrossfade(lb: LabelGen, aA: string, aB: string, p: AcrossfadeParams) {
  const c1 = p.curveA ?? 'tri';
  const c2 = p.curveB ?? c1;
  const outA = lb.next('axf');
  const graph = `[${aA}][${aB}]acrossfade=d=${fmt(p.duration)}:c1=${c1}:c2=${c2}[${outA}]`;
  return { outA, graph };
}

export function buildDebugGrid(lb: LabelGen, vIn: string, cell = 120) {
  const outV = lb.next('grid');
  const graph = `[${vIn}]drawgrid=width=${cell}:height=${cell}:color=white@0.25:thickness=1,showinfo[${outV}]`;
  return { outV, graph };
}