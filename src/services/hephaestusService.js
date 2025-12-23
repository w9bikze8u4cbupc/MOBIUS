import { spawn } from 'child_process';
import path from 'path';
import fs from 'fs';

const HEPHAESTUS_DIR = path.join(process.cwd(), 'hephaestus');
const PYTHON_SCRIPT = path.join(HEPHAESTUS_DIR, 'extract_api.py');

export async function clearHephaestusCache(outputDir) {
  const imagesDir = path.join(outputDir, 'images', 'all');
  const manifestPath = path.join(outputDir, 'manifest.json');
  
  try {
    if (fs.existsSync(imagesDir)) {
      const files = fs.readdirSync(imagesDir);
      for (const file of files) {
        if (file.startsWith('component_')) {
          fs.unlinkSync(path.join(imagesDir, file));
        }
      }
      console.log(`[HEPHAESTUS] Cleared ${files.length} cached images from ${imagesDir}`);
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
  // Use lower thresholds to capture small components
  const { minWidth = 16, minHeight = 16 } = options;
  
  // Clear cache before extraction
  await clearHephaestusCache(outputDir);
  
  return new Promise((resolve, reject) => {
    const args = [
      PYTHON_SCRIPT,
      pdfPath,
      outputDir,
      String(minWidth),
      String(minHeight)
    ];
    
    console.log(`[HEPHAESTUS] Extracting from: ${pdfPath}`);
    console.log(`[HEPHAESTUS] Output to: ${outputDir}`);
    
    const proc = spawn('python3', args, {
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
