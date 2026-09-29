import { Color, Vector3 } from "three";
import type { ParticleStyle, ParticleSystem } from "./particles.js";

export type HitKind = "strike" | "blunt" | "blade";

interface HitBurst {
  style: ParticleStyle;
  count: number;
}

const HIT_TINTS: Readonly<Record<HitKind, string>> = {
  strike: "#ffd08a",
  blunt: "#ffc46b",
  blade: "#e6f0ff",
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
  brightness: 1,
  opacity: 0.5,
  size: [2.6, 3.4],
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
  return { style: tinted(FLASH, color, color), count: 1 };
}

const HIT_BURSTS: Readonly<Record<HitKind, readonly HitBurst[]>> = {
  strike: [{ style: SPARKS, count: 10 }, flash(HIT_TINTS.strike)],
  blunt: [{ style: SPARKS, count: 7 }, { style: DUST, count: 4 }, flash(HIT_TINTS.blunt)],
  blade: [
    {
      style: {
        ...tinted(SPARKS, "#dbe8ff", "#4f7dff"),
        size: [2, 0.5],
        speed: [20, 36],
        stretch: 0.07,
      },
      count: 12,
    },
    flash(HIT_TINTS.blade),
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

const RELEASE_FLASH: ParticleStyle = { ...FLASH, size: [1.8, 2.2], opacity: 0.45 };

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
};

export function hitTint(kind: HitKind): string {
  return HIT_TINTS[kind];
}

export function emitHit(
  particles: ParticleSystem,
  kind: HitKind,
  point: Vector3,
  heading: Vector3,
  heavy: boolean,
): void {
  for (const burst of HIT_BURSTS[kind]) {
    particles.emit(
      burst.style,
      point,
      heading,
      heavy ? Math.round(burst.count * HEAVY_BURST) : burst.count,
    );
  }
}

export function trailStyle(kind: HitKind): ParticleStyle {
  return TRAILS[kind];
}

export function emitRelease(particles: ParticleSystem, kind: HitKind, point: Vector3): void {
  const trail = TRAILS[kind];
  particles.emit({ ...RELEASE, from: trail.from, to: trail.to }, point, UP, RELEASE_COUNT);
  particles.emit({ ...RELEASE_FLASH, from: trail.from, to: trail.to }, point, UP, 1);
}
