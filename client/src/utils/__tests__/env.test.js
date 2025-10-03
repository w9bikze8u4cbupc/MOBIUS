import { getShowTutorial, getDebugTutorial } from '../env';

describe('env utils', () => {
  describe('getShowTutorial', () => {
    const OLD_ENV = process.env;

    beforeEach(() => {
      jest.resetModules();
      process.env = { ...OLD_ENV };
    });

    afterAll(() => {
      process.env = OLD_ENV;
    });

    it('should return false when REACT_APP_SHOW_TUTORIAL is not set', () => {
      delete process.env.REACT_APP_SHOW_TUTORIAL;
      expect(getShowTutorial()).toBe(false);
    });

    it('should return false when REACT_APP_SHOW_TUTORIAL is "false"', () => {
      process.env.REACT_APP_SHOW_TUTORIAL = 'false';
      expect(getShowTutorial()).toBe(false);
    });

    it('should return true when REACT_APP_SHOW_TUTORIAL is "true"', () => {
      process.env.REACT_APP_SHOW_TUTORIAL = 'true';
      expect(getShowTutorial()).toBe(true);
    });

    it('should return true when REACT_APP_SHOW_TUTORIAL is any non-empty string', () => {
      process.env.REACT_APP_SHOW_TUTORIAL = 'yes';
      expect(getShowTutorial()).toBe(true);
    });
  });

  describe('getDebugTutorial', () => {
    const OLD_ENV = process.env;

    beforeEach(() => {
      jest.resetModules();
      process.env = { ...OLD_ENV };
    });

    afterAll(() => {
      process.env = OLD_ENV;
    });

    it('should return false when REACT_APP_DEBUG_TUTORIAL is not set', () => {
      delete process.env.REACT_APP_DEBUG_TUTORIAL;
      expect(getDebugTutorial()).toBe(false);
    });

    it('should return false when REACT_APP_DEBUG_TUTORIAL is "false"', () => {
      process.env.REACT_APP_DEBUG_TUTORIAL = 'false';
      expect(getDebugTutorial()).toBe(false);
    });

    it('should return true when REACT_APP_DEBUG_TUTORIAL is "true"', () => {
      process.env.REACT_APP_DEBUG_TUTORIAL = 'true';
      expect(getDebugTutorial()).toBe(true);
    });

    it('should return true when REACT_APP_DEBUG_TUTORIAL is any non-empty string', () => {
      process.env.REACT_APP_DEBUG_TUTORIAL = 'yes';
      expect(getDebugTutorial()).toBe(true);
    });
  });
});