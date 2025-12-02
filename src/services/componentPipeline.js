import sharp from 'sharp';
import fs from 'fs';
import path from 'path';
import { proposeRegions, extractRegionImage } from './regionProposal.js';
import { classifyAsPhoto, matchComponentWithOCR, calculateVisualQuality, computeConfidenceScore } from './photoClassifier.js';
import { extractTextNearRegion, fuzzyMatchComponent, terminateWorker } from './ocrService.js';

const activeJobs = new Map();

export function clearJobLock(projectId) {
  const jobKey = `pipeline-${projectId}`;
  if (activeJobs.has(jobKey)) {
    activeJobs.delete(jobKey);
    console.log(`Cleared pipeline job lock for ${projectId}`);
    return true;
  }
  return false;
}

export function isJobInProgress(projectId) {
  const jobKey = `pipeline-${projectId}`;
  if (activeJobs.has(jobKey)) {
    const existing = activeJobs.get(jobKey);
    return Date.now() - existing.startTime < 600000;
  }
  return false;
}

async function triagePage(openai, pageImageBuffer, pageNum) {
  const base64Image = pageImageBuffer.toString('base64');
  
  const prompt = `Analyze this board game rulebook page quickly.

Return ONLY valid JSON:
{
  "page_type": "components" | "setup" | "rules" | "other",
  "has_component_images": true | false,
  "confidence": 0.0-1.0,
  "reason": "brief reason (max 10 words)"
}

COMPONENTS page: Shows labeled photos of game pieces (cards, tokens, boards)
SETUP page: Shows how to arrange game before playing
RULES page: Text-heavy gameplay instructions
OTHER: Everything else`;

  try {
    const response = await openai.chat.completions.create({
      model: 'gpt-4o',
      messages: [{
        role: 'user',
        content: [
          { type: 'text', text: prompt },
          { type: 'image_url', image_url: { url: `data:image/png;base64,${base64Image}`, detail: 'low' } }
        ]
      }],
      max_tokens: 200,
      temperature: 0.1,
      response_format: { type: 'json_object' }
    });

    const result = JSON.parse(response.choices[0]?.message?.content || '{}');
    return {
      pageNum,
      pageType: result.page_type || 'other',
      hasComponentImages: result.has_component_images === true,
      confidence: result.confidence || 0,
      reason: result.reason || ''
    };
  } catch (err) {
    console.error(`Page ${pageNum} triage error:`, err.message);
    return { pageNum, pageType: 'other', hasComponentImages: false, confidence: 0, reason: 'error' };
  }
}

async function processPageWithPipeline(openai, pageImageBuffer, pageNum, components, pageContext) {
  console.log(`\n--- Processing page ${pageNum} (${pageContext.pageType}) ---`);
  
  console.log(`  Stage 1: Region proposal (CV-based)...`);
  const regions = await proposeRegions(pageImageBuffer, {
    minAreaPercent: 0.015,
    maxAreaPercent: 0.45,
    minSize: 80
  });
  console.log(`    Found ${regions.length} candidate regions`);
  
  if (regions.length === 0) {
    return [];
  }
  
  const validDetections = [];
  
  for (let i = 0; i < regions.length; i++) {
    const region = regions[i];
    console.log(`  Region ${i + 1}/${regions.length}: ${(region.area * 100).toFixed(1)}% of page`);
    
    const regionBuffer = await extractRegionImage(pageImageBuffer, region, 0.05);
    if (!regionBuffer) {
      console.log(`    Skipped: too small to extract`);
      continue;
    }
    
    console.log(`    Stage 2: Visual quality check...`);
    const visualQuality = await calculateVisualQuality(regionBuffer);
    
    if (visualQuality.isLikelyDiagram) {
      console.log(`    Skipped: likely diagram (entropy: ${visualQuality.entropy.toFixed(2)}, colors: ${visualQuality.colorVariety})`);
      continue;
    }
    
    console.log(`    Stage 3: Photo classification (LLM)...`);
    const classification = await classifyAsPhoto(openai, regionBuffer);
    
    if (!classification.isPhoto) {
      console.log(`    Rejected: ${classification.photoType} - ${classification.reason}`);
      continue;
    }
    console.log(`    Confirmed as photo (${classification.confidence.toFixed(2)} confidence): ${classification.photoType}`);
    
    console.log(`    Stage 4: OCR text extraction...`);
    const ocrResult = await extractTextNearRegion(pageImageBuffer, region, 0.2);
    const nearbyText = ocrResult.text.substring(0, 200);
    console.log(`    OCR text: "${nearbyText.replace(/\n/g, ' ').substring(0, 60)}..."`);
    
    let matchedComponent = null;
    let matchConfidence = 0;
    let textLabelFound = null;
    
    if (ocrResult.nearbyLabels.length > 0) {
      console.log(`    Found labels: ${ocrResult.nearbyLabels.map(l => l.text).join(', ')}`);
      
      for (const label of ocrResult.nearbyLabels) {
        const match = fuzzyMatchComponent(label.text, components);
        if (match && match.score > matchConfidence) {
          matchedComponent = match.component.name;
          matchConfidence = match.score;
          textLabelFound = label.text;
        }
      }
    }
    
    if (!matchedComponent && components.length > 0) {
      console.log(`    Stage 5: LLM component matching...`);
      const llmMatch = await matchComponentWithOCR(openai, regionBuffer, components, nearbyText);
      
      if (llmMatch.matchedComponent) {
        matchedComponent = llmMatch.matchedComponent;
        matchConfidence = llmMatch.confidence;
        textLabelFound = llmMatch.textLabelFound;
        console.log(`    LLM matched: "${matchedComponent}" (${matchConfidence.toFixed(2)})`);
      }
    } else if (matchedComponent) {
      console.log(`    OCR matched: "${matchedComponent}" from label "${textLabelFound}"`);
    }
    
    const overallConfidence = computeConfidenceScore(
      classification,
      { matchedComponent, confidence: matchConfidence, textLabelFound },
      visualQuality,
      pageContext
    );
    
    console.log(`    Overall confidence: ${overallConfidence.toFixed(2)}`);
    
    // Find canonical component name (match without quantity suffix)
    let canonicalName = matchedComponent;
    if (matchedComponent) {
      for (const comp of components) {
        const compNameLower = comp.name.toLowerCase().trim();
        const matchedLower = matchedComponent.toLowerCase().replace(/\s*\([^)]*\)\s*$/g, '').trim();
        if (compNameLower === matchedLower || compNameLower.includes(matchedLower) || matchedLower.includes(compNameLower)) {
          canonicalName = comp.name;
          break;
        }
      }
    }
    
    if (overallConfidence >= 0.4) {
      validDetections.push({
        region,
        regionBuffer,
        classification,
        visualQuality,
        matchedComponent: canonicalName || matchedComponent,
        matchConfidence,
        textLabelFound,
        overallConfidence,
        pageNum,
        pageContext
      });
      console.log(`    Added to valid detections: "${canonicalName || matchedComponent}"`);
    } else {
      console.log(`    Rejected: confidence too low (${overallConfidence.toFixed(2)} < 0.4)`);
    }
    
    await new Promise(resolve => setTimeout(resolve, 200));
  }
  
  return validDetections;
}

export async function extractComponentsWithPipeline(openai, projectId, pageImagePaths, components = []) {
  const jobKey = `pipeline-${projectId}`;
  
  if (activeJobs.has(jobKey)) {
    const existing = activeJobs.get(jobKey);
    if (Date.now() - existing.startTime < 600000) {
      throw new Error('Component pipeline already in progress. Click "Force Retry" to restart.');
    }
  }
  
  activeJobs.set(jobKey, { startTime: Date.now(), pageCount: pageImagePaths.length });
  
  try {
    const outputDir = path.join(process.cwd(), 'data', 'component-crops', String(projectId));
    await fs.promises.mkdir(outputDir, { recursive: true });
    
    const existingFiles = await fs.promises.readdir(outputDir).catch(() => []);
    for (const file of existingFiles) {
      await fs.promises.unlink(path.join(outputDir, file)).catch(() => {});
    }
    
    console.log(`\n========================================`);
    console.log(`MULTI-STAGE COMPONENT DETECTION PIPELINE`);
    console.log(`========================================`);
    console.log(`Project: ${projectId}`);
    console.log(`Pages: ${pageImagePaths.length}`);
    console.log(`Components to find: ${components.map(c => c.name).join(', ') || 'any'}`);
    console.log(`========================================\n`);
    
    console.log(`PHASE 1: Page Triage`);
    console.log(`--------------------`);
    
    const pageTriageResults = [];
    for (let i = 0; i < Math.min(pageImagePaths.length, 8); i++) {
      const pageBuffer = await fs.promises.readFile(pageImagePaths[i]);
      const triage = await triagePage(openai, pageBuffer, i + 1);
      pageTriageResults.push({ ...triage, imagePath: pageImagePaths[i] });
      console.log(`  Page ${i + 1}: ${triage.pageType} (${triage.hasComponentImages ? 'HAS IMAGES' : 'no images'}) - ${triage.reason}`);
    }
    
    const prioritizedPages = pageTriageResults
      .filter(p => p.hasComponentImages || p.pageType === 'components' || p.pageType === 'setup')
      .sort((a, b) => {
        const typeOrder = { components: 0, setup: 1, rules: 2, other: 3 };
        return (typeOrder[a.pageType] || 3) - (typeOrder[b.pageType] || 3);
      });
    
    console.log(`\nPrioritized ${prioritizedPages.length} pages for detailed analysis`);
    
    console.log(`\nPHASE 2: Multi-Stage Detection`);
    console.log(`------------------------------`);
    
    const allDetections = [];
    const foundComponents = new Set();
    
    for (const page of prioritizedPages) {
      const pageBuffer = await fs.promises.readFile(page.imagePath);
      
      const remainingComponents = components.filter(c => !foundComponents.has(c.name));
      
      const detections = await processPageWithPipeline(
        openai,
        pageBuffer,
        page.pageNum,
        remainingComponents,
        { pageType: page.pageType }
      );
      
      for (const detection of detections) {
        console.log(`  Detection: "${detection.matchedComponent}" conf=${detection.overallConfidence.toFixed(2)}, already found=${foundComponents.has(detection.matchedComponent)}`);
        if (detection.matchedComponent && !foundComponents.has(detection.matchedComponent)) {
          foundComponents.add(detection.matchedComponent);
          allDetections.push(detection);
          console.log(`    -> Added to allDetections (matched: ${detection.matchedComponent})`);
        } else if (!detection.matchedComponent && detection.overallConfidence >= 0.6) {
          allDetections.push(detection);
          console.log(`    -> Added to allDetections (unmatched, high conf)`);
        } else {
          console.log(`    -> Skipped (duplicate or low conf)`);
        }
      }
      
      if (components.length > 0 && foundComponents.size >= components.length) {
        console.log(`\nAll ${components.length} components found! Stopping early.`);
        break;
      }
    }
    
    console.log(`\nPHASE 3: Crop and Save`);
    console.log(`----------------------`);
    console.log(`Crops to save: ${allDetections.length}`);
    
    const croppedImages = [];
    
    for (const detection of allDetections) {
      try {
        const safeName = (detection.matchedComponent || 'component')
          .replace(/[^a-zA-Z0-9\-_]/g, '_')
          .slice(0, 40);
        const filename = `page${detection.pageNum}-${safeName}-${Date.now()}.png`;
        const filePath = path.join(outputDir, filename);
        
        await fs.promises.writeFile(filePath, detection.regionBuffer);
        
        const metadata = await sharp(detection.regionBuffer).metadata();
        
        croppedImages.push({
          id: `crop-${Date.now()}-${Math.random().toString(36).substr(2, 6)}`,
          source: 'ai-component-crop',
          fileKey: filePath,
          name: detection.matchedComponent || 'Unknown Component',
          confidence: detection.overallConfidence,
          pageNum: detection.pageNum,
          dimensions: { width: metadata.width, height: metadata.height },
          classification: detection.classification.photoType,
          textLabel: detection.textLabelFound,
          tags: [
            'component-crop',
            detection.classification.photoType,
            `page-${detection.pageNum}`,
            detection.overallConfidence >= 0.7 ? 'high-confidence' : 'needs-review'
          ]
        });
        
        console.log(`  Saved: "${detection.matchedComponent || 'Unknown'}" (${metadata.width}x${metadata.height}, confidence: ${detection.overallConfidence.toFixed(2)})`);
        
      } catch (err) {
        console.error(`  Failed to save crop:`, err.message);
      }
    }
    
    await terminateWorker();
    
    console.log(`\n========================================`);
    console.log(`PIPELINE COMPLETE`);
    console.log(`========================================`);
    console.log(`Total crops: ${croppedImages.length}`);
    console.log(`High confidence (>0.7): ${croppedImages.filter(c => c.confidence >= 0.7).length}`);
    console.log(`Needs review (0.4-0.7): ${croppedImages.filter(c => c.confidence < 0.7).length}`);
    if (components.length > 0) {
      console.log(`Components found: ${foundComponents.size}/${components.length}`);
      const missing = components.filter(c => !foundComponents.has(c.name));
      if (missing.length > 0) {
        console.log(`Missing: ${missing.map(c => c.name).join(', ')}`);
      }
    }
    console.log(`========================================\n`);
    
    return {
      crops: croppedImages,
      stats: {
        totalPages: pageImagePaths.length,
        pagesAnalyzed: prioritizedPages.length,
        regionsProposed: allDetections.length,
        componentsCropped: croppedImages.length,
        highConfidence: croppedImages.filter(c => c.confidence >= 0.7).length,
        needsReview: croppedImages.filter(c => c.confidence < 0.7).length,
        componentsFound: foundComponents.size,
        componentsMissing: components.filter(c => !foundComponents.has(c.name)).map(c => c.name)
      }
    };
    
  } finally {
    activeJobs.delete(jobKey);
  }
}
