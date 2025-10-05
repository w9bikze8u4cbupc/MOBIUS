export async function fetchMetadataStub({ bggUrl }) {
  return {
    source: 'stub',
    bggUrl,
    title: 'Example Game Title',
    year: 2023,
    designers: ['Jane Doe', 'John Smith'],
    publisher: 'Fictional Games Ltd.',
    minPlayers: 2,
    maxPlayers: 4,
    minPlaytime: 45,
    maxPlaytime: 90,
    ageRecommendation: '12+',
    categories: ['Strategy', 'Fantasy'],
    mechanics: ['Worker Placement', 'Set Collection'],
    boxArtUrl: 'https://via.placeholder.com/600x800.png?text=Box+Art',
    weight: 2.7,
  };
}