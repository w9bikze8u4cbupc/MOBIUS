/* GIG v1.1 – Game Instruction Graph schema

   Design goals:

   - Declarative structure for setup/turns/scoring and variants

   - Address hidden info, concurrency, and visibility

   - Animation/shot hints for storyboard compiler

   - Coverage + invariants for verification

*/

export type ID = string;

export interface GigDocument {
  _schema: "GIG";
  version: "1.1.0";
  id: ID;
  game: GameMeta;
  sources?: SourceRef[];
  glossary?: GlossaryEntry[];
  assets?: AssetRef[];               // loose assets or link to a manifest
  assetManifest?: string;            // path to a JSON manifest file
  components: Component[];
  areas: Area[];
  rules: Rules;
  actions?: ActionDef[];
  timingHints?: GlobalTimingHints;
  animationCatalog?: AnimationTemplate[];
  verification?: VerificationSuite;
}

export interface GameMeta {
  title: string;
  shortTitle?: string;
  designer?: string | string[];
  publisher?: string | string[];
  minPlayers: number;
  maxPlayers: number;
  recommendedPlayers?: number[];
  minAge?: number;
  estDurationMin?: number;
  complexity?: "intro" | "light" | "medium" | "heavy";
  edition?: string;
}

export interface SourceRef {
  name: string;
  url?: string;
  note?: string;
}

export interface GlossaryEntry {
  term: string;
  def: string;
  aliases?: string[];
}

export type AssetType = "image" | "vector" | "audio" | "music" | "video" | "font" | "lottie" | "json" | "other";

export interface AssetRef {
  id: ID;
  kind: AssetType;
  path: string;         // relative path or URL
  license?: string;
  credit?: string;
  pixelSize?: { w: number; h: number };
  variants?: { id: ID; path: string; pixelSize?: { w: number; h: number } }[];
}

export type ComponentKind =
  | "card"
  | "deck"
  | "token"
  | "marker"
  | "tile"
  | "board"
  | "mat"
  | "die"
  | "bag"
  | "other";

export interface Component {
  id: ID;
  name: string;
  kind: ComponentKind;
  groups?: ID[];                   // grouping relationships (e.g. item deck contains item cards)
  count?: number;                  // physical copies if uniform
  sides?: ("front" | "back")[];    // e.g. double-sided markers
  publicInfo?: Visibility;         // default visibility when on table
  privateInfo?: Visibility;        // default visibility when in hand
  props?: Record<string, any>;     // game-specific attributes (e.g. color, value)
  asset?: ID;                      // asset id
  assetMap?: Record<string, ID>;   // variant -> asset id
}

export type Visibility = "public" | "private" | "hidden" | "mixed";

export interface Area {
  id: ID;
  name: string;
  scope: "table" | "global" | "player";
  owner?: "p1" | "p2" | "p3" | "p4" | "any";
  kind: "row" | "grid" | "stack" | "pile" | "slot" | "zone" | "mat";
  accepts?: ComponentKind[];       // allowable component types
  anchors?: string[];              // anchor names for camera/layout
  layoutHints?: LayoutHints;
}

export interface LayoutHints {
  order?: "asc" | "desc" | "fixed";
  axis?: "x" | "y";
  gapPx?: number;
  wrap?: boolean;
}

export interface Rules {
  setup: Step;            // compound step tree
  turnStructure: TurnStructure;
  scoring: Step;          // compound step tree
  endConditions: EndCondition[];
  variants?: Variant[];
}

export interface Variant {
  id: ID;
  name: string;
  description?: string;
  enabledByDefault?: boolean;
  gates?: Condition[];       // gate rules that toggle steps/actions
  toggles?: Toggle[];        // describe which nodes/actions change
}

export interface Toggle {
  targetId: ID;
  op: "enable" | "disable" | "replace";
  replacementStepId?: ID;    // for 'replace'
}

export interface TurnStructure {
  startingPlayer: "younger" | "random" | "firstSetup" | "lastLoser" | "custom";
  order: "alternate" | "clockwise";
  perTurn: Step;             // what happens on a player turn
  perRound?: Step;           // start/end of round hooks
  concurrency?: "serial" | "interleaved" | "parallelWithBarriers";
  hiddenInfo?: HiddenInfoPolicy[];
}

export interface HiddenInfoPolicy {
  areaId?: ID;
  componentId?: ID;
  rule: "faceDown" | "peekOwner" | "revealAtScoring" | "alwaysPublic";
}

export interface EndCondition {
  id: ID;
  name: string;
  condition: Condition;
  winnerRule: "firstToAchieve" | "highestScore" | "tiebreakChain";
  tiebreakers?: Tiebreaker[];
}

export interface Tiebreaker {
  id: ID;
  name: string;
  rule: Condition;
}

export type StepKind = "atomic" | "compound" | "branch" | "loop" | "actionChoice";

export interface Step {
  id: ID;
  kind: StepKind;
  label: string;
  description?: string;
  visibility?: Visibility;         // visibility of this instruction to viewers
  role?: "system" | "player" | "opponent";
  speak?: SpeakHint;               // narration hints
  anim?: AnimationHint;            // animation hint
  timing?: TimingHint;             // pacing hint
  guards?: Condition[];            // preconditions
  effects?: Effect[];              // postconditions summary
  // Structural children by kind:
  children?: Step[];               // for 'compound' in sequence
  branches?: { when: Condition; then: Step }[];   // for 'branch'
  loop?: { while: Condition; body: Step; maxIters?: number }; // for 'loop'
  actionSet?: ActionRef[];         // for 'actionChoice'
}

export interface SpeakHint {
  markStart?: string;     // alignment mark at start
  markEnd?: string;       // alignment mark at end
  textKey?: string;       // key into script.txt if needed
}

export interface AnimationHint {
  templateId?: string;               // e.g., "deal_cards", "split_choose"
  focus?: string | string[];         // component/area ids
  params?: Record<string, number | string | boolean>;
}

export interface TimingHint {
  effort?: "tiny" | "short" | "medium" | "long"; // macro pacing
  minSec?: number;
  maxSec?: number;
  preferredSec?: number;
}

export interface GlobalTimingHints {
  atomicMinSec?: number;    // default 2.0
  atomicMaxSec?: number;    // default 7.0
  beatGapSec?: number;      // default 0.25
  showVsTellRatio?: number; // 0..1, default 0.7 show
}

export interface ActionRef {
  id: ID;        // refer to actions[] by id
  label?: string;
}

export interface ActionDef {
  id: ID;
  name: string;
  description?: string;
  ioPattern?: "secret" | "discard" | "split-3-choose-1" | "split-2x2-choose-1" | "custom";
  hiddenInfo?: HiddenInfoPolicy[];
  anim?: AnimationHint;
  timing?: TimingHint;
}

export type ConditionOp =
  | "always"
  | "not"
  | "and"
  | "or"
  | "eq"
  | "gt"
  | "gte"
  | "lt"
  | "lte"
  | "in"
  | "hasMajority"
  | "sumGTE"
  | "roundsPlayedGTE";

export interface Condition {
  op: ConditionOp;
  left?: any;
  right?: any;
  children?: Condition[];        // for and/or
}

export interface Effect {
  type: "move" | "reveal" | "hide" | "increment" | "decrement" | "award" | "markerMove" | "noop";
  targetId?: ID;
  amount?: number;
  toAreaId?: ID;
}

export interface AnimationTemplate {
  id: ID;
  name: string;
  params: { key: string; type: "number" | "string" | "boolean"; default?: any }[];
  description?: string;
}

export interface VerificationSuite {
  coverageGoals?: CoverageGoal[];
  invariants?: Condition[];
}

export interface CoverageGoal {
  id: ID;
  name: string;
  targets: { stepId?: ID; actionId?: ID; componentId?: ID }[];
  minHits: number;
}