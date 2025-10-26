import { spawn, ChildProcess } from 'child_process';

export class ProgressParser {
  constructor() {
    this.process = null;
    this.lastProgress = null;
    this.startTime = Date.now();
  }

  /**
   * Start monitoring FFmpeg progress
   * @param process The FFmpeg child process
   * @param onProgress Callback for progress updates
   * @param onComplete Callback for completion
   * @param onError Callback for errors
   */
  start(process, onProgress, onComplete, onError) {
    this.process = process;
    this.lastProgress = null;

    // Handle process events
    process.on('error', (err) => {
      onError(err);
    });

    process.on('close', (code) => {
      if (code === 0) {
        // Success - generate final metadata
        const metadata = {
          duration: 0, // Will be set by progress parsing
          fps: 30, // Default value
          size: 'unknown',
          videoCodec: 'libx264',
          audioCodec: 'aac'
        };
        onComplete(metadata);
      } else {
        onError(new Error(`FFmpeg exited with code ${code}`));
      }
    });

    // Parse progress output
    if (process.stderr) {
      let progressBuffer = '';
      process.stderr.on('data', (data) => {
        progressBuffer += data.toString();
        const lines = progressBuffer.split('\n');
        progressBuffer = lines.pop() || '';

        for (const line of lines) {
          this.parseProgressLine(line, onProgress);
        }
      });
    }
  }

  /**
   * Parse a single line of FFmpeg progress output
   * @param line Progress line to parse
   * @param onProgress Callback for progress updates
   */
  parseProgressLine(line, onProgress) {
    // Parse key=value pairs
    const pairs = {};
    const regex = /(\w+)=(.*)/g;
    let match;
    
    while ((match = regex.exec(line)) !== null) {
      pairs[match[1]] = match[2];
    }

    // If we have progress info, update and notify
    if (pairs.out_time_ms || pairs.frame) {
      const info = {
        percent: this.calculatePercent(pairs),
        eta: this.calculateETA(pairs),
        speed: parseFloat(pairs.speed) || 0,
        frame: parseInt(pairs.frame) || 0,
        time: pairs.out_time || '00:00:00.00'
      };

      this.lastProgress = info;
      onProgress(info);
    }
  }

  /**
   * Calculate render percentage
   * @param pairs Parsed key=value pairs from FFmpeg
   * @returns Percentage complete (0-100)
   */
  calculatePercent(pairs) {
    // This would be implemented based on target duration vs current time
    // For now, we'll return a placeholder
    const timeMs = parseInt(pairs.out_time_ms) || 0;
    return Math.min(100, Math.max(0, timeMs / 10000000)); // Placeholder calculation
  }

  /**
   * Calculate ETA
   * @param pairs Parsed key=value pairs from FFmpeg
   * @returns ETA string
   */
  calculateETA(pairs) {
    // This would be implemented based on current progress and speed
    // For now, we'll return a placeholder
    return '00:00:00';
  }

  /**
   * Kill the process with grace period
   * @param gracePeriodMs Grace period in milliseconds before force kill
   */
  async kill(gracePeriodMs = 5000) {
    if (!this.process) return;

    return new Promise((resolve) => {
      if (!this.process || this.process.killed) {
        resolve();
        return;
      }

      // Send SIGTERM first
      this.process.kill('SIGTERM');

      // Set up force kill timer
      const forceKillTimer = setTimeout(() => {
        if (this.process && !this.process.killed) {
          this.process.kill('SIGKILL');
        }
        resolve();
      }, gracePeriodMs);

      // Listen for process exit
      this.process.on('exit', () => {
        clearTimeout(forceKillTimer);
        resolve();
      });
    });
  }
}