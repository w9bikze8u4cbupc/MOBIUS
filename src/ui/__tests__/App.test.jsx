import React from 'react';
import { render, screen } from '@testing-library/react';
import App from '../App';

// Mock react-dom/client since it's not available in test environment
jest.mock('react-dom/client', () => ({
  createRoot: () => ({
    render: () => {}
  })
}));

// Mock the components to avoid complex dependencies
jest.mock('../ScriptEditor', () => {
  return function MockScriptEditor() {
    return <div data-testid="script-editor">Script Editor</div>;
  };
});

jest.mock('../ImageMatcher', () => {
  return function MockImageMatcher() {
    return <div data-testid="image-matcher">Image Matcher</div>;
  };
});

describe('App', () => {
  test('renders without crashing', () => {
    render(<App />);
    expect(screen.getByText('Mobius Script Editor (Phase F)')).toBeInTheDocument();
  });

  test('renders script editor by default', () => {
    render(<App />);
    expect(screen.getByTestId('script-editor')).toBeInTheDocument();
  });

  test('can switch to image matcher', () => {
    render(<App />);
    const imageMatcherButton = screen.getByText('Image Matcher');
    imageMatcherButton.click();
    expect(screen.getByTestId('image-matcher')).toBeInTheDocument();
  });
});