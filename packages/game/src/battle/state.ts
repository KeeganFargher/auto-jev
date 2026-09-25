import type { AbilityDefinitionId, ArenaDefinitionId, HeroDefinitionId, TeamId, UnitId } from "../ids.js";
import type { RngState } from "../random/rng.js";
import type { Vector2 } from "../math/vector.js";
import type { ConditionKind, PassiveDefinition, School, EffectDefinition, FormDefinition, PullDefinition } from "../definitions.js";
import type { BattleResult } from "./result.js";
import type { ChannelStatus, ChillStatus, ConditionStatus, ControlStatus, DotStatus, GraveMarkStatus, LinkStatus, PandemicStatus, ShieldStatus, SlowStatus, TauntStatus } from "./statuses.js";
import type { CompiledAbility } from "../builds/compile-build.js";
import type { HeroBuild } from "../builds/state.js";

export interface ActiveForm {
  abilityId: AbilityDefinitionId;
  castSequence: number;
  endsAtTick: number;
  damageTaken: number;
  hitsTaken: number;
  freeCastReadyAt: number;
  retaliatedAt: Record<UnitId, number>;
  definition: FormDefinition;
}

export interface UnitMemory {
  damageSinceTrigger: number;
  firstHitTargets: UnitId[];
  attackCounts: Record<string, number>;
  attackCountedStrike: Record<string, string>;
  siphonedAt: Record<UnitId, number>;
  ruthlessStunned: Record<UnitId, number>;
  revived: boolean;
  souls: number;
  fellAtTick: number;
  resurrected: boolean;
  corpseSpent: boolean;
  summonsRaised: number;
  overclockTicks: number;
  spentTriggers: string[];
  triggerReadyAt: Record<string, number>;
  stacks: Record<string, number>;
  stacksGainedAt: Record<string, number>;
  stackProgress: Record<string, number>;
  stored: Record<string, number>;
  storedIncoming: Record<string, number>;
  skillUses: Record<string, number>;
  attackCasts: number;
  mirrorUsed: boolean;
  sentinelUsed: boolean;
  tetherPending: number;
}

export interface SpeedBuff {
  key: string;
  bonus: number;
  expiresAtTick: number;
}

export interface DamageMark {
  sourceUnitId: UnitId;
  bonus: number;
  expiresAtTick: number;
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
  attackDamageMultiplier: number;
  spellDamageMultiplier: number;
  lifesteal: number;
  slowStrengthBonus: number;
  conditionDurationBonusTicks: number;
  mana: number;
  maxMana: number;
  manaPerAttack: number;
  basicAttackId: AbilityDefinitionId;
  abilityId: AbilityDefinitionId | null;
  ultimateId: AbilityDefinitionId | null;
  abilities: Record<AbilityDefinitionId, CompiledAbility>;
  passives: PassiveDefinition[];
  condition: ConditionStatus | null;
  control: ControlStatus | null;
  taunt: TauntStatus | null;
  invulnerableUntilTick: number;
  untargetableUntilTick: number;
  expiresAtTick: number;
  dots: DotStatus[];
  attackSpeedBonus: number;
  speedBuffs: SpeedBuff[];
  marks: DamageMark[];
  chill: ChillStatus | null;
  pandemic: PandemicStatus | null;
  graveMark: GraveMarkStatus | null;
  burstLockedUntilTick: number;
  memory: UnitMemory;
  summonerUnitId: UnitId | null;
  link: LinkStatus | null;
  channel: ChannelStatus | null;
  form: ActiveForm | null;
}

export interface CastStun {
  ticks: number;
  useId: number;
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
  stun: CastStun | null;
  pull: PullDefinition | null;
}

export interface ActiveShower {
  showerId: number;
  sourceUnitId: UnitId;
  abilityId: AbilityDefinitionId;
  castSequence: number;
  scale: number;
  stun: CastStun | null;
  remaining: number;
  fired: number;
  nextTick: number;
}

export interface ActiveBomb {
  bombId: number;
  sourceUnitId: UnitId;
  targetUnitId: UnitId;
  abilityId: AbilityDefinitionId;
  castSequence: number;
  scale: number;
  stun: CastStun | null;
  detonatesAtTick: number;
  position: Vector2;
}

export interface ActiveEmitter {
  emitterId: number;
  sourceUnitId: UnitId;
  teamId: TeamId;
  abilityId: AbilityDefinitionId;
  shotAbilityId: AbilityDefinitionId;
  scale: number;
  stun: CastStun | null;
  position: Vector2;
  velocity: Vector2;
  endsAtTick: number;
  nextShotTick: number;
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
  followsUnitId: UnitId | null;
  fullHits: boolean;
}

export interface PendingBlessedBurst {
  allyUnitId: UnitId;
  sourceUnitId: UnitId;
  amount: number;
  dueTick: number;
  causeSequence: number;
}

export interface PendingCorpseBlast {
  sourceUnitId: UnitId;
  corpseUnitId: UnitId;
  abilityId: AbilityDefinitionId;
  dueTick: number;
  causeSequence: number;
  scale: number;
}

export interface PendingDetonation {
  unitId: UnitId;
  sourceUnitId: UnitId;
  abilityId: AbilityDefinitionId;
  dueTick: number;
}

export interface PendingBurst {
  targetUnitId: UnitId;
  holderUnitId: UnitId;
  dueTick: number;
  causeSequence: number;
  spreads: boolean;
}

export interface ChainLink {
  root: number;
  link: number;
}

export type RepeatKind = "multicast" | "clone" | "barrage";

export interface PendingCast {
  order: number;
  sourceUnitId: UnitId;
  abilityId: AbilityDefinitionId;
  castAtTick: number;
  scale: number;
  targetUnitId: UnitId | null;
  chain: ChainLink;
  repeat: RepeatKind | null;
  trigger: string | null;
  fromCorpse: boolean;
}

export interface PendingStrike {
  order: number;
  sourceUnitId: UnitId;
  targetUnitId: UnitId;
  abilityId: AbilityDefinitionId;
  atTick: number;
  scale: number;
  causeSequence: number;
  effects: EffectDefinition[];
}

export interface ActiveSequence {
  sequenceId: number;
  sourceUnitId: UnitId;
  abilityId: AbilityDefinitionId;
  castSequence: number;
  scale: number;
  stun: CastStun | null;
  hopsLeft: number;
  hopsDone: number;
  nextHopTick: number;
  hitUnitIds: UnitId[];
  anchor: Vector2;
  moves: boolean;
  repeat: RepeatKind | null;
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
  pendingCasts: PendingCast[];
  pendingStrikes: PendingStrike[];
  sequences: ActiveSequence[];
  showers: ActiveShower[];
  bombs: ActiveBomb[];
  emitters: ActiveEmitter[];
  bursts: PendingBurst[];
  blessedBursts: PendingBlessedBurst[];
  corpseBlasts: PendingCorpseBlast[];
  detonations: PendingDetonation[];
  castChains: Record<number, ChainLink>;
  comboTiers: Record<TeamId, TeamComboTiers>;
  nextEntityId: number;
}
