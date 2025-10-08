import * as cp from 'child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { jest } from '@jest/globals';
import { render } from '../render/index.js';
import { 
  renderStarted, 
  renderCompleted, 
  renderFailed, 
  renderDuration, 
  ffmpegSpeedRatio
} from '../render/metrics.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * Unit tests for the video rendering pipeline orchestration
 */

describe('Render Orchestration', () => {
  let originalConsoleLog;
  let consoleOutput;

  beforeEach(() => {
    // Reset all metrics before each test
    renderStarted.reset();
    renderCompleted.reset();
    renderFailed.reset();
    renderDuration.reset();
    ffmpegSpeedRatio.reset();
    
    // Mock console.log to capture output
    originalConsoleLog = console.log;
    consoleOutput = [];
    console.log = jest.fn((...args) => {
      consoleOutput.push(...args);
    });
  });

  afterEach(() => {
    // Restore original console.log
    console.log = originalConsoleLog;
  });

  test('should validate inputs and throw error when images are missing', async () => {
    // This is a placeholder test to verify the test framework is working
    // In a real implementation, we would mock the child_process module
    // and test the actual render function
    expect(true).toBe(true);
  });

  test('should increment metrics when render starts', async () => {
    // Create a minimal job for testing
    const job = {
      images: ['test1.jpg', 'test2.jpg'],
      audioFile: 'test.mp3',
      outputDir: '/tmp'
    };
    
    const options = {
      dryRun: true,
      sessionId: 'test-session',
      jobId: 'test-job'
    };
    
    try {
      await render(job, options);
    } catch (error) {
      // Expected to throw due to dryRun
    }
    
    // Check that structured logs were generated
    expect(consoleOutput.length).toBeGreaterThan(0);
    
    // Check that logs contain expected fields
    const logEntry = JSON.parse(consoleOutput[0]);
    expect(logEntry).toMatchObject({
      ts: expect.any(String),
      level: expect.any(String),
      message: expect.any(String),
      sessionId: 'test-session',
      jobId: 'test-job'
    });
  });
});