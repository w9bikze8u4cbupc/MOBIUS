import sharp from 'sharp';

export async function proposeRegions(imageBuffer, options = {}) {
  const {
    minAreaPercent = 0.01,
    maxAreaPercent = 0.5,
    minAspectRatio = 0.2,
    maxAspectRatio = 5.0,
    minSize = 60,
    edgeThreshold = 30
  } = options;

  try {
    const metadata = await sharp(imageBuffer).metadata();
    const { width, height } = metadata;
    const totalArea = width * height;

    const edgeBuffer = await sharp(imageBuffer)
      .grayscale()
      .blur(1.5)
      .convolve({
        width: 3,
        height: 3,
        kernel: [-1, -1, -1, -1, 8, -1, -1, -1, -1]
      })
      .normalize()
      .raw()
      .toBuffer();

    const thresholded = Buffer.alloc(edgeBuffer.length);
    for (let i = 0; i < edgeBuffer.length; i++) {
      thresholded[i] = edgeBuffer[i] > edgeThreshold ? 255 : 0;
    }

    const regions = findRectangularRegions(thresholded, width, height, {
      minSize,
      minAreaPercent,
      maxAreaPercent,
      minAspectRatio,
      maxAspectRatio,
      totalArea
    });

    const gridRegions = proposeGridRegions(width, height, totalArea, {
      minAreaPercent,
      maxAreaPercent
    });

    const allRegions = [...regions, ...gridRegions];
    const merged = mergeOverlappingRegions(allRegions);
    
    const normalized = merged.map(r => ({
      x: r.x / width,
      y: r.y / height,
      width: r.width / width,
      height: r.height / height,
      pixelBbox: { x: r.x, y: r.y, width: r.width, height: r.height },
      area: (r.width * r.height) / totalArea,
      aspectRatio: r.width / r.height,
      source: r.source || 'edge'
    }));

    return normalized.filter(r => 
      r.area >= minAreaPercent && 
      r.area <= maxAreaPercent &&
      r.aspectRatio >= minAspectRatio &&
      r.aspectRatio <= maxAspectRatio
    );

  } catch (err) {
    console.error('Region proposal error:', err.message);
    return [];
  }
}

function findRectangularRegions(binaryBuffer, width, height, options) {
  const { minSize, minAreaPercent, maxAreaPercent, totalArea } = options;
  const regions = [];
  const visited = new Set();
  
  const getPixel = (x, y) => binaryBuffer[y * width + x];
  
  for (let y = 0; y < height; y += 8) {
    for (let x = 0; x < width; x += 8) {
      if (getPixel(x, y) > 0 && !visited.has(`${x},${y}`)) {
        const region = floodFillBounds(binaryBuffer, width, height, x, y, visited);
        
        if (region.width >= minSize && region.height >= minSize) {
          const area = (region.width * region.height) / totalArea;
          if (area >= minAreaPercent * 0.5 && area <= maxAreaPercent * 1.5) {
            regions.push({ ...region, source: 'edge' });
          }
        }
      }
    }
  }
  
  return regions;
}

function floodFillBounds(buffer, width, height, startX, startY, visited) {
  let minX = startX, maxX = startX, minY = startY, maxY = startY;
  const stack = [[startX, startY]];
  const getPixel = (x, y) => buffer[y * width + x];
  
  let iterations = 0;
  const maxIterations = 10000;
  
  while (stack.length > 0 && iterations < maxIterations) {
    iterations++;
    const [x, y] = stack.pop();
    const key = `${x},${y}`;
    
    if (visited.has(key)) continue;
    if (x < 0 || x >= width || y < 0 || y >= height) continue;
    if (getPixel(x, y) === 0) continue;
    
    visited.add(key);
    minX = Math.min(minX, x);
    maxX = Math.max(maxX, x);
    minY = Math.min(minY, y);
    maxY = Math.max(maxY, y);
    
    stack.push([x + 4, y], [x - 4, y], [x, y + 4], [x, y - 4]);
  }
  
  return {
    x: minX,
    y: minY,
    width: maxX - minX,
    height: maxY - minY
  };
}

function proposeGridRegions(width, height, totalArea, options) {
  const { minAreaPercent, maxAreaPercent } = options;
  const regions = [];
  
  const gridConfigs = [
    { cols: 2, rows: 2 },
    { cols: 3, rows: 2 },
    { cols: 2, rows: 3 },
    { cols: 3, rows: 3 },
    { cols: 4, rows: 3 }
  ];
  
  for (const { cols, rows } of gridConfigs) {
    const cellWidth = Math.floor(width / cols);
    const cellHeight = Math.floor(height / rows);
    const cellArea = (cellWidth * cellHeight) / totalArea;
    
    if (cellArea >= minAreaPercent && cellArea <= maxAreaPercent) {
      for (let row = 0; row < rows; row++) {
        for (let col = 0; col < cols; col++) {
          const padding = 0.1;
          regions.push({
            x: Math.floor(col * cellWidth + cellWidth * padding),
            y: Math.floor(row * cellHeight + cellHeight * padding),
            width: Math.floor(cellWidth * (1 - padding * 2)),
            height: Math.floor(cellHeight * (1 - padding * 2)),
            source: 'grid'
          });
        }
      }
    }
  }
  
  return regions;
}

function mergeOverlappingRegions(regions, iouThreshold = 0.5) {
  if (regions.length === 0) return [];
  
  const sorted = [...regions].sort((a, b) => 
    (b.width * b.height) - (a.width * a.height)
  );
  
  const merged = [];
  const used = new Set();
  
  for (let i = 0; i < sorted.length; i++) {
    if (used.has(i)) continue;
    
    let current = { ...sorted[i] };
    
    for (let j = i + 1; j < sorted.length; j++) {
      if (used.has(j)) continue;
      
      const iou = calculateIoU(current, sorted[j]);
      if (iou > iouThreshold) {
        current = expandRegion(current, sorted[j]);
        used.add(j);
      }
    }
    
    merged.push(current);
    used.add(i);
  }
  
  return merged;
}

function calculateIoU(a, b) {
  const x1 = Math.max(a.x, b.x);
  const y1 = Math.max(a.y, b.y);
  const x2 = Math.min(a.x + a.width, b.x + b.width);
  const y2 = Math.min(a.y + a.height, b.y + b.height);
  
  if (x2 <= x1 || y2 <= y1) return 0;
  
  const intersection = (x2 - x1) * (y2 - y1);
  const areaA = a.width * a.height;
  const areaB = b.width * b.height;
  const union = areaA + areaB - intersection;
  
  return intersection / union;
}

function expandRegion(a, b) {
  const x = Math.min(a.x, b.x);
  const y = Math.min(a.y, b.y);
  return {
    x,
    y,
    width: Math.max(a.x + a.width, b.x + b.width) - x,
    height: Math.max(a.y + a.height, b.y + b.height) - y,
    source: a.source
  };
}

export async function extractRegionImage(imageBuffer, region, padding = 0.1) {
  const metadata = await sharp(imageBuffer).metadata();
  const { width, height } = metadata;
  
  const px = region.pixelBbox || {
    x: Math.floor(region.x * width),
    y: Math.floor(region.y * height),
    width: Math.floor(region.width * width),
    height: Math.floor(region.height * height)
  };
  
  const padX = Math.floor(px.width * padding);
  const padY = Math.floor(px.height * padding);
  
  const left = Math.floor(Math.max(0, px.x - padX));
  const top = Math.floor(Math.max(0, px.y - padY));
  const extractWidth = Math.floor(Math.min(px.width + padX * 2, width - left));
  const extractHeight = Math.floor(Math.min(px.height + padY * 2, height - top));
  
  if (extractWidth < 40 || extractHeight < 40) {
    return null;
  }
  
  return sharp(imageBuffer)
    .extract({ left, top, width: extractWidth, height: extractHeight })
    .png()
    .toBuffer();
}
