import { fireEvent, render, screen } from '@testing-library/react';
import { preserveVisualDirectionMetadata, StoryboardStep } from './StoryboardStep';

const manifest = {
  version: '1.2.0', totalEstimatedDurationMs: 3400,
  scenes: [{
    id: 'scene-section-01-1', order: 1, sectionId: 'section-01', title: 'Setup', spokenText: 'Place the board.',
    durationMs: 3400, transition: 'zoom-on-component', visualDirections: [{ instruction: 'Show board.' }],
    sources: [{ section: 1, startOffset: 0, endOffset: 20 }], imageAssetIds: [], visualReviewState: 'needs_visual_review', reviewNotes: '', overlay: { onScreenText: ['Setup'] },
  }],
};

test('renders reviewable canonical scene data and forwards operator edits', () => {
  const onUpdateScene = jest.fn();
  render(<StoryboardStep onGenerateStoryboard={jest.fn()} onUpdateScene={onUpdateScene} storyboardManifest={manifest} storyboarding={false} />);
  expect(screen.getByTestId('storyboard-summary')).toHaveTextContent('1 scenes · 3.4s estimated');
  expect(screen.getByText('Place the board.')).toBeInTheDocument();
  expect(screen.getByText(/Section 1, 0–20/)).toBeInTheDocument();
  fireEvent.change(screen.getByLabelText('Narration for scene-section-01-1'), { target: { value: 'Move the board.' } });
  expect(onUpdateScene).toHaveBeenCalledWith('scene-section-01-1', { spokenText: 'Move the board.' });
  fireEvent.change(screen.getByLabelText('Image assets for scene-section-01-1'), { target: { value: 'asset-1, asset-2' } });
  expect(onUpdateScene).toHaveBeenLastCalledWith('scene-section-01-1', expect.objectContaining({ imageAssetIds: ['asset-1', 'asset-2'], visualReviewState: 'matched' }));
});


test('preserves structured direction references and displays hydrated current-project assets', () => {
  const onUpdateScene = jest.fn();
  const structuredManifest = {
    ...manifest,
    scenes: [{
      ...manifest.scenes[0],
      visualDirections: [{ instruction: 'Show the board.', onScreenText: 'Board', camera: 'top-down', highlights: ['board'], arrows: ['token'], componentRefs: ['game-board'] }],
    }],
  };
  render(<StoryboardStep
    onGenerateStoryboard={jest.fn()}
    onUpdateScene={onUpdateScene}
    projectId="abyss-mstkmf2r-4mlb"
    images={[{ id: 'board-image', name: 'Approved board image', source: 'hephaestus' }]}
    storyboardManifest={structuredManifest}
    storyboarding={false}
  />);
  expect(screen.getByRole('option', { name: 'Approved board image' })).toBeInTheDocument();
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
    directions[1],
    directions[0],
  ]);
});
