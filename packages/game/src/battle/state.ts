import type { ArenaDefinitionId, HeroDefinitionId, TeamId, UnitId } from "../ids.js";
import type { RngState } from "../random/rng.js";
import type { Vector2 } from "../math/vector.js";
import type { BattleResult } from "./result.js";

export interface UnitState {
  unitId: UnitId;
  heroId: HeroDefinitionId;
  teamId: TeamId;
  position: Vector2;
  hp: number;
  maxHp: number;
  attackDamage: number;
  attackRangeUnits: number;
  attackIntervalTicks: number;
  moveSpeedUnitsPerSecond: number;
  targetUnitId: UnitId | null;
  nextAttackTick: number;
  alive: boolean;
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
}
