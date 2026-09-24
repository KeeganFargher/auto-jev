import { firebolt, flameWard, meteor } from "@jev-game/content";
import { TICK_SECONDS } from "@jev-game/game";
import {
  BufferGeometry,
  CircleGeometry,
  Color,
  ConeGeometry,
  Float32BufferAttribute,
  Group,
  IcosahedronGeometry,
  Mesh,
  RingGeometry,
  SphereGeometry,
  Vector3,
  type Material,
  type MeshBasicMaterial,
  type MeshStandardMaterial,
} from "three";
import { effectMaterials, releaseEffectMaterial } from "./effect-materials.js";
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
  place(from: Vector3, to: Vector3, progress: number): void;
  dispose(): void;
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

type ImpactFactory = (
  particles: ParticleSystem,
  center: Vector3,
  radius: number,
  tick: number,
  landsAtTick: number,
) => TickedVisual;

type AreaFactory = (particles: ParticleSystem, center: Vector3, radius: number) => SpellVisual;

type ZoneFactory = (particles: ParticleSystem, center: Vector3, radius: number, seed: number) => TickedVisual;

type ProjectileFactory = (particles: ParticleSystem, from: Vector3) => ProjectileVisual;

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

let shared: SpellGeometry | null = null;

function clamp01(value: number): number {
  return Math.min(1, Math.max(0, value));
}

function easeOut(value: number): number {
  return 1 - (1 - value) ** 3;
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

function scorchMaterial(): MeshBasicMaterial {
  const material = effectMaterials.scorch.take();
  material.color.set(SCORCH);
  material.opacity = 0;

  return material;
}

function retire(root: Group, materials: readonly Material[]): void {
  root.removeFromParent();

  for (const material of materials) {
    releaseEffectMaterial(material);
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
  const shadowSurface = scorchMaterial();
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
  const scorchSurface = scorchMaterial();
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

function flameWardBurst(particles: ParticleSystem, center: Vector3, radius: number): SpellVisual {
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

function fireball(particles: ParticleSystem, launch: Vector3): ProjectileVisual {
  const kit = geometries();
  const heart = effectMaterials.core.take();
  heart.color.copy(GOLD);
  const core = new Mesh(kit.core, heart);
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
      for (const mesh of [core, shell, tail]) {
        mesh.removeFromParent();
        releaseEffectMaterial(mesh.material);
      }
    },
  };
}

const IMPACTS = new Map<string, ImpactFactory>([[meteor.id, meteorFall]]);

const LANDINGS = new Map<string, AreaFactory>([[meteor.id, meteorBlast]]);

const ZONES = new Map<string, ZoneFactory>([[meteor.id, burningGround]]);

const CASTS = new Map<string, AreaFactory>([[flameWard.id, flameWardBurst]]);

const PROJECTILES = new Map<string, ProjectileFactory>([[firebolt.id, fireball]]);

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
): TickedVisual | null {
  return ZONES.get(abilityId)?.(particles, center, radius, seed) ?? null;
}

export function castVisual(particles: ParticleSystem, abilityId: string, center: Vector3, radius: number): SpellVisual | null {
  return CASTS.get(abilityId)?.(particles, center, radius) ?? null;
}

export function projectileVisual(particles: ParticleSystem, abilityId: string, from: Vector3): ProjectileVisual | null {
  return PROJECTILES.get(abilityId)?.(particles, from) ?? null;
}
