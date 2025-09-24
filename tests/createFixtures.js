import fs from 'fs';
import { promises as fsPromises } from 'fs';
import path from 'path';
import sharp from 'sharp';

/**
 * Generate a test PDF fixture with known content for CI testing
 * This creates a minimal valid PDF that will trigger pdftoppm fallback
 */
async function createTestFixture() {
  const fixturesDir = path.join(process.cwd(), 'tests', 'fixtures');
  await fsPromises.mkdir(fixturesDir, { recursive: true });

  // Create a minimal but valid PDF
  const pdfContent = `%PDF-1.4
1 0 obj
<<
/Type /Catalog
/Pages 2 0 R
>>
endobj
2 0 obj
<<
/Type /Pages
/Kids [3 0 R]
/Count 1
>>
endobj
3 0 obj
<<
/Type /Page
/Parent 2 0 R
/MediaBox [0 0 612 792]
/Resources <<
/Font <<
/F1 4 0 R
>>
>>
/Contents 5 0 R
>>
endobj
4 0 obj
<<
/Type /Font
/Subtype /Type1
/BaseFont /Helvetica
>>
endobj
5 0 obj
<<
/Length 44
>>
stream
BT
/F1 12 Tf
100 700 Td
(Game Components Test) Tj
ET
endstream
endobj
xref
0 6
0000000000 65535 f 
0000000009 00000 n 
0000000058 00000 n 
0000000115 00000 n 
0000000273 00000 n 
0000000351 00000 n 
trailer
<<
/Size 6
/Root 1 0 R
>>
startxref
445
%%EOF`;

  // Write PDF fixture
  const pdfPath = path.join(fixturesDir, 'test-components.pdf');
  await fsPromises.writeFile(pdfPath, pdfContent);

  // Create reference images for testing
  const referenceImagesDir = path.join(fixturesDir, 'reference-images');
  await fsPromises.mkdir(referenceImagesDir, { recursive: true });

  // Create test images with known patterns
  const redImage = sharp({
    create: {
      width: 200,
      height: 200,
      channels: 3,
      background: { r: 255, g: 0, b: 0 }
    }
  });

  const blueImage = sharp({
    create: {
      width: 200,
      height: 200,
      channels: 3,
      background: { r: 0, g: 0, b: 255 }
    }
  });

  const gameboardImage = sharp({
    create: {
      width: 400,
      height: 400,
      channels: 3,
      background: { r: 139, g: 69, b: 19 } // Brown for game board
    }
  });

  await redImage.png().toFile(path.join(referenceImagesDir, 'red-card.png'));
  await blueImage.png().toFile(path.join(referenceImagesDir, 'blue-card.png'));
  await gameboardImage.png().toFile(path.join(referenceImagesDir, 'game-board.png'));

  // Create expected results JSON for validation
  const expectedResults = {
    testSuite: "PDF Extraction Validation",
    fixtures: {
      pdf: {
        path: pdfPath,
        name: "test-components.pdf",
        expectedMethod: "pdftoppm", // This PDF should trigger fallback method
        description: "Minimal PDF for testing page rendering extraction"
      },
      referenceImages: [
        {
          path: path.join(referenceImagesDir, 'red-card.png'),
          name: "red-card.png",
          expectedColor: { r: 255, g: 0, b: 0 },
          description: "Solid red image for hash testing"
        },
        {
          path: path.join(referenceImagesDir, 'blue-card.png'),
          name: "blue-card.png", 
          expectedColor: { r: 0, g: 0, b: 255 },
          description: "Solid blue image for hash testing"
        },
        {
          path: path.join(referenceImagesDir, 'game-board.png'),
          name: "game-board.png",
          expectedColor: { r: 139, g: 69, b: 19 },
          description: "Brown game board for component matching"
        }
      ]
    },
    validationCriteria: {
      hashAlgorithm: "blockhash",
      hashBits: 64,
      confidenceThresholds: {
        high: 0.95,
        medium: 0.90,
        low: 0.80
      },
      expectedHashes: {
        // These would be filled in by actual test runs
        redCard: null,
        blueCard: null,
        gameBoard: null
      }
    },
    notes: [
      "This fixture is designed to test the complete PDF extraction pipeline",
      "The PDF has no embedded images, so should trigger pdftoppm rendering",
      "Reference images are for testing hash consistency and similarity matching",
      "Use this fixture to validate cross-platform extraction behavior"
    ]
  };

  const expectedPath = path.join(fixturesDir, 'expected-results.json');
  await fsPromises.writeFile(expectedPath, JSON.stringify(expectedResults, null, 2));

  console.log('✅ Test fixtures created:');
  console.log(`  PDF: ${pdfPath}`);
  console.log(`  Reference images: ${referenceImagesDir}`);
  console.log(`  Expected results: ${expectedPath}`);
  
  return {
    pdfPath,
    referenceImagesDir,
    expectedPath,
    expectedResults
  };
}

// Run fixture creation if called directly
if (import.meta.url === `file://${process.argv[1]}`) {
  createTestFixture().catch(console.error);
}

export { createTestFixture };