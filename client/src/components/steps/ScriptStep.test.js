import React from 'react';

jest.mock('react-markdown', () => ({
  __esModule: true,
  default: ({ children }) => <div>{children}</div>,
}));
import { fireEvent, render, screen } from '@testing-library/react';
import { ScriptStep } from './ScriptStep';

test('shows optional summary failures as a local non-blocking warning', () => {
  render(
    <ScriptStep
      loading={false}
      projectId="abyss-project"
      rulebookText="Rulebook text"
      gameName="Abyss"
      language="english"
      components={[{ id: 'component-1', name: 'Cards' }]}
      scriptInputReadiness={{ ready: true, message: '' }}
      onSummarize={jest.fn()}
      summary=""
      editedSummary=""
      onEdit={jest.fn()}
      onSave={jest.fn()}
      translationStatus={{ error: null }}
      summaryWarning="Failed to generate summary"
      aiStatus={{ ready: false, message: 'Set OPENAI_MODEL before generating.' }}
      aiStatusLoading={false}
      onRefreshAiStatus={jest.fn()}
    />
  );

  expect(screen.getByRole('button', { name: 'Generate optional AI summary' })).toBeInTheDocument();
  expect(screen.getByText('Failed to generate summary')).toHaveClass('status-badge-warning');
});

test('shows unavailable AI setup guidance, disables generation, and allows a refresh', () => {
  const onRefreshAiStatus = jest.fn();
  render(
    <ScriptStep
      loading={false}
      projectId="abyss-project"
      rulebookText="Rulebook text"
      gameName="Abyss"
      language="english"
      components={[{ id: 'component-1', name: 'Cards' }]}
      scriptInputReadiness={{ ready: true, message: '' }}
      onSummarize={jest.fn()}
      summary=""
      editedSummary=""
      onEdit={jest.fn()}
      onSave={jest.fn()}
      translationStatus={{ error: null }}
      summaryWarning=""
      aiStatus={{ ready: false, message: 'OPENAI_MODEL must be configured before AI generation.' }}
      aiStatusLoading={false}
      onRefreshAiStatus={onRefreshAiStatus}
    />
  );

  expect(screen.getByLabelText('AI readiness')).toHaveTextContent('OPENAI_MODEL must be configured before AI generation.');
  expect(screen.getByRole('button', { name: 'Generate optional AI summary' })).toBeDisabled();
  screen.getByRole('button', { name: 'Refresh AI status' }).click();
  expect(onRefreshAiStatus).toHaveBeenCalledTimes(1);
});

test('keeps generation disabled until model access has been explicitly verified', () => {
  render(
    <ScriptStep
      loading={false}
      projectId="abyss-project"
      rulebookText="Rulebook text"
      gameName="Abyss"
      language="english"
      components={[{ id: 'component-1', name: 'Cards' }]}
      scriptInputReadiness={{ ready: true, message: '' }}
      onSummarize={jest.fn()}
      summary=""
      editedSummary=""
      onEdit={jest.fn()}
      onSave={jest.fn()}
      translationStatus={{ error: null }}
      summaryWarning=""
      aiStatus={{ configured: true, ready: false, message: 'AI configuration is loaded. Refresh AI status before generating to verify model access.' }}
      aiStatusLoading={false}
      onRefreshAiStatus={jest.fn()}
    />
  );

  expect(screen.getByRole('button', { name: 'Generate optional AI summary' })).toBeDisabled();
});


test.each([
  ['missing rulebook text', '', [{ id: 'cards', name: 'Cards' }], 'Cannot generate: this project has no persisted rulebook text.'],
  ['missing components', 'A complete rulebook', [], 'Cannot generate: this project has no validated component inventory.'],
])('blocks generation for %s without invoking the request callback', (_label, rulebookText, components, message) => {
  const onSummarize = jest.fn();
  render(
    <ScriptStep
      loading={false}
      projectId="abyss-project"
      rulebookText={rulebookText}
      gameName="Abyss"
      language="english"
      components={components}
      scriptInputReadiness={{ ready: false, message }}
      onSummarize={onSummarize}
      hasGeneratedScript={false}
      summary=""
      editedSummary="Existing operator script"
      onEdit={jest.fn()}
      onSave={jest.fn()}
      translationStatus={{ error: null }}
      summaryWarning=""
      aiStatus={{ ready: true, message: 'AI model is ready.' }}
      aiStatusLoading={false}
      onRefreshAiStatus={jest.fn()}
    />,
  );

  const generate = screen.getByRole('button', { name: 'Generate optional AI summary' });
  expect(generate).toBeDisabled();
  fireEvent.click(generate);
  expect(onSummarize).not.toHaveBeenCalled();
  expect(screen.getByText(message)).toBeInTheDocument();
  expect(screen.queryByText('Script generated successfully')).not.toBeInTheDocument();
  expect(screen.getByDisplayValue('Existing operator script')).toBeInTheDocument();
});