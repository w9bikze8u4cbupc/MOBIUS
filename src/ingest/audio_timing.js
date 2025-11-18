export function snap(timeSec) {
  return Math.round(timeSec * 100) / 100;
}

export function alignToSceneStart(sceneStart, voiceStart) {
  const delta = voiceStart - sceneStart;
  if (Math.abs(delta) <= 0.01) {
    return snap(voiceStart);
  }
  return snap(sceneStart);
}

export function computeGap(prevEnd, nextStart) {
  const rawGap = nextStart - prevEnd;
  if (rawGap < 0.12) {
    return 0.12;
  }
  return snap(rawGap);
}

export function enforceOverlayEntry(baseStart, overlayOffset) {
  const entry = baseStart + overlayOffset;
  return snap(entry);
}
