import LoggingService from '../LoggingService';

describe('LoggingService', () => {
  let consoleSpy;

  beforeEach(() => {
    consoleSpy = jest.spyOn(console, 'log').mockImplementation(() => {});
  });

  afterEach(() => {
    consoleSpy.mockRestore();
  });

  describe('logging methods', () => {
    it('should log messages with correct levels', () => {
      const testService = 'TestService';
      const testMessage = 'Test message';

      LoggingService.error(testService, testMessage);
      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('ERROR - TestService: Test message'),
      );

      LoggingService.info(testService, testMessage);
      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('INFO - TestService: Test message'),
      );
    });
  });
});
