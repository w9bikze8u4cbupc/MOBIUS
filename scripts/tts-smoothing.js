#!/usr/bin/env node

// Enhanced TTS smoothing script
import { execSync } from 'child_process';
import fs from 'fs';
import path from 'path';

// Function to apply crossfade and loudness normalization to TTS chunks
async function smoothTtsChunks(chunkDir, outputFile) {
  try {
    // Get all chunk files
    const files = fs
      .readdirSync(chunkDir)
      .filter((f) => f.endsWith('.wav') || f.endsWith('.mp3'))
      .sort()
      .map((f) => path.join(chunkDir, f));

    if (files.length === 0) {
      console.error('No audio chunks found in directory');
      return false;
    }

    if (files.length === 1) {
      // Just normalize single file
      console.log('Only one chunk found, applying loudness normalization...');
      return normalizeAudio(files[0], outputFile);
    }

    console.log(`Processing ${files.length} TTS chunks...`);

    // Create crossfade transitions between chunks
    const tempFiles = [];

    // Process each pair of files with crossfade
    for (let i = 0; i < files.length - 1; i++) {
      const tempOutput = path.join(chunkDir, `temp_${i}.wav`);
      tempFiles.push(tempOutput);

      if (i === 0) {
        // For first file, just prepare it for crossfade
        await crossfadeTwoFiles(files[i], files[i + 1], tempOutput);
      } else {
        // For subsequent files, we need to crossfade with previous result
        // This is a simplified approach - in practice, you might want to use a more complex method
        await crossfadeTwoFiles(files[i], files[i + 1], tempOutput);
      }
    }

    // Concatenate all processed files
    const finalTemp = path.join(chunkDir, 'final_temp.wav');
    if (concatenateAudio(tempFiles, finalTemp)) {
      // Apply final loudness normalization
      if (normalizeAudio(finalTemp, outputFile)) {
        // Clean up temporary files
        [...tempFiles, finalTemp].forEach((f) => {
          if (fs.existsSync(f)) fs.unlinkSync(f);
        });

        console.log(`✅ TTS smoothing complete: ${outputFile}`);
        return true;
      }
    }

    // Clean up temporary files on failure
    [...tempFiles, finalTemp].forEach((f) => {
      if (fs.existsSync(f)) fs.unlinkSync(f);
    });

    return false;
  } catch (error) {
    console.error('Error smoothing TTS chunks:', error.message);
    return false;
  }
}

// Function to crossfade two audio files
async function crossfadeTwoFiles(file1, file2, outputFile, crossfadeDuration = 0.1) {
  return new Promise((resolve, reject) => {
    try {
      // Use FFmpeg to crossfade two files
      const command = `ffmpeg -i "${file1}" -i "${file2}" -filter_complex "[0:a][1:a]acrossfade=d=${crossfadeDuration}:c1=tri:c2=tri[a]" -map "[a]" -y "${outputFile}"`;

      console.log(`Crossfading ${file1} and ${file2}...`);
      execSync(command, { stdio: 'inherit' });

      console.log(`✅ Crossfade complete: ${outputFile}`);
      resolve(outputFile);
    } catch (error) {
      console.error(`Error crossfading ${file1} and ${file2}:`, error.message);
      reject(error);
    }
  });
}

// Function to concatenate audio files
function concatenateAudio(inputFiles, outputFile) {
  try {
    // Create a temporary file list for FFmpeg
    const fileListPath = path.join(path.dirname(outputFile), 'concat_list.txt');
    const fileEntries = inputFiles
      .filter((f) => fs.existsSync(f)) // Only include files that exist
      .map((file) => `file '${file.replace(/'/g, '\'\\\'\'')}'`) // Escape single quotes
      .join('\n');

    if (!fileEntries) {
      console.error('No valid files to concatenate');
      return false;
    }

    fs.writeFileSync(fileListPath, fileEntries);

    // Use FFmpeg to concatenate files
    const command = `ffmpeg -f concat -safe 0 -i "${fileListPath}" -c copy -y "${outputFile}"`;

    console.log(`Concatenating ${inputFiles.length} files...`);
    execSync(command, { stdio: 'inherit' });

    // Clean up temporary file
    fs.unlinkSync(fileListPath);

    console.log(`✅ Concatenation complete: ${outputFile}`);
    return true;
  } catch (error) {
    console.error('Error concatenating audio files:', error.message);

    // Clean up temporary file
    const fileListPath = path.join(path.dirname(outputFile), 'concat_list.txt');
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

    console.log(`Normalizing audio: ${inputFile}`);
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
  console.log('Enhanced TTS Smoothing Script');
  console.log('Usage: node tts-smoothing.js <chunk_directory> <output_file>');
  console.log('Example: node tts-smoothing.js ./tts_chunks/ output.wav\n');

  // If called with arguments, process them
  if (process.argv.length === 4) {
    const chunkDir = process.argv[2];
    const outputFile = process.argv[3];

    if (!fs.existsSync(chunkDir)) {
      console.error(`Chunk directory does not exist: ${chunkDir}`);
      process.exit(1);
    }

    smoothTtsChunks(chunkDir, outputFile)
      .then((success) => {
        if (success) {
          console.log('✅ TTS smoothing process completed successfully');
        } else {
          console.error('❌ TTS smoothing process failed');
          process.exit(1);
        }
      })
      .catch((error) => {
        console.error('Error in TTS smoothing process:', error);
        process.exit(1);
      });
  }
}

main();
