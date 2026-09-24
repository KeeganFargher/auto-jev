import {
  AdditiveBlending,
  CanvasTexture,
  CircleGeometry,
  CylinderGeometry,
  DoubleSide,
  Mesh,
  MeshBasicMaterial,
  RepeatWrapping,
  RingGeometry,
  SRGBColorSpace,
  Vector3,
} from "three";
import type { BattleSnapshot, UnitState } from "@jev-game/game";
import type { BoardStage, ViewSide, ViewportInsets } from "./board-stage.js";
import { snapshotGrid } from "./battle-view.js";
import { easeInOut, easeOut } from "./easing.js";
import { createHeroFigure, type HeroFigure } from "./hero-figures.js";
import { playTeleport } from "../fx/battle-sounds.js";

export interface TeleportView {
  readonly warpSeconds: number | null;
  seek(seconds: number): void;
  dispose(): void;
}

export interface TeleportViewOptions {
  seconds: number;
  opening: BattleSnapshot;
  friendlyTeamId: string;
  homeTeamId: string;
  viewSide: ViewSide;
  insets: ViewportInsets;
}

const FRIENDLY_COLOR = "#4ea1ff";

const ENEMY_COLOR = "#ff6b6b";

const BEAM_HEIGHT = 44;

const BEAM_RADIUS = 4.2;

const BEAM_FLARE = 1.25;

const POOL_RADIUS = 7.5;

const RING_INNER_RADIUS = 4.4;

const RING_OUTER_RADIUS = 5.4;

const DEPART_START_SECONDS = 0.12;

const DEPART_SECONDS = 0.45;

const ARRIVE_SECONDS = 0.55;

const BEAT_SKIP_SECONDS = 0.25;

const SETTLE_SECONDS = 0.35;

const STAGGER_SECONDS = 0.08;

const MAX_SPREAD_SECONDS = 0.24;

const BEAM_RISE_SECONDS = 0.12;

const BEAM_FALL_SECONDS = 0.26;

const BEAM_OPEN_WIDTH = 0.3;

const BEAM_CLOSED_WIDTH = 0.15;

const TELEGRAPH_LEVEL = 0.35;

const SQUASH_SECONDS = 0.08;

const VANISH_SECONDS = 0.32;

const MATERIALIZE_DELAY_SECONDS = 0.1;

const MATERIALIZE_SECONDS = 0.32;

const TOUCHDOWN_SECONDS = 0.16;

const RING_SECONDS = 0.45;

const WARP_RISE_SECONDS = 0.12;

const WARP_FALL_SECONDS = 0.3;

const WARP_EXPOSURE = 2.4;

const SQUASH_WIDTH = 1.08;

const SQUASH_HEIGHT = 0.9;

const STRETCH_WIDTH = 0.12;

const STRETCH_HEIGHT = 2.3;

const LIFT_UNITS = 10;

const SQUASH_GLOW = 0.4;

const COOL_SECONDS = 0.45;

const SHADOW_MIN_WIDTH = 0.6;

const POOL_OPACITY = 0.75;

const RING_OPACITY = 0.9;

const RING_START_SCALE = 0.55;

const RING_END_SCALE = 1.7;

const STREAK_SPEED = 1.8;

const STREAK_COUNT = 28;

interface Pose {
  visible: boolean;
  width: number;
  height: number;
  lift: number;
  glow: number;
}

interface BeamState {
  level: number;
  width: number;
  upward: boolean;
}

interface Traveller {
  figure: HeroFigure;
  rest: Vector3;
  yaw: number;
  castsShadow: boolean;
  departAt: number | null;
  arriveAt: number | null;
  appearAt: number;
  telegraphFrom: number | null;
  beam: Mesh<CylinderGeometry, MeshBasicMaterial>;
  pool: Mesh<CircleGeometry, MeshBasicMaterial>;
  ring: Mesh<RingGeometry, MeshBasicMaterial>;
}

const REST: Pose = { visible: true, width: 1, height: 1, lift: 0, glow: 0 };

const HIDDEN: Pose = { visible: false, width: 1, height: 1, lift: 0, glow: 0 };

const DARK: BeamState = { level: 0, width: 1, upward: false };

function lerp(from: number, to: number, progress: number): number {
  return from + (to - from) * progress;
}

function createStreakTexture(): CanvasTexture {
  const width = 64;
  const height = 128;
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext("2d")!;
  context.fillStyle = "#6a6a6a";
  context.fillRect(0, 0, width, height);

  for (let index = 0; index < STREAK_COUNT; index += 1) {
    const x = Math.random() * width;
    const y = Math.random() * height;
    const thickness = 1 + Math.random() * 2;
    const length = 12 + Math.random() * 40;
    const shade = 170 + Math.floor(Math.random() * 85);
    context.fillStyle = `rgb(${shade} ${shade} ${shade})`;

    for (const wrapX of [0, -width]) {
      for (const wrapY of [0, -height]) {
        context.fillRect(x + wrapX, y + wrapY, thickness, length);
      }
    }
  }

  const texture = new CanvasTexture(canvas);
  texture.wrapS = RepeatWrapping;
  texture.wrapT = RepeatWrapping;
  texture.colorSpace = SRGBColorSpace;

  return texture;
}

function createFadeTexture(): CanvasTexture {
  const canvas = document.createElement("canvas");
  canvas.width = 4;
  canvas.height = 128;
  const context = canvas.getContext("2d")!;
  const gradient = context.createLinearGradient(0, 0, 0, canvas.height);
  gradient.addColorStop(0, "#000000");
  gradient.addColorStop(0.55, "#4d4d4d");
  gradient.addColorStop(0.9, "#e6e6e6");
  gradient.addColorStop(1, "#ffffff");
  context.fillStyle = gradient;
  context.fillRect(0, 0, canvas.width, canvas.height);

  return new CanvasTexture(canvas);
}

function createPoolTexture(): CanvasTexture {
  const size = 64;
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const context = canvas.getContext("2d")!;
  const gradient = context.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  gradient.addColorStop(0, "rgb(255 255 255 / 1)");
  gradient.addColorStop(0.4, "rgb(255 255 255 / 0.45)");
  gradient.addColorStop(1, "rgb(255 255 255 / 0)");
  context.fillStyle = gradient;
  context.fillRect(0, 0, size, size);

  const texture = new CanvasTexture(canvas);
  texture.colorSpace = SRGBColorSpace;

  return texture;
}

function glowMaterial(color: string): MeshBasicMaterial {
  return new MeshBasicMaterial({
    color,
    transparent: true,
    opacity: 0,
    blending: AdditiveBlending,
    depthWrite: false,
  });
}

function pulse(local: number, duration: number, floor: number): Omit<BeamState, "upward"> | null {
  if (local < 0 || local >= duration) {
    return null;
  }

  if (local < BEAM_RISE_SECONDS) {
    const progress = easeOut(local / BEAM_RISE_SECONDS);

    return { level: lerp(floor, 1, progress), width: lerp(BEAM_OPEN_WIDTH, 1, progress) };
  }

  const fallStart = duration - BEAM_FALL_SECONDS;

  if (local < fallStart) {
    return { level: 1, width: 1 };
  }

  const progress = easeOut((local - fallStart) / BEAM_FALL_SECONDS);

  return { level: 1 - progress, width: lerp(1, BEAM_CLOSED_WIDTH, progress) };
}

function ringProgress(start: number | null, time: number): number | null {
  if (start === null) {
    return null;
  }

  const progress = (time - start) / RING_SECONDS;

  return progress >= 0 && progress < 1 ? progress : null;
}

function spreadStep(count: number): number {
  return count > 1 ? Math.min(STAGGER_SECONDS, MAX_SPREAD_SECONDS / (count - 1)) : 0;
}

function screenRanks(units: readonly UnitState[], side: ViewSide, centreLine: number): Map<string, number> {
  const direction = side === "south" ? 1 : -1;

  const ordered = [...units].sort(
    (first, second) =>
      direction * (first.position.x - second.position.x) ||
      Math.abs(first.position.y - centreLine) - Math.abs(second.position.y - centreLine),
  );

  return new Map(ordered.map((unit, rank) => [unit.unitId, rank]));
}

export function createTeleportView(stage: BoardStage, options: TeleportViewOptions): TeleportView {
  const { opening } = options;
  const grid = snapshotGrid(opening);
  const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const isAway = options.friendlyTeamId !== options.homeTeamId;

  stage.showBoard(grid, options.viewSide, options.insets);

  const beamGeometry = new CylinderGeometry(BEAM_RADIUS * BEAM_FLARE, BEAM_RADIUS, BEAM_HEIGHT, 28, 1, true);
  beamGeometry.translate(0, BEAM_HEIGHT / 2, 0);
  const poolGeometry = new CircleGeometry(POOL_RADIUS, 32);
  const ringGeometry = new RingGeometry(RING_INNER_RADIUS, RING_OUTER_RADIUS, 48);
  const streaksDown = createStreakTexture();
  const streaksUp = createStreakTexture();
  const fadeTexture = createFadeTexture();
  const poolTexture = createPoolTexture();

  const travelling = opening.units.filter((unit) => unit.teamId !== options.homeTeamId);
  const step = spreadStep(travelling.length);
  const spread = step * Math.max(0, travelling.length - 1);
  const arriveStart = options.seconds - SETTLE_SECONDS - ARRIVE_SECONDS - spread;
  const departEnd = DEPART_START_SECONDS + spread + VANISH_SECONDS;
  const warpPeak = (departEnd + arriveStart) / 2;
  const ranks = screenRanks(travelling, options.viewSide, grid.height / 2);
  const facing = options.viewSide === "south" ? Math.PI : 0;
  let time = 0;

  const travellers: Traveller[] = opening.units.map((unit) => {
    const isFriendly = unit.teamId === options.friendlyTeamId;
    const color = isFriendly ? FRIENDLY_COLOR : ENEMY_COLOR;
    const rank = ranks.get(unit.unitId);
    const isTravelling = rank !== undefined;
    const figure = createHeroFigure(unit.heroId);
    figure.setTeamColor(color);
    stage.scene.add(figure.root);

    const beam = new Mesh(
      beamGeometry,
      new MeshBasicMaterial({
        color,
        map: streaksDown,
        alphaMap: fadeTexture,
        transparent: true,
        opacity: 0,
        blending: AdditiveBlending,
        depthWrite: false,
        side: DoubleSide,
      }),
    );

    const pool = new Mesh(poolGeometry, glowMaterial(color));
    pool.material.map = poolTexture;
    pool.rotation.x = -Math.PI / 2;

    const ring = new Mesh(ringGeometry, glowMaterial(color));
    ring.rotation.x = -Math.PI / 2;

    const rest = stage.toScene(unit.position, 0);
    beam.position.copy(rest);
    pool.position.set(rest.x, 0.06, rest.z);
    ring.position.set(rest.x, 0.1, rest.z);
    stage.scene.add(beam, pool, ring);

    return {
      figure,
      rest,
      yaw: isFriendly ? facing : facing + Math.PI,
      castsShadow: true,
      departAt: isAway && isTravelling ? DEPART_START_SECONDS + rank * step : null,
      arriveAt: isTravelling ? arriveStart + rank * step : null,
      appearAt: isAway ? warpPeak : 0,
      telegraphFrom: !isAway && isTravelling ? DEPART_START_SECONDS : null,
      beam,
      pool,
      ring,
    };
  });

  function departurePose(local: number): Pose {
    if (local < 0) {
      return REST;
    }

    if (reducedMotion) {
      return local < BEAM_RISE_SECONDS ? { ...REST, glow: local / BEAM_RISE_SECONDS } : HIDDEN;
    }

    if (local >= VANISH_SECONDS) {
      return HIDDEN;
    }

    if (local < SQUASH_SECONDS) {
      const progress = easeOut(local / SQUASH_SECONDS);

      return {
        visible: true,
        width: lerp(1, SQUASH_WIDTH, progress),
        height: lerp(1, SQUASH_HEIGHT, progress),
        lift: 0,
        glow: SQUASH_GLOW * progress,
      };
    }

    const progress = easeInOut((local - SQUASH_SECONDS) / (VANISH_SECONDS - SQUASH_SECONDS));

    return {
      visible: true,
      width: lerp(SQUASH_WIDTH, STRETCH_WIDTH, progress),
      height: lerp(SQUASH_HEIGHT, STRETCH_HEIGHT, progress),
      lift: LIFT_UNITS * progress,
      glow: lerp(SQUASH_GLOW, 1, progress),
    };
  }

  function arrivalPose(local: number): Pose {
    const settling = local - MATERIALIZE_DELAY_SECONDS;

    if (settling < 0) {
      return HIDDEN;
    }

    const glow = 1 - easeOut(Math.min(1, settling / COOL_SECONDS));

    if (reducedMotion) {
      return { ...REST, glow };
    }

    const progress = easeOut(Math.min(1, settling / MATERIALIZE_SECONDS));

    return {
      visible: true,
      width: lerp(STRETCH_WIDTH, 1, progress),
      height: lerp(STRETCH_HEIGHT, 1, progress),
      lift: LIFT_UNITS * (1 - progress),
      glow,
    };
  }

  function crossed(beat: number | null, from: number, to: number): boolean {
    return beat !== null && from < beat && beat <= to;
  }

  function panAt(position: Vector3): number | undefined {
    const point = stage.toScreen(position);
    const width = stage.canvas.clientWidth;

    return point === null || width === 0 ? undefined : (point.x / width) * 2 - 1;
  }

  function playBeats(from: number, to: number): void {
    if (to <= from || to - from > BEAT_SKIP_SECONDS) {
      return;
    }

    for (const traveller of travellers) {
      if (crossed(traveller.departAt, from, to)) {
        playTeleport("out", panAt(traveller.rest));
      }

      if (crossed(traveller.arriveAt === null ? null : traveller.arriveAt + TOUCHDOWN_SECONDS, from, to)) {
        playTeleport("in", panAt(traveller.rest));
      }
    }

    if (isAway && crossed(warpPeak, from, to)) {
      playTeleport("warp", undefined);
    }
  }

  function poseOf(traveller: Traveller): Pose {
    if (traveller.arriveAt !== null && time >= traveller.arriveAt) {
      return arrivalPose(time - traveller.arriveAt);
    }

    if (traveller.departAt !== null) {
      return departurePose(time - traveller.departAt);
    }

    if (traveller.arriveAt !== null) {
      return HIDDEN;
    }

    return time >= traveller.appearAt ? REST : HIDDEN;
  }

  function beamOf(traveller: Traveller): BeamState {
    if (traveller.departAt !== null) {
      const departing = pulse(time - traveller.departAt, DEPART_SECONDS, 0);

      if (departing !== null) {
        return { ...departing, upward: true };
      }
    }

    if (traveller.arriveAt === null) {
      return DARK;
    }

    const telegraphed = traveller.telegraphFrom !== null;
    const arriving = pulse(time - traveller.arriveAt, ARRIVE_SECONDS, telegraphed ? TELEGRAPH_LEVEL : 0);

    if (arriving !== null) {
      return { ...arriving, upward: false };
    }

    if (traveller.telegraphFrom === null || time < traveller.telegraphFrom || time >= traveller.arriveAt) {
      return DARK;
    }

    const charge = easeInOut((time - traveller.telegraphFrom) / (traveller.arriveAt - traveller.telegraphFrom));

    return { level: TELEGRAPH_LEVEL * charge, width: BEAM_OPEN_WIDTH, upward: false };
  }

  function ringOf(traveller: Traveller): number | null {
    const touchdown = traveller.arriveAt === null ? null : traveller.arriveAt + TOUCHDOWN_SECONDS;
    const liftOff = traveller.departAt === null ? null : traveller.departAt + SQUASH_SECONDS;

    return ringProgress(touchdown, time) ?? ringProgress(liftOff, time);
  }

  function warpLevel(): number {
    if (!isAway || reducedMotion) {
      return 0;
    }

    if (time < warpPeak) {
      const rising = (time - (warpPeak - WARP_RISE_SECONDS)) / WARP_RISE_SECONDS;

      return rising <= 0 ? 0 : easeOut(rising);
    }

    const falling = (time - warpPeak) / WARP_FALL_SECONDS;

    return falling >= 1 ? 0 : 1 - easeOut(falling);
  }

  function applyTraveller(traveller: Traveller, deltaSeconds: number): void {
    const pose = poseOf(traveller);
    const root = traveller.figure.root;
    root.visible = pose.visible;
    root.position.set(traveller.rest.x, pose.lift, traveller.rest.z);
    root.scale.set(pose.width, pose.height, pose.width);
    root.rotation.y = traveller.yaw;
    traveller.figure.setGlow(pose.glow);
    traveller.figure.update(deltaSeconds);

    const castsShadow = pose.width >= SHADOW_MIN_WIDTH;

    if (castsShadow !== traveller.castsShadow) {
      traveller.castsShadow = castsShadow;

      root.traverse((node) => {
        node.castShadow = castsShadow;
      });
    }

    const beam = beamOf(traveller);
    const lit = beam.level > 0.001;
    traveller.beam.visible = lit;
    traveller.beam.scale.set(beam.width, 1, beam.width);
    traveller.beam.material.opacity = beam.level;
    traveller.beam.material.map = beam.upward ? streaksUp : streaksDown;
    traveller.pool.visible = lit;
    traveller.pool.material.opacity = POOL_OPACITY * beam.level;

    const ring = ringOf(traveller);
    traveller.ring.visible = ring !== null;

    if (ring !== null) {
      const spreadProgress = easeOut(ring);
      traveller.ring.scale.setScalar(reducedMotion ? 1 : lerp(RING_START_SCALE, RING_END_SCALE, spreadProgress));
      traveller.ring.material.opacity = RING_OPACITY * (1 - spreadProgress);
    }
  }

  const stopFrames = stage.onFrame((deltaSeconds) => {
    if (!reducedMotion) {
      streaksDown.offset.y = time * STREAK_SPEED;
      streaksUp.offset.y = -time * STREAK_SPEED;
    }

    for (const traveller of travellers) {
      applyTraveller(traveller, deltaSeconds);
    }

    stage.setExposure(1 + WARP_EXPOSURE * warpLevel());
  });

  return {
    warpSeconds: isAway ? warpPeak : null,

    seek(seconds) {
      const previous = time;
      time = Math.min(options.seconds, Math.max(0, seconds));
      playBeats(previous, time);
    },

    dispose() {
      stopFrames();
      stage.setExposure(1);

      for (const traveller of travellers) {
        traveller.figure.dispose();

        for (const mesh of [traveller.beam, traveller.pool, traveller.ring]) {
          mesh.removeFromParent();
          mesh.material.dispose();
        }
      }

      for (const geometry of [beamGeometry, poolGeometry, ringGeometry]) {
        geometry.dispose();
      }

      for (const texture of [streaksDown, streaksUp, fadeTexture, poolTexture]) {
        texture.dispose();
      }
    },
  };
}
