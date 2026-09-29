import {
  BoxGeometry,
  CylinderGeometry,
  Group,
  IcosahedronGeometry,
  Matrix4,
  Mesh,
  Object3D,
  OctahedronGeometry,
  Quaternion,
  Vector3,
  type BufferGeometry,
  type MeshStandardMaterial,
} from "three";
import { HAMMER_SWING } from "../models/catalogue.js";
import type { BattleEffects } from "./battle-effects.js";
import { effectMaterials, releaseEffectMaterial } from "./effect-materials.js";
import { KAYKIT_UNIT } from "./figure-base.js";

export interface GiantHammer {
  readonly root: Group;
  pose(seconds: number, heading: Vector3): void;
  face(out: Vector3): Vector3;
  dispose(): void;
}

export const HAMMER_REACH = 3.95;

export const HAMMER_HEAD_HALF = 0.68;

export const HAMMER_FACE = 1.4;

const DEGREES = Math.PI / 180;

const LIFT_SECONDS = 0.35;

const RAISE_SECONDS = 0.8;

const GROW_SECONDS = 0.3;

const SHRINK_SECONDS = 0.2;

const GLOW_FROM_SECONDS = 0.6;

const BRIGHT_GLOW = 0.9;

const DIM_GLOW = 0.2;

const SMALLEST_SCALE = 0.001;

const WOBBLE_RATE = 32;

const WOBBLE_DAMPING = 9;

const WOBBLE_DEGREES = 6;

const STEEL = { color: "#b9c2d4", metalness: 0.55, roughness: 0.4 };

const GOLD = { color: "#e8bd4a", metalness: 0.6, roughness: 0.35, emissive: "#ffc84a" };

const WOOD = { color: "#6b4526", metalness: 0, roughness: 0.55 };

const HANDLE = new CylinderGeometry(0.13, 0.16, 4.4, 8);

const BAND = new CylinderGeometry(0.19, 0.19, 0.14, 8);

const POMMEL = new IcosahedronGeometry(0.28, 0);

const HEAD = new BoxGeometry(1.35, 1.35, 2.5);

const PLATE = new BoxGeometry(1.55, 1.55, 0.22);

const COLLAR = new BoxGeometry(1.5, 0.25, 1.5);

const SPIKE = new OctahedronGeometry(0.45, 0);

const BAND_HEIGHTS = [-0.2, 0.35, 0.9];

const HOLY = "#ffd86b";

const SLAM_GLOW = "#ffe0a0";

const SLAM_RIPPLE = "#ffffff";

const SLAM_DUST = "#c9b9a0";

const SLAM_RUBBLE = "#8a7f96";

const lifted = new Vector3();

const PLATE_OFFSETS = [-1.3, 1.3];

export function smoothstep(progress: number): number {
  return progress * progress * (3 - 2 * progress);
}

export function overshoot(progress: number): number {
  return 1 + 2.7 * (progress - 1) ** 3 + 1.7 * (progress - 1) ** 2;
}

export function swingAngle(seconds: number, groundAngle: number): number {
  if (seconds < LIFT_SECONDS) {
    return (80 - 85 * smoothstep(seconds / LIFT_SECONDS)) * DEGREES;
  }

  if (seconds < RAISE_SECONDS) {
    return (
      (-5 - 33 * smoothstep((seconds - LIFT_SECONDS) / (RAISE_SECONDS - LIFT_SECONDS))) * DEGREES
    );
  }

  if (seconds < HAMMER_SWING.hang) {
    return (-38 - 8 * ((seconds - RAISE_SECONDS) / (HAMMER_SWING.hang - RAISE_SECONDS))) * DEGREES;
  }

  if (seconds < HAMMER_SWING.impact) {
    const fall = (seconds - HAMMER_SWING.hang) / (HAMMER_SWING.impact - HAMMER_SWING.hang);

    return -46 * DEGREES + (groundAngle + 46 * DEGREES) * fall ** 3;
  }

  const since = seconds - HAMMER_SWING.impact;

  return (
    groundAngle -
    Math.sin(since * WOBBLE_RATE) * Math.exp(-since * WOBBLE_DAMPING) * WOBBLE_DEGREES * DEGREES
  );
}

export function hammerGrowth(seconds: number): number {
  if (seconds < LIFT_SECONDS) {
    return overshoot(Math.min(seconds / GROW_SECONDS, 1));
  }

  if (seconds > HAMMER_SWING.release) {
    return Math.max(1 - (seconds - HAMMER_SWING.release) / SHRINK_SECONDS, 0);
  }

  return 1;
}

export function hammerGlow(seconds: number): number {
  return seconds > GLOW_FROM_SECONDS && seconds < HAMMER_SWING.impact ? BRIGHT_GLOW : DIM_GLOW;
}

export function hammerDone(seconds: number): boolean {
  return seconds >= HAMMER_SWING.release + SHRINK_SECONDS;
}

export function swingSeconds(elapsedSeconds: number, impactSeconds: number): number {
  if (impactSeconds <= 0) {
    throw new Error(`A hammer swing needs a positive impact time, got ${impactSeconds}s`);
  }

  return (elapsedSeconds * HAMMER_SWING.impact) / impactSeconds;
}

export function groundAngle(gripHeight: number, reach: number, headHalf: number): number {
  return Math.acos(Math.min(1, Math.max(-1, (headHalf - gripHeight) / reach)));
}

export function summonFlourish(effects: BattleEffects, chest: Vector3): void {
  effects.burst(
    lifted.copy(chest).setY(chest.y + KAYKIT_UNIT),
    HOLY,
    "glow",
    40,
    4 * KAYKIT_UNIT,
    0.4 * KAYKIT_UNIT,
  );
}

export function releaseFlourish(effects: BattleEffects, face: Vector3): void {
  effects.burst(face, HOLY, "glow", 30, 3 * KAYKIT_UNIT, 0.35 * KAYKIT_UNIT);
}

export function slamGround(effects: BattleEffects, center: Vector3, radius: number): void {
  effects.crater(center, radius * 0.85);
  effects.shockwave(center, SLAM_GLOW, radius * 1.3, 0.45);
  effects.shockwave(center, SLAM_RIPPLE, radius * 0.8, 0.25);
  effects.ringBurst(center, SLAM_DUST, 11 * KAYKIT_UNIT, 64);

  effects.burst(
    lifted.copy(center).setY(0.3 * KAYKIT_UNIT),
    SLAM_RUBBLE,
    "solid",
    30,
    5 * KAYKIT_UNIT,
    1.1 * KAYKIT_UNIT,
  );

  effects.burst(
    lifted.copy(center).setY(0.4 * KAYKIT_UNIT),
    HOLY,
    "glow",
    40,
    8 * KAYKIT_UNIT,
    0.5 * KAYKIT_UNIT,
  );

  effects.debris(center, 14);
}

function forged(finish: typeof STEEL | typeof WOOD): MeshStandardMaterial {
  const material = effectMaterials.forged.take();
  material.color.set(finish.color);
  material.metalness = finish.metalness;
  material.roughness = finish.roughness;

  return material;
}

export function createGiantHammer(): GiantHammer {
  const root = new Group();
  root.name = "GiantHammer";
  const steel = forged(STEEL);
  const wood = forged(WOOD);
  const gold = effectMaterials.forged.take();
  gold.color.set(GOLD.color);
  gold.metalness = GOLD.metalness;
  gold.roughness = GOLD.roughness;
  gold.emissive.set(GOLD.emissive);
  gold.emissiveIntensity = 0;

  const part = (
    geometry: BufferGeometry,
    material: MeshStandardMaterial,
    x: number,
    y: number,
    z: number,
  ): void => {
    const mesh = new Mesh(geometry, material);
    mesh.position.set(x, y, z);
    mesh.castShadow = true;
    root.add(mesh);
  };

  part(HANDLE, wood, 0, 1.6, 0);

  for (const height of BAND_HEIGHTS) {
    part(BAND, gold, 0, height, 0);
  }

  part(POMMEL, gold, 0, -0.65, 0);
  part(HEAD, steel, 0, HAMMER_REACH, 0);

  for (const offset of PLATE_OFFSETS) {
    part(PLATE, gold, 0, HAMMER_REACH, offset);
  }

  part(COLLAR, gold, 0, HAMMER_REACH, 0);
  part(SPIKE, gold, 0, HAMMER_REACH + 0.85, 0);
  const faceAnchor = new Object3D();
  faceAnchor.position.set(0, HAMMER_REACH, HAMMER_FACE);
  root.add(faceAnchor);
  root.scale.setScalar(SMALLEST_SCALE);

  const slotPosition = new Vector3();
  const slotRotation = new Quaternion();
  const slotScale = new Vector3();
  const side = new Vector3();
  const handle = new Vector3();
  const facing = new Vector3();
  const basis = new Matrix4();

  return {
    root,

    pose(seconds, heading) {
      const slot = root.parent;

      if (slot === null) {
        throw new Error("The giant hammer must be held before it can swing");
      }

      const growth = hammerGrowth(seconds);
      root.scale.setScalar(Math.max(growth, SMALLEST_SCALE));
      gold.emissiveIntensity = hammerGlow(seconds);
      slot.updateWorldMatrix(true, false);
      slot.matrixWorld.decompose(slotPosition, slotRotation, slotScale);

      const angle = swingAngle(
        seconds,
        groundAngle(
          slotPosition.y,
          HAMMER_REACH * slotScale.x,
          HAMMER_HEAD_HALF * slotScale.x * growth,
        ),
      );

      side.set(heading.z, 0, -heading.x);
      handle.set(0, Math.cos(angle), 0).addScaledVector(heading, Math.sin(angle));
      facing.crossVectors(side, handle);
      basis.makeBasis(side, handle, facing);
      root.quaternion.setFromRotationMatrix(basis).premultiply(slotRotation.invert());
    },

    face(out) {
      return faceAnchor.getWorldPosition(out);
    },

    dispose() {
      root.removeFromParent();

      for (const material of [steel, wood, gold]) {
        releaseEffectMaterial(material);
      }
    },
  };
}
