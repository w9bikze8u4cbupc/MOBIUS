// src/render/DebugOverlay.ts
import { LabelGen } from './LabelGen';

export function buildDebugSafeAndTime(
  lb: LabelGen,
  vIn: string,
  shotId: string,
  w: number,
  h: number,
  opts?: { marginPct?: number; font?: string; showGrid?: boolean }
) {
  const outV = lb.next('dbg');
  const mPct = opts?.marginPct ?? 0.05;
  const mx = Math.round(w * mPct);
  const my = Math.round(h * mPct);
  const showGrid = opts?.showGrid ?? false;
  
  // Prefer named font on Windows
  const font = opts?.font ? 
    opts.font.replace(/\\/g, '/') : 
    process.platform === 'win32' ? 'Arial' : 'assets/fonts/Inter-Regular.ttf';

  // Safe rectangle
  const x = mx, y = my, rw = w - 2*mx, rh = h - 2*my;

  // Properly escape text for drawtext
  const escapedShotId = shotId.replace(/\\/g, '\\\\').replace(/:/g, '\\:').replace(/'/g, "\\\\'");
  
  // For named fonts on Windows, we don't use fontfile parameter
  const fontParam = process.platform === 'win32' && font === 'Arial' ? 
    "font='Arial'" : 
    `fontfile='${font}'`;

  let graph = `[${vIn}]`;
  
  // Add grid if requested
  if (showGrid) {
    graph += `drawgrid=width=64:height=64:thickness=1:color=white@0.15,`;
  }
  
  graph += `drawbox=x=${x}:y=${y}:w=${rw}:h=${rh}:color=lime@0.35:t=2,
 drawtext=${fontParam}:text='${escapedShotId}'\
:fontsize=28:fontcolor=yellow:borderw=2:bordercolor=black@0.6:x=24:y=24,
 drawtext=${fontParam}:text='%{pts\\:hms}'\
:fontsize=28:fontcolor=white:borderw=2:bordercolor=black@0.6:x=w-tw-24:y=24[${outV}]`;

  return { outV, graph };
}