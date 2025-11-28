import fs from 'fs';
import path from 'path';
import sharp from 'sharp';

const DATA_DIR = process.env.DB_DATA_DIR || path.resolve(process.cwd(), 'data');

function generateImageId() {
  return `native-${Date.now()}-${Math.random().toString(36).substring(2, 8)}`;
}

async function extractEmbeddedImages(pdfBuffer, projectId, options = {}) {
  const { minWidth = 50, minHeight = 50 } = options;
  
  const projectDir = path.join(DATA_DIR, 'rulebook-images', projectId, 'native');
  if (!fs.existsSync(projectDir)) {
    fs.mkdirSync(projectDir, { recursive: true });
  }
  
  const results = [];
  
  try {
    const pdfBytes = pdfBuffer instanceof Buffer ? pdfBuffer : Buffer.from(pdfBuffer);
    const pdfString = pdfBytes.toString('binary');
    
    const streamMatches = [...pdfString.matchAll(/stream\r?\n([\s\S]*?)\r?\nendstream/g)];
    console.log(`Found ${streamMatches.length} streams in PDF`);
    
    const imageSignatures = {
      jpeg: [0xFF, 0xD8, 0xFF],
      png: [0x89, 0x50, 0x4E, 0x47],
    };
    
    let imageIndex = 0;
    
    for (const match of streamMatches) {
      try {
        const streamData = match[1];
        const streamBuffer = Buffer.from(streamData, 'binary');
        
        if (streamBuffer.length < 100) continue;
        
        let format = null;
        
        if (streamBuffer[0] === 0xFF && streamBuffer[1] === 0xD8 && streamBuffer[2] === 0xFF) {
          format = 'jpeg';
        } else if (streamBuffer[0] === 0x89 && streamBuffer[1] === 0x50 && streamBuffer[2] === 0x4E && streamBuffer[3] === 0x47) {
          format = 'png';
        }
        
        if (!format) continue;
        
        try {
          const metadata = await sharp(streamBuffer).metadata();
          
          if (metadata.width < minWidth || metadata.height < minHeight) {
            console.log(`Skipping small image: ${metadata.width}x${metadata.height}`);
            continue;
          }
          
          const imageId = generateImageId();
          const filename = `${imageId}.${format === 'jpeg' ? 'jpg' : 'png'}`;
          const imagePath = path.join(projectDir, filename);
          
          await sharp(streamBuffer)
            .toFile(imagePath);
          
          results.push({
            id: imageId,
            source: 'native-pdf',
            fileKey: `rulebook-images/${projectId}/native/${filename}`,
            width: metadata.width,
            height: metadata.height,
            format: format,
            extractionMethod: 'stream-scan',
            tags: ['extracted', 'native'],
          });
          
          imageIndex++;
          console.log(`Extracted native image ${imageIndex}: ${metadata.width}x${metadata.height} ${format}`);
          
        } catch (sharpErr) {
          continue;
        }
        
      } catch (err) {
        continue;
      }
    }
    
  } catch (err) {
    console.error('Native extraction failed:', err);
  }
  
  console.log(`Native extraction complete: ${results.length} images found`);
  return results;
}

async function extractImagesWithPdfLib(pdfBuffer, projectId) {
  const { PDFDocument, PDFName, PDFRawStream, PDFStream } = await import('pdf-lib');
  
  const projectDir = path.join(DATA_DIR, 'rulebook-images', projectId, 'native');
  if (!fs.existsSync(projectDir)) {
    fs.mkdirSync(projectDir, { recursive: true });
  }
  
  const results = [];
  
  try {
    const pdfDoc = await PDFDocument.load(pdfBuffer);
    const pages = pdfDoc.getPages();
    
    console.log(`Processing ${pages.length} pages with pdf-lib`);
    
    for (let pageIndex = 0; pageIndex < pages.length; pageIndex++) {
      const page = pages[pageIndex];
      
      try {
        const resources = page.node.Resources();
        if (!resources) continue;
        
        const xObjectDict = resources.lookup(PDFName.of('XObject'));
        if (!xObjectDict) continue;
        
        const xObjectNames = xObjectDict.keys ? xObjectDict.keys() : [];
        
        for (const name of xObjectNames) {
          try {
            const xObject = xObjectDict.lookup(name);
            if (!xObject) continue;
            
            const subtype = xObject.lookup ? xObject.lookup(PDFName.of('Subtype')) : null;
            if (!subtype || subtype.toString() !== '/Image') continue;
            
            const width = xObject.lookup(PDFName.of('Width'))?.asNumber?.() || 0;
            const height = xObject.lookup(PDFName.of('Height'))?.asNumber?.() || 0;
            
            if (width < 50 || height < 50) continue;
            
            console.log(`Found image XObject on page ${pageIndex + 1}: ${width}x${height}`);
            
          } catch (err) {
            continue;
          }
        }
        
      } catch (pageErr) {
        console.error(`Error processing page ${pageIndex + 1}:`, pageErr.message);
      }
    }
    
  } catch (err) {
    console.error('pdf-lib extraction failed:', err);
  }
  
  return results;
}

async function extractAllImages(pdfBuffer, projectId, options = {}) {
  console.log('Starting comprehensive PDF image extraction...');
  
  const nativeImages = await extractEmbeddedImages(pdfBuffer, projectId, options);
  
  if (nativeImages.length > 0) {
    console.log(`Found ${nativeImages.length} embedded images`);
    return {
      mode: 'native',
      images: nativeImages,
      message: `Extracted ${nativeImages.length} embedded images from PDF`
    };
  }
  
  console.log('No embedded images found via stream scanning');
  
  return {
    mode: 'none',
    images: [],
    message: 'No embedded images found in PDF. Try page-level extraction for scanned documents.'
  };
}

export { extractEmbeddedImages, extractAllImages, extractImagesWithPdfLib };
