import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
jest.mock('axios', () => ({
  __esModule: true,
  default: {
    get: jest.fn(),
    post: jest.fn(),
  },
}));

import axios from 'axios';
import { getDocument } from 'pdfjs-dist';
import App, { buildRemotionScenes, createProjectIdFromFilename, hasRenderVisualEvidence, hasValidComponentInventory, isRenderVisualPlanComplete, extractPdfPageText } from './App';
import { TextEncoder } from 'util';
import { webcrypto } from 'crypto';
import {
  buildDeterministicIngestionPages,
  getIngestionDocumentId,
  loadLatestProjectContext,
  saveProjectContext,
} from './projectContext';

Object.defineProperty(globalThis, 'TextEncoder', { configurable: true, value: TextEncoder });
Object.defineProperty(globalThis, 'crypto', { configurable: true, value: webcrypto });

jest.mock('pdfjs-dist', () => ({
  GlobalWorkerOptions: {},
  getDocument: jest.fn(),
}));

jest.mock('./GenesisFeedbackPanel', () => ({ GenesisFeedbackPanel: () => null }));
jest.mock('./GenesisHealthPanel', () => ({ GenesisHealthPanel: () => null }));
jest.mock('./GenesisArtifactsPanel', () => ({ GenesisArtifactsPanel: () => null }));
jest.mock('./GenesisGoalsEditor', () => ({ GenesisGoalsEditor: () => null }));
jest.mock('./GenesisAutoOptimizeButton', () => ({ GenesisAutoOptimizeButton: () => null }));
jest.mock('./GenesisCampaignPanel', () => ({ GenesisCampaignPanel: () => null }));
jest.mock('./GenesisInspector', () => ({ GenesisInspector: () => null }));
jest.mock('./GenesisQaReportButton', () => ({ GenesisQaReportButton: () => null }));
jest.mock('./components/PipelineStepper', () => ({ PipelineStepper: () => null }));
jest.mock('./components/steps/MetadataInputStep', () => ({ MetadataInputStep: () => null }));
jest.mock('./components/steps/IngestionReviewStep', () => ({ IngestionReviewStep: () => null }));
jest.mock('./components/steps/ImagesStep', () => ({
  ImagesStep: ({ onImagesUpdated }) => (
    <button type="button" onClick={() => onImagesUpdated({ images: [], componentImages: {} })}>
      Apply ordinary image update
    </button>
  ),
}));

jest.mock('./components/steps/ScriptStep', () => ({
  ScriptStep: ({
    onSummarize,
    scriptInputReadiness,
    scriptProvenance,
    summary,
    editedSummary,
    onEdit,
    generationStatus,
    summaryWarning,
  }) => (
    <div>
      <div data-testid="script-readiness">{scriptInputReadiness?.message || 'ready'}</div>
      <div data-testid="script-provenance">{scriptProvenance || 'none'}</div>
      <div data-testid="editable-script">{editedSummary}</div>
      <textarea aria-label="Narration editor" value={editedSummary} onChange={onEdit} />
      <button onClick={onSummarize} disabled={!scriptInputReadiness?.ready}>Generate optional AI summary</button>
      {scriptProvenance === 'generated_source_complete' && generationStatus?.sourceComplete && summary
        ? <div>Script generated successfully</div>
        : null}
      {scriptProvenance === 'legacy_invalid_fallback'
        ? <div>A previous incomplete fallback was discarded. Generate a source-complete script to continue.</div>
        : null}
      {summaryWarning && scriptProvenance !== 'legacy_invalid_fallback' ? <div>{summaryWarning}</div> : null}
    </div>
  ),
}));
jest.mock('./components/steps/StoryboardStep', () => ({
  StoryboardStep: ({ onGenerateStoryboard, storyboardError, images = [], storyboardManifest }) => (
    <>
      <div data-testid="storyboard-image-count">{images.length}</div>
      <div data-testid="storyboard-review-state">{storyboardManifest?.scenes?.[0]?.visualPlan?.reviewState || 'none'}</div>
      <div data-testid="storyboard-candidate-count">{storyboardManifest?.scenes?.[0]?.visualPlan?.assetCandidates?.length || 0}</div>
      <button onClick={onGenerateStoryboard}>Generate storyboard</button>
      {storyboardError && <div>{storyboardError}</div>}
    </>
  ),
}));
jest.mock('./components/steps/VoiceStep', () => ({
  VoiceStep: ({ onPlayAudio }) => <button type="button" onClick={() => onPlayAudio('Preview narration', 0)}>Generate voice preview</button>,
}));
jest.mock('./components/steps/RenderExportStep', () => ({ RenderExportStep: () => null }));

function durableSourceResponse(url) {
  const match = /\/api\/projects\/([^/]+)\/source-pdf$/.exec(String(url));
  if (!match) return null;
  const projectId = decodeURIComponent(match[1]);
  return {
    data: {
      sourcePdf: {
        sourceId: 'source-aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
        documentId: projectId,
        documentFingerprint: 'document-bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb',
        filename: 'Abyss.pdf',
        sha256: 'c'.repeat(64), bytes: 42, pageCount: 1,
        provenance: 'direct_project_upload', status: 'pending_contextual_render',
      },
    },
  };
}

beforeEach(() => {
  window.localStorage.clear();
  jest.clearAllMocks();
  axios.get.mockResolvedValue({ data: { images: [], componentImages: {}, componentImageLinkDetails: {} } });
  axios.post.mockImplementation((url) => Promise.resolve(durableSourceResponse(url) || { data: {} }));
});

test('retains approved component-link provenance when an image mutation omits it', async () => {
  saveProjectContext(window.localStorage, {
    projectId: 'abyss-image-provenance',
    gameName: 'Abyss',
    language: 'english',
    images: [{ id: 'monster-token' }],
    componentImageLinks: { monsters: ['monster-token'] },
    componentImageLinkDetails: { monsters: { 'monster-token': { origin: 'manual' } } },
    activeStepId: 'images',
  });
  axios.get.mockResolvedValue({ data: {
    images: [{ id: 'monster-token' }],
    componentImages: { monsters: ['monster-token'] },
    componentImageLinkDetails: { monsters: { 'monster-token': { origin: 'manual' } } },
  } });
  expect(loadLatestProjectContext(window.localStorage).componentImageLinkDetails).toEqual({
    monsters: { 'monster-token': { origin: 'manual' } },
  });

  render(<App />);
  const updateButton = await screen.findByRole('button', { name: 'Apply ordinary image update' });
  await waitFor(() => {
    expect(loadLatestProjectContext(window.localStorage).componentImageLinkDetails).toEqual({
      monsters: { 'monster-token': { origin: 'manual' } },
    });
  });
  fireEvent.click(updateButton);

  await waitFor(() => {
    expect(loadLatestProjectContext(window.localStorage).componentImageLinkDetails).toEqual({
      monsters: { 'monster-token': { origin: 'manual' } },
    });
  });
});

test('filename helper creates a safe unique ID', () => {
  expect(createProjectIdFromFilename('Abyss final.pdf', 'test123')).toBe('abyss-final-test123');
});

test('PDF upload creates a project ID without calling game-name extraction', async () => {
  getDocument.mockReturnValue({
    promise: Promise.resolve({
      numPages: 1,
      getPage: () => Promise.resolve({
        getTextContent: () => Promise.resolve({ items: [{ str: 'Rulebook text' }] }),
      }),
    }),
  });
  const { container } = render(<App />);
  const pdfFile = new File(['pdf contents'], 'Abyss.pdf', { type: 'application/pdf' });
  Object.defineProperty(pdfFile, 'arrayBuffer', { value: () => Promise.resolve(new ArrayBuffer(0)) });
  fireEvent.change(container.querySelector('input[type="file"]'), { target: { files: [pdfFile] } });

  await waitFor(() => {
    expect(screen.getByPlaceholderText('Auto-generated from uploaded PDF filename')).not.toHaveValue('');
  });

  expect(screen.getByPlaceholderText('Auto-generated from uploaded PDF filename').value).toMatch(/^abyss-/);
});

test('PDF upload keeps the filename-derived game name and project ID without automatic AI or BGG calls', async () => {
  getDocument.mockReturnValue({
    promise: Promise.resolve({
      numPages: 1,
      getPage: () => Promise.resolve({
        getTextContent: () => Promise.resolve({ items: [{ str: 'Rulebook text' }] }),
      }),
    }),
  });

  const { container } = render(<App />);
  const pdfFile = new File(['pdf contents'], 'Abyss.pdf', { type: 'application/pdf' });
  Object.defineProperty(pdfFile, 'arrayBuffer', { value: () => Promise.resolve(new ArrayBuffer(0)) });
  fireEvent.change(container.querySelector('input[type="file"]'), { target: { files: [pdfFile] } });

  await waitFor(() => {
    expect(screen.getByPlaceholderText('Extracted from PDF')).toHaveValue('Abyss');
  });

  expect(screen.getByPlaceholderText('Auto-generated from uploaded PDF filename').value).toMatch(/^abyss-/);
  expect(axios.post).toHaveBeenCalledWith(
    expect.stringContaining('/source-pdf'), expect.any(FormData), expect.objectContaining({ headers: { 'Content-Type': 'multipart/form-data' } }),
  );
  expect(axios.get).not.toHaveBeenCalled();
});

test('optional AI metadata is requested only after the operator clicks its explicit button', async () => {
  getDocument.mockReturnValue({
    promise: Promise.resolve({
      numPages: 1,
      getPage: () => Promise.resolve({
        getTextContent: () => Promise.resolve({ items: [{ str: 'Rulebook text' }] }),
      }),
    }),
  });
  axios.get.mockResolvedValue({ data: { ready: true, message: 'AI model is ready.' } });
  axios.post.mockImplementation((url) => Promise.resolve(
    durableSourceResponse(url) || { data: { gameName: 'Abyss' } },
  ));

  const { container } = render(<App />);
  const pdfFile = new File(['pdf contents'], 'ABYSS.pdf', { type: 'application/pdf' });
  Object.defineProperty(pdfFile, 'arrayBuffer', { value: () => Promise.resolve(new ArrayBuffer(0)) });
  fireEvent.change(container.querySelector('input[type="file"]'), { target: { files: [pdfFile] } });

  await waitFor(() => expect(screen.getByPlaceholderText('Extracted from PDF')).toHaveValue('Abyss'));
  expect(axios.post).toHaveBeenCalledWith(expect.stringContaining('/source-pdf'), expect.any(FormData), expect.any(Object));

  fireEvent.click(screen.getByRole('button', { name: /Extract optional AI metadata/i }));

  await waitFor(() => {
    expect(axios.post).toHaveBeenCalledWith(
      expect.stringContaining('/api/extract-game-name'),
      expect.objectContaining({ text: expect.stringContaining('Rulebook text') }),
    );
  });
});

test('inventory confirmation rejects blank and sentence-shaped pseudo-components', () => {
  expect(hasValidComponentInventory([{ id: 'blank', name: '   ' }])).toBe(false);
  expect(hasValidComponentInventory([{ id: 'page', name: 'This is a whole page of rulebook text with no component boundary.' }])).toBe(false);
  expect(hasValidComponentInventory([{ id: 'card', name: 'Ocean cards' }])).toBe(true);
});

test('PDF text extraction preserves positioned text lines for inventory parsing', () => {
  expect(extractPdfPageText([
    { str: 'Components', transform: [1, 0, 0, 1, 20, 100] },
    { str: '7 Cards', transform: [1, 0, 0, 1, 20, 80] },
    { str: 'Setup', transform: [1, 0, 0, 1, 20, 60] },
  ])).toBe('Components\n7 Cards\nSetup');
});

test('optional AI metadata preflight failure prevents its rulebook POST', async () => {
  getDocument.mockReturnValue({
    promise: Promise.resolve({
      numPages: 1,
      getPage: () => Promise.resolve({
        getTextContent: () => Promise.resolve({ items: [{ str: 'Rulebook text' }] }),
      }),
    }),
  });
  axios.get.mockResolvedValue({
    data: { ready: false, message: 'OPENAI_MODEL is not accessible to this API key.' },
  });

  const { container } = render(<App />);
  const pdfFile = new File(['pdf contents'], 'ABYSS.pdf', { type: 'application/pdf' });
  Object.defineProperty(pdfFile, 'arrayBuffer', { value: () => Promise.resolve(new ArrayBuffer(0)) });
  fireEvent.change(container.querySelector('input[type="file"]'), { target: { files: [pdfFile] } });

  await waitFor(() => expect(screen.getByPlaceholderText('Extracted from PDF')).toHaveValue('Abyss'));
  fireEvent.click(screen.getByRole('button', { name: /Extract optional AI metadata/i }));

  await waitFor(() => expect(axios.get).toHaveBeenCalledWith(expect.stringContaining('/api/ai/status?check=1')));
  expect(axios.post.mock.calls).toEqual([
    expect.arrayContaining([expect.stringContaining('/source-pdf')]),
  ]);
  await waitFor(() => {
    expect(screen.getByText(/OPENAI_MODEL is not accessible/i)).toBeInTheDocument();
  });
});


test('hydrates canonical Abyss context and sends it unchanged to the summary API', async () => {
  const rulebookText = 'A'.repeat(20916);
  const components = Array.from({ length: 9 }, (_, index) => ({
    id: `component-${index + 1}`,
    name: `Abyss component ${index + 1}`,
    category: 'card',
  }));
  const metadata = { theme: 'undersea strategy', publisher: 'Bombyx' };
  saveProjectContext(window.localStorage, {
    version: 1,
    projectId: 'abyss-approved-project',
    gameName: 'Abyss',
    language: 'english',
    rulebookText,
    components,
    metadata,
    images: [{ id: 'image-1' }],
    componentImageLinks: { 'component-1': ['image-1'] },
    script: 'Operator-edited script',
    storyboardManifest: { version: '1.2.0', scenes: [{ id: 'old-scene', spokenText: 'Old storyboard narration.', durationMs: 2000, transition: 'fade-in', sources: [{ section: 1 }] }] },
    activeStepId: 'script',
    completedStepIds: ['project', 'metadata', 'ingestion', 'images', 'storyboard'],
  });
  axios.get.mockResolvedValue({ data: { ready: true, message: 'AI model is ready.' } });
  axios.post.mockResolvedValue({
    data: {
      generated: true,
      summary: 'Generated tutorial script',
      scriptPackage: { sections: [{ id: 'section-01', order: 1, title: 'Introduction', spokenText: 'Generated tutorial script', visualDirections: [], sources: [{ section: 1, startOffset: 0, endOffset: rulebookText.length }] }] },
      metadata,
      components,
      sourceCompleteness: { complete: true },
      generationStatus: {
        sourceChars: rulebookText.length,
        chunkCount: 4,
        completedChunks: 4,
        sourceComplete: true,
        finalScriptLength: 25,
      },
    },
  });

  render(<App />);

  const generate = await screen.findByRole('button', { name: 'Generate optional AI summary' });
  await waitFor(() => expect(generate).toBeEnabled());
  fireEvent.click(generate);

  await waitFor(() => {
    expect(axios.post).toHaveBeenCalledWith(
      expect.stringContaining('/summarize'),
      {
        projectId: 'abyss-approved-project',
        gameName: 'Abyss',
        language: 'english',
        rulebookText,
        components,
        metadata,
      },
    );
  });
  expect(screen.getByText('Script generated successfully')).toBeInTheDocument();
  await waitFor(() => {
    const persisted = loadLatestProjectContext(window.localStorage);
    expect(persisted.storyboardManifest).toBeNull();
    expect(persisted.completedStepIds).not.toContain('storyboard');
  });
});


test('does not replace an editable script or show success for an ungenerated fallback response', async () => {
  const existingScript = 'Operator-approved script must remain editable.';
  saveProjectContext(window.localStorage, {
    projectId: 'abyss-approved-project',
    gameName: 'Abyss',
    language: 'english',
    rulebookText: 'Approved Abyss rulebook text',
    components: [{ id: 'cards', name: 'Cards' }],
    metadata: { theme: 'undersea strategy' },
    script: existingScript,
    activeStepId: 'script',
  });
  axios.get.mockResolvedValue({ data: { ready: true, message: 'AI model is ready.' } });
  axios.post.mockResolvedValue({
    data: {
      summary: 'Cannot create a tutorial because rulebook text, game name, and components are empty.',
    },
  });

  render(<App />);

  const generate = await screen.findByRole('button', { name: 'Generate optional AI summary' });
  await waitFor(() => expect(generate).toBeEnabled());
  await waitFor(() => expect(screen.getByTestId('editable-script')).toHaveTextContent(existingScript));
  fireEvent.click(generate);

  await waitFor(() => expect(axios.post).toHaveBeenCalledWith(expect.stringContaining('/summarize'), expect.any(Object)));
  expect(screen.getByTestId('editable-script')).toHaveTextContent(existingScript);
  expect(screen.queryByText('Script generated successfully')).not.toBeInTheDocument();
});


test('does not replace an editable script when generated output lacks source completeness', async () => {
  const existingScript = 'Keep this operator-approved script.';
  saveProjectContext(window.localStorage, {
    projectId: 'abyss-incomplete-source',
    gameName: 'Abyss',
    language: 'english',
    rulebookText: 'Approved rulebook text',
    components: [{ id: 'cards', name: 'Cards' }],
    metadata: {},
    script: existingScript,
    activeStepId: 'script',
  });
  axios.get.mockResolvedValue({ data: { ready: true, message: 'AI model is ready.' } });
  axios.post.mockResolvedValue({
    data: {
      generated: true,
      summary: 'Fallback-looking script that must not replace the operator text.',
      sourceCompleteness: { complete: false },
      generationStatus: { sourceChars: 20914, chunkCount: 4, completedChunks: 2, sourceComplete: false, finalScriptLength: 0 },
    },
  });

  render(<App />);
  const generate = await screen.findByRole('button', { name: 'Generate optional AI summary' });
  await waitFor(() => expect(generate).toBeEnabled());
  await waitFor(() => expect(screen.getByTestId('editable-script')).toHaveTextContent(existingScript));
  fireEvent.click(generate);

  await waitFor(() => expect(axios.post).toHaveBeenCalledWith(expect.stringContaining('/summarize'), expect.any(Object)));
  expect(screen.getByTestId('editable-script')).toHaveTextContent(existingScript);
  expect(screen.queryByText('Script generated successfully')).not.toBeInTheDocument();
});


test('a failed generation with no trusted script clears success state and disables script confirmation', async () => {
  saveProjectContext(window.localStorage, {
    projectId: 'abyss-no-script',
    gameName: 'Abyss',
    language: 'english',
    rulebookText: 'Approved Abyss rulebook text',
    components: [{ id: 'cards', name: 'Cards' }],
    activeStepId: 'script',
  });
  axios.get.mockResolvedValue({ data: { ready: true, message: 'AI model is ready.' } });
  axios.post.mockRejectedValue({
    response: {
      data: {
        error: 'Script generation stopped: rulebook section 1 produced no usable summary. No script was saved.',
        generationStatus: { sourceChars: 20914, chunkCount: 4, completedChunks: 0, sourceComplete: false, finalScriptLength: 0 },
      },
    },
  });

  render(<App />);
  const generate = await screen.findByRole('button', { name: 'Generate optional AI summary' });
  await waitFor(() => expect(generate).toBeEnabled());
  fireEvent.click(generate);

  await waitFor(() => expect(screen.getByText(/rulebook section 1 produced no usable summary/i)).toBeInTheDocument());
  expect(screen.queryByText('Script generated successfully')).not.toBeInTheDocument();
  expect(screen.getByTestId('editable-script')).toHaveTextContent('');
  expect(screen.getByTestId('script-provenance')).toHaveTextContent('generation_failed');
  expect(screen.getByRole('button', { name: /Confirm Script & Continue/i })).toBeDisabled();
});

test('discards a narrow known legacy fallback instead of preserving it as editable script', async () => {
  saveProjectContext(window.localStorage, {
    version: 1,
    projectId: 'abyss-legacy-fallback',
    gameName: 'Abyss',
    language: 'english',
    rulebookText: 'Approved Abyss rulebook text',
    components: [{ id: 'cards', name: 'Cards' }],
    script: 'Rulebook Text section is empty. I can’t produce a complete, rules-accurate tutorial.',
    generatedScript: true,
    activeStepId: 'script',
    completedStepIds: ['project', 'script'],
  });
  axios.get.mockResolvedValue({ data: { ready: true, message: 'AI model is ready.' } });

  render(<App />);

  await waitFor(() => expect(screen.getByText('A previous incomplete fallback was discarded. Generate a source-complete script to continue.')).toBeInTheDocument());
  expect(screen.getByTestId('editable-script')).toHaveTextContent('');
  expect(screen.getByTestId('script-provenance')).toHaveTextContent('legacy_invalid_fallback');
  expect(screen.getByRole('button', { name: /Confirm Script & Continue/i })).toBeDisabled();
});

test('retains an operator-authored manual script after a later generation failure', async () => {
  const manualScript = 'Operator-authored tutorial remains the approved script.';
  saveProjectContext(window.localStorage, {
    projectId: 'abyss-manual-retained',
    gameName: 'Abyss',
    language: 'english',
    rulebookText: 'Approved Abyss rulebook text',
    components: [{ id: 'cards', name: 'Cards' }],
    script: manualScript,
    generatedScript: false,
    activeStepId: 'script',
  });
  axios.get.mockResolvedValue({ data: { ready: true, message: 'AI model is ready.' } });
  axios.post.mockRejectedValue({ response: { data: { error: 'Provider returned empty content.' } } });

  render(<App />);
  const generate = await screen.findByRole('button', { name: 'Generate optional AI summary' });
  await waitFor(() => expect(generate).toBeEnabled());
  fireEvent.click(generate);

  await waitFor(() => expect(screen.getByText('Provider returned empty content.')).toBeInTheDocument());
  expect(screen.getByTestId('editable-script')).toHaveTextContent(manualScript);
  expect(screen.getByTestId('script-provenance')).toHaveTextContent('manual');
  expect(screen.getByRole('button', { name: /Confirm Script & Continue/i })).toBeEnabled();
});

test('clears stale success while retaining a previously source-complete generated script after failure', async () => {
  const generatedScript = 'Previously source-complete generated tutorial.';
  saveProjectContext(window.localStorage, {
    version: 2,
    projectId: 'abyss-generated-retained',
    gameName: 'Abyss',
    language: 'english',
    rulebookText: 'Approved Abyss rulebook text',
    components: [{ id: 'cards', name: 'Cards' }],
    script: generatedScript,
    scriptPackage: { sections: [{ id: 'section-01', order: 1, title: 'Introduction', spokenText: generatedScript, visualDirections: [], sources: [{ section: 1, startOffset: 0, endOffset: 100 }] }] },
    scriptProvenance: 'generated_source_complete',
    generatedScript: true,
    activeStepId: 'script',
  });
  axios.get.mockResolvedValue({ data: { ready: true, message: 'AI model is ready.' } });
  axios.post.mockRejectedValue({ response: { data: { error: 'Provider returned empty content.' } } });

  render(<App />);
  const generate = await screen.findByRole('button', { name: 'Generate optional AI summary' });
  await waitFor(() => expect(generate).toBeEnabled());
  fireEvent.click(generate);

  await waitFor(() => expect(screen.getByText('Provider returned empty content.')).toBeInTheDocument());
  expect(screen.queryByText('Script generated successfully')).not.toBeInTheDocument();
  expect(screen.getByTestId('editable-script')).toHaveTextContent(generatedScript);
  expect(screen.getByTestId('script-provenance')).toHaveTextContent('generated_source_complete');
});


test('buildRemotionScenes carries canonical narration and non-spoken visual directions into render scenes', () => {
  const scenes = buildRemotionScenes({
    script: 'ignored legacy script', gameName: 'Abyss',
    images: [{ id: 'board-image', fileKey: 'data/board.png' }, { id: 'cards-image', fileKey: 'data/cards.png' }],
    componentImageLinks: { board: ['board-image'], cards: ['cards-image'] },
    scriptPackage: { sections: [{
      title: 'Setup', spokenText: 'Place the board.',
      visualDirections: [{ instruction: 'Overhead board view', onScreenText: 'Setup board', componentRefs: ['board'] }],
      sources: [{ section: 1, startOffset: 0, endOffset: 100 }],
    }] },
  });
  expect(scenes).toHaveLength(1);
  expect(scenes[0]).toMatchObject({
    sectionTitle: 'Setup', narrationText: 'Place the board.',
    visualDirections: [{ instruction: 'Overhead board view', onScreenText: 'Setup board', componentRefs: ['board'] }],
    sources: [{ section: 1, startOffset: 0, endOffset: 100 }], componentRefs: ['board'],
    visualOverlayText: 'Setup board', imageUrls: ['data/board.png'], visualPlan: null,
  });
});


test('editing package-backed narration does not reset the textarea', async () => {
  saveProjectContext(window.localStorage, {
    version: 3, projectId: 'package-edit', gameName: 'Abyss', language: 'english', rulebookText: 'Rulebook text',
    components: [{ id: 'cards', name: 'Cards' }], script: '## Setup\n\nPlace the board.', scriptProvenance: 'manual',
    scriptPackage: { sections: [{ id: 'section-01', order: 1, title: 'Setup', spokenText: 'Place the board.', visualDirections: [{ instruction: 'Show board' }], sources: [{ section: 1, startOffset: 0, endOffset: 100 }] }] },
    activeStepId: 'script',
  });
  axios.get.mockResolvedValue({ data: { ready: true, message: 'AI model is ready.' } });
  render(<App />);
  const editor = await screen.findByLabelText('Narration editor');
  fireEvent.change(editor, { target: { value: '## Setup\n\nDeal two cards.' } });
  await waitFor(() => expect(editor).toHaveValue('## Setup\n\nDeal two cards.'));
});


test('rejects a generated response without a source-complete canonical package', async () => {
  saveProjectContext(window.localStorage, {
    projectId: 'malformed-package', gameName: 'Abyss', language: 'english', rulebookText: 'Rulebook text',
    components: [{ id: 'cards', name: 'Cards' }], activeStepId: 'script',
  });
  axios.get.mockResolvedValue({ data: { ready: true, message: 'AI model is ready.' } });
  axios.post.mockResolvedValue({ data: {
    generated: true, summary: 'Unsafe fallback narration', scriptPackage: {},
    sourceCompleteness: { complete: true }, generationStatus: { sourceComplete: true },
  } });
  render(<App />);
  const generate = await screen.findByRole('button', { name: 'Generate optional AI summary' });
  await waitFor(() => expect(generate).toBeEnabled());
  fireEvent.click(generate);
  await waitFor(() => expect(screen.getByTestId('script-provenance')).toHaveTextContent('generation_failed'));
  expect(screen.getByTestId('editable-script')).toHaveTextContent('');
  expect(screen.getByRole('button', { name: /Confirm Script & Continue/i })).toBeDisabled();
});


async function createStoryboardIngestionManifest(context) {
  const pages = buildDeterministicIngestionPages(context.rulebookText);
  const pageHashes = await Promise.all(pages.map(async (page) => {
    const digest = await globalThis.crypto.subtle.digest(
      'SHA-256',
      new TextEncoder().encode(`${page.number}:${page.blocks.map((block) => block.text.normalize('NFKC').replace(/\s+/g, ' ').trim()).join('\n')}`),
    );
    return {
      page: page.number,
      hash: Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join(''),
    };
  }));
  return {
    version: '1.0.0',
    document: { id: getIngestionDocumentId(context), title: context.gameName, gameId: getIngestionDocumentId(context), source: 'client-ui' },
    outline: [{ id: 'heading-setup', title: 'Setup', slug: 'setup', page: 1 }],
    components: [{ id: 'comp-setup', sourceHeading: 'heading-setup' }],
    assets: { pages: pageHashes, components: [{ id: 'comp-setup', hash: 'validated-component-hash' }] },
  };
}

async function createImageHandoffContext({ images, componentImageLinks = {}, componentImageLinkDetails = {} } = {}) {
  const context = {
    projectId: 'abyss-image-handoff', gameName: 'Abyss', language: 'english',
    rulebookText: 'Setup\nPlace the board.', components: [{ id: 'board', name: 'Board' }],
    images, componentImageLinks, componentImageLinkDetails,
    activeStepId: 'images', completedStepIds: ['project', 'metadata', 'ingestion'],
  };
  return { ...context, ingestionManifest: await createStoryboardIngestionManifest(context) };
}

test('confirms a valid ingested image inventory with zero links and persists storyboard-review handoff status', async () => {
  const context = await createImageHandoffContext({
    images: [{ id: 'curated-board', curation: { candidate: true } }],
  });
  saveProjectContext(window.localStorage, context);
  axios.get.mockResolvedValue({ data: { images: context.images, componentImages: {}, componentImageLinkDetails: {} } });

  render(<App />);
  fireEvent.click(await screen.findByRole('button', { name: /Confirm Images & Continue/i }));

  await waitFor(() => expect(loadLatestProjectContext(window.localStorage)).toMatchObject({
    activeStepId: 'script', completedStepIds: expect.arrayContaining(['images']),
    imageReviewStatus: {
      status: 'pending_visual_storyboard_review', inventoryAssetCount: 1, curatedCandidateCount: 1,
      approvedLinkCount: 0, unresolvedComponentCount: 1,
    },
    componentImageLinks: {}, storyboardManifest: null,
  }));
  expect(screen.getByTestId('script-readiness')).toHaveTextContent('ready');
});

test('keeps Images blocked with a typed recoverable state when valid ingestion has no inventory', async () => {
  const context = await createImageHandoffContext({ images: [] });
  saveProjectContext(window.localStorage, context);
  axios.get.mockResolvedValue({ data: { images: [], componentImages: {}, componentImageLinkDetails: {} } });

  render(<App />);
  fireEvent.click(await screen.findByRole('button', { name: /Confirm Images & Continue/i }));

  expect(await screen.findByText(/IMAGE_INVENTORY_REQUIRED/)).toBeInTheDocument();
  expect(loadLatestProjectContext(window.localStorage)).toMatchObject({
    activeStepId: 'images', completedStepIds: ['project', 'metadata', 'ingestion'], imageReviewStatus: null,
  });
});

test('retains the Images handoff behavior for legacy approved component links', async () => {
  const context = await createImageHandoffContext({
    images: [{ id: 'legacy-board', curation: { candidate: true } }],
    componentImageLinks: { board: ['legacy-board'] },
    componentImageLinkDetails: { board: { 'legacy-board': { origin: 'legacy' } } },
  });
  saveProjectContext(window.localStorage, context);
  axios.get.mockResolvedValue({ data: { images: context.images, componentImages: context.componentImageLinks, componentImageLinkDetails: context.componentImageLinkDetails } });

  render(<App />);
  fireEvent.click(await screen.findByRole('button', { name: /Confirm Images & Continue/i }));

  await waitFor(() => expect(loadLatestProjectContext(window.localStorage)).toMatchObject({
    activeStepId: 'script',
    imageReviewStatus: { approvedLinkCount: 1, unresolvedComponentCount: 0 },
    componentImageLinks: { board: ['legacy-board'] },
  }));
});

test('blocks Voice/TTS for an unresolved required storyboard visual plan before any provider request', async () => {
  saveProjectContext(window.localStorage, {
    projectId: 'abyss-voice-visual-gate', gameName: 'Abyss', language: 'english', rulebookText: 'Setup',
    components: [{ id: 'board', name: 'Board' }], images: [{ id: 'board-image' }], componentImageLinks: {},
    storyboardManifest: {
      version: '1.2.0',
      scenes: [{ id: 'scene-board', title: 'Board setup', visualDirections: [{ instruction: 'Show the board.', componentRefs: ['board'] }], imageAssetIds: [] }],
    },
    activeStepId: 'voice', completedStepIds: ['project', 'metadata', 'ingestion', 'images', 'script', 'storyboard'],
  });
  axios.get.mockResolvedValue({ data: { images: [{ id: 'board-image' }], componentImages: {}, componentImageLinkDetails: {} } });

  render(<App />);
  fireEvent.click(await screen.findByRole('button', { name: 'Generate voice preview' }));

  expect(await screen.findByText('VISUAL_PLAN_INCOMPLETE')).toBeInTheDocument();
  expect(axios.post).not.toHaveBeenCalled();
});

test('hydrates a matching persisted manifest and sends it with the validated script package to storyboard', async () => {
  const context = {
    projectId: 'abyss-storyboard-handoff', gameName: 'Abyss', language: 'english',
    rulebookText: 'Setup\nPlace the board.', components: [{ id: 'board', name: 'Board' }],
    script: 'Place the board.', scriptProvenance: 'generated_source_complete', generatedScript: true,
    scriptPackage: { contractVersion: '1.0', sections: [{ id: 'section-01', order: 1, title: 'Setup', spokenText: 'Place the board.', visualDirections: [{ instruction: 'Show the board.' }], sources: [{ section: 1, startOffset: 0, endOffset: 22 }] }] },
    activeStepId: 'storyboard', completedStepIds: ['project', 'metadata', 'ingestion', 'images', 'script'],
  };
  const ingestionManifest = await createStoryboardIngestionManifest(context);
  saveProjectContext(window.localStorage, { ...context, ingestionManifest });
  axios.post.mockImplementation((url) => {
    if (url.endsWith('/api/storyboard')) return Promise.resolve({ data: { ok: true, manifest: { scenes: [] } } });
    return Promise.resolve({ data: {} });
  });

  render(<App />);
  fireEvent.click(await screen.findByRole('button', { name: 'Generate storyboard' }));

  await waitFor(() => expect(axios.post).toHaveBeenCalledWith(
    expect.stringContaining('/api/storyboard'),
    expect.objectContaining({
      ingestionManifest,
      scriptPackage: context.scriptPackage,
      options: { includeOverlayHashes: true, language: 'english' },
    }),
  ));
});


test('recovers a legacy browser context by project ID, migrates it, and sends the recovered manifest to storyboard', async () => {
  const context = {
    projectId: 'abyss-legacy-browser-context', gameName: 'Abyss', language: 'english',
    rulebookText: 'Setup\nPlace the board.', components: [{ id: 'board', name: 'Board' }],
    script: 'Place the board.', scriptProvenance: 'generated_source_complete', generatedScript: true,
    scriptPackage: { contractVersion: '1.0', sections: [{ id: 'section-01', order: 1, title: 'Setup', spokenText: 'Place the board.', visualDirections: [{ instruction: 'Show board.' }], sources: [{ section: 1, startOffset: 0, endOffset: 22 }] }] },
    activeStepId: 'storyboard', completedStepIds: ['project', 'metadata', 'ingestion', 'images', 'script'],
  };
  const manifest = await createStoryboardIngestionManifest(context);
  saveProjectContext(window.localStorage, { ...context, ingestionManifest: null });
  axios.post.mockImplementation((url) => {
    if (url.endsWith('/api/projects/recover-ingestion-manifest')) return Promise.resolve({ data: { ok: true, manifest } });
    if (url.endsWith('/api/storyboard')) return Promise.resolve({ data: { ok: true, manifest: { scenes: [] } } });
    return Promise.resolve({ data: {} });
  });

  render(<App />);
  fireEvent.click(await screen.findByRole('button', { name: 'Generate storyboard' }));

  await waitFor(() => expect(axios.post).toHaveBeenCalledWith(
    expect.stringContaining('/api/projects/recover-ingestion-manifest'),
    { projectId: context.projectId },
  ));
  await waitFor(() => expect(axios.post).toHaveBeenCalledWith(
    expect.stringContaining('/api/storyboard'),
    expect.objectContaining({ ingestionManifest: manifest, scriptPackage: context.scriptPackage }),
  ));
  expect(loadLatestProjectContext(window.localStorage).ingestionManifest).toEqual(manifest);
});

test('does not request recovery when the current browser context already has a valid manifest', async () => {
  const context = {
    projectId: 'abyss-current-browser-context', gameName: 'Abyss', language: 'english', rulebookText: 'Setup\nPlace the board.',
    script: 'Place the board.', scriptProvenance: 'generated_source_complete', generatedScript: true,
    scriptPackage: { contractVersion: '1.0', sections: [{ id: 'section-01', order: 1, title: 'Setup', spokenText: 'Place the board.', visualDirections: [], sources: [{ section: 1, startOffset: 0, endOffset: 22 }] }] },
    activeStepId: 'storyboard', completedStepIds: ['script'],
  };
  const manifest = await createStoryboardIngestionManifest(context);
  saveProjectContext(window.localStorage, { ...context, ingestionManifest: manifest });
  axios.post.mockResolvedValue({ data: { ok: true, manifest: { scenes: [] } } });

  render(<App />);
  fireEvent.click(await screen.findByRole('button', { name: 'Generate storyboard' }));
  await waitFor(() => expect(axios.post).toHaveBeenCalledWith(
    expect.stringContaining('/api/storyboard'), expect.objectContaining({ ingestionManifest: manifest }),
  ));
  expect(axios.post).not.toHaveBeenCalledWith(
    expect.stringContaining('/api/projects/recover-ingestion-manifest'), expect.anything(),
  );
});


test('preserves a typed recovery failure instead of collapsing it to a generic missing result', async () => {
  const context = {
    projectId: 'abyss-recovery-error', gameName: 'Abyss', language: 'english', rulebookText: 'Setup\nPlace the board.',
    script: 'Place the board.', scriptProvenance: 'generated_source_complete', generatedScript: true,
    scriptPackage: { contractVersion: '1.0', sections: [{ id: 'section-01', order: 1, title: 'Setup', spokenText: 'Place the board.', visualDirections: [], sources: [{ section: 1, startOffset: 0, endOffset: 22 }] }] },
    activeStepId: 'storyboard', completedStepIds: ['script'],
  };
  saveProjectContext(window.localStorage, context);
  axios.post.mockImplementation((url) => {
    if (url.endsWith('/api/projects/recover-ingestion-manifest')) {
      return Promise.reject({ response: { status: 400, data: { code: 'INGESTION_MANIFEST_PROJECT_MISMATCH', diagnosticId: 'safe12345678' } } });
    }
    return Promise.resolve({ data: {} });
  });

  render(<App />);
  fireEvent.click(await screen.findByRole('button', { name: 'Generate storyboard' }));

  await waitFor(() => expect(screen.getByText('INGESTION_MANIFEST_PROJECT_MISMATCH')).toBeInTheDocument());
  expect(axios.post).toHaveBeenCalledTimes(1);
  expect(axios.post).toHaveBeenCalledWith(
    expect.stringContaining('/api/projects/recover-ingestion-manifest'), { projectId: context.projectId },
  );
});


test('uses canonical storyboard spokenText and timing for Remotion without leaking review metadata into narration', () => {
  const scenes = buildRemotionScenes({
    script: 'fallback narration',
    scriptPackage: null,
    storyboardManifest: {
      version: '1.2.0',
      scenes: [{ id: 'scene-section-01-1', title: 'Setup', spokenText: 'Place the board.', durationMs: 3200, visualDirections: [{ instruction: 'Show board.', onScreenText: 'Setup', componentRefs: ['board'] }], sources: [{ section: 1, startOffset: 0, endOffset: 10 }], componentRefs: ['board'], imageAssetIds: ['board-image'], reviewNotes: 'Do not narrate this.' }],
    },
    gameName: 'Abyss',
    images: [{ id: 'board-image', fileKey: 'src/api/uploads/board.png' }],
    componentImageLinks: {},
  });
  expect(scenes).toEqual([expect.objectContaining({
    id: 'scene-section-01-1', narrationText: 'Place the board.', durationInFrames: 96, imageUrls: ['/uploads/board.png'], storyboardVersion: '1.2.0',
  })]);
  expect(JSON.stringify(scenes[0].narrationText)).not.toContain('Do not narrate');
  expect(JSON.stringify(scenes[0].narrationText)).not.toContain('Show board');
});


test('recognizes confirmed contextual evidence and a documented brand outro as renderable without a local image URL', () => {
  expect(hasRenderVisualEvidence({
    imageUrls: [],
    contextualEvidenceAssignments: [{ assetId: 'page-5', confirmed: true }],
    visualPlan: { coverageStatus: 'resolved' },
  })).toBe(true);
  expect(hasRenderVisualEvidence({
    imageUrls: [],
    visualPlan: {
      primaryIntent: 'brand_outro',
      coverageStatus: 'operator_override',
      operatorOverride: { reason: 'Use the approved branded outro.' },
    },
  })).toBe(true);
  expect(hasRenderVisualEvidence({
    imageUrls: [],
    visualPlan: { schematicComponentEvidence: [{ componentId: 'key-tokens', symbol: 'key', label: '3 Keys' }] },
  })).toBe(true);
  expect(hasRenderVisualEvidence({ imageUrls: [], visualPlan: { schematicComponentEvidence: [{ componentId: 'key-tokens', symbol: 'key', label: '2 Keys' }] } })).toBe(false);
  expect(hasRenderVisualEvidence({ imageUrls: [], visualPlan: { requiresExplicitVisual: true } })).toBe(false);
});

test('uses the canonical coverage status as the final pre-render authority', () => {
  expect(isRenderVisualPlanComplete({ visualPlan: { requiresExplicitVisual: true, coverageStatus: 'resolved' } })).toBe(true);
  expect(isRenderVisualPlanComplete({ visualPlan: { requiresExplicitVisual: true, coverageStatus: 'operator_override' } })).toBe(true);
  expect(isRenderVisualPlanComplete({ visualPlan: { requiresExplicitVisual: true, coverageStatus: 'partial' } })).toBe(false);
  expect(isRenderVisualPlanComplete({ visualPlan: { requiresExplicitVisual: true, coverageStatus: 'unresolved' } })).toBe(false);
});

test('never rotates arbitrary project images into an unresolved canonical storyboard scene', () => {
  const scenes = buildRemotionScenes({
    script: 'fallback narration', scriptPackage: null, gameName: 'Abyss',
    images: [{ id: 'unrelated-image', fileKey: 'src/api/uploads/unrelated.png' }],
    componentImageLinks: { council: ['unrelated-image'] },
    storyboardManifest: {
      version: '1.2.0',
      scenes: [{ id: 'unresolved', title: 'Setup', spokenText: 'Place the monster tokens.', durationMs: 3200, visualDirections: [{ componentRefs: ['monster-tokens'] }], sources: [{ section: 1 }], componentRefs: ['monster-tokens'], imageAssetIds: [], visualPlan: { requiresExplicitVisual: true, selectedAssetIds: [], reviewState: 'needs_visual_review' } }],
    },
  });
  expect(scenes[0]).toMatchObject({ imageUrls: [], visualPlan: expect.objectContaining({ reviewState: 'needs_visual_review' }) });
});


test('rehydrates a historical storyboard from the canonical project image inventory', async () => {
  saveProjectContext(window.localStorage, {
    projectId: 'abyss-mstkmf2r-4mlb',
    gameName: 'Abyss',
    language: 'english',
    components: [{ id: 'monster-tokens', name: 'Monster token', aliases: ['monster tokens'] }],
    images: [],
    componentImageLinks: {},
    componentImageLinkDetails: {},
    storyboardManifest: {
      version: '1.2.0',
      scenes: [{
        id: 'scene-1', order: 1, title: 'Setup', spokenText: 'Place the monster tokens.',
        visualDirections: [{ instruction: 'Show monster tokens.', componentRefs: ['monster tokens'] }],
        sources: [{ section: 1, startOffset: 0, endOffset: 24 }], imageAssetIds: [],
      }],
    },
    activeStepId: 'storyboard',
  });
  axios.get.mockImplementation((url) => {
    if (url.endsWith('/api/projects/abyss-mstkmf2r-4mlb/images')) {
      return Promise.resolve({ data: {
        images: [{ id: 'monster-image', name: 'Monster token', source: 'hephaestus', curation: { candidate: true } }],
        componentImages: { 'monster-tokens': ['monster-image'] },
        componentImageLinkDetails: { 'monster-tokens': { 'monster-image': { origin: 'manual' } } },
      } });
    }
    return Promise.resolve({ data: { ready: true } });
  });

  render(<App />);
  await waitFor(() => expect(axios.get).toHaveBeenCalledWith(expect.stringContaining('/api/projects/abyss-mstkmf2r-4mlb/images')));
  await waitFor(() => expect(screen.getByTestId('storyboard-image-count')).toHaveTextContent('1'));
  await waitFor(() => expect(screen.getByTestId('storyboard-candidate-count')).toHaveTextContent('1'));
  await waitFor(() => {
    const persisted = loadLatestProjectContext(window.localStorage);
    expect(persisted.images).toEqual([expect.objectContaining({ id: 'monster-image' })]);
    expect(persisted.componentImageLinkDetails).toEqual({ 'monster-tokens': { 'monster-image': { origin: 'manual' } } });
  });
});


test('does not hydrate canonical inventory for a fresh upload after restoring another project', async () => {
  saveProjectContext(window.localStorage, {
    projectId: 'restored-abyss', gameName: 'Abyss', language: 'english', activeStepId: 'project',
  });
  getDocument.mockReturnValue({
    promise: Promise.resolve({
      numPages: 1,
      getPage: () => Promise.resolve({ getTextContent: () => Promise.resolve({ items: [{ str: 'Rulebook text' }] }) }),
    }),
  });
  axios.get.mockResolvedValue({ data: { images: [], componentImages: {}, componentImageLinkDetails: {} } });
  const { container } = render(<App />);
  await waitFor(() => expect(axios.get).toHaveBeenCalledWith(expect.stringContaining('/api/projects/restored-abyss/images')));
  axios.get.mockClear();

  const pdfFile = new File(['pdf contents'], 'Abyss.pdf', { type: 'application/pdf' });
  Object.defineProperty(pdfFile, 'arrayBuffer', { value: () => Promise.resolve(new ArrayBuffer(0)) });
  fireEvent.change(container.querySelector('input[type="file"]'), { target: { files: [pdfFile] } });
  await waitFor(() => expect(screen.getByPlaceholderText('Auto-generated from uploaded PDF filename').value).toMatch(/^abyss-/));
  expect(axios.get).not.toHaveBeenCalled();
});


test('fails closed when canonical inventory hydration is unavailable', async () => {
  saveProjectContext(window.localStorage, {
    projectId: 'abyss-canonical-unavailable', gameName: 'Abyss', language: 'english',
    components: [{ id: 'monster-tokens', name: 'Monster token' }],
    images: [{ id: 'stale-monster', name: 'Stale monster asset' }],
    componentImageLinks: { 'monster-tokens': ['stale-monster'] },
    componentImageLinkDetails: { 'monster-tokens': { 'stale-monster': { origin: 'manual' } } },
    storyboardManifest: {
      version: '1.2.0',
      scenes: [{
        id: 'scene-1', order: 1, title: 'Setup', spokenText: 'Place the monster token.',
        visualDirections: [{ instruction: 'Show monster token.', componentRefs: ['monster-tokens'] }],
        sources: [{ section: 1, startOffset: 0, endOffset: 24 }], imageAssetIds: ['stale-monster'],
        visualPlan: { selectedAssetIds: ['stale-monster'], selectionMethod: 'approved_component_link', reviewState: 'resolved' },
      }],
    },
    activeStepId: 'storyboard',
  });
  axios.get.mockRejectedValue({ response: { data: { code: 'IMAGE_INVENTORY_UNAVAILABLE' } } });

  render(<App />);
  await waitFor(() => expect(screen.getByTestId('storyboard-image-count')).toHaveTextContent('0'));
  await waitFor(() => expect(screen.getByTestId('storyboard-review-state')).toHaveTextContent('needs_visual_review'));
  await waitFor(() => {
    expect(loadLatestProjectContext(window.localStorage).images).toEqual([]);
    expect(loadLatestProjectContext(window.localStorage).storyboardManifest.scenes[0].visualPlan.reviewState).toBe('needs_visual_review');
  });
});
