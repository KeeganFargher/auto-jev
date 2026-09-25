import {
  armyOfTheDead,
  emberTrail,
  voidheartBlast,
  avatarJudgment,
  corpseExplosion,
  fireball,
  firebolt,
  frostBolt,
  frozenOrb,
  glacialPrison,
  graveBolt,
  hallowedPath,
  hex,
  infernoBolt,
  judgment,
  lastStand,
  leapSlam,
  lichBolt,
  livingBomb,
  mechRocket,
  mechSuit,
  meteor,
  pandemic,
  plagueBloom,
  resurrection,
  sharedFate,
  shieldToss,
  spiteBolt,
  turret,
  turretBlast,
  whirlwind,
} from "@jev-game/content";
import { BLESSED_BURST, PLAGUE_BURST, TICK_SECONDS } from "@jev-game/game";
import {
  BoxGeometry,
  BufferGeometry,
  CircleGeometry,
  Color,
  ConeGeometry,
  CylinderGeometry,
  Float32BufferAttribute,
  Group,
  IcosahedronGeometry,
  Mesh,
  OctahedronGeometry,
  PlaneGeometry,
  Quaternion,
  RingGeometry,
  SphereGeometry,
  TorusGeometry,
  Vector3,
  type ColorRepresentation,
  type Material,
  type MeshBasicMaterial,
  type MeshStandardMaterial,
} from "three";
import { effectMaterials, releaseEffectMaterial, type MaterialPool } from "./effect-materials.js";
import { evilEye, fatePulse, fateWeb, hexHop, knellToll, omenEcho, SPITE_WINDUP_SECONDS, spiteNeedle, weaverSurge } from "./fate-visuals.js";
import { createTrail, type ParticleStyle, type ParticleSystem } from "./particles.js";

export interface SpellVisual {
  readonly root: Group;
  update(deltaSeconds: number): void;
  finished(): boolean;
  dispose(): void;
}

export interface TickedVisual extends SpellVisual {
  sync(tick: number): void;
  end(): void;
}

export interface ProjectileVisual {
  readonly objects: Mesh[];
  readonly seconds?: number;
  place(from: Vector3, to: Vector3, progress: number): void;
  dispose(): void;
}

export interface EmitterMotion {
  position: Vector3;
  velocity: Vector3;
  tick: number;
}

interface SpellGeometry {
  rock: BufferGeometry;
  shell: BufferGeometry;
  trail: BufferGeometry;
  dome: BufferGeometry;
  ring: BufferGeometry;
  flame: BufferGeometry;
  disc: BufferGeometry;
  core: BufferGeometry;
  corona: BufferGeometry;
}

interface SolidLook {
  color: ColorRepresentation;
  roughness: number;
  metalness?: number;
  emissive?: ColorRepresentation;
  emissiveIntensity?: number;
  opacity?: number;
  depthWrite?: boolean;
}

interface TickClock {
  sync(tick: number): void;
  advance(deltaSeconds: number): void;
  now(): number;
}

interface Tongue {
  mesh: Mesh;
  angle: number;
}

interface Debris {
  mesh: Mesh;
  direction: Vector3;
  reach: number;
  lift: number;
}

interface GroundFlame {
  mesh: Mesh;
  height: number;
  width: number;
  phase: number;
  speed: number;
}

interface Spike {
  mesh: Mesh;
  girth: number;
  height: number;
  delay: number;
}

interface Petal {
  mesh: Mesh;
  open: number;
  closed: number;
  size: number;
  phase: number;
}

type ImpactFactory = (
  particles: ParticleSystem,
  center: Vector3,
  radius: number,
  tick: number,
  landsAtTick: number,
) => TickedVisual;

type AreaFactory = (particles: ParticleSystem, center: Vector3, radius: number) => SpellVisual;

type CastFactory = (particles: ParticleSystem, center: Vector3, radius: number, origin: Vector3) => SpellVisual;

type ZoneFactory = (particles: ParticleSystem, center: Vector3, radius: number, seed: number, periodTicks: number) => TickedVisual;

type ProjectileFactory = (particles: ParticleSystem, from: Vector3) => ProjectileVisual;

type EmitterFactory = (particles: ParticleSystem, motion: EmitterMotion, seed: number) => TickedVisual;

const FIRE = new Color("#ff7a2a");

const CORE = new Color("#ffe7a3");

const EMBER = new Color("#ff4d1a");

const GOLD = new Color("#ffb627");

const ROCK = "#3b2a26";

const SCORCH = "#1f130e";

const UP = new Vector3(0, 1, 0);

const METEOR_REFERENCE_RADIUS = 15;

const FALL_STARTS_AT = 0.45;

const FALL_FROM = new Vector3(-30, 62, 4);

const MAX_LEAD_TICKS = 3;

const BLAST_SECONDS = 1.1;

const WARD_SECONDS = 0.8;

const GROUND_FADE_IN_SECONDS = 0.3;

const GROUND_FADE_OUT_SECONDS = 0.45;

const BLAST_TONGUES = 10;

const BLAST_DEBRIS = 8;

const WARD_TONGUES = 16;

const STEEL = "#8f9bb0";

const WOOD = "#5a3b22";

const DUST = "#5d5145";

const GHOST = new Color("#e8f1ff");

const OATH_GOLD = new Color("#ffd98a");

const SHIELD_FACE = "#7d8aa3";

const SHIELD_SPINS = 3;

const SHOCK_SECONDS = 0.7;

const SHOCK_PUFFS = 9;

const VORTEX_AXES = 4;

const VORTEX_TURNS_PER_SECOND = 1.15;

const VORTEX_FADE_IN_SECONDS = 0.2;

const VORTEX_FADE_OUT_SECONDS = 0.3;

const ICE_WHITE = new Color("#f2fdff");

const ICE = new Color("#9fe8ff");

const ICE_DEEP = new Color("#2f9fd0");

const ICE_BODY = "#cdf3ff";

const RIME = "#e3f7ff";

const STORM_CLOUD = "#8193ab";

const STORM_SHADE = "#1b2940";

const TOXIC = new Color("#a3e635");

const TOXIC_PALE = new Color("#ecfccb");

const TOXIC_DEEP = new Color("#3f6212");

const BLIGHT = new Color("#9b5cf6");

const PETAL = "#6b2d7b";

const PETAL_INNER = "#9a4aa8";

const PETAL_SHADE = "#35103f";

const SLUDGE = "#2f4a12";

const ORB_HEIGHT = 5.5;

const ORB_SHARDS = 5;

const ORB_FADE_IN_SECONDS = 0.15;

const ORB_FADE_OUT_SECONDS = 0.22;

const ORB_MIST_SPACING = 1.3;

const ORB_SNOW_PER_SECOND = 10;

const HAIL_HEIGHT = 36;

const HAIL_RADIUS = 16;

const HAIL_PUFFS = 7;

const HAIL_LEAN = 0.25;

const HAIL_PER_SECOND = 28;

const HAIL_FADE_SECONDS = 0.35;

const PRISON_SECONDS = 1.15;

const PRISON_RISE_SECONDS = 0.16;

const BLOOM_OPEN_SECONDS = 0.35;

const BLOOM_WILT_SECONDS = 0.5;

const BLOOM_PETALS = 6;

const BLOOM_SPORES_PER_SECOND = 9;

const BURST_SECONDS = 0.85;

const BURST_MIN_RADIUS = 7;

const BURST_HEIGHT = 4.5;

const PANDEMIC_SECONDS = 1.3;

const PANDEMIC_RAYS = 40;

const GLOB_SECONDS = 0.34;

const HOLY = new Color("#ffe39a");

const HOLY_WHITE = new Color("#fffaf0");

const HOLY_DEEP = new Color("#f0a93a");

const HAMMER_STONE = "#b8ab94";

const HAMMER_SPINS = 2.5;

const HAMMER_ARC = 2.4;

const HAMMER_TRAIL_SPACING = 0.8;

const NOVA_SECONDS = 0.65;

const NOVA_MIN_RADIUS = 6;

const PILLAR_SECONDS = 1.25;

const PILLAR_HEIGHT = 32;

const PILLAR_MIN_RADIUS = 8;

const HALLOW_RAYS = 8;

const HALLOW_FADE_IN_SECONDS = 0.2;

const HALLOW_FADE_OUT_SECONDS = 0.4;

const HALLOW_MOTES_PER_PULSE = 6;

const FATE = new Color("#e45cff");

const FATE_PALE = new Color("#fbe3ff");

const FATE_DEEP = new Color("#7a2bb8");

const CURSE_SECONDS = 0.7;

const CURSE_MIN_RADIUS = 5;

const WEAVER_PASSIVE = "threads";

const HARVEST_PASSIVE = "harvest";

const GRAVE = new Color("#17c99a");

const GRAVE_PALE = new Color("#e4fff4");

const GRAVE_DEEP = new Color("#17614d");

const BONE = new Color("#efe4c8");

const BONE_BLAST_SECONDS = 0.8;

const BONE_BLAST_MIN_RADIUS = 8;

const BONE_SHARDS = 12;

const RISE_SECONDS = 1.1;

const RISE_HEIGHT = 16;

const RISE_MIN_RADIUS = 6;

const GRAVE_NOVA_SECONDS = 0.9;

const SOUL_BOLT_SECONDS = 0.22;

const SOUL_WISP_SECONDS = 0.55;

const SOUL_WISP_ARC = 6;

const GRAVE_TRAIL_SPACING = 0.6;

const BRASS = new Color("#d99a3e");

const BRASS_HOT = new Color("#ffb85c");

const IRON = "#3f444c";

const STEAM = new Color("#b9c4c8");

const SHRAPNEL_SECONDS = 0.75;

const SHRAPNEL_MIN_RADIUS = 6;

const SHRAPNEL_PIECES = 10;

const MECH_SECONDS = 0.9;

const MECH_PLATES = 8;

const MECH_SNAP = 0.45;

const DROP_SECONDS = 0.6;

const ROCKET_SECONDS = 0.3;

const ROCKET_ARC = 3;

const ROCKET_EMBER_SPACING = 0.7;

const ROCKET_SMOKE_SPACING = 1.6;

export interface LeapArc {
  seconds: number;
  height: number;
}

const LEAPS = new Map<string, LeapArc>([[leapSlam.id, { seconds: 0.36, height: 9 }]]);

const BLAST_EMBERS = 56;

const BLAST_SMOKE = 16;

const WARD_EMBER_RAYS = 28;

const FIREBALL_EMBER_SPACING = 0.9;

const FIREBALL_SMOKE_SPACING = 2.6;

const METEOR_EMBER_SPACING = 1.4;

const METEOR_SMOKE_SPACING = 3.2;

const GROUND_EMBERS_PER_SECOND = 4;

const GROUND_EMBERS_PER_UNIT = 0.6;

const GROUND_SMOKE_PER_SECOND = 1.2;

const EMBERS: ParticleStyle = {
  blend: "solid",
  from: GOLD,
  to: EMBER,
  brightness: 1,
  opacity: 1,
  size: [1.8, 0.5],
  life: [0.5, 1],
  speed: [6, 16],
  cone: 0.9,
  spread: 0.6,
  gravity: -7,
  drag: 2.2,
  stretch: 0.02,
  softness: 0.3,
};

const SMOKE: ParticleStyle = {
  blend: "solid",
  from: new Color("#3d302b"),
  to: new Color("#6f6560"),
  brightness: 1,
  opacity: 0.4,
  size: [2.5, 7.5],
  life: [0.9, 1.6],
  speed: [2, 5],
  cone: 0.7,
  spread: 1.2,
  gravity: -4,
  drag: 1.4,
  stretch: 0,
  softness: 1,
};

const TRAIL_EMBERS: ParticleStyle = {
  ...EMBERS,
  size: [2, 0.4],
  life: [0.25, 0.45],
  speed: [1, 4],
  cone: 0.5,
  spread: 0.5,
  gravity: -3,
};

const SPARKS: ParticleStyle = {
  blend: "glow",
  from: BRASS_HOT,
  to: EMBER,
  brightness: 1,
  opacity: 0.85,
  size: [1.1, 0.2],
  life: [0.25, 0.55],
  speed: [10, 26],
  cone: 1.2,
  spread: 0.3,
  gravity: -18,
  drag: 1.6,
  stretch: 0.05,
  softness: 0.2,
};

const STEAM_PUFF: ParticleStyle = {
  blend: "solid",
  from: STEAM,
  to: new Color("#7d888d"),
  brightness: 1,
  opacity: 0.26,
  size: [2, 6],
  life: [0.6, 1.1],
  speed: [2, 6],
  cone: 0.8,
  spread: 1,
  gravity: -3,
  drag: 1.5,
  stretch: 0,
  softness: 1,
};

const TRAIL_SMOKE: ParticleStyle = {
  ...SMOKE,
  opacity: 0.3,
  size: [1.8, 4.5],
  life: [0.5, 0.9],
  speed: [0.5, 2],
};

const GROUND_EMBERS: ParticleStyle = {
  ...EMBERS,
  size: [1.3, 0.3],
  life: [0.6, 1.2],
  speed: [2, 5],
  cone: 0.35,
  spread: 0,
  gravity: -9,
  drag: 1.8,
};

const GROUND_SMOKE: ParticleStyle = {
  ...SMOKE,
  opacity: 0.22,
  speed: [1, 3],
  cone: 0.3,
  spread: 0.5,
};

const FROST_TRAIL: ParticleStyle = {
  blend: "glow",
  from: ICE_WHITE,
  to: ICE_DEEP,
  brightness: 1,
  opacity: 0.85,
  size: [1.6, 0.3],
  life: [0.2, 0.36],
  speed: [0.4, 1.8],
  cone: 0.8,
  spread: 0.3,
  gravity: 2,
  drag: 2,
  stretch: 0,
  softness: 0.5,
};

const HOLY_TRAIL: ParticleStyle = {
  blend: "glow",
  from: HOLY,
  to: HOLY_DEEP,
  brightness: 1,
  opacity: 0.85,
  size: [2.2, 0.4],
  life: [0.18, 0.32],
  speed: [0.4, 1.6],
  cone: 0.8,
  spread: 0.25,
  gravity: 0,
  drag: 2,
  stretch: 0,
  softness: 0.5,
};

const HOLY_MOTES: ParticleStyle = {
  blend: "glow",
  from: HOLY_WHITE,
  to: HOLY,
  brightness: 1,
  opacity: 0.9,
  size: [1.1, 0.3],
  life: [0.6, 1.1],
  speed: [4, 10],
  cone: 0.35,
  spread: 1.4,
  gravity: -6,
  drag: 1.5,
  stretch: 0,
  softness: 0.6,
};

const HOLY_SPARKS: ParticleStyle = {
  blend: "glow",
  from: HOLY_WHITE,
  to: HOLY_DEEP,
  brightness: 1,
  opacity: 1,
  size: [1.6, 0.4],
  life: [0.25, 0.45],
  speed: [20, 40],
  cone: Math.PI,
  spread: 0.5,
  gravity: 6,
  drag: 4,
  stretch: 0.03,
  softness: 0.3,
};

const FATE_SPARKS: ParticleStyle = {
  blend: "glow",
  from: FATE_PALE,
  to: FATE,
  brightness: 1,
  opacity: 1,
  size: [1.3, 0.3],
  life: [0.25, 0.45],
  speed: [14, 30],
  cone: Math.PI / 2,
  spread: 0.4,
  gravity: 0,
  drag: 4,
  stretch: 0.03,
  softness: 0.3,
};

const GRAVE_TRAIL: ParticleStyle = {
  blend: "glow",
  from: GRAVE_PALE,
  to: GRAVE,
  brightness: 1,
  opacity: 0.85,
  size: [1.3, 0.3],
  life: [0.2, 0.38],
  speed: [0.3, 1.4],
  cone: 0.8,
  spread: 0.2,
  gravity: 0,
  drag: 2,
  stretch: 0,
  softness: 0.5,
};

const GRAVE_WISPS: ParticleStyle = {
  blend: "glow",
  from: GRAVE_PALE,
  to: GRAVE,
  brightness: 1,
  opacity: 0.9,
  size: [1.2, 0.3],
  life: [0.6, 1.1],
  speed: [4, 12],
  cone: 0.45,
  spread: 1.2,
  gravity: -8,
  drag: 1.5,
  stretch: 0,
  softness: 0.6,
};

const GRAVE_DUST: ParticleStyle = {
  blend: "solid",
  from: new Color("#6f7d73"),
  to: new Color("#b9c4b5"),
  brightness: 1,
  opacity: 0.5,
  size: [2, 5],
  life: [0.5, 0.9],
  speed: [3, 8],
  cone: Math.PI,
  spread: 0.8,
  gravity: -2,
  drag: 2.2,
  stretch: 0,
  softness: 1,
};

const BONE_CHIPS: ParticleStyle = {
  blend: "solid",
  from: BONE,
  to: new Color("#b8ab8c"),
  brightness: 1,
  opacity: 1,
  size: [0.8, 0.5],
  life: [0.45, 0.8],
  speed: [18, 34],
  cone: 1.1,
  spread: 0.4,
  gravity: 40,
  drag: 0.6,
  stretch: 0.02,
  softness: 0.2,
};

const CURSE_SMOKE: ParticleStyle = {
  blend: "solid",
  from: new Color("#5b3a73"),
  to: new Color("#a58bb8"),
  brightness: 1,
  opacity: 0.5,
  size: [2.2, 5.5],
  life: [0.45, 0.8],
  speed: [2, 6],
  cone: Math.PI,
  spread: 0.8,
  gravity: -3,
  drag: 2.2,
  stretch: 0,
  softness: 1,
};

const ORB_MIST: ParticleStyle = {
  blend: "solid",
  from: new Color("#e6f8ff"),
  to: new Color("#8fcbe6"),
  brightness: 1,
  opacity: 0.35,
  size: [2.2, 5],
  life: [0.5, 0.9],
  speed: [0.3, 1.5],
  cone: Math.PI,
  spread: 1.2,
  gravity: 1,
  drag: 1.5,
  stretch: 0,
  softness: 1,
};

const SNOW: ParticleStyle = {
  blend: "glow",
  from: ICE_WHITE,
  to: ICE,
  brightness: 1,
  opacity: 0.9,
  size: [0.9, 0.5],
  life: [0.6, 1.1],
  speed: [1, 3],
  cone: 0.9,
  spread: 2.2,
  gravity: 6,
  drag: 1.2,
  stretch: 0,
  softness: 0.4,
};

const ICE_CHIPS: ParticleStyle = {
  blend: "solid",
  from: ICE_WHITE,
  to: new Color("#7fd3f0"),
  brightness: 1,
  opacity: 1,
  size: [1.5, 0.5],
  life: [0.35, 0.65],
  speed: [9, 20],
  cone: 1.1,
  spread: 0.8,
  gravity: 32,
  drag: 2.5,
  stretch: 0.03,
  softness: 0.2,
};

const HAIL: ParticleStyle = {
  blend: "solid",
  from: ICE_WHITE,
  to: new Color("#a9dcf2"),
  brightness: 1,
  opacity: 0.85,
  size: [0.9, 0.7],
  life: [0.65, 0.8],
  speed: [26, 34],
  cone: 0.12,
  spread: 0,
  gravity: 20,
  drag: 0.4,
  stretch: 0.05,
  softness: 0.3,
};

const SPORES: ParticleStyle = {
  blend: "glow",
  from: TOXIC_PALE,
  to: TOXIC,
  brightness: 0.9,
  opacity: 0.8,
  size: [1.1, 0.4],
  life: [0.9, 1.6],
  speed: [1.5, 4],
  cone: 0.7,
  spread: 1.2,
  gravity: -2.5,
  drag: 1.2,
  stretch: 0,
  softness: 0.5,
};

const MIASMA: ParticleStyle = {
  blend: "solid",
  from: new Color("#5d7a1f"),
  to: new Color("#3b3148"),
  brightness: 1,
  opacity: 0.3,
  size: [2.5, 6.5],
  life: [0.8, 1.4],
  speed: [1, 4],
  cone: 1.2,
  spread: 1.4,
  gravity: -1.5,
  drag: 1.6,
  stretch: 0,
  softness: 1,
};

const DROPLETS: ParticleStyle = {
  blend: "solid",
  from: new Color("#d9f99d"),
  to: new Color("#4d7c0f"),
  brightness: 1,
  opacity: 1,
  size: [1.5, 0.7],
  life: [0.45, 0.8],
  speed: [9, 22],
  cone: 1.05,
  spread: 0.8,
  gravity: 34,
  drag: 1.6,
  stretch: 0.02,
  softness: 0.25,
};

const GLOB_DRIP: ParticleStyle = {
  ...DROPLETS,
  size: [1.1, 0.4],
  life: [0.25, 0.45],
  speed: [0.5, 2],
  cone: 0.6,
  spread: 0.3,
  gravity: 18,
};

let shared: SpellGeometry | null = null;

function clamp01(value: number): number {
  return Math.min(1, Math.max(0, value));
}

function easeOut(value: number): number {
  return 1 - (1 - value) ** 3;
}

function easeOutBack(value: number): number {
  const overshoot = 1.70158;

  return 1 + (overshoot + 1) * (value - 1) ** 3 + overshoot * (value - 1) ** 2;
}

function random(seed: number): () => number {
  let state = Math.floor(Math.abs(seed)) % 4294967296;

  return () => {
    state = (state * 1664525 + 1013904223) % 4294967296;

    return state / 4294967296;
  };
}

function hashed(x: number, y: number, z: number): number {
  const value = Math.sin(x * 127.1 + y * 311.7 + z * 74.7) * 43758.5453;

  return value - Math.floor(value);
}

function rockGeometry(): BufferGeometry {
  const geometry = new IcosahedronGeometry(1, 1);
  const position = geometry.getAttribute("position");

  for (let index = 0; index < position.count; index += 1) {
    const x = position.getX(index);
    const y = position.getY(index);
    const z = position.getZ(index);
    const scale = 0.78 + 0.4 * hashed(Math.round(x * 100), Math.round(y * 100), Math.round(z * 100));
    position.setXYZ(index, x * scale, y * scale * 0.9, z * scale);
  }

  geometry.computeVertexNormals();

  return geometry;
}

export function iceChunkGeometry(): BufferGeometry {
  const geometry = new IcosahedronGeometry(1, 0);
  const position = geometry.getAttribute("position");

  for (let index = 0; index < position.count; index += 1) {
    const x = position.getX(index);
    const y = position.getY(index);
    const z = position.getZ(index);
    const scale = 0.84 + 0.32 * hashed(Math.round(x * 97), Math.round(y * 97), Math.round(z * 97));
    position.setXYZ(index, x * scale, y * scale, z * scale);
  }

  geometry.computeVertexNormals();

  return geometry;
}

function petalGeometry(): BufferGeometry {
  return new SphereGeometry(1, 12, 6).scale(0.5, 0.14, 1).translate(0, 0, 1);
}

function trailGeometry(): BufferGeometry {
  const geometry = new ConeGeometry(1, 1, 12, 4, true);
  const position = geometry.getAttribute("position");
  const colors: number[] = [];
  const shade = new Color();

  for (let index = 0; index < position.count; index += 1) {
    const along = position.getY(index) + 0.5;
    shade
      .copy(CORE)
      .lerp(FIRE, clamp01(along * 2))
      .lerp(new Color(0, 0, 0), clamp01(along * 1.2 - 0.2));
    colors.push(shade.r, shade.g, shade.b);
  }

  geometry.setAttribute("color", new Float32BufferAttribute(colors, 3));

  return geometry;
}

function flameGeometry(): BufferGeometry {
  const profile = [
    [0.08, 0.34],
    [0.24, 0.42],
    [0.46, 0.34],
    [0.7, 0.2],
    [0.88, 0.09],
  ];

  const segments = 12;
  const positions: number[] = [0, 0, 0];
  const colors: number[] = [];
  const indices: number[] = [];
  const shade = new Color();

  function paint(height: number): void {
    shade
      .copy(GOLD)
      .lerp(FIRE, clamp01(height * 2.2))
      .lerp(EMBER, clamp01(height * 1.8 - 0.7));
    colors.push(shade.r, shade.g, shade.b);
  }

  paint(0);

  for (const [height, radius] of profile) {
    for (let segment = 0; segment < segments; segment += 1) {
      const angle = (segment / segments) * Math.PI * 2 + height * 1.4;
      const lobe = 1 + 0.2 * Math.sin(3 * angle);
      positions.push(Math.cos(angle) * radius * lobe, height, Math.sin(angle) * radius * lobe);
      paint(height);
    }
  }

  positions.push(0, 1, 0);
  paint(1);
  const top = positions.length / 3 - 1;

  for (let segment = 0; segment < segments; segment += 1) {
    const next = (segment + 1) % segments;
    indices.push(0, 1 + next, 1 + segment);
  }

  for (let ring = 0; ring < profile.length - 1; ring += 1) {
    const low = 1 + ring * segments;
    const high = low + segments;

    for (let segment = 0; segment < segments; segment += 1) {
      const next = (segment + 1) % segments;
      indices.push(low + segment, high + next, high + segment, low + segment, low + next, high + next);
    }
  }

  const last = 1 + (profile.length - 1) * segments;

  for (let segment = 0; segment < segments; segment += 1) {
    const next = (segment + 1) % segments;
    indices.push(last + segment, last + next, top);
  }

  const geometry = new BufferGeometry();
  geometry.setAttribute("position", new Float32BufferAttribute(positions, 3));
  geometry.setAttribute("color", new Float32BufferAttribute(colors, 3));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();

  return geometry;
}

function jaggedDisc(radius: number, next: () => number): BufferGeometry {
  const segments = 36;
  const positions: number[] = [0, 0, 0];
  const indices: number[] = [];

  for (let segment = 0; segment < segments; segment += 1) {
    const angle = (segment / segments) * Math.PI * 2;
    const reach = radius * (0.78 + 0.3 * next());
    positions.push(Math.cos(angle) * reach, Math.sin(angle) * reach, 0);
    indices.push(0, 1 + segment, 1 + ((segment + 1) % segments));
  }

  const geometry = new BufferGeometry();
  geometry.setAttribute("position", new Float32BufferAttribute(positions, 3));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();

  return geometry;
}

function geometries(): SpellGeometry {
  shared ??= {
    rock: rockGeometry(),
    shell: new IcosahedronGeometry(1.28, 1),
    trail: trailGeometry(),
    dome: new SphereGeometry(1, 24, 10, 0, Math.PI * 2, 0, Math.PI / 2),
    ring: new RingGeometry(0.82, 1, 48),
    flame: flameGeometry(),
    disc: new CircleGeometry(1, 40),
    core: new SphereGeometry(1.2, 12, 8),
    corona: new SphereGeometry(2, 12, 8),
  };

  return shared;
}

function glowMaterial(color: Color, opacity: number): MeshBasicMaterial {
  const material = effectMaterials.glow.take();
  material.color.copy(color);
  material.opacity = opacity;

  return material;
}

function flameMaterial(opacity: number): MeshBasicMaterial {
  const material = effectMaterials.flame.take();
  material.opacity = opacity;

  return material;
}

function rockMaterial(glow: number): MeshStandardMaterial {
  const material = effectMaterials.rock.take();
  material.color.set(ROCK);
  material.emissive.copy(EMBER);
  material.emissiveIntensity = glow;

  return material;
}

function scorchMaterial(color: ColorRepresentation, opacity: number): MeshBasicMaterial {
  const material = effectMaterials.scorch.take();
  material.color.set(color);
  material.opacity = opacity;

  return material;
}

function veilMaterial(color: ColorRepresentation, opacity: number): MeshBasicMaterial {
  const material = effectMaterials.veil.take();
  material.color.set(color);
  material.opacity = opacity;

  return material;
}

function coreMaterial(color: ColorRepresentation): MeshBasicMaterial {
  const material = effectMaterials.core.take();
  material.color.set(color);

  return material;
}

function solidMaterial(kind: MaterialPool<MeshStandardMaterial>, look: SolidLook): MeshStandardMaterial {
  const material = kind.take();
  material.color.set(look.color);
  material.roughness = look.roughness;
  material.metalness = look.metalness ?? 0;
  material.emissive.set(look.emissive ?? 0);
  material.emissiveIntensity = look.emissiveIntensity ?? 1;
  material.opacity = look.opacity ?? 1;
  material.depthWrite = look.depthWrite ?? true;

  return material;
}

function retire(root: Group, materials: readonly Material[]): void {
  root.removeFromParent();

  for (const material of materials) {
    releaseEffectMaterial(material);
  }
}

function retireProjectile(meshes: readonly Mesh<BufferGeometry, Material>[], owned: readonly BufferGeometry[]): void {
  for (const mesh of meshes) {
    mesh.removeFromParent();
    releaseEffectMaterial(mesh.material);
  }

  for (const geometry of owned) {
    geometry.dispose();
  }
}

function tickClock(start: number): TickClock {
  let tick = start;
  let since = 0;
  let rate = 1 / TICK_SECONDS;

  return {
    sync(next) {
      if (next === tick) {
        return;
      }

      if (since > 0 && next > tick) {
        const measured = (next - tick) / since;
        rate = Math.min(Math.max(rate * 0.5 + measured * 0.5, 0.25 / TICK_SECONDS), 8 / TICK_SECONDS);
      }

      tick = next;
      since = 0;
    },

    advance(deltaSeconds) {
      since += deltaSeconds;
    },

    now() {
      return tick + Math.min(since * rate, MAX_LEAD_TICKS);
    },
  };
}

function tilted(mesh: Mesh, angle: number, lean: number): void {
  const tangent = new Vector3(-Math.sin(angle), 0, Math.cos(angle));
  mesh.quaternion.setFromAxisAngle(tangent, -lean);
}

function meteorFall(
  particles: ParticleSystem,
  center: Vector3,
  radius: number,
  tick: number,
  landsAtTick: number,
): TickedVisual {
  const kit = geometries();
  const size = radius / METEOR_REFERENCE_RADIUS;
  const clock = tickClock(tick);
  const span = Math.max(1, landsAtTick - tick);
  const stone = rockMaterial(0.55);
  const shellSurface = glowMaterial(FIRE, 0.7);

  const trailSurface = effectMaterials.trail.take();
  const shadowSurface = scorchMaterial(SCORCH, 0);
  const rock = new Mesh(kit.rock, stone);
  const shell = new Mesh(kit.shell, shellSurface);
  const trail = new Mesh(kit.trail, trailSurface);
  const shadow = new Mesh(kit.disc, shadowSurface);
  const body = new Group();
  const root = new Group();
  const target = new Vector3(center.x, 1.2 * size, center.z);
  const start = target.clone().addScaledVector(FALL_FROM, size);
  const back = start.clone().sub(target).normalize();
  const embers = createTrail(particles, TRAIL_EMBERS, METEOR_EMBER_SPACING, start);
  const smoke = createTrail(particles, TRAIL_SMOKE, METEOR_SMOKE_SPACING, start);
  trail.quaternion.setFromUnitVectors(UP, back);
  trail.scale.set(0.95, 7, 0.95);
  trail.position.copy(back).multiplyScalar(3.5);
  body.add(rock, shell, trail);
  body.scale.setScalar(3.4 * size);
  body.visible = false;
  shadow.rotation.x = -Math.PI / 2;
  shadow.position.set(center.x, 0.22, center.z);
  root.add(body, shadow);
  let ended = false;

  return {
    root,

    sync(next) {
      clock.sync(next);
    },

    update(deltaSeconds) {
      clock.advance(deltaSeconds);
      const progress = clamp01((clock.now() - tick) / span);
      const fall = clamp01((progress - FALL_STARTS_AT) / (1 - FALL_STARTS_AT));
      body.visible = !ended && progress >= FALL_STARTS_AT && progress < 1;
      body.position.lerpVectors(start, target, fall * fall);

      if (body.visible) {
        embers.follow(body.position);
        smoke.follow(body.position);
      }

      rock.rotation.x += deltaSeconds * 2.6;
      rock.rotation.y += deltaSeconds * 3.1;
      shadowSurface.opacity = ended ? 0 : 0.12 + 0.38 * fall;
      shadow.scale.setScalar(radius * (0.25 + 0.45 * fall));
    },

    end() {
      ended = true;
      body.visible = false;
      shadowSurface.opacity = 0;
    },

    finished() {
      return ended;
    },

    dispose() {
      retire(root, [stone, shellSurface, trailSurface, shadowSurface]);
    },
  };
}

function meteorBlast(particles: ParticleSystem, center: Vector3, radius: number): SpellVisual {
  const kit = geometries();
  const next = random(center.x * 7 + center.z * 13);
  const domeSurface = glowMaterial(FIRE, 0.9);
  const flashSurface = glowMaterial(CORE, 1);
  const ringSurface = glowMaterial(EMBER, 0.9);
  const tongueSurface = flameMaterial(1);
  const debrisSurface = rockMaterial(0.4);
  const root = new Group();
  const dome = new Mesh(kit.dome, domeSurface);
  const flash = new Mesh(kit.dome, flashSurface);
  const ring = new Mesh(kit.ring, ringSurface);
  const tongues: Tongue[] = [];
  const debris: Debris[] = [];
  root.position.set(center.x, 0, center.z);
  ring.rotation.x = -Math.PI / 2;
  ring.position.y = 0.25;
  root.add(dome, flash, ring);
  const origin = new Vector3(center.x, 1, center.z);
  particles.emit({ ...EMBERS, speed: [radius * 0.9, radius * 2.2], cone: 1.1 }, origin, UP, BLAST_EMBERS);
  particles.emit({ ...SMOKE, spread: radius * 0.35, speed: [radius * 0.2, radius * 0.5] }, origin, UP, BLAST_SMOKE);

  for (let index = 0; index < BLAST_TONGUES; index += 1) {
    const angle = (index / BLAST_TONGUES) * Math.PI * 2 + next() * 0.4;
    const mesh = new Mesh(kit.flame, tongueSurface);
    mesh.position.set(Math.cos(angle) * radius * 0.42, 0, Math.sin(angle) * radius * 0.42);
    tilted(mesh, angle, 0.4);
    root.add(mesh);
    tongues.push({ mesh, angle });
  }

  for (let index = 0; index < BLAST_DEBRIS; index += 1) {
    const angle = next() * Math.PI * 2;
    const mesh = new Mesh(kit.rock, debrisSurface);
    mesh.scale.setScalar(0.5 + next() * 0.6);
    root.add(mesh);
    debris.push({
      mesh,
      direction: new Vector3(Math.cos(angle), 0, Math.sin(angle)),
      reach: radius * (0.7 + next() * 0.5),
      lift: radius * (0.6 + next() * 0.6),
    });
  }

  let age = 0;

  return {
    root,

    update(deltaSeconds) {
      age += deltaSeconds;
      const progress = clamp01(age / BLAST_SECONDS);
      dome.scale.setScalar(radius * (0.25 + 0.75 * easeOut(progress)));
      domeSurface.opacity = 0.9 * (1 - progress) ** 1.4;
      flash.scale.setScalar(radius * 0.35 * (1 + progress));
      flashSurface.opacity = clamp01(1 - progress / 0.3);
      ring.scale.setScalar(radius * (0.35 + 1.05 * progress));
      ringSurface.opacity = 0.9 * (1 - progress);
      const height = radius * 0.42 * Math.sin(Math.PI * clamp01(progress * 1.5));
      tongueSurface.opacity = 1 - clamp01((progress - 0.6) / 0.4);

      for (const tongue of tongues) {
        tongue.mesh.scale.set(radius * 0.13, Math.max(0.001, height), radius * 0.13);
      }

      for (const piece of debris) {
        piece.mesh.position.copy(piece.direction).multiplyScalar(piece.reach * easeOut(progress));
        piece.mesh.position.y = piece.lift * (1.6 * progress - 1.6 * progress * progress) + 0.6;
        piece.mesh.rotation.x += deltaSeconds * 5;
      }
    },

    finished() {
      return age >= BLAST_SECONDS;
    },

    dispose() {
      retire(root, [domeSurface, flashSurface, ringSurface, tongueSurface, debrisSurface]);
    },
  };
}

function burningGround(particles: ParticleSystem, center: Vector3, radius: number, seed: number): TickedVisual {
  const kit = geometries();
  const next = random(seed * 977 + 31);
  const scorchGeometry = jaggedDisc(radius * 0.92, next);
  const scorchSurface = scorchMaterial(SCORCH, 0);
  const fireSurface = flameMaterial(0);
  const glowSurface = glowMaterial(FIRE, 0);
  const root = new Group();
  const scorch = new Mesh(scorchGeometry, scorchSurface);
  const glow = new Mesh(kit.disc, glowSurface);
  const flames: GroundFlame[] = [];
  root.position.set(center.x, 0, center.z);
  scorch.rotation.x = -Math.PI / 2;
  scorch.position.y = 0.16;
  glow.rotation.x = -Math.PI / 2;
  glow.position.y = 0.2;
  glow.scale.setScalar(radius * 0.7);
  root.add(scorch, glow);
  const count = 5 + Math.round(radius / 4);

  for (let index = 0; index < count; index += 1) {
    const angle = next() * Math.PI * 2;
    const distance = Math.sqrt(next()) * radius * 0.78;
    const height = radius * (0.3 + 0.18 * next());
    const mesh = new Mesh(kit.flame, fireSurface);
    mesh.position.set(Math.cos(angle) * distance, 0.1, Math.sin(angle) * distance);
    mesh.rotation.y = next() * Math.PI * 2;
    root.add(mesh);
    flames.push({ mesh, height, width: height * 0.42, phase: next() * Math.PI * 2, speed: 7 + next() * 5 });
  }

  let strength = 0;
  let ending = false;
  let time = 0;
  let emberDebt = 0;
  let smokeDebt = 0;
  const spot = new Vector3();

  function scatter(style: ParticleStyle): void {
    const angle = Math.random() * Math.PI * 2;
    const distance = Math.sqrt(Math.random()) * radius * 0.8;
    spot.set(center.x + Math.cos(angle) * distance, 0.4, center.z + Math.sin(angle) * distance);
    particles.emit(style, spot, UP, 1);
  }

  return {
    root,

    sync() {},

    update(deltaSeconds) {
      time += deltaSeconds;
      strength = ending
        ? Math.max(0, strength - deltaSeconds / GROUND_FADE_OUT_SECONDS)
        : Math.min(1, strength + deltaSeconds / GROUND_FADE_IN_SECONDS);
      scorchSurface.opacity = 0.62 * strength;
      fireSurface.opacity = 0.95 * strength;
      emberDebt += deltaSeconds * strength * (GROUND_EMBERS_PER_SECOND + radius * GROUND_EMBERS_PER_UNIT);
      smokeDebt += deltaSeconds * strength * GROUND_SMOKE_PER_SECOND;

      while (emberDebt >= 1) {
        emberDebt -= 1;
        scatter(GROUND_EMBERS);
      }

      while (smokeDebt >= 1) {
        smokeDebt -= 1;
        scatter(GROUND_SMOKE);
      }

      glowSurface.opacity = 0.22 * strength * (0.85 + 0.15 * Math.sin(time * 9));

      for (const flame of flames) {
        const flicker =
          1 +
          0.22 * Math.sin(time * flame.speed + flame.phase) +
          0.1 * Math.sin(time * flame.speed * 2.3 + flame.phase * 1.7);

        const sway = 1 - 0.08 * Math.sin(time * flame.speed * 1.3 + flame.phase);
        flame.mesh.scale.set(
          flame.width * sway,
          Math.max(0.001, flame.height * strength * flicker),
          flame.width * sway,
        );
      }
    },

    end() {
      ending = true;
    },

    finished() {
      return ending && strength <= 0;
    },

    dispose() {
      scorchGeometry.dispose();
      retire(root, [scorchSurface, fireSurface, glowSurface]);
    },
  };
}

function infernoBurst(particles: ParticleSystem, center: Vector3, radius: number): SpellVisual {
  const kit = geometries();
  const tongueSurface = flameMaterial(1);
  const ringSurface = glowMaterial(FIRE, 0.85);
  const flashSurface = glowMaterial(CORE, 0.9);
  const root = new Group();
  const ring = new Mesh(kit.ring, ringSurface);
  const flash = new Mesh(kit.dome, flashSurface);
  const tongues: Tongue[] = [];
  root.position.set(center.x, 0, center.z);
  ring.rotation.x = -Math.PI / 2;
  ring.position.y = 0.25;
  root.add(ring, flash);
  const origin = new Vector3(center.x, 1.2, center.z);
  const ray = new Vector3();
  const rayEmbers: ParticleStyle = { ...EMBERS, speed: [radius * 2.4, radius * 3.2], cone: 0.25, drag: 3, gravity: -4 };

  for (let index = 0; index < WARD_EMBER_RAYS; index += 1) {
    const angle = (index / WARD_EMBER_RAYS) * Math.PI * 2;
    particles.emit(rayEmbers, origin, ray.set(Math.cos(angle), 0.25, Math.sin(angle)).normalize(), 2);
  }

  for (let index = 0; index < WARD_TONGUES; index += 1) {
    const mesh = new Mesh(kit.flame, tongueSurface);
    const angle = (index / WARD_TONGUES) * Math.PI * 2;
    tilted(mesh, angle, 0.3);
    root.add(mesh);
    tongues.push({ mesh, angle });
  }

  let age = 0;

  return {
    root,

    update(deltaSeconds) {
      age += deltaSeconds;
      const progress = clamp01(age / WARD_SECONDS);
      const reach = radius * (0.15 + 0.85 * easeOut(progress));
      const height = radius * 0.38 * Math.sin(Math.PI * clamp01(progress * 1.25));
      tongueSurface.opacity = 1 - clamp01((progress - 0.55) / 0.45);
      ring.scale.setScalar(reach * 1.05);
      ringSurface.opacity = 0.85 * (1 - progress);
      flash.scale.setScalar(radius * 0.3 * (1 + progress));
      flashSurface.opacity = clamp01(0.9 - progress * 2);

      for (const tongue of tongues) {
        tongue.mesh.position.set(Math.cos(tongue.angle) * reach, 0, Math.sin(tongue.angle) * reach);
        tongue.mesh.scale.set(radius * 0.1, Math.max(0.001, height), radius * 0.1);
      }
    },

    finished() {
      return age >= WARD_SECONDS;
    },

    dispose() {
      retire(root, [tongueSurface, ringSurface, flashSurface]);
    },
  };
}

function fireballProjectile(particles: ParticleSystem, launch: Vector3): ProjectileVisual {
  const kit = geometries();
  const core = new Mesh(kit.core, coreMaterial(GOLD));
  const shell = new Mesh(kit.corona, glowMaterial(FIRE, 0.8));
  const tail = new Mesh(kit.trail, flameMaterial(0.9));
  const heading = new Vector3();
  const embers = createTrail(particles, TRAIL_EMBERS, FIREBALL_EMBER_SPACING, launch);
  const smoke = createTrail(particles, TRAIL_SMOKE, FIREBALL_SMOKE_SPACING, launch);

  return {
    objects: [core, shell, tail],

    place(from, to, progress) {
      core.position.lerpVectors(from, to, progress);
      shell.position.copy(core.position);
      heading.subVectors(from, to).normalize();
      tail.quaternion.setFromUnitVectors(UP, heading);
      tail.scale.set(1.3, 6, 1.3);
      tail.position.copy(core.position).addScaledVector(heading, 3);
      embers.follow(core.position);
      smoke.follow(core.position);
    },

    dispose() {
      retireProjectile([core, shell, tail], []);
    },
  };
}

function shockwave(flashColor: Color): AreaFactory {
  return (_particles, center, radius) => groundShockwave(center, radius, flashColor);
}

function groundShockwave(center: Vector3, radius: number, flashColor: Color): SpellVisual {
  const next = random(center.x * 11 + center.z * 5);
  const kit = geometries();
  const puffGeometry = new IcosahedronGeometry(1, 0);
  const dustSurface = veilMaterial(DUST, 0.75);
  const flashSurface = glowMaterial(flashColor, 0.85);
  const puffSurface = solidMaterial(effectMaterials.fadingRock, { color: DUST, roughness: 1, opacity: 0.9 });
  const root = new Group();
  const dust = new Mesh(kit.ring, dustSurface);
  const flash = new Mesh(kit.ring, flashSurface);
  const puffs: Debris[] = [];
  root.position.set(center.x, 0, center.z);
  dust.rotation.x = -Math.PI / 2;
  dust.position.y = 0.2;
  flash.rotation.x = -Math.PI / 2;
  flash.position.y = 0.24;
  root.add(dust, flash);

  for (let index = 0; index < SHOCK_PUFFS; index += 1) {
    const angle = (index / SHOCK_PUFFS) * Math.PI * 2 + next() * 0.5;
    const mesh = new Mesh(puffGeometry, puffSurface);
    root.add(mesh);
    puffs.push({ mesh, direction: new Vector3(Math.cos(angle), 0, Math.sin(angle)), reach: radius * (0.45 + next() * 0.3), lift: 1 + next() });
  }

  let age = 0;

  return {
    root,

    update(deltaSeconds) {
      age += deltaSeconds;
      const progress = clamp01(age / SHOCK_SECONDS);
      const spread = easeOut(progress);
      dust.scale.setScalar(radius * (0.3 + 0.95 * spread));
      dustSurface.opacity = 0.75 * (1 - progress);
      flash.scale.setScalar(radius * (0.2 + 1.1 * spread));
      flashSurface.opacity = 0.85 * clamp01(1 - progress / 0.45);

      for (const puff of puffs) {
        puff.mesh.position.copy(puff.direction).multiplyScalar(puff.reach * spread);
        puff.mesh.position.y = puff.lift * Math.sin(Math.PI * progress * 0.8);
        puff.mesh.scale.setScalar(0.9 + 1 * progress);
      }

      puffSurface.opacity = 0.9 * (1 - progress);
    },

    finished() {
      return age >= SHOCK_SECONDS;
    },

    dispose() {
      puffGeometry.dispose();
      retire(root, [dustSurface, flashSurface, puffSurface]);
    },
  };
}

function shieldDisc(): ProjectileVisual {
  const face = new Mesh(new CylinderGeometry(1.9, 1.9, 0.45, 18), solidMaterial(effectMaterials.solid, { color: SHIELD_FACE, metalness: 0.45, roughness: 0.45 }));
  const rim = new Mesh(new TorusGeometry(1.95, 0.32, 6, 18), solidMaterial(effectMaterials.solid, { color: OATH_GOLD, emissive: OATH_GOLD, emissiveIntensity: 0.25, roughness: 0.5 }));
  const glint = new Mesh(new SphereGeometry(0.7, 8, 6), glowMaterial(OATH_GOLD, 0.7));
  rim.rotation.x = Math.PI / 2;

  return {
    objects: [face, rim, glint],

    place(from, to, progress) {
      face.position.lerpVectors(from, to, progress);
      face.position.y += Math.sin(Math.PI * progress) * 1.5;
      rim.position.copy(face.position);
      glint.position.copy(face.position);
      face.rotation.y = progress * Math.PI * 2 * SHIELD_SPINS;
      rim.rotation.z = face.rotation.y;
    },

    dispose() {
      retireProjectile([face, rim, glint], [face.geometry, rim.geometry, glint.geometry]);
    },
  };
}

function bladeVortex(center: Vector3, radius: number, seed: number): TickedVisual {
  const handleGeometry = new BoxGeometry(0.55, 0.55, 4.8);
  const bladeGeometry = new BoxGeometry(3.8, 0.34, 2.7);
  const trailGeometry = new RingGeometry(radius * 0.66, radius * 0.9, 40, 1, 0, Math.PI * 0.55);
  const steelSurface = solidMaterial(effectMaterials.fadingSolid, { color: STEEL, emissive: GHOST, emissiveIntensity: 0.18, metalness: 0.5, roughness: 0.4, opacity: 0 });
  const woodSurface = solidMaterial(effectMaterials.fadingSolid, { color: WOOD, roughness: 0.9, opacity: 0 });
  const trailSurface = glowMaterial(GHOST, 0);
  const root = new Group();
  const spinner = new Group();
  const phase = random(seed * 131 + 7)() * Math.PI * 2;
  root.position.set(center.x, 0, center.z);
  root.add(spinner);

  for (let index = 0; index < VORTEX_AXES; index += 1) {
    const angle = (index / VORTEX_AXES) * Math.PI * 2;
    const axe = new Group();
    const handle = new Mesh(handleGeometry, woodSurface);
    const blade = new Mesh(bladeGeometry, steelSurface);
    const trail = new Mesh(trailGeometry, trailSurface);
    blade.position.set(0, 0, 2.5);
    axe.add(handle, blade);
    axe.position.set(Math.cos(angle) * radius * 0.78, 3.6, Math.sin(angle) * radius * 0.78);
    axe.rotation.y = -angle;
    trail.rotation.x = -Math.PI / 2;
    trail.rotation.z = angle;
    trail.position.y = 3.6;
    spinner.add(axe, trail);
  }

  let strength = 0;
  let ending = false;
  let time = 0;

  return {
    root,

    sync() {},

    update(deltaSeconds) {
      time += deltaSeconds;
      strength = ending
        ? Math.max(0, strength - deltaSeconds / VORTEX_FADE_OUT_SECONDS)
        : Math.min(1, strength + deltaSeconds / VORTEX_FADE_IN_SECONDS);
      spinner.rotation.y = phase - time * VORTEX_TURNS_PER_SECOND * Math.PI * 2;
      steelSurface.opacity = strength;
      woodSurface.opacity = strength;
      trailSurface.opacity = 0.35 * strength;

      for (const child of spinner.children) {
        if (child instanceof Group) {
          child.rotation.x = time * 14;
        }
      }
    },

    end() {
      ending = true;
    },

    finished() {
      return ending && strength <= 0;
    },

    dispose() {
      handleGeometry.dispose();
      bladeGeometry.dispose();
      trailGeometry.dispose();
      retire(root, [steelSurface, woodSurface, trailSurface]);
    },
  };
}

function iceMissile(length: number, girth: number): ProjectileFactory {
  return (particles, launch) => {
    const crystal = new Mesh(new OctahedronGeometry(1, 0), coreMaterial(ICE_WHITE));
    const halo = new Mesh(new OctahedronGeometry(1, 0), glowMaterial(ICE, 0.5));
    const mist = createTrail(particles, FROST_TRAIL, Math.max(0.5, girth * 1.4), launch);
    crystal.scale.set(girth, girth, length);
    halo.scale.set(girth * 2.2, girth * 2.2, length * 1.35);

    return {
      objects: [crystal, halo],

      place(from, to, progress) {
        crystal.position.lerpVectors(from, to, progress);
        crystal.lookAt(to);
        crystal.rotateZ(progress * 9);
        halo.position.copy(crystal.position);
        halo.quaternion.copy(crystal.quaternion);
        mist.follow(crystal.position);
      },

      dispose() {
        retireProjectile([crystal, halo], [crystal.geometry, halo.geometry]);
      },
    };
  };
}

function frozenOrbVisual(particles: ParticleSystem, motion: EmitterMotion, seed: number): TickedVisual {
  const next = random(seed * 613 + 17);
  const coreGeometry = new IcosahedronGeometry(1.5, 1);
  const shellGeometry = new IcosahedronGeometry(2.7, 0);
  const shardGeometry = new OctahedronGeometry(1, 0);
  const coreSurface = scorchMaterial(ICE_WHITE, 0);
  const shellSurface = glowMaterial(ICE, 0);
  const shardSurface = solidMaterial(effectMaterials.fadingRock, { color: ICE_BODY, emissive: ICE_DEEP, emissiveIntensity: 0.5, roughness: 0.2, opacity: 0 });
  const shadowSurface = scorchMaterial(ICE_DEEP, 0);
  const root = new Group();
  const body = new Group();
  const ring = new Group();
  const core = new Mesh(coreGeometry, coreSurface);
  const shell = new Mesh(shellGeometry, shellSurface);
  const shadow = new Mesh(geometries().disc, shadowSurface);
  shadow.rotation.x = -Math.PI / 2;
  shadow.position.y = 0.2;
  shadow.scale.setScalar(4.5);
  body.position.y = ORB_HEIGHT;
  body.add(core, shell, ring);
  root.add(body, shadow);

  for (let index = 0; index < ORB_SHARDS; index += 1) {
    const angle = (index / ORB_SHARDS) * Math.PI * 2;
    const shard = new Mesh(shardGeometry, shardSurface);
    shard.position.set(Math.cos(angle) * 3.4, (next() - 0.5) * 1.6, Math.sin(angle) * 3.4);
    shard.lookAt(shard.position.clone().multiplyScalar(2));
    shard.scale.set(0.35, 0.35, 1.1);
    ring.add(shard);
  }

  const clock = tickClock(motion.tick);
  const spot = new Vector3().copy(motion.position).setY(ORB_HEIGHT);
  const mist = createTrail(particles, ORB_MIST, ORB_MIST_SPACING, spot);
  let strength = 0;
  let ending = false;
  let time = 0;
  let snowDebt = 0;

  return {
    root,

    sync(tick) {
      clock.sync(tick);
    },

    update(deltaSeconds) {
      clock.advance(deltaSeconds);
      time += deltaSeconds;
      strength = ending
        ? Math.max(0, strength - deltaSeconds / ORB_FADE_OUT_SECONDS)
        : Math.min(1, strength + deltaSeconds / ORB_FADE_IN_SECONDS);

      if (!ending) {
        root.position.copy(motion.position).addScaledVector(motion.velocity, Math.max(0, clock.now() - motion.tick));
        root.position.y = 0;
        spot.copy(root.position).setY(ORB_HEIGHT);
        mist.follow(spot);
        snowDebt += deltaSeconds * ORB_SNOW_PER_SECOND;

        while (snowDebt >= 1) {
          snowDebt -= 1;
          particles.emit(SNOW, spot, UP, 1);
        }
      }

      const pulse = 0.85 + 0.15 * Math.sin(time * 9);
      body.scale.setScalar(ending ? 1 + (1 - strength) * 0.6 : 0.3 + 0.7 * strength);
      ring.rotation.y = time * 3.2;
      shell.rotation.x = time * 1.3;
      shell.rotation.y = -time * 1.7;
      coreSurface.opacity = strength;
      shellSurface.opacity = 0.42 * strength * pulse;
      shardSurface.opacity = 0.95 * strength;
      shadowSurface.opacity = 0.22 * strength;
    },

    end() {
      if (ending) {
        return;
      }

      ending = true;
      particles.emit(ICE_CHIPS, spot, UP, 16);
      particles.emit({ ...SNOW, speed: [4, 10], cone: Math.PI, life: [0.4, 0.8] }, spot, UP, 14);
    },

    finished() {
      return ending && strength <= 0;
    },

    dispose() {
      coreGeometry.dispose();
      shellGeometry.dispose();
      shardGeometry.dispose();
      retire(root, [coreSurface, shellSurface, shardSurface, shadowSurface]);
    },
  };
}

function hailCloud(particles: ParticleSystem, motion: EmitterMotion, seed: number): TickedVisual {
  const next = random(seed * 389 + 5);
  const puffGeometry = new IcosahedronGeometry(1, 1);

  const cloudSurface = solidMaterial(effectMaterials.fadingRock, {
    color: STORM_CLOUD,
    emissive: STORM_SHADE,
    emissiveIntensity: 0.5,
    roughness: 1,
    opacity: 0,
    depthWrite: false,
  });

  const shadowSurface = scorchMaterial(STORM_SHADE, 0);
  const root = new Group();
  const cloud = new Group();
  const shadow = new Mesh(geometries().disc, shadowSurface);
  root.position.copy(motion.position).setY(0);
  cloud.position.y = HAIL_HEIGHT;
  shadow.rotation.x = -Math.PI / 2;
  shadow.position.y = 0.21;
  shadow.scale.setScalar(HAIL_RADIUS * 1.1);
  root.add(cloud, shadow);

  for (let index = 0; index < HAIL_PUFFS; index += 1) {
    const angle = (index / HAIL_PUFFS) * Math.PI * 2 + next() * 0.6;
    const distance = index === 0 ? 0 : HAIL_RADIUS * (0.35 + 0.45 * next());
    const puff = new Mesh(puffGeometry, cloudSurface);
    const width = 4.5 + next() * 3.5;
    puff.position.set(Math.cos(angle) * distance, (next() - 0.5) * 2.5, Math.sin(angle) * distance);
    puff.scale.set(width, width * (0.22 + next() * 0.1), width * (0.8 + next() * 0.3));
    puff.rotation.y = next() * Math.PI;
    cloud.add(puff);
  }

  const drop = new Vector3();
  const down = new Vector3(0, -1, 0);
  let strength = 0;
  let ending = false;
  let hailDebt = 0;

  return {
    root,

    sync() {},

    update(deltaSeconds) {
      strength = ending
        ? Math.max(0, strength - deltaSeconds / HAIL_FADE_SECONDS)
        : Math.min(1, strength + deltaSeconds / HAIL_FADE_SECONDS);
      cloud.rotation.y += deltaSeconds * 0.25;
      cloudSurface.opacity = 0.32 * strength;
      shadowSurface.opacity = 0.16 * strength;
      hailDebt += deltaSeconds * strength * HAIL_PER_SECOND;

      while (hailDebt >= 1) {
        hailDebt -= 1;
        const angle = Math.random() * Math.PI * 2;
        const distance = Math.sqrt(Math.random()) * HAIL_RADIUS;
        drop.set(root.position.x + Math.cos(angle) * distance, HAIL_HEIGHT - 2, root.position.z + Math.sin(angle) * distance);
        particles.emit(HAIL, drop, down, 1);
      }
    },

    end() {
      ending = true;
    },

    finished() {
      return ending && strength <= 0;
    },

    dispose() {
      puffGeometry.dispose();
      retire(root, [cloudSurface, shadowSurface]);
    },
  };
}

function glacialEruption(particles: ParticleSystem, center: Vector3, radius: number): SpellVisual {
  const next = random(center.x * 17 + center.z * 3 + 11);
  const spikeGeometry = new ConeGeometry(1, 1, 5, 1).translate(0, 0.5, 0);
  const frostGeometry = jaggedDisc(radius, next);

  const iceSurface = solidMaterial(effectMaterials.rock, { color: ICE_BODY, emissive: ICE_DEEP, emissiveIntensity: 0.45, roughness: 0.25, metalness: 0.05 });
  const frostSurface = scorchMaterial(RIME, 0);
  const ringSurface = glowMaterial(ICE, 0.9);
  const root = new Group();
  const frost = new Mesh(frostGeometry, frostSurface);
  const ring = new Mesh(geometries().ring, ringSurface);
  const spikes: Spike[] = [];
  root.position.set(center.x, 0, center.z);
  frost.rotation.x = -Math.PI / 2;
  frost.position.y = 0.17;
  ring.rotation.x = -Math.PI / 2;
  ring.position.y = 0.27;
  root.add(frost, ring);
  const count = 10 + Math.round(radius / 2.5);

  for (let index = 0; index < count; index += 1) {
    const angle = next() * Math.PI * 2;
    const reach = 0.2 + 0.8 * Math.sqrt(next());
    const mesh = new Mesh(spikeGeometry, iceSurface);
    mesh.position.set(Math.cos(angle) * radius * reach, 0, Math.sin(angle) * radius * reach);
    tilted(mesh, angle, 0.15 + next() * 0.35);
    mesh.scale.set(0.001, 0.001, 0.001);
    root.add(mesh);
    spikes.push({ mesh, girth: 0.9 + next() * 1.1, height: (3.5 + next() * 4.5) * (1 - 0.4 * reach), delay: reach * 0.18 });
  }

  particles.emit({ ...ICE_CHIPS, speed: [radius * 0.6, radius * 1.3], cone: 1.2 }, new Vector3(center.x, 1, center.z), UP, 24);
  particles.emit({ ...SNOW, spread: radius * 0.5, speed: [2, 5], gravity: 2, life: [0.8, 1.4] }, new Vector3(center.x, 2, center.z), UP, 30);
  let age = 0;

  return {
    root,

    update(deltaSeconds) {
      age += deltaSeconds;
      const progress = clamp01(age / PRISON_SECONDS);
      const sink = clamp01((progress - 0.72) / 0.28);
      ring.scale.setScalar(radius * (0.2 + 0.9 * easeOut(clamp01(progress * 1.6))));
      ringSurface.opacity = 0.9 * (1 - progress);
      frost.scale.setScalar(0.3 + 0.7 * easeOut(clamp01(age / 0.22)));
      frostSurface.opacity = 0.5 * (1 - clamp01((progress - 0.55) / 0.45));

      for (const spike of spikes) {
        const rise = clamp01((age - spike.delay) / PRISON_RISE_SECONDS);
        const girth = rise <= 0 ? 0.001 : spike.girth * (1 - sink * 0.5);
        spike.mesh.scale.set(girth, Math.max(0.001, spike.height * easeOutBack(rise) * (1 - sink)), girth);
      }
    },

    finished() {
      return age >= PRISON_SECONDS;
    },

    dispose() {
      spikeGeometry.dispose();
      frostGeometry.dispose();
      retire(root, [iceSurface, frostSurface, ringSurface]);
    },
  };
}

function plagueFlower(particles: ParticleSystem, center: Vector3, radius: number, seed: number, periodTicks: number): TickedVisual {
  const next = random(seed * 251 + 97);
  const size = radius * 0.17;
  const leaf = petalGeometry();
  const bulbGeometry = new IcosahedronGeometry(1, 1);
  const stainGeometry = jaggedDisc(radius * 0.8, next);
  const petalSurface = solidMaterial(effectMaterials.rock, { color: PETAL, emissive: PETAL_SHADE, emissiveIntensity: 0.6, roughness: 0.85 });
  const innerSurface = solidMaterial(effectMaterials.rock, { color: PETAL_INNER, emissive: PETAL_SHADE, emissiveIntensity: 0.6, roughness: 0.8 });
  const bulbSurface = glowMaterial(TOXIC, 0);
  const coreSurface = coreMaterial(TOXIC_PALE);
  const stainSurface = scorchMaterial(SLUDGE, 0);
  const root = new Group();
  const bloom = new Group();
  const bulb = new Mesh(bulbGeometry, bulbSurface);
  const core = new Mesh(bulbGeometry, coreSurface);
  const stain = new Mesh(stainGeometry, stainSurface);
  const petals: Petal[] = [];
  root.position.set(center.x, 0, center.z);
  stain.rotation.x = -Math.PI / 2;
  stain.position.y = 0.15;
  bloom.position.y = 0.4;
  bloom.rotation.y = next() * Math.PI * 2;
  bulb.position.y = size * 0.45;
  core.position.y = size * 0.45;
  bloom.add(bulb, core);
  root.add(stain, bloom);

  function addPetals(count: number, surface: Material, scale: number, open: number, closed: number, offset: number): void {
    for (let index = 0; index < count; index += 1) {
      const pivot = new Group();
      const mesh = new Mesh(leaf, surface);
      pivot.rotation.y = ((index + offset) / count) * Math.PI * 2 + (next() - 0.5) * 0.2;
      pivot.add(mesh);
      bloom.add(pivot);
      petals.push({ mesh, open: open + (next() - 0.5) * 0.12, closed, size: size * scale * (0.9 + next() * 0.2), phase: next() * Math.PI * 2 });
    }
  }

  addPetals(BLOOM_PETALS, petalSurface, 1, 0.28, 1.35, 0);
  addPetals(BLOOM_PETALS - 1, innerSurface, 0.62, 0.62, 1.45, 0.5);
  const heart = new Vector3(center.x, 0.4 + size * 0.45, center.z);
  const puffStyle: ParticleStyle = { ...SPORES, speed: [radius * 1.2, radius * 1.8], cone: 0.25, drag: 2.2, gravity: -1, life: [0.5, 0.8] };
  const ray = new Vector3();
  const period = Math.max(1, periodTicks);
  let lastPulse: number | null = null;
  let flare = 0;
  let strength = 0;
  let ending = false;
  let time = 0;
  let sporeDebt = 0;

  function puff(): void {
    flare = 1;
    particles.emit(MIASMA, heart, UP, 5);

    for (let index = 0; index < 12; index += 1) {
      const angle = (index / 12) * Math.PI * 2 + Math.random() * 0.4;
      particles.emit(puffStyle, heart, ray.set(Math.cos(angle), 0.15, Math.sin(angle)).normalize(), 1);
    }
  }

  return {
    root,

    sync(tick) {
      if (ending || (lastPulse !== null && tick - lastPulse < period)) {
        return;
      }

      lastPulse = lastPulse === null ? tick : lastPulse + period * Math.floor((tick - lastPulse) / period);
      puff();
    },

    update(deltaSeconds) {
      time += deltaSeconds;
      strength = ending
        ? Math.max(0, strength - deltaSeconds / BLOOM_WILT_SECONDS)
        : Math.min(1, strength + deltaSeconds / BLOOM_OPEN_SECONDS);
      flare = Math.max(0, flare - deltaSeconds * 3);
      const openness = easeOut(strength);

      for (const petal of petals) {
        const sway = 0.04 * Math.sin(time * 2.2 + petal.phase);
        const tilt = ending ? petal.open - (1 - strength) * 0.6 : petal.closed + (petal.open - petal.closed) * openness;
        petal.mesh.rotation.x = -(tilt + sway);
        petal.mesh.scale.setScalar(Math.max(0.001, petal.size * (ending ? strength : 0.35 + 0.65 * openness)));
      }

      bulb.scale.setScalar(Math.max(0.001, size * (0.3 + 0.05 * Math.sin(time * 5) + 0.14 * flare) * strength));
      core.scale.setScalar(Math.max(0.001, size * 0.16 * strength));
      bulbSurface.opacity = (0.5 + 0.4 * flare) * strength;
      stainSurface.opacity = 0.42 * strength;
      sporeDebt += deltaSeconds * strength * BLOOM_SPORES_PER_SECOND;

      while (sporeDebt >= 1) {
        sporeDebt -= 1;
        particles.emit(SPORES, heart, UP, 1);
      }
    },

    end() {
      ending = true;
    },

    finished() {
      return ending && strength <= 0;
    },

    dispose() {
      leaf.dispose();
      bulbGeometry.dispose();
      stainGeometry.dispose();
      retire(root, [petalSurface, innerSurface, bulbSurface, coreSurface, stainSurface]);
    },
  };
}

function plagueBurst(particles: ParticleSystem, center: Vector3, radius: number): SpellVisual {
  const reach = Math.max(BURST_MIN_RADIUS, radius);
  const next = random(center.x * 29 + center.z * 7 + 3);
  const kit = geometries();
  const blobGeometry = new IcosahedronGeometry(1, 1);
  const splatGeometry = jaggedDisc(reach * 0.75, next);
  const blobSurface = glowMaterial(TOXIC, 0.85);
  const coreSurface = glowMaterial(TOXIC_PALE, 1);
  const ringSurface = glowMaterial(TOXIC, 0.9);
  const hazeSurface = glowMaterial(BLIGHT, 0.45);
  const splatSurface = scorchMaterial(SLUDGE, 0);
  const root = new Group();
  const blob = new Mesh(blobGeometry, blobSurface);
  const core = new Mesh(blobGeometry, coreSurface);
  const ring = new Mesh(kit.ring, ringSurface);
  const haze = new Mesh(kit.ring, hazeSurface);
  const splat = new Mesh(splatGeometry, splatSurface);
  root.position.set(center.x, 0, center.z);
  blob.position.y = BURST_HEIGHT;
  core.position.y = BURST_HEIGHT;
  ring.rotation.x = -Math.PI / 2;
  ring.position.y = 0.27;
  haze.rotation.x = -Math.PI / 2;
  haze.position.y = 0.25;
  splat.rotation.x = -Math.PI / 2;
  splat.position.y = 0.16;
  root.add(splat, haze, ring, blob, core);
  const origin = new Vector3(center.x, BURST_HEIGHT, center.z);
  particles.emit(DROPLETS, origin, UP, 24);
  particles.emit({ ...MIASMA, spread: reach * 0.3 }, origin, UP, 9);
  particles.emit({ ...SPORES, speed: [reach * 1.6, reach * 2.4], cone: Math.PI, drag: 3, life: [0.35, 0.6] }, origin, UP, 18);
  let age = 0;

  return {
    root,

    update(deltaSeconds) {
      age += deltaSeconds;
      const progress = clamp01(age / BURST_SECONDS);
      const swell = easeOut(clamp01(progress * 3));
      blob.scale.setScalar(reach * (0.18 + 0.32 * swell));
      blobSurface.opacity = 0.85 * (1 - progress) ** 1.6;
      core.scale.setScalar(Math.max(0.001, reach * 0.16 * (1 - progress)));
      coreSurface.opacity = clamp01(1 - progress * 2.2);
      ring.scale.setScalar(reach * (0.25 + 0.95 * easeOut(progress)));
      ringSurface.opacity = 0.9 * (1 - progress);
      haze.scale.setScalar(reach * (0.2 + 0.8 * easeOut(clamp01(progress * 1.3))));
      hazeSurface.opacity = 0.45 * (1 - progress);
      splat.scale.setScalar(0.5 + 0.5 * swell);
      splatSurface.opacity = 0.55 * (1 - clamp01((progress - 0.35) / 0.65));
    },

    finished() {
      return age >= BURST_SECONDS;
    },

    dispose() {
      blobGeometry.dispose();
      splatGeometry.dispose();
      retire(root, [blobSurface, coreSurface, ringSurface, hazeSurface, splatSurface]);
    },
  };
}

function pandemicWave(particles: ParticleSystem, center: Vector3, radius: number): SpellVisual {
  const reach = Math.max(20, radius);
  const frontGeometry = new RingGeometry(0.955, 1, 128);
  const hazeGeometry = new RingGeometry(0.78, 0.955, 128);
  const frontSurface = glowMaterial(TOXIC, 0.9);
  const hazeSurface = glowMaterial(BLIGHT, 0.4);
  const flashSurface = glowMaterial(TOXIC_PALE, 0.8);
  const root = new Group();
  const front = new Mesh(frontGeometry, frontSurface);
  const haze = new Mesh(hazeGeometry, hazeSurface);
  const flash = new Mesh(geometries().dome, flashSurface);
  root.position.set(center.x, 0, center.z);
  front.rotation.x = -Math.PI / 2;
  front.position.y = 0.3;
  haze.rotation.x = -Math.PI / 2;
  haze.position.y = 0.28;
  root.add(haze, front, flash);
  const origin = new Vector3(center.x, 1.5, center.z);
  const ray = new Vector3();
  const rays: ParticleStyle = { ...SPORES, size: [1.6, 0.6], speed: [48, 70], cone: 0.12, drag: 1.1, gravity: -1, life: [0.7, 1.1] };

  for (let index = 0; index < PANDEMIC_RAYS; index += 1) {
    const angle = (index / PANDEMIC_RAYS) * Math.PI * 2;
    particles.emit(rays, origin, ray.set(Math.cos(angle), 0.08, Math.sin(angle)).normalize(), 1);
  }

  particles.emit({ ...MIASMA, speed: [4, 10], cone: 0.5, spread: 2, gravity: -5, life: [1, 1.6] }, origin, UP, 14);
  particles.emit({ ...SPORES, speed: [6, 16], cone: 0.35, spread: 1.5, gravity: -3 }, origin, UP, 22);
  let age = 0;

  return {
    root,

    update(deltaSeconds) {
      age += deltaSeconds;
      const progress = clamp01(age / PANDEMIC_SECONDS);
      front.scale.setScalar(Math.max(0.01, reach * easeOut(progress)));
      frontSurface.opacity = 0.9 * (1 - progress) ** 1.3;
      haze.scale.setScalar(Math.max(0.01, reach * easeOut(clamp01(progress - 0.05))));
      hazeSurface.opacity = 0.4 * (1 - progress);
      flash.scale.setScalar(6 * (1 + progress));
      flashSurface.opacity = clamp01(0.8 - progress * 2.2);
    },

    finished() {
      return age >= PANDEMIC_SECONDS;
    },

    dispose() {
      frontGeometry.dispose();
      hazeGeometry.dispose();
      retire(root, [frontSurface, hazeSurface, flashSurface]);
    },
  };
}

function plagueGlob(particles: ParticleSystem, launch: Vector3): ProjectileVisual {
  const blob = new Mesh(new IcosahedronGeometry(1.1, 1), glowMaterial(TOXIC, 0.9));
  const core = new Mesh(new IcosahedronGeometry(0.55, 0), coreMaterial(TOXIC_DEEP));
  const drip = createTrail(particles, GLOB_DRIP, 0.9, launch);

  return {
    objects: [blob, core],
    seconds: GLOB_SECONDS,

    place(from, to, progress) {
      blob.position.lerpVectors(from, to, progress);
      blob.position.y += Math.sin(Math.PI * progress) * Math.min(8, from.distanceTo(to) * 0.3);
      blob.scale.setScalar(1 + 0.15 * Math.sin(progress * 18));
      core.position.copy(blob.position);
      drip.follow(blob.position);
    },

    dispose() {
      retireProjectile([blob, core], [blob.geometry, core.geometry]);
    },
  };
}

function hammerMissile(size: number): ProjectileFactory {
  return (particles, launch) => {
    const stone = solidMaterial(effectMaterials.rock, { color: HAMMER_STONE, emissive: HOLY_DEEP, emissiveIntensity: 0.3, roughness: 0.75 });
    const gold = solidMaterial(effectMaterials.solid, { color: OATH_GOLD, emissive: OATH_GOLD, emissiveIntensity: 0.55, metalness: 0.4, roughness: 0.4 });
    const head = new Mesh(new BoxGeometry(1.9 * size, 1.15 * size, 1.15 * size), stone);
    const band = new Mesh(new BoxGeometry(0.45 * size, 1.3 * size, 1.3 * size), gold);
    const handle = new Mesh(new CylinderGeometry(0.2 * size, 0.24 * size, 2.8 * size, 6), solidMaterial(effectMaterials.solid, { color: WOOD, roughness: 0.9 }));
    const halo = new Mesh(new SphereGeometry(1.2 * size, 10, 8), glowMaterial(HOLY_DEEP, 0.3));
    const trail = createTrail(particles, HOLY_TRAIL, HAMMER_TRAIL_SPACING, launch);
    const headOffset = new Vector3(0, 0.45 * size, 0);
    const handleOffset = new Vector3(0, -0.95 * size, 0);
    const center = new Vector3();
    const heading = new Vector3();
    const yaw = new Quaternion();
    const spin = new Quaternion();
    const turn = new Quaternion();
    const spot = new Vector3();
    const zAxis = new Vector3(0, 0, 1);

    function mount(mesh: Mesh, offset: Vector3): void {
      mesh.position.copy(spot.copy(offset).applyQuaternion(turn)).add(center);
      mesh.quaternion.copy(turn);
    }

    return {
      objects: [handle, head, band, halo],

      place(from, to, progress) {
        center.lerpVectors(from, to, progress);
        center.y += Math.sin(Math.PI * progress) * HAMMER_ARC;
        heading.subVectors(to, from).setY(0);
        yaw.setFromAxisAngle(UP, heading.lengthSq() > 0 ? Math.atan2(-heading.z, heading.x) : 0);
        spin.setFromAxisAngle(zAxis, -progress * Math.PI * 2 * HAMMER_SPINS);
        turn.copy(yaw).multiply(spin);
        mount(head, headOffset);
        mount(band, headOffset);
        mount(handle, handleOffset);
        halo.position.copy(head.position);
        trail.follow(head.position);
      },

      dispose() {
        retireProjectile([handle, head, band, halo], [handle.geometry, head.geometry, band.geometry, halo.geometry]);
      },
    };
  };
}

function holyNova(particles: ParticleSystem, center: Vector3, radius: number): SpellVisual {
  const reach = Math.max(NOVA_MIN_RADIUS, radius);
  const kit = geometries();
  const ringSurface = glowMaterial(HOLY, 0.95);
  const hazeSurface = glowMaterial(HOLY_DEEP, 0.45);
  const flashSurface = glowMaterial(HOLY_WHITE, 0.9);
  const root = new Group();
  const ring = new Mesh(kit.ring, ringSurface);
  const haze = new Mesh(kit.disc, hazeSurface);
  const flash = new Mesh(kit.dome, flashSurface);
  root.position.set(center.x, 0, center.z);
  ring.rotation.x = -Math.PI / 2;
  ring.position.y = 0.3;
  haze.rotation.x = -Math.PI / 2;
  haze.position.y = 0.26;
  root.add(haze, ring, flash);
  const origin = new Vector3(center.x, 3, center.z);
  particles.emit({ ...HOLY_SPARKS, speed: [reach * 1.8, reach * 3] }, origin, UP, 24);
  particles.emit(HOLY_MOTES, origin, UP, 10);
  let age = 0;

  return {
    root,

    update(deltaSeconds) {
      age += deltaSeconds;
      const progress = clamp01(age / NOVA_SECONDS);
      const spread = easeOut(progress);
      ring.scale.setScalar(reach * (0.2 + 0.85 * spread));
      ringSurface.opacity = 0.95 * (1 - progress);
      haze.scale.setScalar(reach * (0.15 + 0.8 * spread));
      hazeSurface.opacity = 0.45 * (1 - progress) ** 1.5;
      flash.scale.setScalar(3 + reach * 0.3 * spread);
      flashSurface.opacity = clamp01(0.9 - progress * 2.4);
    },

    finished() {
      return age >= NOVA_SECONDS;
    },

    dispose() {
      retire(root, [ringSurface, hazeSurface, flashSurface]);
    },
  };
}

function holyPillar(particles: ParticleSystem, center: Vector3, radius: number): SpellVisual {
  const reach = Math.max(PILLAR_MIN_RADIUS, radius);
  const beamGeometry = new CylinderGeometry(1, 1, 1, 24, 1, true);
  const beamSurface = glowMaterial(HOLY_DEEP, 0.35);
  const coreSurface = glowMaterial(HOLY, 0.5);
  const ringSurface = glowMaterial(HOLY, 0.55);
  const root = new Group();
  const beam = new Mesh(beamGeometry, beamSurface);
  const core = new Mesh(beamGeometry, coreSurface);
  const ring = new Mesh(geometries().ring, ringSurface);
  root.position.set(center.x, 0, center.z);
  ring.rotation.x = -Math.PI / 2;
  ring.position.y = 0.3;
  root.add(ring, beam, core);
  const foot = new Vector3(center.x, 1, center.z);
  particles.emit({ ...HOLY_MOTES, from: HOLY, speed: [8, 18], spread: 1.6, life: [0.8, 1.3] }, foot, UP, 16);
  particles.emit({ ...HOLY_SPARKS, from: HOLY, cone: 0.45, speed: [30, 55], gravity: -4 }, foot, UP, 8);
  let age = 0;

  return {
    root,

    update(deltaSeconds) {
      age += deltaSeconds;
      const progress = clamp01(age / PILLAR_SECONDS);
      const rise = easeOut(clamp01(progress * 4));
      const fade = 1 - clamp01((progress - 0.35) / 0.65);
      const height = Math.max(0.01, PILLAR_HEIGHT * rise);
      const girth = 2 * (1 - 0.45 * progress);
      beam.scale.set(girth, height, girth);
      beam.position.y = height / 2;
      core.scale.set(Math.max(0.01, 0.6 * fade), height, Math.max(0.01, 0.6 * fade));
      core.position.y = height / 2;
      beamSurface.opacity = 0.35 * fade;
      coreSurface.opacity = 0.5 * fade;
      ring.scale.setScalar(reach * (0.3 + 0.7 * easeOut(clamp01(progress * 1.6))));
      ringSurface.opacity = 0.55 * (1 - clamp01(progress * 1.4));
    },

    finished() {
      return age >= PILLAR_SECONDS;
    },

    dispose() {
      beamGeometry.dispose();
      retire(root, [beamSurface, coreSurface, ringSurface]);
    },
  };
}

function hallowedGround(particles: ParticleSystem, center: Vector3, radius: number, seed: number, periodTicks: number): TickedVisual {
  const rayGeometry = new PlaneGeometry(0.5, 1);
  const kit = geometries();
  const glowSurface = glowMaterial(HOLY, 0);
  const ringSurface = glowMaterial(HOLY_DEEP, 0);
  const raySurface = glowMaterial(HOLY_WHITE, 0);
  const root = new Group();
  const glow = new Mesh(kit.disc, glowSurface);
  const ring = new Mesh(kit.ring, ringSurface);
  const sun = new Group();
  root.position.set(center.x, 0, center.z);
  glow.rotation.x = -Math.PI / 2;
  glow.position.y = 0.2;
  glow.scale.setScalar(radius * 0.55);
  ring.rotation.x = -Math.PI / 2;
  ring.position.y = 0.22;
  ring.scale.setScalar(radius * 0.8);
  sun.position.y = 0.24;
  sun.rotation.y = random(seed * 197 + 13)() * Math.PI * 2;

  for (let index = 0; index < HALLOW_RAYS; index += 1) {
    const ray = new Mesh(rayGeometry, raySurface);
    const angle = (index / HALLOW_RAYS) * Math.PI * 2;
    ray.rotation.set(-Math.PI / 2, 0, angle);
    ray.position.set(Math.sin(angle) * radius * 0.42, 0, Math.cos(angle) * radius * 0.42);
    ray.scale.set(radius * 0.18, radius * 0.34, 1);
    sun.add(ray);
  }

  root.add(glow, ring, sun);
  const heart = new Vector3(center.x, 0.6, center.z);
  const period = Math.max(1, periodTicks);
  let lastPulse: number | null = null;
  let flare = 0;
  let strength = 0;
  let ending = false;
  let time = 0;

  return {
    root,

    sync(tick) {
      if (ending || (lastPulse !== null && tick - lastPulse < period)) {
        return;
      }

      lastPulse = lastPulse === null ? tick : lastPulse + period * Math.floor((tick - lastPulse) / period);
      flare = 1;
      particles.emit({ ...HOLY_MOTES, spread: radius * 0.35 }, heart, UP, HALLOW_MOTES_PER_PULSE);
    },

    update(deltaSeconds) {
      time += deltaSeconds;
      strength = ending
        ? Math.max(0, strength - deltaSeconds / HALLOW_FADE_OUT_SECONDS)
        : Math.min(1, strength + deltaSeconds / HALLOW_FADE_IN_SECONDS);
      flare = Math.max(0, flare - deltaSeconds * 2.5);
      glowSurface.opacity = (0.22 + 0.2 * flare) * strength;
      ringSurface.opacity = (0.5 + 0.3 * flare) * strength;
      raySurface.opacity = (0.35 + 0.35 * flare) * strength;
      sun.rotation.y += deltaSeconds * 0.4;
      sun.scale.setScalar(0.9 + 0.1 * Math.sin(time * 3) + 0.12 * flare);
    },

    end() {
      ending = true;
    },

    finished() {
      return ending && strength <= 0;
    },

    dispose() {
      rayGeometry.dispose();
      retire(root, [glowSurface, ringSurface, raySurface]);
    },
  };
}

function curseNova(particles: ParticleSystem, center: Vector3, radius: number): SpellVisual {
  const reach = Math.max(CURSE_MIN_RADIUS, radius);
  const kit = geometries();
  const flashPeak = 0.4;
  const ringSurface = glowMaterial(FATE, 0.9);
  const hazeSurface = glowMaterial(FATE_DEEP, 0.5);
  const flashSurface = glowMaterial(FATE, flashPeak);
  const root = new Group();
  const ring = new Mesh(kit.ring, ringSurface);
  const haze = new Mesh(kit.disc, hazeSurface);
  const flash = new Mesh(kit.dome, flashSurface);
  root.position.set(center.x, 0, center.z);
  ring.rotation.x = -Math.PI / 2;
  ring.position.y = 0.3;
  haze.rotation.x = -Math.PI / 2;
  haze.position.y = 0.26;
  root.add(haze, ring, flash);
  const heart = new Vector3(center.x, 2.5, center.z);
  particles.emit({ ...FATE_SPARKS, speed: [reach * 1.6, reach * 2.6] }, heart, UP, 10);
  particles.emit(CURSE_SMOKE, heart, UP, 10);
  let age = 0;

  return {
    root,

    update(deltaSeconds) {
      age += deltaSeconds;
      const progress = clamp01(age / CURSE_SECONDS);
      const spread = easeOut(progress);
      ring.scale.setScalar(reach * (0.15 + 0.85 * spread));
      ringSurface.opacity = 0.9 * (1 - progress);
      haze.scale.setScalar(reach * (0.1 + 0.8 * spread));
      hazeSurface.opacity = 0.5 * (1 - progress) ** 1.5;
      flash.scale.setScalar(2.5 + reach * 0.25 * spread);
      flashSurface.opacity = clamp01(flashPeak - progress * 2.6);
    },

    finished() {
      return age >= CURSE_SECONDS;
    },

    dispose() {
      retire(root, [ringSurface, hazeSurface, flashSurface]);
    },
  };
}

function boneBlast(particles: ParticleSystem, center: Vector3, radius: number): SpellVisual {
  const reach = Math.max(BONE_BLAST_MIN_RADIUS, radius);
  const kit = geometries();
  const next = random(center.x * 11 + center.z * 17);
  const shardGeometry = new BoxGeometry(0.35, 0.35, 2.2);
  const domeSurface = glowMaterial(GRAVE, 0.42);
  const flashSurface = glowMaterial(GRAVE, 0.6);
  const ringSurface = glowMaterial(BONE, 0.55);
  const shardSurface = solidMaterial(effectMaterials.solid, { color: BONE, roughness: 0.8, emissive: GRAVE_DEEP, emissiveIntensity: 0.4 });
  const root = new Group();
  const dome = new Mesh(kit.dome, domeSurface);
  const flash = new Mesh(kit.dome, flashSurface);
  const ring = new Mesh(kit.ring, ringSurface);
  const shards: Debris[] = [];
  root.position.set(center.x, 0, center.z);
  ring.rotation.x = -Math.PI / 2;
  ring.position.y = 0.25;
  root.add(dome, flash, ring);
  const origin = new Vector3(center.x, 1.2, center.z);
  particles.emit({ ...BONE_CHIPS, speed: [reach * 1.6, reach * 3] }, origin, UP, 18);
  particles.emit({ ...GRAVE_DUST, spread: reach * 0.3 }, origin, UP, 10);
  particles.emit(GRAVE_WISPS, origin, UP, 8);

  for (let index = 0; index < BONE_SHARDS; index += 1) {
    const angle = (index / BONE_SHARDS) * Math.PI * 2 + next() * 0.5;
    const mesh = new Mesh(shardGeometry, shardSurface);
    mesh.rotation.y = -angle;
    root.add(mesh);
    shards.push({
      mesh,
      direction: new Vector3(Math.cos(angle), 0, Math.sin(angle)),
      reach: reach * (0.8 + next() * 0.5),
      lift: reach * (0.5 + next() * 0.7),
    });
  }

  let age = 0;

  return {
    root,

    update(deltaSeconds) {
      age += deltaSeconds;
      const progress = clamp01(age / BONE_BLAST_SECONDS);
      dome.scale.setScalar(reach * (0.2 + 0.8 * easeOut(progress)));
      domeSurface.opacity = 0.42 * (1 - progress) ** 1.6;
      flash.scale.setScalar(reach * 0.3 * (1 + progress));
      flashSurface.opacity = 0.6 * clamp01(1 - progress / 0.25);
      ring.scale.setScalar(reach * (0.3 + 1.0 * easeOut(progress)));
      ringSurface.opacity = 0.55 * (1 - progress);

      for (const shard of shards) {
        shard.mesh.position.copy(shard.direction).multiplyScalar(shard.reach * easeOut(progress));
        shard.mesh.position.y = shard.lift * (1.6 * progress - 1.6 * progress * progress) + 0.5;
        shard.mesh.rotation.x += deltaSeconds * 9;
      }
    },

    finished() {
      return age >= BONE_BLAST_SECONDS;
    },

    dispose() {
      shardGeometry.dispose();
      retire(root, [domeSurface, flashSurface, ringSurface, shardSurface]);
    },
  };
}

function graveRise(particles: ParticleSystem, center: Vector3, radius: number): SpellVisual {
  const reach = Math.max(RISE_MIN_RADIUS, radius);
  const beamGeometry = new CylinderGeometry(1, 1, 1, 20, 1, true);
  const beamSurface = glowMaterial(GRAVE_DEEP, 0.3);
  const coreSurface = glowMaterial(GRAVE, 0.33);
  const ringSurface = glowMaterial(GRAVE, 0.42);
  const root = new Group();
  const beam = new Mesh(beamGeometry, beamSurface);
  const core = new Mesh(beamGeometry, coreSurface);
  const ring = new Mesh(geometries().ring, ringSurface);
  root.position.set(center.x, 0, center.z);
  ring.rotation.x = -Math.PI / 2;
  ring.position.y = 0.3;
  root.add(ring, beam, core);
  const foot = new Vector3(center.x, 0.8, center.z);
  particles.emit({ ...GRAVE_WISPS, spread: reach * 0.25 }, foot, UP, 14);
  particles.emit({ ...GRAVE_DUST, spread: reach * 0.3 }, foot, UP, 8);
  let age = 0;

  return {
    root,

    update(deltaSeconds) {
      age += deltaSeconds;
      const progress = clamp01(age / RISE_SECONDS);
      const rise = easeOut(clamp01(progress * 3));
      const fade = 1 - clamp01((progress - 0.3) / 0.7);
      const height = Math.max(0.01, RISE_HEIGHT * rise);
      const girth = reach * 0.3 * (1 - 0.4 * progress);
      beam.scale.set(girth, height, girth);
      beam.position.y = height / 2;
      core.scale.set(Math.max(0.01, girth * 0.35 * fade), height, Math.max(0.01, girth * 0.35 * fade));
      core.position.y = height / 2;
      beamSurface.opacity = 0.3 * fade;
      coreSurface.opacity = 0.33 * fade;
      ring.scale.setScalar(reach * (0.4 + 0.6 * easeOut(clamp01(progress * 1.8))));
      ringSurface.opacity = 0.42 * (1 - clamp01(progress * 1.3));
    },

    finished() {
      return age >= RISE_SECONDS;
    },

    dispose() {
      beamGeometry.dispose();
      retire(root, [beamSurface, coreSurface, ringSurface]);
    },
  };
}

function graveNova(particles: ParticleSystem, center: Vector3, radius: number): SpellVisual {
  const reach = Math.max(CURSE_MIN_RADIUS, radius);
  const kit = geometries();
  const ringSurface = glowMaterial(GRAVE, 0.5);
  const hazeSurface = glowMaterial(GRAVE_DEEP, 0.25);
  const root = new Group();
  const ring = new Mesh(kit.ring, ringSurface);
  const haze = new Mesh(kit.disc, hazeSurface);
  root.position.set(center.x, 0, center.z);
  ring.rotation.x = -Math.PI / 2;
  ring.position.y = 0.3;
  haze.rotation.x = -Math.PI / 2;
  haze.position.y = 0.26;
  root.add(haze, ring);
  particles.emit({ ...GRAVE_WISPS, spread: reach * 0.4, speed: [6, 16] }, new Vector3(center.x, 1, center.z), UP, Math.round(8 + reach * 0.5));
  let age = 0;

  return {
    root,

    update(deltaSeconds) {
      age += deltaSeconds;
      const progress = clamp01(age / GRAVE_NOVA_SECONDS);
      const spread = easeOut(progress);
      ring.scale.setScalar(reach * (0.1 + 0.9 * spread));
      ringSurface.opacity = 0.5 * (1 - progress);
      haze.scale.setScalar(reach * (0.1 + 0.85 * spread));
      hazeSurface.opacity = 0.25 * (1 - progress) ** 1.5;
    },

    finished() {
      return age >= GRAVE_NOVA_SECONDS;
    },

    dispose() {
      retire(root, [ringSurface, hazeSurface]);
    },
  };
}

function soulBolt(size: number, seconds: number, arc: number): ProjectileFactory {
  return (particles, launch) => {
    const core = new Mesh(new IcosahedronGeometry(0.55 * size, 0), coreMaterial(GRAVE_PALE));
    const halo = new Mesh(new IcosahedronGeometry(1.3 * size, 1), glowMaterial(GRAVE, 0.45));
    const trail = createTrail(particles, GRAVE_TRAIL, GRAVE_TRAIL_SPACING, launch);

    return {
      objects: [core, halo],
      seconds,

      place(from, to, progress) {
        core.position.lerpVectors(from, to, progress);
        core.position.y += Math.sin(Math.PI * progress) * arc;
        core.rotation.set(progress * 9, progress * 5, 0);
        halo.position.copy(core.position);
        halo.scale.setScalar(1 + Math.sin(progress * Math.PI * 6) * 0.15);
        trail.follow(core.position);
      },

      dispose() {
        retireProjectile([core, halo], [core.geometry, halo.geometry]);
      },
    };
  };
}

export function risenVisual(particles: ParticleSystem, center: Vector3, radius: number): SpellVisual {
  return graveRise(particles, center, radius);
}

const IMPACTS = new Map<string, ImpactFactory>([[meteor.id, meteorFall]]);

function rocketProjectile(particles: ParticleSystem, launch: Vector3): ProjectileVisual {
  const body = new Mesh(new CylinderGeometry(0.35, 0.35, 2.2, 8), solidMaterial(effectMaterials.solid, { color: IRON, metalness: 0.5, roughness: 0.5 }));
  const nose = new Mesh(new ConeGeometry(0.36, 0.9, 8), solidMaterial(effectMaterials.solid, { color: BRASS, metalness: 0.6, roughness: 0.4 }));
  const exhaust = new Mesh(geometries().trail, flameMaterial(0.9));
  const heading = new Vector3();
  const backward = new Vector3();
  const position = new Vector3();
  const embers = createTrail(particles, TRAIL_EMBERS, ROCKET_EMBER_SPACING, launch);
  const smoke = createTrail(particles, TRAIL_SMOKE, ROCKET_SMOKE_SPACING, launch);

  return {
    objects: [body, nose, exhaust],
    seconds: ROCKET_SECONDS,

    place(from, to, progress) {
      position.lerpVectors(from, to, progress);
      position.y += ROCKET_ARC * Math.sin(Math.PI * progress);
      heading.subVectors(to, from).normalize();
      heading.y += ROCKET_ARC * Math.PI * Math.cos(Math.PI * progress) / Math.max(1, from.distanceTo(to));
      heading.normalize();
      backward.copy(heading).negate();
      body.quaternion.setFromUnitVectors(UP, heading);
      body.position.copy(position);
      nose.quaternion.copy(body.quaternion);
      nose.position.copy(position).addScaledVector(heading, 1.5);
      exhaust.quaternion.setFromUnitVectors(UP, backward);
      exhaust.scale.set(0.6, 3, 0.6);
      exhaust.position.copy(position).addScaledVector(backward, 2.6);
      embers.follow(position);
      smoke.follow(position);
    },

    dispose() {
      retireProjectile([body, nose, exhaust], [body.geometry, nose.geometry]);
    },
  };
}

function shrapnelBlast(gearCount: number): AreaFactory {
  return (particles, center, radius) => {
    const reach = Math.max(SHRAPNEL_MIN_RADIUS, radius);
    const kit = geometries();
    const next = random(center.x * 13 + center.z * 7);
    const shardGeometry = new BoxGeometry(0.3, 0.3, 1.4);
    const gearGeometry = new TorusGeometry(0.7, 0.24, 5, 8);
    const domeSurface = glowMaterial(FIRE, 0.4);
    const flashSurface = glowMaterial(BRASS_HOT, 0.5);
    const ringSurface = glowMaterial(BRASS, 0.55);
    const shardSurface = solidMaterial(effectMaterials.solid, { color: IRON, metalness: 0.5, roughness: 0.6, emissive: EMBER, emissiveIntensity: 0.3 });
    const gearSurface = solidMaterial(effectMaterials.rock, { color: BRASS, metalness: 0.6, roughness: 0.4 });
    const root = new Group();
    const dome = new Mesh(kit.dome, domeSurface);
    const flash = new Mesh(kit.dome, flashSurface);
    const ring = new Mesh(kit.ring, ringSurface);
    const pieces: Debris[] = [];
    root.position.set(center.x, 0, center.z);
    ring.rotation.x = -Math.PI / 2;
    ring.position.y = 0.25;
    root.add(dome, flash, ring);
    const origin = new Vector3(center.x, 1, center.z);
    particles.emit({ ...SPARKS, speed: [reach * 1.2, reach * 2.6] }, origin, UP, Math.round(12 + reach));
    particles.emit({ ...SMOKE, spread: reach * 0.3, speed: [reach * 0.15, reach * 0.4] }, origin, UP, Math.round(4 + reach * 0.5));

    for (let index = 0; index < SHRAPNEL_PIECES + gearCount; index += 1) {
      const angle = next() * Math.PI * 2;
      const gear = index >= SHRAPNEL_PIECES;
      const mesh = new Mesh(gear ? gearGeometry : shardGeometry, gear ? gearSurface : shardSurface);
      mesh.rotation.y = -angle;
      root.add(mesh);
      pieces.push({
        mesh,
        direction: new Vector3(Math.cos(angle), 0, Math.sin(angle)),
        reach: reach * (0.7 + next() * 0.6),
        lift: reach * (gear ? 0.8 + next() * 0.6 : 0.4 + next() * 0.5),
      });
    }

    let age = 0;

    return {
      root,

      update(deltaSeconds) {
        age += deltaSeconds;
        const progress = clamp01(age / SHRAPNEL_SECONDS);
        dome.scale.setScalar(reach * (0.25 + 0.65 * easeOut(progress)));
        domeSurface.opacity = 0.4 * (1 - progress) ** 1.6;
        flash.scale.setScalar(reach * 0.25 * (1 + progress));
        flashSurface.opacity = 0.5 * clamp01(1 - progress / 0.25);
        ring.scale.setScalar(reach * (0.3 + 0.95 * easeOut(progress)));
        ringSurface.opacity = 0.55 * (1 - progress);

        for (const piece of pieces) {
          piece.mesh.position.copy(piece.direction).multiplyScalar(piece.reach * easeOut(progress));
          piece.mesh.position.y = piece.lift * (1.6 * progress - 1.6 * progress * progress) + 0.4;
          piece.mesh.rotation.x += deltaSeconds * 11;
        }
      },

      finished() {
        return age >= SHRAPNEL_SECONDS;
      },

      dispose() {
        shardGeometry.dispose();
        gearGeometry.dispose();
        retire(root, [domeSurface, flashSurface, ringSurface, shardSurface, gearSurface]);
      },
    };
  };
}

function mechAssemble(particles: ParticleSystem, center: Vector3, radius: number): SpellVisual {
  const reach = Math.max(SHRAPNEL_MIN_RADIUS, radius);
  const next = random(center.x * 5 + center.z * 19);
  const plateGeometry = new BoxGeometry(1.6, 1.1, 0.25);
  const plateSurface = solidMaterial(effectMaterials.solid, { color: BRASS, metalness: 0.65, roughness: 0.35, emissive: BRASS, emissiveIntensity: 0.25 });
  const ringSurface = glowMaterial(BRASS, 0.5);
  const root = new Group();
  const ring = new Mesh(geometries().ring, ringSurface);
  const plates: Debris[] = [];
  root.position.set(center.x, 0, center.z);
  ring.rotation.x = -Math.PI / 2;
  ring.position.y = 0.3;
  root.add(ring);
  const foot = new Vector3(center.x, 1, center.z);
  particles.emit({ ...STEAM_PUFF, spread: reach * 0.3 }, foot, UP, 12);
  particles.emit({ ...SPARKS, speed: [8, 18] }, foot.clone().setY(4), UP, 16);

  for (let index = 0; index < MECH_PLATES; index += 1) {
    const angle = (index / MECH_PLATES) * Math.PI * 2 + next() * 0.3;
    const mesh = new Mesh(plateGeometry, plateSurface);
    mesh.rotation.y = -angle + Math.PI / 2;
    root.add(mesh);
    plates.push({ mesh, direction: new Vector3(Math.cos(angle), 0, Math.sin(angle)), reach: reach * 1.3, lift: 2 + next() * 5 });
  }

  let age = 0;

  return {
    root,

    update(deltaSeconds) {
      age += deltaSeconds;
      const progress = clamp01(age / MECH_SECONDS);
      const snap = easeOut(clamp01(age / MECH_SNAP));
      ring.scale.setScalar(reach * (0.9 - 0.5 * snap));
      ringSurface.opacity = 0.5 * (1 - progress);

      for (const plate of plates) {
        plate.mesh.position.copy(plate.direction).multiplyScalar(plate.reach * (1 - snap) + 1.2);
        plate.mesh.position.y = plate.lift;
        plate.mesh.visible = progress < 0.75;
      }

      plateSurface.emissiveIntensity = 0.25 + 1.5 * clamp01((age - MECH_SNAP) / 0.1) * (1 - progress);
    },

    finished() {
      return age >= MECH_SECONDS;
    },

    dispose() {
      plateGeometry.dispose();
      retire(root, [plateSurface, ringSurface]);
    },
  };
}

function turretDrop(particles: ParticleSystem, center: Vector3, radius: number): SpellVisual {
  const reach = Math.max(4, radius);
  const ringSurface = glowMaterial(BRASS, 0.5);
  const root = new Group();
  const ring = new Mesh(geometries().ring, ringSurface);
  root.position.set(center.x, 0, center.z);
  ring.rotation.x = -Math.PI / 2;
  ring.position.y = 0.25;
  root.add(ring);
  const foot = new Vector3(center.x, 0.8, center.z);
  particles.emit({ ...STEAM_PUFF, spread: reach * 0.25, speed: [2, 5] }, foot, UP, 7);
  particles.emit({ ...SPARKS, speed: [6, 14] }, foot, UP, 9);
  let age = 0;

  return {
    root,

    update(deltaSeconds) {
      age += deltaSeconds;
      const progress = clamp01(age / DROP_SECONDS);
      ring.scale.setScalar(reach * (0.4 + 0.8 * easeOut(progress)));
      ringSurface.opacity = 0.5 * (1 - progress);
    },

    finished() {
      return age >= DROP_SECONDS;
    },

    dispose() {
      retire(root, [ringSurface]);
    },
  };
}

const LANDINGS = new Map<string, AreaFactory>([
  [meteor.id, meteorBlast],
  [fireball.id, meteorBlast],
  [infernoBolt.id, meteorBlast],
  [livingBomb.id, meteorBlast],
  [leapSlam.id, shockwave(GHOST)],
  [lastStand.id, shockwave(OATH_GOLD)],
  [PLAGUE_BURST, plagueBurst],
  [BLESSED_BURST, holyNova],
  [resurrection.id, holyPillar],
  [hex.id, evilEye],
  [corpseExplosion.id, boneBlast],
  [voidheartBlast.id, curseNova],
  [mechRocket.id, shrapnelBlast(0)],
  [turretBlast.id, shrapnelBlast(4)],
  [mechSuit.id, shrapnelBlast(7)],
]);

const ZONES = new Map<string, ZoneFactory>([
  [meteor.id, burningGround],
  [emberTrail.id, burningGround],
  [whirlwind.id, (_particles, center, radius, seed) => bladeVortex(center, radius, seed)],
  [plagueBloom.id, plagueFlower],
  [hallowedPath.id, hallowedGround],
]);

const CASTS = new Map<string, CastFactory>([
  [glacialPrison.id, glacialEruption],
  [pandemic.id, pandemicWave],
  [resurrection.id, holyNova],
  [sharedFate.id, fateWeb],
  [armyOfTheDead.id, graveNova],
]);

const FORMS = new Map<string, AreaFactory>([
  ["inferno", infernoBurst],
  ["avatar", holyPillar],
  ["lich", graveRise],
  ["mech", mechAssemble],
]);

const SPAWNS = new Map<string, AreaFactory>([[turret.id, turretDrop]]);

const PROJECTILES = new Map<string, ProjectileFactory>([
  [firebolt.id, fireballProjectile],
  [fireball.id, fireballProjectile],
  [infernoBolt.id, fireballProjectile],
  [shieldToss.id, shieldDisc],
  [frostBolt.id, iceMissile(2.6, 0.6)],
  [frozenOrb.id, iceMissile(1.5, 0.35)],
  [PLAGUE_BURST, plagueGlob],
  [judgment.id, hammerMissile(1.8)],
  [avatarJudgment.id, hammerMissile(2.6)],
  [spiteBolt.id, spiteNeedle],
  [hex.id, hexHop],
  ["ill-omen", omenEcho],
  [sharedFate.id, fatePulse],
  ["death-knell", knellToll],
  [graveBolt.id, soulBolt(1, SOUL_BOLT_SECONDS, 0.8)],
  [lichBolt.id, soulBolt(1.5, SOUL_BOLT_SECONDS, 1.2)],
  [HARVEST_PASSIVE, soulBolt(0.8, SOUL_WISP_SECONDS, SOUL_WISP_ARC)],
  [mechRocket.id, rocketProjectile],
]);

const PASSIVES = new Map<string, AreaFactory>([
  [WEAVER_PASSIVE, weaverSurge],
  [HARVEST_PASSIVE, graveNova],
]);

const EMITTERS = new Map<string, EmitterFactory>([
  [frozenOrb.id, frozenOrbVisual],
  [glacialPrison.id, hailCloud],
]);

export function impactVisual(
  particles: ParticleSystem,
  abilityId: string,
  center: Vector3,
  radius: number,
  tick: number,
  landsAtTick: number,
): TickedVisual | null {
  return IMPACTS.get(abilityId)?.(particles, center, radius, tick, landsAtTick) ?? null;
}

export function landingVisual(particles: ParticleSystem, abilityId: string, center: Vector3, radius: number): SpellVisual | null {
  return LANDINGS.get(abilityId)?.(particles, center, radius) ?? null;
}

export function zoneVisual(
  particles: ParticleSystem,
  abilityId: string,
  center: Vector3,
  radius: number,
  seed: number,
  periodTicks: number,
): TickedVisual | null {
  return ZONES.get(abilityId)?.(particles, center, radius, seed, periodTicks) ?? null;
}

export function emitterVisual(particles: ParticleSystem, abilityId: string, motion: EmitterMotion, seed: number): TickedVisual | null {
  return EMITTERS.get(abilityId)?.(particles, motion, seed) ?? null;
}

export function waveArrivalSeconds(distance: number, radius: number): number {
  const reach = Math.max(20, radius);

  return (1 - Math.cbrt(1 - clamp01(distance / reach))) * PANDEMIC_SECONDS;
}

export function emitterShotOrigin(abilityId: string, from: Vector3, target: Vector3): Vector3 {
  if (abilityId === glacialPrison.id) {
    return target.clone().lerp(from, HAIL_LEAN).setY(HAIL_HEIGHT);
  }

  return from.clone().setY(ORB_HEIGHT);
}

export function castVisual(particles: ParticleSystem, abilityId: string, center: Vector3, radius: number, origin: Vector3): SpellVisual | null {
  return CASTS.get(abilityId)?.(particles, center, radius, origin) ?? null;
}

export function releaseDelay(abilityId: string): number {
  return abilityId === spiteBolt.id ? SPITE_WINDUP_SECONDS : 0;
}

export function leapArc(abilityId: string): LeapArc | null {
  return LEAPS.get(abilityId) ?? null;
}

export function formVisual(particles: ParticleSystem, formKey: string, center: Vector3, radius: number): SpellVisual | null {
  return FORMS.get(formKey)?.(particles, center, radius) ?? null;
}

export function spawnVisual(particles: ParticleSystem, heroId: string, center: Vector3, radius: number): SpellVisual | null {
  return SPAWNS.get(heroId)?.(particles, center, radius) ?? null;
}

export function passiveVisual(particles: ParticleSystem, passive: string, center: Vector3, radius: number): SpellVisual | null {
  return PASSIVES.get(passive)?.(particles, center, radius) ?? null;
}

export function projectileVisual(particles: ParticleSystem, abilityId: string, from: Vector3): ProjectileVisual | null {
  return PROJECTILES.get(abilityId)?.(particles, from) ?? null;
}
