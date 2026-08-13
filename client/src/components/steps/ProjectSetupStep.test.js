import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { ProjectSetupStep } from './ProjectSetupStep';

function renderProjectSetup(overrides = {}) {
  const props = {
    projectId: 'abyss-upload-abc123',
    setProjectId: jest.fn(),
    gameName: '',
    setGameName: jest.fn(),
    language: 'english',
    setLanguage: jest.fn(),
    voice: '',
    setVoice: jest.fn(),
    getLanguageVoices: () => [],
    detailPercentage: 25,
    setDetailPercentage: jest.fn(),
    file: new File(['pdf'], 'Abyss.pdf', { type: 'application/pdf' }),
    rulebookText: 'Rulebook text',
    onFileChange: jest.fn(),
    onDrop: jest.fn(),
    extractingName: false,
    loading: false,
    metadata: {
      publisher: '',
      playerCount: '',
      gameLength: '',
      minimumAge: '',
      theme: '',
      edition: '',
    },
    setMetadata: jest.fn(),
    bggUrl: '',
    ...overrides,
  };

  return { ...render(<ProjectSetupStep {...props} />), props };
}

test('manual game-name entry preserves the non-empty upload project ID', () => {
  const { props } = renderProjectSetup();

  fireEvent.change(screen.getByPlaceholderText('Extracted from PDF'), { target: { value: 'Abyss' } });

  expect(props.setGameName).toHaveBeenCalledWith('Abyss');
  expect(screen.getByPlaceholderText('Auto-generated from uploaded PDF filename')).toHaveValue('abyss-upload-abc123');
  expect(screen.getByPlaceholderText('Auto-generated from uploaded PDF filename')).not.toHaveValue('');
});

test('operator edits to Project ID are sent through the controlled input', () => {
  const { props } = renderProjectSetup();

  fireEvent.change(screen.getByPlaceholderText('Auto-generated from uploaded PDF filename'), { target: { value: 'operator-abyss-id' } });

  expect(props.setProjectId).toHaveBeenCalledWith('operator-abyss-id');
});
