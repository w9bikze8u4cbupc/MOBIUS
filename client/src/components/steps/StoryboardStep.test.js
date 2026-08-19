import { fireEvent, render, screen } from '@testing-library/react';
import { preserveVisualDirectionMetadata, StoryboardStep } from './StoryboardStep';

const assets = [{ id: 'board-image', name: 'Approved board image', classification: 'board', page: 2, quality: { score: 0.9 } }];
const manifest = {
  version: '1.2.0', totalEstimatedDurationMs: 3400,
  scenes: [{
    id: 'scene-section-01-1', order: 1, sectionId: 'section-01', title: 'Setup', spokenText: 'Place the board.',
    durationMs: 3400, transition: 'zoom-on-component', visualDirections: [{ instruction: 'Show board.' }],
    sources: [{ section: 1, startOffset: 0, endOffset: 20 }], imageAssetIds: [], visualReviewState: 'needs_visual_review', reviewNotes: '', overlay: { onScreenText: ['Setup'] },
  }],
};

test('renders reviewable canonical scene data and selects only a current-project browser asset', () => {
  const onUpdateScene = jest.fn();
  render(<StoryboardStep onGenerateStoryboard={jest.fn()} onUpdateScene={onUpdateScene} projectId="abyss-project" images={assets} storyboardManifest={manifest} storyboarding={false} />);
  expect(screen.getByTestId('storyboard-summary')).toHaveTextContent('1 scenes · 3.4s estimated');
  expect(screen.getByText('Place the board.')).toBeInTheDocument();
  expect(screen.getByText(/Section 1, 0–20/)).toBeInTheDocument();
  fireEvent.change(screen.getByLabelText('Narration for scene-section-01-1'), { target: { value: 'Move the board.' } });
  expect(onUpdateScene).toHaveBeenCalledWith('scene-section-01-1', { spokenText: 'Move the board.' });
  fireEvent.click(screen.getByRole('button', { name: 'Browse project assets for scene-section-01-1' }));
  fireEvent.click(screen.getByRole('button', { name: 'Select Approved board image for scene-section-01-1 as primary' }));
  expect(onUpdateScene).toHaveBeenLastCalledWith('scene-section-01-1', expect.objectContaining({
    imageAssetIds: ['board-image'], visualReviewState: 'matched',
    visualPlan: expect.objectContaining({ selectedAssetIds: ['board-image'], assetAssignments: [{ assetId: 'board-image', role: 'primary', componentId: null }] }),
  }));
});

test('preserves structured direction references and displays the browser instead of opaque asset IDs', () => {
  const onUpdateScene = jest.fn();
  const structuredManifest = {
    ...manifest,
    scenes: [{
      ...manifest.scenes[0],
      visualDirections: [{ instruction: 'Show the board.', onScreenText: 'Board', camera: 'top-down', highlights: ['board'], arrows: ['token'], componentRefs: ['game-board'] }],
    }],
  };
  render(<StoryboardStep onGenerateStoryboard={jest.fn()} onUpdateScene={onUpdateScene} projectId="abyss-project" images={assets} storyboardManifest={structuredManifest} storyboarding={false} />);
  expect(screen.queryByLabelText('Image assets for scene-section-01-1')).not.toBeInTheDocument();
  fireEvent.change(screen.getByLabelText('Visual directions for scene-section-01-1'), { target: { value: 'Show the game board.' } });
  expect(onUpdateScene).toHaveBeenLastCalledWith('scene-section-01-1', {
    visualDirections: [{
      instruction: 'Show the game board.', onScreenText: 'Board', camera: 'top-down', highlights: ['board'], arrows: ['token'], componentRefs: ['game-board'],
    }],
  });
});

test('preserves metadata by instruction identity through insertion and reordering', () => {
  const directions = [
    { instruction: 'Show cards.', onScreenText: 'Cards', camera: 'close', highlights: ['cards'], arrows: [], componentRefs: ['cards'] },
    { instruction: 'Show board.', onScreenText: 'Board', camera: 'top', highlights: ['board'], arrows: [], componentRefs: ['game-board'] },
  ];
  expect(preserveVisualDirectionMetadata(directions, 'Introduce setup.\nShow board.\nShow cards.')).toEqual([
    { instruction: 'Introduce setup.', onScreenText: '', camera: '', highlights: [], arrows: [], componentRefs: [] },
    directions[1], directions[0],
  ]);
});

test('keeps semantic coverage and requires a reason to apply an operator override', () => {
  const onUpdateScene = jest.fn();
  const coverageManifest = {
    ...manifest,
    scenes: [{
      ...manifest.scenes[0],
      visualPlan: {
        primaryIntent: 'assembled_tableau', primaryComponentRefs: [], supportingComponentRefs: ['monster-tokens'], coverageStatus: 'partial',
        coverageReason: 'Partial — primary visual still missing.', coverageEvidence: [], selectedAssetIds: ['board-image'], assetAssignments: [{ assetId: 'board-image', role: 'supporting' }], assetReuse: [],
        assetCandidates: [], selectionMethod: 'operator_selected', reviewState: 'needs_visual_review', reviewReason: 'Partial — primary visual still missing.', requiresExplicitVisual: true,
      }, imageAssetIds: ['board-image'],
    }],
  };
  render(<StoryboardStep onGenerateStoryboard={jest.fn()} onUpdateScene={onUpdateScene} images={assets} storyboardManifest={coverageManifest} storyboarding={false} />);
  expect(screen.getByText('assembled_tableau')).toBeInTheDocument();
  expect(screen.getAllByText(/Partial — primary visual still missing/).length).toBeGreaterThan(0);
  const apply = screen.getByRole('button', { name: 'Apply override for scene-section-01-1' });
  expect(apply).toBeDisabled();
  fireEvent.change(screen.getByLabelText('Override reason for scene-section-01-1'), { target: { value: 'Approved end card is the only licensed finale image.' } });
  fireEvent.click(apply);
  expect(onUpdateScene).toHaveBeenLastCalledWith('scene-section-01-1', expect.objectContaining({ visualPlan: expect.objectContaining({ operatorOverride: { reason: 'Approved end card is the only licensed finale image.' } }) }));
});

test('limits selected roles to the intent and removes only current-project selections', () => {
  const onUpdateScene = jest.fn();
  const boardManifest = {
    ...manifest,
    scenes: [{ ...manifest.scenes[0], visualPlan: {
      primaryIntent: 'board_setup', primaryComponentRefs: ['game-board'], supportingComponentRefs: [], selectedAssetIds: ['board-image', 'foreign-image'],
      assetAssignments: [{ assetId: 'board-image', role: 'primary', componentId: 'game-board' }, { assetId: 'foreign-image', role: 'overview' }], coverageStatus: 'partial', assetCandidates: [], assetReuse: [], reviewState: 'needs_visual_review', selectionMethod: 'operator_selected', requiresExplicitVisual: true,
    } }],
  };
  render(<StoryboardStep onGenerateStoryboard={jest.fn()} onUpdateScene={onUpdateScene} images={assets} storyboardManifest={boardManifest} storyboarding={false} />);
  const roleSelect = screen.getByLabelText('Role for board-image in scene-section-01-1');
  expect(screen.queryByRole('option', { name: 'overview' })).not.toBeInTheDocument();
  fireEvent.change(roleSelect, { target: { value: 'supporting' } });
  expect(onUpdateScene).toHaveBeenLastCalledWith('scene-section-01-1', expect.objectContaining({ visualPlan: expect.objectContaining({ assetAssignments: [expect.objectContaining({ assetId: 'foreign-image' }), expect.objectContaining({ assetId: 'board-image', role: 'supporting' })] }) }));
  fireEvent.click(screen.getByRole('button', { name: 'Remove board-image from scene-section-01-1' }));
  expect(onUpdateScene).toHaveBeenLastCalledWith('scene-section-01-1', expect.objectContaining({ imageAssetIds: [], visualPlan: expect.objectContaining({ selectedAssetIds: [] }) }));
});
