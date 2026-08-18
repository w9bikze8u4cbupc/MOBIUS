import { fireEvent, render, screen } from '@testing-library/react';
import { StoryboardStep } from './StoryboardStep';

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
  expect(screen.getByTestId('storyboard-summary')).toHaveTextContent('1 scenes');
  expect(screen.getByText('Place the board.')).toBeInTheDocument();
  expect(screen.getByText(/Section 1, 0–20/)).toBeInTheDocument();
  fireEvent.change(screen.getByLabelText('Narration for scene-section-01-1'), { target: { value: 'Move the board.' } });
  expect(onUpdateScene).toHaveBeenCalledWith('scene-section-01-1', { spokenText: 'Move the board.' });
  fireEvent.change(screen.getByLabelText('Image assets for scene-section-01-1'), { target: { value: 'asset-1, asset-2' } });
  expect(onUpdateScene).toHaveBeenLastCalledWith('scene-section-01-1', { imageAssetIds: ['asset-1', 'asset-2'] });
});
