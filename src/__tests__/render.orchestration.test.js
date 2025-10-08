/**
 * Unit tests for the video rendering pipeline orchestration
 */

import { spawn } from 'child_process';
import { render } from '../render/index.ts';

// Mock child_process.spawn
jest.mock('child_process', () => {
  const mockSpawn = {
    on: jest.fn(),
    kill: jest.fn(),
  };
  
  return {
    spawn: jest.fn(() => mockSpawn),
  };
});

describe('Render Orchestration', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('render function', () => {
    const mockJob = {
      images: ['/path/to/image1.png', '/path/to/image2.png'],
      audioFile: '/path/to/audio.mp3',
      outputDir: '/path/to/output',
    };

    const mockSpawnInstance = {
      on: jest.fn((event, callback) => {
        if (event === 'close') {
          // Simulate successful process completion
          setTimeout(() => callback(0), 10);
        }
        return mockSpawnInstance;
      }),
      kill: jest.fn(),
    };

    beforeEach(() => {
      require('child_process').spawn.mockReturnValue(mockSpawnInstance);
    });

    test('should validate inputs and throw error when images are missing', async () => {
      const job = Object.assign({}, mockJob, { images: [] });
      await expect(render(job)).rejects.toThrow('No images provided for rendering');
    });

    test('should validate inputs and throw error when audio file is missing', async () => {
      const job = Object.assign({}, mockJob, { audioFile: '' });
      await expect(render(job)).rejects.toThrow('No audio file provided for rendering');
    });

    test('should validate inputs and throw error when output directory is missing', async () => {
      const job = Object.assign({}, mockJob, { outputDir: '' });
      await expect(render(job)).rejects.toThrow('No output directory specified');
    });

    test('should handle dry run mode correctly', async () => {
      const options = { dryRun: true };
      const result = await render(mockJob, options);
      
      expect(result).toEqual({
        outputPath: '/path/to/output/preview.mp4',
        thumbnailPath: '/path/to/output/thumbnail.jpg',
        captionPath: undefined,
        metadata: {
          duration: 30,
          fps: 30
        }
      });
    });

    test('should build correct FFmpeg command for preview render', async () => {
      const options = { previewSeconds: 5 };
      await render(mockJob, options);
      
      expect(spawn).toHaveBeenCalledWith('ffmpeg', expect.arrayContaining([
        '-f', 'concat', '-safe', '0', '-i', 'pipe:0',
        '-i', '/path/to/audio.mp3',
        '-c:v', 'libx264',
        '-pix_fmt', 'yuv420p',
        '-c:a', 'aac',
        '-t', '5',
        '-y', '/path/to/output/preview_5s.mp4'
      ]));
    });

    test('should build correct FFmpeg command for full render', async () => {
      await render(mockJob);
      
      expect(spawn).toHaveBeenCalledWith('ffmpeg', expect.arrayContaining([
        '-f', 'concat', '-safe', '0', '-i', 'pipe:0',
        '-i', '/path/to/audio.mp3',
        '-c:v', 'libx264',
        '-pix_fmt', 'yuv420p',
        '-c:a', 'aac',
        '-shortest',
        '-y', '/path/to/output/output.mp4'
      ]));
    });

    test('should handle FFmpeg execution timeout', async () => {
      const mockSpawnInstanceWithTimeout = {
        on: jest.fn((event, callback) => {
          if (event === 'close') {
            // Don't call callback to simulate timeout
          }
          return mockSpawnInstanceWithTimeout;
        }),
        kill: jest.fn(),
      };
      
      require('child_process').spawn.mockReturnValue(mockSpawnInstanceWithTimeout);
      
      const options = { timeoutMs: 10 }; // 10ms timeout for testing
      await expect(render(mockJob, options)).rejects.toThrow('FFmpeg execution timed out after 10ms');
    });

    test('should handle FFmpeg execution error', async () => {
      const mockSpawnInstanceWithError = {
        on: jest.fn((event, callback) => {
          if (event === 'close') {
            // Simulate process error
            setTimeout(() => callback(1), 10);
          } else if (event === 'error') {
            // Simulate spawn error
            setTimeout(() => callback(new Error('Failed to start FFmpeg')), 10);
          }
          return mockSpawnInstanceWithError;
        }),
        kill: jest.fn(),
      };
      
      require('child_process').spawn.mockReturnValue(mockSpawnInstanceWithError);
      
      await expect(render(mockJob)).rejects.toThrow('FFmpeg exited with code 1');
    });
  });
});