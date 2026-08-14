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
jest.mock('./components/steps/ScriptStep', () => ({ ScriptStep: () => null }));
jest.mock('./components/steps/StoryboardStep', () => ({ StoryboardStep: () => null }));
jest.mock('./components/steps/VoiceStep', () => ({ VoiceStep: () => null }));
jest.mock('./components/steps/RenderExportStep', () => ({ RenderExportStep: () => null }));

beforeEach(() => {
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
