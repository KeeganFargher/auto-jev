import { Color, Vector3 } from "three";
import type { ParticleStyle, ParticleSystem } from "./particles.js";

export type HitKind = "strike" | "blunt" | "blade" | "fire" | "frost" | "dark" | "thorn" | "rivet" | "holy" | "fate";

interface HitBurst {
  style: ParticleStyle;
  count: number;
}

const ABILITY_HITS = {
  "bulwark-strike": "blunt",
  "shield-bash": "blunt",
  "oath-hammer": "blunt",
  judgment: "holy",
  "avatar-judgment": "holy",
  "blessed-burst": "holy",
  resurrection: "holy",
  "ember-trail": "fire",
  "ravager-axes": "blade",
  "leap-slam": "blunt",
  whirlwind: "blade",
  "shield-toss": "blunt",
  "last-stand": "blunt",
  "dusk-strike": "blade",
  "flicker-strike": "blade",
  "thousand-cuts": "blade",
  firebolt: "fire",
  fireball: "fire",
  "inferno-bolt": "fire",
  "living-bomb": "fire",
  meteor: "fire",
  "frost-bolt": "frost",
  "frozen-orb": "frost",
  "glacial-prison": "frost",
  "spite-bolt": "fate",
  "shared-fate": "fate",
  hex: "fate",
  "death-knell": "fate",
  "ill-omen": "fate",
  thornshot: "thorn",
  "plague-bloom": "thorn",
  "plague-burst": "thorn",
  pandemic: "thorn",
  "thrall-blade": "blade",
  "golem-slam": "blunt",
  "grave-bolt": "dark",
  "lich-bolt": "dark",
  "corpse-explosion": "dark",
  voidheart: "dark",
  "turret-shot": "rivet",
  "rivet-gun": "rivet",
  "mech-rocket": "fire",
  "self-destruct": "fire",
  "mech-suit": "fire",
} as const satisfies Record<string, HitKind>;

const HIT_TINTS: Readonly<Record<HitKind, string>> = {
  strike: "#ffd08a",
  blunt: "#ffc46b",
  blade: "#e6f0ff",
  fire: "#ff8a3d",
  frost: "#9fe8ff",
  dark: "#b58cff",
  thorn: "#a3e635",
  rivet: "#ffd27a",
  holy: "#fff1b0",
  fate: "#e45cff",
};

const HEAVY_BURST = 1.8;

const UP = new Vector3(0, 1, 0);

const SPARKS: ParticleStyle = {
  blend: "solid",
  from: new Color("#ffd23f"),
  to: new Color("#ff6a00"),
  brightness: 1,
  opacity: 1,
  size: [2.2, 0.6],
  life: [0.2, 0.36],
  speed: [26, 50],
  cone: 0.9,
  spread: 0.4,
  gravity: 40,
  drag: 6,
  stretch: 0.035,
  softness: 0.15,
};

const DUST: ParticleStyle = {
  blend: "solid",
  from: new Color("#cdb892"),
  to: new Color("#9a8a6c"),
  brightness: 1,
  opacity: 0.45,
  size: [2.2, 5.5],
  life: [0.45, 0.8],
  speed: [3, 8],
  cone: 1.2,
  spread: 0.8,
  gravity: -2,
  drag: 3,
  stretch: 0,
  softness: 1,
};

const FLASH: ParticleStyle = {
  blend: "glow",
  from: new Color("#ffffff"),
  to: new Color("#ffffff"),
  brightness: 1.2,
  opacity: 0.8,
  size: [4, 5.2],
  life: [0.08, 0.11],
  speed: [0, 0],
  cone: Math.PI,
  spread: 0,
  gravity: 0,
  drag: 1,
  stretch: 0,
  softness: 1,
};

const MOTES: ParticleStyle = {
  blend: "solid",
  from: new Color("#ffffff"),
  to: new Color("#ffffff"),
  brightness: 1,
  opacity: 0.95,
  size: [2.2, 0.7],
  life: [0.35, 0.6],
  speed: [5, 14],
  cone: 1.1,
  spread: 0.6,
  gravity: -5,
  drag: 3,
  stretch: 0,
  softness: 0.35,
};

function tinted(style: ParticleStyle, from: string, to: string): ParticleStyle {
  return { ...style, from: new Color(from), to: new Color(to) };
}

function flash(color: string): HitBurst {
  return { style: tinted(FLASH, "#ffffff", color), count: 1 };
}

const HIT_BURSTS: Readonly<Record<HitKind, readonly HitBurst[]>> = {
  strike: [{ style: SPARKS, count: 10 }, flash(HIT_TINTS.strike)],
  blunt: [{ style: SPARKS, count: 7 }, { style: DUST, count: 4 }, flash(HIT_TINTS.blunt)],
  blade: [
    { style: { ...tinted(SPARKS, "#dbe8ff", "#4f7dff"), size: [2, 0.5], speed: [20, 36], stretch: 0.07 }, count: 12 },
    flash(HIT_TINTS.blade),
  ],
  fire: [
    {
      style: {
        ...tinted(SPARKS, "#ffcf33", "#ff3d00"),
        size: [2.6, 0.8],
        life: [0.35, 0.7],
        speed: [8, 20],
        cone: 1.2,
        gravity: -6,
        drag: 3,
        stretch: 0.02,
      },
      count: 14,
    },
    { style: tinted(DUST, "#4a3b36", "#7a6f6a"), count: 3 },
    flash(HIT_TINTS.fire),
  ],
  frost: [
    {
      style: { ...tinted(SPARKS, "#c9f6ff", "#1fa2d6"), size: [2.3, 0.6], life: [0.3, 0.5], speed: [10, 24], gravity: 26, drag: 3, stretch: 0.03 },
      count: 12,
    },
    flash(HIT_TINTS.frost),
  ],
  dark: [{ style: tinted(MOTES, "#c084fc", "#4c1d95"), count: 12 }, flash(HIT_TINTS.dark)],
  thorn: [
    { style: { ...tinted(SPARKS, "#d9f99d", "#3f7d0a"), size: [2, 0.5], speed: [12, 24], gravity: 30, drag: 3, stretch: 0.04 }, count: 10 },
    flash(HIT_TINTS.thorn),
  ],
  rivet: [
    { style: { ...tinted(SPARKS, "#ffe08a", "#ff7a00"), size: [1.8, 0.45], speed: [22, 40], stretch: 0.07 }, count: 12 },
    flash(HIT_TINTS.rivet),
  ],
  holy: [{ style: { ...tinted(MOTES, "#fff1a8", "#d99a00"), gravity: -10 }, count: 10 }, flash(HIT_TINTS.holy)],
  fate: [
    { style: { ...tinted(SPARKS, "#ffd1f4", "#b0127a"), size: [2.2, 0.45], life: [0.3, 0.55], speed: [18, 36], gravity: 22, drag: 4, stretch: 0.09 }, count: 16 },
    { style: { ...tinted(MOTES, "#7a1455", "#2a0620"), size: [2.4, 0.6], speed: [5, 12], gravity: 14 }, count: 10 },
    flash(HIT_TINTS.fate),
  ],
};

const RELEASE_COUNT = 8;

const RELEASE: ParticleStyle = {
  ...MOTES,
  size: [1.6, 0.3],
  life: [0.14, 0.26],
  speed: [4, 10],
  cone: Math.PI,
  spread: 0.2,
  gravity: 0,
  drag: 5,
};

const RELEASE_FLASH: ParticleStyle = { ...FLASH, size: [2.6, 3.2], opacity: 0.7 };

const TRAIL: ParticleStyle = {
  ...MOTES,
  size: [1.8, 0.3],
  life: [0.16, 0.28],
  speed: [0.5, 2],
  cone: 0.6,
  spread: 0.3,
  gravity: 0,
};

const TRAILS: Readonly<Record<HitKind, ParticleStyle>> = {
  strike: tinted(TRAIL, "#ffe07a", HIT_TINTS.strike),
  blunt: tinted(TRAIL, "#ffe07a", HIT_TINTS.blunt),
  blade: tinted(TRAIL, "#dbe8ff", "#4f7dff"),
  fire: tinted(TRAIL, "#ffcf33", "#ff3d00"),
  frost: tinted(TRAIL, "#c9f6ff", "#1fa2d6"),
  dark: tinted(TRAIL, "#c084fc", "#4c1d95"),
  thorn: tinted(TRAIL, "#d9f99d", "#3f7d0a"),
  rivet: tinted(TRAIL, "#ffe08a", "#ff7a00"),
  holy: tinted(TRAIL, "#fff1a8", "#d99a00"),
  fate: tinted(TRAIL, "#ffd1f4", "#c0136a"),
};

function isMappedAbility(abilityId: string): abilityId is keyof typeof ABILITY_HITS {
  return Object.hasOwn(ABILITY_HITS, abilityId);
}

export function hitKind(abilityId: string): HitKind {
  return isMappedAbility(abilityId) ? ABILITY_HITS[abilityId] : "strike";
}

export function hitTint(kind: HitKind): string {
  return HIT_TINTS[kind];
}

export function emitHit(particles: ParticleSystem, kind: HitKind, point: Vector3, heading: Vector3, heavy: boolean): void {
  for (const burst of HIT_BURSTS[kind]) {
    particles.emit(burst.style, point, heading, heavy ? Math.round(burst.count * HEAVY_BURST) : burst.count);
  }
}

export function trailStyle(kind: HitKind): ParticleStyle {
  return TRAILS[kind];
}

export function emitRelease(particles: ParticleSystem, kind: HitKind, point: Vector3): void {
  const trail = TRAILS[kind];
  particles.emit({ ...RELEASE, from: trail.from, to: trail.to }, point, UP, RELEASE_COUNT);
  particles.emit({ ...RELEASE_FLASH, to: trail.to }, point, UP, 1);
}
