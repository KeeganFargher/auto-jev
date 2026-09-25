import {
  BoxGeometry,
  CapsuleGeometry,
  Color,
  ConeGeometry,
  CylinderGeometry,
  Group,
  IcosahedronGeometry,
  Mesh,
  MeshStandardMaterial,
  Object3D,
  SphereGeometry,
  TorusGeometry,
  Vector3,
  type BufferGeometry,
  type ColorRepresentation,
} from "three";
import { MAX_HERO_LEVEL } from "@jev-game/game";
import { bulwark, duskblade, frostweaver, hexbinder, pyromancer } from "@jev-game/content";
import { isModelId, type ModelId } from "../../models/catalogue.js";
import { models, type LoadedModel } from "../../models/library.js";
import {
  ATTACK_SECONDS,
  CAST_SECONDS,
  CHEST_FRACTION,
  DEAD_COLOR,
  DEATH_SECONDS,
  FIGURE_SCALE,
  HIT_SECONDS,
  LUNGE_UNITS,
  SINK_SECONDS,
  SINK_UNITS,
  createFigureBase,
  paintSpectral,
  type SpectralMemory,
} from "./figure-base.js";
import { createModelFigure } from "./model-figure.js";
import { createMoiraFigure } from "./moira-figure.js";

export type FigureAction = "attack" | "cast" | "hit";

export interface HeroFigure {
  readonly root: Group;
  readonly height: number;
  setTeamColor(color: ColorRepresentation): void;
  setMoving(moving: boolean): void;
  trigger(action: FigureAction): void;
  setDead(dead: boolean): void;
  setLinger(linger: boolean): void;
  setSpectral(spectral: boolean): void;
  setOverclock(level: number): void;
  setGlow(amount: number): void;
  setCharge(amount: number): void;
  setChanneling(channeling: boolean): void;
  setCelebrating(celebrating: boolean): void;
  setCastsShadow(castsShadow: boolean): void;
  castOrigin(out: Vector3): Vector3;
  update(deltaSeconds: number): void;
  dispose(): void;
}

export interface FigureTraits {
  height: number;
  rooted: boolean;
}

const SKIN = "#f0c7a0";

const STEEL = "#8d93a6";

const ROTOR_IDLE_SPEED = 2.5;

const ROTOR_FIRING_SPEED = 24;

const OVERCLOCK_GLOW = 2.5;

const AXE_ARC = Math.PI * 0.55;

const UP = new Vector3(0, 1, 0);

interface FigureParts {
  body: Group;
  accentMaterials: MeshStandardMaterial[];
  teamMaterials: MeshStandardMaterial[];
  height: number;
  rooted?: boolean;
  hover?: boolean;
  rotor?: Group;
}

interface PartBuilder {
  materials: MeshStandardMaterial[];
  geometries: BufferGeometry[];
  body: Group;
}

function material(builder: PartBuilder, color: ColorRepresentation, metalness = 0.05): MeshStandardMaterial {
  const created = new MeshStandardMaterial({ color, roughness: 0.72, metalness, flatShading: true });
  builder.materials.push(created);

  return created;
}

function part(
  builder: PartBuilder,
  geometry: BufferGeometry,
  surface: MeshStandardMaterial,
  x: number,
  y: number,
  z: number,
): Mesh {
  builder.geometries.push(geometry);
  const mesh = new Mesh(geometry, surface);
  mesh.position.set(x, y, z);
  mesh.castShadow = true;
  builder.body.add(mesh);

  return mesh;
}

function point(x: number, y: number, z: number): Vector3 {
  return new Vector3(x, y, z);
}

function span(mesh: Mesh, from: Vector3, to: Vector3): Mesh {
  mesh.position.addVectors(from, to).multiplyScalar(0.5);
  mesh.quaternion.setFromUnitVectors(UP, new Vector3().subVectors(to, from).normalize());

  return mesh;
}

function limb(builder: PartBuilder, surface: MeshStandardMaterial, from: Vector3, to: Vector3, radius: number): Mesh {
  return span(part(builder, new CapsuleGeometry(radius, from.distanceTo(to), 2, 6), surface, 0, 0, 0), from, to);
}

function spike(builder: PartBuilder, surface: MeshStandardMaterial, from: Vector3, to: Vector3, radius: number): Mesh {
  return span(part(builder, new ConeGeometry(radius, from.distanceTo(to), 5), surface, 0, 0, 0), from, to);
}

function strut(
  builder: PartBuilder,
  surface: MeshStandardMaterial,
  from: Vector3,
  to: Vector3,
  fromRadius: number,
  toRadius: number,
): Mesh {
  return span(part(builder, new CylinderGeometry(toRadius, fromRadius, from.distanceTo(to), 8), surface, 0, 0, 0), from, to);
}

function cog(builder: PartBuilder, surface: MeshStandardMaterial, hub: MeshStandardMaterial, center: Vector3, radius: number): void {
  const wheel = part(builder, new CylinderGeometry(radius, radius, 0.26, 10), surface, center.x, center.y, center.z);
  wheel.rotation.x = Math.PI / 2;
  const axle = part(builder, new CylinderGeometry(radius * 0.32, radius * 0.32, 0.42, 6), hub, center.x, center.y, center.z);
  axle.rotation.x = Math.PI / 2;

  for (let tooth = 0; tooth < 3; tooth += 1) {
    const bar = part(builder, new BoxGeometry(radius * 2.5, radius * 0.36, 0.22), surface, center.x, center.y, center.z);
    bar.rotation.z = (Math.PI * tooth) / 3;
  }
}

function buildBulwark(builder: PartBuilder): FigureParts {
  const plate = material(builder, "#6b6f7e", 0.45);
  const bronze = material(builder, "#d9a441", 0.35);
  const steel = material(builder, STEEL, 0.5);
  const team = material(builder, "#ffffff");

  const torso = part(builder, new CapsuleGeometry(2.3, 1.9, 3, 8), plate, 0, 3, 0);
  torso.scale.set(1.25, 1, 1.05);
  part(builder, new SphereGeometry(1.35, 8, 6), steel, 0, 6.9, 0);
  part(builder, new BoxGeometry(2.1, 0.5, 0.4), bronze, 0, 6.8, 1.15);

  for (const direction of [-1, 1]) {
    const pauldron = part(builder, new SphereGeometry(1.35, 7, 5), bronze, direction * 2.5, 5.2, 0);
    pauldron.scale.set(1.05, 0.7, 1.1);
  }

  part(builder, new BoxGeometry(3.9, 5.6, 0.6), bronze, -0.4, 3.4, 2.5);
  part(builder, new BoxGeometry(1.2, 3.2, 0.7), steel, -0.4, 3.6, 2.7);

  const belt = part(builder, new CylinderGeometry(2.4, 2.4, 0.7, 10), team, 0, 2.3, 0);
  belt.scale.set(1.2, 1, 1.05);

  return { body: builder.body, accentMaterials: [bronze], teamMaterials: [team], height: 8.4 };
}

function buildPyromancer(builder: PartBuilder): FigureParts {
  const robe = material(builder, "#7a2a1f");
  const ember = material(builder, "#ff8a4c", 0.1);
  ember.emissive = new Color("#c2410c");
  const gold = material(builder, "#e2bd5c", 0.3);
  const skin = material(builder, SKIN);
  const team = material(builder, "#ffffff");

  part(builder, new CylinderGeometry(1.2, 2.4, 5.4, 10), robe, 0, 2.7, 0);
  part(builder, new SphereGeometry(1.45, 8, 6), robe, 0, 5.7, 0);
  part(builder, new SphereGeometry(1.08, 8, 6), skin, 0, 7, 0.15);
  const hat = part(builder, new ConeGeometry(1.5, 3.4, 8), robe, 0, 9, -0.2);
  hat.rotation.x = -0.15;
  part(builder, new TorusGeometry(1.35, 0.22, 5, 10), gold, 0, 7.6, -0.1).rotation.x = Math.PI / 2;
  part(builder, new IcosahedronGeometry(0.95, 1), ember, 2.1, 4.6, 1.2);

  const sash = part(builder, new TorusGeometry(1.45, 0.3, 6, 10), team, 0, 3.6, 0);
  sash.rotation.x = Math.PI / 2;

  return { body: builder.body, accentMaterials: [ember], teamMaterials: [team], height: 10.4 };
}

function buildRavager(builder: PartBuilder): FigureParts {
  const hide = material(builder, "#c28a64");
  const fur = material(builder, "#76573a");
  const leather = material(builder, "#4a3224");
  const haft = material(builder, "#8a6a45");
  const iron = material(builder, "#6c707a", 0.5);
  const ivory = material(builder, "#efe4c8");
  const blood = material(builder, "#d9534f", 0.35);
  blood.emissive = new Color("#7a1712");
  const team = material(builder, "#ffffff");

  part(builder, new CylinderGeometry(1.6, 1.95, 2.4, 8), leather, 0, 1.2, 0);
  const torso = part(builder, new CapsuleGeometry(2.05, 1, 3, 8), hide, 0, 4.3, 0.15);
  torso.scale.set(1.3, 0.95, 1.05);
  torso.rotation.x = 0.28;
  const wrap = part(builder, new TorusGeometry(1.75, 0.36, 6, 12), team, 0, 2.45, 0);
  wrap.rotation.x = Math.PI / 2;
  wrap.scale.set(1.12, 1, 1);
  const hump = part(builder, new IcosahedronGeometry(1.5, 1), fur, 0, 6.1, -0.75);
  hump.scale.set(1.3, 0.75, 1);

  part(builder, new SphereGeometry(1, 8, 6), hide, 0, 6.9, 1.55);
  const helm = part(builder, new SphereGeometry(1.08, 8, 6), iron, 0, 7.25, 1.4);
  helm.scale.set(1.05, 0.75, 1.05);

  for (const direction of [-1, 1]) {
    const pelt = part(builder, new IcosahedronGeometry(1.2, 1), fur, direction * 1.75, 6, 0.1);
    pelt.scale.set(1.15, 0.8, 1.15);
    part(builder, new SphereGeometry(0.14, 5, 4), blood, direction * 0.35, 7, 2.42);
    spike(builder, ivory, point(direction * 0.7, 6.8, 1.6), point(direction * 1.7, 8.9, 2.3), 0.36);
    limb(builder, hide, point(direction * 2.3, 5.8, 0.5), point(direction * 2.9, 4.4, 1.6), 0.6);
    limb(builder, haft, point(direction * 2.95, 3.4, 1.75), point(direction * 3.15, 7, 2.15), 0.14);

    const edge = new CylinderGeometry(1.1, 1.1, 0.2, 6, 1, false, direction * (Math.PI / 2) - AXE_ARC / 2, AXE_ARC);
    const blade = part(builder, edge, blood, direction * 3.1, 6.2, 2.06);
    blade.rotation.x = Math.PI / 2;
  }

  return { body: builder.body, accentMaterials: [blood], teamMaterials: [team], height: 8.9 };
}

function buildFrostweaver(builder: PartBuilder): FigureParts {
  const scale = material(builder, "#bfe3f2");
  const belly = material(builder, "#eef8fb");
  const deep = material(builder, "#5d8fb4");
  const ice = material(builder, "#9fe8ff", 0.1);
  ice.emissive = new Color("#3fa7c9");
  const team = material(builder, "#ffffff");

  const body = part(builder, new CapsuleGeometry(1.9, 3.6, 3, 10), scale, 0, 3.4, -0.4);
  body.rotation.x = Math.PI / 2;
  body.scale.set(1.15, 1, 1);
  const chest = part(builder, new SphereGeometry(1.6, 8, 6), belly, 0, 3, 1.5);
  chest.scale.set(1.05, 1, 0.8);

  for (const side of [-1, 1]) {
    for (const reach of [-2, 1.6]) {
      limb(builder, scale, point(side * 1.3, 3, reach), point(side * 1.75, 0.35, reach + 0.3), 0.55);
      spike(builder, deep, point(side * 1.75, 0.4, reach + 0.55), point(side * 1.75, 0.2, reach + 1.35), 0.22);
    }

    const wing = part(builder, new ConeGeometry(2.6, 5.2, 3), deep, side * 2.9, 6.1, -0.9);
    wing.scale.set(1, 1, 0.14);
    wing.rotation.set(0.35, 0, -side * 0.95);
    spike(builder, ice, point(side * 0.45, 8.25, 2.9), point(side * 0.8, 9.3, 2.1), 0.22);
    part(builder, new SphereGeometry(0.17, 5, 4), ice, side * 0.42, 7.55, 3.95);
  }

  strut(builder, scale, point(0, 3.9, 1.8), point(0, 6.8, 3), 1.05, 0.72);
  const head = part(builder, new BoxGeometry(1.7, 1.3, 2.2), scale, 0, 7.4, 3.5);
  head.rotation.x = 0.12;
  const snout = part(builder, new BoxGeometry(1.2, 0.8, 1.2), belly, 0, 7.05, 4.9);
  snout.rotation.x = 0.12;
  const collar = part(builder, new TorusGeometry(1.1, 0.3, 6, 12), team, 0, 4.6, 2.05);
  collar.rotation.x = Math.PI / 2 - 0.45;
  strut(builder, scale, point(0, 3.2, -3.4), point(0, 2.1, -6.2), 0.85, 0.2);

  for (const reach of [-2.4, -0.8, 0.8]) {
    part(builder, new IcosahedronGeometry(0.62, 0), ice, 0, 5.25, reach);
  }

  return { body: builder.body, accentMaterials: [ice], teamMaterials: [team], height: 9.3 };
}

function buildDuskblade(builder: PartBuilder): FigureParts {
  const fur = material(builder, "#2a2140");
  const shadow = material(builder, "#17122a");
  const violet = material(builder, "#b58cff", 0.15);
  violet.emissive = new Color("#5b33a8");
  const team = material(builder, "#ffffff");

  const body = part(builder, new CapsuleGeometry(1.4, 3.8, 3, 10), fur, 0, 2.3, -0.3);
  body.rotation.x = Math.PI / 2 - 0.1;
  body.scale.set(1.15, 1, 0.9);

  for (const side of [-1, 1]) {
    limb(builder, fur, point(side * 0.9, 2.2, 1.9), point(side * 2.1, 0.35, 2.9), 0.42);
    limb(builder, fur, point(side * 0.9, 2.2, -2.4), point(side * 2.1, 0.35, -3.2), 0.46);

    for (const reach of [3, -3.3]) {
      const paw = part(builder, new SphereGeometry(0.55, 6, 4), shadow, side * 2.15, 0.3, reach);
      paw.scale.set(1.1, 0.5, 1.3);
    }

    spike(builder, violet, point(side * 2.15, 0.45, 3.4), point(side * 2.35, 0.2, 4.1), 0.14);
    spike(builder, fur, point(side * 0.55, 4.3, 3.4), point(side * 0.8, 5.3, 3.1), 0.32);
    part(builder, new SphereGeometry(0.2, 6, 4), violet, side * 0.42, 3.8, 4.4);
  }

  const head = part(builder, new SphereGeometry(1.15, 8, 6), fur, 0, 3.6, 3.4);
  head.scale.set(1, 0.85, 1.1);
  part(builder, new BoxGeometry(0.9, 0.6, 1), shadow, 0, 3.2, 4.4);
  strut(builder, fur, point(0.3, 2.5, -3.3), point(1.5, 2.1, -4.8), 0.34, 0.2);
  strut(builder, fur, point(1.5, 2.1, -4.8), point(2.7, 2.6, -5.3), 0.2, 0.08);

  for (const reach of [-2.2, -0.9, 0.4]) {
    spike(builder, violet, point(0, 3.4, reach), point(0, 4.2, reach - 0.6), 0.26);
  }

  const collar = part(builder, new TorusGeometry(0.95, 0.24, 6, 12), team, 0, 3.1, 2.4);
  collar.rotation.x = Math.PI / 2 - 0.35;

  return { body: builder.body, accentMaterials: [violet], teamMaterials: [team], height: 5.6 };
}

function buildOathkeeper(builder: PartBuilder): FigureParts {
  const shell = material(builder, "#5f6f4a");
  const plate = material(builder, "#8a9a66");
  const skin = material(builder, "#9ba07a");
  const wood = material(builder, "#6a4d33");
  const radiance = material(builder, "#f2d27a", 0.3);
  radiance.emissive = new Color("#a8741c");
  const team = material(builder, "#ffffff");

  const dome = part(builder, new SphereGeometry(3.3, 10, 7, 0, Math.PI * 2, 0, Math.PI / 2), shell, 0, 1.7, -0.2);
  dome.scale.set(1, 0.75, 1.15);
  const rim = part(builder, new TorusGeometry(3.3, 0.35, 6, 16), team, 0, 1.7, -0.2);
  rim.rotation.x = Math.PI / 2;
  rim.scale.set(1, 1.15, 1);

  for (const [x, z] of [
    [-1.4, -1.2],
    [1.4, -1.2],
    [0, 0.9],
    [-1.5, 1],
    [1.5, 1],
  ] as const) {
    const scute = part(builder, new CylinderGeometry(0.85, 0.95, 0.3, 6), plate, x, 3.55, z);
    scute.rotation.set(-z * 0.18, 0, x * 0.2);
  }

  for (const side of [-1, 1]) {
    for (const reach of [-2.2, 1.8]) {
      limb(builder, skin, point(side * 2.4, 1.3, reach), point(side * 2.8, 0.35, reach + 0.25), 0.7);
    }

    part(builder, new SphereGeometry(0.14, 5, 4), radiance, side * 0.45, 3.3, 5.6);
  }

  strut(builder, skin, point(0, 1.9, 3), point(0, 2.7, 4.3), 0.75, 0.62);
  part(builder, new SphereGeometry(0.95, 8, 6), skin, 0, 3, 4.8);

  part(builder, new BoxGeometry(2.1, 2, 1.7), wood, 0, 5.1, -0.4);
  const roof = part(builder, new ConeGeometry(1.9, 1.5, 4), plate, 0, 6.85, -0.4);
  roof.rotation.y = Math.PI / 4;
  part(builder, new TorusGeometry(0.62, 0.14, 6, 18), radiance, 0, 5.2, 0.5);
  part(builder, new SphereGeometry(0.34, 6, 5), radiance, 0, 5.2, 0.52);
  const bell = part(builder, new ConeGeometry(0.42, 0.6, 8), radiance, 0, 7.8, -0.4);
  bell.rotation.x = Math.PI;

  return { body: builder.body, accentMaterials: [radiance], teamMaterials: [team], height: 8.4 };
}

function buildHexbinder(builder: PartBuilder): FigureParts {
  const core = material(builder, "#3a1a3f");
  const sclera = material(builder, "#f3e9f5");
  const iris = material(builder, "#c86bff", 0.15);
  iris.emissive = new Color("#7a22b5");
  const pupil = material(builder, "#12061a");
  const thread = material(builder, "#e3a6ff", 0.1);
  thread.emissive = new Color("#8a2fc4");
  const team = material(builder, "#ffffff");

  part(builder, new IcosahedronGeometry(2.3, 1), core, 0, 6.2, 0);
  const band = part(builder, new TorusGeometry(2.35, 0.26, 6, 16), team, 0, 6.2, 0);
  band.rotation.x = Math.PI / 2;

  for (const [tilt, turn] of [
    [0.35, 0.2],
    [1.25, -0.6],
    [2.1, 0.9],
  ] as const) {
    const loop = part(builder, new TorusGeometry(2.75, 0.1, 5, 24), thread, 0, 6.2, 0);
    loop.rotation.set(tilt, turn, 0);
  }

  const eye = part(builder, new SphereGeometry(1.25, 10, 8), sclera, 0, 6.4, 1.45);
  eye.scale.set(1, 1, 0.7);
  const iris3d = part(builder, new SphereGeometry(0.7, 8, 6), iris, 0, 6.4, 2.1);
  iris3d.scale.set(1, 1, 0.5);
  const pupil3d = part(builder, new SphereGeometry(0.34, 6, 5), pupil, 0, 6.4, 2.32);
  pupil3d.scale.set(0.7, 1, 0.4);

  for (const [x, z, length] of [
    [-0.9, 0.4, 2.6],
    [0.8, -0.3, 3.1],
    [0.1, 0.9, 2.2],
    [-0.3, -0.9, 2.8],
  ] as const) {
    limb(builder, thread, point(x, 4.1, z), point(x * 1.3, 4.1 - length, z * 1.3), 0.07);
  }

  return { body: builder.body, accentMaterials: [iris, thread], teamMaterials: [team], height: 9.2, hover: true };
}

function buildBlightmother(builder: PartBuilder): FigureParts {
  const bark = material(builder, "#5a4630");
  const heart = material(builder, "#3a2c1d");
  const leaves = material(builder, "#4f7a33");
  const moss = material(builder, "#6f8f3d");
  const blight = material(builder, "#8fd14f", 0.1);
  blight.emissive = new Color("#3f7d14");
  const team = material(builder, "#ffffff");

  strut(builder, bark, point(0, 0.8, 0), point(0, 6.6, 0.2), 1.9, 1.05);

  for (const angle of [0.5, 2.1, 3.7, 5.2]) {
    spike(builder, bark, point(Math.sin(angle) * 1.1, 1.6, Math.cos(angle) * 1.1), point(Math.sin(angle) * 2.8, 0.05, Math.cos(angle) * 2.8), 0.55);
  }

  for (const side of [-1, 1]) {
    strut(builder, bark, point(side * 1.2, 5.6, 0.3), point(side * 3, 6.9, 1.2), 0.45, 0.2);
    strut(builder, bark, point(side * 3, 6.9, 1.2), point(side * 3.4, 5.7, 2.1), 0.2, 0.12);
    part(builder, new SphereGeometry(0.2, 6, 4), blight, side * 0.5, 4.7, 1.55);
  }

  part(builder, new BoxGeometry(0.9, 0.35, 0.3), heart, 0, 4, 1.55);

  for (const [x, y, z, radius] of [
    [0, 8.3, 0, 2.3],
    [-1.9, 7.4, 0.3, 1.6],
    [1.9, 7.5, -0.2, 1.7],
    [0.4, 7.2, -1.6, 1.5],
  ] as const) {
    part(builder, new IcosahedronGeometry(radius, 1), leaves, x, y, z);
  }

  for (const [x, y, z] of [
    [0.9, 9.4, 1.4],
    [-1.6, 8.5, 1.4],
    [2.2, 8.2, 0.9],
    [-0.4, 10.2, 0.4],
  ] as const) {
    part(builder, new SphereGeometry(0.38, 7, 5), blight, x, y, z);
  }

  const vine = part(builder, new TorusGeometry(1.55, 0.28, 6, 12), team, 0, 2.9, 0.08);
  vine.rotation.x = Math.PI / 2;
  part(builder, new IcosahedronGeometry(0.7, 0), moss, 1.3, 6.3, 0.9);

  return { body: builder.body, accentMaterials: [blight], teamMaterials: [team], height: 10.6 };
}

function buildBonecaller(builder: PartBuilder): FigureParts {
  const carapace = material(builder, "#1f2024", 0.35);
  const underside = material(builder, "#34302c");
  const iron = material(builder, "#5d636b", 0.5);
  const wood = material(builder, "#6a4d33");
  const soul = material(builder, "#9fe0d0", 0.1);
  soul.emissive = new Color("#2a8a78");
  const team = material(builder, "#ffffff");

  const shell = part(builder, new SphereGeometry(2.6, 10, 7), carapace, 0, 2.6, -0.6);
  shell.scale.set(1, 0.72, 1.45);

  for (const reach of [-2.1, 0.2]) {
    const stripe = part(builder, new TorusGeometry(2.45, 0.34, 5, 16, Math.PI), team, 0, 2.75, reach);
    stripe.rotation.set(0, Math.PI / 2, 0);
    stripe.scale.set(1.02, 0.78, 1);
  }

  const face = part(builder, new SphereGeometry(1.15, 8, 6), underside, 0, 2.2, 3.1);
  face.scale.set(1.2, 0.8, 0.9);

  for (const side of [-1, 1]) {
    for (const reach of [-2.4, -0.6, 1.3]) {
      const hip = point(side * 1.7, 1.9, reach);
      const knee = point(side * 3.1, 2.4, reach + 0.3);
      limb(builder, underside, hip, knee, 0.2);
      limb(builder, underside, knee, point(side * 3.6, 0.1, reach + 0.6), 0.16);
    }

    spike(builder, carapace, point(side * 0.5, 2.1, 3.7), point(side * 0.15, 1.9, 4.9), 0.28);
    limb(builder, underside, point(side * 0.45, 2.7, 3.7), point(side * 1.2, 4.3, 4.8), 0.07);
    part(builder, new SphereGeometry(0.28, 6, 5), soul, side * 1.2, 4.35, 4.85);
  }

  limb(builder, iron, point(1.1, 1.9, 3.95), point(1.4, 1.2, 4.3), 0.05);
  part(builder, new ConeGeometry(0.36, 0.28, 6), iron, 1.4, 1.05, 4.3);
  part(builder, new CylinderGeometry(0.3, 0.3, 0.6, 6), soul, 1.4, 0.7, 4.3);

  strut(builder, wood, point(-0.9, 4.2, -2.4), point(0.9, 4.2, 1.2), 0.13, 0.13);
  const blade = part(builder, new BoxGeometry(0.95, 0.12, 1.1), iron, -1.05, 4.2, -2.75);
  blade.rotation.y = 0.45;

  return { body: builder.body, accentMaterials: [soul], teamMaterials: [team], height: 6.4 };
}

function buildClockwright(builder: PartBuilder): FigureParts {
  const brass = material(builder, "#c99a55", 0.6);
  const copper = material(builder, "#b8683a", 0.55);
  const steel = material(builder, STEEL, 0.6);
  const face = material(builder, "#efe4c8");
  const glow = material(builder, "#e0a458", 0.3);
  glow.emissive = new Color("#b0601a");
  const team = material(builder, "#ffffff");

  for (let leg = 0; leg < 3; leg += 1) {
    const angle = Math.PI + (leg * Math.PI * 2) / 3;
    const hip = point(Math.sin(angle) * 0.9, 3.4, Math.cos(angle) * 0.9);
    const knee = point(Math.sin(angle) * 2.3, 2.4, Math.cos(angle) * 2.3);
    const foot = point(Math.sin(angle) * 2.6, 0.15, Math.cos(angle) * 2.6);
    limb(builder, copper, hip, knee, 0.26);
    limb(builder, copper, knee, foot, 0.22);
    part(builder, new CylinderGeometry(0.4, 0.5, 0.24, 6), brass, foot.x, 0.12, foot.z);
  }

  const casing = part(builder, new CylinderGeometry(2.4, 2.4, 1.6, 14), brass, 0, 6, 0);
  casing.rotation.x = Math.PI / 2;
  const dial = part(builder, new CylinderGeometry(2.05, 2.05, 0.2, 16), face, 0, 6, 0.85);
  dial.rotation.x = Math.PI / 2;
  part(builder, new TorusGeometry(2.3, 0.26, 6, 18), team, 0, 6, 0.8);
  const hour = part(builder, new BoxGeometry(0.2, 1.1, 0.08), steel, 0.25, 6.45, 1);
  hour.rotation.z = -0.5;
  const minute = part(builder, new BoxGeometry(0.14, 1.6, 0.08), steel, -0.35, 6.6, 1.04);
  minute.rotation.z = 0.45;
  part(builder, new SphereGeometry(0.28, 6, 5), glow, 0, 6, 1.1);

  part(builder, new CylinderGeometry(0.9, 1.3, 0.9, 10), brass, 0, 8.3, 0);
  const bell = part(builder, new ConeGeometry(0.7, 0.9, 10), glow, 0, 9.1, 0);
  bell.rotation.x = Math.PI;
  part(builder, new CylinderGeometry(0.22, 0.22, 1.4, 6), copper, -1.3, 8.4, -0.5);
  cog(builder, brass, steel, point(0, 6, -1), 1.1);

  for (const side of [-1, 1]) {
    limb(builder, copper, point(side * 2.3, 6.2, 0.2), point(side * 3.1, 4.9, 1), 0.25);
  }

  const jaw = part(builder, new TorusGeometry(0.6, 0.22, 4, 8, Math.PI * 1.45), steel, 3.2, 4.4, 1.2);
  jaw.rotation.z = Math.PI * 0.775;
  part(builder, new BoxGeometry(0.9, 0.55, 0.55), steel, -3.2, 4.6, 1.2);

  return { body: builder.body, accentMaterials: [glow], teamMaterials: [team], height: 9.6 };
}

function buildThrall(builder: PartBuilder): FigureParts {
  const bone = material(builder, "#e3dcc5");
  const rust = material(builder, "#9a5b33", 0.4);
  const grip = material(builder, "#4a3f36");
  const soul = material(builder, "#9fe0d0", 0.1);
  soul.emissive = new Color("#2a8a78");
  const team = material(builder, "#ffffff");

  for (const direction of [-1, 1]) {
    limb(builder, bone, point(direction * 0.4, 2.05, 0), point(direction * 0.55, 0.3, 0.05), 0.14);
    part(builder, new BoxGeometry(0.34, 0.2, 0.7), bone, direction * 0.55, 0.1, 0.2);
    part(builder, new SphereGeometry(0.11, 5, 4), soul, direction * 0.19, 4.5, 0.52);
  }

  part(builder, new BoxGeometry(1, 0.4, 0.5), bone, 0, 2.15, 0);
  limb(builder, bone, point(0, 2.2, 0), point(0, 3.9, 0), 0.12);
  limb(builder, bone, point(-0.72, 3.95, 0), point(0.72, 3.95, 0), 0.11);

  for (let rib = 0; rib < 3; rib += 1) {
    const hoop = new TorusGeometry(0.55 - Math.abs(rib - 1) * 0.07, 0.09, 4, 10);
    const ring = part(builder, hoop, bone, 0, 2.95 + rib * 0.35, 0.05);
    ring.rotation.x = Math.PI / 2;
  }

  const skull = part(builder, new SphereGeometry(0.55, 7, 6), bone, 0, 4.45, 0.05);
  skull.scale.set(0.95, 1, 1);
  part(builder, new BoxGeometry(0.46, 0.22, 0.4), bone, 0, 4.02, 0.22);

  limb(builder, bone, point(0.75, 3.9, 0), point(0.95, 2.75, 0.55), 0.1);
  const blade = part(builder, new BoxGeometry(0.2, 1.7, 0.07), rust, 0.95, 3.41, 1.23);
  blade.rotation.x = 0.8;
  const guard = part(builder, new BoxGeometry(0.6, 0.1, 0.14), grip, 0.95, 2.82, 0.62);
  guard.rotation.x = 0.8;

  limb(builder, bone, point(-0.75, 3.9, 0), point(-0.95, 2.95, 0.5), 0.1);
  const shield = part(builder, new CylinderGeometry(0.8, 0.8, 0.14, 10), team, -1.05, 2.95, 0.85);
  shield.rotation.x = Math.PI / 2;
  part(builder, new TorusGeometry(0.8, 0.09, 4, 12), rust, -1.05, 2.95, 0.85);
  part(builder, new SphereGeometry(0.2, 6, 4), rust, -1.05, 2.95, 0.95);

  return { body: builder.body, accentMaterials: [soul], teamMaterials: [team], height: 5 };
}

function buildBoneGolem(builder: PartBuilder): FigureParts {
  const bone = material(builder, "#ddd4bb");
  const marrow = material(builder, "#b3a68a");
  const soul = material(builder, "#9fe0d0", 0.1);
  soul.emissive = new Color("#2a8a78");
  const team = material(builder, "#ffffff");

  for (const direction of [-1, 1]) {
    limb(builder, marrow, point(direction * 1.4, 0.9, 0.1), point(direction * 1.35, 3.6, 0), 0.85);
    const foot = part(builder, new SphereGeometry(1, 7, 5), bone, direction * 1.45, 0.45, 0.5);
    foot.scale.set(1, 0.5, 1.3);
    part(builder, new SphereGeometry(1.3, 7, 5), bone, direction * 2.85, 9.4, 0.1);
    limb(builder, marrow, point(direction * 3.05, 9, 0.2), point(direction * 3.3, 5.2, 1), 0.85);
    part(builder, new IcosahedronGeometry(1.15, 1), bone, direction * 3.3, 4.2, 1.3);
    part(builder, new SphereGeometry(0.15, 5, 4), soul, direction * 0.3, 11.75, 2.38);
  }

  const pelvis = part(builder, new SphereGeometry(1.9, 8, 6), marrow, 0, 4.3, 0);
  pelvis.scale.set(1.25, 0.7, 1.05);
  const chest = part(builder, new SphereGeometry(2.6, 9, 7), bone, 0, 7.6, 0.1);
  chest.scale.set(1.12, 1.15, 0.92);
  const hump = part(builder, new SphereGeometry(1.9, 8, 6), bone, 0, 10.6, -0.5);
  hump.scale.set(1.4, 0.9, 1.05);
  const binding = part(builder, new TorusGeometry(2, 0.42, 6, 14), team, 0, 5.3, 0.05);
  binding.rotation.x = Math.PI / 2;
  binding.scale.set(1.1, 0.95, 1);

  for (let rib = 0; rib < 3; rib += 1) {
    const arc = part(builder, new TorusGeometry(2.6, 0.2, 4, 10, Math.PI), marrow, 0, 6.8 + rib * 0.8, 0.1);
    arc.rotation.x = Math.PI / 2;
    arc.scale.set(1.1, 0.93, 1);
  }

  part(builder, new IcosahedronGeometry(0.75, 0), soul, 0, 8.2, 2.3);
  part(builder, new IcosahedronGeometry(1, 0), marrow, 1.8, 6.1, 1.55);
  part(builder, new IcosahedronGeometry(0.9, 0), marrow, -1.7, 5.8, 1.5);
  part(builder, new IcosahedronGeometry(0.8, 0), marrow, -1.9, 10.9, 0.8);

  const skull = part(builder, new SphereGeometry(0.9, 7, 6), bone, 0, 11.7, 1.55);
  skull.scale.set(1, 0.95, 1.05);
  part(builder, new BoxGeometry(0.8, 0.35, 0.6), bone, 0, 11, 1.9);
  spike(builder, bone, point(0, 12.1, -0.1), point(0, 13.2, -0.45), 0.32);
  spike(builder, bone, point(0, 12, -1), point(0, 13, -1.6), 0.32);
  spike(builder, bone, point(0, 11.6, -1.75), point(0, 12.35, -2.6), 0.3);

  return { body: builder.body, accentMaterials: [soul], teamMaterials: [team], height: 13.2 };
}

function buildTurret(builder: PartBuilder): FigureParts {
  const brass = material(builder, "#c99a55", 0.6);
  const iron = material(builder, "#3f444c", 0.55);
  const flare = material(builder, "#e0a458", 0.3);
  flare.emissive = new Color("#b0601a");
  const team = material(builder, "#ffffff");

  for (let leg = 0; leg < 3; leg += 1) {
    const angle = Math.PI + (leg * Math.PI * 2) / 3;
    const foot = point(Math.sin(angle) * 2.4, 0.15, Math.cos(angle) * 2.4);
    limb(builder, iron, point(Math.sin(angle) * 0.6, 2.1, Math.cos(angle) * 0.6), foot, 0.18);
    part(builder, new CylinderGeometry(0.34, 0.42, 0.22, 6), brass, foot.x, 0.11, foot.z);
  }

  const hull = part(builder, new SphereGeometry(1.3, 10, 8), brass, 0, 2.6, 0);
  hull.scale.set(1, 0.82, 1);
  const band = part(builder, new TorusGeometry(1.3, 0.2, 5, 16), team, 0, 2.6, 0);
  band.rotation.x = Math.PI / 2;
  part(builder, new CylinderGeometry(0.55, 0.75, 0.4, 8), team, 0, 3.55, 0);
  part(builder, new BoxGeometry(0.28, 0.5, 0.28), iron, 0.35, 3.95, -0.35);

  const rotor = new Group();
  rotor.position.set(0, 2.65, 1.2);
  builder.body.add(rotor);
  const barrels: PartBuilder = { materials: builder.materials, geometries: builder.geometries, body: rotor };
  const housing = part(barrels, new CylinderGeometry(0.5, 0.55, 0.9, 8), iron, 0, 0, 0.45);
  housing.rotation.x = Math.PI / 2;

  for (let barrel = 0; barrel < 4; barrel += 1) {
    const angle = (Math.PI * (barrel * 2 + 1)) / 4;
    const tube = part(barrels, new CylinderGeometry(0.14, 0.14, 1.3, 6), iron, Math.cos(angle) * 0.28, Math.sin(angle) * 0.28, 1.05);
    tube.rotation.x = Math.PI / 2;
  }

  part(barrels, new TorusGeometry(0.42, 0.1, 5, 12), flare, 0, 0, 1.65);

  return {
    body: builder.body,
    accentMaterials: [flare],
    teamMaterials: [team],
    height: 4.2,
    rooted: true,
    rotor,
  };
}

function figureBuilder(heroId: string): (builder: PartBuilder) => FigureParts {
  switch (heroId) {
    case bulwark.id:
      return buildBulwark;

    case frostweaver.id:
      return buildFrostweaver;

    case duskblade.id:
      return buildDuskblade;

    case pyromancer.id:
      return buildPyromancer;

    case "oathkeeper":
      return buildOathkeeper;

    case "ravager":
      return buildRavager;

    case hexbinder.id:
      return buildHexbinder;

    case "blightmother":
      return buildBlightmother;

    case "bonecaller":
      return buildBonecaller;

    case "clockwright":
      return buildClockwright;

    case "thrall":
      return buildThrall;

    case "bone-golem":
      return buildBoneGolem;

    case "turret":
      return buildTurret;

    default:
      throw new Error(`no figure for hero "${heroId}"`);
  }
}

function buildFigureParts(heroId: string, builder: PartBuilder): FigureParts {
  return figureBuilder(heroId)(builder);
}

function easeOut(progress: number): number {
  return 1 - (1 - progress) * (1 - progress);
}

const traitsByHero = new Map<string, FigureTraits>();

export function placeholderTraits(heroId: string): FigureTraits {
  const known = traitsByHero.get(heroId);

  if (known !== undefined) {
    return known;
  }

  const builder: PartBuilder = { materials: [], geometries: [], body: new Group() };
  const parts = buildFigureParts(heroId, builder);

  for (const geometry of builder.geometries) {
    geometry.dispose();
  }

  for (const surface of builder.materials) {
    surface.dispose();
  }

  const traits = { height: parts.height, rooted: parts.rooted === true };
  traitsByHero.set(heroId, traits);

  return traits;
}

const LEVEL_SCALE_STEP = 0.06;

export function levelFigureScale(level: number): number {
  return 1 + (Math.max(1, Math.min(MAX_HERO_LEVEL, level)) - 1) * LEVEL_SCALE_STEP;
}

export function createHeroFigure(heroId: string): HeroFigure {
  if (heroId === hexbinder.id) {
    return createMoiraFigure(placeholderTraits(heroId));
  }

  const model = models.get(heroId);

  if (model !== null) {
    return createModelFigure(model, placeholderTraits(heroId));
  }

  const placeholder = createPlaceholderFigure(heroId);

  return isModelId(heroId) && models.state(heroId) !== "failed" ? upgradeWhenLoaded(heroId, placeholder) : placeholder;
}

function upgradeWhenLoaded(heroId: ModelId, placeholder: HeroFigure): HeroFigure {
  const root = new Group();
  root.add(placeholder.root);
  let current = placeholder;
  let arrived: LoadedModel | null = null;
  let teamColor: ColorRepresentation | null = null;
  let moving = false;
  let channeling = false;
  let celebrating = false;
  let castsShadow = true;
  let dead = false;
  let linger = false;
  let spectral = false;
  let overclock = 0;
  let glow = 0;
  let charge = 0;
  let disposed = false;

  function upgrade(): void {
    if (arrived === null || dead || disposed || current !== placeholder) {
      return;
    }

    const next = createModelFigure(arrived, placeholderTraits(heroId));

    if (teamColor !== null) {
      next.setTeamColor(teamColor);
    }

    next.setMoving(moving);
    next.setChanneling(channeling);
    next.setCelebrating(celebrating);
    next.setCastsShadow(castsShadow);
    next.setLinger(linger);
    next.setSpectral(spectral);
    next.setOverclock(overclock);
    next.setGlow(glow);
    next.setCharge(charge);
    placeholder.dispose();
    root.add(next.root);
    current = next;
  }

  models
    .load(heroId)
    .then((model) => {
      arrived = model;
      upgrade();
    })
    .catch(() => {});

  return {
    root,

    get height() {
      return current.height;
    },

    setTeamColor(color) {
      teamColor = color;
      current.setTeamColor(color);
    },

    setMoving(isMoving) {
      moving = isMoving;
      current.setMoving(isMoving);
    },

    trigger(action) {
      current.trigger(action);
    },

    setDead(isDead) {
      dead = isDead;
      current.setDead(isDead);
      upgrade();
    },

    setLinger(isLingering) {
      linger = isLingering;
      current.setLinger(isLingering);
    },

    setSpectral(isSpectral) {
      spectral = isSpectral;
      current.setSpectral(isSpectral);
    },

    setOverclock(level) {
      overclock = level;
      current.setOverclock(level);
    },

    setGlow(amount) {
      glow = amount;
      current.setGlow(amount);
    },

    setCharge(amount) {
      charge = amount;
      current.setCharge(amount);
    },

    setChanneling(isChanneling) {
      channeling = isChanneling;
      current.setChanneling(isChanneling);
    },

    setCelebrating(isCelebrating) {
      celebrating = isCelebrating;
      current.setCelebrating(isCelebrating);
    },

    setCastsShadow(isCasting) {
      castsShadow = isCasting;
      current.setCastsShadow(isCasting);
    },

    castOrigin(out) {
      return current.castOrigin(out);
    },

    update(deltaSeconds) {
      current.update(deltaSeconds);
    },

    dispose() {
      disposed = true;
      current.dispose();
      root.removeFromParent();
    },
  };
}

export function createPlaceholderFigure(heroId: string): HeroFigure {
  const root = new Group();
  const builder: PartBuilder = { materials: [], geometries: [], body: new Group() };
  const parts = buildFigureParts(heroId, builder);
  const rooted = parts.rooted === true;
  const base = createFigureBase();

  const model = new Group();
  model.scale.setScalar(FIGURE_SCALE);
  model.add(base.root, parts.body);
  root.add(model);

  const socket = new Object3D();
  socket.position.y = parts.height * CHEST_FRACTION;
  parts.body.add(socket);

  const flashMaterials = builder.materials;
  let teamColor = new Color("#ffffff");
  let moving = false;
  let dead = false;
  let linger = false;
  let spectral = false;
  const spectralMemory: SpectralMemory = { colors: new Map() };
  let clock = Math.random() * 10;
  let attackTime = Number.POSITIVE_INFINITY;
  let castTime = Number.POSITIVE_INFINITY;
  let hitTime = Number.POSITIVE_INFINITY;
  let deathTime = Number.POSITIVE_INFINITY;
  let sinkTime = 0;
  let bodyGlow = 0;
  let overclock = 0;

  function applyTeamColor(): void {
    const color = dead ? DEAD_COLOR : teamColor;
    base.paint(color, dead);

    for (const teamMaterial of parts.teamMaterials) {
      teamMaterial.color.copy(color);
    }
  }

  return {
    root,
    height: parts.height * FIGURE_SCALE,

    setTeamColor(color) {
      teamColor = new Color(color);
      applyTeamColor();
    },

    setMoving(isMoving) {
      moving = isMoving;
    },

    trigger(action) {
      if (dead) {
        return;
      }

      if (action === "attack") {
        attackTime = 0;
      } else if (action === "cast") {
        castTime = 0;
      } else {
        hitTime = 0;
      }
    },

    setDead(isDead) {
      if (isDead === dead) {
        return;
      }

      dead = isDead;
      deathTime = isDead ? 0 : Number.POSITIVE_INFINITY;
      sinkTime = 0;
      applyTeamColor();

      if (!isDead) {
        parts.body.rotation.set(0, 0, 0);
        parts.body.position.set(0, 0, 0);
        base.root.scale.setScalar(1);
        root.visible = true;
      }
    },

    setLinger(isLingering) {
      linger = isLingering;
    },

    setSpectral(isSpectral) {
      if (isSpectral === spectral) {
        return;
      }

      spectral = isSpectral;
      paintSpectral(flashMaterials, spectralMemory, isSpectral);
      applyTeamColor();
    },

    setOverclock(level) {
      overclock = Math.min(1, Math.max(0, level));
    },

    setGlow(amount) {
      bodyGlow = Math.max(0, amount);
    },

    setCharge() {},

    setChanneling() {},

    setCelebrating() {},

    setCastsShadow(castsShadow) {
      parts.body.traverse((node) => {
        node.castShadow = castsShadow;
      });
    },

    castOrigin(out) {
      return socket.getWorldPosition(out);
    },

    update(deltaSeconds) {
      clock += deltaSeconds;
      attackTime += deltaSeconds;
      castTime += deltaSeconds;
      hitTime += deltaSeconds;
      deathTime += deltaSeconds;

      const flinch = !dead && hitTime < HIT_SECONDS ? Math.sin((Math.PI * hitTime) / HIT_SECONDS) : 0;

      for (const flashMaterial of flashMaterials) {
        if (!parts.accentMaterials.includes(flashMaterial)) {
          flashMaterial.emissive.setScalar(Math.max(flinch * 0.55, bodyGlow));
        }
      }

      if (dead) {
        const fall = easeOut(Math.min(1, deathTime / DEATH_SECONDS));
        sinkTime += !linger && deathTime > DEATH_SECONDS ? deltaSeconds : 0;
        const sink = Math.min(1, sinkTime / SINK_SECONDS);
        parts.body.rotation.set(-fall * (Math.PI / 2) * 0.92, 0, 0);
        parts.body.position.set(0, -fall * 0.6 - sink * SINK_UNITS, -fall * 1.5);
        base.root.scale.setScalar(Math.max(0.001, 1 - sink));
        root.visible = sink < 1;

        return;
      }

      const stride = moving ? Math.abs(Math.sin(clock * 11)) * 0.55 : Math.sin(clock * 2.2) * 0.08;
      const float = Math.sin(clock * 1.9) * 0.35;
      const bob = rooted ? 0 : parts.hover === true ? float : stride;
      const attacking = attackTime < ATTACK_SECONDS;
      const casting = castTime < CAST_SECONDS;
      const lunge = attacking && !rooted ? Math.sin((Math.PI * attackTime) / ATTACK_SECONDS) * LUNGE_UNITS : 0;
      const lift = casting && !rooted ? Math.sin((Math.PI * castTime) / CAST_SECONDS) * 0.9 : 0;
      const lean = moving && !rooted ? 0.12 : 0;

      parts.body.position.set(0, bob + lift, lunge - flinch * 0.6);
      parts.body.rotation.set(lean + lunge * 0.06 - flinch * 0.12, 0, 0);

      if (parts.rotor !== undefined) {
        const idle = ROTOR_IDLE_SPEED + (ROTOR_FIRING_SPEED - ROTOR_IDLE_SPEED) * overclock;
        parts.rotor.rotation.z += deltaSeconds * (attacking || casting ? ROTOR_FIRING_SPEED * (1 + overclock) : idle);
      }

      const glow = castTime < CAST_SECONDS ? 1 + Math.sin((Math.PI * castTime) / CAST_SECONDS) * 3 : 1;

      for (const accent of parts.accentMaterials) {
        accent.emissiveIntensity = glow * (1 + OVERCLOCK_GLOW * overclock);
      }
    },

    dispose() {
      for (const geometry of builder.geometries) {
        geometry.dispose();
      }

      for (const surface of builder.materials) {
        surface.dispose();
      }

      base.dispose();
      root.removeFromParent();
    },
  };
}
