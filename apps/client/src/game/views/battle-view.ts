import {
  AdditiveBlending,
  BufferGeometry,
  Color,
  DynamicDrawUsage,
  Float32BufferAttribute,
  Line,
  LineDashedMaterial,
  LineLoop,
  LineSegments,
  Mesh,
  MeshBasicMaterial,
  MeshStandardMaterial,
  RingGeometry,
  SphereGeometry,
  Vector3,
  type Material,
  type Object3D,
} from "three";
import {
  heroLevel,
  isCorpse,
  isRevivable,
  MAX_HERO_LEVEL,
  overclockBonus,
  overclockOf,
  PLAGUE_BURST,
  TICK_RATE,
  type BattleEvent,
  type BattleSnapshot,
  type BoardGrid,
  type ComboKind,
  type ConditionKind,
  type DamageDealtEvent,
  type PassiveDefinition,
  type UnitState,
} from "@jev-game/game";
import { boneGolem, duskStrike, flickerStrike, hex as hexSpell, oathkeeper, pandemic as pandemicSpell, sharedFate, thousandCuts, voidheartBlast } from "@jev-game/content";
import { abilityDefinition, gameCatalogue, heroDefinition } from "../catalogues.js";
import {
  castVisual,
  emitterShotOrigin,
  emitterVisual,
  formVisual,
  hitVisual,
  iceChunkGeometry,
  impactVisual,
  landingVisual,
  leapArc,
  mendVisual,
  passiveVisual,
  releaseDelay,
  risenVisual,
  spawnVisual,
  waveArrivalSeconds,
  zoneDrawsBoundary,
  zoneVisual,
  type EmitterMotion,
  type SpellVisual,
  type TickedVisual,
} from "./spell-visuals.js";
import { statusIcon } from "../../hud/icons.js";
import { comboName } from "../../hud/tips.js";
import { levelBadge, romanLevel } from "../../hud/levels.js";
import { CONDITION_COLORS, createBattleEffects, PROJECTILE_SECONDS, type GroundMarker } from "./battle-effects.js";
import type { BoardStage, StageFocus, ViewSide, ViewportInsets } from "./board-stage.js";
import { graphicsSettings } from "../../graphics/settings.js";
import { CHEST_FRACTION } from "./figure-base.js";
import { createFateThreads, type Tie } from "./fate-threads.js";
import { deathKnell, HEX_POP_SECONDS, KNELL_HEIGHT, KNELL_TOLL_SECONDS } from "./fate-visuals.js";
import { createHexCritters, type HexedUnit } from "./hex-critters.js";
import { infectionVisual } from "./blight-visuals.js";
import { sanctuaryVisual } from "./shrine-visuals.js";
import { clawRake, duskPuff, duskStreak, shadeStrike, shadowStrike } from "./dusk-visuals.js";
import { createHealthTrail, type HealthTrail } from "./health-trail.js";
import { createHeroFigure, levelFigureScale, type HeroFigure } from "./hero-figures.js";
import { emitHit, emitRelease, hitKind } from "./hit-effects.js";
import type { ParticleStyle, ParticleSystem } from "./particles.js";
import {
  createFallingTracker,
  playCast,
  playCombo,
  playCrumble,
  playDeath,
  playEmitter,
  playForm,
  playHeal,
  playHit,
  playLanding,
  playOmenEcho,
  playPassive,
  playPayment,
  playPuppet,
  playRevive,
  playRise,
  playShield,
  playSpawn,
  playStun,
  playThaw,
  playZone,
  type SoundSource,
} from "../fx/battle-sounds.js";

export interface BattleView {
  update(snapshot: BattleSnapshot, selectedUnitId: string | null, latestEvents: readonly BattleEvent[]): void;
  dispose(): void;
}

export type TargetLineMode = "all" | "selected";

export interface BattleViewOptions {
  friendlyTeamId: string;
  viewSide: ViewSide;
  insets: ViewportInsets;
  targetLines: TargetLineMode;
  showUnitIds: boolean;
  onSelectUnit: (unitId: string) => void;
}

const FRIENDLY_COLOR = "#4ea1ff";

const ENEMY_COLOR = "#ff6b6b";

const SELECTION_COLOR = "#e2bd5c";

const HEAL_COLOR = "#4ade80";

const SHIELD_COLOR = "#60a5fa";

const FROST_COLOR = "#67e8f9";

const AURA_COLOR = "#ffcf6b";

const FORM_COLOR = "#ffd98a";

const INFERNO_COLOR = "#ff7a2a";

const FORM_BURST_RADIUS = 12;

const PLAGUE_COLOR = "#a3e635";

const ICE_BLOCK_COLOR = "#cdf3ff";

const ICE_BLOCK_GLOW = "#2f9fd0";

const SHOT_MEMORY_TICKS = 60;

const BURST_TARGET_UNITS = 2;

const GLOB_LAUNCH_HEIGHT = 4.5;

const ICE_SHATTER_COUNT = 18;

const FREEZE_MIST_COUNT = 12;

const POSITION_SMOOTHING = 18;

const YAW_SMOOTHING = 12;

const SNAP_DISTANCE_UNITS = 20;

const MOVING_UNITS_PER_SECOND = 3;

const TICK_JUMP_FOR_SNAP = 20;

const PICK_RADIUS_PIXELS = 44;

const PLATE_GAP_UNITS = 1.8;

const PLATE_STATUS_LIMIT = 2;

const UP = new Vector3(0, 1, 0);

const SPRAY_LIFT = 0.7;

const HEAL_MOTE_COUNT = 14;

const HEAL_MOTE_HEIGHT = 1.5;

const SPAWN_MOTE_COUNT = 16;

const SPAWN_RADIUS = 8;

const DEATH_DUST_COUNT = 10;

const IMPACT_DUST_PER_UNIT = 0.8;

const HEAL_MOTES: ParticleStyle = {
  blend: "solid",
  from: new Color("#dcfce7"),
  to: new Color(HEAL_COLOR),
  brightness: 1,
  opacity: 0.95,
  size: [1.8, 0.5],
  life: [0.6, 1],
  speed: [1, 4],
  cone: 0.5,
  spread: 2.2,
  gravity: -9,
  drag: 1.5,
  stretch: 0,
  softness: 0.4,
};

const DEATH_DUST: ParticleStyle = {
  blend: "solid",
  from: new Color("#cbbfa8"),
  to: new Color("#8c8068"),
  brightness: 1,
  opacity: 0.45,
  size: [2.5, 7],
  life: [0.6, 1.2],
  speed: [3, 8],
  cone: 1.2,
  spread: 2,
  gravity: -1,
  drag: 2.5,
  stretch: 0,
  softness: 1,
};

const FLOAT_NUMBER_MILLISECONDS = 900;

const QUIET_OPACITY = 0.45;

const QUIET_PARTICLE_SHARE = 0.5;

const FLOAT_NUMBER_LIMIT = 3;

const FLOAT_BESIDE_PIXELS = 26;

const FLOAT_CHIP_PIXELS = 17;

const FLOAT_BADGE_PIXELS = 16;

const FLOAT_LIFT_PIXELS = 7;

const FOCUS_SLACK_UNITS = 3;

const FOCUS_SHRINK_RATIO = 0.6;

const HP_PER_SEGMENT = 250;

const RANGED_ATTACK_CELLS = 1.5;

const RANGE_RING_POINTS = 72;

const MAX_TARGET_LINES = 32;

const COMBO_CONDITION: Readonly<Record<ComboKind, ConditionKind>> = {
  overload: "staggered",
  shatter: "brittle",
  crush: "disoriented",
};

const IMPACT_COLOR = "#ff8a4c";

const SPIN_RADIANS_PER_SECOND = 16;

const HEX_PUFF_RADIUS = 6;

const WEAVER_FLARE_RADIUS = 9;

const HARVEST = "harvest";

const HARVEST_FLARE_RADIUS = 6;

const RISEN_RADIUS = 7;

const OMEN_ECHO = "ill-omen";

const DEATH_KNELL = "death-knell";

const KNELL_RADIUS = 14;

const DUSK_DASHES = new Set<string>([flickerStrike.id, thousandCuts.id]);

const DUSK_REAPPEAR_SECONDS = 0.3;

const DUSK_STRIKE_RAKE = 0.75;

const SHADE_RAKE = 0.45;

const AVATAR_SCALE = 1.45;

const MECH_SCALE = 1.3;

const COLOSSUS_SCALE = 1.6;

const GROW_SMOOTHING = 5;

const BLESSED_COLOR = "#ffd98a";

const SANCTIFY_COLOR = "#ffe39a";

const SANCTIFY_RADIUS = 7;

const SANCTIFY_MOTE_COUNT = 12;

const AURA_PULSE_SECONDS = 1.6;

const SPAWN_COLOR = "#9fe0d0";

const SPAWN_MOTES: ParticleStyle = {
  ...HEAL_MOTES,
  from: new Color("#ecfffa"),
  to: new Color(SPAWN_COLOR),
  spread: 3,
  speed: [2, 6],
};

const IMPACT_DUST: ParticleStyle = {
  ...DEATH_DUST,
  opacity: 0.4,
  cone: 1.35,
  spread: 1.5,
  life: [0.5, 1],
};

const ICE_SHATTER: ParticleStyle = {
  blend: "solid",
  from: new Color("#f2fdff"),
  to: new Color("#7fd3f0"),
  brightness: 1,
  opacity: 1,
  size: [1.6, 0.5],
  life: [0.35, 0.7],
  speed: [8, 18],
  cone: 1.2,
  spread: 1.6,
  gravity: 30,
  drag: 2.5,
  stretch: 0.03,
  softness: 0.2,
};

const FREEZE_MIST: ParticleStyle = {
  blend: "glow",
  from: new Color("#f2fdff"),
  to: new Color(FROST_COLOR),
  brightness: 1,
  opacity: 0.8,
  size: [2.2, 0.6],
  life: [0.4, 0.7],
  speed: [2, 6],
  cone: Math.PI,
  spread: 2.4,
  gravity: 2,
  drag: 2,
  stretch: 0,
  softness: 0.6,
};

function zoneColor(abilityId: string): string {
  switch (abilityId) {
    case "plague-bloom":
      return "#8fd14f";

    case "hallowed-path":
      return "#f2d27a";

    default:
      return IMPACT_COLOR;
  }
}

const BIG_HIT_FRACTION = 0.2;

const BIG_HEAL_FRACTION = 0.15;

interface Vanish {
  token: number;
  from: Vector3;
}

interface MarkedArea {
  marker: GroundMarker | null;
  seen: boolean;
}

interface UnitRecord {
  unitId: string;
  figure: HeroFigure;
  position: Vector3;
  destination: Vector3;
  yaw: number;
  state: UnitState;
  plate: HTMLElement;
  plateHp: HTMLElement;
  plateTrail: HealthTrail;
  plateShield: HTMLElement;
  plateMana: HTMLElement | null;
  plateStatus: HTMLElement;
  plateStacks: HTMLElement | null;
  plateChain: HTMLElement;
  conditionKey: string;
  statusKey: string;
  stacksKey: string;
  chainEndsAtTick: number;
  bubble: Mesh<SphereGeometry, MeshBasicMaterial>;
  frost: Mesh<RingGeometry, MeshBasicMaterial>;
  conditionRing: Mesh<RingGeometry, MeshBasicMaterial>;
  level: number;
  plateLevel: HTMLElement | null;
  aura: Mesh<RingGeometry, MeshBasicMaterial>;
  plateMeter: HTMLElement | null;
  leap: LeapFlight | null;
  formRing: Mesh<RingGeometry, MeshBasicMaterial>;
  ice: Mesh<BufferGeometry, MeshStandardMaterial>;
  plague: Mesh<RingGeometry, MeshBasicMaterial>;
  frozen: boolean;
  grow: number;
}

interface ShotOrigin {
  from: Vector3;
  abilityId: string;
  tick: number;
}

interface BurstCenter {
  center: Vector3;
  tick: number;
}

type CastEvent = Extract<BattleEvent, { kind: "cast" }>;

type StatusAppliedEvent = Extract<BattleEvent, { kind: "status-applied" }>;

interface LeapFlight {
  abilityId: string;
  from: Vector3;
  to: Vector3;
  age: number;
  seconds: number;
  height: number;
}

function angleToward(fromX: number, fromZ: number, toX: number, toZ: number): number {
  return Math.atan2(toX - fromX, toZ - fromZ);
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

function basicAttackRange(heroId: string): number {
  const hero = heroDefinition(heroId);

  return hero === undefined ? 0 : (abilityDefinition(hero.basicAttackId)?.range ?? 0);
}

export function snapshotGrid(snapshot: BattleSnapshot): BoardGrid {
  return {
    width: snapshot.arenaWidth,
    height: snapshot.arenaHeight,
    columns: snapshot.arenaColumns,
    rows: snapshot.arenaRows,
  };
}

function hpFraction(unit: UnitState): number {
  return Math.max(0, unit.hp / Math.max(1, unit.maxHp));
}

function forgetBefore<T extends { tick: number }>(entries: Map<number, T>, tick: number): void {
  for (const [key, entry] of entries) {
    if (entry.tick < tick) {
      entries.delete(key);
    }
  }
}

function hitKey(causeSequence: number, targetUnitId: string): string {
  return `${causeSequence}:${targetUnitId}`;
}

const CHAIN_HOLD_TICKS = Math.round(TICK_RATE * 1.5);

const CHAIN_FLOURISH_LINK = 5;

const PIP_LIMIT = 8;

function storePassive(unit: UnitState): Extract<PassiveDefinition, { kind: "damage-store" }> | null {
  for (const passive of unit.passives) {
    if (passive.kind === "damage-store") {
      return passive;
    }
  }

  return null;
}

function meterFraction(unit: UnitState): number | null {
  const store = storePassive(unit);

  if (store !== null) {
    return Math.min(1, (unit.memory.stored[store.key] ?? 0) / Math.max(1, unit.maxHp * store.capMaxHpFraction));
  }

  const stacks = stackPassive(unit);

  return stacks === null || stacks.max <= PIP_LIMIT ? null : Math.min(1, (unit.memory.stacks[stacks.key] ?? 0) / stacks.max);
}

function stackCharge(unit: UnitState): number {
  const stacks = stackPassive(unit);

  return stacks === null ? 0 : Math.min(1, (unit.memory.stacks[stacks.key] ?? 0) / stacks.max);
}

function stackPassive(unit: UnitState): Extract<PassiveDefinition, { kind: "stacks" }> | null {
  for (const passive of unit.passives) {
    if (passive.kind === "stacks") {
      return passive;
    }
  }

  return null;
}

function isHeroUnit(unit: UnitState): boolean {
  return heroDefinition(unit.heroId)?.summon !== true;
}

function unitLevel(unit: UnitState): number {
  return isHeroUnit(unit) ? heroLevel(unit.build, gameCatalogue) : 1;
}

function figureHeight(record: UnitRecord): number {
  return record.figure.height * levelFigureScale(record.level) * record.grow;
}

function quietParticles(particles: ParticleSystem): ParticleSystem {
  return {
    emit(style, origin, direction, count) {
      const hushed = { ...style, opacity: style.opacity * QUIET_OPACITY, brightness: Math.min(style.brightness, 1) };
      particles.emit(hushed, origin, direction, Math.ceil(count * QUIET_PARTICLE_SHARE));
    },

    clear: () => particles.clear(),
    update: (deltaSeconds) => particles.update(deltaSeconds),
    alive: () => particles.alive(),
    dispose: () => particles.dispose(),
  };
}

function materialsIn(root: Object3D): Material[] {
  const found = new Set<Material>();

  root.traverse((object) => {
    if (object instanceof Mesh || object instanceof Line) {
      for (const material of [object.material].flat()) {
        found.add(material);
      }
    }
  });

  return [...found];
}

function quieted(visual: SpellVisual): SpellVisual {
  const loud = new Map<Material, number>();

  return {
    root: visual.root,

    update(deltaSeconds) {
      for (const [material, opacity] of loud) {
        material.opacity = opacity;
      }

      visual.update(deltaSeconds);
      loud.clear();

      for (const material of materialsIn(visual.root)) {
        loud.set(material, material.opacity);
        material.opacity *= QUIET_OPACITY;
      }
    },

    finished: () => visual.finished(),
    dispose: () => visual.dispose(),
  };
}

function isRisen(unit: UnitState): boolean {
  return unit.summonerUnitId !== null && heroDefinition(unit.heroId)?.summon !== true;
}

function raisesCorpses(unit: UnitState): boolean {
  return unit.alive && Object.values(unit.abilities).some((ability) => ability.targetPolicy === "busiest-corpse" || ability.effects.some((effect) => effect.kind === "raise-army"));
}

function revivesCorpses(unit: UnitState): boolean {
  return unit.alive && Object.values(unit.abilities).some((ability) => ability.effects.some((effect) => effect.kind === "resurrect"));
}

function growTarget(unit: UnitState): number {
  if (!unit.alive) {
    return 1;
  }

  if (unit.heroId === boneGolem.id) {
    return COLOSSUS_SCALE;
  }

  if (unit.form?.definition.key === "mech") {
    return MECH_SCALE;
  }

  return unit.form?.definition.key === "avatar" ? AVATAR_SCALE : 1;
}

function overclockLevel(units: readonly UnitState[], unit: UnitState): number {
  const overclock = unit.alive ? overclockOf(units, unit) : null;

  return overclock === null ? 0 : overclockBonus(units, unit) / overclock.maxBonus;
}

interface FloatingNumber {
  element: HTMLElement;
  anchor: Vector3;
  offsetX: number;
}

interface PlateStatus {
  kind: string;
  buff: boolean;
  stacks: number;
}

const MODEL_SHOWN_CONTROLS: ReadonlySet<string> = new Set(["frozen", "hexed"]);

function plateStatuses(unit: UnitState): PlateStatus[] {
  if (!unit.alive) {
    return [];
  }

  const statuses: PlateStatus[] = [];

  if (unit.control !== null && !MODEL_SHOWN_CONTROLS.has(unit.control.control)) {
    statuses.push({ kind: unit.control.control, buff: false, stacks: 0 });
  }

  if (unit.taunt !== null) {
    statuses.push({ kind: "taunted", buff: false, stacks: 0 });
  }

  if (unit.invulnerableUntilTick !== 0) {
    statuses.push({ kind: "invulnerable", buff: true, stacks: 0 });
  }

  if (unit.untargetableUntilTick !== 0) {
    statuses.push({ kind: "untargetable", buff: true, stacks: 0 });
  }

  if (unit.link !== null) {
    statuses.push({ kind: unit.link.puppetUntilTick !== 0 ? "puppeted" : "linked", buff: false, stacks: 0 });
  }

  if (unit.graveMark !== null) {
    statuses.push({ kind: "grave-marked", buff: false, stacks: 0 });
  }

  for (const dot of unit.dots) {
    statuses.push({ kind: dot.dot, buff: false, stacks: dot.stacks });
  }

  if (unit.chill !== null) {
    statuses.push({ kind: "chill", buff: false, stacks: unit.chill.stacks });
  }

  return statuses;
}

function createPlate(unit: UnitState, isFriendly: boolean, showUnitId: boolean): HTMLElement {
  const plate = document.createElement("div");
  plate.className = `unit-plate ${isFriendly ? "is-friendly" : "is-enemy"}`;

  const maxHp = Math.max(1, unit.maxHp);
  const bar = document.createElement("div");
  bar.className = "unit-plate-bar";
  bar.style.setProperty("--segment", String(HP_PER_SEGMENT / maxHp));

  const trail = document.createElement("div");
  trail.className = "unit-plate-trail";

  const hp = document.createElement("div");
  hp.className = "unit-plate-hp";

  const shield = document.createElement("div");
  shield.className = "unit-plate-shield";

  bar.append(trail, hp, shield);

  const status = document.createElement("div");
  status.className = "unit-plate-status";

  const barRow = document.createElement("div");
  barRow.className = "unit-plate-bar-row";
  barRow.append(bar, status);

  if (isHeroUnit(unit)) {
    const level = unitLevel(unit);
    const badge = levelBadge(level, "unit-plate-level");
    badge.hidden = level <= 1;
    barRow.append(badge);
  }

  const chain = document.createElement("div");
  chain.className = "unit-plate-chain";
  chain.hidden = true;

  plate.append(chain, barRow);

  if (unit.maxMana > 0) {
    const mana = document.createElement("div");
    mana.className = "unit-plate-mana";
    const fill = document.createElement("div");
    fill.className = "unit-plate-mana-fill";
    mana.append(fill);
    plate.append(mana);
  }

  const passive = stackPassive(unit);
  const store = storePassive(unit);

  if (store !== null || (passive !== null && passive.max > PIP_LIMIT)) {
    const meter = document.createElement("div");
    meter.className = "unit-plate-meter";
    meter.dataset.passive = store?.key ?? passive?.key ?? "";
    const fill = document.createElement("div");
    fill.className = "unit-plate-meter-fill";
    meter.append(fill);
    plate.append(meter);
  } else if (passive !== null) {
    const stacks = document.createElement("div");
    stacks.className = "unit-plate-stacks";
    stacks.dataset.passive = passive.key;

    for (let index = 0; index < passive.max; index += 1) {
      const pip = document.createElement("span");
      pip.className = "unit-plate-stack";
      stacks.append(pip);
    }

    plate.append(stacks);
  }

  if (showUnitId) {
    const label = document.createElement("div");
    label.className = "unit-plate-label";
    label.textContent = unit.unitId;
    plate.append(label);
  }

  return plate;
}

export function createBattleView(stage: BoardStage, options: BattleViewOptions): BattleView {
  const records = new Map<string, UnitRecord>();
  const liveNumbers: FloatingNumber[] = [];
  const floatSides = new WeakMap<UnitRecord, number>();
  let focusArea: StageFocus | null = null;
  const effects = createBattleEffects(stage.scene, stage.particles);
  const chainTargets = new Map<number, string>();
  const bounceCounts = new Map<number, number>();
  const flightTimes = new Map<number, number>();

  const falling = createFallingTracker();
  const spellVisuals = new Set<SpellVisual>();
  const sanctuaries = new Map<string, TickedVisual>();
  const stateVisuals = new Map<string, TickedVisual | null>();
  const emitterMotions = new Map<string, EmitterMotion>();
  const emitterAbilities = new Map<number, string>();
  const shotOrigins = new Map<number, ShotOrigin>();
  const burstCenters = new Map<number, BurstCenter>();
  const pendingTrails = new Set<number>();
  const hexOrigins = new Map<number, string>();
  const omenOrigins = new Map<number, string>();
  const struckUnits = new Map<number, string>();
  const boundTo = new Map<string, number>();
  const knellSources = new Map<number, string>();
  const tolledAt = new Map<string, number>();
  const vanished = new Map<string, Vanish>();
  const shadeCasts = new Set<number>();
  const quietCasts = new Set<number>();
  const hushed = quietParticles(stage.particles);
  let vanishToken = 0;
  const fateThreads = createFateThreads(stage.particles);
  const hexCritters = createHexCritters(stage.particles);

  const iceGeometry = iceChunkGeometry();
  const bubbleGeometry = new SphereGeometry(6.4, 20, 14);
  const frostGeometry = new RingGeometry(4.9, 5.8, 32);
  const auraGeometry = new RingGeometry(3.6, 6.4, 40);
  let auraClock = 0;
  const selectionGeometry = new RingGeometry(5.2, 6.1, 40);

  const selectionRing = new Mesh(
    selectionGeometry,
    new MeshBasicMaterial({ color: SELECTION_COLOR, transparent: true, opacity: 0.95, depthWrite: false }),
  );

  selectionRing.rotation.x = -Math.PI / 2;
  selectionRing.visible = false;

  const rangeRing = new LineLoop(
    new BufferGeometry(),
    new LineDashedMaterial({ color: SELECTION_COLOR, dashSize: 1.6, gapSize: 1.2, transparent: true, opacity: 0.7 }),
  );

  rangeRing.visible = false;

  const targetLineGeometry = new BufferGeometry();
  const targetLinePositions = new Float32BufferAttribute(new Float32Array(MAX_TARGET_LINES * 6), 3);
  targetLinePositions.setUsage(DynamicDrawUsage);
  targetLineGeometry.setAttribute("position", targetLinePositions);

  const targetLines = new LineSegments(
    targetLineGeometry,
    new LineDashedMaterial({ color: "#ffffff", dashSize: 1.2, gapSize: 1, transparent: true, opacity: 0.35 }),
  );

  stage.scene.add(selectionRing, rangeRing, targetLines, fateThreads.root, hexCritters.root);

  let snapshot: BattleSnapshot | null = null;
  const groundMarkers = new Map<string, MarkedArea>();
  let selectedUnitId: string | null = null;
  let rangeRingRadius = -1;
  let lastTick = -1;
  let selfRevivals = new Map<string, number>();
  let stunningHits = new Map<string, number>();

  function chestOf(record: UnitRecord): Vector3 {
    return record.position.clone().setY(figureHeight(record) * CHEST_FRACTION);
  }

  function showSpell(visual: SpellVisual): void {
    stage.scene.add(visual.root);
    spellVisuals.add(visual);
    visual.update(0);
  }

  function syncStateVisual(key: string, tick: number, seen: Set<string>, create: () => TickedVisual | null): void {
    seen.add(key);
    let visual = stateVisuals.get(key);

    if (visual === undefined) {
      visual = create();
      stateVisuals.set(key, visual);

      if (visual !== null) {
        stage.scene.add(visual.root);
      }
    }

    visual?.sync(tick);
  }

  function stepSpells(deltaSeconds: number): void {
    for (const [unitId, dome] of sanctuaries) {
      const record = records.get(unitId);

      if (record === undefined || !record.state.alive || record.state.invulnerableUntilTick === 0) {
        dome.end();
        sanctuaries.delete(unitId);
      } else {
        dome.root.position.set(record.position.x, 0, record.position.z);
      }
    }

    for (const visual of stateVisuals.values()) {
      visual?.update(deltaSeconds);
    }

    for (const visual of spellVisuals) {
      visual.update(deltaSeconds);

      if (visual.finished()) {
        spellVisuals.delete(visual);
        visual.dispose();
      }
    }
  }

  function areaRadius(record: UnitRecord, abilityId: string): number {
    const area = (record.state.abilities[abilityId] ?? abilityDefinition(abilityId))?.area;

    return area?.kind === "circle" ? area.radiusUnits : 0;
  }

  function castCenter(record: UnitRecord, event: CastEvent): Vector3 {
    const area = record.state.abilities[event.abilityId]?.area;
    const target = records.get(event.targetUnitId);

    return area?.kind === "circle" && area.center === "target" && target !== undefined ? target.destination.clone() : record.position.clone();
  }

  function plateEdgePixels(record: UnitRecord, side: number): number {
    if (side > 0) {
      return record.plateStatus.childElementCount * FLOAT_CHIP_PIXELS;
    }

    return record.plateLevel === null || record.plateLevel.hidden ? 0 : FLOAT_BADGE_PIXELS;
  }

  function floatSide(record: UnitRecord, sourceUnitId: string | null): number {
    const source = sourceUnitId === null ? undefined : records.get(sourceUnitId);
    const from = source === undefined || source === record ? null : stage.toScreen(source.position);
    const at = stage.toScreen(record.position);

    if (from !== null && at !== null && Math.abs(at.x - from.x) >= 1) {
      return at.x > from.x ? 1 : -1;
    }

    const side = -(floatSides.get(record) ?? -1);
    floatSides.set(record, side);

    return side;
  }

  function placeNumber(number: FloatingNumber): void {
    const point = stage.toScreen(number.anchor);

    if (point !== null) {
      number.element.style.left = `${point.x + number.offsetX}px`;
      number.element.style.top = `${point.y - FLOAT_LIFT_PIXELS}px`;
    }
  }

  function floatNumber(record: UnitRecord, text: string, kind: string, sourceUnitId: string | null): HTMLElement | null {
    const anchor = record.position.clone().setY(figureHeight(record) + PLATE_GAP_UNITS);

    if (stage.toScreen(anchor) === null) {
      return null;
    }

    const side = floatSide(record, sourceUnitId);
    const element = document.createElement("div");
    element.className = `float-number is-${kind}`;
    element.textContent = text;
    element.style.setProperty("--side", String(side));
    const number = { element, anchor, offsetX: side * (FLOAT_BESIDE_PIXELS + plateEdgePixels(record, side)) };
    placeNumber(number);
    stage.overlay.append(element);
    liveNumbers.push(number);

    while (liveNumbers.length > FLOAT_NUMBER_LIMIT) {
      liveNumbers.shift()?.element.remove();
    }

    window.setTimeout(() => {
      element.remove();
      const index = liveNumbers.indexOf(number);

      if (index >= 0) {
        liveNumbers.splice(index, 1);
      }
    }, FLOAT_NUMBER_MILLISECONDS);

    return element;
  }

  function sprayHit(event: DamageDealtEvent, record: UnitRecord, heavy: boolean): void {
    const source = records.get(event.sourceUnitId);
    const heading = source === undefined ? new Vector3() : record.position.clone().sub(source.position).setY(0);

    if (heading.lengthSq() > 0.01) {
      heading.normalize();
    }

    heading.y += SPRAY_LIFT;
    emitHit(stage.particles, hitKind(event.abilityId), chestOf(record), heading.normalize(), heavy);
  }

  function landHit(event: DamageDealtEvent, stuns: boolean): void {
    const record = records.get(event.targetUnitId);

    if (record === undefined) {
      return;
    }

    const total = event.amount + event.shieldAbsorbed;
    const big = total >= record.state.maxHp * BIG_HIT_FRACTION;

    if (event.abilityId === PLAGUE_BURST) {
      if (total > 0) {
        record.figure.trigger("hit");
        sprayHit(event, record, true);
        const callout = floatNumber(record, String(total), "burst", event.sourceUnitId);

        if (callout !== null) {
          callout.dataset.label = "Burst";
        }
      }

      return;
    }

    if (event.dot === undefined) {
      record.figure.trigger("hit");
      sprayHit(event, record, big || event.crit === true);
      playHit(event, big, panOf(record));
      const touch = hitVisual(stage.particles, event.abilityId, record.position.clone(), chestOf(record));

      if (touch !== null) {
        showSpell(touch);
      }
    }

    if (event.dot === undefined && stuns) {
      playStun(panOf(record));
    }

    if (event.combo !== undefined) {
      const callout = floatNumber(record, total > 0 ? String(total) : "", "combo", event.sourceUnitId);

      if (callout !== null) {
        callout.dataset.condition = COMBO_CONDITION[event.combo];
        callout.dataset.label = comboName(event.combo);
      }

      return;
    }

    if (event.dot !== undefined || total <= 0) {
      return;
    }

    if (event.abilityId === voidheartBlast.id) {
      const callout = floatNumber(record, String(total), "voidheart", event.sourceUnitId);

      if (callout !== null) {
        callout.dataset.label = voidheartBlast.name;
      }
    } else if (event.crit === true) {
      floatNumber(record, String(total), big ? "crit is-huge" : "crit", event.sourceUnitId);
    } else if (big && record.state.summonerUnitId === null) {
      floatNumber(record, String(total), "big", event.sourceUnitId);
    }
  }

  function comboBurst(targetId: string, combo: ComboKind): void {
    const record = records.get(targetId);

    if (record !== undefined) {
      effects.comboBurst(record.position, chestOf(record), COMBO_CONDITION[combo]);
    }
  }

  function projectile(sourceId: string, targetId: string, abilityId: string, land: () => void, delaySeconds = 0, origin: Vector3 | null = null): number {
    const source = records.get(sourceId);
    const target = records.get(targetId);

    if (source === undefined || target === undefined) {
      land();

      return 0;
    }

    return effects.projectile(
      abilityId,
      origin ?? source.figure.castOrigin(new Vector3()),
      () => chestOf(target),
      land,
      delaySeconds,
      () => origin ?? chestOf(source),
    );
  }

  function arc(fromId: string, toId: string, abilityId: string, land: () => void): void {
    const from = records.get(fromId);
    const to = records.get(toId);

    if (from === undefined || to === undefined) {
      land();

      return;
    }

    effects.arc(chestOf(from), chestOf(to), abilityId, land);
  }

  function healBurst(record: UnitRecord, amount: number): void {
    stage.particles.emit(HEAL_MOTES, record.position.clone().setY(HEAL_MOTE_HEIGHT), UP, HEAL_MOTE_COUNT);

    if (amount >= record.state.maxHp * BIG_HEAL_FRACTION) {
      floatNumber(record, `+${amount}`, "heal", null);
    }
  }

  function panOf(record: UnitRecord): number | undefined {
    return stage.screenPan(record.position);
  }

  function sourceOf(record: UnitRecord): SoundSource {
    return { heroId: record.state.heroId, friendly: record.state.teamId === options.friendlyTeamId, risen: isRisen(record.state) };
  }

  function upgradesOf(unitId: string): string[] {
    return records.get(unitId)?.state.build.upgrades.map((upgrade) => upgrade.upgradeId) ?? [];
  }

  function selfRevivalsIn(events: readonly BattleEvent[]): Map<string, number> {
    const found = new Map<string, number>();

    for (const event of events) {
      if (event.kind === "revived" && event.sourceUnitId === event.unitId) {
        found.set(event.unitId, event.tick);
      }
    }

    return found;
  }

  function stunningHitsIn(events: readonly BattleEvent[]): Map<string, number> {
    const stuns = new Set<string>();
    const carriers = new Map<string, number>();

    for (const event of events) {
      if (event.kind === "status-applied" && event.status === "stunned") {
        stuns.add(hitKey(event.causeSequence, event.targetUnitId));
      }
    }

    for (const event of events) {
      const key = event.kind === "damage-dealt" && event.dot === undefined ? hitKey(event.causeSequence, event.targetUnitId) : null;

      if (key !== null && stuns.has(key) && !carriers.has(key)) {
        carriers.set(key, event.sequence);
      }
    }

    return carriers;
  }

  function isRangedAbility(abilityId: string): boolean {
    const ability = abilityDefinition(abilityId);
    const grid = snapshot === null ? null : snapshotGrid(snapshot);
    const cell = grid === null ? 10 : grid.width / grid.columns;

    return (
      ability !== undefined &&
      ability.dash === undefined &&
      ability.blinkBehindTarget !== true &&
      ability.targetPolicy !== "busiest-corpse" &&
      ability.range > cell * RANGED_ATTACK_CELLS
    );
  }

  function flyShot(event: DamageDealtEvent, shot: ShotOrigin, land: () => void): void {
    const target = records.get(event.targetUnitId);
    const from = target === undefined ? shot.from : emitterShotOrigin(shot.abilityId, shot.from, target.destination);
    projectile(event.sourceUnitId, event.targetUnitId, event.abilityId, land, 0, from);
  }

  function spreadGlob(event: StatusAppliedEvent): void {
    const burst = burstCenters.get(event.causeSequence);
    const target = records.get(event.targetUnitId);

    if (burst === undefined || target === undefined) {
      return;
    }

    if (Math.hypot(target.destination.x - burst.center.x, target.destination.z - burst.center.z) < BURST_TARGET_UNITS) {
      return;
    }

    projectile(event.sourceUnitId, event.targetUnitId, PLAGUE_BURST, () => {}, 0, burst.center.clone().setY(GLOB_LAUNCH_HEIGHT));
  }

  function taint(event: StatusAppliedEvent): void {
    const target = records.get(event.targetUnitId);
    const source = records.get(event.sourceUnitId);

    if (target === undefined || source === undefined) {
      return;
    }

    const distance = Math.hypot(target.position.x - source.position.x, target.position.z - source.position.z);

    effects.delay(waveArrivalSeconds(distance, areaRadius(source, pandemicSpell.id)), () => {
      showSpell(infectionVisual(stage.particles, target.position.clone().setY(0), chestOf(target)));
    });
  }

  function allyHop(causeSequence: number, targetUnitId: string, abilityId: string, land: () => void): void {
    const previousTarget = abilityDefinition(abilityId)?.bounces === undefined ? undefined : chainTargets.get(causeSequence);

    if (previousTarget === undefined) {
      land();

      return;
    }

    const bounce = bounceCounts.get(causeSequence) ?? 0;
    chainTargets.set(causeSequence, targetUnitId);
    bounceCounts.set(causeSequence, bounce + 1);
    projectile(previousTarget, targetUnitId, abilityId, land, PROJECTILE_SECONDS * (bounce + 1));
  }

  function hexed(event: StatusAppliedEvent): void {
    const first = hexOrigins.get(event.causeSequence);

    const land = (): void => {
      const record = records.get(event.targetUnitId);
      const visual = record === undefined ? null : landingVisual(stage.particles, hexSpell.id, record.position.clone(), HEX_PUFF_RADIUS);

      if (visual !== null) {
        showSpell(visual);
      }

      if (record !== undefined) {
        playLanding(hexSpell.id, upgradesOf(event.sourceUnitId), panOf(record));
      }

      hexCritters.transform(event.targetUnitId, HEX_POP_SECONDS);
    };

    if (first === undefined || first === event.targetUnitId) {
      hexOrigins.set(event.causeSequence, event.targetUnitId);
      land();

      return;
    }

    projectile(first, event.targetUnitId, hexSpell.id, land);
  }

  function stepThreads(deltaSeconds: number): void {
    const ties: Tie[] = [];

    for (const record of records.values()) {
      const link = record.state.link;

      if (record.state.alive && link !== null) {
        boundTo.set(record.unitId, link.linkId);
        ties.push({ linkId: link.linkId, unitId: record.unitId, chest: chestOf(record), crown: record.position.clone().setY(figureHeight(record)), puppet: link.puppetUntilTick !== 0 });
      }
    }

    fateThreads.update(ties, deltaSeconds);
  }

  function stepCritters(deltaSeconds: number): void {
    const hexed: HexedUnit[] = [];

    for (const record of records.values()) {
      if (record.state.alive && record.state.control?.control === "hexed") {
        const teamColor = record.state.teamId === options.friendlyTeamId ? FRIENDLY_COLOR : ENEMY_COLOR;
        hexed.push({ unitId: record.unitId, position: record.position, yaw: record.yaw, teamColor });
      }
    }

    hexCritters.update(hexed, deltaSeconds);
  }

  function sanctify(event: StatusAppliedEvent): void {
    const record = records.get(event.targetUnitId);

    if (record === undefined) {
      return;
    }

    if (records.get(event.sourceUnitId)?.state.heroId !== oathkeeper.id) {
      effects.impactFlash(record.position, SANCTIFY_RADIUS, SANCTIFY_COLOR);
      stage.particles.emit(HEAL_MOTES, chestOf(record), UP, SANCTIFY_MOTE_COUNT);

      return;
    }

    sanctuaries.get(event.targetUnitId)?.end();
    const dome = sanctuaryVisual(stage.particles, record.position.clone(), figureHeight(record));
    sanctuaries.set(event.targetUnitId, dome);
    showSpell(dome);
  }

  function isTrail(unitId: string, abilityId: string): boolean {
    return Object.values(records.get(unitId)?.state.abilities ?? {}).some((ability) => ability.bounces?.trail === abilityId);
  }

  function trailDelaysIn(events: readonly BattleEvent[]): Map<number, number> {
    const delays = new Map<number, number>();
    const hops = new Map<number, string[]>();
    const landings = new Map<string, number>();

    for (const event of events) {
      if ((event.kind === "damage-dealt" || event.kind === "healing-done") && abilityDefinition(event.abilityId)?.bounces !== undefined) {
        const path = hops.get(event.causeSequence) ?? [];

        if (path[path.length - 1] !== event.targetUnitId) {
          path.push(event.targetUnitId);
        }

        hops.set(event.causeSequence, path);
        landings.set(event.sourceUnitId, PROJECTILE_SECONDS * path.length);
      }

      const landing = event.kind === "zone-created" && isTrail(event.sourceUnitId, event.abilityId) ? landings.get(event.sourceUnitId) : undefined;

      if (event.kind === "zone-created" && landing !== undefined) {
        delays.set(event.zoneId, landing);
      }
    }

    return delays;
  }

  function holdTrails(events: readonly BattleEvent[]): void {
    for (const [zoneId, seconds] of trailDelaysIn(events)) {
      pendingTrails.add(zoneId);
      effects.delay(seconds, () => pendingTrails.delete(zoneId));
    }
  }

  function handleEvent(event: BattleEvent): void {
    if (event.kind === "cast") {
      const record = records.get(event.sourceUnitId);

      if (record === undefined) {
        return;
      }

      record.figure.trigger(event.isBasicAttack ? "attack" : "cast");
      playCast(event, sourceOf(record), panOf(record));

      if (event.repeat === "clone") {
        shadeCasts.add(event.sequence);
      }

      const quiet = event.triggered === true || event.repeat !== undefined;

      if (quiet) {
        quietCasts.add(event.sequence);
      }

      if (event.chainLink !== undefined && event.chainLink >= 2) {
        showChain(record, event.chainLink, event.tick);
      }

      if (isRangedAbility(event.abilityId)) {
        emitRelease(quiet ? hushed : stage.particles, hitKind(event.abilityId), record.figure.castOrigin(new Vector3()));
      }

      const particles = quiet ? hushed : stage.particles;
      const flourish = castVisual(particles, event.abilityId, castCenter(record, event), areaRadius(record, event.abilityId), record.figure.castOrigin(new Vector3()));

      if (flourish !== null) {
        showSpell(quiet ? quieted(flourish) : flourish);
      }

      return;
    }

    if (event.kind === "combo-detonated") {
      const target = records.get(event.targetUnitId);

      const pop = (): void => {
        comboBurst(event.targetUnitId, event.combo);
        const pan = target === undefined ? undefined : panOf(target);

        if (event.echo === true) {
          playOmenEcho(pan);
        } else {
          playCombo(event.combo, pan);
        }
      };

      const origin = event.echo === true ? omenOrigins.get(event.causeSequence) : undefined;

      if (origin === undefined) {
        omenOrigins.set(event.causeSequence, event.targetUnitId);
        pop();
      } else {
        projectile(origin, event.targetUnitId, OMEN_ECHO, pop);
      }

      return;
    }

    if (event.kind === "unit-spawned") {
      const center = stage.toScene(event.position, 0);

      if (event.corpseUnitId === undefined) {
        const drop = spawnVisual(stage.particles, event.heroId, center, SPAWN_RADIUS);

        if (drop === null) {
          effects.impactFlash(center, SPAWN_RADIUS, SPAWN_COLOR);
          stage.particles.emit(SPAWN_MOTES, center.clone().setY(1), UP, SPAWN_MOTE_COUNT);
        } else {
          showSpell(drop);
        }

        playSpawn(event.heroId, stage.screenPan(center));
      } else {
        showSpell(risenVisual(stage.particles, center, RISEN_RADIUS));
        playRise(stage.screenPan(center));
      }

      return;
    }

    if (event.kind === "unit-dismissed") {
      const record = records.get(event.unitId);

      if (record !== undefined && record.state.expiresAtTick > 0 && event.tick >= record.state.expiresAtTick) {
        playCrumble(panOf(record));
      }

      return;
    }

    if (event.kind === "impact-landed") {
      const center = stage.toScene(event.center, 0);
      playLanding(event.abilityId, upgradesOf(event.sourceUnitId), stage.screenPan(center));
      const landing = landingVisual(stage.particles, event.abilityId, center, event.radiusUnits);

      if (event.abilityId === PLAGUE_BURST) {
        burstCenters.set(event.sequence, { center, tick: event.tick });
      }

      if (landing === null) {
        effects.impactFlash(center, event.radiusUnits, IMPACT_COLOR);
        stage.particles.emit(IMPACT_DUST, center, UP, Math.round(event.radiusUnits * IMPACT_DUST_PER_UNIT));
      } else {
        showSpell(landing);
      }

      return;
    }

    if (event.kind === "damage-dealt") {
      const stuns = stunningHits.get(hitKey(event.causeSequence, event.targetUnitId)) === event.sequence;
      const land = (): void => landHit(event, stuns);
      const leap = leapArc(event.abilityId);

      if (event.abilityId === sharedFate.id && event.reaction === true) {
        shareAlongThread(event, land);

        return;
      }

      if (event.abilityId === DEATH_KNELL) {
        tollKnell(event, land);

        return;
      }

      if ((DUSK_DASHES.has(event.abilityId) || event.abilityId === duskStrike.id) && event.reaction !== true && event.dot === undefined) {
        duskHit(event);
      }

      struckUnits.set(event.causeSequence, event.targetUnitId);

      if (leap !== null && event.reaction !== true) {
        effects.delay(leap.seconds, land);

        return;
      }

      if (event.dot !== undefined || event.reaction === true || !isRangedAbility(event.abilityId)) {
        land();

        return;
      }

      const shot = shotOrigins.get(event.causeSequence);

      if (shot !== undefined) {
        flyShot(event, shot, land);

        return;
      }

      const previousTarget = chainTargets.get(event.causeSequence);
      chainTargets.set(event.causeSequence, event.targetUnitId);

      const blast = abilityDefinition(event.abilityId)?.area;

      if (previousTarget === undefined) {
        bounceCounts.set(event.causeSequence, 0);
        const target = records.get(event.targetUnitId);

        const landing = (): void => {
          land();

          if (blast?.kind === "circle" && target !== undefined) {
            const quiet = quietCasts.has(event.causeSequence);
            const visual = landingVisual(quiet ? hushed : stage.particles, event.abilityId, target.position.clone(), blast.radiusUnits);

            if (visual !== null) {
              showSpell(quiet ? quieted(visual) : visual);
            }
          }
        };

        flightTimes.set(event.causeSequence, projectile(event.sourceUnitId, event.targetUnitId, event.abilityId, landing, releaseDelay(event.abilityId)));
      } else if (blast !== undefined && abilityDefinition(event.abilityId)?.bounces === undefined) {
        effects.delay(flightTimes.get(event.causeSequence) ?? PROJECTILE_SECONDS, land);
      } else if (abilityDefinition(event.abilityId)?.bounces !== undefined) {
        const bounce = bounceCounts.get(event.causeSequence) ?? 0;

        if (previousTarget === event.targetUnitId) {
          effects.delay(PROJECTILE_SECONDS * (bounce + 1), land);
        } else {
          bounceCounts.set(event.causeSequence, bounce + 1);
          projectile(previousTarget, event.targetUnitId, event.abilityId, land, PROJECTILE_SECONDS * (bounce + 1));
        }
      } else {
        effects.delay(flightTimes.get(event.causeSequence) ?? PROJECTILE_SECONDS, () => arc(previousTarget, event.targetUnitId, event.abilityId, land));
      }

      return;
    }

    if (event.kind === "healing-done") {
      const record = records.get(event.targetUnitId);

      if (record !== undefined) {
        allyHop(event.causeSequence, event.targetUnitId, event.abilityId, () => {
          healBurst(record, event.amount);
          playHeal(event.abilityId, panOf(record));
          const bloom = mendVisual(stage.particles, event.abilityId, record.position.clone(), chestOf(record));

          if (bloom !== null) {
            showSpell(bloom);
          }
        });
      }

      return;
    }

    if (event.kind === "shield-applied") {
      const record = records.get(event.targetUnitId);

      if (record !== undefined) {
        allyHop(event.causeSequence, event.targetUnitId, event.abilityId, () => playShield(event.abilityId, panOf(record)));
      }

      return;
    }

    if (event.kind === "status-applied") {
      if (event.status === "poison") {
        spreadGlob(event);

        return;
      }

      if (event.status === "invulnerable") {
        sanctify(event);

        return;
      }

      if (event.status === "pandemic") {
        taint(event);

        return;
      }

      if (event.status === "hexed") {
        hexed(event);

        return;
      }

      if (event.status === "puppeted") {
        const record = records.get(event.targetUnitId);

        if (record !== undefined) {
          playPuppet(panOf(record));
        }

        return;
      }

      if (event.status === "stunned") {
        const record = records.get(event.targetUnitId);

        if (record !== undefined && !stunningHits.has(hitKey(event.causeSequence, event.targetUnitId))) {
          playStun(panOf(record));
        }

        return;
      }

      if (event.status !== "form") {
        return;
      }

      const record = records.get(event.targetUnitId);
      const key = record?.state.form?.definition.key;
      const visual = record === undefined || key === undefined ? null : formVisual(stage.particles, key, record.position.clone(), FORM_BURST_RADIUS);

      if (visual !== null) {
        showSpell(visual);
      }

      if (record !== undefined && key !== undefined && selfRevivals.get(event.targetUnitId) !== event.tick) {
        playForm(key, panOf(record));
      }

      return;
    }

    if (event.kind === "revived" && event.sourceUnitId === event.unitId) {
      const record = records.get(event.unitId);

      if (record !== undefined) {
        playRevive(upgradesOf(event.unitId), panOf(record));
      }

      return;
    }

    if (event.kind === "emitter-started") {
      emitterAbilities.set(event.emitterId, event.abilityId);
      playEmitter(event.abilityId, stage.screenPan(stage.toScene(event.from, 0)));

      return;
    }

    if (event.kind === "zone-created") {
      playZone(event.abilityId, stage.screenPan(stage.toScene(event.center, 0)));

      return;
    }

    if (event.kind === "hp-paid") {
      const record = records.get(event.unitId);

      if (record !== undefined) {
        playPayment(event.reason, panOf(record));
      }

      return;
    }

    if (event.kind === "emitter-fired") {
      shotOrigins.set(event.sequence, {
        from: stage.toScene(event.from, 0),
        abilityId: emitterAbilities.get(event.emitterId) ?? event.abilityId,
        tick: event.tick,
      });

      return;
    }

    if (event.kind === "passive-triggered" && event.passive === HARVEST && event.targetUnitId !== undefined) {
      const harvester = records.get(event.unitId);

      if (harvester !== undefined) {
        playPassive(event.passive, panOf(harvester));
        projectile(event.targetUnitId, event.unitId, HARVEST, () => {
          const flare = passiveVisual(stage.particles, HARVEST, harvester.position.clone(), HARVEST_FLARE_RADIUS);

          if (flare !== null) {
            showSpell(flare);
          }
        });
      }

      return;
    }

    if (event.kind === "passive-triggered") {
      const record = (event.targetUnitId === undefined ? undefined : records.get(event.targetUnitId)) ?? records.get(event.unitId);

      if (record !== undefined) {
        playPassive(event.passive, panOf(record));
        const flare = passiveVisual(stage.particles, event.passive, record.position.clone(), WEAVER_FLARE_RADIUS);

        if (flare !== null) {
          showSpell(flare);
        }
      }

      return;
    }

    if (event.kind === "death") {
      const record = records.get(event.unitId);

      if (record !== undefined) {
        record.figure.setDead(true);
        stage.particles.emit(DEATH_DUST, record.position.clone().setY(0.6), UP, DEATH_DUST_COUNT);
        playDeath(sourceOf(record), panOf(record));
      }

      const linkId = boundTo.get(event.unitId);

      if (linkId !== undefined) {
        knellSources.set(linkId, event.unitId);
      }
    }
  }

  function shareAlongThread(event: DamageDealtEvent, land: () => void): void {
    const struck = struckUnits.get(event.causeSequence);
    const origin = struck === undefined ? undefined : records.get(struck);

    if (struck === undefined || origin === undefined || struck === event.targetUnitId) {
      land();

      return;
    }

    projectile(struck, event.targetUnitId, sharedFate.id, land, flightTimes.get(event.causeSequence) ?? 0, chestOf(origin));
  }

  function reappearLater(record: UnitRecord, seconds: number): void {
    vanishToken += 1;
    const token = vanishToken;
    const entry = vanished.get(record.unitId);

    if (entry !== undefined) {
      entry.token = token;
    }

    effects.delay(seconds, () => {
      if (vanished.get(record.unitId)?.token !== token) {
        return;
      }

      vanished.delete(record.unitId);
      record.figure.root.visible = true;
      duskPuff(stage.particles, chestOf(record), 0.8);
    });
  }

  function vanish(record: UnitRecord): void {
    duskPuff(stage.particles, chestOf(record), 1);
    record.figure.root.visible = false;
    vanished.set(record.unitId, { token: 0, from: chestOf(record) });
    reappearLater(record, DUSK_REAPPEAR_SECONDS * 2);
  }

  function vanishDashers(events: readonly BattleEvent[]): void {
    for (const event of events) {
      const dashes = event.kind === "cast" && event.repeat !== "clone" && DUSK_DASHES.has(event.abilityId);
      const record = dashes ? records.get(event.sourceUnitId) : undefined;

      if (record !== undefined) {
        vanish(record);
      }
    }
  }

  function duskHit(event: DamageDealtEvent): void {
    const target = records.get(event.targetUnitId);

    if (target === undefined) {
      return;
    }

    const shade = shadeCasts.has(event.causeSequence);
    const quiet = quietCasts.has(event.causeSequence);
    const strength = shade ? SHADE_RAKE : event.abilityId === duskStrike.id ? DUSK_STRIKE_RAKE : event.crit === true ? 1.3 : 1;
    const rake = clawRake(quiet ? hushed : stage.particles, chestOf(target), strength);
    showSpell(quiet ? quieted(rake) : rake);
    const source = records.get(event.sourceUnitId);

    if (source !== undefined && shade) {
      showSpell(shadeStrike(stage.particles, source.position, target.position, strength));
    }

    const entry = shade ? undefined : vanished.get(event.sourceUnitId);

    if (source === undefined || entry === undefined) {
      return;
    }

    showSpell(shadowStrike(stage.particles, entry.from, target.position, strength));
    showSpell(duskStreak(stage.particles, entry.from, chestOf(target)));
    entry.from = chestOf(target);
    reappearLater(source, DUSK_REAPPEAR_SECONDS);
  }

  function tollKnell(event: DamageDealtEvent, land: () => void): void {
    const linkId = boundTo.get(event.targetUnitId);
    const fallen = linkId === undefined ? undefined : knellSources.get(linkId);
    const source = fallen === undefined ? undefined : records.get(fallen);

    if (fallen === undefined || source === undefined) {
      land();

      return;
    }

    if (tolledAt.get(fallen) !== event.tick) {
      tolledAt.set(fallen, event.tick);
      showSpell(deathKnell(stage.particles, source.position.clone(), KNELL_RADIUS));
    }

    projectile(fallen, event.targetUnitId, DEATH_KNELL, land, KNELL_TOLL_SECONDS, source.position.clone().setY(KNELL_HEIGHT));
  }

  function createRecord(unit: UnitState): UnitRecord {
    const isFriendly = unit.teamId === options.friendlyTeamId;
    const figure = createHeroFigure(unit.heroId);
    figure.setTeamColor(isFriendly ? FRIENDLY_COLOR : ENEMY_COLOR);
    stage.scene.add(figure.root);

    const bubble = new Mesh(
      bubbleGeometry,
      new MeshBasicMaterial({ color: SHIELD_COLOR, transparent: true, opacity: 0.22, depthWrite: false }),
    );

    bubble.visible = false;

    const frost = new Mesh(
      frostGeometry,
      new MeshBasicMaterial({ color: FROST_COLOR, transparent: true, opacity: 0.45, depthWrite: false }),
    );

    frost.rotation.x = -Math.PI / 2;
    frost.visible = false;

    const conditionRing = new Mesh(
      frostGeometry,
      new MeshBasicMaterial({ color: "#ffffff", transparent: true, opacity: 0.7, blending: AdditiveBlending, depthWrite: false }),
    );

    conditionRing.rotation.x = -Math.PI / 2;
    conditionRing.visible = false;

    const aura = new Mesh(
      auraGeometry,
      new MeshBasicMaterial({ color: AURA_COLOR, transparent: true, opacity: 0, blending: AdditiveBlending, depthWrite: false }),
    );

    aura.rotation.x = -Math.PI / 2;
    aura.visible = false;

    const formRing = new Mesh(
      frostGeometry,
      new MeshBasicMaterial({ color: FORM_COLOR, transparent: true, opacity: 0.6, blending: AdditiveBlending, depthWrite: false }),
    );

    formRing.rotation.x = -Math.PI / 2;
    formRing.visible = false;

    const ice = new Mesh(
      iceGeometry,
      new MeshStandardMaterial({
        color: ICE_BLOCK_COLOR,
        emissive: ICE_BLOCK_GLOW,
        emissiveIntensity: 0.35,
        roughness: 0.15,
        metalness: 0.05,
        flatShading: true,
        transparent: true,
        opacity: 0.55,
        depthWrite: false,
      }),
    );

    ice.visible = false;

    const plague = new Mesh(
      frostGeometry,
      new MeshBasicMaterial({ color: PLAGUE_COLOR, transparent: true, opacity: 0.5, blending: AdditiveBlending, depthWrite: false }),
    );

    plague.rotation.x = -Math.PI / 2;
    plague.visible = false;
    stage.scene.add(bubble, frost, conditionRing, aura, formRing, ice, plague);

    const plate = createPlate(unit, isFriendly, options.showUnitIds);
    stage.overlay.append(plate);

    const position = stage.toScene(unit.position, 0);
    const initialYaw = options.viewSide === "south" ? Math.PI : 0;
    const facingYaw = isFriendly ? initialYaw : initialYaw + Math.PI;

    return {
      unitId: unit.unitId,
      figure,
      position,
      destination: position.clone(),
      yaw: facingYaw,
      state: unit,
      plate,
      plateHp: plate.querySelector<HTMLElement>(".unit-plate-hp")!,
      plateTrail: createHealthTrail(plate.querySelector<HTMLElement>(".unit-plate-trail")!, hpFraction(unit)),
      plateShield: plate.querySelector<HTMLElement>(".unit-plate-shield")!,
      plateMana: plate.querySelector<HTMLElement>(".unit-plate-mana-fill"),
      plateStatus: plate.querySelector<HTMLElement>(".unit-plate-status")!,
      plateStacks: plate.querySelector<HTMLElement>(".unit-plate-stacks"),
      plateChain: plate.querySelector<HTMLElement>(".unit-plate-chain")!,
      conditionKey: "",
      statusKey: "",
      stacksKey: "",
      chainEndsAtTick: 0,
      bubble,
      frost,
      conditionRing,
      level: unitLevel(unit),
      plateLevel: plate.querySelector<HTMLElement>(".unit-plate-level"),
      aura,
      plateMeter: plate.querySelector<HTMLElement>(".unit-plate-meter-fill"),
      leap: null,
      formRing,
      ice,
      plague,
      frozen: false,
      grow: growTarget(unit),
    };
  }

  function syncLevel(record: UnitRecord, unit: UnitState): void {
    const level = unitLevel(unit);

    if (level === record.level) {
      return;
    }

    record.level = level;

    if (record.plateLevel !== null) {
      record.plateLevel.textContent = romanLevel(level);
      record.plateLevel.dataset.level = String(level);
      record.plateLevel.hidden = level <= 1;
    }
  }

  function removeRecord(record: UnitRecord): void {
    record.figure.dispose();
    record.bubble.removeFromParent();
    record.bubble.material.dispose();
    record.frost.removeFromParent();
    record.frost.material.dispose();
    record.conditionRing.removeFromParent();
    record.conditionRing.material.dispose();
    record.aura.removeFromParent();
    record.aura.material.dispose();
    record.formRing.removeFromParent();
    record.formRing.material.dispose();
    record.ice.removeFromParent();
    record.ice.material.dispose();
    record.plague.removeFromParent();
    record.plague.material.dispose();
    record.plate.remove();
  }

  function leapsIn(events: readonly BattleEvent[]): Map<string, string> {
    const leaps = new Map<string, string>();

    for (const event of events) {
      if (event.kind === "cast" && leapArc(event.abilityId) !== null) {
        leaps.set(event.sourceUnitId, event.abilityId);
      }
    }

    return leaps;
  }

  function startLeap(record: UnitRecord, abilityId: string): void {
    const arc = leapArc(abilityId);

    if (arc === null) {
      return;
    }

    record.leap = { abilityId, from: record.position.clone(), to: record.destination.clone(), age: 0, seconds: arc.seconds, height: arc.height };
  }

  function stepLeap(record: UnitRecord, deltaSeconds: number): number {
    const leap = record.leap;

    if (leap === null) {
      return 0;
    }

    leap.age += deltaSeconds;
    const progress = Math.min(1, leap.age / leap.seconds);
    record.position.lerpVectors(leap.from, leap.to, progress);

    if (progress < 1) {
      return leap.height * Math.sin(Math.PI * progress);
    }

    record.leap = null;
    const landing = landingVisual(stage.particles, leap.abilityId, leap.to.clone(), leapRadius(record, leap.abilityId));

    if (landing !== null) {
      showSpell(landing);
    }

    playLanding(leap.abilityId, upgradesOf(record.unitId), stage.screenPan(leap.to));

    return 0;
  }

  function leapRadius(record: UnitRecord, abilityId: string): number {
    return (record.state.abilities[abilityId] ?? abilityDefinition(abilityId))?.dash?.splashRadiusUnits ?? areaRadius(record, abilityId);
  }

  function placeFigure(record: UnitRecord): void {
    record.grow = growTarget(record.state);
    record.figure.root.position.copy(record.position);
    record.figure.root.rotation.y = record.yaw;
    record.figure.root.scale.setScalar(levelFigureScale(record.level) * record.grow);
  }

  function syncFrozen(record: UnitRecord, unit: UnitState, snapAll: boolean): void {
    const frozen = unit.alive && unit.control?.control === "frozen";

    if (frozen !== record.frozen && !snapAll) {
      stage.particles.emit(frozen ? FREEZE_MIST : ICE_SHATTER, chestOf(record), UP, frozen ? FREEZE_MIST_COUNT : ICE_SHATTER_COUNT);

      if (!frozen) {
        playThaw(panOf(record));
      }
    }

    record.frozen = frozen;
    record.ice.visible = frozen;
  }

  function syncDecorations(record: UnitRecord): void {
    const unit = record.state;
    const present = unit.alive && !vanished.has(record.unitId);
    record.plague.visible = present && unit.pandemic !== null;
    record.bubble.visible = present && unit.shield !== null;
    record.frost.visible = present && unit.slow !== null && unit.condition === null && !record.frozen;
    record.conditionRing.visible = present && unit.condition !== null;
    record.aura.visible = present && record.level >= MAX_HERO_LEVEL;
    record.formRing.visible = present && unit.form !== null;
  }

  function plateHidden(record: UnitRecord): boolean {
    return !record.state.alive || vanished.has(record.unitId);
  }

  function syncRecords(next: BattleSnapshot, snapAll: boolean, leaps: ReadonlyMap<string, string>): void {
    const present = new Set<string>();
    const raisers = next.units.some(raisesCorpses);
    const revivers = next.units.filter(revivesCorpses);

    for (const unit of next.units) {
      present.add(unit.unitId);
      let record = records.get(unit.unitId);

      if (record !== undefined && record.state.heroId !== unit.heroId) {
        removeRecord(record);
        records.delete(unit.unitId);
        record = undefined;
      }

      const created = record === undefined;

      if (record === undefined) {
        record = createRecord(unit);
        records.set(unit.unitId, record);
      }

      record.state = unit;
      record.destination = stage.toScene(unit.position, 0);
      syncLevel(record, unit);
      const leapAbility = leaps.get(unit.unitId);

      if (snapAll) {
        record.leap = null;
        record.position.copy(record.destination);
        record.plateChain.hidden = true;
        record.chainEndsAtTick = 0;
      } else if (leapAbility !== undefined) {
        startLeap(record, leapAbility);
      } else if (record.leap !== null) {
        record.leap.to.copy(record.destination);
      } else if (record.destination.distanceTo(record.position) > SNAP_DISTANCE_UNITS) {
        record.position.copy(record.destination);
      }

      if (snapAll || created) {
        placeFigure(record);
      }

      record.figure.setDead(!unit.alive);
      record.figure.setForm?.(unit.alive ? (unit.form?.definition.key ?? null) : null);
      record.figure.setLinger(isCorpse(unit) && (raisers || revivers.some((reviver) => isRevivable(reviver, unit))));
      record.figure.setSpectral(isRisen(unit));
      record.figure.setOverclock(overclockLevel(next.units, unit));

      const hp = hpFraction(unit);
      const shieldFraction = unit.shield === null ? 0 : Math.min(1, unit.shield.amount / Math.max(1, unit.maxHp));
      const blessed = unit.shield !== null && unit.shield.blessed !== null;
      record.plateHp.style.width = `${hp * 100}%`;
      record.plateTrail.update(hp, snapAll);
      record.plateShield.style.width = `${shieldFraction * 100}%`;
      record.plateShield.classList.toggle("is-blessed", blessed);
      record.plate.hidden = plateHidden(record);
      record.bubble.material.color.set(blessed ? BLESSED_COLOR : SHIELD_COLOR);
      syncFrozen(record, unit, snapAll || created);
      syncPlateExtras(record, unit, next.tick);
    }

    for (const [unitId, record] of records) {
      if (!present.has(unitId)) {
        removeRecord(record);
        records.delete(unitId);
      }
    }
  }

  function syncStacks(record: UnitRecord, unit: UnitState): void {
    const fraction = meterFraction(unit);
    const passive = stackPassive(unit);
    const stacks = passive === null ? 0 : (unit.memory.stacks[passive.key] ?? 0);
    const key = `${stacks}:${fraction === null ? "" : Math.round(fraction * 100)}`;

    if (key === record.stacksKey) {
      return;
    }

    record.stacksKey = key;

    if (record.plateMeter !== null && fraction !== null) {
      record.plateMeter.style.width = `${fraction * 100}%`;
      record.plateMeter.parentElement?.classList.toggle("is-full", fraction >= 1);
    }

    if (record.plateStacks === null || passive === null) {
      return;
    }

    record.plateStacks.classList.toggle("is-full", stacks >= passive.max);

    for (const [index, pip] of [...record.plateStacks.children].entries()) {
      pip.classList.toggle("is-on", index < stacks);
    }
  }

  function showChain(record: UnitRecord, link: number, tick: number): void {
    const chain = record.plateChain;
    chain.textContent = `×${link}`;
    chain.hidden = false;
    chain.classList.toggle("is-flourish", link >= CHAIN_FLOURISH_LINK);
    chain.animate([{ scale: link >= CHAIN_FLOURISH_LINK ? "1.9" : "1.5" }, { scale: "1" }], { duration: 260, easing: "cubic-bezier(0.2, 0.9, 0.3, 1)" });
    record.chainEndsAtTick = tick + CHAIN_HOLD_TICKS;
  }

  function syncPlateExtras(record: UnitRecord, unit: UnitState, tick: number): void {
    syncStacks(record, unit);

    if (!record.plateChain.hidden && (tick > record.chainEndsAtTick || !unit.alive)) {
      record.plateChain.hidden = true;
    }

    if (record.plateMana !== null) {
      record.plateMana.style.width = `${Math.min(100, (unit.mana / Math.max(1, unit.maxMana)) * 100)}%`;
      record.plateMana.parentElement?.classList.toggle("is-full", unit.mana >= unit.maxMana);
    }

    const condition = unit.alive ? unit.condition : null;
    const conditionKey = condition === null ? "" : condition.condition;

    if (conditionKey !== record.conditionKey) {
      record.conditionKey = conditionKey;

      if (condition !== null) {
        record.conditionRing.material.color.set(CONDITION_COLORS[condition.condition]);
      }
    }

    const statuses = plateStatuses(unit).slice(0, PLATE_STATUS_LIMIT);
    const statusKey = statuses.map((status) => `${status.kind}:${status.stacks}`).join("|");

    if (statusKey === record.statusKey) {
      return;
    }

    record.statusKey = statusKey;
    record.plateStatus.replaceChildren(
      ...statuses.map((status) => {
        const chip = document.createElement("span");
        chip.className = status.buff ? "status-chip is-buff" : "status-chip is-debuff";
        chip.dataset.status = status.kind;
        chip.append(statusIcon(status.kind));

        if (status.stacks > 1) {
          const stacks = document.createElement("span");
          stacks.className = "status-stacks";
          stacks.textContent = String(status.stacks);
          chip.append(stacks);
        }

        return chip;
      }),
    );
  }

  function syncGroundMarkers(next: BattleSnapshot): void {
    for (const area of groundMarkers.values()) {
      area.seen = false;
    }

    const spellKeys = new Set<string>();

    for (const impact of next.impacts) {
      const key = `impact-${impact.impactId}`;
      let area = groundMarkers.get(key);

      if (area === undefined) {
        area = { marker: effects.marker(stage.toScene(impact.center, 0), 0.86, impact.radiusUnits, IMPACT_COLOR, 0.55), seen: true };
        groundMarkers.set(key, area);
      }

      area.seen = true;
      area.marker?.setOpacity(0.35 + 0.35 * Math.abs(Math.sin(next.tick / 3)));
      syncStateVisual(key, next.tick, spellKeys, () =>
        impactVisual(
          stage.particles,
          impact.abilityId,
          stage.toScene(impact.center, 0),
          impact.radiusUnits,
          next.tick,
          impact.landsAtTick,
        ),
      );
    }

    for (const zone of next.zones) {
      if (pendingTrails.has(zone.zoneId)) {
        continue;
      }

      const key =
        zone.followsUnitId === null
          ? `zone-${zone.abilityId}-${Math.round(zone.center.x)}-${Math.round(zone.center.y)}-${zone.radiusUnits}`
          : `zone-${zone.zoneId}`;

      let area = groundMarkers.get(key);

      if (area === undefined) {
        const marker = zoneDrawsBoundary(zone.abilityId) ? null : effects.marker(stage.toScene(zone.center, 0), 0.9, zone.radiusUnits, zoneColor(zone.abilityId), 0.3);
        area = { marker, seen: true };
        groundMarkers.set(key, area);
      }

      area.seen = true;
      syncStateVisual(key, next.tick, spellKeys, () =>
        zoneVisual(stage.particles, zone.abilityId, stage.toScene(zone.center, 0), zone.radiusUnits, zone.zoneId, zone.periodTicks),
      );

      if (zone.followsUnitId !== null) {
        const center = stage.toScene(zone.center, 0);
        area.marker?.place(center);
        stateVisuals.get(key)?.root.position.set(center.x, 0, center.z);
      }
    }

    for (const emitter of next.emitters) {
      const key = `emitter-${emitter.emitterId}`;
      const position = stage.toScene(emitter.position, 0);
      const ahead = stage.toScene({ x: emitter.position.x + emitter.velocity.x, y: emitter.position.y + emitter.velocity.y }, 0);
      const motion = emitterMotions.get(key) ?? { position: new Vector3(), velocity: new Vector3(), tick: next.tick };
      motion.position.copy(position);
      motion.velocity.subVectors(ahead, position);
      motion.tick = next.tick;
      emitterMotions.set(key, motion);
      emitterAbilities.set(emitter.emitterId, emitter.abilityId);
      syncStateVisual(key, next.tick, spellKeys, () => emitterVisual(stage.particles, emitter.abilityId, motion, emitter.emitterId));
    }

    for (const [key, visual] of stateVisuals) {
      if (spellKeys.has(key)) {
        continue;
      }

      stateVisuals.delete(key);
      emitterMotions.delete(key);

      if (visual !== null) {
        visual.end();
        spellVisuals.add(visual);
      }
    }

    for (const [key, area] of groundMarkers) {
      if (!area.seen) {
        area.marker?.remove();
        groundMarkers.delete(key);
      }
    }
  }

  function updateSelection(): void {
    const record = selectedUnitId === null ? undefined : records.get(selectedUnitId);

    if (record === undefined || !record.state.alive) {
      selectionRing.visible = false;
      rangeRing.visible = false;

      return;
    }

    selectionRing.visible = true;
    selectionRing.position.set(record.position.x, 0.12, record.position.z);

    const radius = basicAttackRange(record.state.heroId);

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

    rangeRing.visible = radius > 0;
    rangeRing.position.set(record.position.x, 0.15, record.position.z);
  }

  function updateTargetLines(): void {
    let count = 0;

    for (const record of records.values()) {
      const { state } = record;
      const eligible = options.targetLines === "all" || state.unitId === selectedUnitId;

      if (!eligible || !state.alive || state.targetUnitId === null) {
        continue;
      }

      const target = records.get(state.targetUnitId);

      if (target === undefined || !target.state.alive) {
        continue;
      }

      if (count >= MAX_TARGET_LINES) {
        break;
      }

      targetLinePositions.setXYZ(count * 2, record.position.x, 0.3, record.position.z);
      targetLinePositions.setXYZ(count * 2 + 1, target.position.x, 0.3, target.position.z);
      count += 1;
    }

    targetLines.visible = count > 0;

    if (count > 0) {
      targetLinePositions.needsUpdate = true;
      targetLineGeometry.setDrawRange(0, count * 2);
      targetLines.computeLineDistances();
    }
  }

  function stepRecords(deltaSeconds: number): void {
    const blend = 1 - Math.exp(-POSITION_SMOOTHING * deltaSeconds);
    const turn = 1 - Math.exp(-YAW_SMOOTHING * deltaSeconds);
    auraClock = (auraClock + deltaSeconds) % AURA_PULSE_SECONDS;

    for (const record of records.values()) {
      const before = record.position.clone();

      if (record.leap === null) {
        record.position.lerp(record.destination, blend);
      }

      const lift = stepLeap(record, deltaSeconds);
      const speed = deltaSeconds > 0 ? before.distanceTo(record.position) / deltaSeconds : 0;
      const moving = record.state.alive && speed > MOVING_UNITS_PER_SECOND;

      const target = record.state.targetUnitId === null ? undefined : records.get(record.state.targetUnitId);

      if (record.state.alive && record.state.channel !== null) {
        record.yaw += deltaSeconds * SPIN_RADIANS_PER_SECOND;
      } else if (record.state.alive && target !== undefined && target.state.alive) {
        const desired = angleToward(record.position.x, record.position.z, target.position.x, target.position.z);
        record.yaw = approachAngle(record.yaw, desired, turn);
      } else if (moving) {
        const desired = angleToward(before.x, before.z, record.position.x, record.position.z);
        record.yaw = approachAngle(record.yaw, desired, turn);
      }

      record.figure.setMoving(moving);
      record.figure.setChanneling(record.state.alive && record.state.channel !== null);
      record.figure.root.position.copy(record.position);
      record.figure.root.position.y += lift;
      record.figure.root.rotation.y = record.yaw;
      record.grow += (growTarget(record.state) - record.grow) * (1 - Math.exp(-GROW_SMOOTHING * deltaSeconds));
      record.figure.root.scale.setScalar(hexCritters.figureScale(record.unitId) * levelFigureScale(record.level) * record.grow);
      record.figure.setCharge(record.state.alive ? stackCharge(record.state) : 0);
      record.figure.update(record.frozen ? 0 : deltaSeconds);

      if (record.frozen) {
        const height = figureHeight(record);
        const width = Math.max(3.2, height * 0.42);
        record.ice.position.set(record.position.x, height * 0.5, record.position.z);
        record.ice.scale.set(width, height * 0.62, width);
      }

      record.plague.position.set(record.position.x, 0.15, record.position.z);
      record.plague.scale.setScalar(1.1 + 0.06 * Math.sin((auraClock / AURA_PULSE_SECONDS) * Math.PI * 6));
      record.plague.material.opacity = 0.35 + 0.2 * Math.sin((auraClock / AURA_PULSE_SECONDS) * Math.PI * 4);
      record.bubble.position.set(record.position.x, figureHeight(record) * 0.5, record.position.z);
      record.frost.position.set(record.position.x, 0.1, record.position.z);
      record.conditionRing.position.set(record.position.x, 0.14, record.position.z);
      syncDecorations(record);
      record.formRing.material.color.set(record.state.form?.definition.key === "inferno" ? INFERNO_COLOR : FORM_COLOR);
      record.formRing.position.set(record.position.x, 0.16, record.position.z);
      record.formRing.scale.setScalar(1.15 + 0.08 * Math.sin((auraClock / AURA_PULSE_SECONDS) * Math.PI * 4));
      record.aura.position.set(record.position.x, 0.08, record.position.z);
      record.aura.material.opacity = 0.32 + 0.18 * Math.sin((auraClock / AURA_PULSE_SECONDS) * Math.PI * 2);

      record.plateTrail.step(deltaSeconds);
      record.plate.hidden = plateHidden(record);

      const platePoint = stage.toScreen(record.position.clone().setY(figureHeight(record) + PLATE_GAP_UNITS + lift));

      if (platePoint !== null) {
        record.plate.style.transform = `translate(${platePoint.x}px, ${platePoint.y}px) translate(-50%, -100%)`;
      }
    }
  }

  function fightersArea(): StageFocus | null {
    let area: StageFocus | null = null;

    for (const record of records.values()) {
      if (!record.state.alive) {
        continue;
      }

      const { x, z } = record.position;

      area =
        area === null
          ? { minX: x, maxX: x, minZ: z, maxZ: z }
          : { minX: Math.min(area.minX, x), maxX: Math.max(area.maxX, x), minZ: Math.min(area.minZ, z), maxZ: Math.max(area.maxZ, z) };
    }

    return area;
  }

  function holdsArea(outer: StageFocus, inner: StageFocus): boolean {
    return inner.minX >= outer.minX && inner.maxX <= outer.maxX && inner.minZ >= outer.minZ && inner.maxZ <= outer.maxZ;
  }

  function areaSpread(area: StageFocus): number {
    return Math.max(area.maxX - area.minX, area.maxZ - area.minZ);
  }

  function updateFocus(): void {
    const needed = snapshot !== null && snapshot.result === null && graphicsSettings.get().fightCamera ? fightersArea() : null;

    if (needed === null) {
      if (focusArea !== null) {
        focusArea = null;
        stage.focus(null);
      }

      return;
    }

    if (focusArea !== null && holdsArea(focusArea, needed) && areaSpread(needed) >= areaSpread(focusArea) * FOCUS_SHRINK_RATIO) {
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

  const stopFrames = stage.onFrame((deltaSeconds) => {
    updateFocus();
    stepRecords(deltaSeconds);

    for (const number of liveNumbers) {
      placeNumber(number);
    }

    effects.step(deltaSeconds);
    stepSpells(deltaSeconds);
    stepThreads(deltaSeconds);
    stepCritters(deltaSeconds);
    updateSelection();
    updateTargetLines();
  });

  function handleClick(event: MouseEvent): void {
    const rect = stage.canvas.getBoundingClientRect();
    const clickX = event.clientX - rect.left;
    const clickY = event.clientY - rect.top;
    let closest: UnitRecord | null = null;
    let closestScore = Number.POSITIVE_INFINITY;

    for (const record of records.values()) {
      const point = stage.toScreen(chestOf(record));

      if (point === null) {
        continue;
      }

      const distance = Math.hypot(point.x - clickX, point.y - clickY);
      const score = distance + (record.state.alive ? 0 : PICK_RADIUS_PIXELS);

      if (distance < PICK_RADIUS_PIXELS && score < closestScore) {
        closest = record;
        closestScore = score;
      }
    }

    if (closest !== null) {
      options.onSelectUnit(closest.unitId);
    }
  }

  stage.canvas.addEventListener("click", handleClick);

  return {
    update(next, nextSelectedUnitId, latestEvents) {
      if (next === snapshot && nextSelectedUnitId === selectedUnitId && latestEvents.length === 0) {
        return;
      }

      stage.showBoard(snapshotGrid(next), options.viewSide, options.insets);

      const snapAll = snapshot === null || next.tick < lastTick || next.tick - lastTick > TICK_JUMP_FOR_SNAP;
      snapshot = next;
      selectedUnitId = nextSelectedUnitId;
      lastTick = next.tick;

      if (snapAll) {
        chainTargets.clear();
        bounceCounts.clear();
        flightTimes.clear();
        pendingTrails.clear();
        hexOrigins.clear();
        omenOrigins.clear();
        struckUnits.clear();
        boundTo.clear();
        knellSources.clear();
        tolledAt.clear();

        for (const unitId of vanished.keys()) {
          const hidden = records.get(unitId);

          if (hidden !== undefined) {
            hidden.figure.root.visible = true;
          }
        }

        vanished.clear();
        shadeCasts.clear();
        quietCasts.clear();
        hexCritters.clear();
        fateThreads.clear();
        emitterAbilities.clear();
        shotOrigins.clear();
        burstCenters.clear();
        falling.reset(next.impacts);
        stage.particles.clear();
        effects.clear();

        for (const visual of spellVisuals) {
          visual.dispose();
        }

        spellVisuals.clear();
        sanctuaries.clear();
      }

      forgetBefore(shotOrigins, next.tick - SHOT_MEMORY_TICKS);
      forgetBefore(burstCenters, next.tick - SHOT_MEMORY_TICKS);

      if (!snapAll) {
        vanishDashers(latestEvents);
      }

      syncRecords(next, snapAll, leapsIn(latestEvents));

      if (!snapAll) {
        holdTrails(latestEvents);
      }

      syncGroundMarkers(next);

      if (snapAll) {
        return;
      }

      selfRevivals = selfRevivalsIn(latestEvents);
      stunningHits = stunningHitsIn(latestEvents);

      for (const event of latestEvents) {
        handleEvent(event);
      }

      falling.sync(next.impacts, next.tick, upgradesOf, (impactId) => {
        const impact = next.impacts.find((candidate) => candidate.impactId === impactId);

        return impact === undefined ? undefined : stage.screenPan(stage.toScene(impact.center, 0));
      });
    },

    dispose() {
      stopFrames();
      stage.focus(null);
      stage.canvas.removeEventListener("click", handleClick);
      stage.particles.clear();
      effects.dispose();

      for (const visual of spellVisuals) {
        visual.dispose();
      }

      spellVisuals.clear();
      sanctuaries.clear();

      for (const visual of stateVisuals.values()) {
        visual?.dispose();
      }

      stateVisuals.clear();

      for (const record of records.values()) {
        removeRecord(record);
      }

      records.clear();
      emitterMotions.clear();
      emitterAbilities.clear();
      shotOrigins.clear();
      burstCenters.clear();

      for (const area of groundMarkers.values()) {
        area.marker?.remove();
      }

      groundMarkers.clear();
      selectionRing.removeFromParent();
      selectionRing.material.dispose();
      rangeRing.removeFromParent();
      rangeRing.geometry.dispose();
      rangeRing.material.dispose();
      targetLines.removeFromParent();
      targetLineGeometry.dispose();
      targetLines.material.dispose();
      fateThreads.dispose();
      hexCritters.dispose();

      for (const geometry of [iceGeometry, bubbleGeometry, frostGeometry, auraGeometry, selectionGeometry]) {
        geometry.dispose();
      }

      for (const number of liveNumbers.splice(0)) {
        number.element.remove();
      }
    },
  };
}
