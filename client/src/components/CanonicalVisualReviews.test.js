import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { CanonicalVisualReviews } from './CanonicalVisualReviews';

afterEach(() => { delete global.fetch; });
test('loads canonical review, requested decision, evidence and an explicitly failing thumbnail', async () => {
  global.fetch = jest.fn().mockResolvedValue({ ok: true, json: async () => ({ items: [{ id: 'review', sceneId: 'scene',
    requiredObjects: ['board'], teachingPurpose: 'Setup', reason: 'Pixel evidence missing', recommendedOperatorAction: 'Compare with official source',
    candidates: [{ assetId: 'image', thumbnailUrl: '/api/projects/p/visual-reviews/assets/image/file', sourceRefs: [{ page: 2 }],
      semanticScore: 0.4, rejectionReasons: ['object-pixel-evidence-missing:board'] }],
  }] }) });
  render(<CanonicalVisualReviews projectId="p" />);
  const image = await screen.findByAltText('Candidat image');
  expect(global.fetch).toHaveBeenCalledTimes(1);
  expect(screen.getByText(/Compare with official source/)).toBeInTheDocument();
  expect(image.getAttribute('src')).toBe('/api/projects/p/visual-reviews/assets/image/file');
  fireEvent.error(image);
  expect(screen.getByRole('alert')).toHaveTextContent('revue visuelle non vérifiable');
});
test('a queue HTTP failure never appears as an empty successfully reviewed queue', async () => {
  global.fetch = jest.fn().mockResolvedValue({ ok: false, status: 404 });
  render(<CanonicalVisualReviews projectId="p" />);
  expect(await screen.findByRole('alert')).toHaveTextContent('404');
});
test('large candidate lists are progressively displayed without losing candidates', async () => {
  global.fetch = jest.fn().mockResolvedValue({ ok: true, json: async () => ({ items: [{ id: 'review',
    candidates: Array.from({ length: 8 }, (_, i) => ({ assetId: `asset-${i}`, thumbnailUrl: `/image/${i}` })) }] }) });
  render(<CanonicalVisualReviews projectId="p" />);
  await screen.findByText(/6 candidats affichés sur 8/);
  expect(screen.getAllByRole('img')).toHaveLength(6);
  fireEvent.click(screen.getByText('Afficher les candidats suivants'));
  expect(screen.getAllByRole('img')).toHaveLength(8);
});
