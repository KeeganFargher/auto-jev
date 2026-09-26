import {
  BufferGeometry,
  Color,
  ConeGeometry,
  Float32BufferAttribute,
  Group,
  IcosahedronGeometry,
  Mesh,
  RingGeometry,
  Vector3,
  type ColorRepresentation,
  type Material,
  type MeshBasicMaterial,
  type MeshStandardMaterial,
} from "three";
import { effectMaterials, releaseEffectMaterial, type MaterialPool } from "./effect-materials.js";
import { createTrail, type ParticleStyle, type ParticleSystem } from "./particles.js";
import type { ProjectileVisual, SpellVisual, TickedVisual } from "./spell-visuals.js";

interface BlightKit {
  readonly petal: BufferGeometry;
  readonly leaf: BufferGeometry;
  readonly thorn: BufferGeometry;
  readonly bead: BufferGeometry;
  readonly ring: BufferGeometry;
  readonly band: BufferGeometry;
  readonly blotch: BufferGeometry;
  readonly stalk: BufferGeometry;
  readonly rim: BufferGeometry;
}

interface Petal {
  readonly pivot: Group;
  readonly open: number;
  readonly closed: number;
  readonly size: number;
  readonly phase: number;
}

interface Frond {
  readonly pivot: Group;
  readonly size: number;
  readonly lie: number;
}

interface Spike {
  readonly mesh: Mesh;
  readonly height: number;
}

interface SolidLook {
  readonly color: ColorRepresentation;
  readonly roughness: number;
  readonly emissive?: ColorRepresentation;
  readonly emissiveIntensity?: number;
  readonly opacity?: number;
}

const TOXIC = new Color("#a3e635");

const TOXIC_PALE = new Color("#ecfccb");

const TOXIC_DEEP = new Color("#3f6212");

const PETAL = "#e3ebb6";

const PETAL_HEART = "#6e2f7a";

const PETAL_SHADE = "#2c3a10";

const LEAF = "#2d4d17";

const STALK = "#3a4a1c";

const THORN_WOOD = "#3b2a1a";

const STAIN = "#2a3a10";

const WAVE_CORE = "#27330f";

const WAVE_HAZE = "#6b2d7b";

const WILTED = new Color("#6b6433");

const THORN_SECONDS = 0.3;

const THORN_ARC = 1.2;

const BLOOM_PETALS = 5;

const BLOOM_FRONDS = 7;

const BLOOM_RISE_SECONDS = 0.4;

const BLOOM_WILT_SECONDS = 0.7;

const PULSE_SECONDS = 0.5;

const PULSE_SPORES = 18;

const DRIFT_PER_SECOND = 7;

export const SURGE_SECONDS = 1.3;

const SURGE_WISPS_PER_SECOND = 90;

const INFECTION_SECONDS = 0.9;

const UP = new Vector3(0, 1, 0);

const SOLID_SPORES: ParticleStyle = {
  blend: "solid",
  from: new Color("#e6f7a8"),
  to: new Color("#6b8f23"),
  brightness: 1,
  opacity: 0.9,
  size: [1.3, 0.45],
  life: [0.7, 1.2],
  speed: [1.5, 4],
  cone: 0.7,
  spread: 1.2,
  gravity: -2.5,
  drag: 1.4,
  stretch: 0,
  softness: 0.55,
};

const MIASMA: ParticleStyle = {
  blend: "solid",
  from: new Color("#6a8a24"),
  to: new Color("#3b2f4a"),
  brightness: 1,
  opacity: 0.35,
  size: [2.6, 6.5],
  life: [0.9, 1.5],
  speed: [1, 4],
  cone: 1.2,
  spread: 1.4,
  gravity: -1.5,
  drag: 1.6,
  stretch: 0,
  softness: 1,
};

const TEA_DROPS: ParticleStyle = {
  blend: "solid",
  from: new Color("#d9f99d"),
  to: new Color("#4d7c0f"),
  brightness: 1,
  opacity: 1,
  size: [1, 0.4],
  life: [0.25, 0.45],
  speed: [0.5, 2],
  cone: 0.6,
  spread: 0.3,
  gravity: 18,
  drag: 1.6,
  stretch: 0.02,
  softness: 0.25,
};

const CLODS: ParticleStyle = {
  blend: "solid",
  from: new Color("#5b4a2e"),
  to: new Color("#2d2416"),
  brightness: 1,
  opacity: 1,
  size: [1.3, 0.7],
  life: [0.45, 0.8],
  speed: [8, 16],
  cone: 0.8,
  spread: 1.5,
  gravity: 36,
  drag: 1,
  stretch: 0,
  softness: 0.3,
};

let shared: BlightKit | null = null;

function clamp01(value: number): number {
  return Math.min(1, Math.max(0, value));
}

function easeOut(value: number): number {
  return 1 - (1 - clamp01(value)) ** 3;
}

function easeOutBack(value: number): number {
  const t = clamp01(value);

  return 1 + 2.7 * (t - 1) ** 3 + 1.7 * (t - 1) ** 2;
}

function random(seed: number): () => number {
  let state = Math.floor(seed * 7919 + 13) >>> 0;

  return () => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;

    return state / 4294967296;
  };
}

function twoSided(geometry: BufferGeometry): BufferGeometry {
  const front = geometry.toNonIndexed();
  const positions = front.getAttribute("position");
  const normals = front.getAttribute("normal");
  const count = positions.count;
  const outPositions = new Float32Array(count * 6);
  const outNormals = new Float32Array(count * 6);

  for (let index = 0; index < count; index += 1) {
    for (let axis = 0; axis < 3; axis += 1) {
      outPositions[index * 3 + axis] = positions.array[index * 3 + axis];
      outNormals[index * 3 + axis] = normals.array[index * 3 + axis];
    }
  }

  for (let triangle = 0; triangle < count / 3; triangle += 1) {
    for (let corner = 0; corner < 3; corner += 1) {
      const source = triangle * 3 + (2 - corner);
      const target = count + triangle * 3 + corner;

      for (let axis = 0; axis < 3; axis += 1) {
        outPositions[target * 3 + axis] = positions.array[source * 3 + axis];
        outNormals[target * 3 + axis] = -normals.array[source * 3 + axis];
      }
    }
  }

  const out = new BufferGeometry();
  out.setAttribute("position", new Float32BufferAttribute(outPositions, 3));
  out.setAttribute("normal", new Float32BufferAttribute(outNormals, 3));
  geometry.dispose();
  front.dispose();

  return out;
}

function cupped(width: number, cup: number, bend: number, teeth: number): BufferGeometry {
  const across = 6;
  const along = 10;
  const positions: number[] = [];
  const indices: number[] = [];

  for (let row = 0; row <= along; row += 1) {
    const v = row / along;
    const saw = teeth > 0 && row > 0 && row < along ? 1 - teeth * (row % 2) : 1;
    const half = width * 0.5 * Math.sin(Math.PI * Math.min(1, v * 1.08) ** 0.75) * saw + 0.004;

    for (let column = 0; column <= across; column += 1) {
      const u = (column / across) * 2 - 1;
      positions.push(u * half, cup * u * u * half + bend * v * v, v);
    }
  }

  for (let row = 0; row < along; row += 1) {
    for (let column = 0; column < across; column += 1) {
      const a = row * (across + 1) + column;
      const b = a + 1;
      const c = a + across + 1;
      const d = c + 1;
      indices.push(a, c, b, b, c, d);
    }
  }

  const geometry = new BufferGeometry();
  geometry.setAttribute("position", new Float32BufferAttribute(positions, 3));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();

  return twoSided(geometry);
}

function blotch(): BufferGeometry {
  const next = random(41);
  const sides = 40;
  const positions: number[] = [0, 0, 0];
  const normals: number[] = [0, 0, 1];
  const indices: number[] = [];

  for (let side = 0; side < sides; side += 1) {
    const angle = (side / sides) * Math.PI * 2;
    const reach = 0.78 + 0.22 * next() + 0.08 * Math.sin(angle * 5);
    positions.push(Math.cos(angle) * reach, Math.sin(angle) * reach, 0);
    normals.push(0, 0, 1);
    indices.push(0, side + 1, ((side + 1) % sides) + 1);
  }

  const geometry = new BufferGeometry();
  geometry.setAttribute("position", new Float32BufferAttribute(positions, 3));
  geometry.setAttribute("normal", new Float32BufferAttribute(normals, 3));
  geometry.setIndex(indices);

  return geometry;
}

function kit(): BlightKit {
  shared ??= {
    petal: cupped(0.95, 0.35, 0.28, 0),
    leaf: cupped(0.42, 0.22, -0.06, 0.16),
    thorn: new ConeGeometry(0.5, 3.4, 6).rotateX(Math.PI / 2),
    bead: new IcosahedronGeometry(1, 1),
    ring: new RingGeometry(0.93, 1, 64).rotateX(-Math.PI / 2),
    band: new RingGeometry(0.7, 1, 64).rotateX(-Math.PI / 2),
    blotch: blotch().rotateX(-Math.PI / 2),
    stalk: new ConeGeometry(0.5, 1, 7).translate(0, 0.5, 0),
    rim: new RingGeometry(0.975, 1, 96).rotateX(-Math.PI / 2),
  };

  return shared;
}

function solid(kind: MaterialPool<MeshStandardMaterial>, look: SolidLook): MeshStandardMaterial {
  const material = kind.take();
  material.color.set(look.color);
  material.roughness = look.roughness;
  material.metalness = 0;
  material.emissive.set(look.emissive ?? 0);
  material.emissiveIntensity = look.emissiveIntensity ?? 1;
  material.opacity = look.opacity ?? 1;
  material.depthWrite = true;

  return material;
}

function glow(color: Color, opacity: number): MeshBasicMaterial {
  const material = effectMaterials.glow.take();
  material.color.copy(color);
  material.opacity = opacity;

  return material;
}

function scorch(color: ColorRepresentation, opacity: number): MeshBasicMaterial {
  const material = effectMaterials.scorch.take();
  material.color.set(color);
  material.opacity = opacity;

  return material;
}

function veil(color: ColorRepresentation, opacity: number): MeshBasicMaterial {
  const material = effectMaterials.veil.take();
  material.color.set(color);
  material.opacity = opacity;

  return material;
}

function core(color: ColorRepresentation): MeshBasicMaterial {
  const material = effectMaterials.core.take();
  material.color.set(color);

  return material;
}

function retire(root: Group, materials: readonly Material[]): void {
  root.removeFromParent();

  for (const material of materials) {
    releaseEffectMaterial(material);
  }
}

export function thornVisual(particles: ParticleSystem, launch: Vector3): ProjectileVisual {
  const pieces = kit();

  const wood = solid(effectMaterials.rock, {
    color: THORN_WOOD,
    roughness: 0.8,
    emissive: TOXIC_DEEP,
    emissiveIntensity: 0.35,
  });

  const venom = glow(TOXIC, 0.95);
  const shaft = new Mesh(pieces.thorn, wood);
  const tip = new Mesh(pieces.bead, venom);
  const drip = createTrail(particles, { ...TEA_DROPS, size: [1.5, 0.5] }, 0.6, launch);
  const heading = new Vector3();
  const ahead = new Vector3();
  tip.scale.setScalar(0.55);

  return {
    objects: [shaft, tip],
    seconds: THORN_SECONDS,

    place(from, to, progress) {
      heading.subVectors(to, from);
      shaft.position.lerpVectors(from, to, progress);
      shaft.position.y += Math.sin(Math.PI * progress) * THORN_ARC;
      ahead.copy(shaft.position).add(heading);
      shaft.lookAt(ahead);
      shaft.rotateZ(progress * 14);
      tip.position.copy(shaft.position).addScaledVector(heading.normalize(), 1.7);
      drip.follow(shaft.position);
    },

    dispose() {
      shaft.removeFromParent();
      tip.removeFromParent();
      releaseEffectMaterial(wood);
      releaseEffectMaterial(venom);
    },
  };
}

export function plagueBloomVisual(
  particles: ParticleSystem,
  center: Vector3,
  radius: number,
  seed: number,
  periodTicks: number,
): TickedVisual {
  const pieces = kit();
  const next = random(seed + 3);
  const size = Math.max(7, radius * 0.56);
  const root = new Group();
  const flower = new Group();

  const petalSurface = solid(effectMaterials.solid, {
    color: PETAL,
    roughness: 0.7,
    emissive: PETAL_SHADE,
    emissiveIntensity: 0.25,
  });

  const heartSurface = solid(effectMaterials.solid, {
    color: PETAL_HEART,
    roughness: 0.6,
    emissive: PETAL_HEART,
    emissiveIntensity: 0.35,
  });

  const leafSurface = solid(effectMaterials.solid, { color: LEAF, roughness: 0.85 });
  const stalkSurface = solid(effectMaterials.rock, { color: STALK, roughness: 0.9 });
  const bulbSurface = glow(TOXIC, 0.7);
  const coreSurface = core(TOXIC_PALE);
  const stainSurface = scorch(STAIN, 0);
  const pulseSurface = scorch(WAVE_CORE, 0);
  const pulseGlow = glow(TOXIC, 0);
  const boundSurface = scorch(WAVE_CORE, 0);
  const boundGlow = glow(TOXIC, 0);
  const stain = new Mesh(pieces.blotch, stainSurface);
  const pulse = new Mesh(pieces.band, pulseSurface);
  const pulseEdge = new Mesh(pieces.ring, pulseGlow);
  const bound = new Mesh(pieces.ring, boundSurface);
  const boundEdge = new Mesh(pieces.rim, boundGlow);
  const stalk = new Mesh(pieces.stalk, stalkSurface);
  const bulb = new Mesh(pieces.bead, bulbSurface);
  const heart = new Mesh(pieces.bead, coreSurface);
  const petals: Petal[] = [];
  const fronds: Frond[] = [];
  root.position.set(center.x, 0, center.z);
  stain.position.y = 0.12;
  pulse.position.y = 0.16;
  pulseEdge.position.y = 0.18;
  bound.position.y = 0.2;
  boundEdge.position.y = 0.22;
  flower.rotation.y = next() * Math.PI * 2;
  root.add(stain, pulse, pulseEdge, bound, boundEdge, flower);
  flower.add(stalk, bulb, heart);

  for (let index = 0; index < BLOOM_FRONDS; index += 1) {
    const pivot = new Group();
    const mesh = new Mesh(pieces.leaf, leafSurface);
    pivot.rotation.y = (index / BLOOM_FRONDS) * Math.PI * 2 + (next() - 0.5) * 0.4;
    pivot.position.y = 0.2;
    pivot.add(mesh);
    flower.add(pivot);
    fronds.push({ pivot, size: size * (0.75 + 0.35 * next()), lie: 0.06 + next() * 0.16 });
  }

  const addPetals = (
    count: number,
    surface: Material,
    scale: number,
    open: number,
    closed: number,
    offset: number,
  ): void => {
    for (let index = 0; index < count; index += 1) {
      const pivot = new Group();
      const mesh = new Mesh(pieces.petal, surface);
      pivot.rotation.y = ((index + offset) / count) * Math.PI * 2 + (next() - 0.5) * 0.15;
      pivot.add(mesh);
      flower.add(pivot);
      petals.push({
        pivot,
        open: open + (next() - 0.5) * 0.12,
        closed,
        size: size * scale * (0.9 + 0.2 * next()),
        phase: next() * Math.PI * 2,
      });
    }
  };

  addPetals(BLOOM_PETALS, petalSurface, 0.62, 0.5, 1.45, 0);
  addPetals(BLOOM_PETALS, heartSurface, 0.3, 0.95, 1.5, 0.5);
  const top = new Vector3(center.x, size * 0.55, center.z);
  const spot = new Vector3();
  const ray = new Vector3();
  const period = Math.max(1, periodTicks);
  let lastPulse: number | null = null;
  let pulseAge = PULSE_SECONDS;
  let flare = 0;
  let rise = 0;
  let wilt = 0;
  let ending = false;
  let time = 0;
  let drift = 0;
  particles.emit(CLODS, new Vector3(center.x, 0.5, center.z), UP, 16);
  particles.emit({ ...MIASMA, spread: size * 0.3 }, new Vector3(center.x, 1.5, center.z), UP, 6);

  function breathe(): void {
    flare = 1;
    pulseAge = 0;
    particles.emit({ ...MIASMA, spread: size * 0.2 }, top, UP, 3);

    for (let index = 0; index < PULSE_SPORES; index += 1) {
      const angle = (index / PULSE_SPORES) * Math.PI * 2 + next() * 0.3;
      ray.set(Math.cos(angle), 0.12, Math.sin(angle)).normalize();
      spot.copy(top).setY(size * 0.35);
      particles.emit(
        { ...SOLID_SPORES, speed: [radius * 1.5, radius * 2.1], cone: 0.2, drag: 2.6, gravity: 1, life: [0.45, 0.7] },
        spot,
        ray,
        1,
      );
    }
  }

  return {
    root,

    sync(tick) {
      if (ending || (lastPulse !== null && tick - lastPulse < period)) {
        return;
      }

      lastPulse = lastPulse === null ? tick : lastPulse + period * Math.floor((tick - lastPulse) / period);
      breathe();
    },

    update(deltaSeconds) {
      time += deltaSeconds;
      rise = Math.min(1, rise + deltaSeconds / BLOOM_RISE_SECONDS);
      wilt = ending ? Math.min(1, wilt + deltaSeconds / BLOOM_WILT_SECONDS) : 0;
      flare = Math.max(0, flare - deltaSeconds * 3.2);
      pulseAge += deltaSeconds;
      const grown = easeOutBack(rise) * (1 - easeOut(wilt));
      const opened = easeOut(clamp01((rise - 0.35) / 0.65));
      stain.scale.setScalar(Math.max(0.01, radius * (0.35 + 0.65 * easeOut(rise))));
      stainSurface.opacity = 0.5 * (1 - wilt);
      stalk.scale.set(size * 0.1 * grown, Math.max(0.001, size * 0.55 * grown), size * 0.1 * grown);

      for (const frond of fronds) {
        frond.pivot.rotation.x = -(1.4 + (frond.lie - 1.4) * easeOut(rise * 1.4)) - 0.6 * wilt;
        frond.pivot.scale.setScalar(Math.max(0.001, frond.size * grown));
      }

      for (const petal of petals) {
        const sway = 0.05 * Math.sin(time * 2.1 + petal.phase) + 0.18 * flare;
        const tilt = petal.closed + (petal.open - petal.closed) * opened;
        petal.pivot.position.y = size * 0.52 * grown;
        petal.pivot.rotation.x = -(tilt + sway) + 1.1 * wilt;
        petal.pivot.scale.setScalar(Math.max(0.001, petal.size * grown));
      }

      petalSurface.color.set(PETAL).lerp(WILTED, wilt * 0.8);
      bulb.position.y = size * 0.6 * grown;
      heart.position.y = bulb.position.y;
      bulb.scale.setScalar(Math.max(0.001, size * (0.1 + 0.05 * flare + 0.01 * Math.sin(time * 6)) * grown));
      heart.scale.setScalar(Math.max(0.001, size * 0.055 * grown));
      bulbSurface.opacity = (0.55 + 0.4 * flare) * (1 - wilt);
      const wave = clamp01(pulseAge / PULSE_SECONDS);
      pulse.scale.setScalar(Math.max(0.01, radius * (0.2 + 0.8 * easeOut(wave))));
      pulseSurface.opacity = 0.35 * (1 - wave) * (1 - wilt);
      pulseEdge.scale.copy(pulse.scale);
      pulseGlow.opacity = 0.75 * (1 - wave) * (1 - wilt);
      const shown = easeOut(rise) * (1 - wilt);
      bound.scale.setScalar(Math.max(0.01, radius * (0.9 + 0.1 * easeOut(rise))));
      boundEdge.scale.copy(bound.scale);
      boundSurface.opacity = (0.55 + 0.25 * flare) * shown;
      boundGlow.opacity = (0.6 + 0.4 * flare) * shown;
      drift += deltaSeconds * DRIFT_PER_SECOND * (1 - wilt) * rise;

      while (drift >= 1) {
        drift -= 1;
        spot.set(center.x + (next() - 0.5) * size * 0.6, size * 0.6, center.z + (next() - 0.5) * size * 0.6);
        particles.emit(SOLID_SPORES, spot, UP, 1);
      }
    },

    end() {
      ending = true;
    },

    finished() {
      return ending && wilt >= 1;
    },

    dispose() {
      retire(root, [
        petalSurface,
        heartSurface,
        leafSurface,
        stalkSurface,
        bulbSurface,
        coreSurface,
        stainSurface,
        pulseSurface,
        pulseGlow,
        boundSurface,
        boundGlow,
      ]);
    },
  };
}

export function pandemicSurgeVisual(
  particles: ParticleSystem,
  center: Vector3,
  radius: number,
  origin: Vector3,
): SpellVisual {
  const pieces = kit();
  const reach = Math.max(20, radius);
  const root = new Group();
  const darkSurface = scorch(WAVE_CORE, 0.8);
  const edgeSurface = glow(TOXIC, 0.9);
  const hazeSurface = veil(WAVE_HAZE, 0.3);
  const geyserSurface = glow(TOXIC, 0.8);
  const dark = new Mesh(pieces.ring, darkSurface);
  const edge = new Mesh(pieces.rim, edgeSurface);
  const haze = new Mesh(pieces.band, hazeSurface);
  const geyser = new Mesh(pieces.stalk, geyserSurface);
  root.position.set(center.x, 0, center.z);
  dark.position.y = 0.2;
  edge.position.y = 0.24;
  haze.position.y = 0.16;
  geyser.position.set(origin.x - center.x, origin.y, origin.z - center.z);
  root.add(haze, dark, edge, geyser);
  particles.emit({ ...MIASMA, speed: [4, 10], cone: 0.6, spread: 1.5, gravity: -6, life: [1, 1.6] }, origin, UP, 16);
  particles.emit(
    { ...SOLID_SPORES, speed: [8, 18], cone: 0.35, spread: 0.6, gravity: 10, life: [0.7, 1.1] },
    origin,
    UP,
    26,
  );
  const spot = new Vector3();
  const ray = new Vector3();
  let age = 0;
  let wisps = 0;

  return {
    root,

    update(deltaSeconds) {
      age += deltaSeconds;
      const progress = clamp01(age / SURGE_SECONDS);
      const front = Math.max(0.01, reach * easeOut(progress));
      edge.scale.setScalar(front);
      dark.scale.setScalar(front);
      haze.scale.setScalar(Math.max(0.01, front * 0.97));
      edgeSurface.opacity = 0.95 * (1 - progress) ** 0.8;
      darkSurface.opacity = 0.85 * (1 - progress) ** 0.9;
      hazeSurface.opacity = 0.16 * (1 - progress);
      const burst = clamp01(age / 0.5);
      geyser.scale.set(
        2.2 * (1 - burst) + 0.4,
        Math.max(0.001, 14 * easeOut(burst) * (1 - burst * 0.6)),
        2.2 * (1 - burst) + 0.4,
      );
      geyserSurface.opacity = 0.8 * (1 - burst);
      wisps += deltaSeconds * SURGE_WISPS_PER_SECOND * (1 - progress);

      while (wisps >= 1) {
        wisps -= 1;
        const angle = Math.random() * Math.PI * 2;
        ray.set(Math.cos(angle), 0, Math.sin(angle));
        spot.set(center.x, 0.8, center.z).addScaledVector(ray, front);
        particles.emit({ ...SOLID_SPORES, speed: [2, 5], cone: 0.5, life: [0.5, 0.9] }, spot, UP, 1);
      }
    },

    finished() {
      return age >= SURGE_SECONDS;
    },

    dispose() {
      retire(root, [darkSurface, edgeSurface, hazeSurface, geyserSurface]);
    },
  };
}

export function infectionVisual(particles: ParticleSystem, center: Vector3, chest: Vector3): SpellVisual {
  const pieces = kit();
  const next = random(center.x * 31 + center.z * 17);
  const root = new Group();
  const markSurface = scorch(WAVE_CORE, 0.7);
  const ringSurface = glow(TOXIC, 0.9);

  const thornSurface = solid(effectMaterials.rock, {
    color: THORN_WOOD,
    roughness: 0.85,
    emissive: TOXIC_DEEP,
    emissiveIntensity: 0.4,
  });

  const mark = new Mesh(pieces.blotch, markSurface);
  const ring = new Mesh(pieces.ring, ringSurface);
  const spikes: Spike[] = [];
  root.position.set(center.x, 0, center.z);
  mark.position.y = 0.14;
  ring.position.y = 0.2;
  root.add(mark, ring);

  for (let index = 0; index < 5; index += 1) {
    const thorn = new Mesh(pieces.stalk, thornSurface);
    const angle = (index / 5) * Math.PI * 2 + next();
    thorn.position.set(Math.cos(angle) * 2.6, 0, Math.sin(angle) * 2.6);
    thorn.rotation.set(Math.sin(angle) * 0.45, 0, -Math.cos(angle) * 0.45);
    spikes.push({ mesh: thorn, height: 5 + next() * 3.5 });
    root.add(thorn);
  }

  particles.emit({ ...SOLID_SPORES, speed: [5, 11], cone: 1.3, life: [0.5, 0.9] }, chest, UP, 16);
  particles.emit({ ...MIASMA, spread: 2 }, chest, UP, 4);
  let age = 0;

  return {
    root,

    update(deltaSeconds) {
      age += deltaSeconds;
      const progress = clamp01(age / INFECTION_SECONDS);
      const pop = easeOutBack(clamp01(progress * 3.5));
      const fade = 1 - clamp01((progress - 0.55) / 0.45);
      mark.scale.setScalar(Math.max(0.01, 5.5 * easeOut(progress * 2)));
      markSurface.opacity = 0.7 * fade;
      ring.scale.setScalar(Math.max(0.01, 2.5 + 6 * easeOut(progress)));
      ringSurface.opacity = 0.9 * (1 - progress);

      for (const spike of spikes) {
        spike.mesh.scale.set(
          1.5 * pop * fade + 0.001,
          Math.max(0.001, spike.height * pop * fade),
          1.5 * pop * fade + 0.001,
        );
      }
    },

    finished() {
      return age >= INFECTION_SECONDS;
    },

    dispose() {
      retire(root, [markSurface, ringSurface, thornSurface]);
    },
  };
}
