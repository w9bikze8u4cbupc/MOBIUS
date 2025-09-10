// crop_detections.mjs
import fs from 'fs';
import path from 'path';
import sharp from 'sharp';
import { fileURLToPath } from 'url';

// For __dirname in ES modules:
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * Crop detected regions from an image using detection JSON.
 * @param {string} imagePath - Path to the original image.
 * @param {string} detectionJsonPath - Path to the detection JSON file.
 * @param {string} outputDir - Directory to save cropped images.
 */
async function cropDetections(imagePath, detectionJsonPath, outputDir) {
  // Read detection results
  const detections = JSON.parse(fs.readFileSync(detectionJsonPath, 'utf-8'));

  // Ensure output directory exists
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }

  // For each detection, crop and save
  for (let i = 0; i < detections.length; i++) {
    const det = detections[i];
    const [x1, y1, x2, y2] = det.bbox;
    const width = x2 - x1;
    const height = y2 - y1;

    const cropName = `${path.basename(imagePath, path.extname(imagePath))}_crop_${i + 1}_${det.class_name}.png`;
    const cropPath = path.join(outputDir, cropName);

    await sharp(imagePath)
      .extract({ left: Math.max(0, Math.round(x1)), top: Math.max(0, Math.round(y1)), width: Math.round(width), height: Math.round(height) })
      .toFile(cropPath);

    console.log(`Saved crop: ${cropPath}`);
  }
}

// Example usage:
const imagePath = "C:/Users/danie/Documents/mobius-games-tutorial-generator/pdf_images/JAIPUR_US_page-0001.jpg";
const detectionJsonPath = "C:/Users/danie/Documents/mobius-games-tutorial-generator/pdf_images/JAIPUR_US_page-0001_detections.json";
const outputDir = "C:/Users/danie/Documents/mobius-games-tutorial-generator/pdf_images/crops";

await cropDetections(imagePath, detectionJsonPath, outputDir);