import { createCanvas } from 'canvas';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';
import sharp from 'sharp';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

/**
 * Test utilities for generating synthetic test images and PDFs
 */

/**
 * Create a synthetic test image with specific characteristics
 */
export async function createTestImage(width = 400, height = 300, options = {}) {
  const {
    format = 'png',
    backgroundColor = '#ffffff',
    pattern = 'solid',
    text = null,
    outputPath = null
  } = options;

  let canvas, context;
  
  try {
    // Try to use node-canvas if available
    canvas = createCanvas(width, height);
    context = canvas.getContext('2d');
  } catch (error) {
    // Fallback to Sharp for image generation
    return createTestImageWithSharp(width, height, options);
  }

  // Fill background
  context.fillStyle = backgroundColor;
  context.fillRect(0, 0, width, height);

  // Apply pattern
  switch (pattern) {
    case 'checkerboard':
      const squareSize = 20;
      for (let x = 0; x < width; x += squareSize) {
        for (let y = 0; y < height; y += squareSize) {
          if ((Math.floor(x / squareSize) + Math.floor(y / squareSize)) % 2 === 0) {
            context.fillStyle = '#000000';
            context.fillRect(x, y, squareSize, squareSize);
          }
        }
      }
      break;

    case 'gradient':
      const gradient = context.createLinearGradient(0, 0, width, 0);
      gradient.addColorStop(0, '#ff0000');
      gradient.addColorStop(0.5, '#00ff00');
      gradient.addColorStop(1, '#0000ff');
      context.fillStyle = gradient;
      context.fillRect(0, 0, width, height);
      break;

    case 'circles':
      context.fillStyle = '#ff6b6b';
      for (let i = 0; i < 10; i++) {
        const x = Math.random() * width;
        const y = Math.random() * height;
        const radius = Math.random() * 30 + 10;
        context.beginPath();
        context.arc(x, y, radius, 0, 2 * Math.PI);
        context.fill();
      }
      break;
  }

  // Add text if specified
  if (text) {
    context.fillStyle = '#000000';
    context.font = '24px Arial';
    context.textAlign = 'center';
    context.fillText(text, width / 2, height / 2);
  }

  // Save or return buffer
  if (outputPath) {
    const buffer = canvas.toBuffer(format === 'jpeg' ? 'image/jpeg' : 'image/png');
    await fs.promises.writeFile(outputPath, buffer);
    return outputPath;
  } else {
    return canvas.toBuffer(format === 'jpeg' ? 'image/jpeg' : 'image/png');
  }
}

/**
 * Fallback method using Sharp for image generation
 */
async function createTestImageWithSharp(width, height, options) {
  const {
    format = 'png',
    backgroundColor = '#ffffff',
    pattern = 'solid',
    text = null,
    outputPath = null
  } = options;

  let image = sharp({
    create: {
      width,
      height,
      channels: 3,
      background: backgroundColor
    }
  });

  // Apply basic pattern using Sharp operations
  if (pattern === 'gradient') {
    // Create a simple gradient effect using tint
    image = image.tint({ r: 100, g: 150, b: 200 });
  }

  // Convert to desired format
  if (format === 'jpeg') {
    image = image.jpeg({ quality: 90 });
  } else {
    image = image.png();
  }

  if (outputPath) {
    await image.toFile(outputPath);
    return outputPath;
  } else {
    return await image.toBuffer();
  }
}

/**
 * Create a set of test images with known similarity relationships
 */
export async function createTestImageSet(outputDir) {
  await fs.promises.mkdir(outputDir, { recursive: true });

  const images = [];

  // Original image
  const original = path.join(outputDir, 'original.png');
  await createTestImage(400, 300, {
    pattern: 'checkerboard',
    text: 'Original',
    outputPath: original
  });
  images.push({ name: 'original', path: original, similarity: 1.0 });

  // Very similar image (slight color change)
  const similar1 = path.join(outputDir, 'similar_high.png');
  await createTestImage(400, 300, {
    pattern: 'checkerboard',
    text: 'Similar',
    backgroundColor: '#f8f8f8',
    outputPath: similar1
  });
  images.push({ name: 'similar_high', path: similar1, expectedSimilarity: 0.95 });

  // Moderately similar image (different pattern, same structure)
  const similar2 = path.join(outputDir, 'similar_medium.png');
  await createTestImage(400, 300, {
    pattern: 'circles',
    text: 'Medium',
    outputPath: similar2
  });
  images.push({ name: 'similar_medium', path: similar2, expectedSimilarity: 0.7 });

  // Different image
  const different = path.join(outputDir, 'different.png');
  await createTestImage(400, 300, {
    pattern: 'gradient',
    text: 'Different',
    outputPath: different
  });
  images.push({ name: 'different', path: different, expectedSimilarity: 0.3 });

  // Duplicate (exact copy)
  const duplicate = path.join(outputDir, 'duplicate.png');
  await fs.promises.copyFile(original, duplicate);
  images.push({ name: 'duplicate', path: duplicate, expectedSimilarity: 1.0 });

  return images;
}

/**
 * Create a minimal synthetic PDF for testing extraction
 */
export async function createTestPDF(outputPath, imageCount = 3) {
  // This is a simplified version - in a real implementation,
  // you would use a library like PDFKit to create actual PDFs
  // For testing purposes, we'll create a mock structure
  
  const pdfDir = path.dirname(outputPath);
  await fs.promises.mkdir(pdfDir, { recursive: true });
  
  // Create test images that would be "extracted" from the PDF
  const testImages = [];
  for (let i = 1; i <= imageCount; i++) {
    const imagePath = path.join(pdfDir, `extracted_${i}.png`);
    await createTestImage(300, 200, {
      pattern: i === 1 ? 'checkerboard' : i === 2 ? 'circles' : 'gradient',
      text: `Page ${i}`,
      outputPath: imagePath
    });
    testImages.push(imagePath);
  }
  
  // Create a mock PDF metadata file
  const mockPDF = {
    type: 'mock-pdf',
    version: '1.0',
    pageCount: imageCount,
    extractableImages: testImages,
    createdAt: new Date().toISOString()
  };
  
  await fs.promises.writeFile(outputPath, JSON.stringify(mockPDF, null, 2));
  
  return {
    pdfPath: outputPath,
    expectedImages: testImages,
    metadata: mockPDF
  };
}

/**
 * Create test directory structure with various image types
 */
export async function createTestImageDirectory(baseDir) {
  const structure = {
    baseDir,
    subdirs: {},
    allImages: []
  };

  // Create subdirectories
  const subdirs = ['jpeg', 'png', 'mixed'];
  
  for (const subdir of subdirs) {
    const subdirPath = path.join(baseDir, subdir);
    await fs.promises.mkdir(subdirPath, { recursive: true });
    structure.subdirs[subdir] = subdirPath;
  }

  // Create JPEG images
  for (let i = 1; i <= 3; i++) {
    const imagePath = path.join(structure.subdirs.jpeg, `image_${i}.jpg`);
    await createTestImage(200 + i * 50, 150 + i * 25, {
      format: 'jpeg',
      pattern: ['solid', 'checkerboard', 'circles'][i - 1],
      text: `JPEG ${i}`,
      outputPath: imagePath
    });
    structure.allImages.push(imagePath);
  }

  // Create PNG images
  for (let i = 1; i <= 3; i++) {
    const imagePath = path.join(structure.subdirs.png, `image_${i}.png`);
    await createTestImage(180 + i * 40, 140 + i * 30, {
      format: 'png',
      pattern: ['gradient', 'solid', 'checkerboard'][i - 1],
      text: `PNG ${i}`,
      outputPath: imagePath
    });
    structure.allImages.push(imagePath);
  }

  // Create mixed format images with some duplicates
  const original = path.join(structure.subdirs.mixed, 'original.png');
  await createTestImage(300, 200, {
    pattern: 'checkerboard',
    text: 'Mixed Original',
    outputPath: original
  });
  structure.allImages.push(original);

  const duplicate = path.join(structure.subdirs.mixed, 'duplicate.jpg');
  await createTestImage(300, 200, {
    format: 'jpeg',
    pattern: 'checkerboard',
    text: 'Mixed Original', // Same content, different format
    outputPath: duplicate
  });
  structure.allImages.push(duplicate);

  return structure;
}

/**
 * Clean up test files and directories
 */
export async function cleanupTestFiles(paths) {
  for (const testPath of paths) {
    try {
      const stat = await fs.promises.stat(testPath);
      if (stat.isDirectory()) {
        await fs.promises.rm(testPath, { recursive: true, force: true });
      } else {
        await fs.promises.unlink(testPath);
      }
    } catch (error) {
      // Ignore errors if files don't exist
    }
  }
}

/**
 * Validate test image properties
 */
export async function validateTestImage(imagePath) {
  try {
    const metadata = await sharp(imagePath).metadata();
    const stats = await fs.promises.stat(imagePath);
    
    return {
      exists: true,
      path: imagePath,
      width: metadata.width,
      height: metadata.height,
      format: metadata.format,
      size: stats.size,
      valid: true
    };
  } catch (error) {
    return {
      exists: fs.existsSync(imagePath),
      path: imagePath,
      error: error.message,
      valid: false
    };
  }
}

/**
 * Create test component definitions for matching tests
 */
export function createTestComponents(imagePaths) {
  return [
    {
      name: 'Game Board',
      description: 'Main game board',
      referenceImage: imagePaths[0],
      expectedMatches: 1
    },
    {
      name: 'Player Cards',
      description: 'Set of player cards',
      referenceImage: imagePaths[1],
      expectedMatches: 2
    },
    {
      name: 'Tokens',
      description: 'Game tokens',
      referenceImage: imagePaths[2],
      expectedMatches: 1
    }
  ];
}