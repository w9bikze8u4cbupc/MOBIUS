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

test('shows one verified legacy candidate but does not adopt it until the named confirmation is checked', async () => {
  const candidate = {
    id: 'candidate-1', filename: 'Legacy Rulebook.pdf', bytes: 123, sha256: documentSha256, sha256Prefix: documentSha256.slice(0, 12), pageCount: 1,
    source: 'verified_legacy_upload', matchingEvidence: { originalFilename: 'Legacy Rulebook.pdf', projectName: 'Legacy Game', sourceRecordId: 'source-1', linkage: 'project-owned-upload-record' }, eligible: true,
  };
  global.fetch
    .mockImplementationOnce(() => Promise.resolve({ ok: true, json: () => Promise.resolve({ contextualEvidence: { available: false, code: 'CONTEXTUAL_EVIDENCE_UNAVAILABLE' } }) }))
    .mockImplementationOnce(() => Promise.resolve({ ok: true, json: () => Promise.resolve({ projectId: 'legacy', status: 'ready', candidates: [candidate], eligibleCandidate: candidate }) }))
    .mockImplementationOnce(() => Promise.resolve({ ok: true, json: () => Promise.resolve({ contextualEvidence: inventory, adoption: { status: 'adopted' } }) }))
    .mockImplementationOnce(() => Promise.resolve({ ok: true, json: () => Promise.resolve({ contextualEvidence: inventory }) }));
  render(<ContextualEvidenceBrowser isOpen onClose={jest.fn()} onSelect={jest.fn()} projectId="legacy" sceneId="scene" plan={{ primaryIntent: 'rulebook_reference' }} />);

  expect(await screen.findByText('Legacy Rulebook.pdf')).toBeInTheDocument();
  expect(screen.getByText(/SHA-256: aaaaaaaaaaaa/)).toBeInTheDocument();
  const confirm = screen.getByLabelText('Confirm adoption of Legacy Rulebook.pdf for legacy');
  const adopt = screen.getByRole('button', { name: 'Adopt verified legacy source' });
  expect(adopt).toBeDisabled();
  expect(global.fetch).toHaveBeenCalledTimes(2);
  fireEvent.click(confirm);
  fireEvent.click(adopt);
  await screen.findByText('page 1');
  expect(global.fetch.mock.calls[2][0]).toContain('/api/projects/legacy/contextual-evidence/adoption/legacy');
  expect(JSON.parse(global.fetch.mock.calls[2][1].body)).toEqual({ candidateId: 'candidate-1', confirmation: { projectId: 'legacy', filename: 'Legacy Rulebook.pdf' } });
  expect(screen.getByText(/Contextual source adopted successfully/)).toBeInTheDocument();
});

test('verifies a selected local PDF before its separate confirmation request', async () => {
  const candidate = { id: 'local-1', filename: 'Local Rulebook.pdf', bytes: 99, sha256: documentSha256, sha256Prefix: documentSha256.slice(0, 12), pageCount: 1, source: 'local_upload_preview' };
  global.fetch
    .mockImplementationOnce(() => Promise.resolve({ ok: true, json: () => Promise.resolve({ contextualEvidence: { available: false, code: 'CONTEXTUAL_EVIDENCE_UNAVAILABLE' } }) }))
    .mockImplementationOnce(() => Promise.resolve({ ok: true, json: () => Promise.resolve({ projectId: 'legacy', status: 'none', candidates: [], eligibleCandidate: null }) }))
    .mockImplementationOnce(() => Promise.resolve({ ok: true, json: () => Promise.resolve(candidate) }))
    .mockImplementationOnce(() => Promise.resolve({ ok: true, json: () => Promise.resolve({ contextualEvidence: inventory, adoption: { status: 'adopted' } }) }))
    .mockImplementationOnce(() => Promise.resolve({ ok: true, json: () => Promise.resolve({ contextualEvidence: inventory }) }));
  render(<ContextualEvidenceBrowser isOpen onClose={jest.fn()} onSelect={jest.fn()} projectId="legacy" sceneId="scene" plan={{ primaryIntent: 'rulebook_reference' }} />);
  await screen.findByText(/No linked legacy source is eligible/);
  const file = new File(['%PDF-1.7'], 'Local Rulebook.pdf', { type: 'application/pdf' });
  fireEvent.change(screen.getByLabelText('Choose local PDF for legacy'), { target: { files: [file] } });
  expect(await screen.findByText('Local Rulebook.pdf')).toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Adopt selected local PDF' })).toBeDisabled();
  fireEvent.click(screen.getByLabelText('Confirm adoption of Local Rulebook.pdf for legacy'));
  fireEvent.click(screen.getByRole('button', { name: 'Adopt selected local PDF' }));
  await screen.findByText('page 1');
  expect(global.fetch.mock.calls[2][0]).toContain('/adoption/local-preview');
  expect(global.fetch.mock.calls[3][0]).toContain('/adoption/local');
});


test('shows a development-only correlation reference without renderer diagnostics after adoption fails', async () => {
  const candidate = {
    id: 'candidate-failure', filename: 'Failure Rulebook.pdf', bytes: 123, sha256: documentSha256, sha256Prefix: documentSha256.slice(0, 12), pageCount: 1,
    source: 'verified_legacy_upload', matchingEvidence: { originalFilename: 'Failure Rulebook.pdf', projectName: 'Legacy Game', sourceRecordId: 'source-failure', linkage: 'project-owned-upload-record' }, eligible: true,
  };
  const previousNodeEnv = process.env.NODE_ENV;
  process.env.NODE_ENV = 'development';
  global.fetch
    .mockImplementationOnce(() => Promise.resolve({ ok: true, json: () => Promise.resolve({ contextualEvidence: { available: false, code: 'CONTEXTUAL_EVIDENCE_UNAVAILABLE' } }) }))
    .mockImplementationOnce(() => Promise.resolve({ ok: true, json: () => Promise.resolve({ projectId: 'legacy', status: 'ready', candidates: [candidate], eligibleCandidate: candidate }) }))
    .mockImplementationOnce(() => Promise.resolve({ ok: false, status: 422, json: () => Promise.resolve({
      code: 'CONTEXTUAL_ADOPTION_RENDER_FAILED', correlationId: 'contextual-ui-test-123',
      renderSubcode: 'CONTEXTUAL_RENDER_IN_PROCESS_FAILURE', diagnostic: { stderrSummary: 'PRIVATE_RENDER_STDERR' },
    }) }));
  try {
    render(<ContextualEvidenceBrowser isOpen onClose={jest.fn()} onSelect={jest.fn()} projectId="legacy" sceneId="scene" plan={{ primaryIntent: 'rulebook_reference' }} />);
    expect(await screen.findByText('Failure Rulebook.pdf')).toBeInTheDocument();
    fireEvent.click(screen.getByLabelText('Confirm adoption of Failure Rulebook.pdf for legacy'));
    fireEvent.click(screen.getByRole('button', { name: 'Adopt verified legacy source' }));

    const failure = await screen.findByText(/Contextual source adoption failed/);
    expect(failure).toHaveTextContent('CONTEXTUAL_ADOPTION_RENDER_FAILED · reference contextual-ui-test-123');
    expect(failure).not.toHaveTextContent('CONTEXTUAL_RENDER_IN_PROCESS_FAILURE');
    expect(failure).not.toHaveTextContent('PRIVATE_RENDER_STDERR');
  } finally {
    if (previousNodeEnv === undefined) delete process.env.NODE_ENV;
    else process.env.NODE_ENV = previousNodeEnv;
  }
});

test('does not render a stale project inventory after the browser switches projects', async () => {
  let resolveFirst;
  const firstResponse = new Promise((resolve) => { resolveFirst = resolve; });
  const secondInventory = {
    ...inventory,
    projectId: 'new-project',
    pages: [{ ...inventory.pages[0], id: 'page-new', pageNumber: 2, index: 2, documentSha256: 'c'.repeat(64), sha256: 'd'.repeat(64) }],
  };
  global.fetch
    .mockImplementationOnce(() => firstResponse)
    .mockImplementationOnce(() => Promise.resolve({ ok: true, json: () => Promise.resolve({ contextualEvidence: secondInventory }) }));
  const { rerender } = render(<ContextualEvidenceBrowser isOpen onClose={jest.fn()} onSelect={jest.fn()} projectId="old-project" sceneId="scene" plan={{ primaryIntent: 'rulebook_reference' }} />);
  rerender(<ContextualEvidenceBrowser isOpen onClose={jest.fn()} onSelect={jest.fn()} projectId="new-project" sceneId="scene" plan={{ primaryIntent: 'rulebook_reference' }} />);
  expect(await screen.findByText('page 2')).toBeInTheDocument();

  resolveFirst({ ok: true, json: () => Promise.resolve({ contextualEvidence: inventory }) });
  await waitFor(() => expect(screen.getByText('page 2')).toBeInTheDocument());
  expect(screen.queryByText('page 1')).not.toBeInTheDocument();
});