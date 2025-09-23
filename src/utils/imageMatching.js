/**
 * src/utils/imageMatching.js
 *
 * Matching utilities:
 *  - computeImageHash(imagePath) => pHash (hex string)
 *  - hammingDistance(hashA, hashB)
 *  - matchImageToLibrary(imageMeta, libraryItems, options) => match report
 */

const fs = require('fs');
const imageHash = require('image-hash');
const fetch = require('node-fetch');

function computeImageHash(imgPath, bits = 16) {
  return new Promise((resolve, reject) => {
    imageHash(imgPath, bits, 'hex', (err, data) => {
      if (err) return reject(err);
      resolve(String(data).toLowerCase());
    });
  });
}

function hammingDistanceHex(hexA, hexB) {
  if (!hexA || !hexB) return Number.MAX_SAFE_INTEGER;
  const a = Buffer.from(hexA, 'hex');
  const b = Buffer.from(hexB, 'hex');
  const len = Math.max(a.length, b.length);
  let dist = 0;
  for (let i = 0; i < len; i++) {
    const av = a[i] || 0;
    const bv = b[i] || 0;
    let x = av ^ bv;
    while (x) { dist += x & 1; x >>= 1; }
  }
  return dist;
}

function phashSimilarity(hexA, hexB) {
  const dist = hammingDistanceHex(hexA, hexB);
  const maxBits = (Math.max(hexA.length, hexB.length) / 2) * 8;
  if (!maxBits || !isFinite(maxBits)) return 0;
  return 1 - dist / maxBits;
}

async function getEmbeddingLocal(endpointUrl, imagePath) {
  if (!endpointUrl) throw new Error('No embedding endpoint configured');
  const data = fs.readFileSync(imagePath);
  const base64 = data.toString('base64');
  const res = await fetch(endpointUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
    body: JSON.stringify({ b64: base64 })
  });
  if (!res.ok) {
    throw new Error(`Embedding endpoint returned ${res.status}: ${await res.text()}`);
  }
  const json = await res.json();
  return json.embedding;
}

function cosineSimilarity(a, b) {
  if (!Array.isArray(a) || !Array.isArray(b) || a.length !== b.length) return 0;
  let dot = 0, na = 0, nb = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    na += a[i] * a[i];
    nb += b[i] * b[i];
  }
  if (na === 0 || nb === 0) return 0;
  return dot / (Math.sqrt(na) * Math.sqrt(nb));
}

async function matchImageToLibrary(imageMeta, libraryItems = [], opts = {}) {
  const cfg = Object.assign({
    autoAssignThreshold: 0.9,
    useEmbedding: false,
    embeddingEndpoint: process.env.LOCAL_EMBEDDING_URL || null,
    phashWeight: 0.6,
    embedWeight: 0.4,
    topK: 5
  }, opts || {});

  let imgPhash = imageMeta.phash;
  if (!imgPhash) {
    imgPhash = await computeImageHash(imageMeta.masterPath);
  }

  let imgEmbedding = null;
  if (cfg.useEmbedding && cfg.embeddingEndpoint) {
    try {
      imgEmbedding = await getEmbeddingLocal(cfg.embeddingEndpoint, imageMeta.masterPath);
    } catch (err) {
      console.warn('Embedding fetch failed:', err.message);
      imgEmbedding = null;
    }
  }

  const candidates = [];
  for (const lib of libraryItems) {
    let phSim = 0;
    if (lib.phash) phSim = phashSimilarity(imgPhash, lib.phash);
    let embSim = 0;
    if (cfg.useEmbedding && imgEmbedding && lib.embedding) {
      embSim = cosineSimilarity(imgEmbedding, lib.embedding);
    }
    const totalWeight = (lib.phash ? cfg.phashWeight : 0) + ((cfg.useEmbedding && lib.embedding) ? cfg.embedWeight : 0);
    let combined = 0;
    if (totalWeight > 0) {
      combined = ((phSim * (lib.phash ? cfg.phashWeight : 0)) + (embSim * ((cfg.useEmbedding && lib.embedding) ? cfg.embedWeight : 0))) / totalWeight;
    } else {
      combined = phSim;
    }
    candidates.push({
      id: lib.id,
      title: lib.title,
      phash: lib.phash || null,
      embedding_present: !!lib.embedding,
      scores: { phash: phSim, embedding: embSim },
      combined_score: combined
    });
  }

  candidates.sort((a, b) => b.combined_score - a.combined_score);
  const top = candidates.slice(0, cfg.topK);
  const best = top[0] || null;
  let chosen = null;
  let confidence = 0;
  if (best) {
    chosen = (best.combined_score >= cfg.autoAssignThreshold) ? best.id : null;
    confidence = best.combined_score;
  }

  return {
    image: {
      filename: imageMeta.filename,
      masterPath: imageMeta.masterPath
    },
    chosen,
    confidence,
    candidates: top
  };
}

module.exports = {
  computeImageHash,
  hammingDistanceHex,
  phashSimilarity,
  matchImageToLibrary,
  getEmbeddingLocal,
  cosineSimilarity
};