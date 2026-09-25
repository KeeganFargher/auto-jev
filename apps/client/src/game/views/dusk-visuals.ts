import {
  AdditiveBlending,
  BufferGeometry,
  Color,
  DoubleSide,
  Float32BufferAttribute,
  Group,
  Mesh,
  MeshBasicMaterial,
  Quaternion,
  Vector3,
} from "three";
import type { ParticleStyle, ParticleSystem } from "./particles.js";
import type { SpellVisual } from "./spell-visuals.js";
import { createTubeBatch } from "./thread-tube.js";

interface Claw {
  readonly geometry: BufferGeometry;
  readonly edge: Mesh<BufferGeometry, MeshBasicMaterial>;
  readonly hot: Mesh<BufferGeometry, MeshBasicMaterial>;
  readonly delay: number;
}

const DUSK = new Color("#b58cff");

const DUSK_PALE = new Color("#f1e6ff");

const DUSK_DEEP = new Color("#5b24c9");

const DUSK_INK = new Color("#1c1030");

const UP = new Vector3(0, 1, 0);

const FORWARD = new Vector3(0, 0, 1);

const CLAWS = 3;

const CLAW_SEGMENTS = 18;

const CLAW_SPACING = 1.1;

const CLAW_REACH = 3.4;

const CLAW_WIDTH = 0.55;

const CLAW_ARC = 1.5;

const CLAW_STAGGER = 0.025;

const RAKE_SWEEP = 0.07;

const RAKE_SECONDS = 0.34;

const STREAK_SECONDS = 0.24;

const STREAK_RINGS = 12;

const SHADOW_SMOKE: ParticleStyle = {
  blend: "solid",
  from: new Color("#2e1d4a"),
  to: new Color("#0d0717"),
  brightness: 1,
  opacity: 0.8,
  size: [3.2, 7.5],
  life: [0.45, 0.8],
  speed: [3, 10],
  cone: Math.PI,
  spread: 1,
  gravity: -5,
  drag: 3,
  stretch: 0,
  softness: 1,
};

const DUSK_SPARKS: ParticleStyle = {
  blend: "glow",
  from: DUSK_PALE,
  to: DUSK,
  brightness: 1,
  opacity: 1,
  size: [1.5, 0.3],
  life: [0.2, 0.4],
  speed: [12, 26],
  cone: Math.PI,
  spread: 0.5,
  gravity: 6,
  drag: 4,
  stretch: 0.08,
  softness: 0.3,
};

const WISPS: ParticleStyle = {
  blend: "solid",
  from: new Color("#3b2560"),
  to: new Color("#120a20"),
  brightness: 1,
  opacity: 0.7,
  size: [1.6, 3.6],
  life: [0.3, 0.55],
  speed: [1, 4],
  cone: Math.PI,
  spread: 1,
  gravity: -3,
  drag: 2,
  stretch: 0,
  softness: 1,
};

function clamp01(value: number): number {
  return Math.min(1, Math.max(0, value));
}

function crescent(reach: number, width: number, bend: number): BufferGeometry {
  const positions: number[] = [];
  const indices: number[] = [];

  for (let step = 0; step <= CLAW_SEGMENTS; step += 1) {
    const along = step / CLAW_SEGMENTS;
    const angle = (along - 0.5) * bend;
    const radius = reach / bend;
    const x = Math.sin(angle) * radius;
    const y = (Math.cos(angle) - Math.cos(bend / 2)) * radius;
    const half = (width / 2) * Math.sin(Math.PI * along) ** 0.7;
    const nx = -Math.sin(angle);
    const ny = -Math.cos(angle);
    positions.push(x + nx * half, y + ny * half, 0, x - nx * half, y - ny * half, 0);

    if (step < CLAW_SEGMENTS) {
      const base = step * 2;
      indices.push(base, base + 1, base + 2, base + 1, base + 3, base + 2);
    }
  }

  const geometry = new BufferGeometry();
  geometry.setAttribute("position", new Float32BufferAttribute(positions, 3));
  geometry.setIndex(indices);
  geometry.setDrawRange(0, 0);

  return geometry;
}

function surface(color: Color, opacity: number, additive: boolean): MeshBasicMaterial {
  return new MeshBasicMaterial({
    color,
    transparent: true,
    opacity,
    depthWrite: false,
    depthTest: false,
    side: DoubleSide,
    blending: additive ? AdditiveBlending : undefined,
  });
}

export function duskPuff(particles: ParticleSystem, at: Vector3, strength: number): void {
  particles.emit(SHADOW_SMOKE, at, UP, Math.round(14 * strength));
  particles.emit(DUSK_SPARKS, at, UP, Math.round(10 * strength));
}

export function clawRake(particles: ParticleSystem, center: Vector3, strength: number): SpellVisual {
  const root = new Group();
  const face = new Group();
  root.position.copy(center);
  root.add(face);
  const roll = new Quaternion().setFromAxisAngle(FORWARD, (Math.random() - 0.5) * 1.6 + (Math.random() < 0.5 ? 0 : Math.PI));
  const size = 0.75 + 0.35 * strength;

  const claws: Claw[] = Array.from({ length: CLAWS }, (_, index) => {
    const geometry = crescent(CLAW_REACH * size * (index === 1 ? 1.12 : 1), CLAW_WIDTH * size, CLAW_ARC);
    const edge = new Mesh(geometry, surface(DUSK_DEEP, 0.92, false));
    const hot = new Mesh(geometry, surface(DUSK_PALE, 0.95, true));
    const offset = (index - (CLAWS - 1) / 2) * CLAW_SPACING * size;
    edge.position.set(offset * 0.25, offset, 0);
    hot.position.copy(edge.position);
    hot.scale.set(1, 0.42, 1);
    edge.renderOrder = 20;
    hot.renderOrder = 21;
    face.add(edge, hot);

    return { geometry, edge, hot, delay: index * CLAW_STAGGER };
  });

  const [first] = claws;

  if (first !== undefined) {
    first.edge.onBeforeRender = (_renderer, _scene, camera) => {
      face.quaternion.copy(camera.quaternion).multiply(roll);
      face.updateMatrixWorld(true);
    };
  }

  particles.emit({ ...DUSK_SPARKS, speed: [14, 30] }, center, UP, Math.round(8 + 8 * strength));
  let age = 0;

  return {
    root,

    update(deltaSeconds) {
      age += deltaSeconds;

      for (const claw of claws) {
        const local = age - claw.delay;
        const sweep = clamp01(local / RAKE_SWEEP);
        const fade = 1 - clamp01((local - RAKE_SWEEP) / (RAKE_SECONDS - RAKE_SWEEP - CLAW_STAGGER * CLAWS));
        claw.geometry.setDrawRange(0, Math.round(sweep * CLAW_SEGMENTS) * 6);
        claw.edge.material.opacity = 0.92 * fade * Math.min(1, strength + 0.25);
        claw.hot.material.opacity = 0.95 * fade;
        claw.edge.scale.set(1, 0.55 + 0.45 * fade, 1);
        claw.hot.scale.set(1, 0.42 * (0.4 + 0.6 * fade), 1);
      }
    },

    finished() {
      return age >= RAKE_SECONDS;
    },

    dispose() {
      root.removeFromParent();

      for (const claw of claws) {
        claw.geometry.dispose();
        claw.edge.material.dispose();
        claw.hot.material.dispose();
      }
    },
  };
}

export function duskStreak(particles: ParticleSystem, from: Vector3, to: Vector3): SpellVisual {
  const root = new Group();
  const inkSurface = surface(DUSK_INK, 0.85, false);
  const glowSurface = surface(DUSK, 0.5, true);
  const ink = createTubeBatch(inkSurface, { tubes: 1, rings: STREAK_RINGS, sides: 6 });
  const glow = createTubeBatch(glowSurface, { tubes: 1, rings: STREAK_RINGS, sides: 6 });
  ink.mesh.renderOrder = 18;
  glow.mesh.renderOrder = 19;
  root.add(ink.mesh, glow.mesh);
  const points = Array.from({ length: STREAK_RINGS }, (_, index) => new Vector3().lerpVectors(from, to, index / (STREAK_RINGS - 1)));

  for (const [index, point] of points.entries()) {
    point.y += Math.sin((Math.PI * index) / (STREAK_RINGS - 1)) * 1.5;

    if (index % 3 === 1) {
      particles.emit(WISPS, point, UP, 2);
    }
  }

  let age = 0;

  return {
    root,

    update(deltaSeconds) {
      age += deltaSeconds;
      const life = 1 - clamp01(age / STREAK_SECONDS);
      const head = clamp01(age / 0.05);
      ink.begin();
      glow.begin();

      if (life > 0) {
        ink.tube(points, (along) => (along <= head ? 0.45 * life * (0.3 + 0.7 * along) : 0));
        glow.tube(points, (along) => (along <= head ? 1.1 * life * (0.3 + 0.7 * along) : 0));
      }

      ink.end();
      glow.end();
    },

    finished() {
      return age >= STREAK_SECONDS;
    },

    dispose() {
      root.removeFromParent();
      ink.dispose();
      glow.dispose();
      inkSurface.dispose();
      glowSurface.dispose();
    },
  };
}
