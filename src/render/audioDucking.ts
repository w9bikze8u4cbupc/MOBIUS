export function buildSidechainComplex(bgmLabel = 'bgm', voLabel = 'vo', outLabel = 'ducked', cfg?: {
  threshold?: number; ratio?: number; attackMs?: number; releaseMs?: number;
}) {
  const thr = cfg?.threshold ?? 0.05;
  const ratio = cfg?.ratio ?? 8;
  const attack = cfg?.attackMs ?? 5;
  const release = cfg?.releaseMs ?? 50;
  return `[${bgmLabel}][${voLabel}]sidechaincompress=threshold=${thr}:ratio=${ratio}:attack=${attack}:release=${release}[${outLabel}]`;
}

// Envelope ducking via expression: bgm volume lowered during any caption window
export function buildEnvelopeVolumeExpr(windows: { start: number; end: number }[], duckGain = 0.3) {
  if (!windows?.length) return '1.0';
  // Build expression: if(any window matches time t) then duckGain else 1.0
  const ors = windows.map(w => `between(t,${Math.max(0,w.start)},${Math.max(w.end,w.start)})`).join('+');
  // if( (cond1 + cond2 + ... ) > 0 , duckGain , 1.0)
  return `if(gt(${ors},0),${duckGain.toFixed(3)},1.0)`;
}