// Mock AI utilities for containerized API
export async function explainChunkWithAI(chunk) {
  return { explanation: 'Mock AI explanation for: ' + chunk };
}

export async function extractComponentsWithAI(text) {
  return [
    { name: 'Mock Component 1', quantity: 1, selected: true },
    { name: 'Mock Component 2', quantity: 2, selected: true }
  ];
}