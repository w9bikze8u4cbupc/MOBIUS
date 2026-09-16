'use strict';

// Canonical source graph normalizer for persisted instructional sequences.
// Legacy track records had only `assetId`; their rendered frames retain the
// immutable source identities needed to reconstruct the current sourceAssets
// form during catalog replay.  Keep this in one module: resolver,
// materializer, and replay must agree about the same persisted graph.
function sourceIdentityFromFrames(sequence = {}) {
  const frame = (sequence.frames || []).find((item) => item && (item.sourceImageSha256 || item.sourcePdfSha256)) || {};
  return {
    sourceImageSha256: frame.sourceImageSha256 || null,
    sourcePdfSha256: frame.sourcePdfSha256 || null,
  };
}

function instructionalSequenceSourceAssets(sequence = {}, fallbackAssetId = null) {
  const identity = sourceIdentityFromFrames(sequence);
  const declared = Array.isArray(sequence.sourceAssets)
    ? sequence.sourceAssets.filter((source) => source?.assetId).map((source) => ({
      ...source,
      ...(source.sourceImageSha256 || !identity.sourceImageSha256 ? {} : { sourceImageSha256: identity.sourceImageSha256 }),
      ...(source.sourcePdfSha256 || !identity.sourcePdfSha256 ? {} : { sourcePdfSha256: identity.sourcePdfSha256 }),
    }))
    : [];
  if (declared.length) return declared;
  const assetId = sequence.assetId || fallbackAssetId;
  if (!assetId) return [];
  return [{
    assetId,
    ...(identity.sourceImageSha256 ? { sourceImageSha256: identity.sourceImageSha256 } : {}),
    ...(identity.sourcePdfSha256 ? { sourcePdfSha256: identity.sourcePdfSha256 } : {}),
  }];
}

module.exports = { instructionalSequenceSourceAssets, sourceIdentityFromFrames };
