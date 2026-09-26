import {
  BufferGeometry,
  Color,
  Float32BufferAttribute,
  Group,
  Mesh,
  MeshBasicMaterial,
  MeshStandardMaterial,
  Quaternion,
  Vector3,
} from "three";
import { createVesper, REST_FEET, type Vesper, type VesperPose } from "../../models/vesper/vesper.js";
import { effectMaterials, releaseEffectMaterial } from "./effect-materials.js";
import type { ParticleStyle, ParticleSystem } from "./particles.js";
import type { SpellVisual } from "./spell-visuals.js";
import { createTubeBatch } from "./thread-tube.js";
import { VESPER_SCALE } from "./vesper-figure.js";

interface Claw {
  readonly geometry: BufferGeometry;
  readonly edge: Mesh<BufferGeometry, MeshBasicMaterial>;
  readonly hot: Mesh<BufferGeometry, MeshBasicMaterial>;
  readonly delay: number;
}

interface Ghost {
  readonly model: Vesper;
  readonly fill: MeshStandardMaterial;
}

const DUSK = new Color("#b58cff");

const DUSK_PALE = new Color("#f1e6ff");

const DUSK_DEEP = new Color("#5b24c9");

const DUSK_INK = new Color("#1c1030");

const RAKE_CORE = new Color("#c29bff");

const GHOST_FILL = new Color("#12061f");

const GHOST_GLOW = new Color("#3b138c");

const GHOST_RIM = new Color("#b27dff");

const UP = new Vector3(0, 1, 0);

const FORWARD = new Vector3(0, 0, 1);

const CLAWS = 3;

const CLAW_SEGMENTS = 18;

const CLAW_SPACING = 1.5;

const CLAW_REACH = 5.5;

const CLAW_WIDTH = 0.85;

const CLAW_ARC = 1.5;

const CLAW_STAGGER = 0.025;

const RAKE_SWEEP = 0.07;

const RAKE_SECONDS = 0.34;

const STREAK_SECONDS = 0.24;

const STREAK_RINGS = 12;

const GHOST_ORDER = 12;

const GHOST_OPACITY = 0.9;

const GHOST_REACH = 6.5;

const GHOST_LUNGE = 5;

const GHOST_FADE_IN = 0.04;

const GHOST_LUNGE_SECONDS = 0.12;

const GHOST_HOLD_SECONDS = 0.2;

const GHOST_SECONDS = 0.42;

const GHOST_CHEST = 2.4 * VESPER_SCALE;

const SHADE_FLANK = [1, 1.9] as const;

const GHOST_EDGE = `
float ghostEdge = pow(1.0 - clamp(dot(normal, normalize(vViewPosition)), 0.0, 1.0), 2.0);
totalEmissiveRadiance += ghostRim * ghostEdge * 1.6;
diffuseColor.a *= 0.72 + 0.28 * ghostEdge;
`;

const ghostDepth = new MeshBasicMaterial({
  colorWrite: false,
  transparent: true,
  polygonOffset: true,
  polygonOffsetFactor: 1,
  polygonOffsetUnits: 1,
});

const ghostPool: Ghost[] = [];

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

function easeOut(value: number): number {
  return 1 - (1 - clamp01(value)) ** 3;
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
  geometry.computeVertexNormals();
  geometry.setDrawRange(0, 0);

  return geometry;
}

function surface(color: Color, opacity: number, additive: boolean): MeshBasicMaterial {
  const material = additive ? effectMaterials.glow.take() : effectMaterials.veil.take();
  material.color.copy(color);
  material.opacity = opacity;
  material.depthTest = false;

  return material;
}

export function duskPuff(particles: ParticleSystem, at: Vector3, strength: number): void {
  particles.emit(SHADOW_SMOKE, at, UP, Math.round(18 * strength));
  particles.emit(DUSK_SPARKS, at, UP, Math.round(4 * strength));
}

export function clawRake(particles: ParticleSystem, center: Vector3, strength: number): SpellVisual {
  const root = new Group();
  const face = new Group();
  root.position.copy(center);
  root.add(face);

  const roll = new Quaternion().setFromAxisAngle(
    FORWARD,
    (Math.random() - 0.5) * 1.6 + (Math.random() < 0.5 ? 0 : Math.PI),
  );

  const size = 0.75 + 0.35 * strength;

  const claws: Claw[] = Array.from({ length: CLAWS }, (_, index) => {
    const geometry = crescent(CLAW_REACH * size * (index === 1 ? 1.12 : 1), CLAW_WIDTH * size, CLAW_ARC);
    const edge = new Mesh(geometry, surface(DUSK_DEEP, 0.95, false));
    const hot = new Mesh(geometry, surface(RAKE_CORE, 0.8, true));
    const offset = (index - (CLAWS - 1) / 2) * CLAW_SPACING * size;
    edge.position.set(offset * 0.25, offset, 0);
    hot.position.copy(edge.position);
    hot.scale.set(1, 0.3, 1);
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
        claw.edge.material.opacity = 0.95 * fade * Math.min(1, strength + 0.25);
        claw.hot.material.opacity = 0.8 * fade;
        claw.edge.scale.set(1, 0.6 + 0.4 * fade, 1);
        claw.hot.scale.set(1, 0.3 * (0.4 + 0.6 * fade), 1);
      }
    },

    finished() {
      return age >= RAKE_SECONDS;
    },

    dispose() {
      root.removeFromParent();

      for (const claw of claws) {
        claw.geometry.dispose();
        releaseEffectMaterial(claw.edge.material);
        releaseEffectMaterial(claw.hot.material);
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

  const points = Array.from({ length: STREAK_RINGS }, (_, index) =>
    new Vector3().lerpVectors(from, to, index / (STREAK_RINGS - 1)),
  );

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
      releaseEffectMaterial(inkSurface);
      releaseEffectMaterial(glowSurface);
    },
  };
}

function ghostMaterial(): MeshStandardMaterial {
  const material = new MeshStandardMaterial({
    color: GHOST_FILL,
    emissive: GHOST_GLOW,
    emissiveIntensity: 0.3,
    roughness: 0.7,
    transparent: true,
    depthWrite: false,
  });

  material.onBeforeCompile = (shader) => {
    shader.uniforms["ghostRim"] = { value: GHOST_RIM };
    shader.fragmentShader = shader.fragmentShader
      .replace("#include <common>", "#include <common>\nuniform vec3 ghostRim;")
      .replace("#include <emissivemap_fragment>", `#include <emissivemap_fragment>\n${GHOST_EDGE}`);
  };

  material.customProgramCacheKey = () => "vesper-ghost";

  return material;
}

function takeGhost(): Ghost {
  const pooled = ghostPool.pop();

  if (pooled !== undefined) {
    return pooled;
  }

  const model = createVesper();
  const fill = ghostMaterial();
  model.setGhost(fill, ghostDepth, GHOST_ORDER);
  model.root.scale.setScalar(VESPER_SCALE);

  return { model, fill };
}

function lungePose(pose: VesperPose, strike: number): void {
  const spring = 1 - strike;
  pose.bob = 0.55 * spring - 0.15 * strike;
  pose.surge = 0.9 * spring + 0.5 * strike;
  pose.pitch = 0.2 * spring - 0.14 * strike;
  pose.roll = 0;
  pose.arch = -0.3 * spring + 0.1 * strike;
  pose.sit = 0;
  pose.limp = 0;
  pose.headPitch = 0.1 * spring - 0.25 * strike;
  pose.headYaw = 0;
  pose.tailLift = 1.2 - 0.3 * strike;
  pose.tailSwing = 0.1;
  pose.breath = 0;
  pose.flame = 0;
  pose.blink = 0;

  for (const [index, foot] of pose.feet.entries()) {
    const front = index < 2;
    foot.copy(REST_FEET[index] ?? foot);
    foot.y += front ? 0.8 * spring + 0.15 * strike : 0.35 * spring + 0.1 * strike;
    foot.z += front ? 1.3 * spring + 1.7 * strike : -0.9 * spring - 0.6 * strike;
  }
}

function ghostStrike(particles: ParticleSystem, direction: Vector3, target: Vector3, strength: number): SpellVisual {
  const ghost = takeGhost();
  const root = new Group();
  const end = new Vector3(target.x, 0, target.z).addScaledVector(direction, -GHOST_REACH);
  const start = end.clone().addScaledVector(direction, -GHOST_LUNGE);
  const presence = GHOST_OPACITY * Math.min(1, 0.4 + 0.6 * strength);
  ghost.model.root.rotation.set(0, Math.atan2(direction.x, direction.z), 0);
  root.add(ghost.model.root);
  let age = 0;
  let dissolved = false;
  let released = false;

  return {
    root,

    update(deltaSeconds) {
      age += deltaSeconds;
      const strike = easeOut(age / GHOST_LUNGE_SECONDS);

      const fade =
        clamp01(age / GHOST_FADE_IN) * (1 - clamp01((age - GHOST_HOLD_SECONDS) / (GHOST_SECONDS - GHOST_HOLD_SECONDS)));

      ghost.model.root.position.lerpVectors(start, end, strike);
      lungePose(ghost.model.pose, strike);
      ghost.fill.opacity = presence * fade;
      ghost.model.update(deltaSeconds);

      if (!dissolved && age >= GHOST_HOLD_SECONDS) {
        dissolved = true;
        const chest = ghost.model.root.position.clone().addScaledVector(direction, GHOST_CHEST).setY(GHOST_CHEST);
        duskPuff(particles, chest, 0.6 * presence);
      }
    },

    finished() {
      return age >= GHOST_SECONDS;
    },

    dispose() {
      root.removeFromParent();

      if (!released) {
        released = true;
        ghost.model.root.removeFromParent();
        ghostPool.push(ghost);
      }
    },
  };
}

export function shadowStrike(particles: ParticleSystem, from: Vector3, target: Vector3, strength: number): SpellVisual {
  const direction = new Vector3(target.x - from.x, 0, target.z - from.z);

  if (direction.lengthSq() < 1e-6) {
    direction.set(0, 0, 1);
  }

  return ghostStrike(particles, direction.normalize(), target, strength);
}

export function shadeStrike(
  particles: ParticleSystem,
  source: Vector3,
  target: Vector3,
  strength: number,
): SpellVisual {
  const [least, most] = SHADE_FLANK;
  const turn = (least + Math.random() * (most - least)) * (Math.random() < 0.5 ? -1 : 1);
  const direction = new Vector3(target.x - source.x, 0, target.z - source.z);

  if (direction.lengthSq() < 1e-6) {
    direction.set(0, 0, 1);
  }

  return ghostStrike(particles, direction.normalize().applyAxisAngle(UP, turn), target, strength);
}
