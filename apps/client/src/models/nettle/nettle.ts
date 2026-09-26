import {
  Color,
  Float32BufferAttribute,
  Group,
  IcosahedronGeometry,
  Mesh,
  MeshStandardMaterial,
  Object3D,
  SphereGeometry,
  TorusGeometry,
  Vector2,
  Vector3,
  type BufferGeometry,
  type Material,
  type MeshDepthMaterial,
} from "three";
import {
  createLeafMaterial,
  frondCards,
  leafCards,
  type Frond,
  type LeafClump,
  type LeafPalette,
} from "../sculpt/foliage.js";
import { fbm, seededRandom } from "../sculpt/noise.js";
import { paintSurface, partBounds, roughen, type Paint } from "../sculpt/paint.js";
import { disc, dome, lathe, merge, paintVertices, placed } from "../sculpt/props.js";
import {
  bundle,
  bundleShade,
  mergeTextured,
  paintBark,
  tube,
  type BarkPaint,
  type Mossy,
  type Shade,
  type TubeOptions,
} from "../sculpt/strands.js";
import { barkTextures } from "../sculpt/texture.js";
import { ellipsoid, localField, taper, type Part, type PartStyle } from "../vesper/sdf.js";
import { meshField, type DistanceField } from "../vesper/surface-nets.js";

export interface Nettle {
  readonly root: Group;
  readonly height: number;
  readonly body: Group;
  readonly head: Group;
  readonly crown: Group;
  readonly shoulders: readonly [Group, Group];
  readonly elbows: readonly [Group, Group];
  readonly hips: readonly [Group, Group];
  readonly tea: Object3D;
  readonly thorn: Object3D;
  readonly surfaces: readonly MeshStandardMaterial[];
  readonly triangles: number;
  setFlash(amount: number): void;
  setGlow(amount: number): void;
  setCastsShadow(castsShadow: boolean): void;
  update(deltaSeconds: number): void;
  dispose(): void;
}

interface Piece {
  readonly wood: BufferGeometry;
  readonly props: BufferGeometry | null;
}

interface NettleGeometry {
  readonly trunk: Piece;
  readonly roots: readonly [Piece, Piece];
  readonly upperArms: readonly [Piece, Piece];
  readonly forearms: readonly [Piece, Piece];
  readonly head: BufferGeometry;
  readonly crown: Piece;
  readonly leaves: BufferGeometry;
  readonly porcelain: BufferGeometry;
  readonly eyes: BufferGeometry;
  readonly teaSurface: BufferGeometry;
}

interface Crown {
  readonly piece: Piece;
  readonly leaves: BufferGeometry;
}

interface Root {
  readonly angle: number;
  readonly reach: number;
  readonly thick: number;
}

interface Hand {
  readonly center: Vector3;
  readonly back: Vector3;
  readonly fingers: readonly (readonly [number, number, number])[];
  readonly thumb: readonly [number, number, number];
  readonly curl: number;
  readonly thickness: number;
}

const BARK = 0;

const FACE = 1;

const HEIGHT = 3.9;

const SEED = 29;

const HEAD_STEP = 0.02;

const HEAD_CELL = 0.1;

const HEAD_REACH = 0.18;

const SEGMENT = 0.045;

const BARK_REPEAT = 1.7;

const NORMAL_STRENGTH = 1.1;

const HEAD_GRAIN_U = 4.5;

const HEAD_GRAIN_V = 1.7;

const FACE_NORMAL = 0.75;

const HEAD_AXIS_Z = 0.3;

const FACE_GRAIN = 0.008;

const GRAIN = new Vector3(3, 14, 3);

const HEAD_TILT = 0.3;

const BODY_PIVOT = new Vector3(0, 0.7, 0);

const LEFT_HIP = new Vector3(0.16, 0.9, 0);

const RIGHT_HIP = new Vector3(-0.16, 0.9, 0);

const LEFT_SHOULDER = new Vector3(0.34, 2.12, 0.16);

const RIGHT_SHOULDER = new Vector3(-0.34, 2.12, 0.16);

const LEFT_ELBOW = new Vector3(0.6, 1.68, 0.3);

const RIGHT_ELBOW = new Vector3(-0.7, 1.74, 0.22);

const CUP_HAND = new Vector3(0.42, 1.82, 0.66);

const OPEN_HAND = new Vector3(-0.88, 1.5, 0.48);

const NECK = new Vector3(0, 2.34, 0.28);

const CROWN_PIVOT = new Vector3(0, 2.95, 0.1);

const CROWN_CENTER = new Vector3(0, 3.08, 0.04);

const EYE = new Vector3(0.105, 2.66, 0.585);

const CUP_AT = CUP_HAND.clone().add(new Vector3(-0.01, 0.07, 0.03));

const CUP_TILT = new Vector3(0, 1, 0.12);

const TEA_LEVEL = 0.024 + 0.105;

const TORSO = [
  new Vector3(0, 0.72, -0.04),
  new Vector3(0, 1.18, 0),
  new Vector3(0, 1.62, 0.06),
  new Vector3(0, 2.0, 0.15),
  new Vector3(0, 2.3, 0.26),
];

const NECK_LINE = [new Vector3(0, 2.14, 0.2), new Vector3(0, 2.4, 0.3), new Vector3(0, 2.58, 0.34)];

const ROOTS: readonly Root[] = [
  { angle: 36, reach: 1.0, thick: 1.3 },
  { angle: -36, reach: 1.0, thick: 1.3 },
  { angle: 124, reach: 0.92, thick: 1.15 },
  { angle: -124, reach: 0.92, thick: 1.15 },
];

const BACK_ROOT: Root = { angle: 180, reach: 0.84, thick: 1.05 };

const CUP_GRIP: Hand = {
  center: CUP_HAND,
  back: new Vector3(0.1, -1, -0.15),
  fingers: [
    [-0.058, -0.55, 0.25],
    [-0.019, -0.18, 0.27],
    [0.022, 0.18, 0.26],
    [0.062, 0.55, 0.23],
  ],
  thumb: [0.085, 1.25, 0.19],
  curl: 1.05,
  thickness: 0.032,
};

const THORN_GRIP: Hand = {
  center: OPEN_HAND,
  back: new Vector3(-0.35, 0.82, 0.45),
  fingers: [
    [-0.06, -0.55, 0.26],
    [-0.02, -0.18, 0.3],
    [0.021, 0.16, 0.29],
    [0.062, 0.5, 0.25],
  ],
  thumb: [-0.085, -1.3, 0.2],
  curl: 0.85,
  thickness: 0.034,
};

const BARK_PAINT: BarkPaint = {
  base: new Color("#8c7050"),
  light: new Color("#b09372"),
  moss: new Color("#56721f"),
  mossLight: new Color("#a9c54c"),
};

const HEAD_PAINTS: readonly Paint[] = [
  {
    base: new Color("#8c7050"),
    wash: new Color("#2a1d12"),
    highlight: new Color("#c9ad84"),
    patch: new Color("#5f7c22"),
  },
  { base: new Color("#9a7650"), wash: new Color("#26160a"), highlight: new Color("#d6b27e") },
];

const LEAVES: LeafPalette = {
  deep: new Color("#17300f"),
  mid: new Color("#5a8c2a"),
  tip: new Color("#d2e468"),
};

const CROWN_CORE = new Color("#1d3514");

const CORE_SCALE = 0.72;

const CLUMPS: readonly LeafClump[] = [
  { center: new Vector3(0, 3.3, 0.18), radii: new Vector3(0.44, 0.3, 0.4), cards: 73, size: 0.442 },
  { center: new Vector3(0, 3.22, -0.14), radii: new Vector3(0.46, 0.34, 0.36), cards: 73, size: 0.442 },
  { center: new Vector3(0.38, 3.12, 0.1), radii: new Vector3(0.3, 0.3, 0.34), cards: 52, size: 0.412 },
  { center: new Vector3(-0.38, 3.12, 0.1), radii: new Vector3(0.3, 0.3, 0.34), cards: 52, size: 0.412 },
  { center: new Vector3(0.45, 2.8, 0.02), radii: new Vector3(0.22, 0.34, 0.28), cards: 44, size: 0.383 },
  { center: new Vector3(-0.45, 2.8, 0.02), radii: new Vector3(0.22, 0.34, 0.28), cards: 44, size: 0.383 },
  { center: new Vector3(0, 2.82, -0.26), radii: new Vector3(0.42, 0.36, 0.26), cards: 58, size: 0.412 },
  { center: new Vector3(0, 3.1, 0.44), radii: new Vector3(0.34, 0.15, 0.16), cards: 32, size: 0.324 },
  { center: new Vector3(0.06, 3.58, 0.02), radii: new Vector3(0.3, 0.2, 0.3), cards: 42, size: 0.383 },
  { center: new Vector3(0.3, 2.62, -0.16), radii: new Vector3(0.22, 0.26, 0.2), cards: 32, size: 0.353 },
  { center: new Vector3(-0.3, 2.62, -0.16), radii: new Vector3(0.22, 0.26, 0.2), cards: 32, size: 0.353 },
];

const FRONDS: readonly Frond[] = [
  { at: new Vector3(0.52, 2.76, 0.12), outward: new Vector3(1, 0, 0.3), length: 0.62, width: 0.17 },
  { at: new Vector3(-0.52, 2.76, 0.12), outward: new Vector3(-1, 0, 0.3), length: 0.7, width: 0.17 },
  { at: new Vector3(0.44, 2.6, -0.12), outward: new Vector3(0.8, 0, -0.5), length: 0.55, width: 0.15 },
  { at: new Vector3(-0.44, 2.62, -0.14), outward: new Vector3(-0.8, 0, -0.5), length: 0.6, width: 0.15 },
  { at: new Vector3(0.16, 2.62, -0.36), outward: new Vector3(0.3, 0, -1), length: 0.5, width: 0.15 },
  { at: new Vector3(-0.2, 2.64, -0.36), outward: new Vector3(-0.3, 0, -1), length: 0.58, width: 0.15 },
];

const FLOWERS: readonly (readonly [number, Vector3, number])[] = [
  [0, new Vector3(0.3, 0.9, 0.35), 1.5],
  [0, new Vector3(-0.45, 0.85, 0.2), 1.35],
  [0, new Vector3(0.05, 0.75, 0.66), 1.45],
  [2, new Vector3(0.7, 0.5, 0.5), 1.4],
  [3, new Vector3(-0.75, 0.45, 0.45), 1.55],
  [3, new Vector3(-0.5, 0.8, -0.3), 1.3],
  [1, new Vector3(0.4, 0.8, -0.45), 1.35],
  [7, new Vector3(0.62, 0.3, 0.72), 1.2],
  [8, new Vector3(0, 1, 0.1), 1.4],
];

const CUP_PROFILE: readonly (readonly [number, number])[] = [
  [0, 0],
  [0.062, 0],
  [0.07, 0.015],
  [0.105, 0.045],
  [0.13, 0.09],
  [0.14, 0.13],
  [0.128, 0.13],
  [0.118, 0.092],
  [0.095, 0.055],
  [0, 0.045],
];

const SAUCER_PROFILE: readonly (readonly [number, number])[] = [
  [0, 0],
  [0.09, 0],
  [0.1, 0.012],
  [0.19, 0.032],
  [0.215, 0.05],
  [0.205, 0.052],
  [0.18, 0.04],
  [0.1, 0.024],
  [0, 0.024],
];

const PETAL_BASE = new Color("#7f9c3c");

const PETAL = new Color("#dfe7b3");

const PETAL_TIP = new Color("#f6f3dc");

const STAMEN = new Color("#d4c43c");

const CARPEL = new Color("#6f8f2c");

const FUNGUS = new Color("#8f6a45");

const FUNGUS_RING = new Color("#6e4f32");

const FUNGUS_EDGE = new Color("#d6bf93");

const FUNGUS_GILLS = new Color("#efe5cb");

const PORCELAIN = new Color("#f3efe4");

const GLAZE = new Color("#5c9a88");

const GLOW = new Color("#c8ff5a");

const GLOW_EMISSIVE = new Color("#8dff2a");

const GLOW_INTENSITY = 2.4;

const FLASH = new Color("#fff4dc");

const UP = new Vector3(0, 1, 0);

const SIDE = new Vector3(1, 0, 0);

const FORWARD = new Vector3(0, 0, 1);

let cached: NettleGeometry | null = null;

function v(x: number, y: number, z: number): Vector3 {
  return new Vector3(x, y, z);
}

function smooth(from: number, to: number, value: number): number {
  const t = Math.min(1, Math.max(0, (value - from) / (to - from)));

  return t * t * (3 - 2 * t);
}

function style(group: number, blend: number, carve = false): PartStyle {
  return { group, blend, carve };
}

function heading(degrees: number): Vector3 {
  const radians = (degrees * Math.PI) / 180;

  return v(Math.sin(radians), 0, Math.cos(radians));
}

function profile(stops: readonly (readonly [number, number])[]): (t: number) => number {
  return (t) => {
    if (t <= stops[0][0]) {
      return stops[0][1];
    }

    for (let index = 1; index < stops.length; index += 1) {
      const [end, to] = stops[index];

      if (t <= end) {
        const [start, from] = stops[index - 1];
        const s = (t - start) / (end - start);

        return from + (to - from) * s * s * (3 - 2 * s);
      }
    }

    return stops[stops.length - 1][1];
  };
}

function span(path: readonly Vector3[]): number {
  let length = 0;

  for (let index = 1; index < path.length; index += 1) {
    length += path[index].distanceTo(path[index - 1]);
  }

  return length;
}

const noMoss: Mossy = () => 0;

const plain: Shade = () => 1;

function patches(seed: number, amount: number, low: number): Mossy {
  return (point, normal) => {
    const patch = fbm(point.x * 3.1 + 5, point.y * 3.1, point.z * 3.1, seed, 3);
    const up = smooth(0.1, 0.75, normal.y);
    const ground = low > 0 ? 1 - smooth(low * 0.35, low, point.y) : 0;

    return Math.max(0, (patch - (0.6 - 0.22 * ground)) * 4.5) * Math.max(up, ground * 0.75) * amount;
  };
}

const rootShade: Shade = (point) => 0.58 + 0.42 * smooth(0, 0.42, point.y);

function wood(
  path: readonly Vector3[],
  radius: (t: number) => number,
  seed: number,
  shade: Shade,
  mossy: Mossy,
  options: Partial<TubeOptions> = {},
): BufferGeometry {
  const geometry = tube(path, {
    radius,
    sides: 8,
    segments: Math.min(40, Math.max(6, Math.round(span(path) / SEGMENT))),
    lumps: 0.1,
    seed,
    reference: FORWARD,
    turns: 1,
    repeat: BARK_REPEAT,
    ...options,
  });

  return paintBark(geometry, BARK_PAINT, shade, mossy, seed);
}

function strandBundle(
  center: readonly Vector3[],
  radius: (t: number) => number,
  count: number,
  twist: number,
  seed: number,
  mossy: Mossy,
  reference: Vector3,
  oval: readonly [number, number] = [1, 1],
): BufferGeometry[] {
  const random = seededRandom(seed);
  const shade = bundleShade(center, 0.6);
  const paths = bundle(center, { count, radius, oval, twist, reference, samples: 26, seed });

  const strands = paths.map((path, index) => {
    const scale = (count > 4 ? 0.5 : 0.62) + 0.08 * random();

    return wood(path, (t) => radius(t) * scale, seed + index + 1, shade, mossy, { sides: 8, lumps: 0.12, reference });
  });

  strands.push(
    wood(center, (t) => radius(t) * 0.76, seed + 40, shade, mossy, { sides: 10, lumps: 0.05, reference, oval }),
  );

  return strands;
}

function rootWood(root: Root, seed: number): BufferGeometry[] {
  const direction = heading(root.angle);
  const across = v(direction.z, 0, -direction.x);
  const at = (reach: number, height: number): Vector3 => direction.clone().multiplyScalar(reach).setY(height);
  const mossy = patches(seed, 1.2, 0.75);

  const radius = profile([
    [0, 0.17],
    [0.3, 0.145],
    [0.6, 0.105],
    [0.85, 0.07],
    [1, 0.035],
  ]);

  const parts = [
    wood(
      [at(0.06, 1.0), at(0.36, 0.86), at(0.6, 0.58), at(0.8, 0.28), at(root.reach, 0.035)],
      (t) => radius(t) * root.thick,
      seed,
      rootShade,
      mossy,
      {
        sides: 9,
        lumps: 0.16,
        reference: UP,
      },
    ),
  ];

  for (const turn of [-1, 1]) {
    const from = at(0.8, 0.26);

    const splay = direction
      .clone()
      .multiplyScalar(0.1)
      .addScaledVector(across, turn * 0.12);

    parts.push(
      wood(
        [from, from.clone().add(splay).setY(0.1), from.clone().addScaledVector(splay, 2.1).setY(0.012)],
        profile([
          [0, 0.045 * root.thick],
          [1, 0.012],
        ]),
        seed + turn * 7,
        rootShade,
        mossy,
        { sides: 6, lumps: 0.16, reference: UP },
      ),
    );
  }

  return parts;
}

function bracket(position: Vector3, outward: Vector3, size: number): BufferGeometry {
  const cap = paintVertices(dome(12, 5, true), (point, _normal, out) => {
    const reach = Math.hypot(point.x, point.z);
    out
      .copy(FUNGUS)
      .lerp(FUNGUS_RING, 0.5 + 0.5 * Math.sin(reach * 18))
      .lerp(FUNGUS_EDGE, Math.max(0, reach - 0.82) * 5);
  });

  const gills = paintVertices(disc(12, true), (_point, _normal, out) => out.copy(FUNGUS_GILLS));

  return placed(merge([cap, gills]), position, UP, outward.clone().setY(0), v(0.13 * size, 0.05 * size, 0.1 * size));
}

function shelves(origin: Vector3, outward: Vector3, size: number): BufferGeometry[] {
  const out = outward.clone().setY(0).normalize();

  return [0, 1, 2].map((tier) =>
    bracket(
      origin
        .clone()
        .addScaledVector(out, -0.012 * tier)
        .add(v(0, tier * 0.075, 0)),
      out,
      size * (1 - tier * 0.22),
    ),
  );
}

function trunk(): Piece {
  const lower = patches(SEED + 2, 1, 1.15);
  const upper = patches(SEED + 4, 1.3, 0);

  const mossy: Mossy = (point, normal) =>
    Math.max(lower(point, normal), point.y > 1.7 ? upper(point, normal) * 1.4 : 0);

  const parts = strandBundle(
    TORSO,
    profile([
      [0, 0.35],
      [0.28, 0.285],
      [0.55, 0.3],
      [0.8, 0.31],
      [1, 0.19],
    ]),
    6,
    1.8,
    SEED,
    mossy,
    SIDE,
    [1.12, 0.88],
  );

  parts.push(...strandBundle(NECK_LINE, () => 0.1, 4, 2.2, SEED + 100, noMoss, SIDE));

  for (const side of [1, -1]) {
    parts.push(
      wood(
        [v(0.1 * side, 2.2, 0.12), v(0.3 * side, 2.16, 0.15), v(0.42 * side, 2.07, 0.18)],
        profile([
          [0, 0.12],
          [0.55, 0.15],
          [1, 0.09],
        ]),
        SEED + 50 + side,
        plain,
        patches(SEED + 5, 1.8, 0),
        { sides: 9, lumps: 0.16 },
      ),
    );
  }

  parts.push(...rootWood(BACK_ROOT, SEED + 60));

  const fungi = [
    ...shelves(v(0.3, 1.36, 0.2), v(0.85, 0, 0.55), 1.2),
    ...shelves(v(-0.24, 1.1, -0.28), v(-0.5, 0, -0.85), 1.1),
    ...shelves(v(-0.3, 1.86, 0.18), v(-0.75, 0, 0.6), 0.95),
  ];

  return {
    wood: mergeTextured(parts).translate(-BODY_PIVOT.x, -BODY_PIVOT.y, -BODY_PIVOT.z),
    props: merge(fungi).translate(-BODY_PIVOT.x, -BODY_PIVOT.y, -BODY_PIVOT.z),
  };
}

function cluster(side: number, hip: Vector3): Piece {
  const parts = ROOTS.filter((root) => Math.sign(root.angle) === side).flatMap((root, index) =>
    rootWood(root, SEED + 200 + index * 11 + side),
  );

  return { wood: mergeTextured(parts).translate(-hip.x, -hip.y, -hip.z), props: null };
}

function twig(points: readonly Vector3[], radius: number, seed: number): BufferGeometry {
  return wood(
    points,
    profile([
      [0, radius],
      [1, radius * 0.2],
    ]),
    seed,
    plain,
    noMoss,
    { sides: 6, lumps: 0.15, reference: UP },
  );
}

function upperArm(shoulder: Vector3, elbow: Vector3, hand: Vector3, side: number): Piece {
  const center = [
    shoulder.clone().add(v(-side * 0.16, 0.03, -0.03)),
    shoulder.clone(),
    shoulder
      .clone()
      .lerp(elbow, 0.5)
      .add(v(side * 0.025, 0.02, -0.02)),
    elbow.clone(),
  ];

  const radius = profile([
    [0, 0.13],
    [0.3, 0.135],
    [1, 0.108],
  ]);

  const parts = strandBundle(center, radius, 3, 2.6, SEED + 300 + side, patches(SEED + 301, 1.4, 0), UP);
  const upper = elbow.clone().sub(shoulder).normalize();
  const lower = hand.clone().sub(elbow).normalize();

  parts.push(
    wood(
      [elbow.clone().addScaledVector(upper, -0.08), elbow.clone(), elbow.clone().addScaledVector(lower, 0.08)],
      profile([
        [0, 0.09],
        [0.5, 0.145],
        [1, 0.09],
      ]),
      SEED + 310 + side,
      plain,
      noMoss,
      { sides: 9, lumps: 0.22, reference: UP },
    ),
    twig(
      [elbow.clone(), elbow.clone().add(v(0.09 * side, 0.1, -0.06)), elbow.clone().add(v(0.14 * side, 0.27, -0.12))],
      0.032,
      SEED + 320 + side,
    ),
  );

  return { wood: mergeTextured(parts).translate(-shoulder.x, -shoulder.y, -shoulder.z), props: null };
}

function finger(
  base: Vector3,
  direction: Vector3,
  curl: Vector3,
  length: number,
  radius: number,
  bend: number,
  seed: number,
): BufferGeometry {
  const knuckle = base
    .clone()
    .addScaledVector(direction, length * 0.42)
    .addScaledVector(curl, length * 0.05 * bend);

  const middle = knuckle
    .clone()
    .addScaledVector(direction, length * 0.33)
    .addScaledVector(curl, length * 0.22 * bend);

  const tip = middle
    .clone()
    .addScaledVector(direction, length * 0.22)
    .addScaledVector(curl, length * 0.34 * bend);

  return wood(
    [base, knuckle, middle, tip],
    profile([
      [0, radius],
      [0.42, radius * 1.08],
      [0.72, radius * 0.72],
      [1, radius * 0.1],
    ]),
    seed,
    plain,
    noMoss,
    { sides: 6, lumps: 0.2, reference: curl, segments: 12 },
  );
}

function forearm(elbow: Vector3, hand: Hand, side: number): Piece {
  const wrist = elbow.clone().lerp(hand.center, 0.8);
  const forward = hand.center.clone().sub(wrist).normalize();
  const back = hand.back.clone().addScaledVector(forward, -hand.back.dot(forward)).normalize();
  const across = new Vector3().crossVectors(forward, back).normalize();
  const palm = back.clone().negate();

  const radius = profile([
    [0, 0.11],
    [1, 0.088],
  ]);

  const parts = strandBundle(
    [elbow.clone(), elbow.clone().lerp(wrist, 0.5), wrist],
    radius,
    3,
    2.4,
    SEED + 400 + side,
    noMoss,
    UP,
  );

  parts.push(
    wood(
      [
        wrist.clone().addScaledVector(forward, -0.04),
        hand.center.clone(),
        hand.center.clone().addScaledVector(forward, 0.075),
      ],
      profile([
        [0, 0.08],
        [0.5, 0.112],
        [1, 0.06],
      ]),
      SEED + 410 + side,
      plain,
      noMoss,
      { sides: 9, lumps: 0.12, reference: back, oval: [0.62, 1] },
    ),
  );

  for (const [index, [offset, spread, length]] of hand.fingers.entries()) {
    const base = hand.center.clone().addScaledVector(forward, 0.055).addScaledVector(across, offset);
    const direction = forward.clone().addScaledVector(across, spread).normalize();
    parts.push(finger(base, direction, palm, length, hand.thickness, hand.curl, SEED + 420 + index * 3 + side));
  }

  const [offset, spread, length] = hand.thumb;
  const thumbBase = hand.center.clone().addScaledVector(across, offset).addScaledVector(palm, 0.02);

  const thumbDirection = forward
    .clone()
    .multiplyScalar(0.55)
    .addScaledVector(across, spread * 0.5)
    .addScaledVector(palm, 0.35)
    .normalize();

  parts.push(finger(thumbBase, thumbDirection, palm, length, hand.thickness * 1.1, hand.curl * 0.7, SEED + 440 + side));

  return { wood: mergeTextured(parts).translate(-elbow.x, -elbow.y, -elbow.z), props: null };
}

function grain(part: Part): Part {
  return roughen(part, FACE_GRAIN, GRAIN, SEED + 5);
}

function headParts(): Part[] {
  const face = style(FACE, 0.05);

  const parts: Part[] = [
    ellipsoid(v(0, 2.68, 0.3), v(0.27, 0.3, 0.27), style(BARK, 0.1)),
    taper(v(0, 2.38, 0.26), v(0, 2.56, 0.3), 0.17, 0.22, style(BARK, 0.1)),
    grain(ellipsoid(v(0, 2.6, 0.44), v(0.23, 0.25, 0.19), style(FACE, 0.08))),
    taper(v(0.02, 2.735, 0.6), v(0.22, 2.77, 0.49), 0.06, 0.042, face),
    taper(v(-0.02, 2.735, 0.6), v(-0.22, 2.77, 0.49), 0.06, 0.042, face),
    ellipsoid(v(EYE.x, EYE.y, 0.6), v(0.07, 0.05, 0.06), style(FACE, 0.025, true)),
    ellipsoid(v(-EYE.x, EYE.y, 0.6), v(0.07, 0.05, 0.06), style(FACE, 0.025, true)),
    ellipsoid(v(EYE.x, EYE.y + 0.03, 0.605), v(0.075, 0.028, 0.05), style(FACE, 0.02)),
    ellipsoid(v(-EYE.x, EYE.y + 0.03, 0.605), v(0.075, 0.028, 0.05), style(FACE, 0.02)),
    taper(v(0, 2.7, 0.62), v(0.004, 2.57, 0.84), 0.066, 0.044, face),
    taper(v(0.004, 2.57, 0.84), v(0.012, 2.47, 0.93), 0.044, 0.026, style(FACE, 0.03)),
    ellipsoid(v(0.01, 2.51, 0.9), v(0.046, 0.04, 0.042), style(FACE, 0.03)),
    grain(ellipsoid(v(0.17, 2.55, 0.52), v(0.115, 0.095, 0.095), face)),
    grain(ellipsoid(v(-0.17, 2.55, 0.52), v(0.115, 0.095, 0.095), face)),
    grain(ellipsoid(v(0, 2.34, 0.5), v(0.1, 0.08, 0.085), face)),
  ];

  for (let index = 0; index <= 8; index += 1) {
    const t = index / 4 - 1;
    parts.push(
      ellipsoid(
        v(0.17 * t, 2.43 + 0.055 * t * t, 0.575 - 0.07 * t * t),
        v(0.03, 0.02, 0.045),
        style(FACE, 0.016, true),
      ),
    );
  }

  for (const side of [1, -1]) {
    parts.push(
      taper(v(0.075 * side, 2.56, 0.67), v(0.185 * side, 2.44, 0.55), 0.016, 0.012, style(FACE, 0.012, true)),
      taper(v(0.19 * side, 2.69, 0.53), v(0.24 * side, 2.64, 0.46), 0.012, 0.01, style(FACE, 0.01, true)),
    );
  }

  return parts;
}

function crownField(point: Vector3): number {
  let distance = Number.POSITIVE_INFINITY;

  for (const clump of CLUMPS) {
    const scaled = Math.hypot(
      (point.x - clump.center.x) / clump.radii.x,
      (point.y - clump.center.y) / clump.radii.y,
      (point.z - clump.center.z) / clump.radii.z,
    );

    distance = Math.min(distance, (scaled - 1) * Math.min(clump.radii.x, clump.radii.y, clump.radii.z));
  }

  return distance;
}

function headSurface(): BufferGeometry {
  const parts = headParts();
  const bounds = partBounds(parts, 0.06);
  const field = localField(parts, bounds, HEAD_CELL, HEAD_REACH);
  const surface = meshField(field, bounds, HEAD_STEP);
  const probe = new Vector3();

  const shade: DistanceField = (x, y, z) => Math.min(field(x, y, z), crownField(probe.set(x, y, z)), y);

  paintSurface(surface, parts, field, HEAD_PAINTS, SEED, shade);
  const positions = surface.getAttribute("position");
  const uvs = new Float32Array(positions.count * 2);

  for (let index = 0; index < positions.count; index += 1) {
    const x = positions.getX(index);
    const y = positions.getY(index);
    const z = positions.getZ(index);
    uvs[index * 2] = (Math.atan2(x, z - HEAD_AXIS_Z) / (Math.PI * 2) + 0.5) * HEAD_GRAIN_U;
    uvs[index * 2 + 1] = y * HEAD_GRAIN_V;
  }

  surface.setAttribute("uv", new Float32BufferAttribute(uvs, 2));

  return surface.translate(-NECK.x, -NECK.y, -NECK.z);
}

function flower(position: Vector3, normal: Vector3, size: number, spin: number): BufferGeometry {
  const parts: BufferGeometry[] = [];

  for (let index = 0; index < 5; index += 1) {
    const petal = new SphereGeometry(1, 6, 4).scale(0.068, 0.013, 0.062).translate(0, 0.006, 0.06).rotateX(-0.52);
    petal.rotateY((index / 5) * Math.PI * 2 + spin);

    parts.push(
      paintVertices(petal, (point, _normal, out) => {
        const reach = Math.hypot(point.x, point.z);
        out
          .copy(PETAL_BASE)
          .lerp(PETAL, smooth(0.015, 0.06, reach))
          .lerp(PETAL_TIP, smooth(0.085, 0.125, reach));
      }),
    );
  }

  parts.push(
    paintVertices(
      new TorusGeometry(0.024, 0.009, 4, 10).rotateX(Math.PI / 2).translate(0, 0.03, 0),
      (_point, _normal, out) => out.copy(STAMEN),
    ),
    paintVertices(new SphereGeometry(0.019, 6, 4).translate(0, 0.024, 0), (_point, _normal, out) => out.copy(CARPEL)),
  );

  return placed(merge(parts), position, normal, v(Math.sin(spin), 0, Math.cos(spin)), v(size, size, size));
}

function crown(): Crown {
  const random = seededRandom(SEED + 500);

  const hidden = (point: Vector3): boolean => point.z > 0.4 && point.y < 3.02 && Math.abs(point.x) < 0.32;

  const blooms = FLOWERS.map(([index, direction, size]) => {
    const clump = CLUMPS[index];
    const out = direction.clone().normalize();
    const at = clump.center.clone().add(out.clone().multiply(clump.radii).multiplyScalar(1.02));

    return flower(at, out, size, random() * 6);
  });

  const fungi = [
    ...shelves(v(-0.6, 2.84, 0.08), v(-1, 0, 0.35), 1.15),
    ...shelves(v(0.5, 2.64, -0.2), v(0.8, 0, -0.6), 0.9),
  ];

  const cores = CLUMPS.map((clump) =>
    paintVertices(
      new IcosahedronGeometry(1, 1)
        .scale(clump.radii.x * CORE_SCALE, clump.radii.y * CORE_SCALE, clump.radii.z * CORE_SCALE)
        .translate(clump.center.x, clump.center.y, clump.center.z),
      (_point, normal, out) => out.copy(CROWN_CORE).lerp(LEAVES.deep, normal.y * 0.5 + 0.5),
    ),
  );

  const twigs = [
    twig([v(0.15, 3.2, -0.1), v(0.35, 3.55, -0.2), v(0.52, 3.86, -0.26)], 0.04, SEED + 510),
    twig([v(0.3, 3.5, -0.18), v(0.44, 3.6, -0.06), v(0.56, 3.66, 0.02)], 0.022, SEED + 511),
    twig([v(-0.2, 3.25, -0.05), v(-0.42, 3.58, 0.0), v(-0.62, 3.78, 0.05)], 0.036, SEED + 512),
    twig([v(0.02, 3.3, -0.25), v(0.05, 3.68, -0.42), v(0.1, 3.93, -0.5)], 0.036, SEED + 513),
  ];

  const leaves = mergeTextured([
    leafCards(CLUMPS, CROWN_CENTER, LEAVES, SEED + 520, hidden),
    frondCards(FRONDS, LEAVES, SEED + 530),
  ]);

  return {
    piece: {
      wood: mergeTextured(twigs).translate(-CROWN_PIVOT.x, -CROWN_PIVOT.y, -CROWN_PIVOT.z),
      props: merge([...blooms, ...fungi, ...cores]).translate(-CROWN_PIVOT.x, -CROWN_PIVOT.y, -CROWN_PIVOT.z),
    },
    leaves: leaves.translate(-CROWN_PIVOT.x, -CROWN_PIVOT.y, -CROWN_PIVOT.z),
  };
}

function porcelain(): BufferGeometry {
  const band = (from: number, to: number) => (point: Vector3, _normal: Vector3, out: Color) =>
    out.copy(point.y > from && point.y < to ? GLAZE : PORCELAIN);

  const cup = paintVertices(lathe(CUP_PROFILE, 24).translate(0, 0.024, 0), band(0.024 + 0.085, 0.024 + 0.105));
  const saucer = paintVertices(lathe(SAUCER_PROFILE, 28), band(0.03, 0.046));

  const handle = paintVertices(
    new TorusGeometry(0.042, 0.012, 6, 14, Math.PI).rotateZ(-Math.PI / 2).translate(0.13, 0.024 + 0.075, 0),
    band(1, 0),
  );

  return placed(merge([cup, saucer, handle]), CUP_AT, CUP_TILT, v(1, 0, 0.3), v(1, 1, 1));
}

function eyes(): BufferGeometry {
  return merge(
    [1, -1].map((side) =>
      new SphereGeometry(1, 12, 8)
        .scale(0.04, 0.024, 0.022)
        .rotateZ(-0.22 * side)
        .translate(EYE.x * side, EYE.y, EYE.z),
    ),
  );
}

function tea(): BufferGeometry {
  return placed(
    disc(20, false)
      .rotateX(Math.PI)
      .scale(0.12, 1, 0.12)
      .translate(0, TEA_LEVEL - 0.004, 0),
    CUP_AT,
    CUP_TILT,
    v(1, 0, 0.3),
    v(1, 1, 1),
  );
}

function build(): NettleGeometry {
  const top = crown();

  return {
    trunk: trunk(),
    roots: [cluster(1, LEFT_HIP), cluster(-1, RIGHT_HIP)],
    upperArms: [upperArm(LEFT_SHOULDER, LEFT_ELBOW, CUP_HAND, 1), upperArm(RIGHT_SHOULDER, RIGHT_ELBOW, OPEN_HAND, -1)],
    forearms: [forearm(LEFT_ELBOW, CUP_GRIP, 1), forearm(RIGHT_ELBOW, THORN_GRIP, -1)],
    head: headSurface(),
    crown: top.piece,
    leaves: top.leaves,
    porcelain: porcelain().translate(-LEFT_ELBOW.x, -LEFT_ELBOW.y, -LEFT_ELBOW.z),
    eyes: eyes().translate(-NECK.x, -NECK.y, -NECK.z),
    teaSurface: tea().translate(-LEFT_ELBOW.x, -LEFT_ELBOW.y, -LEFT_ELBOW.z),
  };
}

export function nettleGeometry(): NettleGeometry {
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

export function createNettle(): Nettle {
  const geometry = nettleGeometry();
  const textures = barkTextures();
  const root = new Group();
  const foliage = createLeafMaterial();

  const bark = new MeshStandardMaterial({
    map: textures.detail,
    normalMap: textures.normal,
    normalScale: new Vector2(NORMAL_STRENGTH, NORMAL_STRENGTH),
    vertexColors: true,
    roughness: 0.88,
    metalness: 0,
  });

  const face = bark.clone();
  face.normalScale.set(FACE_NORMAL, FACE_NORMAL);
  const paint = new MeshStandardMaterial({ vertexColors: true, roughness: 0.8, metalness: 0 });
  const china = new MeshStandardMaterial({ vertexColors: true, roughness: 0.28, metalness: 0 });

  const light = new MeshStandardMaterial({
    color: GLOW,
    emissive: GLOW_EMISSIVE,
    emissiveIntensity: GLOW_INTENSITY,
    roughness: 0.4,
  });

  const meshes: Mesh[] = [];
  const zero = new Vector3();

  const add = (
    group: Group,
    part: BufferGeometry,
    material: Material,
    depth: MeshDepthMaterial | null = null,
  ): void => {
    const mesh = new Mesh(part, material);

    if (depth !== null) {
      mesh.customDepthMaterial = depth;
    }

    meshes.push(mesh);
    group.add(mesh);
  };

  const dress = (group: Group, piece: Piece): Group => {
    add(group, piece.wood, bark);

    if (piece.props !== null) {
      add(group, piece.props, paint);
    }

    return group;
  };

  const body = dress(joint(BODY_PIVOT, zero), geometry.trunk);

  const hips = [
    dress(joint(LEFT_HIP, zero), geometry.roots[0]),
    dress(joint(RIGHT_HIP, zero), geometry.roots[1]),
  ] as const;

  const head = joint(NECK, BODY_PIVOT);
  const tilt = new Group();
  add(tilt, geometry.head, face);
  add(tilt, geometry.eyes, light);
  const crown = dress(joint(CROWN_PIVOT, NECK), geometry.crown);
  add(crown, geometry.leaves, foliage.material, foliage.depth);
  tilt.rotation.x = -HEAD_TILT;
  tilt.add(crown);
  head.add(tilt);

  const shoulders = [
    dress(joint(LEFT_SHOULDER, BODY_PIVOT), geometry.upperArms[0]),
    dress(joint(RIGHT_SHOULDER, BODY_PIVOT), geometry.upperArms[1]),
  ] as const;

  const elbows = [
    dress(joint(LEFT_ELBOW, LEFT_SHOULDER), geometry.forearms[0]),
    dress(joint(RIGHT_ELBOW, RIGHT_SHOULDER), geometry.forearms[1]),
  ] as const;

  add(elbows[0], geometry.porcelain, china);
  add(elbows[0], geometry.teaSurface, light);
  const tea = new Object3D();
  tea.position.copy(CUP_AT).addScaledVector(CUP_TILT.clone().normalize(), TEA_LEVEL).sub(LEFT_ELBOW);
  elbows[0].add(tea);
  const thorn = new Object3D();
  thorn.position
    .copy(OPEN_HAND)
    .add(v(-0.12, -0.08, 0.16))
    .sub(RIGHT_ELBOW);
  elbows[1].add(thorn);
  shoulders[0].add(elbows[0]);
  shoulders[1].add(elbows[1]);
  body.add(head, ...shoulders);
  root.add(body, ...hips);
  const triangles = meshes.reduce((sum, mesh) => sum + trianglesOf(mesh.geometry), 0);
  let clock = Math.random() * 10;
  let glowBoost = 0;

  return {
    root,
    height: HEIGHT,
    body,
    head,
    crown,
    shoulders,
    elbows,
    hips,
    tea,
    thorn,
    surfaces: [bark, face, paint, foliage.material],
    triangles,

    setFlash(amount) {
      for (const material of [bark, face, paint, foliage.material]) {
        material.emissive.copy(FLASH).multiplyScalar(amount * 0.6);
      }
    },

    setGlow(amount) {
      glowBoost = amount;
    },

    setCastsShadow(castsShadow) {
      for (const mesh of meshes) {
        mesh.castShadow = castsShadow;
      }
    },

    update(deltaSeconds) {
      clock += deltaSeconds;
      foliage.advance(deltaSeconds);
      light.emissiveIntensity = Math.max(0.15, GLOW_INTENSITY * (1 + 0.12 * Math.sin(clock * 2.3)) + glowBoost * 3);
    },

    dispose() {
      root.removeFromParent();
      foliage.dispose();

      for (const material of [bark, face, paint, china, light]) {
        material.dispose();
      }
    },
  };
}
