import {
  BoxGeometry,
  Color,
  Matrix4,
  Mesh,
  type BufferGeometry,
  OctahedronGeometry,
  PlaneGeometry,
  RingGeometry,
  SphereGeometry,
  Vector3,
  type Material,
  type MeshBasicMaterial,
  type MeshStandardMaterial,
  type Object3D,
  type Scene,
} from "three";
import { effectMaterials, releaseEffectMaterial } from "./effect-materials.js";
import { KAYKIT_UNIT } from "./figure-base.js";
import type { ParticleBlend, ParticleStyle, ParticleSystem } from "./particles.js";

export interface GroundMarker {
  setOpacity(opacity: number): void;
  place(center: Vector3): void;
  remove(): void;
}

export interface BattleEffects {
  explosion(center: Vector3, radius: number): void;
  pop(center: Vector3, radius: number, color: string): void;
  dust(center: Vector3, radius: number): void;
  embers(point: Vector3, count: number): void;
  fuseSparks(point: Vector3): void;
  stunStar(point: Vector3): void;
  healMotes(point: Vector3): void;
  deathDust(point: Vector3): void;
  rage(feet: Vector3, height: number, size: number): void;
  smoke(feet: Vector3, height: number, spread: number): void;
  crater(center: Vector3, radius: number): void;
  shockwave(center: Vector3, color: string, radius: number, seconds: number): void;
  ringBurst(center: Vector3, color: string, speed: number, count: number): void;
  burst(
    point: Vector3,
    color: string,
    blend: ParticleBlend,
    count: number,
    speed: number,
    size: number,
  ): void;
  debris(center: Vector3, count: number): void;
  marker(
    center: Vector3,
    innerFraction: number,
    radius: number,
    color: string,
    opacity: number,
  ): GroundMarker;
  step(deltaSeconds: number): void;
  clear(): void;
  dispose(): void;
}

interface RunningEffect {
  age: number;
  duration: number;
  step(progress: number): void;
  retire(): void;
}

interface GroundRing {
  mesh: Mesh<RingGeometry, MeshBasicMaterial>;
  retire(): void;
}

interface Chunk {
  readonly mesh: Mesh<BoxGeometry, MeshStandardMaterial>;
  readonly size: Vector3;
  readonly velocity: Vector3;
  readonly spin: Vector3;
  readonly life: number;
}

const UP = new Vector3(0, 1, 0);

const RING_SEGMENTS = 40;

const RING_LIFT = 0.18;

const POP_SECONDS = 0.28;

const FIRE_COLOR = "#ff8a3c";

const SOOT_COLOR = "#3a2418";

const FIRE_PARTICLES = 70;

const SOOT_PARTICLES = 20;

const FIRE_SPEED_PER_RADIUS = 3;

const SOOT_SPEED_PER_RADIUS = 1;

const FIRE_SIZE = 0.9 * KAYKIT_UNIT;

const SOOT_SIZE = 1.4 * KAYKIT_UNIT;

const SOOT_DROP = 0.2 * KAYKIT_UNIT;

const BLAST_WAVE_SECONDS = 0.35;

const BLAST_WAVE_REACH = 1.1;

const BLAST_CRATER_REACH = 0.7;

const BLAST_DEBRIS = 10;

const POP_GLINT_SECONDS = 0.16;

const CRATER_LIFT = 0.1;

const MAX_CRATERS = 8;

const SHOCKWAVE_INNER = 0.9;

const SHOCKWAVE_START = 0.3 * KAYKIT_UNIT;

const RING_BURST_LIFT = 0.4 * KAYKIT_UNIT;

const BURST_SLOWEST = 0.3;

const BURST_BASE_SIZE = 0.75;

const BURST_GROWTH = 1.7;

const DEBRIS_COLOR = "#7a7088";

const DEBRIS_SMALLEST = 0.18 * KAYKIT_UNIT;

const DEBRIS_LARGEST = 0.45 * KAYKIT_UNIT;

const DEBRIS_THINNEST = 0.4;

const DEBRIS_THICKEST = 0.8;

const DEBRIS_SHORTEST = 0.7;

const DEBRIS_LONGEST = 1.2;

const DEBRIS_NEAREST = 0.3 * KAYKIT_UNIT;

const DEBRIS_FARTHEST = 1.2 * KAYKIT_UNIT;

const DEBRIS_LIFT = 0.3 * KAYKIT_UNIT;

const DEBRIS_SLOWEST = 3 * KAYKIT_UNIT;

const DEBRIS_FASTEST = 8 * KAYKIT_UNIT;

const DEBRIS_LOWEST_RISE = 6 * KAYKIT_UNIT;

const DEBRIS_HIGHEST_RISE = 12 * KAYKIT_UNIT;

const DEBRIS_SPIN = 15;

const DEBRIS_SHORTEST_LIFE = 2.5;

const DEBRIS_LONGEST_LIFE = 4;

const DEBRIS_SHRINK_SECONDS = 0.6;

const DEBRIS_GRAVITY = 24 * KAYKIT_UNIT;

const DEBRIS_RESTITUTION = 0.25;

const DEBRIS_FRICTION = 0.45;

const SMALLEST_SCALE = 0.001;

const SPHERE = new SphereGeometry(1, 24, 16);

const CRATER = new PlaneGeometry(2, 2).rotateX(-Math.PI / 2);

const CHUNK = new BoxGeometry(1, 1, 1);

const GLINT = new OctahedronGeometry(1, 0);

const rings = new Map<number, RingGeometry>();

const EMBERS: ParticleStyle = {
  blend: "glow",
  from: new Color("#ffd23f"),
  to: new Color("#ff3d00"),
  brightness: 1.2,
  opacity: 1,
  size: [1.6, 0.4],
  life: [0.45, 0.9],
  speed: [4, 12],
  cone: 0.7,
  spread: 1.4,
  gravity: -10,
  drag: 2.5,
  stretch: 0.03,
  softness: 0.4,
};

const FUSE_SPARKS: ParticleStyle = {
  blend: "glow",
  from: new Color("#fff3b0"),
  to: new Color("#ff7a00"),
  brightness: 1.3,
  opacity: 1,
  size: [1.1, 0.2],
  life: [0.12, 0.26],
  speed: [8, 18],
  cone: 0.9,
  spread: 0.2,
  gravity: 18,
  drag: 4,
  stretch: 0.05,
  softness: 0.3,
};

const STUN_STAR: ParticleStyle = {
  blend: "glow",
  from: new Color("#fff6c2"),
  to: new Color("#ffc02e"),
  brightness: 1.2,
  opacity: 1,
  size: [1.5, 0.6],
  life: [0.35, 0.45],
  speed: [0.5, 1],
  cone: Math.PI,
  spread: 0,
  gravity: 0,
  drag: 2,
  stretch: 0,
  softness: 0.2,
};

const DROPLETS: ParticleStyle = {
  blend: "solid",
  from: new Color("#f2fdff"),
  to: new Color("#9fe8ff"),
  brightness: 1,
  opacity: 0.85,
  size: [1.4, 0.4],
  life: [0.35, 0.65],
  speed: [10, 24],
  cone: Math.PI,
  spread: 1,
  gravity: 34,
  drag: 2.5,
  stretch: 0.03,
  softness: 0.3,
};

const LAND_DUST: ParticleStyle = {
  blend: "solid",
  from: new Color("#cdb892"),
  to: new Color("#9a8a6c"),
  brightness: 1,
  opacity: 0.5,
  size: [3, 8],
  life: [0.5, 0.9],
  speed: [8, 18],
  cone: 1.35,
  spread: 1.5,
  gravity: -1,
  drag: 3.5,
  stretch: 0,
  softness: 1,
};

const HEAL_MOTES: ParticleStyle = {
  blend: "solid",
  from: new Color("#dcfce7"),
  to: new Color("#4ade80"),
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

const RING_DUST: ParticleStyle = {
  blend: "solid",
  from: new Color("#ffffff"),
  to: new Color("#ffffff"),
  brightness: 1,
  opacity: 0.85,
  size: [0.3 * KAYKIT_UNIT, 0.3 * KAYKIT_UNIT],
  life: [0.45, 0.45],
  speed: [1, 1],
  cone: 0,
  spread: 0,
  gravity: 0,
  drag: 4,
  stretch: 0.02,
  softness: 0.7,
};

const BURST: ParticleStyle = {
  blend: "solid",
  from: new Color("#ffffff"),
  to: new Color("#ffffff"),
  brightness: 1,
  opacity: 0.9,
  size: [1, 1],
  life: [0.35, 0.7],
  speed: [1, 1],
  cone: 1.67,
  spread: 0,
  gravity: 2 * KAYKIT_UNIT,
  drag: 3,
  stretch: 0,
  softness: 1,
};

const RAGE_EMBER: ParticleStyle = {
  blend: "glow",
  from: new Color("#ff3a1a"),
  to: new Color("#ff3a1a"),
  brightness: 1,
  opacity: 1,
  size: [1, 2],
  life: [0.7, 0.7],
  speed: [1, 2],
  cone: 0,
  spread: 1,
  gravity: 0,
  drag: 0.01,
  stretch: 0,
  softness: 0.6,
};

const RAGE_FUME: ParticleStyle = {
  ...RAGE_EMBER,
  blend: "solid",
  from: new Color("#6b5d57"),
  to: new Color("#6b5d57"),
  opacity: 0.6,
  softness: 1,
};

const SMOKE: ParticleStyle = {
  blend: "solid",
  from: new Color("#cfcfd8"),
  to: new Color("#cfcfd8"),
  brightness: 1,
  opacity: 0.8,
  size: [1.15 * KAYKIT_UNIT, 2.9 * KAYKIT_UNIT],
  life: [1.1, 1.1],
  speed: [1 * KAYKIT_UNIT, 3.4 * KAYKIT_UNIT],
  cone: 0.7,
  spread: 1,
  gravity: 0,
  drag: 1,
  stretch: 0,
  softness: 1,
};

const RAGE_EMBER_SHARE = 0.6;

const RAGE_LOW = 0.5 * KAYKIT_UNIT;

const RAGE_WIDTH = 0.4 * KAYKIT_UNIT;

const RAGE_PUFF = 0.45 * KAYKIT_UNIT;

const RAGE_SLOWEST_RISE = 0.75 * KAYKIT_UNIT;

const RAGE_FASTEST_RISE = 1.5 * KAYKIT_UNIT;

const SMOKE_LOW = 0.5 * KAYKIT_UNIT;

const HEAL_MOTE_COUNT = 14;

const DEATH_DUST_COUNT = 10;

const FUSE_SPARK_COUNT = 3;

const DUST_PER_UNIT = 0.9;

const MIN_DUST = 6;

const DROPLETS_PER_UNIT = 1.6;

function ringGeometry(innerFraction: number): RingGeometry {
  const cached = rings.get(innerFraction);

  if (cached !== undefined) {
    return cached;
  }

  const geometry = new RingGeometry(innerFraction, 1, RING_SEGMENTS);
  geometry.rotateX(-Math.PI / 2);
  rings.set(innerFraction, geometry);

  return geometry;
}

function groundRing(
  material: MeshBasicMaterial,
  center: Vector3,
  innerFraction: number,
  radius: number,
  lift: number,
): GroundRing {
  const mesh = new Mesh(ringGeometry(innerFraction), material);
  mesh.position.set(center.x, lift, center.z);
  mesh.scale.setScalar(radius);

  return {
    mesh,

    retire() {
      mesh.removeFromParent();
      releaseEffectMaterial(material);
    },
  };
}

function flashRing(
  center: Vector3,
  innerFraction: number,
  radius: number,
  color: string,
  opacity: number,
): GroundRing {
  const material = effectMaterials.flash.take();
  material.color.set(color);
  material.opacity = opacity;

  return groundRing(material, center, innerFraction, radius, RING_LIFT);
}

function between(low: number, high: number): number {
  return low + Math.random() * (high - low);
}

function retireMeshes(
  meshes: readonly Mesh<BufferGeometry, MeshBasicMaterial | MeshStandardMaterial>[],
): void {
  const materials = new Set<Material>();

  for (const mesh of meshes) {
    mesh.removeFromParent();
    materials.add(mesh.material);
  }

  for (const material of materials) {
    releaseEffectMaterial(material);
  }
}

function chunkOf(material: MeshStandardMaterial, center: Vector3): Chunk {
  const mesh = new Mesh(CHUNK, material);
  const width = between(DEBRIS_SMALLEST, DEBRIS_LARGEST);

  const size = new Vector3(
    width,
    width * between(DEBRIS_THINNEST, DEBRIS_THICKEST),
    width * between(DEBRIS_SHORTEST, DEBRIS_LONGEST),
  );

  const angle = Math.random() * Math.PI * 2;
  const offset = between(DEBRIS_NEAREST, DEBRIS_FARTHEST);
  const speed = between(DEBRIS_SLOWEST, DEBRIS_FASTEST);
  mesh.scale.copy(size);
  mesh.castShadow = true;

  mesh.position.set(
    center.x + Math.cos(angle) * offset,
    DEBRIS_LIFT,
    center.z + Math.sin(angle) * offset,
  );

  return {
    mesh,
    size,
    velocity: new Vector3(
      Math.cos(angle) * speed,
      between(DEBRIS_LOWEST_RISE, DEBRIS_HIGHEST_RISE),
      Math.sin(angle) * speed,
    ),
    spin: new Vector3(
      between(-DEBRIS_SPIN, DEBRIS_SPIN),
      between(-DEBRIS_SPIN, DEBRIS_SPIN),
      between(-DEBRIS_SPIN, DEBRIS_SPIN),
    ),
    life: between(DEBRIS_SHORTEST_LIFE, DEBRIS_LONGEST_LIFE),
  };
}

const turned = new Matrix4();

function tumbleChunk(chunk: Chunk, age: number, deltaSeconds: number): void {
  const { mesh, size, velocity, spin } = chunk;
  velocity.y -= DEBRIS_GRAVITY * deltaSeconds;
  mesh.position.addScaledVector(velocity, deltaSeconds);
  mesh.rotation.x += spin.x * deltaSeconds;
  mesh.rotation.y += spin.y * deltaSeconds;
  mesh.rotation.z += spin.z * deltaSeconds;
  turned.makeRotationFromEuler(mesh.rotation);
  const axes = turned.elements;

  const reach =
    (Math.abs(axes[1]) * size.x + Math.abs(axes[5]) * size.y + Math.abs(axes[9]) * size.z) / 2;

  if (mesh.position.y < reach) {
    mesh.position.y = reach;

    if (velocity.y < 0) {
      velocity.y = -velocity.y * DEBRIS_RESTITUTION;
      velocity.x *= 1 - DEBRIS_FRICTION;
      velocity.z *= 1 - DEBRIS_FRICTION;
      spin.multiplyScalar(1 - DEBRIS_FRICTION);
    }
  }

  const left = chunk.life - age;
  const shrink = Math.min(1, Math.max(left / DEBRIS_SHRINK_SECONDS, SMALLEST_SCALE));
  mesh.scale.copy(size).multiplyScalar(shrink);
  mesh.visible = left > 0;
}

export function createBattleEffects(scene: Scene, particles: ParticleSystem): BattleEffects {
  const running: RunningEffect[] = [];
  const craters: Mesh<PlaneGeometry, MeshBasicMaterial>[] = [];
  const spot = new Vector3();

  function run(
    objects: readonly Object3D[],
    duration: number,
    step: (progress: number) => void,
    retire: () => void,
  ): void {
    for (const object of objects) {
      scene.add(object);
    }

    running.push({ age: 0, duration, step, retire });
    step(0);
  }

  function retireCrater(crater: Mesh<PlaneGeometry, MeshBasicMaterial>): void {
    crater.removeFromParent();
    releaseEffectMaterial(crater.material);
  }

  function shockwave(center: Vector3, color: string, radius: number, seconds: number): void {
    const material = effectMaterials.glow.take();
    material.color.set(color);
    const wave = groundRing(material, center, SHOCKWAVE_INNER, SHOCKWAVE_START, RING_LIFT);

    run(
      [wave.mesh],
      seconds,
      (progress) => {
        wave.mesh.scale.setScalar(SHOCKWAVE_START + (1 - (1 - progress) ** 3) * radius);
        material.opacity = 1 - progress;
      },
      () => wave.retire(),
    );
  }

  function burst(
    point: Vector3,
    color: string,
    blend: ParticleBlend,
    count: number,
    speed: number,
    size: number,
  ): void {
    const tint = new Color(color);

    particles.emit(
      {
        ...BURST,
        blend,
        from: tint,
        to: tint,
        speed: [speed * BURST_SLOWEST, speed],
        size: [size * BURST_BASE_SIZE, size * BURST_BASE_SIZE * BURST_GROWTH],
      },
      point,
      UP,
      count,
    );
  }

  function crater(center: Vector3, radius: number): void {
    const mark = new Mesh(CRATER, effectMaterials.decal.take());
    mark.position.set(center.x, CRATER_LIFT, center.z);
    mark.rotation.y = Math.random() * Math.PI * 2;
    mark.scale.setScalar(radius);
    scene.add(mark);
    craters.push(mark);

    for (const oldest of craters.splice(0, Math.max(0, craters.length - MAX_CRATERS))) {
      retireCrater(oldest);
    }
  }

  function debris(center: Vector3, count: number): void {
    const material = effectMaterials.rock.take();
    material.color.set(DEBRIS_COLOR);
    const chunks = Array.from({ length: count }, () => chunkOf(material, center));
    const meshes = chunks.map((chunk) => chunk.mesh);
    let lastAge = 0;

    run(
      meshes,
      DEBRIS_LONGEST_LIFE,
      (progress) => {
        const age = progress * DEBRIS_LONGEST_LIFE;
        const deltaSeconds = age - lastAge;
        lastAge = age;

        for (const chunk of chunks) {
          tumbleChunk(chunk, age, deltaSeconds);
        }
      },
      () => retireMeshes(meshes),
    );
  }

  function clear(): void {
    for (const effect of running) {
      effect.retire();
    }

    running.length = 0;

    for (const crater of craters.splice(0)) {
      retireCrater(crater);
    }
  }

  return {
    explosion(center, radius) {
      if (!Number.isFinite(radius) || radius <= 0) {
        throw new Error(`An explosion needs a positive radius, got ${radius}`);
      }

      burst(center, FIRE_COLOR, "glow", FIRE_PARTICLES, radius * FIRE_SPEED_PER_RADIUS, FIRE_SIZE);

      burst(
        spot.copy(center).setY(center.y - SOOT_DROP),
        SOOT_COLOR,
        "solid",
        SOOT_PARTICLES,
        radius * SOOT_SPEED_PER_RADIUS,
        SOOT_SIZE,
      );

      const footprint = Math.sqrt(Math.max(0, radius * radius - center.y * center.y));

      if (footprint === 0) {
        return;
      }

      shockwave(center, FIRE_COLOR, footprint * BLAST_WAVE_REACH, BLAST_WAVE_SECONDS);
      crater(center, footprint * BLAST_CRATER_REACH);
      debris(center, BLAST_DEBRIS);
    },

    pop(center, radius, color) {
      const skin = effectMaterials.veil.take();
      skin.color.set(color);
      const shimmer = effectMaterials.flash.take();
      shimmer.color.set("#ffffff");
      const film = new Mesh(SPHERE, skin);
      const glint = new Mesh(GLINT, shimmer);
      film.position.copy(center);
      glint.position.copy(center);

      run(
        [film, glint],
        POP_SECONDS,
        (progress) => {
          film.scale.setScalar(radius * (1 + progress * 0.35));
          skin.opacity = 0.35 * (1 - progress);
          const flare = Math.min(1, (progress * POP_SECONDS) / POP_GLINT_SECONDS);
          glint.scale.setScalar(radius * 0.35 * (1 - flare) + 0.01);
          shimmer.opacity = 1 - flare;
        },
        () => retireMeshes([film, glint]),
      );

      particles.emit(DROPLETS, center, UP, Math.round(radius * DROPLETS_PER_UNIT));
    },

    dust(center, radius) {
      particles.emit(
        { ...LAND_DUST, spread: Math.max(1, radius * 0.5) },
        center,
        UP,
        Math.max(MIN_DUST, Math.round(radius * DUST_PER_UNIT)),
      );
    },

    embers(point, count) {
      particles.emit(EMBERS, point, UP, count);
    },

    fuseSparks(point) {
      particles.emit(FUSE_SPARKS, point, UP, FUSE_SPARK_COUNT);
    },

    stunStar(point) {
      particles.emit(STUN_STAR, point, UP, 1);
    },

    healMotes(point) {
      particles.emit(HEAL_MOTES, point, UP, HEAL_MOTE_COUNT);
    },

    deathDust(point) {
      particles.emit(DEATH_DUST, point, UP, DEATH_DUST_COUNT);
    },

    rage(feet, height, size) {
      if (!Number.isFinite(size) || size <= 0) {
        throw new Error(`Rage needs a body of positive size, got ${size}`);
      }

      const puff = RAGE_PUFF * Math.sqrt(size);

      particles.emit(
        {
          ...(Math.random() < RAGE_EMBER_SHARE ? RAGE_EMBER : RAGE_FUME),
          size: [puff, puff * 2],
          speed: [RAGE_SLOWEST_RISE * size, RAGE_FASTEST_RISE * size],
          spread: RAGE_WIDTH * size,
        },
        spot.copy(feet).setY(feet.y + between(RAGE_LOW, height)),
        UP,
        1,
      );
    },

    smoke(feet, height, spread) {
      particles.emit(
        { ...SMOKE, spread },
        spot.copy(feet).setY(feet.y + between(SMOKE_LOW, height)),
        UP,
        1,
      );
    },

    crater,

    shockwave,

    ringBurst(center, color, speed, count) {
      const tint = new Color(color);

      particles.ring(
        { ...RING_DUST, from: tint, to: tint, speed: [speed, speed] },
        spot.set(center.x, RING_BURST_LIFT, center.z),
        count,
      );
    },

    burst,

    debris,

    marker(center, innerFraction, radius, color, opacity) {
      const ring = flashRing(center, innerFraction, radius, color, opacity);
      scene.add(ring.mesh);

      return {
        setOpacity(next) {
          ring.mesh.material.opacity = next;
        },

        place(next) {
          ring.mesh.position.set(next.x, RING_LIFT, next.z);
        },

        remove() {
          ring.retire();
        },
      };
    },

    step(deltaSeconds) {
      for (let index = running.length - 1; index >= 0; index -= 1) {
        const effect = running[index];
        effect.age += deltaSeconds;
        const progress = Math.min(1, effect.age / effect.duration);
        effect.step(progress);

        if (progress >= 1) {
          running.splice(index, 1);
          effect.retire();
        }
      }
    },

    clear,

    dispose() {
      clear();
    },
  };
}
