import type { HeroId } from "./heroes.js";
import type { WorldModifierId } from "./world-modifiers.js";

export interface Position { x: number; y: number }

// ---------------------------------------------------------------- territory

/** What a province is worth holding for. Kind drives income, garrison and what it unlocks. */
export type ProvinceKind = "capital" | "town" | "fort" | "mine" | "farm" | "shrine" | "chokepoint" | "wilds";
/** Terrain identity of a province; decides its campaign tiles and the battlefield it generates. */
export type Biome = "grassland" | "forest" | "mountain" | "marsh" | "badlands";

export interface Settlement {
  tier: number; slots: number; buildings: BuildingId[]; walls: number; maxWalls: number;
  /** Construction in progress; settlements build one thing at a time. */
  project: { building: BuildingId; turnsLeft: number } | null;
}
export interface Province extends Position {
  id: string; name: string; kind: ProvinceKind; biome: Biome;
  ownerId: string | null; capturedAt: number;
  /** Provinces an army can march to directly. Barriers between neighbours are what make chokepoints matter. */
  neighbours: string[];
  settlement: Settlement | null;
  /** Gold per turn before buildings and modifiers. */
  income: number;
  /** Units this province allows its owner to recruit anywhere. */
  unlocks: UnitId[];
  /** Garrison defends the province when no army is present. */
  garrison: UnitCard[];
  /** A shrine's reward is claimed once, by whoever reaches it first. */
  claimed: boolean;
}

/** One province as a faction last saw it. */
export interface ProvinceIntel {
  turn: number; ownerId: string | null;
  /** Remembered defending strength, army or garrison. */
  defence: number;
  /** Name of the host seen standing there, for the briefing the Jev reads. */
  host: string | null;
}

// ---------------------------------------------------------------- armies

export type UnitId =
  | "militia" | "swordsmen" | "spearmen" | "archers" | "crossbowmen"
  | "light_cavalry" | "heavy_cavalry" | "shieldguard" | "great_weapons"
  | "ogre" | "battle_mage" | "catapult";
export type UnitCategory = "frontline" | "damage" | "ranged" | "mobile" | "monster" | "mage" | "siege";

export interface UnitCard {
  id: string; unitId: UnitId;
  /** Surviving models. A card is destroyed at zero and visibly thins in battle. */
  models: number; maxModels: number;
  /** Veterancy earned by surviving battles; raises damage and morale. */
  experience: number; rank: number;
}

export type ArmyStance = "march" | "fortify" | "ambush" | "raid";
export type ArmyOrderKind = "hold" | "move" | "attack" | "besiege" | "retreat" | "reinforce" | "scout";
export interface ArmyOrder {
  kind: ArmyOrderKind; targetProvinceId: string | null; label: string; issuedTurn: number;
}
export interface Army extends Position {
  id: string; factionId: string; name: string;
  /** Every army is led by a Jev; an army whose lord dies is disbanded or absorbed. */
  lordId: string;
  units: UnitCard[];
  provinceId: string;
  /** Remaining movement this turn, spent marching between provinces. */
  movement: number; maxMovement: number;
  route: string[];
  order: ArmyOrder;
  stance: ArmyStance;
  morale: number;
  /** Set while the army is withdrawing after a defeat; it cannot attack. */
  shattered: boolean;
}

// ---------------------------------------------------------------- lords

export type LordCondition = "ready" | "wounded" | "captured" | "dead";
export interface Lord {
  id: string; heroId: HeroId; factionId: string;
  level: number; experience: number;
  /** Chosen skill-tree nodes; the same Jev develops differently every run. */
  skills: string[]; skillPoints: number;
  relics: string[];
  condition: LordCondition; unavailableUntil: number;
  kills: number; battlesWon: number; battlesLost: number;
  health: number; maxHealth: number;
}

// ---------------------------------------------------------------- buildings

export type BuildingId =
  | "keep" | "barracks" | "range" | "stable" | "forge" | "arcane_tower"
  | "market" | "farm" | "watchtower" | "walls";

// ---------------------------------------------------------------- battles

export type BattleResolution = "auto" | "live";
export type BattleOutcome = "attacker" | "defender" | "draw";
export interface BattleReport {
  id: string; turn: number; provinceId: string; resolution: BattleResolution;
  attackerId: string; defenderId: string; outcome: BattleOutcome;
  attackerLosses: number; defenderLosses: number;
  /** Strength ratio shown before the fight; kept so the spectator can see upsets. */
  prediction: number;
  summary: string;
}
/** A battle awaiting the real-time scene. The campaign holds here until it resolves. */
export interface PendingBattle {
  id: string; provinceId: string; turn: number;
  attackerArmyId: string; defenderArmyId: string | null; defenderFactionId: string;
  siege: boolean;
}

// ---------------------------------------------------------------- match

export type TurnPhase = "planning" | "resolving" | "battle" | "finished";
export interface CampaignFaction {
  id: string; name: string; color: string;
  gold: number; income: number; upkeep: number;
  eliminated: boolean; eliminatedAt: number | null;
  lords: Lord[]; armies: string[];
  doctrines: Array<{ id: string; stacks: number }>;
  relations: Record<string, { war: boolean; tension: number; truceUntil: number }>;
  /**
   * What this faction believes about each province and when it last looked. Jevs plan from this,
   * not from the truth, so a march can be committed on information that is several turns stale.
   */
  intel: Record<string, ProvinceIntel>;
  /** Orders chosen this turn but not yet resolved; simultaneous planning hides them until the lock. */
  pendingOrders: Array<{ armyId: string; order: ArmyOrder }>;
  jev: { status: "running" | "waiting"; lastError: string | null };
  /** The most recent choices this Jev made, newest last; the spectator watches these. */
  decisions: DecisionRecord[];
  history: Array<{ turn: number; text: string }>;
}
export interface CampaignState {
  id: string; number: number; seed: number;
  width: number; height: number;
  terrain: { seed: number; tiles: string };
  /** Province id per tile, parallel to terrain.tiles; lets the client colour ownership. */
  ownership: string;
  provinces: Province[];
  factions: CampaignFaction[];
  armies: Army[];
  turn: number;
  phase: TurnPhase;
  modifier: WorldModifierId;
  pendingBattle: PendingBattle | null;
  battles: BattleReport[];
  status: { state: "running" | "finished"; winnerId: string | null; reason: string };
  randomState: number; sequence: number;
  startedAt: string; updatedAt: string;
}

// ---------------------------------------------------------------- decisions

/**
 * `art` names what the choice is about, most specific first: the client shows the first one it has
 * artwork for, so `"drill doctrine_military"` paints the doctrine if that is drawn and the category
 * if it is not.
 *
 * `verb` and `subject` are the two-line glance form the pop-out cards are built from — the card is
 * too small for a sentence, and `description` is what the Jev reads, not what the spectator does.
 * `tags` are the two or three facts that decide the choice, each short enough to sit on one line.
 */
export interface DecisionOption { id: string; label: string; verb: string; subject: string; tags: string[]; art: string | null; description: string; score: number | null }
export interface DecisionRecord {
  id: string; kind: string; title: string; turn: number; options: DecisionOption[]; choice: string;
  outcome: string; source: "jev" | "offline" | "forced"; confidence: number | null; latencyMs: number; importance: number;
  /** What the decision was about, so the spectator camera can go there while the choice is shown. */
  armyId: string | null; provinceId: string | null;
}
export interface DecisionResult {
  choice: string; probabilities: Record<string, number>; confidence: number; latencyMs: number;
  source: "jev" | "offline"; usage: { inputTokens: number; outputTokens: number };
}
