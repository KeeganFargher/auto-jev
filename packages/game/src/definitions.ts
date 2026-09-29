import type { ArenaDefinitionId, HeroDefinitionId } from "./ids.js";

export type HeroRole = "frontline" | "midline" | "backline";

export type SetupState = "airborne" | "floating" | "downed" | "burning" | "primed" | "frozen";

export type SetupWant = "airborne" | "floating" | "burning" | "grouped" | "downed" | "frozen";

export interface MeleeAttackDefinition {
  kind: "melee";
  name: string;
  damage: number;
  rangeUnits: number;
  intervalTicks: number;
  windupTicks: number;
}

export interface ProjectileAttackDefinition {
  kind: "projectile";
  name: string;
  damage: number;
  rangeUnits: number;
  intervalTicks: number;
  windupTicks: number;
  unitsPerSecond: number;
  splashRadiusUnits: number;
  splashFraction: number;
  allyHeal: number;
}

export type AttackDefinition = MeleeAttackDefinition | ProjectileAttackDefinition;

export interface RadialLaunch {
  centerRiseUnits: number;
  edgeRiseUnits: number;
  centerDistanceUnits: number;
  edgeDistanceUnits: number;
  bowlingDamage: number;
}

export interface SignatureBase {
  name: string;
  description: string;
  wants: SetupWant[];
  groupSize: number;
}

export interface HammerfallDefinition extends SignatureBase {
  kind: "hammerfall";
  reachUnits: number;
  radiusUnits: number;
  damage: number;
  impactTick: number;
  durationTicks: number;
  launch: RadialLaunch;
}

export interface RampageDefinition extends SignatureBase {
  kind: "rampage";
  triggerRangeUnits: number;
  size: number;
  growTicks: number;
  bigTicks: number;
  shrinkTicks: number;
  moveMultiplier: number;
  grabReachUnits: number;
  grabWindupTicks: number;
  throwIntervalTicks: number;
  throwSearchUnits: number;
  throwRiseUnits: number;
  thrownDamage: number;
  bowlingDamage: number;
}

export interface ShortFuseDefinition extends SignatureBase {
  kind: "short-fuse";
  rangeUnits: number;
  castTicks: number;
  boltUnitsPerSecond: number;
  fuseTicks: number;
  panicMoveMultiplier: number;
  burnDamagePerSecond: number;
  burnTicks: number;
  maxTouchHops: number;
  blastRadiusUnits: number;
  blastDamage: number;
  blastLaunch: RadialLaunch;
  hotPotatoScale: number;
}

export interface BigBubbleDefinition extends SignatureBase {
  kind: "big-bubble";
  rangeUnits: number;
  castTicks: number;
  radiusUnits: number;
  maxMembers: number;
  floatHeightUnits: number;
  riseTicks: number;
  durationTicks: number;
}

export interface YankDefinition extends SignatureBase {
  kind: "yank";
  rangeUnits: number;
  minRangeUnits: number;
  castTicks: number;
  hookUnitsPerSecond: number;
  landingOffsetUnits: number;
  riseUnits: number;
  damage: number;
  bowlingDamage: number;
  stunTicks: number;
  recoverTicks: number;
}

export interface CollectionDayDefinition extends SignatureBase {
  kind: "collection-day";
  rangeUnits: number;
  castTicks: number;
  radiusUnits: number;
  pileRadiusUnits: number;
  pullTicks: number;
  damage: number;
}

export interface BlizzardDefinition extends SignatureBase {
  kind: "blizzard";
  rangeUnits: number;
  castTicks: number;
  radiusUnits: number;
  freezeTicks: number;
  damage: number;
}

export type SignatureDefinition =
  | HammerfallDefinition
  | RampageDefinition
  | ShortFuseDefinition
  | BigBubbleDefinition
  | YankDefinition
  | CollectionDayDefinition
  | BlizzardDefinition;

export type SignatureKind = SignatureDefinition["kind"];

export interface SafetyBubbleDefinition {
  kind: "safety-bubble";
  name: string;
  description: string;
  thresholdFraction: number;
  healFraction: number;
  durationTicks: number;
  riseTicks: number;
  floatHeightUnits: number;
  radiusUnits: number;
}

export type PassiveDefinition = SafetyBubbleDefinition;

export interface HeroDefinition {
  id: HeroDefinitionId;
  name: string;
  title: string;
  description: string;
  role: HeroRole;
  draftable: boolean;
  maxHp: number;
  moveUnitsPerSecond: number;
  bodyRadiusUnits: number;
  maxMana: number;
  startingMana: number;
  attack: AttackDefinition;
  signature: SignatureDefinition | null;
  passive: PassiveDefinition | null;
}

export interface ArenaDefinition {
  id: ArenaDefinitionId;
  name: string;
  width: number;
  height: number;
  columns: number;
  rows: number;
}

export interface Catalogue {
  heroes: Record<HeroDefinitionId, HeroDefinition>;
  arenas: Record<ArenaDefinitionId, ArenaDefinition>;
}

export function heroDefinition(catalogue: Catalogue, heroId: HeroDefinitionId): HeroDefinition {
  const hero = catalogue.heroes[heroId];

  if (hero === undefined) {
    throw new Error(`Unknown hero "${heroId}"`);
  }

  return hero;
}

export function arenaDefinition(catalogue: Catalogue, arenaId: ArenaDefinitionId): ArenaDefinition {
  const arena = catalogue.arenas[arenaId];

  if (arena === undefined) {
    throw new Error(`Unknown arena "${arenaId}"`);
  }

  return arena;
}
