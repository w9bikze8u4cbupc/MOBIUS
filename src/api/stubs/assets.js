export async function processAssetsStub({ projectId }) {
  return {
    projectId,
    theme: {
      primaryColor: '#8B4513',
      secondaryColor: '#C0A080',
      accentColor: '#FFD700',
      typography: {
        heading: 'Playfair Display',
        body: 'Nunito Sans',
      },
    },
    assets: [
      { id: 'board', label: 'Game Board', path: `/uploads/example-board.png` },
      { id: 'action_cards', label: 'Action Cards', path: `/uploads/example-cards.png` },
    ],
  };
}