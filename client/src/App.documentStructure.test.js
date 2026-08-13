import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';

jest.mock('axios', () => ({
  __esModule: true,
  default: {
    get: jest.fn(),
    post: jest.fn(),
  },
}));

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
jest.mock('./components/PipelineStepper', () => ({
  PipelineStepper: ({ activeStepId, onConfirmStep }) => (
    <button onClick={() => onConfirmStep(activeStepId)}>Confirm current step</button>
  ),
}));
jest.mock('./components/steps/ProjectSetupStep', () => ({
  MetadataInputStep: () => null,
  ProjectSetupStep: ({ onFileChange }) => (
    <input aria-label="Rulebook PDF" type="file" onChange={onFileChange} />
  ),
}));
jest.mock('./components/steps/MetadataInputStep', () => ({ MetadataInputStep: () => <div>Metadata step</div> }));
jest.mock('./components/steps/ImagesStep', () => ({ ImagesStep: () => null }));
jest.mock('./components/steps/ScriptStep', () => ({ ScriptStep: () => null }));
jest.mock('./components/steps/StoryboardStep', () => ({ StoryboardStep: () => null }));
jest.mock('./components/steps/VoiceStep', () => ({ VoiceStep: () => null }));
jest.mock('./components/steps/RenderExportStep', () => ({ RenderExportStep: () => null }));

import axios from 'axios';
import { getDocument } from 'pdfjs-dist';
import App from './App';

const completedManifest = {
  outline: [{ id: 'heading-setup', title: 'Setup', page: 1 }],
  components: [{ id: 'candidate-setup' }],
  stats: { pageCount: 1 },
};

function configureWorkflow({ ingestError = null } = {}) {
  getDocument.mockReturnValue({
    promise: Promise.resolve({
      numPages: 1,
      getPage: () => Promise.resolve({
        getTextContent: () => Promise.resolve({ items: [{ str: 'Setup' }, { str: 'Place 7 cards' }] }),
      }),
    }),
  });
  axios.get.mockResolvedValue({ data: { found: false } });
  axios.post.mockImplementation((url) => {
    if (url.endsWith('/api/extract-game-name')) return Promise.resolve({ data: { gameName: 'Abyss' } });
    if (url.endsWith('/api/extract-game-components')) return Promise.resolve({ data: { components: [{ id: 'cards', name: 'Cards', category: 'card', quantity: 7 }] } });
    if (url.endsWith('/api/ingest')) {
      return ingestError ? Promise.reject(ingestError) : Promise.resolve({ data: { manifest: completedManifest } });
    }
    if (url.endsWith('/summarize')) return Promise.reject(new Error('summary provider unavailable'));
    return Promise.resolve({ data: {} });
  });
}

async function openIngestionReview() {
  render(<App />);
  const pdfFile = new File(['pdf contents'], 'Abyss.pdf', { type: 'application/pdf' });
  Object.defineProperty(pdfFile, 'arrayBuffer', { value: () => Promise.resolve(new ArrayBuffer(0)) });
  fireEvent.change(screen.getByLabelText('Rulebook PDF'), { target: { files: [pdfFile] } });

  await waitFor(() => expect(axios.post).toHaveBeenCalledWith(expect.stringContaining('/api/extract-game-name'), expect.any(Object)));
  fireEvent.click(screen.getByRole('button', { name: 'Confirm current step' }));
  await screen.findByText('Metadata step');
  fireEvent.click(screen.getByRole('button', { name: 'Confirm current step' }));
  await screen.findByRole('button', { name: /Analyze Document Structure/i });
}

describe('Analyze Document Structure workflow', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('clears stale global errors and completes deterministically when the optional summary service would reject', async () => {
    configureWorkflow();
    await openIngestionReview();

    fireEvent.click(screen.getByRole('button', { name: 'Confirm current step' }));
    expect(await screen.findByText('Run deterministic ingestion first.')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /Analyze Document Structure/i }));

    expect(await screen.findByText('Document Structure')).toBeInTheDocument();
    expect(screen.queryByText('Run deterministic ingestion first.')).not.toBeInTheDocument();
    expect(screen.getByText('Analysis Complete')).toBeInTheDocument();
    expect(screen.getByText('Sections')).toBeInTheDocument();
    expect(screen.getByText('Components')).toBeInTheDocument();
    expect(screen.getByText('Pages')).toBeInTheDocument();
    expect(screen.queryByText('Failed to generate summary')).not.toBeInTheDocument();
    expect(axios.post.mock.calls.some(([url]) => url.endsWith('/summarize'))).toBe(false);
  });

  test('reports a stage-specific error when deterministic analysis fails', async () => {
    configureWorkflow({
      ingestError: { response: { data: { error: 'INGEST_HEADING_MISSING' } } },
    });
    await openIngestionReview();

    fireEvent.click(screen.getByRole('button', { name: /Analyze Document Structure/i }));

    expect(await screen.findByText('Document structure analysis failed: INGEST_HEADING_MISSING')).toBeInTheDocument();
    expect(screen.queryByText('Document Structure')).not.toBeInTheDocument();
  });
});
