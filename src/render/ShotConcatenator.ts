// Shot concatenator that handles joining video segments

import { spawnSync } from 'child_process';
import fs from 'fs';
import path from 'path';

export class ShotConcatenator {
  private tmpDir: string;
  
  constructor(tmpDir: string = "out/.render") {
    this.tmpDir = tmpDir;
    // Ensure tmp directory exists
    if (!fs.existsSync(this.tmpDir)) {
      fs.mkdirSync(this.tmpDir, { recursive: true });
    }
  }
  
  /**
   * Concatenate video segments using the concat demuxer method
   * This is more efficient than the concat filter for simple concatenation
   */
  concatenateWithDemuxer(segmentPaths: string[], outputPath: string): boolean {
    try {
      // Create concat list file
      const listPath = path.join(this.tmpDir, "concat_list.txt");
      const listContent = segmentPaths.map(p => `file '${p}'`).join('\n');
      fs.writeFileSync(listPath, listContent);
      
      // Run ffmpeg with concat demuxer
      const cmd = [
        "-y",
        "-f", "concat",
        "-safe", "0",
        "-i", listPath,
        "-c", "copy",
        outputPath
      ];
      
      const result = spawnSync("ffmpeg", cmd, { stdio: "inherit" });
      return result.status === 0;
    } catch (error) {
      console.error("Error concatenating with demuxer:", error);
      return false;
    }
  }
  
  /**
   * Concatenate video segments using the concat filter
   * This allows for transitions between segments
   */
  concatenateWithFilter(segmentPaths: string[], outputPath: string, transition?: string): boolean {
    try {
      // Build inputs
      const inputs: string[] = [];
      const filterParts: string[] = [];
      
      // Add all segments as inputs
      segmentPaths.forEach((segmentPath, index) => {
        inputs.push("-i", segmentPath);
      });
      
      // Build concat filter
      const streamRefs = segmentPaths.map((_, index) => `[${index}:v][${index}:a]`).join('');
      let filter = `${streamRefs}concat=n=${segmentPaths.length}:v=1:a=1[outv][outa]`;
      
      // Add transition if specified
      if (transition) {
        // This would be a more complex implementation
        // For now, we just use the basic concat
      }
      
      // Build full command
      const cmd = [
        "-y",
        ...inputs,
        "-filter_complex", filter,
        "-map", "[outv]",
        "-map", "[outa]",
        outputPath
      ];
      
      const result = spawnSync("ffmpeg", cmd, { stdio: "inherit" });
      return result.status === 0;
    } catch (error) {
      console.error("Error concatenating with filter:", error);
      return false;
    }
  }
  
  /**
   * Create a single video segment with animations
   */
  createSegment(
    baseImage: string,
    duration: number,
    outputPath: string,
    filters?: string[]
  ): boolean {
    try {
      // Build filter chain
      let filterChain = `scale=1920:1080,format=rgba`;
      
      if (filters && filters.length > 0) {
        filterChain += `,${filters.join(',')}`;
      }
      
      const cmd = [
        "-y",
        "-loop", "1",
        "-t", duration.toFixed(3),
        "-i", baseImage,
        "-vf", filterChain,
        "-c:v", "libx264",
        "-pix_fmt", "yuv420p",
        "-r", "30",
        outputPath
      ];
      
      const result = spawnSync("ffmpeg", cmd, { stdio: "inherit" });
      return result.status === 0;
    } catch (error) {
      console.error("Error creating segment:", error);
      return false;
    }
  }
}