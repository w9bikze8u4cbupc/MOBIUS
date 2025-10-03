import React from 'react';
import { render } from '@testing-library/react';
import TutorialOrchestrator from './TutorialOrchestrator';

// Mock the env utility
jest.mock('../utils/env', () => ({
  getShowTutorial: jest.fn(),
}));

describe('TutorialOrchestrator', () => {
  const OLD_ENV = process.env;

  beforeEach(() => {
    jest.resetModules();
    process.env = { ...OLD_ENV };
  });

  afterAll(() => {
    process.env = OLD_ENV;
  });

  it('should render nothing when showTutorial is false', () => {
    require('../utils/env').getShowTutorial.mockReturnValue(false);
    const { container } = render(React.createElement(TutorialOrchestrator));
    expect(container.firstChild).toBeNull();
  });

  it('should render tutorial content when showTutorial is true', () => {
    require('../utils/env').getShowTutorial.mockReturnValue(true);
    // Since we're testing the outer component only, we just check that something is rendered
    const { container } = render(React.createElement(TutorialOrchestrator));
    expect(container.firstChild).not.toBeNull();
  });
});