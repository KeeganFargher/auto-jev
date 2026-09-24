
export type BattleTier = "sanity" | "teams" | "pieces" | "confirm";

export type SurveyTier = BattleTier | "runs";

export interface HeroPick {
  heroId: string;
  upgradeIds: string[];
  itemIds?: string[];
  runeIds?: string[];
}

export interface BattleJob {
  index: number;
  tier: BattleTier;
  key: string;
  first: HeroPick[];
  second: HeroPick[];
  seedBase: number;
  seedCount: number;
}

export interface HeroTally {
  appearances: number;
  damageDealt: number;
  deaths: number;
  casts: number;
  signatureCasts: number;
  firstSignatureTickSum: number;
  firstSignatureSamples: number;
}

export interface NotableBattle {
  seed: number;
  firstSouth: boolean;
  outcome: string;
}

export interface BattleJobResult {
  index: number;
  battles: number;
  firstWins: number;
  secondWins: number;
  mutualEliminations: number;
  timeouts: number;
  failures: number;
  budgetTrips: number;
  southWins: number;
  northWins: number;
  combos: number;
  endTicks: number[];
  distinctOutcomes: number;
  heroTallies: Record<string, HeroTally>;
  notable: NotableBattle[];
}

export interface RunJob {
  index: number;
  runSeed: number;
  seatCount: number;
  roundCap: number;
  startingHealth: number;
  maxLossCost: number;
}

export interface SeatOutcome {
  playerId: string;
  heroIds: string[];
  upgradeIds: string[];
  itemIds: string[];
  runeIds: string[];
  eliminatedInRound: number | null;
  runHealth: number;
  placement: number;
}

export interface RunJobResult {
  index: number;
  runSeed: number;
  finished: boolean;
  abortReason: string | null;
  stalled: boolean;
  rounds: number;
  seats: SeatOutcome[];
}

export type WorkerTask =
  | { kind: "battles"; jobs: BattleJob[] }
  | { kind: "runs"; jobs: RunJob[] };

export type WorkerReply =
  | { kind: "ready" }
  | { kind: "battles"; results: BattleJobResult[] }
  | { kind: "runs"; results: RunJobResult[] }
  | { kind: "error"; message: string };
