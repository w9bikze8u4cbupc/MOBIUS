/** Select the encoded background for a reviewed storyboard asset. */
function resolveStoryboardBackground(asset = {}) {
  const hasRenderableTimeline = (asset.timedOverlayTimeline?.length || 0) > 0
    || (asset.motionCueTimeline?.length || 0) > 0;
  return asset.animationBaseFramePath && hasRenderableTimeline
    ? asset.animationBaseFramePath
    : asset.filePath;
}

module.exports = { resolveStoryboardBackground };
