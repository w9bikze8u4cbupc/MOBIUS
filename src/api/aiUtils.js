// AI utility stubs
export const explainChunkWithAI = async (chunk) => {
  return `Mock explanation for: ${chunk.substring(0, 50)}...`;
};

export const extractComponentsWithAI = async (text) => {
  return [
    { name: "Mock Component", quantity: 1, description: "Test component" }
  ];
};