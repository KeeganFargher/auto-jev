import {
  BufferGeometry,
  DynamicDrawUsage,
  Float32BufferAttribute,
  LineDashedMaterial,
  LineLoop,
  LineSegments,
  Mesh,
  MeshBasicMaterial,
  Quaternion,
  RingGeometry,
  Vector3,
} from "three";
import {
  distance,
  flightElevation,
  flightFraction,
  flightPosition,
  isStunned,
  lerp,
  TICK_RATE,
  type BattleEvent,
  type BattleSnapshot,
  type BoardGrid,
  type BubbleKind,
  type DamageCause,
  type DamageEvent,
  type HealEvent,
  type LaunchCause,
  type PopEvent,
  type RampageDefinition,
  type ShortFuseDefinition,
  type UnitState,
} from "@jev-game/game";
import { graphicsSettings } from "../../graphics/settings.js";
import { unitStatuses } from "../unit-status.js";
import type { BattleMoment } from "../../session/types.js";
import {
  playDamage,
  playDeath,
  playImpact,
  playLanding,
  playStun,
  playSwing,
  playThrow,
  playYank,
} from "../fx/battle-sounds.js";
import { createBattleEffects, type GroundMarker } from "./battle-effects.js";
import {
  floatKey,
  plateKey,
  samePlate,
  type BattleOverlay,
  type ChainModel,
  type FloatKind,
  type FloatModel,
  type PlateModel,
} from "./battle-overlay.js";
import { bounceLift, flightSpin, hitSquash, hopLift, spinAngle, type Spin } from "./body-motion.js";
import {
  BUBBLE_TINTS,
  createBubbleVisual,
  createChainVisual,
  createShotVisual,
  heroLook,
  shotLook,
  type BubbleVisual,
  type ChainVisual,
  type ShotVisual,
} from "./battle-visuals.js";
import type { BoardStage, StageFocus, ViewSide, ViewportInsets } from "./board-stage.js";
import { CHEST_FRACTION, KAYKIT_UNIT } from "./figure-base.js";
import {
  createGiantHammer,
  hammerDone,
  releaseFlourish,
  slamGround,
  summonFlourish,
  swingSeconds,
  type GiantHammer,
} from "./giant-hammer.js";
import { createHeroFigure, type FigureStance, type HeroFigure } from "./hero-figures.js";
import { emitHit, emitRelease, type HitKind } from "./hit-effects.js";
import { GROW_STEPS, growStepsTaken, rampageSwell } from "./rampage-swell.js";

export interface BattleFrame {
  moment: BattleMoment;
  events: readonly BattleEvent[];
  selectedUnitId: string | null;
  deltaSeconds: number;
  playRate: number;
}

export interface BattleView {
  update(frame: BattleFrame): void;
  pick(clientX: number, clientY: number): void;
  dispose(): void;
}

export type TargetLineMode = "all" | "selected";

export interface BattleViewOptions {
  friendlyTeamId: string;
  viewSide: ViewSide;
  insets: ViewportInsets;
  targetLines: TargetLineMode;
  showUnitIds: boolean;
  overlay: BattleOverlay;
  onSelectUnit: (unitId: string) => void;
}

interface ChainState {
  model: ChainModel;
  endsAtTick: number;
}

interface FuseMark {
  fuseId: number;
  fuseTicks: number;
  marker: GroundMarker;
}

interface UnitRecord {
  unitId: string;
  figure: HeroFigure;
  chain: ChainState | null;
  statusCount: number;
  unit: UnitState;
  position: Vector3;
  elevation: number;
  size: number;
  yaw: number;
  spin: FlightSpin | null;
  bounceAge: number;
  hopAge: number;
  fuse: FuseMark | null;
  rampage: RampageLook | null;
  floatSide: number;
  sparkClock: number;
  emberClock: number;
  starClock: number;
  starAngle: number;
}

interface RampageLook {
  readonly startTick: number;
  readonly fullSize: number;
  readonly footing: Vector3;
  steps: number;
  deflated: boolean;
  age: number;
  rageClock: number;
  smokeClock: number;
  stride: number;
}

interface FlightSpin {
  readonly startTick: number;
  readonly spin: Spin;
}

interface Shot {
  visual: ShotVisual;
  origin: Vector3;
}

interface BubbleSpec {
  kind: BubbleKind;
  radius: number;
}

interface HeldHammer {
  readonly startTick: number;
  readonly hammer: GiantHammer;
}

interface FloatingNumber {
  model: FloatModel;
  anchor: Vector3;
  offsetX: number;
  age: number;
}

const FRIENDLY_COLOR = "#4ea1ff";

const ENEMY_COLOR = "#ff6b6b";

const SELECTION_COLOR = "#e2bd5c";

const FUSE_COLOR = "#ff7a2a";

const REEL_COLOR = "#8d8d96";

const YAW_SMOOTHING = 12;

const UP = new Vector3(0, 1, 0);

const TUMBLING_CAUSES: ReadonlySet<LaunchCause> = new Set(["hammer", "blast", "throw", "bowling"]);

const MOVING_UNITS_PER_SECOND = 3;

const TICK_JUMP_FOR_SNAP = 20;

const PICK_RADIUS_PIXELS = 44;

const PLATE_GAP_UNITS = 1.8;

const PLATE_STATUS_LIMIT = 2;

const HP_PER_SEGMENT = 250;

const SPRAY_LIFT = 0.7;

const FLOAT_NUMBER_SECONDS = 0.9;

const FLOAT_NUMBER_LIMIT = 3;

const FLOAT_BESIDE_PIXELS = 26;

const FLOAT_CHIP_PIXELS = 17;

const FLOAT_LIFT_PIXELS = 7;

const BIG_HIT_FRACTION = 0.2;

const HUGE_HIT_FRACTION = 0.4;

const BIG_HEAL_FRACTION = 0.15;

const CHAIN_HOLD_TICKS = Math.round(TICK_RATE * 1.5);

const CHAIN_FLOURISH_LINK = 5;

const FOCUS_SLACK_UNITS = 3;

const FOCUS_SHRINK_RATIO = 0.6;

const SELECTION_LIFT = 0.12;

const RANGE_LIFT = 0.15;

const TARGET_LINE_LIFT = 0.3;

const RANGE_RING_POINTS = 72;

const MAX_TARGET_LINES = 32;

const FUSE_MARK_INNER = 0.9;

const FUSE_MARK_OPACITY = 0.55;

const FUSE_PULSES = 6;

const SPARK_SECONDS = 0.06;

const EMBER_SECONDS = 0.12;

const STAR_SECONDS = 0.09;

const STAR_ORBIT_UNITS = 1.6;

const STAR_LIFT_UNITS = 0.4;

const STAR_STEP_RADIANS = 1.1;

const BURN_EMBERS = 2;

const IGNITE_EMBERS = 12;

const LANDING_DUST_RADIUS = 6;

const HAMMER_SHAKE = 1.1;

const HAMMER_PUNCH = 1;

const HAMMER_FLASH = 3;

const EXPLOSION_SHAKE = 0.5;

const LANDING_SHAKE = 0.2;

const YANK_SHAKE = 0.35;

const YANK_SLAM_SHAKE = 0.7;

const YANK_SLAM_PUNCH = 0.6;

const HARD_LANDING_SQUASH = 0.8;

const SOFT_LANDING_SQUASH = 0.35;

const QUIET_SQUASH = 0.15;

const SWELL_SQUASH = 0.8;

const SWELL_SHAKE = 0.15;

const SWELL_SHAKE_PER_STEP = 0.06;

const SWELL_DUST_COLOR = "#b8a898";

const SWELL_DUST_SPEED = 5 * KAYKIT_UNIT;

const SWELL_DUST_SPEED_PER_STEP = 1.5 * KAYKIT_UNIT;

const SWELL_DUST = 40;

const SWELL_BURST_COLOR = "#ff3a1a";

const SWELL_BURST = 20;

const SWELL_BURST_SPEED = 4 * KAYKIT_UNIT;

const SWELL_BURST_SIZE = 0.4 * KAYKIT_UNIT;

const GROWN_PUNCH = 0.8;

const GROWN_CRATER = 3.5 * KAYKIT_UNIT;

const GROWN_DEBRIS = 12;

const RAGE_SECONDS = 1 / 36;

const RAGE_TINT = 0.1;

const RAGE_PULSE = 0.06;

const RAGE_PULSE_SECONDS = 0.09;

const STOMP_STRIDE = 2 * KAYKIT_UNIT;

const STOMP_SHAKE = 0.18;

const STOMP_DUST_SPEED = 5 * KAYKIT_UNIT;

const STOMP_DUST = 24;

const DEFLATE_SQUASH = 1;

const DEFLATE_SHAKE = 0.4;

const DEFLATE_DUST_COLOR = "#cfcfd8";

const DEFLATE_DUST_SPEED = 6 * KAYKIT_UNIT;

const DEFLATE_DUST = 32;

const SMOKE_SECONDS = 1 / 54;

const SMOKE_SPREAD = 0.35 * KAYKIT_UNIT;

const BUBBLE_HEADROOM = 0.6;

const CAUSE_SPRAY: Readonly<Record<Exclude<DamageCause, "attack">, HitKind | null>> = {
  splash: "strike",
  hammer: "blunt",
  throw: "blunt",
  bowling: "blunt",
  blast: "strike",
  burn: null,
  yank: "blunt",
};

export function snapshotGrid(snapshot: BattleSnapshot): BoardGrid {
  return {
    width: snapshot.arenaWidth,
    height: snapshot.arenaHeight,
    columns: snapshot.arenaColumns,
    rows: snapshot.arenaRows,
  };
}

function approachAngle(current: number, target: number, amount: number): number {
  let delta = target - current;

  while (delta > Math.PI) {
    delta -= Math.PI * 2;
  }

  while (delta < -Math.PI) {
    delta += Math.PI * 2;
  }

  return current + delta * amount;
}

function stanceOf(unit: UnitState): FigureStance {
  switch (unit.motion.kind) {
    case "flight":
    case "float":
      return "airborne";
    case "skid":
    case "downed":
      return "downed";
    case "ground":
      return "standing";
  }
}

function leadSeconds(strikeTick: number, tick: number): number {
  return (strikeTick - tick) / TICK_RATE;
}

function smoothing(rate: number, deltaSeconds: number): number {
  return 1 - Math.exp(-rate * deltaSeconds);
}

function clampUnit(value: number): number {
  return Math.min(1, Math.max(0, value));
}

function thousandth(fraction: number): number {
  return Math.round(fraction * 1000) / 1000;
}

function facingYaw(unit: UnitState): number {
  return Math.atan2(unit.facing.x, unit.facing.y);
}

function unitIn(snapshot: BattleSnapshot, unitId: string): UnitState {
  const unit = snapshot.units.find((candidate) => candidate.unitId === unitId);

  if (unit === undefined) {
    throw new Error(`Snapshot at tick ${snapshot.tick} has no unit "${unitId}"`);
  }

  return unit;
}

function isCelebrating(snapshot: BattleSnapshot, unit: UnitState): boolean {
  const result = snapshot.result;

  return (
    result !== null && result.kind === "win" && result.winningTeamId === unit.teamId && unit.alive
  );
}

function shortFuseOf(maker: UnitState): ShortFuseDefinition {
  const signature = maker.signature;

  if (signature === null || signature.kind !== "short-fuse") {
    throw new Error(`Unit "${maker.unitId}" lit a fuse without Short Fuse`);
  }

  return signature;
}

function rampageOf(unit: UnitState): RampageDefinition {
  const signature = unit.signature;

  if (signature === null || signature.kind !== "rampage") {
    throw new Error(`Unit "${unit.unitId}" rampages without Rampage`);
  }

  return signature;
}

function damageFloat(crit: boolean, share: number): FloatKind | null {
  if (crit) {
    return "crit";
  }

  if (share >= HUGE_HIT_FRACTION) {
    return "huge";
  }

  return share >= BIG_HIT_FRACTION ? "big" : null;
}

export function createBattleView(stage: BoardStage, options: BattleViewOptions): BattleView {
  const records = new Map<string, UnitRecord>();
  const shots = new Map<number, Shot>();
  const bubbles = new Map<number, BubbleVisual>();
  const bubbleSpecs = new Map<number, BubbleSpec>();
  const heldHammers = new Map<string, HeldHammer>();
  const spentSwings = new Map<string, number>();
  const hammerSpot = new Vector3();
  const hammerHeading = new Vector3();
  const reels = new Map<string, ChainVisual>();
  const liveNumbers: FloatingNumber[] = [];
  const { overlay } = options;
  let plateModels: readonly PlateModel[] = [];
  let nextNumberId = 0;
  let nextChainSerial = 0;
  const effects = createBattleEffects(stage.scene, stage.particles);
  const selectionGeometry = new RingGeometry(5.2, 6.1, 40);

  const selectionRing = new Mesh(
    selectionGeometry,
    new MeshBasicMaterial({
      color: SELECTION_COLOR,
      transparent: true,
      opacity: 0.95,
      depthWrite: false,
    }),
  );

  selectionRing.rotation.x = -Math.PI / 2;
  selectionRing.visible = false;

  const rangeRing = new LineLoop(
    new BufferGeometry(),
    new LineDashedMaterial({
      color: SELECTION_COLOR,
      dashSize: 1.6,
      gapSize: 1.2,
      transparent: true,
      opacity: 0.7,
    }),
  );

  rangeRing.visible = false;
  const targetLineGeometry = new BufferGeometry();

  const targetLinePositions = new Float32BufferAttribute(new Float32Array(MAX_TARGET_LINES * 6), 3);

  targetLinePositions.setUsage(DynamicDrawUsage);
  targetLineGeometry.setAttribute("position", targetLinePositions);

  const targetLines = new LineSegments(
    targetLineGeometry,
    new LineDashedMaterial({
      color: "#ffffff",
      dashSize: 1.2,
      gapSize: 1,
      transparent: true,
      opacity: 0.35,
    }),
  );

  targetLines.visible = false;
  stage.scene.add(selectionRing, rangeRing, targetLines);
  const scratch = new Vector3();
  const tumbleTurn = new Quaternion();
  const chestPivot = new Vector3();
  const shotTarget = new Vector3();
  const reelStart = new Vector3();
  const reelEnd = new Vector3();
  let focusArea: StageFocus | null = null;
  let rangeRingRadius = -1;
  let lastTick: number | null = null;

  function recordOf(unitId: string): UnitRecord {
    const record = records.get(unitId);

    if (record === undefined) {
      throw new Error(`Battle view has no unit "${unitId}"`);
    }

    return record;
  }

  function standingHeight(record: UnitRecord): number {
    return record.figure.height * record.size;
  }

  function chestOf(record: UnitRecord, out: Vector3): Vector3 {
    return out
      .copy(record.position)
      .setY(record.elevation + standingHeight(record) * CHEST_FRACTION);
  }

  function headOf(record: UnitRecord, out: Vector3): Vector3 {
    return out.copy(record.position).setY(record.elevation + standingHeight(record));
  }

  function panOf(record: UnitRecord): number | undefined {
    return stage.screenPan(record.position);
  }

  function tallestOf(unitIds: readonly string[]): number {
    let tallest = 0;

    for (const unitId of unitIds) {
      tallest = Math.max(tallest, standingHeight(recordOf(unitId)));
    }

    return tallest;
  }

  function createRecord(unit: UnitState): UnitRecord {
    const isFriendly = unit.teamId === options.friendlyTeamId;
    const figure = createHeroFigure(unit.heroId);
    figure.setTeamColor(isFriendly ? FRIENDLY_COLOR : ENEMY_COLOR);
    stage.scene.add(figure.root);

    return {
      unitId: unit.unitId,
      figure,
      chain: null,
      statusCount: 0,
      unit,
      position: stage.toScene(unit.position, 0),
      elevation: unit.elevation,
      size: unit.size,
      yaw: facingYaw(unit),
      spin: null,
      bounceAge: Number.POSITIVE_INFINITY,
      hopAge: Number.POSITIVE_INFINITY,
      fuse: null,
      rampage: null,
      floatSide: 1,
      sparkClock: 0,
      emberClock: 0,
      starClock: 0,
      starAngle: 0,
    };
  }

  function removeRecord(record: UnitRecord): void {
    record.fuse?.marker.remove();
    record.figure.dispose();
    overlay.anchors.release(plateKey(record.unitId));
  }

  function placeUnit(
    record: UnitRecord,
    moment: BattleMoment,
    snap: boolean,
    deltaSeconds: number,
  ): void {
    const unit = record.unit;
    const next = unitIn(moment.next, unit.unitId);
    const motion = unit.motion;
    const along = moment.tick - moment.snapshot.tick;

    if (motion.kind === "flight") {
      record.position.copy(stage.toScene(flightPosition(motion, moment.tick), 0));
      record.elevation = flightElevation(motion, moment.tick);
    } else {
      record.position.copy(stage.toScene(lerp(unit.position, next.position, along), 0));
      record.elevation = unit.elevation + (next.elevation - unit.elevation) * along;
    }

    record.size =
      unit.alive && unit.rampage !== null
        ? rampageSwell(unit.rampage, rampageOf(unit).size, moment.tick)
        : unit.size + (next.size - unit.size) * along;

    record.yaw = approachAngle(
      record.yaw,
      facingYaw(unit),
      snap ? 1 : smoothing(YAW_SMOOTHING, deltaSeconds),
    );
    record.bounceAge = snap ? Number.POSITIVE_INFINITY : record.bounceAge + deltaSeconds;
    record.hopAge = snap ? Number.POSITIVE_INFINITY : record.hopAge + deltaSeconds;
    tumbleTurn.identity();

    if (motion.kind === "flight" && TUMBLING_CAUSES.has(motion.landing.cause)) {
      const flightSeconds = (motion.endTick - motion.startTick) / TICK_RATE;

      if (record.spin === null || record.spin.startTick !== motion.startTick) {
        record.spin = {
          startTick: motion.startTick,
          spin: flightSpin(unit.unitId, motion.startTick, flightSeconds),
        };
      }

      const spin = record.spin.spin;

      tumbleTurn.setFromAxisAngle(
        spin.axis,
        spinAngle(
          spin,
          flightSeconds,
          flightFraction(motion.startTick, motion.endTick, moment.tick),
        ),
      );
    }

    const chest = standingHeight(record) * CHEST_FRACTION;
    const root = record.figure.root;
    root.quaternion.setFromAxisAngle(UP, record.yaw).multiply(tumbleTurn);
    chestPivot.set(0, chest, 0).applyQuaternion(root.quaternion);

    root.position
      .set(
        record.position.x,
        record.elevation + chest + bounceLift(record.bounceAge) + hopLift(record.hopAge),
        record.position.z,
      )
      .sub(chestPivot);

    root.scale.setScalar(record.size);

    const moving =
      unit.alive &&
      motion.kind === "ground" &&
      distance(unit.position, next.position) * TICK_RATE > MOVING_UNITS_PER_SECOND;

    record.figure.setStance(stanceOf(unit));
    record.figure.setMoving(moving);
    record.figure.setDead(!unit.alive);
    record.figure.setCelebrating(isCelebrating(moment.snapshot, unit));
    record.figure.update(deltaSeconds);
  }

  function syncFuse(record: UnitRecord, tick: number): void {
    const primed = record.unit.alive ? record.unit.primed : null;

    if (record.fuse !== null && (primed === null || record.fuse.fuseId !== primed.fuseId)) {
      record.fuse.marker.remove();
      record.fuse = null;
    }

    if (primed === null) {
      return;
    }

    if (record.fuse === null) {
      const fuse = shortFuseOf(recordOf(primed.makerUnitId).unit);
      record.fuse = {
        fuseId: primed.fuseId,
        fuseTicks: fuse.fuseTicks,
        marker: effects.marker(
          record.position,
          FUSE_MARK_INNER,
          fuse.blastRadiusUnits,
          FUSE_COLOR,
          0,
        ),
      };
    }

    const burnt = 1 - clampUnit((primed.explodeTick - tick) / record.fuse.fuseTicks);
    const pulse = 0.5 + 0.5 * Math.cos(Math.PI * 2 * FUSE_PULSES * burnt * burnt);
    record.fuse.marker.place(record.position);
    record.fuse.marker.setOpacity(FUSE_MARK_OPACITY * (0.35 + 0.65 * pulse));
  }

  function stepAilments(record: UnitRecord, tick: number, deltaSeconds: number): void {
    const unit = record.unit;
    record.sparkClock = unit.alive && unit.primed !== null ? record.sparkClock + deltaSeconds : 0;
    record.emberClock = unit.alive && unit.burning !== null ? record.emberClock + deltaSeconds : 0;
    record.starClock = unit.alive && isStunned(unit, tick) ? record.starClock + deltaSeconds : 0;

    while (record.sparkClock >= SPARK_SECONDS) {
      record.sparkClock -= SPARK_SECONDS;
      effects.fuseSparks(headOf(record, scratch));
    }

    while (record.emberClock >= EMBER_SECONDS) {
      record.emberClock -= EMBER_SECONDS;
      effects.embers(chestOf(record, scratch), BURN_EMBERS);
    }

    while (record.starClock >= STAR_SECONDS) {
      record.starClock -= STAR_SECONDS;
      record.starAngle += STAR_STEP_RADIANS;
      const head = headOf(record, scratch);
      head.x += Math.cos(record.starAngle) * STAR_ORBIT_UNITS;
      head.y += STAR_LIFT_UNITS;
      head.z += Math.sin(record.starAngle) * STAR_ORBIT_UNITS;
      effects.stunStar(head);
    }
  }

  function swellStep(record: UnitRecord, step: number): void {
    record.figure.squash(SWELL_SQUASH);
    stage.shake(SWELL_SHAKE + step * SWELL_SHAKE_PER_STEP);

    effects.ringBurst(
      record.position,
      SWELL_DUST_COLOR,
      SWELL_DUST_SPEED + step * SWELL_DUST_SPEED_PER_STEP,
      SWELL_DUST,
    );

    effects.burst(
      scratch.copy(record.position).setY(record.elevation + standingHeight(record) / 2),
      SWELL_BURST_COLOR,
      "glow",
      SWELL_BURST,
      SWELL_BURST_SPEED,
      SWELL_BURST_SIZE,
    );

    if (step === GROW_STEPS.length) {
      stage.punch(GROWN_PUNCH);
      effects.crater(record.position, GROWN_CRATER);
      effects.debris(record.position, GROWN_DEBRIS);
      playImpact(panOf(record));
    }
  }

  function deflate(record: UnitRecord): void {
    record.figure.squash(DEFLATE_SQUASH);
    stage.shake(DEFLATE_SHAKE);
    effects.ringBurst(record.position, DEFLATE_DUST_COLOR, DEFLATE_DUST_SPEED, DEFLATE_DUST);
  }

  function stomp(record: UnitRecord): void {
    stage.shake(STOMP_SHAKE);
    effects.ringBurst(record.position, SWELL_DUST_COLOR, STOMP_DUST_SPEED, STOMP_DUST);
  }

  function stepRampage(
    record: UnitRecord,
    tick: number,
    snap: boolean,
    deltaSeconds: number,
  ): void {
    const unit = record.unit;
    const rampage = unit.alive ? unit.rampage : null;

    if (rampage === null) {
      record.rampage = null;
      record.figure.setRage(0);

      return;
    }

    if (record.rampage === null || record.rampage.startTick !== rampage.startTick) {
      record.rampage = {
        startTick: rampage.startTick,
        fullSize: rampageOf(unit).size,
        footing: record.position.clone(),
        steps: 0,
        deflated: false,
        age: 0,
        rageClock: 0,
        smokeClock: 0,
        stride: 0,
      };
    }

    const look = record.rampage;
    const steps = growStepsTaken(rampage, tick);

    for (let step = look.steps + 1; step <= steps && !snap; step += 1) {
      swellStep(record, step);
    }

    look.steps = steps;
    const shrinking = tick >= rampage.shrinkStartTick;

    if (shrinking && !look.deflated && !snap) {
      deflate(record);
    }

    look.deflated = shrinking;
    const big = steps === GROW_STEPS.length && !shrinking && unit.motion.kind === "ground";

    const moved = Math.hypot(
      record.position.x - look.footing.x,
      record.position.z - look.footing.z,
    );

    look.footing.copy(record.position);
    look.stride = big && !snap ? look.stride + moved : 0;

    if (look.stride >= STOMP_STRIDE) {
      look.stride -= STOMP_STRIDE;
      stomp(record);
    }

    look.age += deltaSeconds;
    record.figure.setRage(RAGE_TINT + RAGE_PULSE * Math.sin(look.age / RAGE_PULSE_SECONDS));
    look.rageClock += deltaSeconds;
    look.smokeClock = shrinking ? look.smokeClock + deltaSeconds : 0;
    const feet = scratch.copy(record.position).setY(record.elevation);

    while (look.rageClock >= RAGE_SECONDS) {
      look.rageClock -= RAGE_SECONDS;
      effects.rage(feet, standingHeight(record), record.size);
    }

    while (look.smokeClock >= SMOKE_SECONDS) {
      look.smokeClock -= SMOKE_SECONDS;
      effects.smoke(feet, record.figure.height * look.fullSize, SMOKE_SPREAD * look.fullSize);
    }
  }

  function plateOf(record: UnitRecord, snapshot: BattleSnapshot): PlateModel {
    const unit = record.unit;
    const statuses = unitStatuses(snapshot, unit).slice(0, PLATE_STATUS_LIMIT);
    record.statusCount = statuses.length;

    if (record.chain !== null && (snapshot.tick > record.chain.endsAtTick || !unit.alive)) {
      record.chain = null;
    }

    return {
      unitId: unit.unitId,
      friendly: unit.teamId === options.friendlyTeamId,
      label: options.showUnitIds ? unit.unitId : null,
      alive: unit.alive,
      segment: HP_PER_SEGMENT / unit.maxHp,
      hp: thousandth(unit.hp / unit.maxHp),
      mana: unit.maxMana > 0 ? thousandth(Math.min(1, unit.mana / unit.maxMana)) : null,
      manaFull: unit.maxMana > 0 && unit.mana >= unit.maxMana,
      statuses,
      chain: record.chain === null ? null : record.chain.model,
    };
  }

  function followPlate(record: UnitRecord): void {
    if (!record.unit.alive) {
      return;
    }

    const anchor = headOf(record, scratch);
    anchor.y += PLATE_GAP_UNITS;
    const point = stage.toScreen(anchor);

    if (point !== null) {
      overlay.anchors.place(plateKey(record.unitId), point);
    }
  }

  function publishPlates(snapshot: BattleSnapshot): void {
    const models = Array.from(records.values(), (record) => {
      const model = plateOf(record, snapshot);
      const known = plateModels.find((candidate) => candidate.unitId === model.unitId);

      return known !== undefined && samePlate(known, model) ? known : model;
    });

    if (
      models.length !== plateModels.length ||
      models.some((model, index) => model !== plateModels[index])
    ) {
      plateModels = models;
      overlay.plates.set(models);
    }
  }

  function syncUnits(moment: BattleMoment, snap: boolean, deltaSeconds: number): void {
    const snapshot = moment.snapshot;

    for (const unit of snapshot.units) {
      const record = records.get(unit.unitId);

      if (record === undefined) {
        records.set(unit.unitId, createRecord(unit));
      } else if (record.unit.heroId !== unit.heroId) {
        throw new Error(
          `Unit "${unit.unitId}" changed from "${record.unit.heroId}" to "${unit.heroId}"`,
        );
      } else {
        record.unit = unit;
      }
    }

    if (records.size !== snapshot.units.length) {
      throw new Error(
        `Battle view tracks ${records.size} units but tick ${snapshot.tick} has ${snapshot.units.length}`,
      );
    }

    for (const record of records.values()) {
      placeUnit(record, moment, snap, deltaSeconds);
      syncFuse(record, snapshot.tick);
      stepAilments(record, snapshot.tick, deltaSeconds);
      stepRampage(record, moment.tick, snap, deltaSeconds);
      followPlate(record);
    }

    publishPlates(snapshot);
  }

  function syncShots(moment: BattleMoment, snap: boolean): void {
    const present = new Set<number>();

    for (const projectile of moment.snapshot.projectiles) {
      if (projectile.arrivalTick <= projectile.launchTick) {
        throw new Error(
          `Projectile ${projectile.projectileId} arrives at tick ${projectile.arrivalTick} before it leaves at ${projectile.launchTick}`,
        );
      }

      present.add(projectile.projectileId);
      let shot = shots.get(projectile.projectileId);

      if (shot === undefined) {
        const source = recordOf(projectile.sourceUnitId);
        const origin = source.figure.castOrigin(new Vector3());
        const look = shotLook(projectile.payload.kind, source.unit.heroId);
        shot = { visual: createShotVisual(stage.particles, look, origin), origin };
        stage.scene.add(shot.visual.root);
        shots.set(projectile.projectileId, shot);

        if (!snap) {
          emitRelease(stage.particles, heroLook(source.unit.heroId).hit, origin);
        }
      }

      shot.visual.place(
        shot.origin,
        chestOf(recordOf(projectile.targetUnitId), shotTarget),
        (moment.tick - projectile.launchTick) / (projectile.arrivalTick - projectile.launchTick),
      );
    }

    for (const [projectileId, shot] of shots) {
      if (!present.has(projectileId)) {
        shot.visual.dispose();
        shots.delete(projectileId);
      }
    }
  }

  function syncBubbles(moment: BattleMoment, deltaSeconds: number): void {
    const along = moment.tick - moment.snapshot.tick;
    const present = new Set<number>();

    for (const bubble of moment.snapshot.bubbles) {
      present.add(bubble.bubbleId);
      bubbleSpecs.set(bubble.bubbleId, { kind: bubble.kind, radius: bubble.radius });
      let visual = bubbles.get(bubble.bubbleId);

      if (visual === undefined) {
        visual = createBubbleVisual(bubble.kind);
        stage.scene.add(visual.root);
        bubbles.set(bubble.bubbleId, visual);
      }

      const later =
        moment.next.bubbles.find((candidate) => candidate.bubbleId === bubble.bubbleId) ?? bubble;

      const center = stage.toScene(lerp(bubble.center, later.center, along), 0);
      const tallest = tallestOf(bubble.memberUnitIds);
      center.y = bubble.elevation + (later.elevation - bubble.elevation) * along + tallest / 2;
      visual.place(center, Math.max(bubble.radius, tallest * BUBBLE_HEADROOM), deltaSeconds);
    }

    for (const [bubbleId, visual] of bubbles) {
      if (!present.has(bubbleId)) {
        visual.dispose();
        bubbles.delete(bubbleId);
      }
    }
  }

  function raiseHammer(record: UnitRecord, startTick: number, flourish: boolean): GiantHammer {
    const hammer = createGiantHammer();
    record.figure.wield(hammer.root);
    heldHammers.set(record.unitId, { startTick, hammer });

    if (flourish) {
      summonFlourish(effects, chestOf(record, hammerSpot));
    }

    return hammer;
  }

  function dropHammer(record: UnitRecord, held: HeldHammer, flourish: boolean): void {
    if (flourish) {
      releaseFlourish(effects, held.hammer.face(hammerSpot));
    }

    record.figure.unwield(held.hammer.root);
    held.hammer.dispose();
    heldHammers.delete(record.unitId);
  }

  function syncHammers(tick: number, snap: boolean): void {
    for (const record of records.values()) {
      const action = record.unit.action;
      const held = heldHammers.get(record.unitId);

      if (
        held !== undefined &&
        (action.kind !== "hammerfall" || action.startTick !== held.startTick)
      ) {
        dropHammer(record, held, !snap);
      }

      if (action.kind !== "hammerfall") {
        spentSwings.delete(record.unitId);
        continue;
      }

      if (spentSwings.get(record.unitId) === action.startTick) {
        continue;
      }

      const seconds = swingSeconds(
        (tick - action.startTick) / TICK_RATE,
        (action.impactTick - action.startTick) / TICK_RATE,
      );

      const holding = heldHammers.get(record.unitId);

      if (hammerDone(seconds)) {
        if (holding !== undefined) {
          dropHammer(record, holding, !snap);
        }

        spentSwings.set(record.unitId, action.startTick);
        continue;
      }

      const hammer =
        holding === undefined ? raiseHammer(record, action.startTick, !snap) : holding.hammer;

      hammer.pose(seconds, hammerHeading.set(Math.sin(record.yaw), 0, Math.cos(record.yaw)));
    }
  }

  function syncReels(): void {
    for (const record of records.values()) {
      const motion = record.unit.motion;
      let reel = reels.get(record.unitId);

      if (motion.kind !== "flight" || motion.landing.cause !== "yank") {
        if (reel !== undefined) {
          reel.dispose();
          reels.delete(record.unitId);
        }

        continue;
      }

      if (reel === undefined) {
        reel = createChainVisual(REEL_COLOR);
        stage.scene.add(reel.root);
        reels.set(record.unitId, reel);
      }

      reel.stretch(
        recordOf(motion.landing.launcherUnitId).figure.castOrigin(reelStart),
        chestOf(record, reelEnd),
        0,
      );
    }
  }

  function placeNumber(number: FloatingNumber): void {
    const point = stage.toScreen(number.anchor);

    if (point !== null) {
      overlay.anchors.place(floatKey(number.model.id), {
        x: point.x + number.offsetX,
        y: point.y - FLOAT_LIFT_PIXELS,
      });
    }
  }

  function retireNumber(number: FloatingNumber): void {
    overlay.anchors.release(floatKey(number.model.id));
  }

  function publishNumbers(): void {
    overlay.numbers.set(liveNumbers.map((number) => number.model));
  }

  function expireNumbers(deltaSeconds: number): void {
    let expired = false;

    for (let index = liveNumbers.length - 1; index >= 0; index -= 1) {
      const number = liveNumbers[index]!;
      number.age += deltaSeconds;

      if (number.age >= FLOAT_NUMBER_SECONDS) {
        retireNumber(number);
        liveNumbers.splice(index, 1);
        expired = true;
      }
    }

    if (expired) {
      publishNumbers();
    }
  }

  function floatSide(record: UnitRecord, source: UnitRecord): number {
    const at = stage.toScreen(record.position);
    const from = source === record ? null : stage.toScreen(source.position);

    if (at !== null && from !== null && Math.abs(at.x - from.x) >= 1) {
      return at.x > from.x ? 1 : -1;
    }

    record.floatSide = -record.floatSide;

    return record.floatSide;
  }

  function floatNumber(record: UnitRecord, text: string, kind: FloatKind, side: number): void {
    const anchor = headOf(record, new Vector3());
    anchor.y += PLATE_GAP_UNITS;

    if (stage.toScreen(anchor) === null) {
      return;
    }

    nextNumberId += 1;
    const chips = side > 0 ? record.statusCount * FLOAT_CHIP_PIXELS : 0;

    const number: FloatingNumber = {
      model: { id: nextNumberId, text, kind, side },
      anchor,
      offsetX: side * (FLOAT_BESIDE_PIXELS + chips),
      age: 0,
    };

    placeNumber(number);
    liveNumbers.push(number);

    while (liveNumbers.length > FLOAT_NUMBER_LIMIT) {
      retireNumber(liveNumbers.shift()!);
    }

    publishNumbers();
  }

  function sprayHit(source: UnitRecord, target: UnitRecord, kind: HitKind, heavy: boolean): void {
    const heading = new Vector3().subVectors(target.position, source.position).setY(0);

    if (heading.lengthSq() > 0.01) {
      heading.normalize();
    }

    heading.y += SPRAY_LIFT;
    emitHit(stage.particles, kind, chestOf(target, new Vector3()), heading.normalize(), heavy);
  }

  function showDamage(event: DamageEvent): void {
    const target = recordOf(event.targetUnitId);
    const source = recordOf(event.sourceUnitId);
    const share = event.amount / target.unit.maxHp;
    const heavy = event.crit || share >= BIG_HIT_FRACTION;

    const spray =
      event.cause === "attack" ? heroLook(source.unit.heroId).hit : CAUSE_SPRAY[event.cause];

    if (spray !== null) {
      target.figure.flinch();
      target.figure.squash(hitSquash(event.amount, event.crit));
      sprayHit(source, target, spray, heavy);
    } else {
      target.figure.squash(QUIET_SQUASH);
    }

    const kind = damageFloat(event.crit, share);

    if (kind !== null) {
      floatNumber(target, String(event.amount), kind, floatSide(target, source));
    }

    playDamage(event.cause, source.unit.attack.kind, event.crit, heavy, panOf(target));
  }

  function showHeal(event: HealEvent): void {
    const target = recordOf(event.targetUnitId);
    effects.healMotes(chestOf(target, scratch));

    if (event.amount >= target.unit.maxHp * BIG_HEAL_FRACTION) {
      floatNumber(
        target,
        `+${event.amount}`,
        "heal",
        floatSide(target, recordOf(event.sourceUnitId)),
      );
    }
  }

  function showPop(event: PopEvent): void {
    const spec = bubbleSpecs.get(event.bubbleId);

    if (spec === undefined) {
      throw new Error(`Bubble ${event.bubbleId} popped but never formed`);
    }

    bubbleSpecs.delete(event.bubbleId);
    const tallest = tallestOf(event.memberUnitIds);
    const center = stage.toScene(event.center, event.elevation + tallest / 2);

    effects.pop(
      center,
      Math.max(spec.radius, tallest * BUBBLE_HEADROOM),
      BUBBLE_TINTS[spec.kind].film,
    );
  }

  function showChain(record: UnitRecord, count: number, tick: number): void {
    nextChainSerial += 1;

    record.chain = {
      model: { count, serial: nextChainSerial, flourish: count >= CHAIN_FLOURISH_LINK },
      endsAtTick: tick + CHAIN_HOLD_TICKS,
    };
  }

  function handleEvent(event: BattleEvent, tick: number): void {
    switch (event.kind) {
      case "attack": {
        const source = recordOf(event.sourceUnitId);
        source.figure.perform("attack", leadSeconds(event.hitTick, tick));
        playSwing(event.delivery, panOf(source));

        return;
      }

      case "damage": {
        showDamage(event);

        return;
      }

      case "heal": {
        showHeal(event);

        return;
      }

      case "signature": {
        recordOf(event.unitId).figure.perform("signature", leadSeconds(event.releaseTick, tick));

        return;
      }

      case "grab": {
        recordOf(event.unitId).figure.perform("throw", leadSeconds(event.throwTick, tick));

        return;
      }

      case "throw": {
        playThrow(panOf(recordOf(event.unitId)));

        return;
      }

      case "hammer-impact": {
        const center = stage.toScene(event.center, 0);
        slamGround(effects, center, event.radius);
        stage.shake(HAMMER_SHAKE);
        stage.punch(HAMMER_PUNCH);
        stage.flash(center, HAMMER_FLASH);
        playImpact(stage.screenPan(center));

        return;
      }

      case "explode": {
        const carrier = recordOf(event.unitId);

        const center = stage.toScene(
          event.center,
          event.elevation + standingHeight(carrier) * CHEST_FRACTION,
        );

        effects.explosion(center, event.radius);
        stage.shake(EXPLOSION_SHAKE);
        playImpact(stage.screenPan(center));

        return;
      }

      case "land": {
        const record = recordOf(event.unitId);
        record.figure.squash(event.hard ? HARD_LANDING_SQUASH : SOFT_LANDING_SQUASH);

        if (event.cause === "yank") {
          stage.shake(YANK_SLAM_SHAKE);
          stage.punch(YANK_SLAM_PUNCH);
        }

        if (event.hard) {
          record.bounceAge = 0;
          const point = stage.toScene(event.position, 0);
          effects.dust(point, LANDING_DUST_RADIUS);
          stage.shake(LANDING_SHAKE);
          playLanding(stage.screenPan(point));
        }

        return;
      }

      case "get-up": {
        recordOf(event.unitId).hopAge = 0;

        return;
      }

      case "yank": {
        stage.shake(YANK_SHAKE);
        playYank(panOf(recordOf(event.targetUnitId)));

        return;
      }

      case "stun": {
        playStun(panOf(recordOf(event.unitId)));

        return;
      }

      case "bubble": {
        bubbleSpecs.set(event.bubbleId, { kind: event.bubbleKind, radius: event.radius });

        return;
      }

      case "pop": {
        showPop(event);

        return;
      }

      case "ignite": {
        effects.embers(chestOf(recordOf(event.unitId), scratch), IGNITE_EMBERS);

        return;
      }

      case "combo-link": {
        showChain(recordOf(event.payoffUnitId), event.count, event.tick);

        return;
      }

      case "death": {
        const record = recordOf(event.unitId);
        effects.deathDust(record.position);
        playDeath(panOf(record));

        return;
      }

      case "rampage":
      case "projectile":
      case "launch":
      case "downed":
      case "bubble-launch":
      case "prime":
      case "burn-end":
      case "beat":
      case "battle-ended": {
        return;
      }
    }
  }

  function hideSelection(): void {
    selectionRing.visible = false;
    rangeRing.visible = false;
  }

  function updateSelection(selectedUnitId: string | null): void {
    if (selectedUnitId === null) {
      hideSelection();

      return;
    }

    const record = recordOf(selectedUnitId);

    if (!record.unit.alive) {
      hideSelection();

      return;
    }

    selectionRing.visible = true;
    selectionRing.position.set(record.position.x, SELECTION_LIFT, record.position.z);
    selectionRing.scale.setScalar(record.size);
    const radius = record.unit.radius + record.unit.attack.rangeUnits;

    if (radius !== rangeRingRadius) {
      rangeRingRadius = radius;
      const points: number[] = [];

      for (let index = 0; index < RANGE_RING_POINTS; index += 1) {
        const angle = (index / RANGE_RING_POINTS) * Math.PI * 2;
        points.push(Math.cos(angle) * radius, 0, Math.sin(angle) * radius);
      }

      rangeRing.geometry.setAttribute("position", new Float32BufferAttribute(points, 3));
      rangeRing.computeLineDistances();
    }

    rangeRing.visible = true;
    rangeRing.position.set(record.position.x, RANGE_LIFT, record.position.z);
  }

  function updateTargetLines(selectedUnitId: string | null): void {
    let count = 0;

    for (const record of records.values()) {
      const unit = record.unit;

      if (count >= MAX_TARGET_LINES) {
        break;
      }

      if (
        !unit.alive ||
        unit.targetUnitId === null ||
        (options.targetLines === "selected" && unit.unitId !== selectedUnitId)
      ) {
        continue;
      }

      const target = recordOf(unit.targetUnitId);

      if (!target.unit.alive) {
        continue;
      }

      targetLinePositions.setXYZ(count * 2, record.position.x, TARGET_LINE_LIFT, record.position.z);

      targetLinePositions.setXYZ(
        count * 2 + 1,
        target.position.x,
        TARGET_LINE_LIFT,
        target.position.z,
      );

      count += 1;
    }

    targetLines.visible = count > 0;

    if (count > 0) {
      targetLinePositions.needsUpdate = true;
      targetLineGeometry.setDrawRange(0, count * 2);
      targetLines.computeLineDistances();
    }
  }

  function fightersArea(): StageFocus | null {
    let area: StageFocus | null = null;

    for (const record of records.values()) {
      if (!record.unit.alive) {
        continue;
      }

      const { x, z } = record.position;

      area =
        area === null
          ? { minX: x, maxX: x, minZ: z, maxZ: z }
          : {
              minX: Math.min(area.minX, x),
              maxX: Math.max(area.maxX, x),
              minZ: Math.min(area.minZ, z),
              maxZ: Math.max(area.maxZ, z),
            };
    }

    return area;
  }

  function holdsArea(outer: StageFocus, inner: StageFocus): boolean {
    return (
      inner.minX >= outer.minX &&
      inner.maxX <= outer.maxX &&
      inner.minZ >= outer.minZ &&
      inner.maxZ <= outer.maxZ
    );
  }

  function areaSpread(area: StageFocus): number {
    return Math.max(area.maxX - area.minX, area.maxZ - area.minZ);
  }

  function updateFocus(fighting: boolean): void {
    const needed = fighting && graphicsSettings.get().fightCamera ? fightersArea() : null;

    if (needed === null) {
      if (focusArea !== null) {
        focusArea = null;
        stage.focus(null);
      }

      return;
    }

    if (
      focusArea !== null &&
      holdsArea(focusArea, needed) &&
      areaSpread(needed) >= areaSpread(focusArea) * FOCUS_SHRINK_RATIO
    ) {
      return;
    }

    focusArea = {
      minX: needed.minX - FOCUS_SLACK_UNITS,
      maxX: needed.maxX + FOCUS_SLACK_UNITS,
      minZ: needed.minZ - FOCUS_SLACK_UNITS,
      maxZ: needed.maxZ + FOCUS_SLACK_UNITS,
    };

    stage.focus(focusArea);
  }

  function pick(clientX: number, clientY: number): void {
    const rect = stage.canvas.getBoundingClientRect();
    const clickX = clientX - rect.left;
    const clickY = clientY - rect.top;
    let closest: UnitRecord | null = null;
    let closestScore = Number.POSITIVE_INFINITY;

    for (const record of records.values()) {
      const point = stage.toScreen(chestOf(record, scratch));

      if (point === null) {
        continue;
      }

      const gap = Math.hypot(point.x - clickX, point.y - clickY);
      const score = gap + (record.unit.alive ? 0 : PICK_RADIUS_PIXELS);

      if (gap < PICK_RADIUS_PIXELS && score < closestScore) {
        closest = record;
        closestScore = score;
      }
    }

    if (closest !== null) {
      options.onSelectUnit(closest.unitId);
    }
  }

  return {
    pick,

    update(frame) {
      if (!Number.isFinite(frame.deltaSeconds) || frame.deltaSeconds < 0) {
        throw new Error(`Invalid battle frame delta ${frame.deltaSeconds}`);
      }

      if (!Number.isFinite(frame.playRate) || frame.playRate < 0) {
        throw new Error(`Invalid battle play rate ${frame.playRate}`);
      }

      const moment = frame.moment;
      const snapshot = moment.snapshot;
      stage.showBoard(snapshotGrid(snapshot), options.viewSide, options.insets);

      const snap =
        lastTick === null || moment.tick < lastTick || moment.tick - lastTick > TICK_JUMP_FOR_SNAP;

      lastTick = moment.tick;
      const rate = frame.playRate * moment.timeScale;
      const deltaSeconds = frame.deltaSeconds * rate;
      stage.setTimeScale(rate);

      if (snap) {
        stage.particles.clear();
        effects.clear();
        bubbleSpecs.clear();

        for (const shot of shots.values()) {
          shot.visual.dispose();
        }

        shots.clear();

        for (const record of records.values()) {
          record.chain = null;
        }
      }

      syncUnits(moment, snap, deltaSeconds);
      syncShots(moment, snap);
      syncBubbles(moment, deltaSeconds);
      syncHammers(moment.tick, snap);
      syncReels();

      if (!snap) {
        for (const event of frame.events) {
          handleEvent(event, moment.tick);
        }
      }

      effects.step(deltaSeconds);
      expireNumbers(frame.deltaSeconds);

      for (const number of liveNumbers) {
        placeNumber(number);
      }

      updateSelection(frame.selectedUnitId);
      updateTargetLines(frame.selectedUnitId);
      updateFocus(snapshot.result === null);
    },

    dispose() {
      for (const record of records.values()) {
        const held = heldHammers.get(record.unitId);

        if (held !== undefined) {
          dropHammer(record, held, false);
        }
      }

      spentSwings.clear();

      for (const record of records.values()) {
        removeRecord(record);
      }

      records.clear();

      for (const shot of shots.values()) {
        shot.visual.dispose();
      }

      shots.clear();

      for (const visual of bubbles.values()) {
        visual.dispose();
      }

      bubbles.clear();
      bubbleSpecs.clear();

      for (const reel of reels.values()) {
        reel.dispose();
      }

      reels.clear();

      liveNumbers.length = 0;
      plateModels = [];
      overlay.reset();

      selectionRing.removeFromParent();
      selectionRing.material.dispose();
      selectionGeometry.dispose();
      rangeRing.removeFromParent();
      rangeRing.geometry.dispose();
      rangeRing.material.dispose();
      targetLines.removeFromParent();
      targetLineGeometry.dispose();
      targetLines.material.dispose();
      effects.dispose();
      stage.particles.clear();
      stage.focus(null);
      stage.setTimeScale(1);
    },
  };
}
