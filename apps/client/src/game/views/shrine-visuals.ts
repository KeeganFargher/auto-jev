import {
  BoxGeometry,
  BufferGeometry,
  CatmullRomCurve3,
  CircleGeometry,
  Color,
  ConeGeometry,
  CylinderGeometry,
  Float32BufferAttribute,
  Group,
  IcosahedronGeometry,
  Matrix4,
  Mesh,
  RingGeometry,
  TubeGeometry,
  Vector3,
  type ColorRepresentation,
  type Material,
  type MeshBasicMaterial,
  type MeshStandardMaterial,
} from "three";
import { malletGeometry } from "../../models/morrow/shrine.js";
import { merge, placed } from "../../models/sculpt/props.js";
import { effectMaterials, releaseEffectMaterial, type MaterialPool } from "./effect-materials.js";
import { CHEST_FRACTION } from "./figure-base.js";
import { createTrail, type ParticleStyle, type ParticleSystem } from "./particles.js";
import type { ProjectileVisual, SpellVisual, TickedVisual } from "./spell-visuals.js";

interface ShrineKit {
  readonly malletBody: BufferGeometry;
  readonly malletTrim: BufferGeometry;
  readonly sphere: BufferGeometry;
  readonly crest: BufferGeometry;
  readonly stamp: BufferGeometry;
  readonly ring: BufferGeometry;
  readonly rim: BufferGeometry;
  readonly disc: BufferGeometry;
  readonly petal: BufferGeometry;
  readonly hex: BufferGeometry;
  readonly dome: BufferGeometry;
  readonly beam: BufferGeometry;
  readonly toriiRed: BufferGeometry;
  readonly toriiTop: BufferGeometry;
  readonly sun: BufferGeometry;
  readonly burst: BufferGeometry;
}

interface ToriiParts {
  readonly red: BufferGeometry;
  readonly top: BufferGeometry;
}

interface Boundary {
  readonly rope: BufferGeometry;
  readonly shide: BufferGeometry;
}

interface SolidLook {
  readonly color: ColorRepresentation;
  readonly roughness: number;
  readonly metalness?: number;
  readonly emissive?: ColorRepresentation;
  readonly emissiveIntensity?: number;
  readonly opacity?: number;
}

interface Petal {
  readonly mesh: Mesh;
  readonly open: number;
}

interface Shard {
  readonly mesh: Mesh;
  readonly velocity: Vector3;
  readonly spin: Vector3;
}

const GOLD = new Color("#f2c14e");

const GOLD_DEEP = new Color("#a8741c");

const GOLD_PALE = new Color("#fff4c8");

const DAWN = new Color("#ffb35c");

const VERMILION = "#d2402c";

const VERMILION_DEEP = "#6e170e";

const INK = "#2a1a10";

const STRAW = "#c49a4a";

const PAPER = "#fbf8ee";

const HONEY = "#f0b43c";

const AMBER = "#e2a23a";

const ROSE = "#f3a3b8";

const ROSE_GLOW = "#ffd6de";

const LACQUER = "#1c1512";

const MALLET_SCALE = 6;

const MALLET_ARC = 3.5;

const MALLET_SPINS = 1.5;

const MALLET_GROW = 0.25;

const STRIKE_SECONDS = 0.34;

const SEAL_SECONDS = 1.25;

const SEAL_DROP = 0.09;

const SEAL_LIFT = 0.22;

const SEAL_RADIUS = 4.2;

const SEAL_SQUAT = 0.7;

const LOTUS_SECONDS = 1.2;

const LOTUS_OPEN = 0.3;

const LOTUS_PETALS = 8;

const LOTUS_INNER = 5;

const LOTUS_POOL = 5.5;

const LOTUS_LIFT = 1.2;

const LOTUS_DRIFT = 2.5;

const ROPE_THICKNESS = 0.55;

const ROPE_HEIGHT = 3.2;

const ROPE_SAG = 0.4;

const ROPE_TWIST = 2.2;

const ROPE_ARRIVE_SECONDS = 0.35;

const ROPE_FADE_SECONDS = 0.45;

const SHIDE_COUNT = 8;

const SHIDE_FOLDS = 4;

const SHIDE_FOLD = 0.6;

const SHIDE_WIDTH = 0.5;

const RIPPLE_SECONDS = 0.55;

const TOLL_SECONDS = 1.1;

const TOLL_RINGS = 3;

const TOLL_HEIGHT = 9;

const TORII_SECONDS = 1.55;

const TORII_RISE = 0.28;

const TORII_FADE = 1.1;

const TORII_WIDTH = 11;

const TORII_HEIGHT = 12.5;

const SHOCK_SECONDS = 0.95;

const DOME_TILES = 46;

const DOME_TILE = 0.2;

const DOME_ASSEMBLE = 0.26;

const DOME_SHATTER = 0.5;

const DOME_SHARDS = 12;

const DAWN_SECONDS = 1.8;

const DAWN_FADE = 1.2;

const SUN_SIZE = 6.5;

const SUN_LOW = -4;

const SUN_HIGH = 15;

const SUN_BEHIND = 7;

const GRACE_SECONDS = 0.85;

const GRACE_SHARDS = 14;

const UP = new Vector3(0, 1, 0);

const FORWARD = new Vector3(0, 0, 1);

const MALLET_SPARKS: ParticleStyle = {
  blend: "solid",
  from: new Color("#ffe9a8"),
  to: new Color("#d98a1c"),
  brightness: 1,
  opacity: 0.95,
  size: [1.3, 0.3],
  life: [0.2, 0.36],
  speed: [0.4, 1.6],
  cone: 0.9,
  spread: 0.35,
  gravity: 0,
  drag: 2,
  stretch: 0,
  softness: 0.4,
};

const PAPER_FLECKS: ParticleStyle = {
  blend: "solid",
  from: new Color(PAPER),
  to: new Color("#e7d9ae"),
  brightness: 1,
  opacity: 1,
  size: [0.9, 0.6],
  life: [0.6, 1],
  speed: [0.5, 2.5],
  cone: 1.4,
  spread: 0.5,
  gravity: 5,
  drag: 2.5,
  stretch: 0,
  softness: 0.2,
};

const GOLD_MOTES: ParticleStyle = {
  blend: "solid",
  from: new Color("#fff6d2"),
  to: new Color("#f0a73a"),
  brightness: 1,
  opacity: 0.95,
  size: [1.1, 0.35],
  life: [0.6, 1.1],
  speed: [2.5, 6],
  cone: 0.5,
  spread: 2,
  gravity: -3,
  drag: 1.2,
  stretch: 0,
  softness: 0.45,
};

const SEAL_DUST: ParticleStyle = {
  blend: "solid",
  from: new Color("#d9c7a0"),
  to: new Color("#9e8a64"),
  brightness: 1,
  opacity: 0.5,
  size: [2.4, 5],
  life: [0.4, 0.7],
  speed: [6, 12],
  cone: 1.45,
  spread: 1.5,
  gravity: -1,
  drag: 4,
  stretch: 0,
  softness: 1,
};

const PAPER_SCRAPS: ParticleStyle = {
  blend: "solid",
  from: new Color(PAPER),
  to: new Color("#e8dcb8"),
  brightness: 1,
  opacity: 1,
  size: [1.3, 0.8],
  life: [0.7, 1.2],
  speed: [14, 26],
  cone: 1.35,
  spread: 1,
  gravity: 14,
  drag: 2.2,
  stretch: 0,
  softness: 0.2,
};

const DAWN_EMBERS: ParticleStyle = {
  blend: "solid",
  from: new Color("#fff0c0"),
  to: new Color("#ff8c2a"),
  brightness: 1,
  opacity: 0.85,
  size: [1.6, 0.4],
  life: [0.8, 1.4],
  speed: [4, 10],
  cone: 0.6,
  spread: 4,
  gravity: -4,
  drag: 1,
  stretch: 0,
  softness: 0.5,
};

let shared: ShrineKit | null = null;

const boundaries = new Map<number, Boundary>();

function clamp01(value: number): number {
  return Math.min(1, Math.max(0, value));
}

function easeOut(value: number): number {
  return 1 - (1 - clamp01(value)) ** 3;
}

function easeIn(value: number): number {
  return clamp01(value) ** 2;
}

function easeOutBack(value: number): number {
  const t = clamp01(value);

  return 1 + 2.7 * (t - 1) ** 3 + 1.7 * (t - 1) ** 2;
}

function random(seed: number): () => number {
  let state = Math.floor(seed * 7919 + 17) >>> 0;

  return () => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;

    return state / 4294967296;
  };
}

function flatNormals(geometry: BufferGeometry): BufferGeometry {
  const count = geometry.getAttribute("position").count;
  const normals = new Float32Array(count * 3);

  for (let index = 0; index < count; index += 1) {
    normals[index * 3 + 1] = 1;
  }

  geometry.setAttribute("normal", new Float32BufferAttribute(normals, 3));

  return geometry;
}

function lotusPetal(): BufferGeometry {
  const across = 6;
  const along = 10;
  const positions: number[] = [];
  const indices: number[] = [];

  for (let row = 0; row <= along; row += 1) {
    const v = row / along;
    const half = 0.5 * Math.sin(Math.PI * Math.min(1, v * 1.05) ** 0.8) + 0.004;
    const tip = v > 0.85 ? (v - 0.85) * 0.6 : 0;

    for (let column = 0; column <= across; column += 1) {
      const u = (column / across) * 2 - 1;
      positions.push(u * half * (1 - tip), 0.32 * u * u * half + 0.18 * v * v, v);
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

  return geometry;
}

function crest(): BufferGeometry {
  const parts: BufferGeometry[] = [
    new RingGeometry(0.84, 1, 56),
    new RingGeometry(0.56, 0.64, 48),
    new CircleGeometry(0.2, 24),
  ];

  for (let ray = 0; ray < 8; ray += 1) {
    const angle = (ray / 8) * Math.PI * 2;
    parts.push(
      new ConeGeometry(0.075, 0.26, 3)
        .rotateZ(-Math.PI / 2)
        .translate(0.39, 0, 0)
        .rotateZ(angle)
        .scale(1, 1, 0.01),
    );
  }

  for (let dot = 0; dot < 4; dot += 1) {
    const angle = (dot / 4) * Math.PI * 2 + Math.PI / 8;
    parts.push(new CircleGeometry(0.06, 12).translate(Math.cos(angle) * 0.74, Math.sin(angle) * 0.74, 0));
  }

  return flatNormals(merge(parts).rotateX(-Math.PI / 2));
}

function stamp(): BufferGeometry {
  return merge([
    new CylinderGeometry(1, 1, 1.1, 28).translate(0, 0.55, 0),
    new CylinderGeometry(1.07, 1.07, 0.16, 28).translate(0, 0.92, 0),
    new CylinderGeometry(0.7, 0.92, 0.34, 20).translate(0, 1.27, 0),
  ]);
}

function torii(): ToriiParts {
  const red = merge([
    new CylinderGeometry(0.042, 0.05, 0.94, 14).translate(-0.37, 0.47, 0),
    new CylinderGeometry(0.042, 0.05, 0.94, 14).translate(0.37, 0.47, 0),
    new BoxGeometry(1.02, 0.05, 0.05).translate(0, 0.66, 0),
    new BoxGeometry(0.05, 0.14, 0.05).translate(0, 0.77, 0),
    new BoxGeometry(1.08, 0.06, 0.07).translate(0, 0.87, 0),
  ]);

  const lintel = new CatmullRomCurve3([
    new Vector3(-0.66, 1.0, 0),
    new Vector3(-0.34, 0.955, 0),
    new Vector3(0, 0.945, 0),
    new Vector3(0.34, 0.955, 0),
    new Vector3(0.66, 1.0, 0),
  ]);

  return { red, top: merge([new TubeGeometry(lintel, 24, 0.05, 5, false)]) };
}

function sunDisc(): BufferGeometry {
  const parts: BufferGeometry[] = [new CircleGeometry(0.62, 48)];

  for (let ray = 0; ray < 24; ray += 1) {
    const angle = (ray / 24) * Math.PI * 2;
    const length = ray % 2 === 0 ? 0.4 : 0.26;
    parts.push(
      new ConeGeometry(0.07, length, 3)
        .translate(0, 0.66 + length / 2, 0)
        .rotateZ(angle)
        .scale(1, 1, 0.01),
    );
  }

  return merge(parts);
}

function sunburst(): BufferGeometry {
  const parts: BufferGeometry[] = [new RingGeometry(0.16, 0.22, 40)];

  for (let ray = 0; ray < 28; ray += 1) {
    const angle = (ray / 28) * Math.PI * 2;
    const length = ray % 2 === 0 ? 0.75 : 0.45;
    parts.push(
      new ConeGeometry(0.035, length, 3)
        .translate(0, 0.25 + length / 2, 0)
        .rotateZ(angle)
        .scale(1, 1, 0.01),
    );
  }

  return flatNormals(merge(parts).rotateX(-Math.PI / 2));
}

function shellDome(): BufferGeometry {
  const next = random(11);
  const golden = Math.PI * (3 - Math.sqrt(5));
  const tiles: BufferGeometry[] = [];

  for (let index = 0; index < DOME_TILES; index += 1) {
    const y = 1 - (index + 0.5) / DOME_TILES;
    const ring = Math.sqrt(1 - y * y);
    const angle = index * golden;
    const normal = new Vector3(Math.cos(angle) * ring, y, Math.sin(angle) * ring);
    const tile = new CylinderGeometry(DOME_TILE * 0.82, DOME_TILE, 0.05, 6).rotateY(next() * Math.PI);
    tiles.push(placed(tile, normal, normal, FORWARD, new Vector3(1, 1, 1)));
  }

  return merge(tiles);
}

function strippedMallet(part: BufferGeometry): BufferGeometry {
  const copy = merge([part.clone()]);
  copy.deleteAttribute("color");

  return copy.translate(0, 0.2, 0);
}

function kit(): ShrineKit {
  if (shared === null) {
    const gate = torii();
    const mallet = malletGeometry();

    shared = {
      malletBody: strippedMallet(mallet.wood),
      malletTrim: strippedMallet(mallet.gold),
      sphere: new IcosahedronGeometry(1, 2),
      crest: crest(),
      stamp: stamp(),
      ring: new RingGeometry(0.88, 1, 72).rotateX(-Math.PI / 2),
      rim: new RingGeometry(0.965, 1, 96).rotateX(-Math.PI / 2),
      disc: new CircleGeometry(1, 48).rotateX(-Math.PI / 2),
      petal: lotusPetal(),
      hex: new CylinderGeometry(0.85, 1, 0.22, 6),
      dome: shellDome(),
      beam: new CylinderGeometry(1, 1, 1, 28, 1, true).translate(0, 0.5, 0),
      toriiRed: gate.red,
      toriiTop: gate.top,
      sun: sunDisc(),
      burst: sunburst(),
    };
  }

  return shared;
}

function sag(angle: number): number {
  return -ROPE_SAG * 0.5 * (1 - Math.cos(angle * SHIDE_COUNT));
}

function twistedRope(radius: number): BufferGeometry {
  const points: Vector3[] = [];

  for (let step = 0; step < 96; step += 1) {
    const angle = (step / 96) * Math.PI * 2;
    points.push(new Vector3(Math.cos(angle) * radius, 0, Math.sin(angle) * radius));
  }

  const segments = Math.min(360, Math.max(96, Math.ceil(Math.PI * 2 * radius * 5)));
  const tube = new TubeGeometry(new CatmullRomCurve3(points, true), segments, ROPE_THICKNESS, 9, true);
  const positions = tube.getAttribute("position");
  const twist = Math.max(1, Math.round(radius * ROPE_TWIST)) / radius;

  for (let index = 0; index < positions.count; index += 1) {
    const x = positions.getX(index);
    const y = positions.getY(index);
    const z = positions.getZ(index);
    const angle = Math.atan2(z, x);
    const outward = Math.hypot(x, z) - radius;
    const around = Math.atan2(y, outward);
    const swell = 1 + 0.2 * Math.cos(3 * around + angle * radius * twist);
    const reach = radius + outward * swell;
    positions.setXYZ(index, Math.cos(angle) * reach, y * swell + sag(angle), Math.sin(angle) * reach);
  }

  tube.computeVertexNormals();

  return tube;
}

function shideStrips(radius: number): BufferGeometry {
  const positions: number[] = [];
  const normals: number[] = [];
  const corner = new Vector3();

  for (let strip = 0; strip < SHIDE_COUNT; strip += 1) {
    const angle = (strip / SHIDE_COUNT) * Math.PI * 2;
    const outward = new Vector3(Math.cos(angle), 0, Math.sin(angle));
    const along = new Vector3(-Math.sin(angle), 0, Math.cos(angle));

    const top = outward
      .clone()
      .multiplyScalar(radius + ROPE_THICKNESS * 0.4)
      .setY(-ROPE_THICKNESS * 0.6);

    for (let fold = 0; fold < SHIDE_FOLDS; fold += 1) {
      const shift = (fold % 2 === 0 ? -1 : 1) * SHIDE_WIDTH * 0.35;
      const upper = -fold * SHIDE_FOLD;
      const lower = upper - SHIDE_FOLD * 0.94;
      const lean = 0.06 * fold;

      const quad = [
        [shift - SHIDE_WIDTH / 2, upper, lean],
        [shift - SHIDE_WIDTH / 2, lower, lean + 0.06],
        [shift + SHIDE_WIDTH / 2, upper, lean],
        [shift + SHIDE_WIDTH / 2, upper, lean],
        [shift - SHIDE_WIDTH / 2, lower, lean + 0.06],
        [shift + SHIDE_WIDTH / 2, lower, lean + 0.06],
      ] as const;

      for (const [u, v, w] of quad) {
        corner.copy(top).addScaledVector(along, u).addScaledVector(outward, w);
        corner.y += v;
        positions.push(corner.x, corner.y, corner.z);
        normals.push(outward.x, 0, outward.z);
      }
    }
  }

  const geometry = new BufferGeometry();
  geometry.setAttribute("position", new Float32BufferAttribute(positions, 3));
  geometry.setAttribute("normal", new Float32BufferAttribute(normals, 3));

  return geometry;
}

function boundary(radius: number): Boundary {
  const key = Math.max(4, Math.round(radius));
  let known = boundaries.get(key);

  if (known === undefined) {
    known = { rope: twistedRope(key), shide: shideStrips(key) };
    boundaries.set(key, known);
  }

  return known;
}

function solid(kind: MaterialPool<MeshStandardMaterial>, look: SolidLook): MeshStandardMaterial {
  const material = kind.take();
  material.color.set(look.color);
  material.roughness = look.roughness;
  material.metalness = look.metalness ?? 0;
  material.emissive.set(look.emissive ?? 0);
  material.emissiveIntensity = look.emissiveIntensity ?? 1;
  material.opacity = look.opacity ?? 1;

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

function retire(root: Group, materials: readonly Material[]): void {
  root.removeFromParent();

  for (const material of materials) {
    releaseEffectMaterial(material);
  }
}

export function spiritMallet(scale: number): (particles: ParticleSystem, launch: Vector3) => ProjectileVisual {
  return (particles, launch) => {
    const pieces = kit();

    const lacquer = solid(effectMaterials.solid, {
      color: VERMILION,
      roughness: 0.35,
      metalness: 0.1,
      emissive: VERMILION_DEEP,
      emissiveIntensity: 0.6,
    });

    const gold = solid(effectMaterials.solid, {
      color: GOLD,
      roughness: 0.3,
      metalness: 0.6,
      emissive: GOLD_DEEP,
      emissiveIntensity: 1,
    });

    const aura = glow(GOLD_PALE, 0.25);
    const halo = new Mesh(pieces.sphere, aura);
    const body = new Mesh(pieces.malletBody, lacquer);
    const trim = new Mesh(pieces.malletTrim, gold);
    const sparks = createTrail(particles, MALLET_SPARKS, 0.7, launch);
    const flecks = createTrail(particles, PAPER_FLECKS, 2.4, launch);
    const heading = new Vector3();
    const side = new Vector3();
    const along = new Vector3();
    const facing = new Vector3();
    const basis = new Matrix4();

    return {
      objects: [halo, body, trim],

      place(from, to, progress) {
        const size = MALLET_SCALE * scale * (0.45 + 0.55 * easeOutBack(progress / MALLET_GROW));
        body.position.lerpVectors(from, to, progress);
        body.position.y += Math.sin(Math.PI * progress) * Math.min(MALLET_ARC * scale, from.distanceTo(to) * 0.3);
        heading.subVectors(to, from).setY(0);

        if (heading.lengthSq() < 1e-6) {
          heading.copy(FORWARD);
        }

        heading.normalize();
        side.crossVectors(heading, UP).normalize();
        const spin = progress * Math.PI * 2 * MALLET_SPINS;
        along.copy(heading).multiplyScalar(Math.cos(spin)).addScaledVector(UP, -Math.sin(spin));
        facing.crossVectors(side, along);
        basis.makeBasis(side, along, facing);
        body.quaternion.setFromRotationMatrix(basis);
        body.scale.setScalar(size);
        trim.position.copy(body.position);
        trim.quaternion.copy(body.quaternion);
        trim.scale.copy(body.scale);
        halo.position.copy(body.position);
        halo.scale.setScalar(size * 0.3);
        sparks.follow(body.position);
        flecks.follow(body.position);
      },

      dispose() {
        halo.removeFromParent();
        body.removeFromParent();
        trim.removeFromParent();
        releaseEffectMaterial(lacquer);
        releaseEffectMaterial(gold);
        releaseEffectMaterial(aura);
      },
    };
  };
}

export function bellStrike(particles: ParticleSystem, center: Vector3, chest: Vector3): SpellVisual {
  const pieces = kit();
  const shine = glow(GOLD, 0.8);
  const shade = scorch(INK, 0.35);
  const root = new Group();
  const high = new Mesh(pieces.ring, shine);
  const low = new Mesh(pieces.rim, shade);
  root.position.set(center.x, 0, center.z);
  high.position.y = chest.y;
  low.position.y = 0.2;
  root.add(high, low);
  particles.emit({ ...GOLD_MOTES, speed: [6, 12], life: [0.25, 0.45] }, chest, UP, 6);
  let age = 0;

  return {
    root,

    update(deltaSeconds) {
      age += deltaSeconds;
      const t = clamp01(age / STRIKE_SECONDS);
      high.scale.setScalar(1.5 + 4.5 * easeOut(t));
      low.scale.setScalar(2 + 4 * easeOut(t));
      shine.opacity = 0.8 * (1 - t);
      shade.opacity = 0.35 * (1 - t);
    },

    finished() {
      return age >= STRIKE_SECONDS;
    },

    dispose() {
      retire(root, [shine, shade]);
    },
  };
}

export function sealStamp(particles: ParticleSystem, center: Vector3, chest: Vector3): SpellVisual {
  const pieces = kit();
  const next = random(center.x * 3.1 + center.z * 7.7);

  const block = solid(effectMaterials.fadingSolid, {
    color: VERMILION,
    roughness: 0.45,
    emissive: VERMILION_DEEP,
    emissiveIntensity: 0.5,
  });

  const ink = scorch(VERMILION, 0);
  const shock = scorch(GOLD, 0);
  const root = new Group();
  const press = new Mesh(pieces.stamp, block);
  const imprint = new Mesh(pieces.crest, ink);
  const ring = new Mesh(pieces.ring, shock);
  const height = chest.y + 6;
  root.position.set(center.x, 0, center.z);
  root.rotation.y = next() * Math.PI * 2;
  imprint.position.y = 0.14;
  imprint.scale.setScalar(SEAL_RADIUS);
  ring.position.y = 0.3;
  root.add(imprint, ring, press);
  const ground = new Vector3(center.x, 0.6, center.z);
  let age = 0;
  let landed = false;

  return {
    root,

    update(deltaSeconds) {
      age += deltaSeconds;

      if (age < SEAL_DROP) {
        press.position.y = height * (1 - easeIn(age / SEAL_DROP));
        press.scale.set(SEAL_RADIUS, SEAL_RADIUS * SEAL_SQUAT, SEAL_RADIUS);

        return;
      }

      if (!landed) {
        landed = true;
        particles.emit(SEAL_DUST, ground, UP, 9);
        particles.emit({ ...GOLD_MOTES, speed: [8, 16], life: [0.3, 0.6], cone: 1.3 }, ground, UP, 12);
      }

      const after = age - SEAL_DROP;
      const lift = clamp01(after / SEAL_LIFT);
      const squash = 1 - lift;
      press.position.y = 0.1 + 5 * easeIn(lift);
      press.scale.set(
        SEAL_RADIUS * (1 + 0.1 * squash),
        SEAL_RADIUS * SEAL_SQUAT * (1 - 0.45 * squash),
        SEAL_RADIUS * (1 + 0.1 * squash),
      );
      press.visible = lift < 1;
      block.opacity = 1 - lift;
      ink.opacity = 0.9 * (1 - clamp01((age - 0.45) / (SEAL_SECONDS - 0.45)));
      const wave = clamp01(after / 0.4);
      ring.scale.setScalar(SEAL_RADIUS * (1 + 1.2 * easeOut(wave)));
      shock.opacity = 0.85 * (1 - wave);
    },

    finished() {
      return age >= SEAL_SECONDS;
    },

    dispose() {
      retire(root, [block, ink, shock]);
    },
  };
}

export function lotusBloom(particles: ParticleSystem, center: Vector3, chest: Vector3): SpellVisual {
  const pieces = kit();

  const outer = solid(effectMaterials.fadingSolid, {
    color: ROSE,
    roughness: 0.55,
    emissive: ROSE_GLOW,
    emissiveIntensity: 0.3,
  });

  const inner = solid(effectMaterials.fadingSolid, {
    color: HONEY,
    roughness: 0.5,
    emissive: GOLD_DEEP,
    emissiveIntensity: 0.5,
  });

  const pool = scorch(GOLD, 0.35);
  const root = new Group();
  const bloom = new Group();
  const disc = new Mesh(pieces.disc, pool);
  const petals: Petal[] = [];
  const crown = chest.y / CHEST_FRACTION + LOTUS_LIFT;
  root.position.set(center.x, 0, center.z);
  disc.position.y = 0.2;
  disc.scale.setScalar(LOTUS_POOL);
  bloom.position.y = crown;
  root.add(disc, bloom);

  const addPetals = (
    count: number,
    surface: MeshStandardMaterial,
    length: number,
    open: number,
    offset: number,
  ): void => {
    for (let index = 0; index < count; index += 1) {
      const pivot = new Group();
      const mesh = new Mesh(pieces.petal, surface);
      pivot.rotation.y = ((index + offset) / count) * Math.PI * 2;
      mesh.scale.set(length * 0.55, length * 0.6, length);
      pivot.add(mesh);
      bloom.add(pivot);
      petals.push({ mesh, open });
    }
  };

  addPetals(LOTUS_PETALS, outer, 3.2, 0.45, 0);
  addPetals(LOTUS_INNER, inner, 2.1, 0.95, 0.5);
  particles.emit(GOLD_MOTES, chest.clone().setY(crown), UP, 16);
  let age = 0;

  return {
    root,

    update(deltaSeconds) {
      age += deltaSeconds;
      const open = easeOutBack(age / LOTUS_OPEN);
      const fade = clamp01((age - 0.6) / (LOTUS_SECONDS - 0.6));

      for (const petal of petals) {
        petal.mesh.rotation.x = -(1.35 + (petal.open - 1.35) * open) - 0.25 * fade;
      }

      bloom.position.y = crown + LOTUS_DRIFT * easeIn(fade);
      bloom.rotation.y = age * 0.6;
      outer.opacity = 1 - fade;
      inner.opacity = 1 - fade;
      pool.opacity = 0.35 * (1 - clamp01(age / LOTUS_SECONDS));
    },

    finished() {
      return age >= LOTUS_SECONDS;
    },

    dispose() {
      retire(root, [outer, inner, pool]);
    },
  };
}

export function hallowedBoundary(
  particles: ParticleSystem,
  center: Vector3,
  radius: number,
  seed: number,
  periodTicks: number,
): TickedVisual {
  const pieces = kit();
  const next = random(seed * 131 + 7);
  const reach = Math.max(4, Math.round(radius));
  const tether = boundary(reach);

  const straw = solid(effectMaterials.fadingSolid, {
    color: STRAW,
    roughness: 0.92,
    emissive: GOLD_DEEP,
    emissiveIntensity: 0.2,
  });

  const paper = solid(effectMaterials.fadingSolid, {
    color: PAPER,
    roughness: 0.8,
    emissive: GOLD_PALE,
    emissiveIntensity: 0.18,
  });

  const ground = scorch(GOLD, 0);
  const sigil = scorch(GOLD, 0);
  const ripple = scorch(GOLD, 0);
  const root = new Group();
  const hanging = new Group();
  const floor = new Mesh(pieces.disc, ground);
  const mon = new Mesh(pieces.crest, sigil);
  const wave = new Mesh(pieces.rim, ripple);
  root.position.set(center.x, 0, center.z);
  root.rotation.y = next() * Math.PI * 2;
  floor.position.y = 0.12;
  floor.scale.setScalar(reach);
  mon.position.y = 0.16;
  mon.scale.setScalar(reach * 0.7);
  wave.position.y = 0.3;
  hanging.add(new Mesh(tether.rope, straw), new Mesh(tether.shide, paper));
  root.add(floor, mon, wave, hanging);
  const lift = new Vector3();
  const period = Math.max(1, periodTicks);
  let lastPulse: number | null = null;
  let pulseAge = Number.POSITIVE_INFINITY;
  let strength = 0;
  let ending = false;
  let age = 0;

  function pulse(): void {
    pulseAge = 0;

    for (let mote = 0; mote < 5; mote += 1) {
      const angle = next() * Math.PI * 2;
      const distance = Math.sqrt(next()) * reach * 0.85;
      lift.set(center.x + Math.cos(angle) * distance, 0.5, center.z + Math.sin(angle) * distance);
      particles.emit(GOLD_MOTES, lift, UP, 2);
    }
  }

  return {
    root,

    sync(tick) {
      if (ending || (lastPulse !== null && tick - lastPulse < period)) {
        return;
      }

      lastPulse = lastPulse === null ? tick : lastPulse + period * Math.floor((tick - lastPulse) / period);
      pulse();
    },

    update(deltaSeconds) {
      age += deltaSeconds;
      pulseAge += deltaSeconds;
      strength = ending
        ? Math.max(0, strength - deltaSeconds / ROPE_FADE_SECONDS)
        : Math.min(1, strength + deltaSeconds / ROPE_ARRIVE_SECONDS);
      const arrive = easeOutBack(age / ROPE_ARRIVE_SECONDS);
      const kick = pulseAge < 0.35 ? Math.sin((pulseAge / 0.35) * Math.PI) : 0;
      const spread = 0.35 + 0.65 * arrive;
      hanging.scale.set(spread, 1, spread);
      hanging.position.y =
        ROPE_HEIGHT +
        3 * (1 - clamp01(age / ROPE_ARRIVE_SECONDS)) +
        0.12 * Math.sin(age * 2.3) +
        0.25 * kick +
        (ending ? 2 * (1 - strength) : 0);
      hanging.rotation.y = 0.05 * Math.sin(age * 0.9);
      straw.opacity = strength;
      paper.opacity = strength;
      const ripple01 = clamp01(pulseAge / RIPPLE_SECONDS);
      ground.opacity = (0.24 + 0.12 * (1 - ripple01)) * strength;
      sigil.opacity = (0.45 + 0.35 * (1 - ripple01)) * strength;
      mon.rotation.y = age * 0.35;
      wave.scale.setScalar(reach * (0.2 + 0.8 * easeOut(ripple01)));
      ripple.opacity = 0.75 * (1 - ripple01) * strength;
    },

    end() {
      ending = true;
    },

    finished() {
      return ending && strength <= 0;
    },

    dispose() {
      retire(root, [straw, paper, ground, sigil, ripple]);
    },
  };
}

export function bellToll(particles: ParticleSystem, center: Vector3, _radius: number, origin: Vector3): SpellVisual {
  const pieces = kit();
  const root = new Group();
  const rings: Mesh[] = [];
  const shines: MeshBasicMaterial[] = [];
  const shades: MeshBasicMaterial[] = [];
  const flare = glow(GOLD_PALE, 0.9);
  const star = new Mesh(pieces.sphere, flare);
  const height = Math.max(TOLL_HEIGHT, origin.y + 2);
  const peal = new Vector3(center.x, height, center.z);
  root.position.set(center.x, 0, center.z);
  star.position.y = height;
  root.add(star);

  for (let ring = 0; ring < TOLL_RINGS; ring += 1) {
    const shine = glow(GOLD, 0);
    const shade = scorch(INK, 0);
    const bright = new Mesh(pieces.ring, shine);
    const dark = new Mesh(pieces.rim, shade);
    bright.position.y = height;
    dark.position.y = height - 0.05;
    root.add(bright, dark);
    rings.push(bright, dark);
    shines.push(shine);
    shades.push(shade);
  }

  particles.emit(PAPER_FLECKS, peal, UP, 14);
  particles.emit({ ...GOLD_MOTES, speed: [8, 14], cone: 1.5 }, peal, UP, 16);
  let age = 0;

  return {
    root,

    update(deltaSeconds) {
      age += deltaSeconds;

      for (let ring = 0; ring < TOLL_RINGS; ring += 1) {
        const local = clamp01((age - ring * 0.16) / 0.62);
        const scale = 2 + 16 * easeOut(local);
        rings[ring * 2]?.scale.setScalar(scale);
        rings[ring * 2 + 1]?.scale.setScalar(scale);
        const shine = shines[ring];
        const shade = shades[ring];

        if (shine !== undefined && shade !== undefined) {
          shine.opacity = local > 0 ? 0.85 * (1 - local) : 0;
          shade.opacity = local > 0 ? 0.4 * (1 - local) : 0;
        }
      }

      star.scale.setScalar(3.5 * (1 - clamp01(age / 0.5)) + 0.01);
      flare.opacity = 0.9 * (1 - clamp01(age / 0.5));
    },

    finished() {
      return age >= TOLL_SECONDS;
    },

    dispose() {
      retire(root, [flare, ...shines, ...shades]);
    },
  };
}

export function toriiRising(particles: ParticleSystem, center: Vector3, radius: number): SpellVisual {
  const pieces = kit();
  const reach = Math.max(8, radius);

  const lacquer = solid(effectMaterials.fadingSolid, {
    color: VERMILION,
    roughness: 0.4,
    emissive: VERMILION_DEEP,
    emissiveIntensity: 0.6,
  });

  const cap = solid(effectMaterials.fadingSolid, {
    color: LACQUER,
    roughness: 0.35,
    emissive: GOLD_DEEP,
    emissiveIntensity: 0.25,
  });

  const light = glow(DAWN, 0);
  const heart = veil(GOLD_PALE, 0);
  const inkRing = scorch(INK, 0);
  const goldRing = scorch(GOLD, 0);
  const root = new Group();
  const gate = new Group();
  const beam = new Mesh(pieces.beam, light);
  const core = new Mesh(pieces.beam, heart);
  const shadow = new Mesh(pieces.rim, inkRing);
  const shock = new Mesh(pieces.ring, goldRing);
  root.position.set(center.x, 0, center.z);
  gate.add(new Mesh(pieces.toriiRed, lacquer), new Mesh(pieces.toriiTop, cap));
  beam.scale.set(3.6, 34, 3.6);
  core.scale.set(1.6, 34, 1.6);
  shadow.position.y = 0.2;
  shock.position.y = 0.3;
  root.add(gate, beam, core, shadow, shock);
  const ground = new Vector3(center.x, 1, center.z);
  particles.emit({ ...SEAL_DUST, speed: [8, 16] }, ground, UP, 12);
  particles.emit(PAPER_SCRAPS, ground.clone().setY(3), UP, 18);
  particles.emit({ ...GOLD_MOTES, speed: [6, 14], life: [0.9, 1.5] }, ground, UP, 24);
  let age = 0;

  return {
    root,

    update(deltaSeconds) {
      age += deltaSeconds;
      const rise = easeOutBack(age / TORII_RISE);
      const fade = clamp01((age - TORII_FADE) / (TORII_SECONDS - TORII_FADE));
      gate.position.y = -TORII_HEIGHT * (1 - rise) + 2 * easeIn(fade);
      gate.scale.set(TORII_WIDTH * (1 - 0.15 * fade), TORII_HEIGHT * (1 + 0.2 * fade), TORII_WIDTH);
      lacquer.opacity = 1 - fade;
      cap.opacity = 1 - fade;
      const shine = clamp01(age / 0.15) * (1 - clamp01((age - 0.7) / 0.7));
      light.opacity = 0.45 * shine;
      heart.opacity = 0.35 * shine;
      const wave = clamp01((age - 0.08) / 0.35);
      const fall = 1 - clamp01((age - 0.45) / (SHOCK_SECONDS - 0.45));
      shadow.scale.setScalar(Math.max(0.01, reach * 1.03 * easeOut(wave)));
      shock.scale.setScalar(Math.max(0.01, reach * easeOut(wave)));
      inkRing.opacity = wave > 0 ? 0.6 * fall : 0;
      goldRing.opacity = wave > 0 ? 0.8 * fall : 0;
    },

    finished() {
      return age >= TORII_SECONDS;
    },

    dispose() {
      retire(root, [lacquer, cap, light, heart, inkRing, goldRing]);
    },
  };
}

export function sanctuaryVisual(particles: ParticleSystem, center: Vector3, height: number): TickedVisual {
  const pieces = kit();
  const next = random(center.x * 5.3 + center.z * 1.9);
  const girth = Math.max(4.5, height * 0.62);
  const tall = Math.max(6, height * 1.2);

  const shell = solid(effectMaterials.fadingSolid, {
    color: AMBER,
    roughness: 0.35,
    metalness: 0.3,
    emissive: GOLD,
    emissiveIntensity: 0.3,
    opacity: 0.72,
  });

  const haze = glow(GOLD_PALE, 0);
  const base = glow(GOLD, 0);
  const root = new Group();
  const dome = new Mesh(pieces.dome, shell);
  const bubble = new Mesh(pieces.sphere, haze);
  const ring = new Mesh(pieces.ring, base);
  const shards: Shard[] = [];
  root.position.set(center.x, 0, center.z);
  ring.position.y = 0.3;
  root.add(ring, bubble, dome);
  particles.emit({ ...GOLD_MOTES, spread: girth * 0.6 }, new Vector3(center.x, 1, center.z), UP, 10);
  let age = 0;
  let broken = -1;

  function shatter(): void {
    broken = 0;
    particles.emit(
      { ...GOLD_MOTES, speed: [6, 12], cone: 1.4 },
      new Vector3(root.position.x, tall * 0.6, root.position.z),
      UP,
      14,
    );

    for (let index = 0; index < DOME_SHARDS; index += 1) {
      const angle = (index / DOME_SHARDS) * Math.PI * 2 + next() * 0.4;
      const rise = 0.25 + next() * 0.6;
      const mesh = new Mesh(pieces.hex, shell);
      const outward = new Vector3(Math.cos(angle), 0, Math.sin(angle));
      mesh.position
        .copy(outward)
        .multiplyScalar(girth * Math.cos(rise))
        .setY(tall * Math.sin(rise));
      mesh.quaternion.setFromUnitVectors(UP, outward.clone().setY(Math.sin(rise)).normalize());
      root.add(mesh);
      shards.push({
        mesh,
        velocity: outward.multiplyScalar(9 + next() * 6).setY(6 + next() * 6),
        spin: new Vector3(next() * 9, 0, next() * 9),
      });
    }
  }

  return {
    root,

    sync() {
      return;
    },

    update(deltaSeconds) {
      age += deltaSeconds;
      const rise = easeOutBack(age / DOME_ASSEMBLE);
      const spread = 0.7 + 0.3 * rise;
      const flash = 1 - clamp01(age / 0.45);
      ring.scale.setScalar(girth * (0.8 + 0.5 * easeOut(age / 0.45)));
      base.opacity = 0.7 * flash;

      if (broken < 0) {
        dome.scale.set(girth * spread, Math.max(0.01, tall * rise), girth * spread);
        bubble.scale.set(girth * 0.95, Math.max(0.01, tall * 0.95 * rise), girth * 0.95);
        haze.opacity = 0.14 * clamp01(age / DOME_ASSEMBLE);
        shell.emissiveIntensity = 0.3 + 0.1 * Math.sin(age * 6) + 0.6 * flash;

        return;
      }

      broken += deltaSeconds;
      const after = clamp01(broken / DOME_SHATTER);
      dome.scale.set(girth * (1 + 0.3 * after), tall * (1 + 0.15 * after), girth * (1 + 0.3 * after));
      shell.opacity = 0.72 * (1 - after);
      haze.opacity = 0.14 * (1 - after);

      for (const shard of shards) {
        shard.velocity.y -= 30 * deltaSeconds;
        shard.mesh.position.addScaledVector(shard.velocity, deltaSeconds);
        shard.mesh.rotation.x += shard.spin.x * deltaSeconds;
        shard.mesh.rotation.z += shard.spin.z * deltaSeconds;
      }
    },

    end() {
      if (broken < 0) {
        shatter();
      }
    },

    finished() {
      return broken >= DOME_SHATTER;
    },

    dispose() {
      retire(root, [shell, haze, base]);
    },
  };
}

export function dawnAscendant(particles: ParticleSystem, center: Vector3, radius: number): SpellVisual {
  const pieces = kit();
  const reach = Math.max(12, radius * 1.4);

  const face = solid(effectMaterials.fadingSolid, {
    color: GOLD,
    roughness: 0.35,
    metalness: 0.4,
    emissive: DAWN,
    emissiveIntensity: 0.45,
  });

  const rays = scorch(GOLD, 0);
  const band = scorch(GOLD, 0);
  const root = new Group();
  const sun = new Mesh(pieces.sun, face);
  const burst = new Mesh(pieces.burst, rays);
  const ring = new Mesh(pieces.ring, band);
  const behind = new Vector3();
  root.position.set(center.x, 0, center.z);
  burst.position.y = 0.15;
  ring.position.y = 0.3;
  sun.position.y = SUN_LOW;
  root.add(burst, ring, sun);
  particles.emit(DAWN_EMBERS, new Vector3(center.x, 2, center.z), UP, 30);
  let age = 0;

  sun.onBeforeRender = (_renderer, _scene, camera) => {
    camera.getWorldDirection(behind).setY(0);

    if (behind.lengthSq() < 1e-6) {
      behind.set(0, 0, -1);
    }

    behind.normalize().multiplyScalar(SUN_BEHIND);
    sun.position.set(behind.x, sun.position.y, behind.z);
    sun.quaternion.copy(camera.quaternion);
    sun.rotateZ(age * 0.8);
    sun.updateMatrixWorld();
  };

  return {
    root,

    update(deltaSeconds) {
      age += deltaSeconds;
      const rise = easeOut(age / 0.6);
      const fade = clamp01((age - DAWN_FADE) / (DAWN_SECONDS - DAWN_FADE));
      sun.scale.setScalar(SUN_SIZE * (0.6 + 0.4 * rise));
      sun.position.y = SUN_LOW + (SUN_HIGH - SUN_LOW) * rise;
      face.opacity = 1 - fade;
      burst.scale.setScalar(reach * (0.5 + 0.5 * rise));
      burst.rotation.y = age * 0.4;
      rays.opacity = 0.55 * rise * (1 - fade);
      const wave = clamp01(age / 0.5);
      ring.scale.setScalar(Math.max(0.01, reach * easeOut(wave)));
      band.opacity = 0.7 * (1 - wave);
    },

    finished() {
      return age >= DAWN_SECONDS;
    },

    dispose() {
      retire(root, [face, rays, band]);
    },
  };
}

export function graceBurst(particles: ParticleSystem, center: Vector3, radius: number): SpellVisual {
  const pieces = kit();
  const next = random(center.x * 2.3 + center.z * 4.1);
  const reach = Math.max(6, radius);

  const tiles = solid(effectMaterials.fadingSolid, {
    color: HONEY,
    roughness: 0.35,
    metalness: 0.3,
    emissive: GOLD,
    emissiveIntensity: 0.6,
  });

  const band = scorch(GOLD, 0.85);
  const shade = scorch(INK, 0.45);
  const root = new Group();
  const ring = new Mesh(pieces.ring, band);
  const edge = new Mesh(pieces.rim, shade);
  const shards: Shard[] = [];
  root.position.set(center.x, 0, center.z);
  ring.position.y = 0.3;
  edge.position.y = 0.2;
  root.add(ring, edge);

  for (let index = 0; index < GRACE_SHARDS; index += 1) {
    const angle = (index / GRACE_SHARDS) * Math.PI * 2 + next() * 0.3;
    const mesh = new Mesh(pieces.hex, tiles);
    mesh.position.set(Math.cos(angle) * 2, 5, Math.sin(angle) * 2);
    mesh.scale.set(1.6, 1.8, 1.6);
    root.add(mesh);
    shards.push({
      mesh,
      velocity: new Vector3(Math.cos(angle) * reach * 1.3, 8 + next() * 6, Math.sin(angle) * reach * 1.3),
      spin: new Vector3(next() * 9, 0, next() * 9),
    });
  }

  particles.emit({ ...GOLD_MOTES, speed: [10, 18], cone: 1.5 }, new Vector3(center.x, 4, center.z), UP, 20);
  let age = 0;

  return {
    root,

    update(deltaSeconds) {
      age += deltaSeconds;
      const t = clamp01(age / GRACE_SECONDS);
      const wave = easeOut(age / 0.4);
      ring.scale.setScalar(Math.max(0.01, reach * wave));
      edge.scale.setScalar(Math.max(0.01, reach * wave));
      band.opacity = 0.85 * (1 - t);
      shade.opacity = 0.45 * (1 - t);
      tiles.opacity = 1 - t;

      for (const shard of shards) {
        shard.velocity.y -= 34 * deltaSeconds;
        shard.mesh.position.addScaledVector(shard.velocity, deltaSeconds);
        shard.mesh.position.y = Math.max(0.3, shard.mesh.position.y);
        shard.mesh.rotation.x += shard.spin.x * deltaSeconds;
        shard.mesh.rotation.z += shard.spin.z * deltaSeconds;
      }
    },

    finished() {
      return age >= GRACE_SECONDS;
    },

    dispose() {
      retire(root, [tiles, band, shade]);
    },
  };
}
