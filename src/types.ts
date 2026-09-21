import type { BuildingKind } from "./industry-catalog.js";
import type { SkillId, Stock, TechId } from "./catalog.js";
export type ColonyPriority = "food" | "water" | "shelter" | "materials" | "recovery" | "research" | "expansion" | "security";

export type ActionKind =
  | "construct_building" | "work_building" | "mine_clay"
  | "drink"
  | "eat"
  | "rest"
  | "fetch_water"
  | "gather_berries"
  | "chop_tree"
  | "mine_stone"
  | "build_hut"
  | "plan_farm"
  | "build_farm"
  | "plant_crops"
  | "harvest_crops"
  | "fish"
  | "craft_planks"
  | "build_workshop"
  | "build_defense"
  | "upgrade_home"
  | "scout"
  | "raid"
  | "guard"
  | `learn_${SkillId}`
  | `research_${TechId}`
  | "work_research"
  | "mine_ore" | "mine_coal" | "smelt_metal" | "craft_tools" | "equip_tool"
  | "craft_weapons" | "equip_weapon" | "recruit" | "expand_farm"
  | "commission_monument"
  | "choose_agriculture"
  | "choose_industry"
  | "choose_frontier";

export type ResourceKind = "tree" | "berries" | "stone" | "river" | "ore" | "coal" | "clay";

export interface Position {
  x: number;
  y: number;
}

export interface ResourceNode extends Position {
  id: string;
  kind: ResourceKind;
  amount: number;
  regrowAt: number | null;
}

export interface DecisionTrace {
  action: ActionKind;
  probabilities: Partial<Record<ActionKind, number>>;
  confidence: number;
  latencyMs: number;
  source: "jev";
  decidedAt: number;
}

export interface Task {
  action: ActionKind;
  targetId?: string | undefined;
  cargo?: number | undefined;
  cargoKind?: keyof Stock | undefined;
  supplies?: { food: boolean; water: boolean } | undefined;
  reserved?: Partial<Stock> | undefined;
  route: Position[];
  workRemaining: number;
  totalWork: number;
}

export interface Colonist extends Position {
  id: string;
  name: string;
  health: number;
  hunger: number;
  thirst: number;
  fatigue: number;
  trait: "hard_worker" | "risk_averse" | "resourceful" | "communal";
  experience: number;
  level: number;
  talents: Record<SkillId, number>;
  skillPoints: number;
  equipment: { tool: number; weapon: number };
  movementCredit: number;
  retreatReadyAt: number;
  biography: Array<{ tick: number; text: string }>;
  order: { action: ActionKind; remaining: number } | null;
  skills: {
    building: number;
    gathering: number;
  };
  task: Task | null;
  lastDecision: DecisionTrace | null;
}

export interface WorldStats {
  decisions: number;
  jevDecisions: number;
  jevRequests: number;
  deaths: number;
  inputTokens: number;
  outputTokens: number;
}

export interface Farm extends Position {
  id: string;
  stage: "fallow" | "growing" | "ripe";
  growth: number;
  radius: number;
}

export interface FarmProject extends Position {
  radius: number;
  id: string;
  funded: boolean;
  workDone: number;
  totalWork: number;
}

export interface Building extends Position {
  id: string; kind: BuildingKind; tier: number; targetTier: number; workDone: number; totalWork: number;
  staff: string[]; residents: string[]; condition: number; cycles: number; status: string;
}
export interface Strategy {
  goal: string; title: string; startedAt: number; reviewedAt: number; progressAt: number;
  workers: string[]; completed: number; status: string; budget: Partial<Stock>;
}
export interface Incident extends Position {
  id: string; kind: "drought" | "travellers" | "caravan" | "breakdown" | "raiders";
  title: string; startedAt: number; deadline: number; choice: string | null; resolved: boolean; outcome: string;
}
export interface Terrain {
  seed: number; tiles: string; regions: Array<Position & {name: string; kind: string}>;
}

export interface WorldState {
  terrain: Terrain; structures: Building[]; strategy: Strategy; incident: Incident | null; nextIncidentAt: number; randomState: number;
  id: string;
  name: string;
  color: string;
  obstacles: Position[];
  intel: { observedAt: number; food: number; defense: number; population: number } | null;
  raids: { stolen: number; lost: number };
  development: {
    completedWork: number;
    technologies: TechId[];
    research: { id: TechId; funded: boolean; workDone: number; totalWork: number } | null;
    nextRecruitAt: number;
    monuments: number;
    history: Array<{ tick: number; text: string }>;
    branch: "agriculture" | "industry" | "frontier" | null;
    workshop: boolean;
    defenses: number;
    homes: number;
  };
  stations: { food: Position; water: Position; workshop: Position; defense: Position };
  resourceHistory: Array<Stock & { tick: number }>;
  camp: Position;
  farms: Farm[];
  project: FarmProject | null;
  progression: { stage: "camp" | "village" | "town" | "capital"; harvests: number };
  width: number;
  height: number;
  tick: number;
  day: number;
  startedAt: string;
  updatedAt: string;
  priority: ColonyPriority;
  jev: {
    status: "running" | "waiting";
    lastError: string | null;
  };
  stockpile: Stock;
  buildings: {
    huts: number;
    campfires: number;
  };
  colonists: Colonist[];
  resources: ResourceNode[];
  stats: WorldStats;
}

export interface WorldEvent {
  sequence: number;
  type: string;
  at: string;
  message: string;
  colonistId?: string;
  data?: WorldEventData;
}

export interface WorldEventData {
  action?: ActionKind;
  decision?: DecisionTrace | null;
  probabilities?: Record<string, number>;
  source?: "jev";
}

export interface DecisionResult {
  choice: string;
  probabilities: Record<string, number>;
  confidence: number;
  latencyMs: number;
  source: "jev";
  usage: {
    inputTokens: number;
    outputTokens: number;
  };
}

export type DecisionAnswer = Omit<DecisionResult, "usage">;

export interface DecisionBatchResult {
  answers: Array<{
    colonistId: string;
    decision: DecisionAnswer;
  }>;
  usage: DecisionResult["usage"];
}

export interface MatchState {
  terrain: Terrain;
  width: number;
  height: number;
  resources: ResourceNode[];
  colonies: Array<Omit<WorldState, "width" | "height" | "resources" | "obstacles" | "terrain">>;
}
