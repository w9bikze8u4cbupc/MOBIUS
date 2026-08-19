import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { canBrowseContextualEvidence, contextualAssetThumbnailUrl, ContextualEvidenceBrowser } from './ContextualEvidenceBrowser';

const documentSha256 = 'a'.repeat(64);
const pageSha256 = 'b'.repeat(64);
const pageRasterSha256 = pageSha256;
const inventory = {
  available: true,
  projectId: 'p',
  source: { sha256: documentSha256, pageCount: 1 },
  renderProfile: { id: 'pdf-to-img-review-144dpi-png-v1' },
  pages: [{
    id: 'page-1', kind: 'contextual_page', index: 1, pageNumber: 1, sha256: pageSha256,
    documentSha256, renderProfile: 'pdf-to-img-review-144dpi-png-v1', width: 100, height: 200,
    url: '/api/projects/p/contextual-assets/page-1/file?variant=full',
    thumbnailUrl: '/api/projects/p/contextual-assets/page-1/file?variant=thumbnail', crops: [],
  }],
};

beforeEach(() => { global.fetch = jest.fn(() => Promise.resolve({ ok: true, json: () => Promise.resolve({ contextualEvidence: inventory }) })); });
afterEach(() => { jest.restoreAllMocks(); });

test('shows only contextual-capable intents and selects a verified canonical rulebook page', async () => {
  const onSelect = jest.fn();
  render(<ContextualEvidenceBrowser isOpen onClose={jest.fn()} onSelect={onSelect} projectId="project 1" sceneId="scene-overview" plan={{ primaryIntent: 'game_overview' }} />);
  expect(await screen.findByText('page 1')).toBeInTheDocument();
  expect(screen.getByText(/profile pdf-to-img-review-144dpi-png-v1/)).toBeInTheDocument();
  expect(screen.getByText(`hash ${pageSha256.slice(0, 12)}`)).toBeInTheDocument();
  expect(screen.getByAltText('Full rulebook page 1')).toHaveAttribute('src', 'http://localhost:5001/api/projects/project%201/contextual-assets/page-1/file?variant=full');
  fireEvent.click(screen.getByRole('button', { name: 'Select page' }));
  expect(onSelect).toHaveBeenCalledWith(expect.objectContaining({ id: 'page-1', kind: 'contextual_page' }), expect.objectContaining({
    role: 'rulebook_reference', pageId: 'page-1', documentSha256, pageRasterSha256, renderProfile: inventory.renderProfile.id,
  }));
  expect(canBrowseContextualEvidence('component_closeup')).toBe(false);
  expect(canBrowseContextualEvidence('card_action')).toBe(false);
  expect(canBrowseContextualEvidence('token_action')).toBe(false);
  expect(contextualAssetThumbnailUrl({ kind: 'contextual_crop', url: '/canonical/crop.png' })).toBe('/canonical/crop.png');
});

test('requires explicit confirmation for board setup and sends that confirmation with crop coordinates', async () => {
  const onSelect = jest.fn();
  global.fetch
    .mockImplementationOnce(() => Promise.resolve({ ok: true, json: () => Promise.resolve({ contextualEvidence: inventory }) }))
    .mockImplementationOnce(() => Promise.resolve({ ok: true, json: () => Promise.resolve({
      id: 'crop-1', kind: 'contextual_crop', source: 'rulebook_context', parentPageAssetId: 'page-1', documentSha256,
      pageRasterSha256, renderProfile: inventory.renderProfile.id, coordinates: { x: 0, y: 0, width: 40, height: 40 },
      url: '/api/projects/p/contextual-assets/crop-1/file?variant=full', thumbnailUrl: '/api/projects/p/contextual-assets/crop-1/file?variant=thumbnail',
    }) }));
  render(<ContextualEvidenceBrowser isOpen onClose={jest.fn()} onSelect={onSelect} projectId="project" sceneId="scene-setup" plan={{ primaryIntent: 'board_setup' }} />);
  await screen.findByText('page 1');
  expect(screen.getByRole('button', { name: 'Select page' })).toBeDisabled();
  fireEvent.click(screen.getByLabelText('Confirm contextual board setup evidence for scene-setup'));
  fireEvent.change(screen.getByLabelText('Crop x for scene-setup'), { target: { value: 90 } });
  fireEvent.change(screen.getByLabelText('Crop width for scene-setup'), { target: { value: 20 } });
  fireEvent.click(screen.getByRole('button', { name: 'Create and select crop' }));
  expect(screen.getByText('Crop must stay within page bounds.')).toBeInTheDocument();
  expect(global.fetch).toHaveBeenCalledTimes(1);
  fireEvent.change(screen.getByLabelText('Crop x for scene-setup'), { target: { value: 0 } });
  fireEvent.change(screen.getByLabelText('Crop width for scene-setup'), { target: { value: 40 } });
  fireEvent.click(screen.getByRole('button', { name: 'Create and select crop' }));
  await waitFor(() => expect(onSelect).toHaveBeenCalledWith(expect.objectContaining({ id: 'crop-1' }), expect.objectContaining({ role: 'board_setup_context', confirmed: true })));
  expect(JSON.parse(global.fetch.mock.calls[1][1].body)).toMatchObject({ contextualConfirmation: true });
});

test('shows the explicit legacy unavailable state without page selection', async () => {
  global.fetch.mockImplementationOnce(() => Promise.resolve({ ok: true, json: () => Promise.resolve({ contextualEvidence: { available: false, code: 'CONTEXTUAL_EVIDENCE_UNAVAILABLE' } }) }));
  render(<ContextualEvidenceBrowser isOpen onClose={jest.fn()} onSelect={jest.fn()} projectId="legacy" sceneId="scene" plan={{ primaryIntent: 'rulebook_reference' }} />);
  await waitFor(() => expect(screen.getByText(/Legacy project: contextual rulebook evidence is unavailable/)).toBeInTheDocument());
  expect(screen.queryByRole('button', { name: 'Select page' })).not.toBeInTheDocument();
});
