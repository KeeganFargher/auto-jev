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
  SphereGeometry,
  TorusGeometry,
  Vector3,
  type BufferGeometry,
  type ColorRepresentation,
} from "three";
import { bulwark, duskblade, frostweaver, pyromancer } from "@jev-game/content";
import { isModelId, type ModelId } from "../../models/catalogue.js";
import { models, type LoadedModel } from "../../models/library.js";
import {
  ATTACK_SECONDS,
  BASE_HEIGHT,
  CAST_SECONDS,
  DEAD_COLOR,
  DEATH_SECONDS,
  FIGURE_SCALE,
  HIT_SECONDS,
  LUNGE_UNITS,
  SINK_SECONDS,
  SINK_UNITS,
  createFigureBase,
} from "./figure-base.js";
import { createModelFigure } from "./model-figure.js";

export type FigureAction = "attack" | "cast" | "hit";

export interface HeroFigure {
  readonly root: Group;
  readonly height: number;
  setTeamColor(color: ColorRepresentation): void;
  setMoving(moving: boolean): void;
  trigger(action: FigureAction): void;
  setDead(dead: boolean): void;
  setGlow(amount: number): void;
  setChanneling(channeling: boolean): void;
  setCelebrating(celebrating: boolean): void;
  setCastsShadow(castsShadow: boolean): void;
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

const AXE_ARC = Math.PI * 0.55;

const UP = new Vector3(0, 1, 0);

interface FigureParts {
  body: Group;
  accentMaterials: MeshStandardMaterial[];
  teamMaterials: MeshStandardMaterial[];
  height: number;
  rooted?: boolean;
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
  return new Vector3(x, BASE_HEIGHT + y, z);
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

  const torso = part(builder, new CapsuleGeometry(2.3, 1.9, 3, 8), plate, 0, BASE_HEIGHT + 3, 0);
  torso.scale.set(1.25, 1, 1.05);
  part(builder, new SphereGeometry(1.35, 8, 6), steel, 0, BASE_HEIGHT + 6.9, 0);
  part(builder, new BoxGeometry(2.1, 0.5, 0.4), bronze, 0, BASE_HEIGHT + 6.8, 1.15);

  for (const direction of [-1, 1]) {
    const pauldron = part(builder, new SphereGeometry(1.35, 7, 5), bronze, direction * 2.5, BASE_HEIGHT + 5.2, 0);
    pauldron.scale.set(1.05, 0.7, 1.1);
  }

  part(builder, new BoxGeometry(3.9, 5.6, 0.6), bronze, -0.4, BASE_HEIGHT + 3.4, 2.5);
  part(builder, new BoxGeometry(1.2, 3.2, 0.7), steel, -0.4, BASE_HEIGHT + 3.6, 2.7);

  const belt = part(builder, new CylinderGeometry(2.4, 2.4, 0.7, 10), team, 0, BASE_HEIGHT + 2.3, 0);
  belt.scale.set(1.2, 1, 1.05);

  return { body: builder.body, accentMaterials: [bronze], teamMaterials: [team], height: BASE_HEIGHT + 8.4 };
}

function buildFrostweaver(builder: PartBuilder): FigureParts {
  const robe = material(builder, "#cfe9f5");
  const deep = material(builder, "#4f7fa3");
  const ice = material(builder, "#9fe8ff", 0.1);
  ice.emissive = new Color("#3fa7c9");
  const skin = material(builder, SKIN);
  const team = material(builder, "#ffffff");

  part(builder, new CylinderGeometry(1.1, 2.3, 5.6, 10), robe, 0, BASE_HEIGHT + 2.8, 0);
  part(builder, new SphereGeometry(1.4, 8, 6), deep, 0, BASE_HEIGHT + 5.8, 0);
  part(builder, new SphereGeometry(1.05, 8, 6), skin, 0, BASE_HEIGHT + 7.1, 0.15);
  part(builder, new ConeGeometry(1.25, 1.6, 8), deep, 0, BASE_HEIGHT + 8.2, -0.1);
  part(builder, new CylinderGeometry(0.16, 0.16, 7.6, 6), deep, 2.2, BASE_HEIGHT + 3.8, 0.4);
  part(builder, new IcosahedronGeometry(0.9, 0), ice, 2.2, BASE_HEIGHT + 8.4, 0.4);

  const sash = part(builder, new TorusGeometry(1.5, 0.3, 6, 10), team, 0, BASE_HEIGHT + 4.2, 0);
  sash.rotation.x = Math.PI / 2;

  return { body: builder.body, accentMaterials: [ice], teamMaterials: [team], height: BASE_HEIGHT + 9.2 };
}

function buildDuskblade(builder: PartBuilder): FigureParts {
  const cloak = material(builder, "#3a2a5c");
  const violet = material(builder, "#b58cff", 0.15);
  violet.emissive = new Color("#5b33a8");
  const steel = material(builder, STEEL, 0.55);
  const team = material(builder, "#ffffff");

  part(builder, new CapsuleGeometry(1.35, 3, 3, 8), cloak, 0, BASE_HEIGHT + 3.1, 0);
  part(builder, new ConeGeometry(1.45, 2.8, 8), cloak, 0, BASE_HEIGHT + 7.3, 0);
  part(builder, new SphereGeometry(0.55, 6, 5), violet, 0, BASE_HEIGHT + 6.9, 0.9);

  for (const direction of [-1, 1]) {
    const blade = part(builder, new ConeGeometry(0.28, 3.2, 5), steel, direction * 1.9, BASE_HEIGHT + 3.4, 1.4);
    blade.rotation.x = Math.PI / 2.4;
    part(builder, new BoxGeometry(0.9, 0.25, 0.25), violet, direction * 1.9, BASE_HEIGHT + 2.9, 0.3);
  }

  const wrap = part(builder, new TorusGeometry(1.3, 0.3, 6, 10), team, 0, BASE_HEIGHT + 2.4, 0);
  wrap.rotation.x = Math.PI / 2;

  return { body: builder.body, accentMaterials: [violet], teamMaterials: [team], height: BASE_HEIGHT + 8.7 };
}

function buildPyromancer(builder: PartBuilder): FigureParts {
  const robe = material(builder, "#7a2a1f");
  const ember = material(builder, "#ff8a4c", 0.1);
  ember.emissive = new Color("#c2410c");
  const gold = material(builder, "#e2bd5c", 0.3);
  const skin = material(builder, SKIN);
  const team = material(builder, "#ffffff");

  part(builder, new CylinderGeometry(1.2, 2.4, 5.4, 10), robe, 0, BASE_HEIGHT + 2.7, 0);
  part(builder, new SphereGeometry(1.45, 8, 6), robe, 0, BASE_HEIGHT + 5.7, 0);
  part(builder, new SphereGeometry(1.08, 8, 6), skin, 0, BASE_HEIGHT + 7, 0.15);
  const hat = part(builder, new ConeGeometry(1.5, 3.4, 8), robe, 0, BASE_HEIGHT + 9, -0.2);
  hat.rotation.x = -0.15;
  part(builder, new TorusGeometry(1.35, 0.22, 5, 10), gold, 0, BASE_HEIGHT + 7.6, -0.1).rotation.x = Math.PI / 2;
  part(builder, new IcosahedronGeometry(0.95, 1), ember, 2.1, BASE_HEIGHT + 4.6, 1.2);

  const sash = part(builder, new TorusGeometry(1.45, 0.3, 6, 10), team, 0, BASE_HEIGHT + 3.6, 0);
  sash.rotation.x = Math.PI / 2;

  return { body: builder.body, accentMaterials: [ember], teamMaterials: [team], height: BASE_HEIGHT + 10.4 };
}

function buildOathkeeper(builder: PartBuilder): FigureParts {
  const plate = material(builder, "#e6eaf0", 0.4);
  const trim = material(builder, "#d4a94f", 0.45);
  const radiance = material(builder, "#f2d27a", 0.3);
  radiance.emissive = new Color("#a8741c");
  const haft = material(builder, "#5e4128");
  const skin = material(builder, SKIN);
  const team = material(builder, "#ffffff");

  part(builder, new CylinderGeometry(1.5, 2.1, 3.2, 8), plate, 0, BASE_HEIGHT + 1.6, 0);
  const torso = part(builder, new CapsuleGeometry(1.55, 1.3, 3, 8), plate, 0, BASE_HEIGHT + 4.4, 0);
  torso.scale.set(1.15, 1, 0.95);
  part(builder, new CylinderGeometry(1.64, 1.64, 0.45, 10), trim, 0, BASE_HEIGHT + 3.2, 0);

  for (const direction of [-1, 1]) {
    const pauldron = part(builder, new SphereGeometry(1.15, 7, 5), plate, direction * 1.9, BASE_HEIGHT + 5.9, 0);
    pauldron.scale.set(1.1, 0.72, 1.1);
    const rim = part(builder, new TorusGeometry(1.12, 0.15, 4, 10), trim, direction * 1.9, BASE_HEIGHT + 5.45, 0);
    rim.rotation.x = Math.PI / 2;
    const tabard = part(builder, new BoxGeometry(1.3, 2.55, 0.2), team, 0, BASE_HEIGHT + 1.85, direction * 1.85);
    tabard.rotation.x = -direction * 0.2;
  }

  part(builder, new SphereGeometry(0.92, 8, 6), skin, 0, BASE_HEIGHT + 7.3, 0.2);
  part(builder, new SphereGeometry(1.02, 8, 6), plate, 0, BASE_HEIGHT + 7.45, -0.18);
  const circlet = part(builder, new TorusGeometry(0.98, 0.12, 4, 12), trim, 0, BASE_HEIGHT + 7.75, 0.02);
  circlet.rotation.x = Math.PI / 2;
  part(builder, new TorusGeometry(1.35, 0.15, 6, 20), radiance, 0, BASE_HEIGHT + 7.6, -1.3);

  for (let ray = 0; ray <= 6; ray += 1) {
    const angle = (Math.PI * ray) / 6;
    const inner = point(Math.cos(angle) * 1.5, 7.6 + Math.sin(angle) * 1.5, -1.3);
    spike(builder, radiance, inner, point(Math.cos(angle) * 2.1, 7.6 + Math.sin(angle) * 2.1, -1.3), 0.2);
  }

  limb(builder, plate, point(1.9, 5.5, 0.3), point(2.38, 4.2, 1.2), 0.36);
  part(builder, new SphereGeometry(0.45, 6, 5), plate, 2.38, BASE_HEIGHT + 4.2, 1.2);
  const shaft = part(builder, new CylinderGeometry(0.17, 0.17, 7.6, 6), haft, 2.35, BASE_HEIGHT + 4, 1.2);
  shaft.rotation.z = -0.15;
  const head = part(builder, new BoxGeometry(2, 1.2, 1.2), radiance, 2.92, BASE_HEIGHT + 7.76, 1.2);
  head.rotation.z = -0.15;

  return { body: builder.body, accentMaterials: [radiance], teamMaterials: [team], height: BASE_HEIGHT + 9.7 };
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

  part(builder, new CylinderGeometry(1.6, 1.95, 2.4, 8), leather, 0, BASE_HEIGHT + 1.2, 0);
  const torso = part(builder, new CapsuleGeometry(2.05, 1, 3, 8), hide, 0, BASE_HEIGHT + 4.3, 0.15);
  torso.scale.set(1.3, 0.95, 1.05);
  torso.rotation.x = 0.28;
  const wrap = part(builder, new TorusGeometry(1.75, 0.36, 6, 12), team, 0, BASE_HEIGHT + 2.45, 0);
  wrap.rotation.x = Math.PI / 2;
  wrap.scale.set(1.12, 1, 1);
  const hump = part(builder, new IcosahedronGeometry(1.5, 1), fur, 0, BASE_HEIGHT + 6.1, -0.75);
  hump.scale.set(1.3, 0.75, 1);

  part(builder, new SphereGeometry(1, 8, 6), hide, 0, BASE_HEIGHT + 6.9, 1.55);
  const helm = part(builder, new SphereGeometry(1.08, 8, 6), iron, 0, BASE_HEIGHT + 7.25, 1.4);
  helm.scale.set(1.05, 0.75, 1.05);

  for (const direction of [-1, 1]) {
    const pelt = part(builder, new IcosahedronGeometry(1.2, 1), fur, direction * 1.75, BASE_HEIGHT + 6, 0.1);
    pelt.scale.set(1.15, 0.8, 1.15);
    part(builder, new SphereGeometry(0.14, 5, 4), blood, direction * 0.35, BASE_HEIGHT + 7, 2.42);
    spike(builder, ivory, point(direction * 0.7, 6.8, 1.6), point(direction * 1.7, 8.9, 2.3), 0.36);
    limb(builder, hide, point(direction * 2.3, 5.8, 0.5), point(direction * 2.9, 4.4, 1.6), 0.6);
    limb(builder, haft, point(direction * 2.95, 3.4, 1.75), point(direction * 3.15, 7, 2.15), 0.14);

    const edge = new CylinderGeometry(1.1, 1.1, 0.2, 6, 1, false, direction * (Math.PI / 2) - AXE_ARC / 2, AXE_ARC);
    const blade = part(builder, edge, blood, direction * 3.1, BASE_HEIGHT + 6.2, 2.06);
    blade.rotation.x = Math.PI / 2;
  }

  return { body: builder.body, accentMaterials: [blood], teamMaterials: [team], height: BASE_HEIGHT + 8.9 };
}

function buildHexbinder(builder: PartBuilder): FigureParts {
  const robe = material(builder, "#6e3565");
  const shade = material(builder, "#2e1631");
  const hex = material(builder, "#c86bff", 0.15);
  hex.emissive = new Color("#7a22b5");
  const skin = material(builder, SKIN);
  const team = material(builder, "#ffffff");

  part(builder, new CylinderGeometry(1, 2.2, 6.2, 10), robe, 0, BASE_HEIGHT + 3.1, 0);
  part(builder, new SphereGeometry(1.3, 8, 6), shade, 0, BASE_HEIGHT + 6, 0);
  part(builder, new SphereGeometry(0.9, 8, 6), skin, 0, BASE_HEIGHT + 7.3, 0.22);
  const sash = part(builder, new TorusGeometry(1.52, 0.28, 6, 12), team, 0, BASE_HEIGHT + 3.7, 0);
  sash.rotation.x = Math.PI / 2;
  const amulet = part(builder, new ConeGeometry(0.42, 0.75, 3), hex, 0, BASE_HEIGHT + 5.6, 1.3);
  amulet.rotation.y = Math.PI;

  part(builder, new CylinderGeometry(2, 2, 0.14, 14), shade, 0, BASE_HEIGHT + 8.05, -0.05);
  part(builder, new CylinderGeometry(0.32, 1.1, 2.2, 8), shade, 0, BASE_HEIGHT + 9.15, -0.05);
  const band = part(builder, new TorusGeometry(1.02, 0.2, 5, 12), team, 0, BASE_HEIGHT + 8.35, -0.05);
  band.rotation.x = Math.PI / 2;
  part(builder, new SphereGeometry(0.34, 6, 5), shade, 0, BASE_HEIGHT + 10.25, -0.05);
  spike(builder, shade, point(0, 10.25, -0.05), point(0, 11.07, -1.19), 0.34);

  for (const direction of [-1, 1]) {
    strut(builder, robe, point(direction * 1.1, 6.2, 0.2), point(direction * 2.25, 5.1, 1.45), 0.4, 0.88);

    const hand = point(direction * 2.7, 4.7, 1.95);
    part(builder, new SphereGeometry(0.28, 6, 5), hex, hand.x, hand.y, hand.z);
    const loop = part(builder, new TorusGeometry(0.62, 0.07, 4, 16), hex, hand.x, hand.y, hand.z);
    loop.rotation.x = Math.PI / 2;
    const orbit = part(builder, new TorusGeometry(0.85, 0.07, 4, 18), hex, hand.x, hand.y, hand.z);
    orbit.rotation.set(-Math.PI / 2, direction * 0.75, 0);
    limb(builder, hex, hand, point(0, 4.3, 2.2), 0.07);
  }

  return { body: builder.body, accentMaterials: [hex], teamMaterials: [team], height: BASE_HEIGHT + 11 };
}

function buildBlightmother(builder: PartBuilder): FigureParts {
  const skirt = material(builder, "#5b6242");
  const shawl = material(builder, "#3a3426");
  const foliage = material(builder, "#5e8a35");
  const iron = material(builder, "#44474d", 0.5);
  const skin = material(builder, "#cdc398");
  const blight = material(builder, "#8fd14f", 0.1);
  blight.emissive = new Color("#3f7d14");
  const team = material(builder, "#ffffff");

  part(builder, new CylinderGeometry(1.25, 2.7, 3.8, 10), skirt, 0, BASE_HEIGHT + 1.9, 0);
  const sash = part(builder, new TorusGeometry(1.35, 0.28, 6, 12), team, 0, BASE_HEIGHT + 3.7, 0);
  sash.rotation.x = Math.PI / 2;
  const torso = part(builder, new CapsuleGeometry(1.25, 1.2, 3, 8), shawl, 0, BASE_HEIGHT + 5, 0.3);
  torso.scale.set(1.15, 1, 1);
  torso.rotation.x = 0.5;

  for (const angle of [0.9, 1.7, 2.5, Math.PI, -2.5, -1.7, -0.9]) {
    const leaf = part(
      builder,
      new SphereGeometry(0.7, 6, 4),
      foliage,
      Math.sin(angle) * 1.25,
      BASE_HEIGHT + 5.95,
      0.78 + Math.cos(angle) * 1.25,
    );

    leaf.scale.set(0.85, 0.35, 1.6);
    leaf.rotation.set(0.35, angle, 0, "YXZ");
  }

  part(builder, new SphereGeometry(0.85, 8, 6), skin, 0, BASE_HEIGHT + 7.1, 1.65);
  const kerchief = part(builder, new SphereGeometry(0.95, 8, 6), team, 0, BASE_HEIGHT + 7.35, 1.4);
  kerchief.scale.set(1.05, 0.9, 1.05);
  spike(builder, skin, point(0, 7.12, 2.24), point(0, 6.78, 2.86), 0.18);

  for (const direction of [-1, 1]) {
    part(builder, new SphereGeometry(0.11, 5, 4), blight, direction * 0.3, BASE_HEIGHT + 7.15, 2.4);
  }

  limb(builder, shawl, point(1.15, 5.75, 0.95), point(1.95, 5.3, 2.15), 0.3);
  part(builder, new SphereGeometry(0.3, 6, 5), skin, 2, BASE_HEIGHT + 5.25, 2.25);
  limb(builder, iron, point(2, 5, 2.25), point(2, 3.5, 2.25), 0.08);
  part(builder, new ConeGeometry(0.62, 0.55, 8), iron, 2, BASE_HEIGHT + 3.2, 2.25);
  part(builder, new SphereGeometry(0.75, 8, 6), iron, 2, BASE_HEIGHT + 2.45, 2.25);
  const vent = part(builder, new TorusGeometry(0.72, 0.13, 5, 12), blight, 2, BASE_HEIGHT + 2.65, 2.25);
  vent.rotation.x = Math.PI / 2;
  part(builder, new SphereGeometry(0.34, 7, 5), blight, 2.55, BASE_HEIGHT + 3.75, 2.4);
  part(builder, new SphereGeometry(0.26, 7, 5), blight, 2.95, BASE_HEIGHT + 4.5, 2.3);
  part(builder, new SphereGeometry(0.18, 6, 4), blight, 2.8, BASE_HEIGHT + 5.25, 2.15);

  return { body: builder.body, accentMaterials: [blight], teamMaterials: [team], height: BASE_HEIGHT + 8.3 };
}

function buildBonecaller(builder: PartBuilder): FigureParts {
  const coat = material(builder, "#3a434c");
  const felt = material(builder, "#25292f");
  const leather = material(builder, "#3d2b1f");
  const bone = material(builder, "#e6dfca");
  const iron = material(builder, "#5d636b", 0.5);
  const wood = material(builder, "#6a4d33");
  const skin = material(builder, "#d8cdbd");
  const soul = material(builder, "#9fe0d0", 0.1);
  soul.emissive = new Color("#2a8a78");
  const team = material(builder, "#ffffff");

  part(builder, new CylinderGeometry(1.25, 2.1, 5.2, 8), coat, 0, BASE_HEIGHT + 2.6, 0);
  const shoulders = part(builder, new SphereGeometry(1.4, 8, 6), coat, 0, BASE_HEIGHT + 5.4, 0);
  shoulders.scale.set(1.15, 0.8, 1);
  part(builder, new CylinderGeometry(1.5, 1.5, 0.35, 8), leather, 0, BASE_HEIGHT + 3.9, 0);
  part(builder, new SphereGeometry(0.9, 8, 6), skin, 0, BASE_HEIGHT + 6.75, 0.15);
  const scarf = part(builder, new TorusGeometry(0.9, 0.32, 6, 12), team, 0, BASE_HEIGHT + 6.2, 0.05);
  scarf.rotation.x = Math.PI / 2;
  const tail = part(builder, new BoxGeometry(0.42, 1.5, 0.18), team, 0.45, BASE_HEIGHT + 5.3, 1.45);
  tail.rotation.x = -0.15;
  part(builder, new CylinderGeometry(1.35, 1.35, 0.14, 12), felt, 0, BASE_HEIGHT + 7.4, 0.05);
  part(builder, new CylinderGeometry(0.85, 0.8, 2.1, 10), felt, 0, BASE_HEIGHT + 8.5, 0.05);
  part(builder, new CylinderGeometry(0.9, 0.9, 0.4, 10), team, 0, BASE_HEIGHT + 7.7, 0.05);

  for (const direction of [-1, 1]) {
    part(builder, new SphereGeometry(0.13, 5, 4), soul, direction * 0.3, BASE_HEIGHT + 6.85, 0.97);
    part(builder, new SphereGeometry(0.12, 5, 4), soul, 2.2 + direction * 0.19, BASE_HEIGHT + 7.62, 0.98);
  }

  limb(builder, coat, point(1.35, 5.6, 0.2), point(2.15, 4.55, 0.5), 0.32);
  part(builder, new SphereGeometry(0.33, 6, 5), skin, 2.2, BASE_HEIGHT + 4.45, 0.5);
  part(builder, new CylinderGeometry(0.14, 0.14, 6.6, 6), wood, 2.2, BASE_HEIGHT + 3.95, 0.5);
  part(builder, new BoxGeometry(0.95, 1.1, 0.12), iron, 2.2, BASE_HEIGHT + 1.05, 0.5);
  const spade = part(builder, new ConeGeometry(0.48, 0.5, 4), iron, 2.2, BASE_HEIGHT + 0.25, 0.5);
  spade.rotation.x = Math.PI;
  spade.scale.set(1, 1, 0.25);
  const skull = part(builder, new SphereGeometry(0.52, 7, 6), bone, 2.2, BASE_HEIGHT + 7.6, 0.5);
  skull.scale.set(1, 0.95, 1.05);
  part(builder, new BoxGeometry(0.5, 0.26, 0.42), bone, 2.2, BASE_HEIGHT + 7.12, 0.66);

  limb(builder, iron, point(-1.5, 3.8, 0.55), point(-1.95, 3.62, 0.7), 0.06);
  part(builder, new ConeGeometry(0.45, 0.35, 6), iron, -1.95, BASE_HEIGHT + 3.45, 0.7);
  part(builder, new CylinderGeometry(0.36, 0.36, 0.7, 6), soul, -1.95, BASE_HEIGHT + 2.93, 0.7);
  part(builder, new CylinderGeometry(0.42, 0.42, 0.12, 6), iron, -1.95, BASE_HEIGHT + 2.52, 0.7);

  return { body: builder.body, accentMaterials: [soul], teamMaterials: [team], height: BASE_HEIGHT + 9.6 };
}

function buildClockwright(builder: PartBuilder): FigureParts {
  const cloth = material(builder, "#4f5b68");
  const leather = material(builder, "#5a3d27");
  const copper = material(builder, "#b8683a", 0.55);
  const steel = material(builder, STEEL, 0.6);
  const whiskers = material(builder, "#b0582a");
  const skin = material(builder, SKIN);
  const brass = material(builder, "#e0a458", 0.6);
  brass.emissive = new Color("#7a4a12");
  const team = material(builder, "#ffffff");

  part(builder, new CylinderGeometry(1.7, 1.9, 2.5, 8), cloth, 0, BASE_HEIGHT + 1.25, 0);
  const torso = part(builder, new CapsuleGeometry(1.9, 0.9, 3, 8), cloth, 0, BASE_HEIGHT + 3.9, 0);
  torso.scale.set(1.2, 1, 1.05);
  const belt = part(builder, new TorusGeometry(1.85, 0.32, 6, 12), team, 0, BASE_HEIGHT + 2.75, 0);
  belt.rotation.x = Math.PI / 2;
  belt.scale.set(1.12, 1.02, 1);
  part(builder, new BoxGeometry(0.7, 0.55, 0.3), brass, 0, BASE_HEIGHT + 2.75, 2.2);

  part(builder, new SphereGeometry(1, 8, 6), skin, 0, BASE_HEIGHT + 6.95, 0.3);
  const beard = part(builder, new ConeGeometry(0.8, 1.4, 7), whiskers, 0, BASE_HEIGHT + 5.95, 0.95);
  beard.rotation.x = Math.PI - 0.25;
  const cap = part(builder, new SphereGeometry(1.06, 8, 6), team, 0, BASE_HEIGHT + 7.35, 0.2);
  cap.scale.set(1, 0.65, 1);

  for (const direction of [-1, 1]) {
    const goggle = part(builder, new CylinderGeometry(0.34, 0.34, 0.3, 8), copper, direction * 0.42, BASE_HEIGHT + 7.4, 1.25);
    goggle.rotation.x = Math.PI / 2;
    part(builder, new SphereGeometry(0.24, 6, 5), brass, direction * 0.42, BASE_HEIGHT + 7.4, 1.33);
    part(builder, new CylinderGeometry(0.2, 0.2, 1.9, 6), copper, direction * 0.85, BASE_HEIGHT + 6.45, -2.75);
    part(builder, new CylinderGeometry(0.32, 0.22, 0.3, 6), copper, direction * 0.85, BASE_HEIGHT + 7.5, -2.75);
  }

  part(builder, new BoxGeometry(2.4, 2.6, 1.3), leather, 0, BASE_HEIGHT + 4.7, -2.3);
  cog(builder, brass, steel, point(0.15, 6.35, -2.3), 0.95);
  cog(builder, brass, steel, point(-0.45, 4.3, -3.02), 0.6);

  limb(builder, cloth, point(1.9, 5.3, 0.3), point(2.65, 3.4, 0.75), 0.45);
  part(builder, new SphereGeometry(0.44, 6, 5), skin, 2.7, BASE_HEIGHT + 3.3, 0.8);
  part(builder, new BoxGeometry(0.42, 3.4, 0.26), steel, 2.7, BASE_HEIGHT + 3.7, 0.8);
  const jaw = part(builder, new TorusGeometry(0.62, 0.26, 4, 8, Math.PI * 1.45), steel, 2.7, BASE_HEIGHT + 6, 0.8);
  jaw.rotation.z = Math.PI * 0.775;

  return { body: builder.body, accentMaterials: [brass], teamMaterials: [team], height: BASE_HEIGHT + 8.05 };
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
    part(builder, new BoxGeometry(0.34, 0.2, 0.7), bone, direction * 0.55, BASE_HEIGHT + 0.1, 0.2);
    part(builder, new SphereGeometry(0.11, 5, 4), soul, direction * 0.19, BASE_HEIGHT + 4.5, 0.52);
  }

  part(builder, new BoxGeometry(1, 0.4, 0.5), bone, 0, BASE_HEIGHT + 2.15, 0);
  limb(builder, bone, point(0, 2.2, 0), point(0, 3.9, 0), 0.12);
  limb(builder, bone, point(-0.72, 3.95, 0), point(0.72, 3.95, 0), 0.11);

  for (let rib = 0; rib < 3; rib += 1) {
    const hoop = new TorusGeometry(0.55 - Math.abs(rib - 1) * 0.07, 0.09, 4, 10);
    const ring = part(builder, hoop, bone, 0, BASE_HEIGHT + 2.95 + rib * 0.35, 0.05);
    ring.rotation.x = Math.PI / 2;
  }

  const skull = part(builder, new SphereGeometry(0.55, 7, 6), bone, 0, BASE_HEIGHT + 4.45, 0.05);
  skull.scale.set(0.95, 1, 1);
  part(builder, new BoxGeometry(0.46, 0.22, 0.4), bone, 0, BASE_HEIGHT + 4.02, 0.22);

  limb(builder, bone, point(0.75, 3.9, 0), point(0.95, 2.75, 0.55), 0.1);
  const blade = part(builder, new BoxGeometry(0.2, 1.7, 0.07), rust, 0.95, BASE_HEIGHT + 3.41, 1.23);
  blade.rotation.x = 0.8;
  const guard = part(builder, new BoxGeometry(0.6, 0.1, 0.14), grip, 0.95, BASE_HEIGHT + 2.82, 0.62);
  guard.rotation.x = 0.8;

  limb(builder, bone, point(-0.75, 3.9, 0), point(-0.95, 2.95, 0.5), 0.1);
  const shield = part(builder, new CylinderGeometry(0.8, 0.8, 0.14, 10), team, -1.05, BASE_HEIGHT + 2.95, 0.85);
  shield.rotation.x = Math.PI / 2;
  part(builder, new TorusGeometry(0.8, 0.09, 4, 12), rust, -1.05, BASE_HEIGHT + 2.95, 0.85);
  part(builder, new SphereGeometry(0.2, 6, 4), rust, -1.05, BASE_HEIGHT + 2.95, 0.95);

  return { body: builder.body, accentMaterials: [soul], teamMaterials: [team], height: BASE_HEIGHT + 5 };
}

function buildBoneGolem(builder: PartBuilder): FigureParts {
  const bone = material(builder, "#ddd4bb");
  const marrow = material(builder, "#b3a68a");
  const soul = material(builder, "#9fe0d0", 0.1);
  soul.emissive = new Color("#2a8a78");
  const team = material(builder, "#ffffff");

  for (const direction of [-1, 1]) {
    limb(builder, marrow, point(direction * 1.4, 0.9, 0.1), point(direction * 1.35, 3.6, 0), 0.85);
    const foot = part(builder, new SphereGeometry(1, 7, 5), bone, direction * 1.45, BASE_HEIGHT + 0.45, 0.5);
    foot.scale.set(1, 0.5, 1.3);
    part(builder, new SphereGeometry(1.3, 7, 5), bone, direction * 2.85, BASE_HEIGHT + 9.4, 0.1);
    limb(builder, marrow, point(direction * 3.05, 9, 0.2), point(direction * 3.3, 5.2, 1), 0.85);
    part(builder, new IcosahedronGeometry(1.15, 1), bone, direction * 3.3, BASE_HEIGHT + 4.2, 1.3);
    part(builder, new SphereGeometry(0.15, 5, 4), soul, direction * 0.3, BASE_HEIGHT + 11.75, 2.38);
  }

  const pelvis = part(builder, new SphereGeometry(1.9, 8, 6), marrow, 0, BASE_HEIGHT + 4.3, 0);
  pelvis.scale.set(1.25, 0.7, 1.05);
  const chest = part(builder, new SphereGeometry(2.6, 9, 7), bone, 0, BASE_HEIGHT + 7.6, 0.1);
  chest.scale.set(1.12, 1.15, 0.92);
  const hump = part(builder, new SphereGeometry(1.9, 8, 6), bone, 0, BASE_HEIGHT + 10.6, -0.5);
  hump.scale.set(1.4, 0.9, 1.05);
  const binding = part(builder, new TorusGeometry(2, 0.42, 6, 14), team, 0, BASE_HEIGHT + 5.3, 0.05);
  binding.rotation.x = Math.PI / 2;
  binding.scale.set(1.1, 0.95, 1);

  for (let rib = 0; rib < 3; rib += 1) {
    const arc = part(builder, new TorusGeometry(2.6, 0.2, 4, 10, Math.PI), marrow, 0, BASE_HEIGHT + 6.8 + rib * 0.8, 0.1);
    arc.rotation.x = Math.PI / 2;
    arc.scale.set(1.1, 0.93, 1);
  }

  part(builder, new IcosahedronGeometry(0.75, 0), soul, 0, BASE_HEIGHT + 8.2, 2.3);
  part(builder, new IcosahedronGeometry(1, 0), marrow, 1.8, BASE_HEIGHT + 6.1, 1.55);
  part(builder, new IcosahedronGeometry(0.9, 0), marrow, -1.7, BASE_HEIGHT + 5.8, 1.5);
  part(builder, new IcosahedronGeometry(0.8, 0), marrow, -1.9, BASE_HEIGHT + 10.9, 0.8);

  const skull = part(builder, new SphereGeometry(0.9, 7, 6), bone, 0, BASE_HEIGHT + 11.7, 1.55);
  skull.scale.set(1, 0.95, 1.05);
  part(builder, new BoxGeometry(0.8, 0.35, 0.6), bone, 0, BASE_HEIGHT + 11, 1.9);
  spike(builder, bone, point(0, 12.1, -0.1), point(0, 13.2, -0.45), 0.32);
  spike(builder, bone, point(0, 12, -1), point(0, 13, -1.6), 0.32);
  spike(builder, bone, point(0, 11.6, -1.75), point(0, 12.35, -2.6), 0.3);

  return { body: builder.body, accentMaterials: [soul], teamMaterials: [team], height: BASE_HEIGHT + 13.2 };
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
    part(builder, new CylinderGeometry(0.34, 0.42, 0.22, 6), brass, foot.x, BASE_HEIGHT + 0.11, foot.z);
  }

  const hull = part(builder, new SphereGeometry(1.3, 10, 8), brass, 0, BASE_HEIGHT + 2.6, 0);
  hull.scale.set(1, 0.82, 1);
  const band = part(builder, new TorusGeometry(1.3, 0.2, 5, 16), team, 0, BASE_HEIGHT + 2.6, 0);
  band.rotation.x = Math.PI / 2;
  part(builder, new CylinderGeometry(0.55, 0.75, 0.4, 8), team, 0, BASE_HEIGHT + 3.55, 0);
  part(builder, new BoxGeometry(0.28, 0.5, 0.28), iron, 0.35, BASE_HEIGHT + 3.95, -0.35);

  const rotor = new Group();
  rotor.position.set(0, BASE_HEIGHT + 2.65, 1.2);
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
    height: BASE_HEIGHT + 4.2,
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

    case "hexbinder":
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

export function createHeroFigure(heroId: string): HeroFigure {
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
  let glow = 0;
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
    next.setGlow(glow);
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

    setGlow(amount) {
      glow = amount;
      current.setGlow(amount);
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
  model.add(base.mesh, parts.body);
  root.add(model);

  const flashMaterials = builder.materials;
  let teamColor = new Color("#ffffff");
  let moving = false;
  let dead = false;
  let clock = Math.random() * 10;
  let attackTime = Number.POSITIVE_INFINITY;
  let castTime = Number.POSITIVE_INFINITY;
  let hitTime = Number.POSITIVE_INFINITY;
  let deathTime = Number.POSITIVE_INFINITY;
  let bodyGlow = 0;

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
      applyTeamColor();

      if (!isDead) {
        parts.body.rotation.set(0, 0, 0);
        parts.body.position.set(0, 0, 0);
        base.mesh.scale.setScalar(1);
        root.visible = true;
      }
    },

    setGlow(amount) {
      bodyGlow = Math.max(0, amount);
    },

    setChanneling() {},

    setCelebrating() {},

    setCastsShadow(castsShadow) {
      parts.body.traverse((node) => {
        node.castShadow = castsShadow;
      });

      base.mesh.castShadow = castsShadow;
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
        const sink = Math.min(1, Math.max(0, deathTime - DEATH_SECONDS) / SINK_SECONDS);
        parts.body.rotation.set(-fall * (Math.PI / 2) * 0.92, 0, 0);
        parts.body.position.set(0, -fall * 0.6 - sink * SINK_UNITS, -fall * 1.5);
        base.mesh.scale.setScalar(Math.max(0.001, 1 - sink));
        root.visible = sink < 1;

        return;
      }

      const stride = moving ? Math.abs(Math.sin(clock * 11)) * 0.55 : Math.sin(clock * 2.2) * 0.08;
      const bob = rooted ? 0 : stride;
      const attacking = attackTime < ATTACK_SECONDS;
      const casting = castTime < CAST_SECONDS;
      const lunge = attacking && !rooted ? Math.sin((Math.PI * attackTime) / ATTACK_SECONDS) * LUNGE_UNITS : 0;
      const lift = casting && !rooted ? Math.sin((Math.PI * castTime) / CAST_SECONDS) * 0.9 : 0;
      const lean = moving && !rooted ? 0.12 : 0;

      parts.body.position.set(0, bob + lift, lunge - flinch * 0.6);
      parts.body.rotation.set(lean + lunge * 0.06 - flinch * 0.12, 0, 0);

      if (parts.rotor !== undefined) {
        parts.rotor.rotation.z += deltaSeconds * (attacking || casting ? ROTOR_FIRING_SPEED : ROTOR_IDLE_SPEED);
      }

      const glow = castTime < CAST_SECONDS ? 1 + Math.sin((Math.PI * castTime) / CAST_SECONDS) * 3 : 1;

      for (const accent of parts.accentMaterials) {
        accent.emissiveIntensity = glow;
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
