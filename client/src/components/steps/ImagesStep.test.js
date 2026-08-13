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
import { ImagesStep } from './ImagesStep';
const pdfFile = new File(['pdf contents'], 'Abyss.pdf', { type: 'application/pdf' });
const emptyImages = [];
const emptyComponentImages = {};

beforeEach(() => {
  axios.get.mockResolvedValue({ data: { images: [], componentImages: {} } });
  axios.post.mockReset();
});

test('shows explicit readiness errors and disables both image actions when project ID is missing', () => {
  render(<ImagesStep pdfFile={pdfFile} />);

  expect(screen.getByText(/Project identifier is missing/i)).toBeInTheDocument();
  expect(screen.getByRole('button', { name: /Auto-Gather All Images/i })).toBeDisabled();
  expect(screen.getByRole('button', { name: /Extract with HEPHAESTUS/i })).toBeDisabled();
  expect(axios.post).not.toHaveBeenCalled();
});

test('shows an explicit original-PDF error when the upload is unavailable', () => {
  render(<ImagesStep projectId="abyss-upload-abc123" />);

  expect(screen.getByText(/original rulebook PDF is not available/i)).toBeInTheDocument();
  expect(screen.getByRole('button', { name: /Auto-Gather All Images/i })).toBeDisabled();
  expect(screen.getByRole('button', { name: /Extract with HEPHAESTUS/i })).toBeDisabled();
});

test('HEPHAESTUS reports loading immediately and sends the original File as FormData field file', async () => {
  let resolveRequest;
  axios.post.mockImplementation(() => new Promise((resolve) => {
    resolveRequest = resolve;
  }));

  render(
    <ImagesStep
      projectId="abyss-upload-abc123"
      pdfFile={pdfFile}
      images={emptyImages}
      componentImages={emptyComponentImages}
    />
  );

  fireEvent.click(screen.getByRole('button', { name: /Extract with HEPHAESTUS/i }));

  expect(await screen.findByText(/Running HEPHAESTUS extraction pipeline/i)).toBeInTheDocument();
  expect(axios.post).toHaveBeenCalledWith(
    expect.stringContaining('/api/projects/abyss-upload-abc123/images/extract-hephaestus'),
    expect.any(FormData),
    expect.objectContaining({ headers: { 'Content-Type': 'multipart/form-data' } }),
  );

  const formData = axios.post.mock.calls[0][1];
  expect(formData.get('file')).toBe(pdfFile);

  resolveRequest({ data: { images: [], imagesCount: 2, stats: {} } });
  await waitFor(() => {
    expect(screen.getByText(/Extracted 2 component images using HEPHAESTUS/i)).toBeInTheDocument();
  });
});

test('treats a whitespace-only project ID as missing', () => {
  render(
    <ImagesStep
      projectId="   "
      pdfFile={pdfFile}
      images={emptyImages}
      componentImages={emptyComponentImages}
    />
  );

  expect(screen.getByText(/Project identifier is missing/i)).toBeInTheDocument();
  expect(screen.getByRole('button', { name: /Auto-Gather All Images/i })).toBeDisabled();
  expect(screen.getByRole('button', { name: /Extract with HEPHAESTUS/i })).toBeDisabled();
});

test('Auto-Gather sends the original File as FormData field file', async () => {
  axios.post.mockImplementation((url) => {
    if (url.includes('/extract-native')) {
      return Promise.resolve({ data: { images: [], mode: 'native', nativeCount: 0 } });
    }
    return Promise.resolve({ data: {} });
  });

  render(
    <ImagesStep
      projectId="abyss-upload-abc123"
      pdfFile={pdfFile}
      images={emptyImages}
      componentImages={emptyComponentImages}
    />
  );

  fireEvent.click(screen.getByRole('button', { name: /Auto-Gather All Images/i }));

  await waitFor(() => {
    expect(axios.post).toHaveBeenCalledWith(
      expect.stringContaining('/api/projects/abyss-upload-abc123/images/extract-native'),
      expect.any(FormData),
      expect.objectContaining({ headers: { 'Content-Type': 'multipart/form-data' } }),
    );
  });

  expect(axios.post.mock.calls[0][1].get('file')).toBe(pdfFile);
});
