import fs from 'fs';
import path from 'path';
import sharp from 'sharp';
import { PDFDocument, PDFName, PDFDict, PDFStream, PDFRawStream } from 'pdf-lib';
import pako from 'pako';

const DATA_DIR = process.env.DB_DATA_DIR || path.resolve(process.cwd(), 'data');

function generateImageId() {
  return `native-${Date.now()}-${Math.random().toString(36).substring(2, 8)}`;
}

async function decodeStream(streamObj) {
  if (!streamObj) return null;
  
  try {
    let bytes;
    if (streamObj.getContents) {
      bytes = streamObj.getContents();
    } else if (streamObj.contents) {
      bytes = streamObj.contents;
    } else {
      return null;
    }
    
    if (!bytes || bytes.length < 100) return null;
    return bytes;
  } catch (err) {
    return null;
  }
}

function isValidImageBuffer(buffer) {
  if (!buffer || buffer.length < 10) return false;
  
  if (buffer[0] === 0xFF && buffer[1] === 0xD8 && buffer[2] === 0xFF) {
    return 'jpeg';
  }
  if (buffer[0] === 0x89 && buffer[1] === 0x50 && buffer[2] === 0x4E && buffer[3] === 0x47) {
    return 'png';
  }
  return false;
}

async function extractImagesFromPdfLib(pdfBuffer, projectId, options = {}) {
  const { minWidth = 100, minHeight = 100 } = options;
  
  const projectDir = path.join(DATA_DIR, 'rulebook-images', projectId, 'native');
  if (!fs.existsSync(projectDir)) {
    fs.mkdirSync(projectDir, { recursive: true });
  }
  
  const results = [];
  
  try {
    const pdfDoc = await PDFDocument.load(pdfBuffer, { ignoreEncryption: true });
    const context = pdfDoc.context;
    
    const pages = pdfDoc.getPages();
    console.log(`Processing ${pages.length} pages for embedded images...`);
    
    const processedHashes = new Set();
    
    for (let pageIdx = 0; pageIdx < pages.length; pageIdx++) {
      const page = pages[pageIdx];
      
      try {
        const resources = page.node.Resources();
        if (!resources) continue;
        
        const xObjectRef = resources.get(PDFName.of('XObject'));
        if (!xObjectRef) continue;
        
        const xObjects = context.lookup(xObjectRef);
        if (!xObjects || !(xObjects instanceof PDFDict)) continue;
        
        const entries = xObjects.entries();
        
        for (const [name, ref] of entries) {
          try {
            const xObject = context.lookup(ref);
            if (!xObject) continue;
            
            const subtypeRef = xObject.get ? xObject.get(PDFName.of('Subtype')) : null;
            if (!subtypeRef) continue;
            
            const subtype = context.lookup(subtypeRef);
            if (!subtype || subtype.toString() !== '/Image') continue;
            
            const widthRef = xObject.get(PDFName.of('Width'));
            const heightRef = xObject.get(PDFName.of('Height'));
            const width = widthRef ? context.lookup(widthRef)?.value() || 0 : 0;
            const height = heightRef ? context.lookup(heightRef)?.value() || 0 : 0;
            
            if (width < minWidth || height < minHeight) {
              continue;
            }
            
            const filterRef = xObject.get(PDFName.of('Filter'));
            const filter = filterRef ? context.lookup(filterRef)?.toString() : null;
            
            const streamBytes = await decodeStream(xObject);
            if (!streamBytes) continue;
            
            const hash = Buffer.from(streamBytes.slice(0, 1000)).toString('base64');
            if (processedHashes.has(hash)) continue;
            processedHashes.add(hash);
            
            let imageBuffer = null;
            let format = null;
            
            if (filter === '/DCTDecode') {
              format = 'jpeg';
              imageBuffer = Buffer.from(streamBytes);
            } else if (filter === '/FlateDecode') {
              try {
                const inflated = pako.inflate(streamBytes);
                
                const colorSpaceRef = xObject.get(PDFName.of('ColorSpace'));
                const colorSpace = colorSpaceRef ? context.lookup(colorSpaceRef)?.toString() : '/DeviceRGB';
                const bitsPerComp = xObject.get(PDFName.of('BitsPerComponent'));
                const bits = bitsPerComp ? context.lookup(bitsPerComp)?.value() || 8 : 8;
                
                let channels = 3;
                if (colorSpace === '/DeviceGray') channels = 1;
                else if (colorSpace === '/DeviceCMYK') channels = 4;
                
                const expectedSize = width * height * channels * (bits / 8);
                if (inflated.length >= expectedSize * 0.9) {
                  const rawImageData = {
                    create: {
                      width: width,
                      height: height,
                      channels: channels,
                      background: { r: 255, g: 255, b: 255 }
                    }
                  };
                  
                  try {
                    imageBuffer = await sharp(Buffer.from(inflated), { raw: { width, height, channels } })
                      .png()
                      .toBuffer();
                    format = 'png';
                  } catch (sharpErr) {
                    continue;
                  }
                }
              } catch (inflateErr) {
                continue;
              }
            } else if (!filter) {
              const detectedFormat = isValidImageBuffer(streamBytes);
              if (detectedFormat) {
                format = detectedFormat;
                imageBuffer = Buffer.from(streamBytes);
              }
            }
            
            if (!imageBuffer || !format) continue;
            
            try {
              const metadata = await sharp(imageBuffer).metadata();
              if (!metadata.width || metadata.width < minWidth || !metadata.height || metadata.height < minHeight) {
                continue;
              }
              
              const imageId = generateImageId();
              const filename = `${imageId}.${format === 'jpeg' ? 'jpg' : 'png'}`;
              const imagePath = path.join(projectDir, filename);
              const fileKey = path.resolve(imagePath);
              
              await sharp(imageBuffer).toFile(imagePath);
              
              results.push({
                id: imageId,
                source: 'native-pdf',
                fileKey: fileKey,
                width: metadata.width,
                height: metadata.height,
                format: format,
                parentPage: pageIdx + 1,
                tags: ['extracted', 'native', 'embedded'],
                quality: { score: 0.9 }
              });
              
              console.log(`Extracted image from page ${pageIdx + 1}: ${metadata.width}x${metadata.height} ${format}`);
              
            } catch (saveErr) {
              continue;
            }
            
          } catch (xobjErr) {
            continue;
          }
        }
        
      } catch (pageErr) {
        console.error(`Error processing page ${pageIdx + 1}:`, pageErr.message);
      }
    }
    
  } catch (err) {
    console.error('PDF-lib extraction error:', err);
  }
  
  return results;
}

async function extractAllImages(pdfBuffer, projectId, options = {}) {
  console.log('Starting native PDF image extraction with pdf-lib...');
  
  const images = await extractImagesFromPdfLib(pdfBuffer, projectId, options);
  
  if (images.length > 0) {
    console.log(`Found ${images.length} embedded images using pdf-lib`);
    return {
      mode: 'native',
      images: images,
      message: `Extracted ${images.length} embedded images from PDF`
    };
  }
  
  console.log('No embedded images found in PDF structure');
  
  return {
    mode: 'none',
    images: [],
    message: 'No embedded images found. The PDF may contain only scanned pages or vector graphics.'
  };
}

export { extractAllImages, extractImagesFromPdfLib };
