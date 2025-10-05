export async function parseRulebookStub({ projectId, pdfPath }) {
  return {
    projectId,
    pdfPath,
    status: 'parsed',
    tableOfContents: ['Introduction', 'Setup', 'Gameplay', 'Endgame', 'Scoring'],
    components: [
      { name: 'Main board', quantity: 1 },
      { name: 'Player tokens', quantity: 32 },
      { name: 'Action cards', quantity: 48 },
    ],
    setupSteps: [
      'Lay out the main board in the center of the table.',
      'Shuffle the action cards and place them face-down.',
      'Give each player a set of tokens in their color.',
    ],
    gameplayPhases: [
      'Preparation phase',
      'Action selection phase',
      'Resolution phase',
    ],
    warnings: [],
  };
}