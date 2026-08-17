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
import App, { createProjectIdFromFilename, hasValidComponentInventory, extractPdfPageText } from './App';
import { saveProjectContext } from './projectContext';

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
jest.mock('./components/steps/ImagesStep', () => ({ ImagesStep: () => null }));
jest.mock('./components/steps/ScriptStep', () => ({
  ScriptStep: ({
    onSummarize,
    scriptInputReadiness,
    scriptProvenance,
    summary,
    editedSummary,
    generationStatus,
    summaryWarning,
  }) => (
    <div>
      <div data-testid="script-readiness">{scriptInputReadiness?.message || 'ready'}</div>
      <div data-testid="script-provenance">{scriptProvenance || 'none'}</div>
      <div data-testid="editable-script">{editedSummary}</div>
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
jest.mock('./components/steps/StoryboardStep', () => ({ StoryboardStep: () => null }));
jest.mock('./components/steps/VoiceStep', () => ({ VoiceStep: () => null }));
jest.mock('./components/steps/RenderExportStep', () => ({ RenderExportStep: () => null }));

beforeEach(() => {
  window.localStorage.clear();
  jest.clearAllMocks();
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
  axios.post.mockRejectedValueOnce(new Error('game-name service unavailable'));

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
  expect(axios.post).not.toHaveBeenCalled();
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
  axios.post.mockResolvedValue({ data: { gameName: 'Abyss' } });

  const { container } = render(<App />);
  const pdfFile = new File(['pdf contents'], 'ABYSS.pdf', { type: 'application/pdf' });
  Object.defineProperty(pdfFile, 'arrayBuffer', { value: () => Promise.resolve(new ArrayBuffer(0)) });
  fireEvent.change(container.querySelector('input[type="file"]'), { target: { files: [pdfFile] } });

  await waitFor(() => expect(screen.getByPlaceholderText('Extracted from PDF')).toHaveValue('Abyss'));
  expect(axios.post).not.toHaveBeenCalled();

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
  expect(axios.post).not.toHaveBeenCalled();
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
    activeStepId: 'script',
    completedStepIds: ['project', 'metadata', 'ingestion', 'images'],
  });
  axios.get.mockResolvedValue({ data: { ready: true, message: 'AI model is ready.' } });
  axios.post.mockResolvedValue({
    data: {
      generated: true,
      summary: 'Generated tutorial script',
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