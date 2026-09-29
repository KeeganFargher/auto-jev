import type { ArenaDefinitionId, HeroDefinitionId, TeamId, UnitId } from "../ids.js";
import type {
  AttackDefinition,
  PassiveDefinition,
  RadialLaunch,
  SetupState,
  SignatureDefinition,
} from "../definitions.js";
import type { Vector2 } from "../math/vector.js";
import type { RngState } from "../random/rng.js";
import type { BattleResult } from "./result.js";

export type LaunchCause = "hammer" | "throw" | "yank" | "blast" | "crit" | "bowling" | "drop";

export interface FlightPath {
  from: Vector2;
  bounce: Vector2 | null;
  to: Vector2;
  length: number;
}

export interface LandingEffect {
  hard: boolean;
  cause: LaunchCause;
  launcherUnitId: UnitId;
  launcherTeamId: TeamId;
  bowlingHop: number;
  bowlingDamage: number;
  landingDamage: number;
  stunTicks: number;
}

export interface FlightMotion {
  kind: "flight";
  path: FlightPath;
  startTick: number;
  endTick: number;
  startHeight: number;
  peak: number;
  landing: LandingEffect;
}

export interface FloatMotion {
  kind: "float";
  bubbleId: number;
  offset: Vector2;
}

export interface SkidMotion {
  kind: "skid";
  from: Vector2;
  to: Vector2;
  startTick: number;
  endTick: number;
  makerUnitId: UnitId;
}

export interface DownedMotion {
  kind: "downed";
  startTick: number;
  endTick: number;
  makerUnitId: UnitId;
}

export interface GroundMotion {
  kind: "ground";
}

export type Motion = GroundMotion | FlightMotion | FloatMotion | SkidMotion | DownedMotion;

export type UnitAction =
  | { kind: "idle" }
  | { kind: "attack"; targetUnitId: UnitId; startTick: number; hitTick: number }
  | {
      kind: "hammerfall";
      startTick: number;
      impactTick: number;
      endTick: number;
      center: Vector2;
    }
  | { kind: "rampage-grow"; startTick: number; endTick: number }
  | { kind: "grab"; targetUnitId: UnitId; startTick: number; throwTick: number }
  | {
      kind: "short-fuse";
      targetUnitId: UnitId;
      startTick: number;
      releaseTick: number;
    }
  | {
      kind: "big-bubble";
      center: Vector2;
      startTick: number;
      releaseTick: number;
    }
  | {
      kind: "yank";
      targetUnitId: UnitId;
      startTick: number;
      throwTick: number;
      endTick: number;
    }
  | {
      kind: "collection-day";
      center: Vector2;
      startTick: number;
      releaseTick: number;
    }
  | {
      kind: "blizzard";
      center: Vector2;
      startTick: number;
      releaseTick: number;
    };

export interface BurningState {
  fuseId: number;
  makerUnitId: UnitId;
  hop: number;
  untilTick: number;
  nextPulseTick: number;
}

export interface PrimedState {
  fuseId: number;
  makerUnitId: UnitId;
  explodeTick: number;
}

export interface FrozenState {
  makerUnitId: UnitId;
  untilTick: number;
}

export interface RampageState {
  startTick: number;
  growEndTick: number;
  shrinkStartTick: number;
  endTick: number;
  nextGrabTick: number;
}

export interface UnitState {
  unitId: UnitId;
  teamId: TeamId;
  heroId: HeroDefinitionId;
  position: Vector2;
  elevation: number;
  facing: Vector2;
  baseRadius: number;
  size: number;
  radius: number;
  hp: number;
  maxHp: number;
  mana: number;
  maxMana: number;
  alive: boolean;
  diedAtTick: number;
  moveUnitsPerSecond: number;
  attack: AttackDefinition;
  signature: SignatureDefinition | null;
  passive: PassiveDefinition | null;
  targetUnitId: UnitId | null;
  nextAttackTick: number;
  readySinceTick: number;
  action: UnitAction;
  motion: Motion;
  stunnedUntilTick: number;
  burning: BurningState | null;
  primed: PrimedState | null;
  frozen: FrozenState | null;
  rampage: RampageState | null;
  safetyBubbled: boolean;
  damageDealt: number;
}

export type ProjectilePayload =
  | {
      kind: "attack";
      damage: number;
      crit: boolean;
      splashRadiusUnits: number;
      splashFraction: number;
    }
  | { kind: "fuse" }
  | { kind: "hook" };

export interface ProjectileState {
  projectileId: number;
  sourceUnitId: UnitId;
  targetUnitId: UnitId;
  from: Vector2;
  fromElevation: number;
  launchTick: number;
  arrivalTick: number;
  payload: ProjectilePayload;
}

export type BubbleKind = "big" | "safety";

export interface BubbleFlight {
  path: FlightPath;
  startTick: number;
  endTick: number;
  startHeight: number;
  peak: number;
  landing: LandingEffect;
}

export interface BubbleState {
  bubbleId: number;
  kind: BubbleKind;
  ownerUnitId: UnitId;
  ownerTeamId: TeamId;
  center: Vector2;
  elevation: number;
  startElevation: number;
  floatHeight: number;
  radius: number;
  memberUnitIds: UnitId[];
  startTick: number;
  riseEndTick: number;
  endTick: number;
  healPerPulse: number;
  nextPulseTick: number;
  flight: BubbleFlight | null;
}

export interface FuseState {
  fuseId: number;
  makerUnitId: UnitId;
  makerTeamId: TeamId;
  carrierUnitId: UnitId;
  ignitedUnitIds: UnitId[];
  detonated: boolean;
  burnDamagePerPulse: number;
  burnTicks: number;
  maxTouchHops: number;
  panicMoveMultiplier: number;
  blastRadiusUnits: number;
  blastDamage: number;
  blastLaunch: RadialLaunch;
  hotPotatoScale: number;
}

export interface ChainState {
  teamId: TeamId;
  count: number;
  lastLinkTick: number;
  unitIds: UnitId[];
  pairs: string[];
}

export interface SetupMark {
  state: SetupState;
  makerUnitId: UnitId;
}

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
  rng: RngState;
  units: UnitState[];
  resolutionOrder: UnitId[];
  projectiles: ProjectileState[];
  bubbles: BubbleState[];
  fuses: FuseState[];
  chains: ChainState[];
  nextEntityId: number;
  sequence: number;
  result: BattleResult | null;
}

export function unitById(state: BattleState, unitId: UnitId): UnitState {
  const unit = state.units.find((candidate) => candidate.unitId === unitId);

  if (unit === undefined) {
    throw new Error(`Unknown unit "${unitId}"`);
  }

  return unit;
}

export function bubbleById(state: BattleState, bubbleId: number): BubbleState {
  const bubble = state.bubbles.find((candidate) => candidate.bubbleId === bubbleId);

  if (bubble === undefined) {
    throw new Error(`Unknown bubble ${bubbleId}`);
  }

  return bubble;
}

export function fuseById(state: BattleState, fuseId: number): FuseState {
  const fuse = state.fuses.find((candidate) => candidate.fuseId === fuseId);

  if (fuse === undefined) {
    throw new Error(`Unknown fuse ${fuseId}`);
  }

  return fuse;
}

export function nextEntityId(state: BattleState): number {
  const id = state.nextEntityId;
  state.nextEntityId += 1;

  return id;
}

export function isGrounded(unit: UnitState): boolean {
  return unit.motion.kind === "ground";
}

export function isAirborne(unit: UnitState): boolean {
  return unit.motion.kind === "flight";
}

export function isLaunched(unit: UnitState): boolean {
  const motion = unit.motion;

  return motion.kind === "flight" && motion.landing.cause !== "drop";
}

export function isFloating(unit: UnitState): boolean {
  return unit.motion.kind === "float";
}

export function isDowned(unit: UnitState): boolean {
  return unit.motion.kind === "downed" || unit.motion.kind === "skid";
}

export function isOnFloor(unit: UnitState): boolean {
  return !isAirborne(unit) && !isFloating(unit);
}

export function isImmovable(unit: UnitState): boolean {
  return unit.rampage !== null;
}

export function isFrozen(unit: UnitState, tick: number): boolean {
  return unit.frozen !== null && unit.frozen.untilTick > tick;
}

export function isStunned(unit: UnitState, tick: number): boolean {
  return (unit.stunnedUntilTick > tick || isFrozen(unit, tick)) && unit.rampage === null;
}

export function canAct(unit: UnitState, tick: number): boolean {
  return unit.alive && isGrounded(unit) && !isStunned(unit, tick);
}

export function setupMarks(state: BattleState, unit: UnitState): SetupMark[] {
  const marks: SetupMark[] = [];
  const motion = unit.motion;

  if (motion.kind === "float") {
    marks.push({ state: "floating", makerUnitId: bubbleById(state, motion.bubbleId).ownerUnitId });
  }

  if (motion.kind === "flight" && isLaunched(unit)) {
    marks.push({ state: "airborne", makerUnitId: motion.landing.launcherUnitId });
  }

  if (unit.primed !== null) {
    marks.push({ state: "primed", makerUnitId: unit.primed.makerUnitId });
  }

  if (unit.frozen !== null) {
    marks.push({ state: "frozen", makerUnitId: unit.frozen.makerUnitId });
  }

  if (unit.burning !== null) {
    marks.push({ state: "burning", makerUnitId: unit.burning.makerUnitId });
  }

  if (motion.kind === "downed" || motion.kind === "skid") {
    marks.push({ state: "downed", makerUnitId: motion.makerUnitId });
  }

  return marks;
}

export function hasSetup(state: BattleState, unit: UnitState): boolean {
  return setupMarks(state, unit).length > 0;
}
