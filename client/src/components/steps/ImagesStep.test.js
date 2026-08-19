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

test('shows a pending storyboard-review summary without treating zero links as visual coverage', () => {
  render(
    <ImagesStep
      projectId="abyss-image-review"
      pdfFile={pdfFile}
      imageReviewSummary={{ curatedCandidateCount: 144, approvedLinkCount: 0, unresolvedComponentCount: 9 }}
      imageReviewStatus={{ status: 'pending_visual_storyboard_review' }}
    />
  );

  expect(screen.getByText('144 curated candidates / 0 approved links / 9 components awaiting storyboard review')).toBeInTheDocument();
  expect(screen.getByText(/No component links have been approved yet/i)).toBeInTheDocument();
  expect(screen.getByText(/next review gate is Storyboard/i)).toBeInTheDocument();
  expect(screen.getByText(/not visual-coverage approval/i)).toBeInTheDocument();
});

test('shows explicit readiness errors and disables both image actions when project ID is missing', () => {
  render(<ImagesStep pdfFile={pdfFile} />);

  expect(screen.getByText(/Project identifier is missing/i)).toBeInTheDocument();
  expect(screen.getByRole('button', { name: /Auto-Gather All Images/i })).toBeDisabled();
  expect(screen.getByRole('button', { name: /Extract with HEPHAESTUS/i })).toBeDisabled();
  expect(axios.post).not.toHaveBeenCalled();
});

test('marks a project without a stored source as requiring explicit legacy adoption', () => {
  render(<ImagesStep projectId="abyss-upload-abc123" />);

  expect(screen.getAllByText(/Legacy project requires explicit adoption/i)).toHaveLength(2);
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

test('Auto-Gather uses only HEPHAESTUS and returns a clean local result without legacy or BGG calls', async () => {
  axios.post.mockResolvedValue({
    data: { images: [], componentImages: {}, imagesCount: 433, mode: 'hephaestus', stats: { native: 433 } },
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
      expect.stringContaining('/api/projects/abyss-upload-abc123/images/extract-hephaestus'),
      expect.any(FormData),
      expect.objectContaining({ headers: { 'Content-Type': 'multipart/form-data' } }),
    );
  });

  const [url, formData] = axios.post.mock.calls[0];
  expect(formData.get('file')).toBe(pdfFile);
  expect(formData.get('minWidth')).toBe('1');
  expect(formData.get('minHeight')).toBe('1');
  expect(url).not.toMatch(/extract-native|extract-pdf|fetch-bgg/);
  expect(axios.post.mock.calls).toHaveLength(1);
  expect(await screen.findByText(/Extracted 433 local images using HEPHAESTUS/i)).toBeInTheDocument();
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
  expect(await screen.findByText(/Top review suggestions/i)).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: /Select Ocean Card for Ocean Card; 90% automatic link/i }));
  expect(screen.getByRole('dialog', { name: /Selected image preview/i })).toBeInTheDocument();
  expect(screen.getByRole('button', { name: /Link selected image to Ocean Card/i })).toBeInTheDocument();
});
test('requires explicit confirmation to manually link and remove a sub-90% review suggestion', async () => {
  const explorationImage = {
    id: 'exploration-card',
    source: 'hephaestus',
    label: 'Exploration Card',
    type: 'card',
    width: 600,
    height: 900,
    fileKey: 'data/abyss/exploration-card.png',
    thumbnailKey: 'data/abyss/exploration-card-thumb.png',
    curation: { candidate: true, score: 0.89, reasons: ['native component image'] },
    metadata: { classification: 'card', page: 7, curation: { candidate: true, score: 0.89 } },
  };
  const component = { id: 'exploration-card-component', name: 'Exploration Card', category: 'card', quantity: 1 };
  const candidates = {
    [component.id]: [{ imageId: explorationImage.id, score: 0.89, autoLink: false, reasons: ['category/type match', 'label proximity'] }],
  };
  axios.get.mockResolvedValue({ data: { images: [explorationImage], componentImages: {} } });
  axios.post.mockImplementation((url, body) => {
    if (url.includes('/images/auto-match')) {
      return Promise.resolve({ data: { images: [explorationImage], componentImages: {}, candidates, stats: { total: 1, totalMatched: 0, ruleMatched: 0, unmatched: 1 }, matched: 0 } });
    }
    if (url.includes(`/components/${component.id}/images`)) {
      const imageIds = body.imageIds || [];
      return Promise.resolve({ data: { images: [explorationImage], componentImages: imageIds.length ? { [component.id]: imageIds } : {} } });
    }
    return Promise.resolve({ data: {} });
  });

  render(
    <ImagesStep
      projectId="abyss-upload-abc123"
      pdfFile={pdfFile}
      components={[component]}
      images={[explorationImage]}
      componentImages={{}}
    />,
  );

  fireEvent.click(screen.getByRole('button', { name: /Auto-Match Components to Images/i }));
  const suggestion = await screen.findByRole('button', { name: /Select Exploration Card for Exploration Card; 89% review suggestion/i });
  expect(screen.getByText('0 images')).toBeInTheDocument();

  fireEvent.click(suggestion);
  expect(screen.getByRole('dialog', { name: /Selected image preview/i })).toHaveTextContent('600 × 900');
  expect(screen.getByRole('dialog', { name: /Selected image preview/i })).toHaveTextContent('Source page');
  expect(axios.post.mock.calls.filter(([url]) => url.includes(`/components/${component.id}/images`))).toHaveLength(0);

  fireEvent.click(screen.getByRole('button', { name: /Link selected image to Exploration Card/i }));
  await waitFor(() => expect(screen.getByText('1 image')).toBeInTheDocument());
  const linkCall = axios.post.mock.calls.find(([url]) => url.includes(`/components/${component.id}/images`));
  expect(linkCall[1]).toEqual({ imageIds: [explorationImage.id], manualImageIds: [explorationImage.id] });
  expect(screen.getByText('Linked Images:')).toBeInTheDocument();

  fireEvent.click(screen.getByRole('button', { name: 'Remove link' }));
  await waitFor(() => expect(screen.getByText('0 images')).toBeInTheDocument());
  const removeCall = axios.post.mock.calls.filter(([url]) => url.includes(`/components/${component.id}/images`))[1];
  expect(removeCall[1]).toEqual({ imageIds: [], manualImageIds: [] });
});

test('shows only the top six review suggestions until the operator asks to view all candidates', async () => {
  const component = { id: 'exploration-cards', name: 'Exploration Cards', category: 'card', quantity: 1 };
  const images = Array.from({ length: 7 }, (_value, index) => ({
    id: `candidate-${index + 1}`,
    source: 'hephaestus',
    label: `Candidate ${index + 1}`,
    type: 'card',
    fileKey: `data/abyss/candidate-${index + 1}.png`,
    thumbnailKey: `data/abyss/candidate-${index + 1}-thumb.png`,
    curation: { candidate: true, score: 0.8, reasons: [] },
    metadata: { classification: 'card', curation: { candidate: true, score: 0.8 } },
  }));
  const candidates = images.map((image, index) => ({ imageId: image.id, score: 0.89 - (index * 0.01), autoLink: false, reasons: ['category/type match'] }));
  axios.get.mockResolvedValue({ data: { images, componentImages: {} } });
  axios.post.mockResolvedValue({ data: { images, componentImages: {}, candidates: { [component.id]: candidates }, stats: { total: 1, totalMatched: 0, ruleMatched: 0, unmatched: 1 }, matched: 0 } });

  render(<ImagesStep projectId="abyss-upload-abc123" pdfFile={pdfFile} components={[component]} images={images} componentImages={{}} />);
  fireEvent.click(screen.getByRole('button', { name: /Auto-Match Components to Images/i }));

  expect(await screen.findByText(/Top review suggestions \(showing 6 of 7\)/i)).toBeInTheDocument();
  expect(screen.queryByRole('button', { name: /Select Candidate 7/i })).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'View all 7 candidates' }));
  expect(screen.getByRole('button', { name: /Select Candidate 7/i })).toBeInTheDocument();
  expect(screen.queryByText(/Ranked candidates/i)).not.toBeInTheDocument();
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


test('restores a durable source after reload and enables extraction without a browser File', () => {
  render(
    <ImagesStep
      projectId="abyss-upload-abc123"
      sourcePdf={{
        sourceId: 'source-aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
        documentId: 'abyss-upload-abc123',
        documentFingerprint: 'document-bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb',
        filename: 'Abyss.pdf', sha256: 'c'.repeat(64), bytes: 42, pageCount: 1,
        provenance: 'direct_project_upload', status: 'available',
      }}
    />,
  );

  expect(screen.getByText('Source PDF available.')).toBeInTheDocument();
  expect(screen.getByRole('button', { name: /Auto-Gather All Images/i })).toBeEnabled();
  expect(screen.getByRole('button', { name: /Extract with HEPHAESTUS/i })).toBeEnabled();
});


test('exposes direct contextual rendering for a newly stored source without historical adoption', async () => {
  const sourcePdf = {
    sourceId: 'source-aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa', documentId: 'abyss-upload-abc123',
    documentFingerprint: 'document-bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb', filename: 'Abyss.pdf',
    sha256: 'c'.repeat(64), bytes: 42, pageCount: 1, provenance: 'direct_project_upload', status: 'pending_contextual_render',
  };
  const onSourcePdfUpdated = jest.fn();
  axios.post.mockResolvedValue({ data: { contextualEvidence: { available: true } } });
  render(<ImagesStep projectId="abyss-upload-abc123" sourcePdf={sourcePdf} onSourcePdfUpdated={onSourcePdfUpdated} />);

  fireEvent.click(screen.getByRole('button', { name: 'Render contextual evidence' }));
  await waitFor(() => expect(axios.post).toHaveBeenCalledWith(
    expect.stringContaining('/api/projects/abyss-upload-abc123/contextual-evidence/render'),
  ));
  expect(onSourcePdfUpdated).toHaveBeenCalledWith({ ...sourcePdf, status: 'available' });
  expect(await screen.findByText('Contextual rulebook evidence is available.')).toBeInTheDocument();
});
