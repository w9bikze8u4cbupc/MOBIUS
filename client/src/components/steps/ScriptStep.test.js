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


test('shows compact source coverage status only when a generation status is available', () => {
  render(
    <ScriptStep
      loading={false}
      projectId="abyss-project"
      rulebookText="Rulebook text"
      gameName="Abyss"
      language="english"
      components={[{ id: 'cards', name: 'Cards' }]}
      scriptInputReadiness={{ ready: true, message: '' }}
      onSummarize={jest.fn()}
      hasGeneratedScript
      summary="Generated script"
      editedSummary="Generated script"
      onEdit={jest.fn()}
      onSave={jest.fn()}
      translationStatus={{ error: null }}
      summaryWarning=""
      generationStatus={{ sourceChars: 20914, chunkCount: 4, completedChunks: 4, finalScriptLength: 1696 }}
      aiStatus={{ ready: true, message: 'AI model is ready.' }}
      aiStatusLoading={false}
      onRefreshAiStatus={jest.fn()}
    />,
  );

  expect(screen.getByLabelText('Generation status')).toHaveTextContent(/Source: 20[\s,]914 chars · Chunks: 4\/4 · Final script: 1[\s,]696 chars/);
});


test('does not show success and clears the preview affordance for discarded legacy fallback output', () => {
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
      scriptProvenance="legacy_invalid_fallback"
      summary=""
      editedSummary=""
      onEdit={jest.fn()}
      onSave={jest.fn()}
      translationStatus={{ error: null }}
      summaryWarning="A previous incomplete fallback was discarded. Generate a source-complete script to continue."
      aiStatus={{ ready: true, message: 'AI model is ready.' }}
      aiStatusLoading={false}
      onRefreshAiStatus={jest.fn()}
    />,
  );

  expect(screen.getByText('A previous incomplete fallback was discarded. Generate a source-complete script to continue.')).toBeInTheDocument();
  expect(screen.queryByText('Script generated successfully')).not.toBeInTheDocument();
  expect(screen.getByText('No script yet. Generate one to see the preview here.')).toBeInTheDocument();
});

test('shows success only for a source-complete generated provenance on the current attempt', () => {
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
      scriptProvenance="generated_source_complete"
      summary="Generated script"
      editedSummary="Generated script"
      onEdit={jest.fn()}
      onSave={jest.fn()}
      translationStatus={{ error: null }}
      summaryWarning=""
      generationStatus={{ sourceComplete: true }}
      aiStatus={{ ready: true, message: 'AI model is ready.' }}
      aiStatusLoading={false}
      onRefreshAiStatus={jest.fn()}
    />,
  );

  expect(screen.getByText('Script generated successfully')).toBeInTheDocument();
});


test('labels narration separately from non-spoken visual directions and source provenance', () => {
  render(
    <ScriptStep
      loading={false} projectId="abyss-project" rulebookText="Rulebook text" gameName="Abyss" language="english"
      components={[{ id: 'cards', name: 'Cards' }]} scriptInputReadiness={{ ready: true, message: '' }}
      onSummarize={jest.fn()} summary="## Setup\n\nPlace the board." editedSummary="## Setup\n\nPlace the board."
      scriptPackage={{ sections: [{ id: 'section-01', title: 'Setup', spokenText: 'Place the board.', visualDirections: [{ instruction: 'Show the board.' }], sources: [{ section: 1, startOffset: 0, endOffset: 100 }] }] }}
      onEdit={jest.fn()} onSave={jest.fn()} translationStatus={{ error: null }} summaryWarning=""
      aiStatus={{ ready: true, message: 'AI model is ready.' }} aiStatusLoading={false} onRefreshAiStatus={jest.fn()}
    />,
  );
  expect(screen.getByText('Narration (spoken text only)')).toBeInTheDocument();
  expect(screen.getByLabelText('Visual directions and sources')).toHaveTextContent('Visual directions & source provenance (non-spoken)');
  expect(screen.getByLabelText('Visual directions and sources')).toHaveTextContent('Section 1, offsets 0-100');
});