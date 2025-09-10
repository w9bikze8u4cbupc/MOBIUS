export type GIG = {
  meta: {
    title: string;
    players: { min: number; max: number; recommended?: number[] } | string;
    timeMin?: number; timeMax?: number;
    version?: string;
    editions?: string[];
    supportsSimultaneous?: boolean;
    hasVariableSetup?: boolean;
    complexityRating?: number;
    categories?: string[];
  };
  components: Array<{
    id: string;
    name: string;
    count?: number;
    type?: "card" | "token" | "board" | "meeple" | "die" | "tile" | "marker";
    visualDescription?: string;
    physicalProperties?: { dimensions?: string; orientation?: "portrait" | "landscape" };
    visual?: string; // asset path or identifier
    cardTemplate?: string; // e.g., card_{id}.png
  }>;
  areas?: Array<{
    id: string;
    type: "grid" | "row" | "fixed" | "private" | "linear";
    bounds?: [number, number, number, number];
    positions?: string[];
    cameraPreset?: "overhead" | "ots" | "macro";
    layout?: string;
  }>;
  state?: {
    tokens?: Array<{ id: string; type: "stack" | "field"; contents?: string; face?: "up" | "down"; order?: string }>;
    global?: Record<string, unknown>;
    prerequisites?: Record<string, unknown>;
  };
  setup: Array<{
    id?: string;
    op: "shuffle" | "deal" | "place" | "arrange" | "discard" | "reveal";
    what: string;
    to?: "eachPlayer" | string;
    count?: number;
    where?: string;
    order?: string;
    variant?: string;
    visibility?: "hidden" | "public";
    description?: string;
    constraints?: string;
    anim?: { template: string; params?: Record<string, unknown> };
  }>;
  turnStructure: Array<{
    id?: string;
    phase: string;
    oncePerRound?: boolean;
    type?: "sequential" | "simultaneous";
    player?: "active" | "all";
    order?: "clockwise" | "counterclockwise" | "simultaneous";
    actions?: Array<{
      name?: string;
      type?: string;
      prerequisites?: string[];
      effects?: Array<{ target: string; change: string }>;
      visual_demo?: string;
      exceptions?: string[];
    }>;
    animationHint?: { template: string; params?: Record<string, unknown> };
  }>;
  scoring: Array<{
    condition?: string;
    reward?: string;
    evaluationTiming?: string;
    tiebreaker?: string;
    end?: string;
  }>;
  examples?: Array<{
    action: string;
    demonstrate: string[];
    stateSnapshot?: Record<string, unknown>;
  }>;
  variants?: Array<{
    name: string;
    description?: string;
    mods: Array<{ op: "add" | "replace" | "remove"; path?: string; what?: string; count?: number; value?: unknown }>;
  }>;
  verification?: {
    checklist?: string[];
    sourcesCrossCheck?: string[];
  };
  sources?: Array<{ type: "ubg" | "pdf" | "presskit" | "bgg"; url: string }>;
};