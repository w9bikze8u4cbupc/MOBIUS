import React from 'react';

jest.mock('react-markdown', () => ({
  __esModule: true,
  default: ({ children }) => <div>{children}</div>,
}));
import { render, screen } from '@testing-library/react';
import { ScriptStep } from './ScriptStep';

test('shows optional summary failures as a local non-blocking warning', () => {
  render(
    <ScriptStep
      loading={false}
      rulebookText="Rulebook text"
      gameName="Abyss"
      onSummarize={jest.fn()}
      summary=""
      editedSummary=""
      onEdit={jest.fn()}
      onSave={jest.fn()}
      translationStatus={{ error: null }}
      summaryWarning="Failed to generate summary"
    />
  );

  expect(screen.getByRole('button', { name: 'Generate optional AI summary' })).toBeInTheDocument();
  expect(screen.getByText('Failed to generate summary')).toHaveClass('status-badge-warning');
});
