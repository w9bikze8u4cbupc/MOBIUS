import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { parentPort, workerData } from 'worker_threads';

// Get the directory name in ES modules
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Import pdfToImg dynamically
let pdfToImg;

async function loadPdfModules() {
  if (!pdfToImg) {
    const module = await import('pdf-to-img');
    pdfToImg = module.default || module;
  }
}

async function extractImagesFromPDF(pdfPath, outputDir) {
  try {
    // Load pdf modules dynamically when needed
    await loadPdfModules();

    const pdfResult = await pdfToImg(pdfPath);
    await fs.promises.mkdir(outputDir, { recursive: true });

    const images = [];
    let pageIndex = 0;

    for await (const page of pdfResult) {
      try {
        pageIndex++;
        const pageFileName = `page${pageIndex}.png`;
        const pagePath = path.join(outputDir, pageFileName);
        await fs.promises.writeFile(pagePath, page);
        images.push(pagePath);
      } catch (err) {
        console.error(`Failed to save page ${pageIndex}:`, err);
      }
    }

    return { success: true, images };
  } catch (error) {
    return { success: false, error: error.message };
  }
}

// Handle messages from parent
parentPort.on('message', async (data) => {
  const { action, pdfPath, outputDir } = data;

  if (action === 'extractImages') {
    try {
      const result = await extractImagesFromPDF(pdfPath, outputDir);
      parentPort.postMessage(result);
    } catch (error) {
      parentPort.postMessage({ success: false, error: error.message });
    }
  }
});
