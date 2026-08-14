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

test('separates curated candidates from raw HEPHAESTUS assets and supports ranked preview review', async () => {
  const curatedImage = {
    id: 'heph-card-front',
    source: 'hephaestus',
    label: 'Ocean Card',
    type: 'card',
    fileKey: 'data/abyss/card.png',
    thumbnailKey: 'data/abyss/card-thumb.png',
    curation: { candidate: true, score: 0.9, reasons: [] },
    metadata: { classification: 'card', curation: { candidate: true, score: 0.9 } },
  };
  const rawImage = {
    id: 'heph-star',
    source: 'hephaestus',
    label: 'decorative star',
    fileKey: 'data/abyss/star.png',
    thumbnailKey: 'data/abyss/star-thumb.png',
    curation: { candidate: false, score: 0.1, reasons: ['decorative'] },
    metadata: { curation: { candidate: false, score: 0.1, reasons: ['decorative'] } },
  };
  const images = [curatedImage, rawImage];
  axios.get.mockResolvedValue({ data: { images, componentImages: {} } });
  axios.post.mockResolvedValue({
    data: {
      images,
      componentImages: {},
      candidates: {
        'comp-card': [{ imageId: curatedImage.id, score: 0.9, autoLink: true, reasons: ['category/type match', 'name/OCR proximity'] }],
      },
      stats: { total: 1, totalMatched: 1, ruleMatched: 1, unmatched: 0 },
      matched: 1,
    },
  });

  render(
    <ImagesStep
      projectId="abyss-upload-abc123"
      pdfFile={pdfFile}
      components={[{ id: 'comp-card', name: 'Ocean Card', category: 'card', quantity: 1 }]}
      images={images}
      componentImages={{}}
    />
  );

  expect(screen.getByText('Curated Component Candidates (1)')).toBeInTheDocument();
  expect(screen.getByText(/Raw extracted assets \(2\)/i)).toBeInTheDocument();
  expect(screen.getByText('decorative star').closest('details')).not.toHaveAttribute('open');

  fireEvent.click(screen.getByRole('button', { name: /Auto-Match Components to Images/i }));
  expect(await screen.findByText(/Ranked candidates \(1\)/i)).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: /90% auto-link/i }));
  expect(screen.getByRole('dialog', { name: /Full-resolution image preview/i })).toBeInTheDocument();
  expect(screen.getByRole('button', { name: /Link this representative image/i })).toBeInTheDocument();
});


test('lists only strict physical components in Component Image Links', () => {
  const images = [{
    id: 'board-image',
    source: 'manual',
    label: 'Board reference',
    type: 'board',
    localUrl: '/board.png',
  }];
  axios.get.mockResolvedValue({ data: { images, componentImages: {} } });

  render(
    <ImagesStep
      projectId="abyss-upload-abc123"
      pdfFile={pdfFile}
      images={images}
      componentImages={{}}
      components={[
        { id: 'game-board', name: 'game board', category: 'board', reviewRequired: true, eligibility: 'setup', inferenceReason: 'Setup-derived physical object; confirm this component before matching.', matchEligible: true },
        { id: 'instruction', name: 'Then, turn over the top six cards and place them in the Court.', category: 'card', matchEligible: false },
        { id: 'track', name: 'EXPLORATION TRACK', category: 'marker', matchEligible: false },
        { id: 'caption', name: 'Lord of the Lords', category: 'card', reviewRequired: true, eligibility: 'setup', matchEligible: true },
        { id: 'star', name: 'blue star', category: 'other', reviewRequired: true, eligibility: 'setup', matchEligible: true },
      ]}
    />
  );

  expect(screen.getByRole('heading', { name: 'Component Image Links' })).toBeInTheDocument();
  expect(screen.getByText('game board')).toBeInTheDocument();
  expect(screen.queryByText(/Then, turn over the top six cards/i)).not.toBeInTheDocument();
  expect(screen.queryByText('EXPLORATION TRACK')).not.toBeInTheDocument();
  expect(screen.queryByText('Lord of the Lords')).not.toBeInTheDocument();
  expect(screen.queryByText('blue star')).not.toBeInTheDocument();
});


test('does not submit non-physical evidence to automatic matching', async () => {
  const images = [{ id: 'board-image', source: 'manual', label: 'Board reference', type: 'board', localUrl: '/board.png' }];
  axios.get.mockResolvedValue({ data: { images, componentImages: {} } });
  axios.post.mockResolvedValue({ data: { images, componentImages: {}, candidates: {}, matched: 0, stats: { total: 1, unmatched: 1 } } });

  render(
    <ImagesStep
      projectId="abyss-upload-abc123"
      pdfFile={pdfFile}
      images={images}
      componentImages={{}}
      components={[
        { id: 'game-board', name: 'game board', category: 'board', reviewRequired: true, eligibility: 'setup', inferenceReason: 'Setup-derived physical object; confirm this component before matching.', matchEligible: true },
        { id: 'caption', name: 'Lord of the Lords', category: 'card', reviewRequired: true, eligibility: 'setup', matchEligible: true },
        { id: 'star', name: 'blue star', category: 'other', reviewRequired: true, eligibility: 'setup', matchEligible: true },
      ]}
    />
  );

  fireEvent.click(screen.getByRole('button', { name: /Auto-Match Components to Images/i }));
  await waitFor(() => expect(axios.post).toHaveBeenCalled());
  const autoMatchCall = axios.post.mock.calls.find(([url]) => url.includes('/images/auto-match'));
  expect(autoMatchCall[1].components).toEqual([
    expect.objectContaining({ id: 'game-board', name: 'game board' }),
  ]);
});
