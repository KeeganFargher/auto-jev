import { BufferGeometry, Color, Float32BufferAttribute, Group, Mesh, type MeshBasicMaterial } from "three";
import { effectMaterials, releaseEffectMaterial } from "./effect-materials.js";

export interface CycloneEffect {
  readonly root: Group;
  setActive(active: boolean): void;
  update(deltaSeconds: number): void;
  dispose(): void;
}

interface CycloneGeometry {
  funnel: BufferGeometry;
  dust: BufferGeometry;
}

const STREAKS = 16;

const STREAK_SEGMENTS = 28;

const DUST_SEGMENTS = 72;

const FUNNEL_SPIN = 7.5;

const DUST_SPIN = 3.2;

const FADE_IN_SECONDS = 0.25;

const FADE_OUT_SECONDS = 0.45;

const WIND = new Color("#f4ead8");

const DUST = new Color("#cdbda2");

let shared: CycloneGeometry | null = null;

function random(seed: number): () => number {
  let state = seed;

  return () => {
    state = (state * 1664525 + 1013904223) % 4294967296;

    return state / 4294967296;
  };
}

function funnelGeometry(): BufferGeometry {
  const next = random(7);
  const positions: number[] = [];
  const colors: number[] = [];
  const indices: number[] = [];

  for (let streak = 0; streak < STREAKS; streak += 1) {
    const low = next() * 0.7;
    const high = 1.5 + next() * 1.1;
    const start = next() * Math.PI * 2;
    const turns = 0.35 + next() * 0.4;
    const width = 0.06 + next() * 0.14;
    const brightness = 0.45 + next() * 0.55;
    const base = positions.length / 3;

    for (let segment = 0; segment <= STREAK_SEGMENTS; segment += 1) {
      const along = segment / STREAK_SEGMENTS;
      const height = low + (high - low) * along;
      const radius = 1.02 + 0.3 * (height / 2.4);
      const angle = start + Math.PI * 2 * turns * along;
      const half = width * (0.6 + 0.8 * along) * 0.5;
      const fade = Math.sin(Math.PI * along) ** 0.8 * brightness;

      for (const offset of [-half, half]) {
        positions.push(Math.cos(angle) * radius, height + offset, Math.sin(angle) * radius);
        colors.push(fade, fade, fade);
      }

      if (segment > 0) {
        const a = base + (segment - 1) * 2;
        indices.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
      }
    }
  }

  const geometry = new BufferGeometry();
  geometry.setAttribute("position", new Float32BufferAttribute(positions, 3));
  geometry.setAttribute("color", new Float32BufferAttribute(colors, 3));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();

  return geometry;
}

function dustGeometry(): BufferGeometry {
  const next = random(19);
  const positions: number[] = [];
  const colors: number[] = [];
  const indices: number[] = [];

  const rings = [
    { radius: 0.7, glow: 0 },
    { radius: 1.2, glow: 1 },
    { radius: 1.75, glow: 0 },
  ];

  for (let segment = 0; segment <= DUST_SEGMENTS; segment += 1) {
    const angle = (segment / DUST_SEGMENTS) * Math.PI * 2;
    const clump = 0.35 + 0.65 * next();

    for (const ring of rings) {
      const radius = ring.radius * (0.92 + 0.16 * next());
      positions.push(Math.cos(angle) * radius, 0.03, Math.sin(angle) * radius);
      colors.push(ring.glow * clump, ring.glow * clump, ring.glow * clump);
    }

    if (segment > 0) {
      const a = (segment - 1) * 3;

      for (let band = 0; band < 2; band += 1) {
        indices.push(a + band, a + band + 3, a + band + 1, a + band + 1, a + band + 3, a + band + 4);
      }
    }
  }

  const geometry = new BufferGeometry();
  geometry.setAttribute("position", new Float32BufferAttribute(positions, 3));
  geometry.setAttribute("color", new Float32BufferAttribute(colors, 3));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();

  return geometry;
}

function geometries(): CycloneGeometry {
  shared ??= { funnel: funnelGeometry(), dust: dustGeometry() };

  return shared;
}

function glowMaterial(color: Color): MeshBasicMaterial {
  const material = effectMaterials.trail.take();
  material.color.copy(color);
  material.opacity = 0;

  return material;
}

export function createCycloneEffect(): CycloneEffect {
  const { funnel, dust } = geometries();
  const windMaterial = glowMaterial(WIND);
  const dustMaterial = glowMaterial(DUST);
  const funnelMesh = new Mesh(funnel, windMaterial);
  const dustMesh = new Mesh(dust, dustMaterial);
  const root = new Group();
  root.add(funnelMesh, dustMesh);
  root.visible = false;
  let active = false;
  let strength = 0;

  return {
    root,

    setActive(isActive) {
      active = isActive;
    },

    update(deltaSeconds) {
      const step = deltaSeconds / (active ? FADE_IN_SECONDS : FADE_OUT_SECONDS);
      strength = Math.min(1, Math.max(0, strength + (active ? step : -step)));
      root.visible = strength > 0;

      if (!root.visible) {
        return;
      }

      funnelMesh.rotation.y -= FUNNEL_SPIN * deltaSeconds;
      dustMesh.rotation.y -= DUST_SPIN * deltaSeconds;
      funnelMesh.scale.set(0.85 + 0.15 * strength, 0.7 + 0.3 * strength, 0.85 + 0.15 * strength);
      windMaterial.opacity = 0.85 * strength;
      dustMaterial.opacity = 0.36 * strength;
    },

    dispose() {
      releaseEffectMaterial(windMaterial);
      releaseEffectMaterial(dustMaterial);
      root.removeFromParent();
    },
  };
}
