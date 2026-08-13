import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { IngestionReviewStep } from './IngestionReviewStep';

function renderReview(gameComponents) {
  return render(
    <IngestionReviewStep
      onRunIngestion={jest.fn()}
      ingesting={false}
      rulebookText="Components\n7 cards"
      ingestionManifest={{ outline: [] }}
      ingestionError=""
      gameName="Abyss"
      gameComponents={gameComponents}
      setGameComponents={jest.fn()}
      onExtractComponents={jest.fn()}
      extractingComponents={false}
    />
  );
}

test('does not render anonymous inventory rows and shows a visible review warning', () => {
  renderReview([
    { id: 'blank', name: '   ', category: 'other' },
    { id: 'card', name: 'Ocean cards', category: 'card', quantity: 7, details: '' },
  ]);

  expect(screen.getByText('Ocean cards')).toBeInTheDocument();
  expect(screen.queryByText('blank')).not.toBeInTheDocument();
  expect(screen.getByRole('alert')).toHaveTextContent(/inventory candidate/i);
  expect(screen.getByText(/1 named component type/i)).toBeInTheDocument();
});

test('allows the operator to add a named editable component', () => {
  const setGameComponents = jest.fn();
  render(
    <IngestionReviewStep
      onRunIngestion={jest.fn()}
      ingesting={false}
      rulebookText="Components"
      ingestionManifest={null}
      ingestionError=""
      gameName="Abyss"
      gameComponents={[]}
      setGameComponents={setGameComponents}
      onExtractComponents={jest.fn()}
      extractingComponents={false}
    />
  );

  fireEvent.click(screen.getByRole('button', { name: /Add Component/i }));
  fireEvent.change(screen.getByPlaceholderText('Component name'), { target: { value: 'Player board' } });
  fireEvent.click(screen.getByRole('button', { name: /^Add$/i }));
  expect(setGameComponents).toHaveBeenCalled();
});
