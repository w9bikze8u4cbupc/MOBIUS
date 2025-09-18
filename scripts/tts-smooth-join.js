#!/usr/bin/env node

// TTS audio smoothing with crossfade
import { execSync } from 'child_process';
import fs from 'fs';
import path from 'path';

// Function to join audio files with crossfade
function joinAudioWithCrossfade(inputFiles, outputFile, crossfadeDuration = 0.1) {
  if (inputFiles.length < 2) {
    console.error('Need at least 2 files to join');
    return false;
  }

  // Create a temporary file list for FFmpeg
  const fileListPath = path.join(path.dirname(outputFile), 'file_list.txt');
  const fileEntries = inputFiles.map(file => `file '${file}'`).join('\n');
  fs.writeFileSync(fileListPath, fileEntries);

  try {
    // Use FFmpeg to join files with crossfade
    // This command uses the concat filter with crossfade
    const command = `ffmpeg -f concat -safe 0 -i "${fileListPath}" -af "afade=t=in:ss=0:d=${crossfadeDuration},afade=t=out:st=${crossfadeDuration}:d=${crossfadeDuration}" -y "${outputFile}"`;
    
    console.log(`Executing: ${command}`);
    execSync(command, { stdio: 'inherit' });
    
    // Clean up temporary file
    fs.unlinkSync(fileListPath);
    
    console.log(`✅ Audio files joined with ${crossfadeDuration}s crossfade: ${outputFile}`);
    return true;
  } catch (error) {
    console.error('Error joining audio files:', error.message);
    
    // Clean up temporary file
    if (fs.existsSync(fileListPath)) {
      fs.unlinkSync(fileListPath);
    }
    
    return false;
  }
}

// Function to normalize audio with loudnorm
function normalizeAudio(inputFile, outputFile) {
  try {
    // Use FFmpeg loudnorm filter for audio normalization
    const command = `ffmpeg -i "${inputFile}" -af "loudnorm=I=-16:TP=-1.5:LRA=11" -y "${outputFile}"`;
    
    console.log(`Executing: ${command}`);
    execSync(command, { stdio: 'inherit' });
    
    console.log(`✅ Audio normalized: ${outputFile}`);
    return true;
  } catch (error) {
    console.error('Error normalizing audio:', error.message);
    return false;
  }
}

// Main function
function main() {
  // Example usage
  console.log('TTS Audio Smoothing Script');
  console.log('Usage: node tts-smooth-join.js <input_files> <output_file>');
  console.log('Example: node tts-smooth-join.js chunk1.wav chunk2.wav chunk3.wav output.wav\n');
  
  // If called with arguments, process them
  if (process.argv.length > 4) {
    const inputFiles = process.argv.slice(2, -1);
    const outputFile = process.argv[process.argv.length - 1];
    
    console.log(`Joining ${inputFiles.length} audio files with crossfade...`);
    
    // First join with crossfade
    if (joinAudioWithCrossfade(inputFiles, outputFile)) {
      // Then normalize the result
      const normalizedFile = outputFile.replace(path.extname(outputFile), '.normalized' + path.extname(outputFile));
      if (normalizeAudio(outputFile, normalizedFile)) {
        // Replace original with normalized version
        fs.renameSync(normalizedFile, outputFile);
        console.log('✅ TTS audio smoothing complete');
      }
    }
  }
}

main();