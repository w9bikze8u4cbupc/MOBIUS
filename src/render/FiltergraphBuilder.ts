// Filtergraph builder that turns timeline + templates into a single filter_complex

import { ANIMATION_TEMPLATES, getTemplate, buildHighlightSpotlight, buildLowerThird } from './AnimationTemplateRegistry';
import { LabelGen } from './LabelGen';
import { fmt } from './ffmpegExpr';

interface TimelineItem {
  id: string;
  label: string;
  tStart: number;
  tEnd: number;
  section: string;
  anim?: {
    templateId?: string;
    focus?: string | string[];
    params?: Record<string, any>;
  };
}

interface Timeline {
  meta: {
    audioPath?: string;
    durationSec: number;
  };
  items: TimelineItem[];
}

interface AssetManifest {
  assets: Record<string, { path: string }>;
  placeholders?: { image: string };
}

export class FiltergraphBuilder {
  private timeline: Timeline;
  private manifest: AssetManifest;
  private baseImage: string;
  private width: number;
  private height: number;

  constructor(timeline: Timeline, manifest: AssetManifest, baseImage: string, width: number = 1920, height: number = 1080) {
    this.timeline = timeline;
    this.manifest = manifest;
    this.baseImage = baseImage;
    this.width = width;
    this.height = height;
  }

  build(): { inputs: string[], filtergraph: string, outputLabel: string } {
    // Start with base image
    const inputs = [`-loop 1 -t ${this.timeline.meta.durationSec} -i ${this.baseImage}`];
    const labelGen = new LabelGen();
    
    // Initialize filtergraph with base image
    let filtergraph = `[0:v]scale=${this.width}:${this.height},format=rgba[${labelGen.next('base')}]`;
    let lastOutput = `${labelGen.peek('base') - 1}`;
    let inputIndex = 1;

    // Process each timeline item
    for (let i = 0; i < this.timeline.items.length; i++) {
      const item = this.timeline.items[i];
      const duration = item.tEnd - item.tStart;
      
      // Skip items with no animation
      if (!item.anim?.templateId) {
        continue;
      }

      const template = getTemplate(item.anim.templateId as any);
      if (!template) {
        console.warn(`Unknown template: ${item.anim.templateId}`);
        continue;
      }

      // Handle special templates that need complex filtergraphs
      if (item.anim.templateId === 'highlight_spotlight') {
        const params = {
          ...item.anim.params,
          start: item.tStart,
          end: item.tEnd
        };
        
        const result = buildHighlightSpotlight(
          lastOutput,
          this.width,
          this.height,
          params as any
        );
        
        filtergraph += `;${result.graph}`;
        lastOutput = result.outV;
        continue;
      }
      
      if (item.anim.templateId === 'lower_third_boxed') {
        const params = {
          ...item.anim.params,
          start: item.tStart,
          end: item.tEnd
        };
        
        const result = buildLowerThird(
          lastOutput,
          this.width,
          this.height,
          params as any
        );
        
        filtergraph += `;${result.graph}`;
        lastOutput = result.outV;
        continue;
      }

      // Generate the filter for this animation
      const filter = template.generateFiltergraph(item.anim.params || {});
      
      if (filter === "null") {
        // Skip null filters
        continue;
      }

      // Add the filter to the chain
      const outputLabel = labelGen.next('v');
      filtergraph += `;[${lastOutput}]${filter}[${outputLabel}]`;
      lastOutput = outputLabel;
      inputIndex++;
    }

    // Add audio if available
    if (this.timeline.meta.audioPath) {
      inputs.push(`-i ${this.timeline.meta.audioPath}`);
      
      // Add audio processing chain with anti-pumping
      const audioProcessing = buildAudioAntiPumping('1:a', '1:a'); // Assuming music and VO are the same input for now
      filtergraph += `;${audioProcessing.graph}`;
    }

    return {
      inputs,
      filtergraph,
      outputLabel: lastOutput
    };
  }

  buildWithConcat(): { inputs: string[], filtergraph: string, concatList: string } {
    // Alternative approach: generate segments and concatenate
    const segments: string[] = [];
    const tmpDir = "out/.render";
    
    // Create segments for each timeline item
    for (let i = 0; i < this.timeline.items.length; i++) {
      const item = this.timeline.items[i];
      const duration = Math.max(0.5, item.tEnd - item.tStart);
      const segPath = `${tmpDir}/seg_${String(i).padStart(3, "0")}.mp4`;
      
      // This would be implemented with actual ffmpeg calls
      segments.push(segPath);
    }
    
    // Create concat list
    const concatList = segments.map(s => `file '${s}'`).join('\n');
    
    return {
      inputs: [],
      filtergraph: "",
      concatList
    };
  }
}

// Helper function to estimate duration based on text
export function estimateSecondsByWPM(text: string, opts?: {
  wpm?: number;            // typical 150–165 for crisp TTS
  minSeconds?: number;     // do not go below this
  perBeatPad?: number;     // add small pad for visuals to breathe
}) {
  const { wpm = 155, minSeconds = 1.25, perBeatPad = 0.35 } = opts ?? {};
  const words = (text?.trim()?.match(/\S+/g) ?? []).length;
  const speech = words > 0 ? (words / wpm) * 60 : 0;
  return Math.max(minSeconds, speech + perBeatPad);
}

// Audio sidechain duck: lowers bg/audio bus by duckDb while VO (sidechain) is active
// Params: { duckDb= -12, attack=0.02, release=0.25, threshold=0.02 }
export function buildAudioDucking(mainA: string, sidechainA: string, p?: {
  duckDb?: number; attack?: number; release?: number; threshold?: number;
}) {
  const duckDb = p?.duckDb ?? -12;
  const attack = p?.attack ?? 0.02;
  const release = p?.release ?? 0.25;
  const thr = p?.threshold ?? 0.02;
  const graph = `
[${mainA}][${sidechainA}]sidechaincompress=threshold=${fmt(thr, 2)}:ratio=8:attack=${fmt(attack)}:release=${fmt(release)}:makeup=0:mix=1:level_in=1:level_sc=1:gain_sc=${fmt(duckDb)}[a_duck]
`.trim();
  return { outA: 'a_duck', graph };
}

// Audio anti-pumping chain: prevents music "breathing" when VO is silent
// Adds silence gate to music sidechain to avoid pumping when VO is silent
export function buildAudioAntiPumping(mainA: string, sidechainA: string): { outA: string, graph: string } {
  const graph = `
[${mainA}][${sidechainA}]sidechaincompress=threshold=0.06:ratio=12:attack=5:release=250:mix=1.0[mduck];
[mduck]dynaudnorm=f=150:g=5:p=0.9:m=3:s=10,alimiter=limit=-1.0[music_bus]
`.trim();
  return { outA: 'music_bus', graph };
}

// Export the helper functions
export { buildHighlightSpotlight, buildLowerThird };