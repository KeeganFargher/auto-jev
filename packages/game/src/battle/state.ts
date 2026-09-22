import type { AbilityDefinitionId, ArenaDefinitionId, HeroDefinitionId, TeamId, UnitId } from "../ids.js";
import type { RngState } from "../random/rng.js";
import type { Vector2 } from "../math/vector.js";
import type { BattleResult } from "./result.js";
import type { ShieldStatus, SlowStatus } from "./statuses.js";
import type { CompiledReactionInstance } from "../builds/compile-build.js";
import type { HeroBuild } from "../builds/state.js";

export interface UnitState {
  unitId: UnitId;
  heroId: HeroDefinitionId;
  build: HeroBuild;
  teamId: TeamId;
  position: Vector2;
  hp: number;
  maxHp: number;
  moveSpeedUnitsPerSecond: number;
  targetUnitId: UnitId | null;
  abilityCooldowns: Record<AbilityDefinitionId, number>;
  abilityCooldownDurations: Record<AbilityDefinitionId, number>;
  chainBounceBonus: Record<AbilityDefinitionId, number>;
  slowedTargetBasicAttackDamageBonusFraction: number;
  reactions: CompiledReactionInstance[];
  shield: ShieldStatus | null;
  slow: SlowStatus | null;
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
