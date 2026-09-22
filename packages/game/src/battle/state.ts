import type { AbilityDefinitionId, ArenaDefinitionId, HeroDefinitionId, TeamId, UnitId } from "../ids.js";
import type { RngState } from "../random/rng.js";
import type { Vector2 } from "../math/vector.js";
import type { BattleResult } from "./result.js";
import type { ShieldStatus } from "./statuses.js";

export interface UnitState {
  unitId: UnitId;
  heroId: HeroDefinitionId;
  teamId: TeamId;
  position: Vector2;
  hp: number;
  maxHp: number;
  moveSpeedUnitsPerSecond: number;
  targetUnitId: UnitId | null;
  abilityCooldowns: Record<AbilityDefinitionId, number>;
  shield: ShieldStatus | null;
  alive: boolean;
  damageDealt: number;
}

export interface BattleState {
  rulesetId: string;
  rulesetVersion: number;
  seed: number;
  arenaId: ArenaDefinitionId;
  arenaWidth: number;
  arenaHeight: number;
  tick: number;
  tickLimit: number;
  units: UnitState[];
  rng: RngState;
  eventSequence: number;
  result: BattleResult | null;
  resolutionPriority: UnitId[];
}
