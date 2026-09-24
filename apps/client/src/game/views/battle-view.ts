import {
  AdditiveBlending,
  BufferGeometry,
  Color,
  DynamicDrawUsage,
  Float32BufferAttribute,
  Line,
  LineBasicMaterial,
  LineDashedMaterial,
  LineLoop,
  LineSegments,
  Mesh,
  MeshBasicMaterial,
  OctahedronGeometry,
  RingGeometry,
  SphereGeometry,
  Vector3,
  type Object3D,
} from "three";
import { CONDITION_DURATION_TICKS, type BattleEvent, type BattleSnapshot, type BoardGrid, type ComboKind, type ConditionKind, type DamageDealtEvent, type UnitState } from "@jev-game/game";
import { abilityDefinition, heroDefinition } from "../catalogues.js";
import {
  castVisual,
  impactVisual,
  landingVisual,
  projectileVisual,
  zoneVisual,
  type SpellVisual,
  type TickedVisual,
} from "./spell-visuals.js";
import { conditionIcon, statusIcon } from "../../hud/icons.js";
import { comboName } from "../../hud/tips.js";
import type { BoardStage, ViewSide, ViewportInsets } from "./board-stage.js";
import { createHealthTrail, type HealthTrail } from "./health-trail.js";
import { createHeroFigure, type HeroFigure } from "./hero-figures.js";
import { emitHit, hitKind, hitTint, trailStyle } from "./hit-effects.js";
import { createTrail, type ParticleStyle } from "./particles.js";
import {
  createFallingTracker,
  playCast,
  playCombo,
  playDeath,
  playHeal,
  playHit,
  playLanding,
  playShield,
  playSpawn,
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

const POSITION_SMOOTHING = 18;

const YAW_SMOOTHING = 12;

const SNAP_DISTANCE_UNITS = 20;

const MOVING_UNITS_PER_SECOND = 3;

const TICK_JUMP_FOR_SNAP = 20;

const PICK_RADIUS_PIXELS = 44;

const PLATE_GAP_UNITS = 1.8;

const CHEST_FRACTION = 0.55;

const PROJECTILE_SECONDS = 0.16;

const ARC_SECONDS = 0.22;

const UP = new Vector3(0, 1, 0);

const SPRAY_LIFT = 0.7;

const TRAIL_SPACING_UNITS = 1.1;

const HEAL_MOTE_COUNT = 14;

const HEAL_MOTE_HEIGHT = 1.5;

const COMBO_SPARK_COUNT = 18;

const SPAWN_MOTE_COUNT = 16;

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

const HP_PER_SEGMENT = 250;

const RANGED_ATTACK_CELLS = 1.5;

const RANGE_RING_POINTS = 72;

const MAX_TARGET_LINES = 32;

const CONDITION_COLORS: Readonly<Record<ConditionKind, string>> = {
  staggered: "#ffa928",
  brittle: "#9fe8ff",
  disoriented: "#b58cff",
};

const COMBO_CONDITION: Readonly<Record<ComboKind, ConditionKind>> = {
  overload: "staggered",
  shatter: "brittle",
  crush: "disoriented",
};

const IMPACT_COLOR = "#ff8a4c";

const SPIN_RADIANS_PER_SECOND = 16;

const HEXED_SCALE = 0.55;

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

function comboSparks(color: string): ParticleStyle {
  return {
    blend: "solid",
    from: new Color("#ffffff"),
    to: new Color(color),
    brightness: 1,
    opacity: 1,
    size: [2.2, 0.5],
    life: [0.3, 0.55],
    speed: [12, 26],
    cone: Math.PI,
    spread: 0.6,
    gravity: 12,
    drag: 3.5,
    stretch: 0.04,
    softness: 0.2,
  };
}

function zoneColor(abilityId: string): string {
  switch (abilityId) {
    case "plague-cloud":
      return "#8fd14f";

    case "consecrate":
      return "#f2d27a";

    case "glacial-lance":
      return "#9fe8ff";

    default:
      return IMPACT_COLOR;
  }
}

const COMBO_SPARKS: Readonly<Record<ConditionKind, ParticleStyle>> = {
  staggered: comboSparks(CONDITION_COLORS.staggered),
  brittle: comboSparks(CONDITION_COLORS.brittle),
  disoriented: comboSparks(CONDITION_COLORS.disoriented),
};

const COMBO_BURST_SECONDS = 0.55;

const BIG_HIT_FRACTION = 0.2;

const BIG_HEAL_FRACTION = 0.15;

interface GroundMarker {
  mesh: Mesh<RingGeometry, MeshBasicMaterial>;
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
  plateCondition: HTMLElement;
  plateStatus: HTMLElement;
  conditionKey: string;
  statusKey: string;
  bubble: Mesh<SphereGeometry, MeshBasicMaterial>;
  frost: Mesh<RingGeometry, MeshBasicMaterial>;
  conditionRing: Mesh<RingGeometry, MeshBasicMaterial>;
}

interface TransientEffect {
  objects: Object3D[];
  age: number;
  duration: number;
  step: (progress: number) => void;
  onDone: (() => void) | null;
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

  const condition = document.createElement("div");
  condition.className = "unit-plate-condition";
  condition.hidden = true;

  const status = document.createElement("div");
  status.className = "unit-plate-status";

  plate.append(condition, status, bar);

  if (unit.maxMana > 0) {
    const mana = document.createElement("div");
    mana.className = "unit-plate-mana";
    const fill = document.createElement("div");
    fill.className = "unit-plate-mana-fill";
    mana.append(fill);
    plate.append(mana);
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
  const effects: TransientEffect[] = [];
  const chainTargets = new Map<number, string>();

  const falling = createFallingTracker();
  const spellVisuals = new Set<SpellVisual>();
  const stateVisuals = new Map<string, TickedVisual | null>();

  const bubbleGeometry = new SphereGeometry(6.4, 20, 14);
  const frostGeometry = new RingGeometry(4.9, 5.8, 32);
  const sparkGeometry = new OctahedronGeometry(1, 0);
  const boltGeometry = new OctahedronGeometry(0.7, 0);
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

  stage.scene.add(selectionRing, rangeRing, targetLines);

  let snapshot: BattleSnapshot | null = null;
  const groundMarkers = new Map<string, GroundMarker>();
  let selectedUnitId: string | null = null;
  let rangeRingRadius = -1;
  let lastTick = -1;

  function chestOf(record: UnitRecord): Vector3 {
    return record.position.clone().setY(record.figure.height * CHEST_FRACTION);
  }

  function addEffect(effect: TransientEffect): void {
    for (const object of effect.objects) {
      stage.scene.add(object);
    }

    effects.push(effect);
    effect.step(0);
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

  function areaRadius(abilityId: string): number {
    const area = abilityDefinition(abilityId)?.area;

    return area?.kind === "circle" ? area.radiusUnits : 0;
  }

  function disposeEffectObjects(effect: TransientEffect): void {
    for (const object of effect.objects) {
      object.removeFromParent();

      if (object instanceof Mesh || object instanceof Line) {
        const materials = Array.isArray(object.material) ? object.material : [object.material];

        for (const surface of materials) {
          surface.dispose();
        }

        if (object.geometry !== sparkGeometry && object.geometry !== boltGeometry) {
          object.geometry.dispose();
        }
      }
    }
  }

  function floatNumber(record: UnitRecord, text: string, kind: string): HTMLElement | null {
    const point = stage.toScreen(record.position.clone().setY(record.figure.height + PLATE_GAP_UNITS));

    if (point === null) {
      return null;
    }

    const element = document.createElement("div");
    element.className = `float-number is-${kind}`;
    element.textContent = text;
    element.style.left = `${point.x + (Math.random() - 0.5) * 18}px`;
    element.style.top = `${point.y - 12}px`;
    stage.overlay.append(element);
    window.setTimeout(() => element.remove(), FLOAT_NUMBER_MILLISECONDS);

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

  function landHit(event: DamageDealtEvent): void {
    const record = records.get(event.targetUnitId);

    if (record === undefined) {
      return;
    }

    const total = event.amount + event.shieldAbsorbed;
    const big = total >= record.state.maxHp * BIG_HIT_FRACTION;

    if (event.dot === undefined) {
      record.figure.trigger("hit");
      sprayHit(event, record, big || event.crit === true);
      playHit(event, big, panOf(record));
    }

    if (event.combo !== undefined) {
      const callout = floatNumber(record, total > 0 ? String(total) : "", "combo");

      if (callout !== null) {
        callout.dataset.condition = COMBO_CONDITION[event.combo];
        callout.dataset.label = comboName(event.combo);
      }

      return;
    }

    if (event.dot !== undefined || total <= 0) {
      return;
    }

    if (event.crit === true) {
      floatNumber(record, String(total), big ? "crit is-huge" : "crit");
    } else if (big && record.state.summonerUnitId === null) {
      floatNumber(record, String(total), "big");
    }
  }

  function groundRing(x: number, z: number, inner: number, outer: number, color: string, opacity: number): Mesh<RingGeometry, MeshBasicMaterial> {
    const mesh = new Mesh(
      new RingGeometry(inner, outer, 40),
      new MeshBasicMaterial({ color, transparent: true, opacity, blending: AdditiveBlending, depthWrite: false }),
    );

    mesh.rotation.x = -Math.PI / 2;
    mesh.position.set(x, 0.18, z);

    return mesh;
  }

  function comboBurst(targetId: string, combo: ComboKind): void {
    const record = records.get(targetId);

    if (record === undefined) {
      return;
    }

    const condition = COMBO_CONDITION[combo];
    const ring = groundRing(record.position.x, record.position.z, 1.5, 3, CONDITION_COLORS[condition], 0.9);

    const flash = new Mesh(
      sparkGeometry,
      new MeshBasicMaterial({ color: CONDITION_COLORS[condition], transparent: true, blending: AdditiveBlending, depthWrite: false }),
    );

    const center = chestOf(record);
    stage.particles.emit(COMBO_SPARKS[condition], center, UP, COMBO_SPARK_COUNT);

    addEffect({
      objects: [ring, flash],
      age: 0,
      duration: COMBO_BURST_SECONDS,
      onDone: null,
      step(progress) {
        ring.scale.setScalar(1 + progress * 3.5);
        ring.material.opacity = 0.9 * (1 - progress);
        flash.position.copy(center);
        flash.scale.setScalar(1.5 + progress * 5);
        flash.rotation.y = progress * 4;
        flash.material.opacity = 1 - progress;
      },
    });
  }

  function impactFlash(x: number, z: number, radius: number, color: string): void {
    const ring = groundRing(x, z, Math.max(0.5, radius * 0.2), Math.max(1, radius), color, 0.95);

    addEffect({
      objects: [ring],
      age: 0,
      duration: COMBO_BURST_SECONDS,
      onDone: null,
      step(progress) {
        ring.scale.setScalar(1 + progress * 0.6);
        ring.material.opacity = 0.95 * (1 - progress);
      },
    });
  }

  function projectile(sourceId: string, targetId: string, abilityId: string, onDone: () => void): void {
    const source = records.get(sourceId);
    const target = records.get(targetId);

    if (source === undefined || target === undefined) {
      onDone();

      return;
    }

    const from = chestOf(source);
    const visual = projectileVisual(stage.particles, abilityId, from);

    if (visual !== null) {
      addEffect({
        objects: visual.objects,
        age: 0,
        duration: PROJECTILE_SECONDS,
        onDone,
        step(progress) {
          visual.place(from, chestOf(target), progress);
        },
      });

      return;
    }

    const kind = hitKind(abilityId);

    const mesh = new Mesh(
      boltGeometry,
      new MeshBasicMaterial({ color: hitTint(kind), transparent: true, blending: AdditiveBlending, depthWrite: false }),
    );

    mesh.scale.set(0.8, 0.8, 3.2);
    const trail = createTrail(stage.particles, trailStyle(kind), TRAIL_SPACING_UNITS, from);

    addEffect({
      objects: [mesh],
      age: 0,
      duration: PROJECTILE_SECONDS,
      onDone,
      step(progress) {
        const end = chestOf(target);
        mesh.position.lerpVectors(from, end, progress);
        mesh.lookAt(end);
        trail.follow(mesh.position);
      },
    });
  }

  function arc(fromId: string, toId: string, abilityId: string, onDone: () => void): void {
    const from = records.get(fromId);
    const to = records.get(toId);

    if (from === undefined || to === undefined) {
      onDone();

      return;
    }

    const start = chestOf(from);
    const end = chestOf(to);
    const points: number[] = [];
    const segments = 7;

    for (let index = 0; index <= segments; index += 1) {
      const point = start.clone().lerp(end, index / segments);
      const jitter = index === 0 || index === segments ? 0 : 1.1;
      points.push(point.x + (Math.random() - 0.5) * jitter, point.y + (Math.random() - 0.5) * jitter, point.z);
    }

    const geometry = new BufferGeometry();
    geometry.setAttribute("position", new Float32BufferAttribute(points, 3));

    const line = new Line(
      geometry,
      new LineBasicMaterial({ color: hitTint(hitKind(abilityId)), transparent: true, blending: AdditiveBlending, depthWrite: false }),
    );

    let landed = false;

    addEffect({
      objects: [line],
      age: 0,
      duration: ARC_SECONDS,
      onDone: null,
      step(progress) {
        line.material.opacity = 1 - progress;

        if (!landed && progress >= 0.3) {
          landed = true;
          onDone();
        }
      },
    });
  }

  function healBurst(record: UnitRecord, amount: number): void {
    stage.particles.emit(HEAL_MOTES, record.position.clone().setY(HEAL_MOTE_HEIGHT), UP, HEAL_MOTE_COUNT);

    if (amount >= record.state.maxHp * BIG_HEAL_FRACTION) {
      floatNumber(record, `+${amount}`, "heal");
    }
  }

  function panAt(position: Vector3): number | undefined {
    const point = stage.toScreen(position);
    const width = stage.canvas.clientWidth;

    return point === null || width === 0 ? undefined : (point.x / width) * 2 - 1;
  }

  function panOf(record: UnitRecord): number | undefined {
    return panAt(record.position);
  }

  function sourceOf(record: UnitRecord): SoundSource {
    return { heroId: record.state.heroId, friendly: record.state.teamId === options.friendlyTeamId };
  }

  function isRangedAbility(abilityId: string): boolean {
    const ability = abilityDefinition(abilityId);
    const grid = snapshot === null ? null : snapshotGrid(snapshot);
    const cell = grid === null ? 10 : grid.width / grid.columns;

    return ability !== undefined && ability.range > cell * RANGED_ATTACK_CELLS;
  }

  function handleEvent(event: BattleEvent): void {
    if (event.kind === "cast") {
      const record = records.get(event.sourceUnitId);

      if (record === undefined) {
        return;
      }

      record.figure.trigger(event.isBasicAttack ? "attack" : "cast");
      playCast(event, sourceOf(record), panOf(record));
      const flourish = castVisual(stage.particles, event.abilityId, record.position, areaRadius(event.abilityId));

      if (flourish !== null) {
        showSpell(flourish);
      }

      return;
    }

    if (event.kind === "combo-detonated") {
      comboBurst(event.targetUnitId, event.combo);
      const target = records.get(event.targetUnitId);
      playCombo(event.combo, target === undefined ? undefined : panOf(target));

      return;
    }

    if (event.kind === "unit-spawned") {
      const center = stage.toScene(event.position, 0);
      impactFlash(center.x, center.z, 8, SPAWN_COLOR);
      stage.particles.emit(SPAWN_MOTES, center.clone().setY(1), UP, SPAWN_MOTE_COUNT);
      playSpawn(event.heroId, panAt(center));

      return;
    }

    if (event.kind === "impact-landed") {
      const center = stage.toScene(event.center, 0);
      playLanding(event.abilityId, panAt(center));
      const landing = landingVisual(stage.particles, event.abilityId, center, event.radiusUnits);

      if (landing === null) {
        impactFlash(center.x, center.z, event.radiusUnits, IMPACT_COLOR);
        stage.particles.emit(IMPACT_DUST, center, UP, Math.round(event.radiusUnits * IMPACT_DUST_PER_UNIT));
      } else {
        showSpell(landing);
      }

      return;
    }

    if (event.kind === "damage-dealt") {
      const land = (): void => landHit(event);

      if (event.dot !== undefined || event.reaction === true || !isRangedAbility(event.abilityId)) {
        land();

        return;
      }

      const previousTarget = chainTargets.get(event.causeSequence);
      chainTargets.set(event.causeSequence, event.targetUnitId);

      if (previousTarget === undefined) {
        projectile(event.sourceUnitId, event.targetUnitId, event.abilityId, land);
      } else {
        arc(previousTarget, event.targetUnitId, event.abilityId, land);
      }

      return;
    }

    if (event.kind === "healing-done") {
      const record = records.get(event.targetUnitId);

      if (record !== undefined) {
        healBurst(record, event.amount);
        playHeal(event.abilityId, panOf(record));
      }

      return;
    }

    if (event.kind === "shield-applied") {
      const record = records.get(event.targetUnitId);

      if (record !== undefined) {
        playShield(event.abilityId, panOf(record));
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
    }
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
    stage.scene.add(bubble, frost, conditionRing);

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
      plateCondition: plate.querySelector<HTMLElement>(".unit-plate-condition")!,
      plateStatus: plate.querySelector<HTMLElement>(".unit-plate-status")!,
      conditionKey: "",
      statusKey: "",
      bubble,
      frost,
      conditionRing,
    };
  }

  function removeRecord(record: UnitRecord): void {
    record.figure.dispose();
    record.bubble.removeFromParent();
    record.bubble.material.dispose();
    record.frost.removeFromParent();
    record.frost.material.dispose();
    record.conditionRing.removeFromParent();
    record.conditionRing.material.dispose();
    record.plate.remove();
  }

  function syncRecords(next: BattleSnapshot, snapAll: boolean): void {
    const present = new Set<string>();

    for (const unit of next.units) {
      present.add(unit.unitId);
      let record = records.get(unit.unitId);

      if (record === undefined) {
        record = createRecord(unit);
        records.set(unit.unitId, record);
      }

      record.state = unit;
      record.destination = stage.toScene(unit.position, 0);

      if (snapAll || record.destination.distanceTo(record.position) > SNAP_DISTANCE_UNITS) {
        record.position.copy(record.destination);
      }

      if (snapAll && unit.alive) {
        record.figure.setDead(false);
      }

      if (!unit.alive) {
        record.figure.setDead(true);
      }

      const hp = hpFraction(unit);
      const shieldFraction = unit.shield === null ? 0 : Math.min(1, unit.shield.amount / Math.max(1, unit.maxHp));
      record.plateHp.style.width = `${hp * 100}%`;
      record.plateTrail.update(hp, snapAll);
      record.plateShield.style.width = `${shieldFraction * 100}%`;
      record.plate.hidden = !unit.alive;
      record.bubble.visible = unit.alive && unit.shield !== null;
      record.frost.visible = unit.alive && unit.slow !== null && unit.condition === null;
      syncPlateExtras(record, unit, next.tick);
    }

    for (const [unitId, record] of records) {
      if (!present.has(unitId)) {
        removeRecord(record);
        records.delete(unitId);
      }
    }
  }

  function syncPlateExtras(record: UnitRecord, unit: UnitState, tick: number): void {
    if (record.plateMana !== null) {
      record.plateMana.style.width = `${Math.min(100, (unit.mana / Math.max(1, unit.maxMana)) * 100)}%`;
      record.plateMana.parentElement?.classList.toggle("is-full", unit.mana >= unit.maxMana);
    }

    const condition = unit.alive ? unit.condition : null;
    const conditionKey = condition === null ? "" : condition.condition;

    if (conditionKey !== record.conditionKey) {
      record.conditionKey = conditionKey;
      record.plateCondition.hidden = condition === null;
      record.plateCondition.replaceChildren(...(condition === null ? [] : [conditionIcon(condition.condition)]));

      if (condition !== null) {
        record.plateCondition.dataset.condition = condition.condition;
        record.conditionRing.material.color.set(CONDITION_COLORS[condition.condition]);
      }
    }

    if (condition !== null) {
      const remaining = Math.max(0, Math.min(1, (condition.expiresAtTick - tick) / CONDITION_DURATION_TICKS));
      record.plateCondition.style.setProperty("--remaining", String(remaining));
    }

    record.conditionRing.visible = condition !== null;

    const statuses: { kind: string; buff: boolean; stacks: number }[] = [];

    if (unit.alive && unit.control !== null) {
      statuses.push({ kind: unit.control.control, buff: false, stacks: 0 });
    }

    if (unit.alive && unit.taunt !== null) {
      statuses.push({ kind: "taunted", buff: false, stacks: 0 });
    }

    if (unit.alive) {
      for (const dot of unit.dots) {
        statuses.push({ kind: dot.dot, buff: false, stacks: dot.stacks });
      }
    }

    if (unit.alive && unit.invulnerableUntilTick !== 0) {
      statuses.push({ kind: "invulnerable", buff: true, stacks: 0 });
    }

    if (unit.alive && unit.untargetableUntilTick !== 0) {
      statuses.push({ kind: "untargetable", buff: true, stacks: 0 });
    }

    if (unit.alive && unit.link !== null) {
      statuses.push({ kind: "linked", buff: false, stacks: 0 });
    }

    if (unit.alive && unit.channel !== null) {
      statuses.push({ kind: "channeling", buff: true, stacks: 0 });
    }

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
    for (const marker of groundMarkers.values()) {
      marker.seen = false;
    }

    const spellKeys = new Set<string>();

    for (const impact of next.impacts) {
      const key = `impact-${impact.impactId}`;
      let marker = groundMarkers.get(key);

      if (marker === undefined) {
        const center = stage.toScene(impact.center, 0);
        const radius = impact.radiusUnits;
        marker = { mesh: groundRing(center.x, center.z, radius * 0.86, radius, IMPACT_COLOR, 0.55), seen: true };
        stage.scene.add(marker.mesh);
        groundMarkers.set(key, marker);
      }

      marker.seen = true;
      marker.mesh.material.opacity = 0.35 + 0.35 * Math.abs(Math.sin(next.tick / 3));
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
      const key = `zone-${zone.zoneId}`;
      let marker = groundMarkers.get(key);

      if (marker === undefined) {
        const center = stage.toScene(zone.center, 0);
        const radius = zone.radiusUnits;
        marker = { mesh: groundRing(center.x, center.z, radius * 0.15, radius, zoneColor(zone.abilityId), 0.28), seen: true };
        stage.scene.add(marker.mesh);
        groundMarkers.set(key, marker);
      }

      marker.seen = true;
      syncStateVisual(key, next.tick, spellKeys, () =>
        zoneVisual(stage.particles, zone.abilityId, stage.toScene(zone.center, 0), zone.radiusUnits, zone.zoneId),
      );
    }

    for (const [key, visual] of stateVisuals) {
      if (spellKeys.has(key)) {
        continue;
      }

      stateVisuals.delete(key);

      if (visual !== null) {
        visual.end();
        spellVisuals.add(visual);
      }
    }

    for (const [key, marker] of groundMarkers) {
      if (!marker.seen) {
        marker.mesh.removeFromParent();
        marker.mesh.geometry.dispose();
        marker.mesh.material.dispose();
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

    for (const record of records.values()) {
      const before = record.position.clone();
      record.position.lerp(record.destination, blend);
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
      record.figure.root.rotation.y = record.yaw;
      record.figure.root.scale.setScalar(record.state.alive && record.state.control?.control === "hexed" ? HEXED_SCALE : 1);
      record.figure.update(deltaSeconds);
      record.bubble.position.set(record.position.x, record.figure.height * 0.5, record.position.z);
      record.frost.position.set(record.position.x, 0.1, record.position.z);
      record.conditionRing.position.set(record.position.x, 0.14, record.position.z);
      record.plateTrail.step(deltaSeconds);

      const platePoint = stage.toScreen(record.position.clone().setY(record.figure.height + PLATE_GAP_UNITS));

      if (platePoint !== null) {
        record.plate.style.transform = `translate(${platePoint.x}px, ${platePoint.y}px) translate(-50%, -100%)`;
      }
    }
  }

  function stepEffects(deltaSeconds: number): void {
    for (let index = effects.length - 1; index >= 0; index -= 1) {
      const effect = effects[index]!;
      effect.age += deltaSeconds;
      const progress = Math.min(1, effect.age / effect.duration);
      effect.step(progress);

      if (progress >= 1) {
        effects.splice(index, 1);
        effect.onDone?.();
        disposeEffectObjects(effect);
      }
    }
  }

  const stopFrames = stage.onFrame((deltaSeconds) => {
    stepRecords(deltaSeconds);
    stepEffects(deltaSeconds);
    stepSpells(deltaSeconds);
    updateSelection();
    updateTargetLines();
  });

  function handleClick(event: MouseEvent): void {
    const rect = stage.canvas.getBoundingClientRect();
    const clickX = event.clientX - rect.left;
    const clickY = event.clientY - rect.top;
    let closest: UnitRecord | null = null;
    let closestDistance = PICK_RADIUS_PIXELS;

    for (const record of records.values()) {
      const point = stage.toScreen(chestOf(record));

      if (point === null) {
        continue;
      }

      const distance = Math.hypot(point.x - clickX, point.y - clickY);

      if (distance < closestDistance) {
        closest = record;
        closestDistance = distance;
      }
    }

    if (closest !== null) {
      options.onSelectUnit(closest.unitId);
    }
  }

  stage.canvas.addEventListener("click", handleClick);

  return {
    update(next, nextSelectedUnitId, latestEvents) {
      stage.showBoard(snapshotGrid(next), options.viewSide, options.insets);

      const snapAll = snapshot === null || next.tick < lastTick || next.tick - lastTick > TICK_JUMP_FOR_SNAP;
      snapshot = next;
      selectedUnitId = nextSelectedUnitId;
      lastTick = next.tick;

      if (snapAll) {
        chainTargets.clear();
        falling.reset();
        stage.particles.clear();
      }

      syncRecords(next, snapAll);
      syncGroundMarkers(next);

      if (snapAll) {
        return;
      }

      for (const event of latestEvents) {
        handleEvent(event);
      }

      falling.sync(next.impacts, next.tick, (impactId) => {
        const impact = next.impacts.find((candidate) => candidate.impactId === impactId);

        return impact === undefined ? undefined : panAt(stage.toScene(impact.center, 0));
      });
    },

    dispose() {
      stopFrames();
      stage.canvas.removeEventListener("click", handleClick);
      stage.particles.clear();

      for (const effect of effects) {
        disposeEffectObjects(effect);
      }

      effects.length = 0;

      for (const visual of spellVisuals) {
        visual.dispose();
      }

      spellVisuals.clear();

      for (const visual of stateVisuals.values()) {
        visual?.dispose();
      }

      stateVisuals.clear();

      for (const record of records.values()) {
        removeRecord(record);
      }

      records.clear();

      for (const marker of groundMarkers.values()) {
        marker.mesh.removeFromParent();
        marker.mesh.geometry.dispose();
        marker.mesh.material.dispose();
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

      for (const geometry of [bubbleGeometry, frostGeometry, sparkGeometry, boltGeometry, selectionGeometry]) {
        geometry.dispose();
      }

      for (const element of stage.overlay.querySelectorAll(".float-number")) {
        element.remove();
      }
    },
  };
}
