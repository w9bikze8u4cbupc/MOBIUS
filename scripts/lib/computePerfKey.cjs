// Helper to compute a normalized perf key from game, platform, resolution, and codec
module.exports = function computePerfKey({ game, platform, resolution, codec }) {
  // Normalize inputs
  const normalizedGame = String(game || 'unknown').toLowerCase();
  const normalizedPlatform = String(platform || 'unknown').toLowerCase();
  const normalizedResolution = String(resolution || 'unknown').toUpperCase(); // Keep resolution uppercase
  const normalizedCodec = String(codec || 'unknown').toLowerCase();
  
  // Return normalized key
  return `${normalizedGame}|${normalizedPlatform}|${normalizedResolution}|${normalizedCodec}`;
};