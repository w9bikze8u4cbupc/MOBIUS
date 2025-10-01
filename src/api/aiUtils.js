// Stub AI utilities for CI/staging
export async function explainChunkWithAI(chunk, lang = 'en') {
  return `Explanation for: ${chunk.substring(0, 50)}...`;
}

export async function extractComponentsWithAI(text) {
  return [];
}
