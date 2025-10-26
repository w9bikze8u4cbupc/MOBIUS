import fs from 'fs/promises';
import path from 'path';

export class CheckpointManager {
  constructor(jobId, outputDir) {
    this.jobFilePath = path.join(outputDir, `render.job.${jobId}.json`);
    this.state = null;
  }

  /**
   * Initialize a new render job
   * @param jobId Unique identifier for the job
   * @returns Promise that resolves when initialized
   */
  async initialize(jobId) {
    this.state = {
      id: jobId,
      stage: 'initialized',
      progress: 0,
      artifacts: {},
      timestamp: Date.now(),
      metadata: {}
    };
    await this.save();
  }

  /**
   * Load existing job state if it exists
   * @returns Promise that resolves with true if state was loaded, false otherwise
   */
  async load() {
    try {
      const data = await fs.readFile(this.jobFilePath, 'utf8');
      this.state = JSON.parse(data);
      return true;
    } catch (error) {
      // File doesn't exist or is invalid
      return false;
    }
  }

  /**
   * Save current job state
   * @returns Promise that resolves when saved
   */
  async save() {
    if (!this.state) {
      throw new Error('Job not initialized');
    }
    
    this.state.timestamp = Date.now();
    const data = JSON.stringify(this.state, null, 2);
    await fs.writeFile(this.jobFilePath, data, 'utf8');
  }

  /**
   * Update job stage
   * @param stage New stage
   * @param progress Progress percentage
   * @returns Promise that resolves when updated
   */
  async updateStage(stage, progress = 0) {
    if (!this.state) {
      throw new Error('Job not initialized');
    }
    
    this.state.stage = stage;
    this.state.progress = progress;
    await this.save();
  }

  /**
   * Add artifact to job state
   * @param name Artifact name
   * @param artifactPath Path to artifact
   * @param size Size in bytes
   * @returns Promise that resolves when added
   */
  async addArtifact(name, artifactPath, size) {
    if (!this.state) {
      throw new Error('Job not initialized');
    }
    
    this.state.artifacts[name] = {
      path: artifactPath,
      size: size
    };
    await this.save();
  }

  /**
   * Get current job state
   * @returns Current job state or null if not initialized
   */
  getState() {
    return this.state;
  }

  /**
   * Check if a stage has been completed
   * @param stage Stage to check
   * @returns True if stage is completed or beyond, false otherwise
   */
  isStageCompleted(stage) {
    if (!this.state) return false;
    
    const stageOrder = [
      'initialized',
      'slideshow_mux',
      'audio_mix',
      'burn_in',
      'thumbnail',
      'completed'
    ];
    
    const currentStageIndex = stageOrder.indexOf(this.state.stage);
    const targetStageIndex = stageOrder.indexOf(stage);
    
    return currentStageIndex >= targetStageIndex;
  }

  /**
   * Mark job as completed
   * @returns Promise that resolves when marked as completed
   */
  async markCompleted() {
    if (!this.state) {
      throw new Error('Job not initialized');
    }
    
    this.state.stage = 'completed';
    this.state.progress = 100;
    await this.save();
  }

  /**
   * Clean up checkpoint file
   * @returns Promise that resolves when cleaned up
   */
  async cleanup() {
    try {
      await fs.unlink(this.jobFilePath);
    } catch (error) {
      // Ignore errors if file doesn't exist
    }
  }
}