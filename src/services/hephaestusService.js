import { spawn } from 'child_process';
import path from 'path';
import fs from 'fs';

const HEPHAESTUS_DIR = path.join(process.cwd(), 'hephaestus');
const PYTHON_SCRIPT = path.join(HEPHAESTUS_DIR, 'extract_api.py');
const PYTHON_COMMAND =
  process.env.HEPHAESTUS_PYTHON || (process.platform === 'win32' ? 'python' : 'python3');

export async function clearHephaestusCache(outputDir) {
  const manifestPath = path.join(outputDir, 'manifest.json');
  
  try {
    if (fs.existsSync(path.join(outputDir, 'images'))) {
      fs.rmSync(path.join(outputDir, 'images'), { recursive: true, force: true });
      console.log(`[HEPHAESTUS] Cleared cached extracted images from ${outputDir}`);
    }
    
    if (fs.existsSync(manifestPath)) {
      fs.unlinkSync(manifestPath);
      console.log(`[HEPHAESTUS] Cleared cached manifest`);
    }
  } catch (err) {
    console.warn(`[HEPHAESTUS] Cache clear warning: ${err.message}`);
  }
}

export async function extractWithHephaestus(pdfPath, outputDir, options = {}) {
  // The Python process runs from hephaestus/, so make upload/output paths absolute first.
  const resolvedPdfPath = path.resolve(pdfPath);
  const resolvedOutputDir = path.resolve(outputDir);
  const { minWidth = 16, minHeight = 16 } = options;

  // Clear cache before extraction
  await clearHephaestusCache(resolvedOutputDir);

  return new Promise((resolve, reject) => {
    const args = [
      PYTHON_SCRIPT,
      resolvedPdfPath,
      resolvedOutputDir,
      String(minWidth),
      String(minHeight)
    ];
    
    console.log(`[HEPHAESTUS] Extracting from: ${pdfPath}`);
    console.log(`[HEPHAESTUS] Output to: ${outputDir}`);
    
    const proc = spawn(PYTHON_COMMAND, args, {
      cwd: HEPHAESTUS_DIR
    });
    
    let stdout = '';
    let stderr = '';
    
    proc.stdout.on('data', (data) => {
      stdout += data.toString();
    });
    
    proc.stderr.on('data', (data) => {
      stderr += data.toString();
      console.log(`[HEPHAESTUS] ${data.toString().trim()}`);
    });
    
    proc.on('close', (code) => {
      if (code !== 0) {
        console.error(`[HEPHAESTUS] Process exited with code ${code}`);
        console.error(`[HEPHAESTUS] stderr: ${stderr}`);
        reject(new Error(`HEPHAESTUS extraction failed: ${stderr || 'Unknown error'}`));
        return;
      }
      
      try {
        const result = JSON.parse(stdout);
        console.log(`[HEPHAESTUS] Extraction complete: ${result.images?.length || 0} images`);
        resolve(result);
      } catch (e) {
        console.error(`[HEPHAESTUS] Failed to parse output: ${stdout}`);
        reject(new Error(`Failed to parse HEPHAESTUS output: ${e.message}`));
      }
    });
    
    proc.on('error', (err) => {
      console.error(`[HEPHAESTUS] Process error: ${err.message}`);
      reject(new Error(`Failed to run HEPHAESTUS: ${err.message}`));
    });
  });
}

export async function isHephaestusAvailable() {
  try {
    return fs.existsSync(PYTHON_SCRIPT);
  } catch {
    return false;
  }
}
