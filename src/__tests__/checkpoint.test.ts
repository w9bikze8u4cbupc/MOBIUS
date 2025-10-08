import { CheckpointManager } from '../render/checkpoint';
import fs from 'fs/promises';
import path from 'path';
import os from 'os';

describe('CheckpointManager', () => {
  let checkpoint: CheckpointManager;
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'checkpoint-test-'));
    checkpoint = new CheckpointManager('test-job', tempDir);
  });

  afterEach(async () => {
    // Clean up temp directory
    try {
      await fs.rm(tempDir, { recursive: true, force: true });
    } catch (error) {
      // Ignore cleanup errors
    }
  });

  test('should initialize checkpoint', async () => {
    await checkpoint.initialize('test-job');
    const state = checkpoint.getState();
    expect(state).toBeDefined();
    expect(state?.id).toBe('test-job');
    expect(state?.stage).toBe('initialized');
  });

  test('should save and load checkpoint', async () => {
    await checkpoint.initialize('test-job');
    await checkpoint.updateStage('slideshow_mux', 25);
    
    // Create a new checkpoint manager to test loading
    const newCheckpoint = new CheckpointManager('test-job', tempDir);
    const loaded = await newCheckpoint.load();
    
    expect(loaded).toBe(true);
    const state = newCheckpoint.getState();
    expect(state?.stage).toBe('slideshow_mux');
    expect(state?.progress).toBe(25);
  });

  test('should add artifacts', async () => {
    await checkpoint.initialize('test-job');
    await checkpoint.addArtifact('output', '/path/to/output.mp4', 1024);
    
    const state = checkpoint.getState();
    expect(state?.artifacts.output).toBeDefined();
    expect(state?.artifacts.output.path).toBe('/path/to/output.mp4');
    expect(state?.artifacts.output.size).toBe(1024);
  });

  test('should track stage completion', async () => {
    await checkpoint.initialize('test-job');
    await checkpoint.updateStage('slideshow_mux', 25);
    
    expect(checkpoint.isStageCompleted('initialized')).toBe(true);
    expect(checkpoint.isStageCompleted('slideshow_mux')).toBe(true);
    expect(checkpoint.isStageCompleted('audio_mix')).toBe(false);
  });

  test('should mark job as completed', async () => {
    await checkpoint.initialize('test-job');
    await checkpoint.markCompleted();
    
    expect(checkpoint.isStageCompleted('completed')).toBe(true);
    const state = checkpoint.getState();
    expect(state?.stage).toBe('completed');
    expect(state?.progress).toBe(100);
  });

  test('should clean up checkpoint file', async () => {
    await checkpoint.initialize('test-job');
    const checkpointPath = path.join(tempDir, 'render.job.test-job.json');
    
    // Verify file exists
    let exists = await fs.access(checkpointPath).then(() => true).catch(() => false);
    expect(exists).toBe(true);
    
    // Clean up and verify file is gone
    await checkpoint.cleanup();
    exists = await fs.access(checkpointPath).then(() => true).catch(() => false);
    expect(exists).toBe(false);
  });
});