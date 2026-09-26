import {
  CircleGeometry,
  BufferGeometry,
  Color,
  Float32BufferAttribute,
  Group,
  LatheGeometry,
  Mesh,
  OctahedronGeometry,
  RingGeometry,
  SphereGeometry,
  TorusGeometry,
  Vector2,
  Vector3,
  type Material,
  type MeshBasicMaterial,
  type Object3D,
} from "three";
import { effectMaterials, releaseEffectMaterial } from "./effect-materials.js";
import { createTrail, type ParticleStyle, type ParticleSystem } from "./particles.js";
import type { ProjectileVisual, SpellVisual } from "./spell-visuals.js";
import { createTubeBatch, type TubeBatch } from "./thread-tube.js";

interface Strand {
  readonly points: Vector3[];
  readonly phase: number;
}

interface Rune {
  readonly mesh: Mesh;
  readonly angle: number;
}

const FATE = new Color("#e45cff");

const FATE_PALE = new Color("#fbe3ff");

const FATE_DEEP = new Color("#7a2bb8");

const YARN = new Color("#c0136a");

const YARN_DARK = new Color("#5a0a3a");

const INK = new Color("#1a0414");

const IRIS_GOLD = new Color("#ffc24a");

const IRIS_ROSE = new Color("#ef5fa8");

const PUPIL = new Color("#0b0206");

const BRONZE = new Color("#a8773f");

const UP = new Vector3(0, 1, 0);

const FORWARD = new Vector3(0, 0, 1);

export const SPITE_WINDUP_SECONDS = 0.05;

const SPITE_SECONDS = 0.17;

const SPITE_ARC = 1.4;

const SPITE_RINGS = 22;

const SPITE_TAIL_UNITS = 16;

const HOP_SECONDS = 0.22;

const HOP_ARC = 5;

const HOP_TAIL = 12;

const EYE_SECONDS = 1.25;

const EYE_HEIGHT = 17;

const EYE_WIDTH = 8;

const EYE_OPEN_SECONDS = 0.16;

const EYE_CLOSE_AT = 0.85;

const EYE_SHUT_AT = 1.02;

const HELIX_STRANDS = 3;

const HELIX_RINGS = 40;

const HELIX_TURNS = 2.4;

export const HEX_POP_SECONDS = 0.32;

const RUNES = 8;

const WEB_SECONDS = 1.55;

const THROW_SECONDS = 0.3;

const THROWS = 6;

const SPOKES = 8;

const WEB_RINGS = [0.36, 0.66, 0.95];

const WEB_SEGMENT_POINTS = 10;

const WEB_LIFT = 0.3;

const WEB_MIN_RADIUS = 18;

const WEB_MAX_RADIUS = 26;

const KNELL_SECONDS = 1.5;

export const KNELL_HEIGHT = 15;

export const KNELL_TOLL_SECONDS = 0.08;

const SURGE_SECONDS = 1;

const SURGE_BEADS = 10;

const PULSE_SECONDS = 0.06;

const PULSE_TAIL = 10;

const THREAD_SAG = 0.08;

const TOLL_SECONDS = 0.14;

const TOLL_ARC = 3;

const NEEDLE_SPARKLE: ParticleStyle = {
  blend: "glow",
  from: FATE_PALE,
  to: FATE,
  brightness: 1,
  opacity: 0.9,
  size: [1.2, 0.2],
  life: [0.18, 0.32],
  speed: [0.5, 2],
  cone: 1,
  spread: 0.25,
  gravity: 0,
  drag: 2,
  stretch: 0,
  softness: 0.5,
};

const NEEDLE_FIBRE: ParticleStyle = {
  blend: "solid",
  from: YARN,
  to: YARN_DARK,
  brightness: 1,
  opacity: 0.9,
  size: [0.8, 0.25],
  life: [0.3, 0.5],
  speed: [1, 3],
  cone: 1.2,
  spread: 0.3,
  gravity: 8,
  drag: 2.5,
  stretch: 0.05,
  softness: 0.3,
};

export const HEX_PUFF: ParticleStyle = {
  blend: "solid",
  from: new Color("#9a1f78"),
  to: new Color("#2a0a2e"),
  brightness: 1,
  opacity: 0.8,
  size: [3, 7],
  life: [0.5, 0.9],
  speed: [5, 12],
  cone: Math.PI,
  spread: 1.2,
  gravity: -3,
  drag: 3,
  stretch: 0,
  softness: 1,
};

export const STUFFING: ParticleStyle = {
  blend: "solid",
  from: new Color("#fff4dc"),
  to: new Color("#d8c7a4"),
  brightness: 1,
  opacity: 1,
  size: [1.3, 0.9],
  life: [0.6, 1],
  speed: [12, 22],
  cone: 1,
  spread: 0.6,
  gravity: 34,
  drag: 2,
  stretch: 0,
  softness: 0.45,
};

export const HEX_SPARKS: ParticleStyle = {
  blend: "glow",
  from: FATE_PALE,
  to: FATE,
  brightness: 1,
  opacity: 1,
  size: [1.5, 0.3],
  life: [0.3, 0.55],
  speed: [16, 34],
  cone: Math.PI,
  spread: 0.5,
  gravity: 4,
  drag: 3.5,
  stretch: 0.05,
  softness: 0.3,
};

const FALLING_FIBRES: ParticleStyle = {
  blend: "solid",
  from: YARN,
  to: new Color("#3a0626"),
  brightness: 1,
  opacity: 0.95,
  size: [1, 0.4],
  life: [0.7, 1.2],
  speed: [4, 10],
  cone: 1.3,
  spread: 1,
  gravity: 16,
  drag: 2,
  stretch: 0.06,
  softness: 0.3,
};

const KNELL_DUST: ParticleStyle = {
  blend: "solid",
  from: new Color("#3a2034"),
  to: new Color("#8a6f82"),
  brightness: 1,
  opacity: 0.5,
  size: [2.4, 6],
  life: [0.6, 1.1],
  speed: [8, 18],
  cone: 0.35,
  spread: 0.8,
  gravity: -1,
  drag: 2.6,
  stretch: 0,
  softness: 1,
};

function clamp01(value: number): number {
  return Math.min(1, Math.max(0, value));
}

function smooth(value: number): number {
  const t = clamp01(value);

  return t * t * (3 - 2 * t);
}

function easeOut(value: number): number {
  return 1 - (1 - clamp01(value)) ** 3;
}

function easeOutBack(value: number): number {
  const t = clamp01(value);
  const overshoot = 1.9;

  return 1 + (overshoot + 1) * (t - 1) ** 3 + overshoot * (t - 1) ** 2;
}

function glowSurface(color: Color, opacity: number): MeshBasicMaterial {
  const material = effectMaterials.glow.take();
  material.color.copy(color);
  material.opacity = opacity;

  return material;
}

function inkSurface(color: Color, opacity: number): MeshBasicMaterial {
  const material = effectMaterials.veil.take();
  material.color.copy(color);
  material.opacity = opacity;

  return material;
}

function arcPoint(from: Vector3, to: Vector3, lift: number, along: number, out: Vector3): Vector3 {
  out.lerpVectors(from, to, along);
  out.y += Math.sin(Math.PI * along) * lift;

  return out;
}

function lensGeometry(length: number, thickness: number, segments: number): BufferGeometry {
  const positions = [0, 0, 0];
  const indices: number[] = [];
  const ring = segments * 2;

  for (let step = 0; step < ring; step += 1) {
    const along = (step % segments) / segments;
    const side = step < segments ? 1 : -1;
    positions.push(side * (length / 2) * (1 - 2 * along), side * 2 * along * (1 - along) * thickness, 0);
    indices.push(0, 1 + step, 1 + ((step + 1) % ring));
  }

  const geometry = new BufferGeometry();
  geometry.setAttribute("position", new Float32BufferAttribute(positions, 3));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();

  return geometry;
}

function faceCamera(target: Object3D, meshes: readonly Mesh[]): void {
  for (const mesh of meshes) {
    mesh.onBeforeRender = (_renderer, _scene, camera) => {
      target.quaternion.copy(camera.quaternion);
      target.updateMatrixWorld(true);
    };
  }
}

function release(
  parts: readonly Object3D[],
  geometries: readonly BufferGeometry[],
  materials: readonly Material[],
  batches: readonly TubeBatch[],
): void {
  for (const part of parts) {
    part.removeFromParent();
  }

  for (const geometry of geometries) {
    geometry.dispose();
  }

  for (const material of materials) {
    releaseEffectMaterial(material);
  }

  for (const batch of batches) {
    batch.dispose();
  }
}

function fadeTo(materials: readonly MeshBasicMaterial[], peaks: readonly number[], amount: number): void {
  for (const [index, material] of materials.entries()) {
    material.opacity = (peaks[index] ?? 1) * amount;
  }
}

export function spiteNeedle(particles: ParticleSystem, launch: Vector3): ProjectileVisual {
  const body = new Mesh(new OctahedronGeometry(1, 0), inkSurface(INK, 1));
  const halo = new Mesh(new OctahedronGeometry(1, 0), glowSurface(FATE, 0.6));
  const tip = new Mesh(new SphereGeometry(0.5, 10, 8), glowSurface(FATE_PALE, 1));
  const aura = new Mesh(new SphereGeometry(1.3, 14, 10), glowSurface(YARN, 0.25));
  const coreThread = inkSurface(YARN, 1);
  const glowThread = glowSurface(FATE, 0.3);
  const core = createTubeBatch(coreThread, { tubes: 1, rings: SPITE_RINGS, sides: 6 });
  const glow = createTubeBatch(glowThread, { tubes: 1, rings: SPITE_RINGS, sides: 6 });
  body.scale.set(0.55, 0.55, 2.6);
  halo.scale.set(1, 1, 3.6);
  const sparkles = createTrail(particles, { ...NEEDLE_SPARKLE, size: [1.4, 0.2] }, 0.8, launch);
  const fibres = createTrail(particles, { ...NEEDLE_FIBRE, size: [1.7, 0.4] }, 0.9, launch);
  const points = Array.from({ length: SPITE_RINGS }, () => new Vector3());
  const heading = new Vector3();
  const ahead = new Vector3();
  const side = new Vector3();
  let released = false;

  return {
    objects: [body, halo, tip, core.mesh, glow.mesh, aura],
    seconds: SPITE_SECONDS,

    place(from, to, progress) {
      if (!released && progress > 0) {
        released = true;
        particles.emit({ ...NEEDLE_SPARKLE, size: [2.6, 0.4], speed: [6, 14] }, from, UP, 10);
        particles.emit({ ...NEEDLE_FIBRE, speed: [4, 9] }, from, UP, 6);
      }

      arcPoint(from, to, SPITE_ARC, progress, body.position);
      arcPoint(from, to, SPITE_ARC, Math.min(1, progress + 0.03), ahead);
      heading.subVectors(ahead, body.position);

      if (heading.lengthSq() < 1e-8) {
        heading.subVectors(to, from);
      }

      heading.normalize();
      body.quaternion.setFromUnitVectors(FORWARD, heading);
      body.rotateZ(progress * 18);
      halo.position.copy(body.position);
      halo.quaternion.copy(body.quaternion);
      aura.position.copy(body.position);
      aura.scale.setScalar(1 + 0.2 * Math.sin(progress * 40));
      tip.position.copy(body.position).addScaledVector(heading, 2.4);
      side.crossVectors(heading, UP);

      if (side.lengthSq() < 1e-6) {
        side.set(1, 0, 0);
      }

      side.normalize();

      const span = Math.min(progress, SPITE_TAIL_UNITS / Math.max(from.distanceTo(to), 1));

      for (const [index, point] of points.entries()) {
        const along = index / (SPITE_RINGS - 1);
        arcPoint(from, to, SPITE_ARC, progress - span * (1 - along), point);
        point.addScaledVector(side, Math.sin(along * Math.PI * 3 - progress * 16) * 0.8 * along * (1 - along));
      }

      points[SPITE_RINGS - 1]?.copy(body.position).addScaledVector(heading, -2.4);
      core.begin();
      core.tube(points, (along) => 0.06 + 0.36 * along);
      core.end();
      glow.begin();
      glow.tube(points, (along) => 0.2 + 0.5 * along);
      glow.end();
      sparkles.follow(tip.position);
      fibres.follow(body.position);
    },

    dispose() {
      release(
        [body, halo, tip, aura],
        [body.geometry, halo.geometry, tip.geometry, aura.geometry],
        [body.material, halo.material, tip.material, aura.material, coreThread, glowThread],
        [core, glow],
      );
    },
  };
}

function hopBolt(particles: ParticleSystem, launch: Vector3, loop: Color, heart: Color): ProjectileVisual {
  const bead = new Mesh(new SphereGeometry(0.75, 10, 8), inkSurface(heart, 1));
  const halo = new Mesh(new SphereGeometry(2, 12, 8), glowSurface(FATE, 0.5));
  const ring = new Mesh(new TorusGeometry(1.35, 0.24, 5, 18), inkSurface(loop, 1));
  const tailSurface = glowSurface(FATE, 0.6);
  const tail = createTubeBatch(tailSurface, { tubes: 1, rings: HOP_TAIL, sides: 4 });
  const sparkles = createTrail(particles, NEEDLE_SPARKLE, 0.7, launch);
  const history = Array.from({ length: HOP_TAIL }, () => launch.clone());

  return {
    objects: [bead, halo, ring, tail.mesh],
    seconds: HOP_SECONDS,

    place(from, to, progress) {
      arcPoint(from, to, HOP_ARC, progress, bead.position);
      halo.position.copy(bead.position);
      ring.position.copy(bead.position);
      ring.rotation.set(progress * 9, progress * 13, 0);
      history.pop();
      history.unshift(bead.position.clone());
      tail.begin();
      tail.tube(history, (along) => 0.6 * (1 - along));
      tail.end();
      sparkles.follow(bead.position);
    },

    dispose() {
      release([bead, halo, ring], [bead.geometry, halo.geometry, ring.geometry], [bead.material, halo.material, ring.material, tailSurface], [tail]);
    },
  };
}

export function hexHop(particles: ParticleSystem, launch: Vector3): ProjectileVisual {
  return hopBolt(particles, launch, INK, FATE_PALE);
}

export function omenEcho(particles: ParticleSystem, launch: Vector3): ProjectileVisual {
  return hopBolt(particles, launch, FATE_PALE, INK);
}

export function evilEye(particles: ParticleSystem, center: Vector3, radius: number): SpellVisual {
  const root = new Group();
  const eye = new Group();
  eye.position.set(center.x, EYE_HEIGHT, center.z);
  const height = EYE_WIDTH * 0.5;
  const halo = lensGeometry(EYE_WIDTH * 1.16, height * 1.5, 24);
  const lash = lensGeometry(EYE_WIDTH * 1.05, height * 1.2, 24);
  const sclera = lensGeometry(EYE_WIDTH, height, 24);
  const iris = new CircleGeometry(height * 0.46, 32);
  const pupil = lensGeometry(height * 0.92, height * 0.24, 16).rotateZ(Math.PI / 2);
  const shine = new CircleGeometry(height * 0.08, 12);
  const runeGeometry = new OctahedronGeometry(0.45, 0);
  const haloSurface = glowSurface(FATE, 0.6);
  const lashSurface = inkSurface(INK, 0.95);
  const scleraSurface = inkSurface(IRIS_ROSE, 1);
  const irisSurface = inkSurface(IRIS_GOLD, 1);
  const pupilSurface = inkSurface(PUPIL, 1);
  const shineSurface = glowSurface(FATE_PALE, 0.9);
  const runeSurface = glowSurface(FATE, 0.9);

  const eyeMeshes = [
    new Mesh(halo, haloSurface),
    new Mesh(lash, lashSurface),
    new Mesh(sclera, scleraSurface),
    new Mesh(iris, irisSurface),
    new Mesh(pupil, pupilSurface),
    new Mesh(shine, shineSurface),
  ];

  for (const [index, mesh] of eyeMeshes.entries()) {
    mesh.position.z = index * 0.02;
    mesh.renderOrder = 3;
    eye.add(mesh);
  }

  const pupilMesh = eyeMeshes[4]!;
  eyeMeshes[5]?.position.set(height * 0.2, height * 0.22, 0.12);
  const runes: Rune[] = [];

  for (let index = 0; index < RUNES; index += 1) {
    const mesh = new Mesh(runeGeometry, runeSurface);
    mesh.scale.set(1, 1.8, 0.4);
    eye.add(mesh);
    runes.push({ mesh, angle: (index / RUNES) * Math.PI * 2 });
  }

  faceCamera(eye, eyeMeshes);
  const coreThread = inkSurface(YARN, 1);
  const glowThread = glowSurface(FATE, 0.5);
  const core = createTubeBatch(coreThread, { tubes: HELIX_STRANDS, rings: HELIX_RINGS, sides: 5 });
  const glow = createTubeBatch(glowThread, { tubes: HELIX_STRANDS, rings: HELIX_RINGS, sides: 5 });
  root.add(eye, core.mesh, glow.mesh);

  const strands: Strand[] = Array.from({ length: HELIX_STRANDS }, (_, index) => ({
    points: Array.from({ length: HELIX_RINGS }, () => new Vector3()),
    phase: (index / HELIX_STRANDS) * Math.PI * 2,
  }));

  const reach = Math.max(radius, 4);
  const flash = new Mesh(new SphereGeometry(1, 16, 10), glowSurface(FATE, 0));
  flash.position.set(center.x, 4.5, center.z);
  const shockGeometry = new RingGeometry(0.82, 1, 48);
  const shockSurface = inkSurface(YARN_DARK, 0);
  const shock = new Mesh(shockGeometry, shockSurface);
  shock.rotation.x = -Math.PI / 2;
  shock.position.set(center.x, 0.3, center.z);
  root.add(flash, shock);
  const glowSurfaces = [haloSurface, runeSurface, shineSurface];
  const glowPeaks = [0.6, 0.9, 0.9];
  let age = 0;
  let popped = false;
  particles.emit({ ...HEX_SPARKS, speed: [10, 20] }, eye.position, UP, 14);

  return {
    root,

    update(deltaSeconds) {
      age += deltaSeconds;
      const opening = easeOutBack(age / EYE_OPEN_SECONDS);
      const closing = smooth((age - EYE_CLOSE_AT) / (EYE_SHUT_AT - EYE_CLOSE_AT));
      const lids = Math.max(0.001, opening * (1 - closing));
      eye.scale.set(1 + 0.12 * (1 - clamp01(age / 0.3)), lids, 1);
      pupilMesh.scale.set(1.8 - 1.2 * smooth((age - 0.1) / 0.45), 1, 1);
      const fade = 1 - smooth((age - EYE_SHUT_AT) / (EYE_SECONDS - EYE_SHUT_AT));
      fadeTo(glowSurfaces, glowPeaks, fade * (0.85 + 0.15 * Math.sin(age * 22)));

      for (const rune of runes) {
        const angle = rune.angle + age * 2.2;
        const spread = EYE_WIDTH * (0.66 + 0.08 * easeOut(age / 0.4));
        rune.mesh.position.set(
          Math.cos(angle) * spread,
          ((Math.sin(angle) * spread) / Math.max(lids, 0.2)) * 0.45,
          -0.05,
        );
        rune.mesh.rotation.z = angle;
        rune.mesh.visible = fade > 0.02;
      }

      const draw = smooth((age - 0.06) / 0.3);
      const cinch = 1 - 0.55 * smooth((age - 0.3) / 0.4);
      const threadFade = 1 - smooth((age - 0.7) / 0.35);
      core.begin();
      glow.begin();

      if (threadFade > 0.01 && draw > 0.01) {
        for (const strand of strands) {
          for (const [index, point] of strand.points.entries()) {
            const along = (index / (HELIX_RINGS - 1)) * draw;
            const spin = strand.phase + along * HELIX_TURNS * Math.PI * 2 + age * 5;
            const swirl = reach * (0.62 - 0.32 * along) * cinch;
            point.set(
              center.x + Math.cos(spin) * swirl,
              EYE_HEIGHT - 2.5 - along * (EYE_HEIGHT - 3.2),
              center.z + Math.sin(spin) * swirl,
            );
          }

          core.tube(strand.points, (along) => 0.16 * threadFade * (0.4 + 0.6 * Math.sin(Math.PI * along)));
          glow.tube(strand.points, (along) => 0.42 * threadFade * (0.4 + 0.6 * Math.sin(Math.PI * along)));
        }
      }

      core.end();
      glow.end();

      if (!popped && age >= HEX_POP_SECONDS) {
        popped = true;
        const heart = new Vector3(center.x, 4, center.z);
        particles.emit(HEX_PUFF, heart, UP, 18);
        particles.emit(HEX_SPARKS, heart, UP, 22);
        particles.emit(STUFFING, heart, UP, 10);
      }

      const burst = clamp01((age - HEX_POP_SECONDS) / 0.2);
      flash.scale.setScalar(1.5 + 4 * easeOut(burst));
      flash.material.opacity = age < HEX_POP_SECONDS ? 0 : 0.35 * (1 - burst);
      const wave = clamp01((age - HEX_POP_SECONDS) / 0.4);
      shock.scale.setScalar(1 + reach * 1.4 * easeOut(wave));
      shockSurface.opacity = age < HEX_POP_SECONDS ? 0 : 0.7 * (1 - wave);
    },

    finished() {
      return age >= EYE_SECONDS;
    },

    dispose() {
      release(
        [root],
        [halo, lash, sclera, iris, pupil, shine, runeGeometry, flash.geometry, shockGeometry],
        [
          haloSurface,
          lashSurface,
          scleraSurface,
          irisSurface,
          pupilSurface,
          shineSurface,
          runeSurface,
          flash.material,
          shockSurface,
          coreThread,
          glowThread,
        ],
        [core, glow],
      );
    },
  };
}

function webRing(center: Vector3, reach: number, fraction: number, sweep: number, twist: number): Vector3[] {
  const points: Vector3[] = [];
  const segments = Math.max(1, Math.ceil(SPOKES * sweep));
  const radius = reach * fraction;

  for (let segment = 0; segment < segments; segment += 1) {
    const start = (segment / SPOKES) * Math.PI * 2 + twist;
    const end = (Math.min(segment + 1, SPOKES * sweep) / SPOKES) * Math.PI * 2 + twist;

    for (let step = 0; step < WEB_SEGMENT_POINTS; step += 1) {
      const t = step / WEB_SEGMENT_POINTS;
      const angle = start + (end - start) * t;
      const sag = 1 - 0.12 * Math.sin(Math.PI * t);
      points.push(
        new Vector3(center.x + Math.cos(angle) * radius * sag, WEB_LIFT, center.z + Math.sin(angle) * radius * sag),
      );
    }
  }

  const last = (Math.min(segments, SPOKES * sweep) / SPOKES) * Math.PI * 2 + twist;
  points.push(new Vector3(center.x + Math.cos(last) * radius, WEB_LIFT, center.z + Math.sin(last) * radius));

  return points;
}

export function fateWeb(particles: ParticleSystem, center: Vector3, radius: number, origin: Vector3): SpellVisual {
  const root = new Group();
  const reach = Math.min(Math.max(WEB_MIN_RADIUS, radius), WEB_MAX_RADIUS) * 0.95;
  const area = Math.max(radius, reach);

  const coreThread = inkSurface(YARN_DARK, 0.95);
  const glowThread = glowSurface(FATE, 0.55);

  const threadCore = createTubeBatch(coreThread, {
    tubes: THROWS + SPOKES + WEB_RINGS.length,
    rings: 48,
    sides: 5,
  });

  const threadGlow = createTubeBatch(glowThread, {
    tubes: THROWS + SPOKES + WEB_RINGS.length,
    rings: 48,
    sides: 5,
  });

  const discGeometry = new CircleGeometry(1, 48);
  const shockGeometry = new RingGeometry(0.95, 1, 64);
  const discSurface = inkSurface(YARN_DARK, 0);
  const shockSurface = glowSurface(FATE, 0);
  const disc = new Mesh(discGeometry, discSurface);
  const shock = new Mesh(shockGeometry, shockSurface);
  disc.rotation.x = -Math.PI / 2;
  disc.position.set(center.x, 0.2, center.z);
  disc.scale.setScalar(reach);
  shock.rotation.x = -Math.PI / 2;
  shock.position.set(center.x, 0.35, center.z);
  root.add(disc, shock, threadCore.mesh, threadGlow.mesh);
  const twist = Math.random() * Math.PI * 2;
  const landing = new Vector3(center.x, WEB_LIFT, center.z);

  const throws = Array.from({ length: THROWS }, (_, index) => {
    const angle = twist + (index / THROWS) * Math.PI * 2;

    return {
      bend: new Vector3(Math.cos(angle) * reach * 0.35, 6 + (index % 3) * 2.5, Math.sin(angle) * reach * 0.35),
      points: Array.from({ length: 24 }, () => new Vector3()),
    };
  });

  const spokeEnds = Array.from({ length: SPOKES }, (_, index) => {
    const angle = twist + (index / SPOKES) * Math.PI * 2;

    return new Vector3(Math.cos(angle), 0, Math.sin(angle));
  });

  const scratch = new Vector3();
  const control = new Vector3();
  let age = 0;
  let landed = false;

  function quadratic(from: Vector3, bend: Vector3, to: Vector3, t: number, out: Vector3): Vector3 {
    const u = 1 - t;

    return out
      .copy(from)
      .multiplyScalar(u * u)
      .addScaledVector(bend, 2 * u * t)
      .addScaledVector(to, t * t);
  }

  return {
    root,

    update(deltaSeconds) {
      age += deltaSeconds;
      const fade = 1 - smooth((age - 1.05) / (WEB_SECONDS - 1.05));
      const pulse = Math.exp(-(((age - 0.78) / 0.12) ** 2));
      threadCore.begin();
      threadGlow.begin();
      const head = easeOut(age / THROW_SECONDS);
      const tail = smooth((age - THROW_SECONDS * 0.7) / 0.3);

      if (tail < 1) {
        for (const toss of throws) {
          control.copy(origin).lerp(landing, 0.5).add(toss.bend);

          for (const [index, point] of toss.points.entries()) {
            const t = tail + (head - tail) * (index / (toss.points.length - 1));
            quadratic(origin, control, landing, t, point);
          }

          threadCore.tube(toss.points, () => 0.22);
          threadGlow.tube(toss.points, () => 0.6);
        }
      }

      if (!landed && age >= THROW_SECONDS) {
        landed = true;
        particles.emit(HEX_SPARKS, scratch.set(center.x, 1.5, center.z), UP, 26);
        particles.emit({ ...FALLING_FIBRES, speed: [8, 18] }, scratch, UP, 14);
      }

      const spokeGrow = easeOut((age - THROW_SECONDS) / 0.25);

      if (spokeGrow > 0) {
        for (const direction of spokeEnds) {
          const spoke = [landing.clone(), landing.clone().addScaledVector(direction, reach * spokeGrow)];
          threadCore.tube(spoke, () => 0.26 * fade);
          threadGlow.tube(spoke, () => (0.42 + 0.2 * pulse) * fade);
        }
      }

      for (const [index, fraction] of WEB_RINGS.entries()) {
        const sweep = smooth((age - THROW_SECONDS - 0.12 - index * 0.08) / 0.3);

        if (sweep > 0.01) {
          const ring = webRing(center, reach, fraction, sweep, twist);
          threadCore.tube(ring, () => 0.24 * fade);
          threadGlow.tube(ring, () => (0.36 + 0.2 * pulse) * fade);
        }
      }

      threadCore.end();
      threadGlow.end();
      discSurface.opacity = 0.14 * smooth((age - THROW_SECONDS) / 0.3) * fade;
      const ringAge = clamp01((age - THROW_SECONDS) / 0.4);
      shock.scale.setScalar(area * (0.2 + 0.85 * easeOut(ringAge)));
      shockSurface.opacity = age < THROW_SECONDS ? 0 : 0.4 * (1 - ringAge);
    },

    finished() {
      return age >= WEB_SECONDS;
    },

    dispose() {
      release([root], [discGeometry, shockGeometry], [discSurface, shockSurface, coreThread, glowThread], [threadCore, threadGlow]);
    },
  };
}

function bellGeometry(): LatheGeometry {
  const profile = [
    new Vector2(0.001, 3.3),
    new Vector2(0.55, 3.2),
    new Vector2(0.9, 2.8),
    new Vector2(1.05, 2),
    new Vector2(1.2, 1.1),
    new Vector2(1.6, 0.35),
    new Vector2(1.95, 0.05),
    new Vector2(1.9, 0),
    new Vector2(1.5, 0.2),
  ];

  return new LatheGeometry(profile, 16);
}

export function deathKnell(particles: ParticleSystem, center: Vector3, radius: number): SpellVisual {
  const root = new Group();
  const swing = new Group();
  swing.position.set(center.x, KNELL_HEIGHT + 3.4, center.z);
  swing.scale.setScalar(1.3);
  const bell = bellGeometry();
  const clapper = new SphereGeometry(0.45, 10, 8);
  const rim = new TorusGeometry(1.9, 0.12, 6, 32);
  const ringGeometry = new RingGeometry(0.88, 1, 64);

  const bronze = effectMaterials.fadingSolid.take();
  bronze.color.set(BRONZE);
  bronze.metalness = 0.2;
  bronze.roughness = 0.45;
  bronze.emissive.set(BRONZE);
  bronze.emissiveIntensity = 0.35;

  const rimSurface = glowSurface(FATE, 0.9);
  const ringSurface = inkSurface(INK, 0.6);
  const ringGlowSurface = glowSurface(FATE, 0.8);
  const bellMesh = new Mesh(bell, bronze);
  bellMesh.position.y = -3.4;
  bellMesh.scale.setScalar(1.6);
  const clapperMesh = new Mesh(clapper, bronze);
  clapperMesh.position.y = -3.6;
  const rimMesh = new Mesh(rim, rimSurface);
  rimMesh.rotation.x = Math.PI / 2;
  rimMesh.position.y = -3.35;
  rimMesh.scale.setScalar(1.6);
  swing.add(bellMesh, clapperMesh, rimMesh);
  const inkRing = new Mesh(ringGeometry, ringSurface);
  const glowRing = new Mesh(ringGeometry, ringGlowSurface);

  for (const ring of [inkRing, glowRing]) {
    ring.rotation.x = -Math.PI / 2;
    ring.position.set(center.x, ring === inkRing ? 0.3 : 0.34, center.z);
  }

  root.add(swing, inkRing, glowRing);
  const reach = Math.max(radius, 12);
  const heart = new Vector3(center.x, KNELL_HEIGHT, center.z);
  let age = 0;
  let tolled = false;

  return {
    root,

    update(deltaSeconds) {
      age += deltaSeconds;
      const arrive = easeOutBack(age / 0.25);
      const fade = 1 - smooth((age - 1.1) / (KNELL_SECONDS - 1.1));
      swing.scale.setScalar(Math.max(0.001, arrive * fade));
      swing.rotation.z = 0.5 * Math.sin(age * 9) * Math.exp(-age * 2.2);
      clapperMesh.position.x = -0.9 * Math.sin(age * 9 - 0.6) * Math.exp(-age * 2.2);
      bronze.opacity = fade;
      rimSurface.opacity = 0.9 * fade * (0.6 + 0.4 * Math.exp(-(((age - 0.3) / 0.1) ** 2)));

      if (!tolled && age >= KNELL_TOLL_SECONDS) {
        tolled = true;
        particles.emit(KNELL_DUST, heart, UP.clone().negate(), 12);
        particles.emit(HEX_SPARKS, heart, UP, 18);
        particles.emit(
          { ...KNELL_DUST, cone: Math.PI / 2, speed: [10, 20] },
          new Vector3(center.x, 1, center.z),
          UP,
          10,
        );
      }

      const wave = clamp01((age - KNELL_TOLL_SECONDS) / 0.7);
      const spread = reach * (0.15 + 1.1 * easeOut(wave));
      inkRing.scale.setScalar(spread);
      glowRing.scale.setScalar(spread * 1.02);
      ringSurface.opacity = age < KNELL_TOLL_SECONDS ? 0 : 0.6 * (1 - wave);
      ringGlowSurface.opacity = age < KNELL_TOLL_SECONDS ? 0 : 0.8 * (1 - wave);
    },

    finished() {
      return age >= KNELL_SECONDS;
    },

    dispose() {
      release([root], [bell, clapper, rim, ringGeometry], [bronze, rimSurface, ringSurface, ringGlowSurface], []);
    },
  };
}

export function weaverSurge(particles: ParticleSystem, center: Vector3, radius: number): SpellVisual {
  const root = new Group();
  const beadGeometry = new SphereGeometry(0.5, 10, 8);
  const beadSurface = glowSurface(FATE_PALE, 1);
  const haloSurface = glowSurface(FATE, 0.6);

  const beads = Array.from({ length: SURGE_BEADS }, (_, index) => {
    const bead = new Mesh(beadGeometry, beadSurface);
    const halo = new Mesh(beadGeometry, haloSurface);
    halo.scale.setScalar(2.4);
    root.add(bead, halo);

    return { bead, halo, angle: (index / SURGE_BEADS) * Math.PI * 2 };
  });

  const trailSurface = glowSurface(FATE, 0.5);
  const trail = createTubeBatch(trailSurface, { tubes: SURGE_BEADS, rings: 10, sides: 4 });
  root.add(trail.mesh);
  const reach = Math.max(radius, 6);
  const path = Array.from({ length: 10 }, () => new Vector3());
  let age = 0;
  let flashed = false;

  function place(angle: number, t: number, out: Vector3): Vector3 {
    const spin = angle + t * 5.5;
    const swirl = reach * (1 - easeOut(t));

    return out.set(center.x + Math.cos(spin) * swirl, 2 + 5 * t, center.z + Math.sin(spin) * swirl);
  }

  return {
    root,

    update(deltaSeconds) {
      age += deltaSeconds;
      const t = clamp01(age / (SURGE_SECONDS * 0.7));
      const fade = 1 - smooth((age - SURGE_SECONDS * 0.7) / (SURGE_SECONDS * 0.3));
      trail.begin();

      const gather = 1 - 0.75 * smooth((t - 0.55) / 0.45);

      for (const { bead, halo, angle } of beads) {
        place(angle, t, bead.position);
        halo.position.copy(bead.position);
        bead.scale.setScalar(gather);
        halo.scale.setScalar(2.4 * gather);
        bead.visible = fade > 0.01;
        halo.visible = bead.visible;

        for (const [index, point] of path.entries()) {
          place(angle, Math.max(0, t - index * 0.025), point);
        }

        trail.tube(path, (along) => 0.3 * (1 - along) * fade);
      }

      trail.end();
      beadSurface.opacity = fade;
      haloSurface.opacity = 0.35 * fade;

      if (!flashed && t >= 1) {
        flashed = true;
        particles.emit(HEX_SPARKS, new Vector3(center.x, 7, center.z), UP, 20);
      }
    },

    finished() {
      return age >= SURGE_SECONDS;
    },

    dispose() {
      release([root], [beadGeometry], [beadSurface, haloSurface, trailSurface], [trail]);
    },
  };
}

export function fatePulse(particles: ParticleSystem, launch: Vector3): ProjectileVisual {
  const bead = new Mesh(new SphereGeometry(0.75, 10, 8), inkSurface(FATE_PALE, 1));
  const halo = new Mesh(new SphereGeometry(1.9, 12, 8), glowSurface(FATE, 0.6));
  const tailSurface = glowSurface(FATE, 0.75);
  const tail = createTubeBatch(tailSurface, { tubes: 1, rings: PULSE_TAIL, sides: 4 });
  const sparkles = createTrail(particles, NEEDLE_SPARKLE, 0.9, launch);
  const path = Array.from({ length: PULSE_TAIL }, () => new Vector3());

  function along(from: Vector3, to: Vector3, t: number, out: Vector3): Vector3 {
    const clamped = clamp01(t);
    out.lerpVectors(from, to, clamped);
    out.y -= from.distanceTo(to) * THREAD_SAG * 4 * clamped * (1 - clamped);

    return out;
  }

  return {
    objects: [bead, halo, tail.mesh],
    seconds: PULSE_SECONDS,

    place(from, to, progress) {
      along(from, to, progress, bead.position);
      halo.position.copy(bead.position);
      halo.scale.setScalar(1 + 0.25 * Math.sin(progress * 30));

      for (const [index, point] of path.entries()) {
        along(from, to, progress - index * 0.035, point);
      }

      tail.begin();
      tail.tube(path, (t) => 0.55 * (1 - t));
      tail.end();
      sparkles.follow(bead.position);
    },

    dispose() {
      release([bead, halo], [bead.geometry, halo.geometry], [bead.material, halo.material, tailSurface], [tail]);
    },
  };
}

export function knellToll(particles: ParticleSystem, launch: Vector3): ProjectileVisual {
  const orb = new Mesh(new SphereGeometry(1.1, 12, 10), inkSurface(INK, 1));
  const halo = new Mesh(new SphereGeometry(2.3, 12, 10), glowSurface(FATE_DEEP, 0.8));
  const ring = new Mesh(new TorusGeometry(1.7, 0.2, 5, 20), glowSurface(FATE, 0.9));

  const dust = createTrail(
    particles,
    { ...KNELL_DUST, size: [1.6, 3.6], speed: [0.5, 2], life: [0.35, 0.6] },
    1.2,
    launch,
  );

  const sparkles = createTrail(particles, NEEDLE_SPARKLE, 0.8, launch);

  return {
    objects: [orb, halo, ring],
    seconds: TOLL_SECONDS,

    place(from, to, progress) {
      arcPoint(from, to, TOLL_ARC, progress, orb.position);
      halo.position.copy(orb.position);
      ring.position.copy(orb.position);
      ring.rotation.set(progress * 8, progress * 5, 0);
      dust.follow(orb.position);
      sparkles.follow(orb.position);
    },

    dispose() {
      release([orb, halo, ring], [orb.geometry, halo.geometry, ring.geometry], [orb.material, halo.material, ring.material], []);
    },
  };
}
