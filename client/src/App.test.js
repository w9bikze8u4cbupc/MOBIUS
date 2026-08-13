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
import App, { createProjectIdFromFilename } from './App';

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

test('filename helper creates a safe unique ID', () => {
  expect(createProjectIdFromFilename('Abyss final.pdf', 'test123')).toBe('abyss-final-test123');
});

test('PDF upload creates a project ID when game-name extraction fails', async () => {
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

test('successful game-name extraction does not overwrite the filename-derived project ID', async () => {
  getDocument.mockReturnValue({
    promise: Promise.resolve({
      numPages: 1,
      getPage: () => Promise.resolve({
        getTextContent: () => Promise.resolve({ items: [{ str: 'Rulebook text' }] }),
      }),
    }),
  });
  axios.post.mockResolvedValueOnce({ data: { gameName: 'Detected Abyss' } });
  axios.get.mockResolvedValue({ data: { found: false } });

  const { container } = render(<App />);
  const pdfFile = new File(['pdf contents'], 'Abyss.pdf', { type: 'application/pdf' });
  Object.defineProperty(pdfFile, 'arrayBuffer', { value: () => Promise.resolve(new ArrayBuffer(0)) });
  fireEvent.change(container.querySelector('input[type="file"]'), { target: { files: [pdfFile] } });

  await waitFor(() => {
    expect(screen.getByPlaceholderText('Extracted from PDF')).toHaveValue('Detected Abyss');
  });

  expect(screen.getByPlaceholderText('Auto-generated from uploaded PDF filename').value).toMatch(/^abyss-/);
});
