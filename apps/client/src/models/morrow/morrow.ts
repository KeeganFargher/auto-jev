import {
  Color,
  DoubleSide,
  Group,
  Matrix4,
  Mesh,
  MeshStandardMaterial,
  Object3D,
  Vector2,
  Vector3,
  type BufferGeometry,
  type Material,
} from "three";
import { placed } from "../sculpt/props.js";
import { mergeTextured } from "../sculpt/strands.js";
import {
  BEAK_TIP,
  bellyGeometry,
  eyeFrame,
  eyeGeometry,
  headGeometry,
  hideTextures,
  HIPS,
  irisTexture,
  legGeometry,
  lidGeometry,
  NECK_BASE,
  NECK_PITCH,
  NECK_RINGS,
  neckRing,
  RING_SPACING,
  STANCE,
  tailGeometry,
  TAIL_ROOT,
} from "./body.js";
import { shell } from "./shell.js";
import { BELL_AT, LANTERNS_AT, MALLET_AT, malletGeometry, shrineGeometry, SHRINE_ORIGIN, SUN_AT } from "./shrine.js";

export interface Morrow {
  readonly root: Group;
  readonly height: number;
  readonly body: Group;
  readonly shrine: Group;
  readonly neck: Group;
  readonly rings: readonly Group[];
  readonly head: Group;
  readonly lids: readonly Object3D[];
  readonly legs: readonly Group[];
  readonly tail: Group;
  readonly bell: Group;
  readonly sun: Group;
  readonly lanterns: readonly Group[];
  readonly mallet: Group;
  readonly beak: Object3D;
  readonly surfaces: readonly MeshStandardMaterial[];
  readonly triangles: number;
  setFlash(amount: number): void;
  setGlow(amount: number): void;
  setRadiance(amount: number): void;
  setCastsShadow(castsShadow: boolean): void;
  dispose(): void;
}

interface MorrowGeometry {
  readonly belly: BufferGeometry;
  readonly legs: readonly BufferGeometry[];
  readonly rings: readonly BufferGeometry[];
  readonly tail: BufferGeometry;
  readonly eyes: BufferGeometry;
  readonly upperLid: BufferGeometry;
  readonly lowerLid: BufferGeometry;
}

export const MORROW_HEIGHT = 8.2 + STANCE;

export const BODY_PIVOT = new Vector3(0, 1.3, -0.35);

export const LID_OPEN = -0.42;

const HIDE_REPEAT = 1;

const HEAD_SCALE = 1.3;

const SUN_GLOW = new Color("#ffb44a");

const LANTERN_GLOW = new Color("#ff8a3a");

const EYE_GLOW = new Color("#ffcf6a");

const FLASH = new Color("#ffffff");

let cached: MorrowGeometry | null = null;

function build(): MorrowGeometry {
  const eyes = [0, 1].map((index) => {
    const frame = eyeFrame(index);

    return placed(eyeGeometry(), frame.center, frame.gaze, new Vector3(0, 1, 0), new Vector3(1, 1, 1));
  });

  return {
    belly: bellyGeometry(),
    legs: HIPS.map((_hip, index) => legGeometry(index).geometry),
    rings: Array.from({ length: NECK_RINGS }, (_ring, index) => neckRing(index)),
    tail: tailGeometry(),
    eyes: mergeTextured(eyes),
    upperLid: lidGeometry(true),
    lowerLid: lidGeometry(false),
  };
}

function geometryOf(): MorrowGeometry {
  cached ??= build();

  return cached;
}

function trianglesOf(geometry: BufferGeometry): number {
  return (geometry.index?.count ?? geometry.getAttribute("position").count) / 3;
}

function joint(at: Vector3, parent: Vector3): Group {
  const group = new Group();
  group.position.copy(at).sub(parent);

  return group;
}

function eyeBasis(gaze: Vector3): Matrix4 {
  const z = gaze.clone().normalize();
  const y = new Vector3(0, 1, 0).addScaledVector(z, -z.y).normalize();
  const x = new Vector3().crossVectors(y, z);

  return new Matrix4().makeBasis(x, y, z);
}

export function createMorrow(): Morrow {
  const geometry = geometryOf();
  const carapace = shell();
  const shrine = shrineGeometry();
  const mallet = malletGeometry();
  const hide = hideTextures();
  const root = new Group();
  const meshes: Mesh[] = [];

  const shellSurface = new MeshStandardMaterial({
    map: carapace.textures.color,
    normalMap: carapace.textures.normal,
    normalScale: new Vector2(1, 1),
    roughness: 0.6,
    metalness: 0,
  });

  const skin = new MeshStandardMaterial({
    map: hide.detail,
    normalMap: hide.normal,
    normalScale: new Vector2(0.9, 0.9),
    vertexColors: true,
    roughness: 0.78,
    metalness: 0,
  });

  const face = new MeshStandardMaterial({ vertexColors: true, roughness: 0.66, metalness: 0 });
  const wood = new MeshStandardMaterial({ vertexColors: true, roughness: 0.86, metalness: 0 });
  const metal = new MeshStandardMaterial({ vertexColors: true, roughness: 0.36, metalness: 0.75 });
  const paper = new MeshStandardMaterial({ vertexColors: true, roughness: 0.9, metalness: 0, side: DoubleSide });

  const sunSurface = new MeshStandardMaterial({
    vertexColors: true,
    roughness: 0.3,
    metalness: 0.7,
    emissive: SUN_GLOW,
    emissiveIntensity: 0.35,
  });

  const lanternSurface = new MeshStandardMaterial({
    vertexColors: true,
    roughness: 0.8,
    metalness: 0,
    emissive: LANTERN_GLOW,
    emissiveIntensity: 0.15,
  });

  const eyeSurface = new MeshStandardMaterial({
    map: irisTexture(),
    roughness: 0.16,
    metalness: 0,
    emissive: EYE_GLOW,
    emissiveIntensity: 0,
  });

  skin.map?.repeat.set(HIDE_REPEAT, HIDE_REPEAT);

  const add = (group: Object3D, part: BufferGeometry, material: Material): Mesh => {
    const mesh = new Mesh(part, material);
    meshes.push(mesh);
    group.add(mesh);

    return mesh;
  };

  const body = joint(BODY_PIVOT, new Vector3());
  const hull = new Group();
  hull.position.copy(BODY_PIVOT).negate();
  add(hull, carapace.geometry, shellSurface);
  add(hull, geometry.belly, face);
  body.add(hull);

  const temple = joint(SHRINE_ORIGIN, BODY_PIVOT);
  add(temple, shrine.wood, wood);
  add(temple, shrine.metal, metal);
  add(temple, shrine.paper, paper);
  const sun = joint(SUN_AT, new Vector3());
  sun.name = "morrow-sun";
  add(sun, shrine.sun, sunSurface);
  const bell = joint(BELL_AT, new Vector3());
  add(bell, shrine.bell, metal);

  const lanterns = LANTERNS_AT.map((at) => {
    const pivot = joint(at, new Vector3());
    add(pivot, shrine.lantern, wood);
    add(pivot, shrine.lanternGlow, lanternSurface);

    return pivot;
  });

  const hammer = joint(MALLET_AT, new Vector3());
  hammer.rotation.x = Math.PI / 2;
  add(hammer, mallet.wood, wood);
  add(hammer, mallet.gold, metal);
  temple.add(sun, bell, hammer, ...lanterns);
  body.add(temple);

  const legs = HIPS.map((hip, index) => {
    const pivot = joint(hip, BODY_PIVOT);
    add(pivot, geometry.legs[index], skin);
    body.add(pivot);

    return pivot;
  });

  const tail = joint(TAIL_ROOT, BODY_PIVOT);
  add(tail, geometry.tail, skin);
  body.add(tail);

  const neck = joint(NECK_BASE, BODY_PIVOT);
  neck.rotation.x = NECK_PITCH;
  const rings: Group[] = [];
  let parent: Group = neck;

  for (let index = 0; index < NECK_RINGS; index += 1) {
    const ring = new Group();
    ring.position.z = index === 0 ? 0 : RING_SPACING;
    add(ring, geometry.rings[index], skin);
    parent.add(ring);
    rings.push(ring);
    parent = ring;
  }

  const head = new Group();
  head.position.z = RING_SPACING;
  head.rotation.x = -NECK_PITCH;
  head.scale.setScalar(HEAD_SCALE);
  parent.add(head);
  add(head, headGeometry(), face);
  add(head, geometry.eyes, eyeSurface);

  const lids = [0, 1].map((index) => {
    const frame = eyeFrame(index);
    const pivot = new Group();
    pivot.position.copy(frame.center);
    pivot.quaternion.setFromRotationMatrix(eyeBasis(frame.gaze));
    const upper = new Group();
    upper.rotation.x = LID_OPEN;
    add(upper, geometry.upperLid, face);
    add(pivot, geometry.lowerLid, face);
    pivot.add(upper);
    head.add(pivot);

    return upper;
  });

  const beak = new Object3D();
  beak.position.copy(BEAK_TIP);
  head.add(beak);
  body.add(neck);
  const stand = new Group();
  stand.position.y = STANCE;
  stand.add(body);
  root.add(stand);
  const triangles = meshes.reduce((sum, mesh) => sum + trianglesOf(mesh.geometry), 0);
  const flashing = [shellSurface, skin, face, wood];

  return {
    root,
    height: MORROW_HEIGHT,
    body,
    shrine: temple,
    neck,
    rings,
    head,
    lids,
    legs,
    tail,
    bell,
    sun,
    lanterns,
    mallet: hammer,
    beak,
    surfaces: [shellSurface, skin, face, wood, metal, paper, sunSurface, lanternSurface],
    triangles,

    setFlash(amount) {
      for (const material of flashing) {
        material.emissive.copy(FLASH).multiplyScalar(amount * 0.6);
      }
    },

    setGlow(amount) {
      sunSurface.emissiveIntensity = 0.35 + Math.max(0, amount) * 2.4;
    },

    setRadiance(amount) {
      const level = Math.max(0, amount);
      lanternSurface.emissiveIntensity = 0.15 + level * 2.2;
      eyeSurface.emissiveIntensity = level * 0.55;
    },

    setCastsShadow(castsShadow) {
      for (const mesh of meshes) {
        mesh.castShadow = castsShadow;
      }
    },

    dispose() {
      root.removeFromParent();

      for (const material of [shellSurface, skin, face, wood, metal, paper, sunSurface, lanternSurface, eyeSurface]) {
        material.dispose();
      }
    },
  };
}
