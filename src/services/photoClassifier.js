import sharp from 'sharp';

const PHOTO_CLASSIFICATION_PROMPT = `Analyze this cropped image from a board game rulebook.

TASK: Determine if this is a PHOTOGRAPH of a physical game component or NOT.

PHOTOGRAPH INDICATORS (answer YES if you see these):
- Realistic lighting with shadows and depth
- Material textures visible (card stock, wood grain, plastic sheen)
- Physical dimensionality (3D appearance)
- Natural color gradients and variations
- Components on neutral/white background
- Multiple identical pieces shown together (fan of cards, pile of tokens)

NOT A PHOTOGRAPH (answer NO if you see these):
- Flat vector graphics with solid colors
- Perfect geometric lines and shapes
- Arrows, step numbers, or instructional overlays
- Diagrams showing HOW to place or use components
- Small icons or symbols in text
- Decorative artwork or illustrations
- Text-heavy regions with component names/descriptions

Return ONLY valid JSON:
{
  "is_photo": true | false,
  "confidence": 0.0-1.0,
  "reason": "brief explanation (max 20 words)",
  "photo_type": "physical_photo" | "3d_render" | "illustration" | "diagram" | "icon" | "text"
}`;

const COMPONENT_MATCH_PROMPT = `You are matching a game component photo to its name.

This image shows a PHOTOGRAPH of a game component from the rulebook.

COMPONENT LIST TO MATCH:
{COMPONENT_LIST}

NEARBY TEXT FROM PAGE (from OCR):
{OCR_TEXT}

TASK:
1. Look at the image carefully
2. Use the nearby text labels as the PRIMARY signal
3. Match to ONE component from the list above
4. If no clear match, return null

Return ONLY valid JSON:
{
  "matched_component": "exact name from list" | null,
  "confidence": 0.0-1.0,
  "reason": "why this matches (use text labels if found)",
  "text_label_found": "exact label text near this image" | null
}`;

export async function classifyAsPhoto(openai, imageBuffer) {
  const base64Image = imageBuffer.toString('base64');
  
  try {
    const response = await openai.chat.completions.create({
      model: 'gpt-4o',
      messages: [
        {
          role: 'user',
          content: [
            { type: 'text', text: PHOTO_CLASSIFICATION_PROMPT },
            {
              type: 'image_url',
              image_url: {
                url: `data:image/png;base64,${base64Image}`,
                detail: 'low'
              }
            }
          ]
        }
      ],
      max_tokens: 300,
      temperature: 0.1,
      response_format: { type: 'json_object' }
    });

    const content = response.choices[0]?.message?.content || '{}';
    const result = JSON.parse(content);
    
    return {
      isPhoto: result.is_photo === true,
      confidence: result.confidence || 0,
      reason: result.reason || '',
      photoType: result.photo_type || 'unknown'
    };
    
  } catch (err) {
    console.error('Photo classification error:', err.message);
    return { isPhoto: false, confidence: 0, reason: 'classification failed', photoType: 'error' };
  }
}

export async function matchComponentWithOCR(openai, imageBuffer, components, ocrText) {
  const base64Image = imageBuffer.toString('base64');
  
  const componentList = components.map(c => {
    const qty = c.quantity ? ` (${c.quantity})` : '';
    return `- ${c.name}${qty}: ${c.category || 'component'}`;
  }).join('\n');
  
  const prompt = COMPONENT_MATCH_PROMPT
    .replace('{COMPONENT_LIST}', componentList)
    .replace('{OCR_TEXT}', ocrText || 'No text detected nearby');
  
  try {
    const response = await openai.chat.completions.create({
      model: 'gpt-4o',
      messages: [
        {
          role: 'user',
          content: [
            { type: 'text', text: prompt },
            {
              type: 'image_url',
              image_url: {
                url: `data:image/png;base64,${base64Image}`,
                detail: 'high'
              }
            }
          ]
        }
      ],
      max_tokens: 400,
      temperature: 0.1,
      response_format: { type: 'json_object' }
    });

    const content = response.choices[0]?.message?.content || '{}';
    const result = JSON.parse(content);
    
    return {
      matchedComponent: result.matched_component || null,
      confidence: result.confidence || 0,
      reason: result.reason || '',
      textLabelFound: result.text_label_found || null
    };
    
  } catch (err) {
    console.error('Component matching error:', err.message);
    return { matchedComponent: null, confidence: 0, reason: 'matching failed', textLabelFound: null };
  }
}

export async function calculateVisualQuality(imageBuffer) {
  try {
    const { data, info } = await sharp(imageBuffer)
      .resize(100, 100, { fit: 'inside' })
      .grayscale()
      .raw()
      .toBuffer({ resolveWithObject: true });

    const histogram = new Array(256).fill(0);
    for (let i = 0; i < data.length; i++) {
      histogram[data[i]]++;
    }

    let entropy = 0;
    const totalPixels = data.length;
    for (const count of histogram) {
      if (count > 0) {
        const p = count / totalPixels;
        entropy -= p * Math.log2(p);
      }
    }

    const { data: colorData } = await sharp(imageBuffer)
      .resize(50, 50, { fit: 'fill' })
      .raw()
      .toBuffer({ resolveWithObject: true });

    const colorBuckets = new Set();
    for (let i = 0; i < colorData.length; i += 3) {
      const r = Math.floor(colorData[i] / 32);
      const g = Math.floor(colorData[i + 1] / 32);
      const b = Math.floor(colorData[i + 2] / 32);
      colorBuckets.add(`${r}-${g}-${b}`);
    }

    let gradientMagnitude = 0;
    const width = info.width;
    for (let i = 1; i < data.length - 1; i++) {
      if (i % width !== 0 && i % width !== width - 1) {
        const dx = Math.abs(data[i + 1] - data[i - 1]);
        const dy = Math.abs(data[i + width] - data[i - width]);
        gradientMagnitude += Math.sqrt(dx * dx + dy * dy);
      }
    }
    gradientMagnitude /= data.length;

    return {
      entropy,
      colorVariety: colorBuckets.size,
      gradientMagnitude,
      isLikelyPhoto: entropy > 4.5 && colorBuckets.size > 10,
      isLikelyDiagram: entropy < 4.0 || colorBuckets.size < 8
    };

  } catch (err) {
    return {
      entropy: 5,
      colorVariety: 20,
      gradientMagnitude: 10,
      isLikelyPhoto: true,
      isLikelyDiagram: false
    };
  }
}

export function computeConfidenceScore(classificationResult, matchResult, visualQuality, pageContext) {
  let score = 0;
  
  if (classificationResult.isPhoto) {
    score += classificationResult.confidence * 0.35;
  }
  
  if (matchResult.matchedComponent) {
    score += matchResult.confidence * 0.30;
  }
  
  if (matchResult.textLabelFound) {
    score += 0.15;
  }
  
  if (visualQuality.isLikelyPhoto) {
    score += 0.10;
  }
  if (visualQuality.isLikelyDiagram) {
    score -= 0.15;
  }
  
  if (pageContext.pageType === 'components') {
    score += 0.10;
  } else if (pageContext.pageType === 'setup') {
    score += 0.05;
  }
  
  return Math.max(0, Math.min(1, score));
}
