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


test('shows inventory coverage, source provenance, and unparsed review rows', () => {
  render(
    <IngestionReviewStep
      onRunIngestion={jest.fn()}
      ingesting={false}
      rulebookText="Contents & Setup\n71 Exploration cards"
      ingestionManifest={null}
      ingestionError=""
      gameName="Abyss"
      gameComponents={[
        {
          id: 'exploration-cards',
          name: 'Exploration cards',
          category: 'card',
          quantity: 71,
          details: '',
          sourcePage: 2,
          sourceQuote: '71 Exploration cards (65 Allies & 6 Monsters):',
          reviewRequired: false,
        },
      ]}
      componentExtraction={{
        sectionFound: true,
        sectionHeading: 'Contents & Setup',
        reviewRequired: true,
        coverage: { rawRowCount: 3, parsedRowCount: 1, unparsedRowCount: 1, silentlyDroppedRowCount: 0 },
        rawRows: [{
          id: 'source-row-1',
          sourcePage: 2,
          sourceQuote: 'Back of the Front',
          status: 'ambiguous',
          reviewRequired: true,
          reason: 'Unparsed source row in the detected contents/material section; operator review is required.',
        }],
      }}
      setGameComponents={jest.fn()}
      onExtractComponents={jest.fn()}
      extractingComponents={false}
    />
  );

  expect(screen.getByRole('alert')).toHaveTextContent(/Inventory coverage is incomplete/i);
  expect(screen.getByText('Source Rows Requiring Review')).toBeInTheDocument();
  expect(screen.getByText(/Back of the Front/i)).toBeInTheDocument();
  expect(screen.getAllByText(/Page 2/i).length).toBeGreaterThan(0);
  expect(screen.getByText(/71 Exploration cards/)).toBeInTheDocument();
});
