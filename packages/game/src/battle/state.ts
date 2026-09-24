import type { AbilityDefinitionId, ArenaDefinitionId, HeroDefinitionId, TeamId, UnitId } from "../ids.js";
import type { RngState } from "../random/rng.js";
import type { Vector2 } from "../math/vector.js";
import type { ConditionKind, PassiveDefinition, School, EffectDefinition } from "../definitions.js";
import type { BattleResult } from "./result.js";
import type { ChannelStatus, ConditionStatus, ControlStatus, DotStatus, LinkStatus, ShieldStatus, SlowStatus, TauntStatus } from "./statuses.js";
import type { CompiledAbility } from "../builds/compile-build.js";
import type { HeroBuild } from "../builds/state.js";

export interface UnitMemory {
  firedThresholds: string[];
  slowHistory: Record<UnitId, number[]>;
  grudgeStacks: number;
  retributionPool: number;
  retributionEndsAtTick: number;
  damageSinceRetaliate: number;
  firstHitTargets: UnitId[];
  basicAttackCounts: Record<string, number>;
  revived: boolean;
  signatureCasts: number;
  refillUsed: boolean;
  souls: number;
  lastRitesUsed: number;
  summonsRaised: number;
  openerFired: boolean;
  lastWordUsed: boolean;
  mirrorUsed: boolean;
  sentinelUsed: boolean;
  tandemReadyTick: number;
}

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
  shield: ShieldStatus | null;
  slow: SlowStatus | null;
  alive: boolean;
  damageDealt: number;
  school: School | null;
  armor: number;
  critChance: number;
  critMultiplier: number;
  damageMultiplier: number;
  lifesteal: number;
  slowStrengthBonus: number;
  conditionDurationBonusTicks: number;
  dotDamageMultiplier: number;
  dotMaxStacksBonus: number;
  mana: number;
  maxMana: number;
  manaPerAttack: number;
  signatureAbilityId: AbilityDefinitionId | null;
  abilities: Record<AbilityDefinitionId, CompiledAbility>;
  passives: PassiveDefinition[];
  condition: ConditionStatus | null;
  control: ControlStatus | null;
  taunt: TauntStatus | null;
  invulnerableUntilTick: number;
  untargetableUntilTick: number;
  dots: DotStatus[];
  attackSpeedBonus: number;
  memory: UnitMemory;
  summonerUnitId: UnitId | null;
  link: LinkStatus | null;
  channel: ChannelStatus | null;
}

export interface PendingImpact {
  impactId: number;
  sourceUnitId: UnitId;
  teamId: TeamId;
  abilityId: AbilityDefinitionId;
  center: Vector2;
  radiusUnits: number;
  landsAtTick: number;
  causeSequence: number;
  scale: number;
  triggered: boolean;
}

export interface ActiveZone {
  zoneId: number;
  sourceUnitId: UnitId;
  teamId: TeamId;
  abilityId: AbilityDefinitionId;
  center: Vector2;
  radiusUnits: number;
  expiresAtTick: number;
  periodTicks: number;
  nextPulseTick: number;
  effects: EffectDefinition[];
  allyEffects: EffectDefinition[];
}

export interface PendingEcho {
  sourceUnitId: UnitId;
  abilityId: AbilityDefinitionId;
  targetUnitId: UnitId;
  castAtTick: number;
  scale: number;
  causeSequence: number;
}

export type TeamComboTiers = Record<ConditionKind, number>;

export interface BattleState {
  rulesetId: string;
  rulesetVersion: number;
  seed: number;
  arenaId: ArenaDefinitionId;
  arenaWidth: number;
  arenaHeight: number;
  arenaColumns: number;
  arenaRows: number;
  tick: number;
  tickLimit: number;
  units: UnitState[];
  rng: RngState;
  eventSequence: number;
  result: BattleResult | null;
  resolutionPriority: UnitId[];
  impacts: PendingImpact[];
  zones: ActiveZone[];
  echoes: PendingEcho[];
  comboTiers: Record<TeamId, TeamComboTiers>;
  nextEntityId: number;
}
