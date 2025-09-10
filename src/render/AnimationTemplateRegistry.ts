// Animation template registry with parametric filtergraph snippets
import { LabelGen } from './LabelGen';

// Add import for the new ffmpegExpr functions
import { fmt, ffEscapeText, enableBetween, ease, lerp } from './ffmpegExpr';

// Import theme
import theme from './theme.json';

// Local clamp expression helper (keeps crop window in-bounds)
const clampExpr = (x: string, lo: string, hi: string) => `if(lt(${x},${lo}),${lo}, if(gt(${x},${hi}),${hi}, ${x}))`;

// Helper to lerp where endpoints may be expressions
function lerpExpr(aExpr: string, bExpr: string, nExpr: string) {
  return `((${aExpr}) + ((${bExpr}) - (${aExpr}))*${nExpr})`;
}

export type AnimationTemplateId = 
  | "highlight_box"
  | "ken_burns"
  | "push_on"
  | "lower_third"
  | "fan_cards"
  | "wipe"
  | "fade"
  | "draw_text"
  | "highlight_spotlight"
  | "lower_third_boxed";

export interface AnimationTemplate {
  id: AnimationTemplateId;
  name: string;
  description: string;
  params: {
    key: string;
    type: "number" | "string" | "boolean" | "color";
    default?: any;
    description?: string;
  }[];
  generateFiltergraph: (params: Record<string, any>) => string;
}

// Helper to build spotlight highlight
export function buildHighlightSpotlight(baseV: string, w: number, h: number, p: {
  x: number; y: number; w: number; h: number;
  opacity?: number; feather?: number;
  start: number; end: number;
}) {
  const opa = p.opacity ?? 0.55;
  const blur = Math.max(0, p.feather ?? 18);
  const en = `enable='between(t,${p.start},${p.end})'`;
  const labelGen = new LabelGen();

  // Build a translucent black layer with a "hole" where the highlight is
  // Then softly blur the mask edges for feathering
  const baseSpotLabel = labelGen.next('base_spot');
  const spotSrcLabel = labelGen.next('spot_src');
  const spotMaskLabel = labelGen.next('spot_mask');
  const spotOutLabel = labelGen.next('spot_out');

  const graph = `
[${baseV}]format=rgba[${baseSpotLabel}];
color=c=black@${opa}:s=${w}x${h}:d=${Math.max(p.end - p.start, 0.05)}[${spotSrcLabel}];
[${spotSrcLabel}]format=rgba,
  drawbox=x=${p.x}:y=${p.y}:w=${p.w}:h=${p.h}:t=fill:color=black@0.0${blur > 0 ? `,gblur=sigma=${blur}` : ''}[${spotMaskLabel}];
[${baseSpotLabel}][${spotMaskLabel}]overlay:shortest=1:${en}[${spotOutLabel}]
`.trim();

  return { outV: spotOutLabel, graph };
}

// Helper to build lower-third with boxed background
export function buildLowerThird(baseV: string, w: number, h: number, p: {
  text: string; font: string;
  fontsize?: number; color?: string;
  boxColor?: string; boxOpacity?: number;
  align?: 'center'|'left'|'right';
  marginX?: number; marginY?: number;
  start: number; end: number;
}) {
  const fs = p.fontsize ?? 48;
  const color = p.color ?? theme.colors.text;
  const boxColor = p.boxColor ?? theme.lowerThird.backgroundColor;
  const boxA = p.boxOpacity ?? theme.lowerThird.backgroundOpacity;
  const mx = p.marginX ?? theme.lowerThird.padding.x;
  const my = p.marginY ?? theme.lowerThird.padding.y;
  const align = p.align ?? 'center';
  const en = `enable='between(t,${p.start},${p.end})'`;
  const labelGen = new LabelGen();

  // x expression by alignment (uses text_w)
  const xExpr =
    align === 'left' ? `${mx}`
    : align === 'right' ? `(w - text_w - ${mx})`
    : `((w - text_w)/2)`;

  const baseLtLabel = labelGen.next('base_lt');
  const ltOutLabel = labelGen.next('lt_out');

  const graph = `
[${baseV}]format=rgba[${baseLtLabel}];
[${baseLtLabel}]drawtext=fontfile='${p.font.replace(/\\/g, '/')}'\
:text='${p.text.replace(/\\/g, '\\\\').replace(/:/g, '\\:').replace(/'/g, "\\\\'")}'\
:fontsize=${fs}:fontcolor=${color}\
:box=1:boxcolor=${boxColor}@${boxA}:boxborderw=${theme.lowerThird.cornerRadius}\
:x=${xExpr}:y=(h - text_h - ${my})\
:${en}[${ltOutLabel}]
`.trim();

  return { outV: ltOutLabel, graph };
}

export const ANIMATION_TEMPLATES: Record<AnimationTemplateId, AnimationTemplate> = {
  highlight_box: {
    id: "highlight_box",
    name: "Highlight Box",
    description: "Draw a highlight box over a specific area",
    params: [
      { key: "x", type: "number", default: 0, description: "X position of the box" },
      { key: "y", type: "number", default: 0, description: "Y position of the box" },
      { key: "width", type: "number", default: 100, description: "Width of the box" },
      { key: "height", type: "number", default: 100, description: "Height of the box" },
      { key: "color", type: "color", default: "yellow", description: "Color of the box" },
      { key: "alpha", type: "number", default: 0.3, description: "Transparency of the box (0-1)" },
      { key: "border", type: "number", default: 2, description: "Border thickness" },
    ],
    generateFiltergraph: (params) => {
      const { x = 0, y = 0, width = 100, height = 100, color = "yellow", alpha = 0.3, border = 2 } = params;
      return `drawbox=x=${x}:y=${y}:w=${width}:h=${height}:color=${color}@${alpha}:t=${border}`;
    }
  },

  ken_burns: {
    id: "ken_burns",
    name: "Ken Burns Effect",
    description: "Pan and zoom effect over an image",
    params: [
      { key: "zoom_start", type: "number", default: 1.0, description: "Starting zoom level" },
      { key: "zoom_end", type: "number", default: 1.1, description: "Ending zoom level" },
      { key: "x_start", type: "number", default: 0, description: "Starting X position" },
      { key: "x_end", type: "number", default: 0, description: "Ending X position" },
      { key: "y_start", type: "number", default: 0, description: "Starting Y position" },
      { key: "y_end", type: "number", default: 0, description: "Ending Y position" },
      { key: "duration", type: "number", default: 5, description: "Duration in seconds" },
    ],
    generateFiltergraph: (params) => {
      const { zoom_start = 1.0, zoom_end = 1.1, x_start = 0, x_end = 0, y_start = 0, y_end = 0, duration = 5 } = params;
      // Simplified Ken Burns using zoompan filter
      return `zoompan=z='if(lte(zoom,${zoom_start}),${zoom_start},if(gte(zoom,${zoom_end}),${zoom_end},zoom+0.0015))':x='if(lte(zoom,${zoom_start}),${x_start},if(gte(zoom,${zoom_end}),${x_end},x+(${x_end}-${x_start})/${duration}*30))':y='if(lte(zoom,${zoom_start}),${y_start},if(gte(zoom,${zoom_end}),${y_end},y+(${y_end}-${y_start})/${duration}*30))':d=${duration*30}:s=1920x1080:fps=30`;
    }
  },

  push_on: {
    id: "push_on",
    name: "Push On",
    description: "Slide in an overlay from a direction",
    params: [
      { key: "direction", type: "string", default: "left", description: "Direction to push from (left, right, top, bottom)" },
      { key: "duration", type: "number", default: 0.5, description: "Duration of the push in seconds" },
      { key: "x", type: "number", default: 0, description: "Final X position" },
      { key: "y", type: "number", default: 0, description: "Final Y position" },
    ],
    generateFiltergraph: (params) => {
      const { direction = "left", duration = 0.5, x = 0, y = 0 } = params;
      // Simplified push on using overlay with movement
      // Note: In a real implementation, w and h would be the width and height of the overlay
      let expr = "";
      switch (direction) {
        case "left":
          expr = `x=-ow+t/${duration}*${x+100}:y=${y}`;
          break;
        case "right":
          expr = `x=W-t/${duration}*${x}:y=${y}`;
          break;
        case "top":
          expr = `x=${x}:y=-oh+t/${duration}*${y+100}`;
          break;
        case "bottom":
          expr = `x=${x}:y=H-t/${duration}*${y}`;
          break;
        default:
          expr = `x=${x}:y=${y}`;
      }
      return `overlay=${expr}:enable='between(t,0,${duration})'`;
    }
  },

  lower_third: {
    id: "lower_third",
    name: "Lower Third",
    description: "Text overlay in the lower third of the screen",
    params: [
      { key: "text", type: "string", default: "Title", description: "Text to display" },
      { key: "font_file", type: "string", default: "", description: "Path to font file" },
      { key: "font_size", type: "number", default: 36, description: "Font size" },
      { key: "font_color", type: "color", default: "white", description: "Font color" },
      { key: "background_color", type: "color", default: "black", description: "Background color" },
      { key: "background_alpha", type: "number", default: 0.5, description: "Background transparency" },
    ],
    generateFiltergraph: (params) => {
      const { text = "Title", font_file = "", font_size = 36, font_color = "white", background_color = "black", background_alpha = 0.5 } = params;
      const escapedText = text.replace(/\\/g, '\\\\').replace(/:/g, '\\:').replace(/'/g, "\\\\'");
      let filter = `drawtext=`;
      if (font_file) {
        filter += `fontfile='${font_file.replace(/\\/g, '/')}':`;
      }
      filter += `text='${escapedText}':fontsize=${font_size}:fontcolor=${font_color}:x=(w-text_w)/2:y=h-100`;
      return filter;
    }
  },

  highlight_spotlight: {
    id: "highlight_spotlight",
    name: "Spotlight Highlight",
    description: "Dims outside an area with optional feather",
    params: [
      { key: "x", type: "number", default: 0, description: "X position of the highlight" },
      { key: "y", type: "number", default: 0, description: "Y position of the highlight" },
      { key: "w", type: "number", default: 100, description: "Width of the highlight" },
      { key: "h", type: "number", default: 100, description: "Height of the highlight" },
      { key: "opacity", type: "number", default: 0.55, description: "Opacity of the dimming (0-1)" },
      { key: "feather", type: "number", default: 18, description: "Feather radius in pixels" },
      { key: "start", type: "number", default: 0, description: "Start time in seconds" },
      { key: "end", type: "number", default: 5, description: "End time in seconds" },
    ],
    generateFiltergraph: (params) => {
      // This is a complex filter that requires multiple inputs
      // We'll return a placeholder and handle it specially in the builder
      return `null`;
    }
  },

  lower_third_boxed: {
    id: "lower_third_boxed",
    name: "Boxed Lower Third",
    description: "Lower third with boxed background and safe margins",
    params: [
      { key: "text", type: "string", default: "Title", description: "Text to display" },
      { key: "font", type: "string", default: "", description: "Path to font file" },
      { key: "fontsize", type: "number", default: 48, description: "Font size" },
      { key: "color", type: "color", default: "#FFFFFF", description: "Font color" },
      { key: "boxColor", type: "color", default: "#000000", description: "Box background color" },
      { key: "boxOpacity", type: "number", default: 0.6, description: "Box background opacity (0-1)" },
      { key: "align", type: "string", default: "center", description: "Text alignment (left, center, right)" },
      { key: "marginX", type: "number", default: 80, description: "Horizontal margin in pixels" },
      { key: "marginY", type: "number", default: 120, description: "Vertical margin in pixels" },
      { key: "start", type: "number", default: 0, description: "Start time in seconds" },
      { key: "end", type: "number", default: 5, description: "End time in seconds" },
    ],
    generateFiltergraph: (params) => {
      // This is a complex filter that requires multiple inputs
      // We'll return a placeholder and handle it specially in the builder
      return `null`;
    }
  },

  fan_cards: {
    id: "fan_cards",
    name: "Fan Cards",
    description: "Display cards in a fan arrangement",
    params: [
      { key: "count", type: "number", default: 5, description: "Number of cards to fan" },
      { key: "spacing", type: "number", default: 30, description: "Spacing between cards" },
      { key: "rotation", type: "number", default: 10, description: "Rotation angle per card" },
    ],
    generateFiltergraph: (params) => {
      // This is a simplified version - a full implementation would require multiple inputs
      const { count = 5, spacing = 30 } = params;
      return `null`; // Placeholder for complex multi-input filter
    }
  },

  wipe: {
    id: "wipe",
    name: "Wipe Transition",
    description: "Wipe transition between two videos",
    params: [
      { key: "direction", type: "string", default: "left", description: "Direction of wipe (left, right, top, bottom)" },
      { key: "duration", type: "number", default: 0.5, description: "Duration of the wipe" },
    ],
    generateFiltergraph: (params) => {
      const { direction = "left", duration = 0.5 } = params;
      // Simplified wipe using overlay with alpha mask
      return `overlay`;
    }
  },

  fade: {
    id: "fade",
    name: "Fade Effect",
    description: "Fade in or out effect",
    params: [
      { key: "type", type: "string", default: "in", description: "Fade type (in or out)" },
      { key: "duration", type: "number", default: 0.5, description: "Duration of the fade" },
      { key: "alpha", type: "boolean", default: false, description: "Fade alpha channel" },
    ],
    generateFiltergraph: (params) => {
      const { type = "in", duration = 0.5, alpha = false } = params;
      if (type === "in") {
        return alpha ? `fade=t=in:st=0:d=${duration}:alpha=1` : `fade=t=in:st=0:d=${duration}`;
      } else {
        return alpha ? `fade=t=out:st=0:d=${duration}:alpha=1` : `fade=t=out:st=0:d=${duration}`;
      }
    }
  },

  draw_text: {
    id: "draw_text",
    name: "Draw Text",
    description: "Draw text on video",
    params: [
      { key: "text", type: "string", default: "Sample Text", description: "Text to draw" },
      { key: "x", type: "number", default: 0, description: "X position" },
      { key: "y", type: "number", default: 0, description: "Y position" },
      { key: "font_size", type: "number", default: 24, description: "Font size" },
      { key: "font_color", type: "color", default: "white", description: "Font color" },
      { key: "font_file", type: "string", default: "", description: "Path to font file" },
    ],
    generateFiltergraph: (params) => {
      const { text = "Sample Text", x = 0, y = 0, font_size = 24, font_color = "white", font_file = "" } = params;
      const escapedText = text.replace(/\\/g, '\\\\').replace(/:/g, '\\:').replace(/'/g, "\\\\'");
      let filter = `drawtext=`;
      if (font_file) {
        filter += `fontfile='${font_file.replace(/\\/g, '/')}':`;
      }
      filter += `text='${escapedText}':x=${x}:y=${y}:fontsize=${font_size}:fontcolor=${font_color}`;
      return filter;
    }
  }
};

export function getTemplate(id: AnimationTemplateId): AnimationTemplate {
  return ANIMATION_TEMPLATES[id];
}

// 3.A) Ken Burns via crop + scale (time-based, no zoompan quirks)
export function buildKenBurnsCrop(lb: LabelGen, baseV: string, w: number, h: number, p: {
  start: number; end: number;
  zoomStart?: number; zoomEnd?: number;          // factors (>= 1.0)
  panFrom?: { x: number; y: number };            // center px
  panTo?: { x: number; y: number };
  easing?: 'out' | 'inOut';
}) {
  const z0 = Math.max(1, p.zoomStart ?? 1.0);
  const z1 = Math.max(1, p.zoomEnd ?? 1.12);
  const e = p.easing === 'inOut' ? ease.inOutCubic(p.start, p.end) : ease.outCubic(p.start, p.end);

  // dynamic zoom factor over time
  const zExpr = lerp(z0, z1, e);

  // dynamic crop width/height
  const cw = `(${w})/(${zExpr})`;
  const ch = `(${h})/(${zExpr})`;

  const cx0 = p.panFrom?.x ?? w / 2;
  const cy0 = p.panFrom?.y ?? h / 2;
  const cx1 = p.panTo?.x ?? cx0;
  const cy1 = p.panTo?.y ?? cy0;

  const cx = lerp(cx0, cx1, e);
  const cy = lerp(cy0, cy1, e);

  // top-left crop, clamped to source frame
  const xExpr = clampExpr(`(${cx}) - ((${cw})/2)`, '0', `${w} - (${cw})`);
  const yExpr = clampExpr(`(${cy}) - ((${ch})/2)`, '0', `${h} - (${ch})`);

  const outV = lb.next('kb');
  const graph = `
[${baseV}]format=rgba,crop=w=${cw}:h=${ch}:x=${xExpr}:y=${yExpr},scale=${w}:${h}[${outV}]
`.trim();

  return { outV, graph };
}

// 3.B) Push-on overlay (slide in from screen edge to a target anchor)
export function buildPushOnOverlay(lb: LabelGen, baseV: string, ovV: string, w: number, h: number, p: {
  start: number; end: number;
  from?: 'left'|'right'|'top'|'bottom';
  toX?: number; toY?: number;   // target anchor in px (center or top-left, depending on art)
  easeMode?: 'out'|'inOut';
}) {
  const from = p.from ?? 'left';
  const toX = p.toX ?? Math.round(w * 0.5);
  const toY = p.toY ?? Math.round(h * 0.5);
  const e = p.easeMode === 'inOut' ? ease.inOutCubic(p.start, p.end) : ease.outCubic(p.start, p.end);

  // Start positions relative to overlay size when sliding from offscreen
  const startXExpr = from === 'left' ? `-overlay_w` : from === 'right' ? `${w}` : `${toX}`;
  const startYExpr = from === 'top'  ? `-overlay_h` : from === 'bottom' ? `${h}` : `${toY}`;

  const xExpr = (from === 'left' || from === 'right') ? lerpExpr(startXExpr, `${toX}`, e) : `${toX}`;
  const yExpr = (from === 'top' || from === 'bottom') ? lerpExpr(startYExpr, `${toY}`, e) : `${toY}`;

  const en = enableBetween(p.start, p.end);
  const outV = lb.next('po');
  const graph = `
[${baseV}][${ovV}]overlay=x=${xExpr}:y=${yExpr}:${en}:shortest=1[${outV}]
`.trim();

  return { outV, graph };
}

// 3.C) Fan cards with rotation + staggered reveals
export function buildFanCards(lb: LabelGen, baseV: string, cardVs: string[], w: number, h: number, p: {
  start: number; end: number;
  cx?: number; cy?: number; radius?: number;
  spreadDeg?: number; baseAngleDeg?: number;
  stagger?: number;
}) {
  const cx = p.cx ?? Math.round(w * 0.65);
  const cy = p.cy ?? Math.round(h * 0.75);
  const radius = p.radius ?? Math.round(Math.min(w, h) * 0.22);
  const spread = p.spreadDeg ?? 40;
  const base = p.baseAngleDeg ?? -10;
  const stagger = p.stagger ?? 0.12;

  const degToRad = (d: number) => (Math.PI / 180) * d;

  let current = baseV;
  let graph = '';

  cardVs.forEach((v, i) => {
    const frac = cardVs.length > 1 ? (i / (cardVs.length - 1) - 0.5) : 0; // -0.5..0.5
    const angDeg = base + frac * spread;
    const angRad = degToRad(angDeg);

    // Pre-rotate overlay
    const rotOut = lb.next(`rot${i}`);
    graph += `
[${v}]format=rgba,rotate=${angRad.toFixed(6)}:ow=rotw(iw):oh=roth(ih):c=none[${rotOut}];
`.trim() + '\n';

    // Position around an arc (note FFmpeg Y-down coordinates)
    const ax = cx + radius * Math.cos(degToRad(90 - angDeg));
    const ay = cy + radius * Math.sin(degToRad(90 - angDeg));
    const xExpr = `(${ax.toFixed(3)} - overlay_w/2)`;
    const yExpr = `(${ay.toFixed(3)} - overlay_h/2)`;

    const appear = p.start + stagger * i;
    const en = enableBetween(appear, p.end);

    const out = lb.next(`card${i}`);
    graph += `
[${current}][${rotOut}]overlay=x=${xExpr}:y=${yExpr}:${en}:shortest=1[${out}]
`.trim() + '\n';

    current = out;
  });

  return { outV: current, graph: graph.trim() };
}