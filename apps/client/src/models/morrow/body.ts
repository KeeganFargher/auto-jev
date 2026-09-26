import {
  BufferGeometry,
  CircleGeometry,
  Color,
  ConeGeometry,
  DataTexture,
  Float32BufferAttribute,
  LatheGeometry,
  LinearFilter,
  LinearMipmapLinearFilter,
  NoColorSpace,
  RepeatWrapping,
  RGBAFormat,
  SphereGeometry,
  SRGBColorSpace,
  Vector2,
  Vector3,
} from "three";
import { fbm, periodicNoise, valueNoise } from "../sculpt/noise.js";
import { paintSurface, partBounds, type Paint } from "../sculpt/paint.js";
import { merge, paintVertices, placed } from "../sculpt/props.js";
import { mergeTextured, tube } from "../sculpt/strands.js";
import { ellipsoid, localField, taper, type Part, type PartStyle } from "../vesper/sdf.js";
import { meshField } from "../vesper/surface-nets.js";

export interface HideTextures {
  readonly detail: DataTexture;
  readonly normal: DataTexture;
}

export interface Limb {
  readonly geometry: BufferGeometry;
  readonly pivot: Vector3;
}

export interface EyeFrame {
  readonly center: Vector3;
  readonly gaze: Vector3;
}

export const EYE_RADIUS = 0.15;

export const EYES: readonly Vector3[] = [new Vector3(0.36, 0.2, 0.74), new Vector3(-0.36, 0.2, 0.74)];

export const GAZE: readonly Vector3[] = [
  new Vector3(0.8, 0.1, 0.59).normalize(),
  new Vector3(-0.8, 0.1, 0.59).normalize(),
];

export const BEAK_TIP = new Vector3(0, -0.08, 1.46);

export const NECK_BASE = new Vector3(0, 2.02, 2.7);

export const NECK_PITCH = -0.8;

export const NECK_RINGS = 4;

export const RING_SPACING = 0.52;

export const RING_LENGTH = 0.64;

export const HIPS: readonly Vector3[] = [
  new Vector3(1.85, 1.62, 1.95),
  new Vector3(-1.85, 1.62, 1.95),
  new Vector3(1.75, 1.5, -2.35),
  new Vector3(-1.75, 1.5, -2.35),
];

export const TAIL_ROOT = new Vector3(0, 1.28, -3.8);

export const STANCE = 0.38;

const TILE_WORLD = 1.9;

const HIDE_SIZE = 256;

const HIDE_CELLS = 7;

const HIDE_RELIEF = 3.2;

const IRIS_SIZE = 128;

const HEAD_STEP = 0.043;

const HEAD_CELL = 0.12;

const HEAD_REACH = 0.22;

const SKIN = new Color("#8d8453");

const SKIN_WASH = new Color("#37331b");

const SKIN_HIGHLIGHT = new Color("#cfc081");

const THROAT = new Color("#c2b276");

const BEAK = new Color("#d6c087");

const BEAK_WASH = new Color("#5f4b24");

const BEAK_HIGHLIGHT = new Color("#f2e2aa");

const NAIL = new Color("#cbb68a");

const BELLY = new Color("#b9a46a");

const INNER = new Color("#2f2b18");

const LID_EDGE = new Color("#2a2412");

const PUPIL = new Color("#0a0705");

const IRIS_OUTER = new Color("#5a3212");

const IRIS_MID = new Color("#b5722a");

const IRIS_INNER = new Color("#e3b04e");

const SCLERA = new Color("#dcd2ae");

const GLINT = new Color("#ffffff");

const IRIS_REACH = 0.2;

const PUPIL_REACH = 0.075;

const SEED = 3301;

const SKIN_PAINT: Paint = { base: SKIN, wash: SKIN_WASH, highlight: SKIN_HIGHLIGHT };

const BEAK_PAINT: Paint = { base: BEAK, wash: BEAK_WASH, highlight: BEAK_HIGHLIGHT };

let hide: HideTextures | null = null;

let iris: DataTexture | null = null;

let headCache: BufferGeometry | null = null;

function clamp01(value: number): number {
  return Math.min(1, Math.max(0, value));
}

function smoothstep(from: number, to: number, value: number): number {
  const t = clamp01((value - from) / (to - from));

  return t * t * (3 - 2 * t);
}

function v(x: number, y: number, z: number): Vector3 {
  return new Vector3(x, y, z);
}

function encode(linear: number): number {
  const value = clamp01(linear);
  const srgb = value <= 0.0031308 ? value * 12.92 : 1.055 * value ** (1 / 2.4) - 0.055;

  return Math.round(srgb * 255);
}

function finish(texture: DataTexture, colorSpace: string, repeat: boolean): DataTexture {
  texture.colorSpace = colorSpace;

  if (repeat) {
    texture.wrapS = RepeatWrapping;
    texture.wrapT = RepeatWrapping;
  }

  texture.magFilter = LinearFilter;
  texture.minFilter = LinearMipmapLinearFilter;
  texture.generateMipmaps = true;
  texture.anisotropy = 4;
  texture.needsUpdate = true;

  return texture;
}

function jitter(i: number, j: number, axis: number): number {
  const cell = ((i % HIDE_CELLS) + HIDE_CELLS) % HIDE_CELLS;
  const row = ((j % HIDE_CELLS) + HIDE_CELLS) % HIDE_CELLS;

  return 0.18 + 0.64 * periodicNoise(cell + 0.5, row + 0.5 + axis * 17.3, HIDE_CELLS, HIDE_CELLS + 64, SEED + axis);
}

function makeHide(): HideTextures {
  const heights = new Float32Array(HIDE_SIZE * HIDE_SIZE);
  const tones = new Float32Array(HIDE_SIZE * HIDE_SIZE);

  for (let y = 0; y < HIDE_SIZE; y += 1) {
    for (let x = 0; x < HIDE_SIZE; x += 1) {
      const px = (x / HIDE_SIZE) * HIDE_CELLS;
      const py = (y / HIDE_SIZE) * HIDE_CELLS;
      const ix = Math.floor(px);
      const iy = Math.floor(py);
      let first = Infinity;
      let second = Infinity;
      let owner = 0;

      for (let dy = -1; dy <= 1; dy += 1) {
        for (let dx = -1; dx <= 1; dx += 1) {
          const cx = ix + dx + jitter(ix + dx, iy + dy, 0);
          const cy = iy + dy + jitter(ix + dx, iy + dy, 1);
          const distance = Math.hypot(px - cx, py - cy);

          if (distance < first) {
            second = first;
            first = distance;
            owner =
              ((((ix + dx) % HIDE_CELLS) + HIDE_CELLS) % HIDE_CELLS) +
              HIDE_CELLS * ((((iy + dy) % HIDE_CELLS) + HIDE_CELLS) % HIDE_CELLS);
          } else if (distance < second) {
            second = distance;
          }
        }
      }

      const edge = second - first;
      const index = y * HIDE_SIZE + x;
      heights[index] = 0.6 * smoothstep(0, 0.22, edge) ** 0.7 + 0.4 * (1 - smoothstep(0.1, 0.75, first));
      tones[index] = 0.86 + ((0.24 * (((Math.sin(owner * 12.9898) * 43758.5453) % 1) + 1)) % 1);
    }
  }

  const detail = new Uint8Array(HIDE_SIZE * HIDE_SIZE * 4);
  const normal = new Uint8Array(HIDE_SIZE * HIDE_SIZE * 4);

  const at = (x: number, y: number): number =>
    heights[((y + HIDE_SIZE) % HIDE_SIZE) * HIDE_SIZE + ((x + HIDE_SIZE) % HIDE_SIZE)];

  for (let y = 0; y < HIDE_SIZE; y += 1) {
    for (let x = 0; x < HIDE_SIZE; x += 1) {
      const index = y * HIDE_SIZE + x;
      const height = heights[index];
      const value = (0.42 + 0.62 * height) * tones[index];
      detail[index * 4] = encode(value);
      detail[index * 4 + 1] = encode(value * 0.97);
      detail[index * 4 + 2] = encode(value * 0.9);
      detail[index * 4 + 3] = 255;
      const dx = ((at(x + 1, y) - at(x - 1, y)) / 2) * HIDE_RELIEF;
      const dy = ((at(x, y + 1) - at(x, y - 1)) / 2) * HIDE_RELIEF;
      const length = Math.hypot(dx, dy, 1);
      normal[index * 4] = Math.round(((-dx / length) * 0.5 + 0.5) * 255);
      normal[index * 4 + 1] = Math.round(((-dy / length) * 0.5 + 0.5) * 255);
      normal[index * 4 + 2] = Math.round(((1 / length) * 0.5 + 0.5) * 255);
      normal[index * 4 + 3] = 255;
    }
  }

  return {
    detail: finish(new DataTexture(detail, HIDE_SIZE, HIDE_SIZE, RGBAFormat), SRGBColorSpace, true),
    normal: finish(new DataTexture(normal, HIDE_SIZE, HIDE_SIZE, RGBAFormat), NoColorSpace, true),
  };
}

export function hideTextures(): HideTextures {
  hide ??= makeHide();

  return hide;
}

function makeIris(): DataTexture {
  const data = new Uint8Array(IRIS_SIZE * IRIS_SIZE * 4);
  const color = new Color();

  for (let y = 0; y < IRIS_SIZE; y += 1) {
    const polar = 1 - (y + 0.5) / IRIS_SIZE;

    for (let x = 0; x < IRIS_SIZE; x += 1) {
      const u = (x + 0.5) / IRIS_SIZE;
      const fibre = 0.9 + 0.2 * valueNoise(u * 48, polar * 30, 0, SEED + 11);
      const across = polar / IRIS_REACH;
      color
        .copy(IRIS_INNER)
        .lerp(IRIS_MID, smoothstep(0.35, 0.7, across))
        .lerp(IRIS_OUTER, smoothstep(0.75, 0.98, across))
        .multiplyScalar(fibre);
      color.lerp(PUPIL, 1 - smoothstep(PUPIL_REACH, PUPIL_REACH + 0.012, polar));
      color.lerp(SCLERA, smoothstep(IRIS_REACH - 0.006, IRIS_REACH + 0.012, polar));
      color.multiplyScalar(1 - 0.35 * smoothstep(0.26, 0.5, polar));
      const glint = Math.hypot((u - 0.13) * Math.PI * 2 * Math.sin(Math.PI * 0.1), (polar - 0.1) * Math.PI);
      color.lerp(GLINT, 1 - smoothstep(0.05, 0.075, glint));
      const index = (y * IRIS_SIZE + x) * 4;
      data[index] = encode(color.r);
      data[index + 1] = encode(color.g);
      data[index + 2] = encode(color.b);
      data[index + 3] = 255;
    }
  }

  return finish(new DataTexture(data, IRIS_SIZE, IRIS_SIZE, RGBAFormat), SRGBColorSpace, false);
}

export function irisTexture(): DataTexture {
  iris ??= makeIris();

  return iris;
}

function hidePaint(
  scale: number,
  underside: Color,
  height: number,
): (point: Vector3, normal: Vector3, out: Color) => void {
  return (point, normal, out) => {
    const mottle = fbm(point.x * 2.2, point.y * 2.2, point.z * 2.2, SEED + 21, 2);
    out
      .copy(SKIN)
      .lerp(SKIN_HIGHLIGHT, 0.3 * smoothstep(0.45, 0.75, mottle))
      .lerp(SKIN_WASH, 0.25 * (1 - smoothstep(0.2, 0.5, mottle)));
    out.lerp(underside, 0.55 * smoothstep(0.1, -0.7, normal.y));
    out.multiplyScalar(scale * (0.72 + 0.36 * clamp01((point.y + height) / 3)));
  };
}

function capped(geometry: BufferGeometry, center: Vector3, radius: number): BufferGeometry {
  const sole = new CircleGeometry(radius, 18).rotateX(Math.PI / 2).translate(center.x, center.y, center.z);
  sole.deleteAttribute("uv");
  sole.setAttribute("uv", new Float32BufferAttribute(new Float32Array(sole.getAttribute("position").count * 2), 2));

  return mergeTextured(
    [geometry, sole.toNonIndexed()].map((part) => (part.index === null ? part : part.toNonIndexed())),
  );
}

export function legGeometry(index: number): Limb {
  const pivot = HIPS[index];
  const side = pivot.x > 0 ? 1 : -1;
  const front = index < 2;
  const reach = front ? 0.35 : -0.25;
  const drop = pivot.y + STANCE;

  const path = [
    v(0, 0.1, 0),
    v(side * 0.28, -0.55, reach * 0.4),
    v(side * 0.4, -drop * 0.72, reach * 0.85),
    v(side * 0.42, -drop + 0.08, reach),
  ];

  const top = front ? 0.5 : 0.55;

  const column = tube(path, {
    radius: (t) => top * (1 - 0.14 * smoothstep(0, 0.75, t)) + 0.16 * smoothstep(0.72, 1, t),
    sides: 22,
    segments: 16,
    lumps: 0.05,
    seed: SEED + index,
    reference: v(0, 0, 1),
    turns: 2,
    repeat: 1 / TILE_WORLD,
  });

  const foot = path[path.length - 1].clone().setY(-drop + 0.02);
  const nails: BufferGeometry[] = [];
  const count = front ? 5 : 4;
  const forward = new Vector3(side * 0.25, 0, front ? 1 : -0.2).normalize();

  for (let nail = 0; nail < count; nail += 1) {
    const spread = (nail / (count - 1) - 0.5) * (front ? 1.7 : 1.4);
    const direction = forward.clone().applyAxisAngle(v(0, 1, 0), spread);

    const at = foot
      .clone()
      .addScaledVector(direction, top * 1.12)
      .setY(-drop + 0.08);

    const cone = placed(new ConeGeometry(0.075, 0.2, 6), at, direction.clone().setY(-0.35), v(0, 1, 0), v(1, 1, 0.8));
    cone.deleteAttribute("uv");
    cone.setAttribute("uv", new Float32BufferAttribute(new Float32Array(cone.getAttribute("position").count * 2), 2));
    nails.push(paintVertices(cone.toNonIndexed(), (_point, _normal, out) => out.copy(NAIL)));
  }

  const leg = paintVertices(capped(column, foot, top * 1.02), hidePaint(1, THROAT, pivot.y));

  return { geometry: mergeTextured([leg, ...nails]), pivot };
}

function neckCrease(theta: number, t: number, index: number): number {
  const drift = 0.07 * Math.sin(theta * 2 + index * 1.9) + 0.05 * Math.sin(theta * 3 - index);
  const first = Math.exp(-(((t - 0.4 - drift) / 0.06) ** 2));
  const second = Math.exp(-(((t - 0.74 + drift * 0.8) / 0.05) ** 2));
  const throat = 0.55 + 0.45 * Math.max(0, Math.sin(theta));

  return (first + 0.8 * second) * throat;
}

export function neckRing(index: number): BufferGeometry {
  const radius = 0.7 - 0.06 * index;
  const points: Vector2[] = [];
  const samples = 22;

  for (let step = 0; step <= samples; step += 1) {
    const t = step / samples;
    const fold = 1 + 0.08 * Math.sin(Math.PI * t);
    points.push(new Vector2(radius * fold * (t < 0.06 ? 0.86 + 2.3 * t : 1), t * RING_LENGTH));
  }

  const geometry = new LatheGeometry(points, 32);
  const position = geometry.getAttribute("position");

  for (let vertex = 0; vertex < position.count; vertex += 1) {
    const x = position.getX(vertex);
    const y = position.getY(vertex);
    const z = position.getZ(vertex);
    const squeeze = 1 - 0.075 * neckCrease(Math.atan2(z, x), y / RING_LENGTH, index);
    position.setXYZ(vertex, x * squeeze, y, z * squeeze);
  }

  geometry.computeVertexNormals();
  geometry.rotateX(Math.PI / 2).scale(1.08, 0.94, 1);
  const uv = geometry.getAttribute("uv");

  for (let vertex = 0; vertex < uv.count; vertex += 1) {
    uv.setXY(vertex, uv.getX(vertex) * 2, (uv.getY(vertex) * RING_LENGTH) / TILE_WORLD);
  }

  return paintVertices(geometry, (point, normal, out) => {
    const crease = neckCrease(Math.atan2(-point.y / 0.94, point.x / 1.08), point.z / RING_LENGTH, index);
    hidePaint(1.02 - index * 0.02, THROAT, 2.4)(point, normal, out);
    out.lerp(SKIN_WASH, 0.5 * clamp01(crease));
  });
}

export function tailGeometry(): BufferGeometry {
  const column = tube([v(0, 0, 0), v(0, -0.15, -0.3), v(0, -0.38, -0.6), v(0, -0.62, -0.78)], {
    radius: (t) => 0.22 * (1 - t) + 0.03,
    sides: 12,
    segments: 10,
    lumps: 0.04,
    seed: SEED + 40,
    reference: v(1, 0, 0),
    turns: 1,
    repeat: 1 / TILE_WORLD,
  });

  return paintVertices(column, hidePaint(0.9, THROAT, 1.3));
}

export function bellyGeometry(): BufferGeometry {
  const mass = paintVertices(
    new SphereGeometry(1, 28, 14).scale(2.62, 0.88, 3.12).translate(0, 1.5, -0.35),
    (_point, _normal, out) => out.copy(INNER),
  );

  const plastron = paintVertices(
    new SphereGeometry(1, 28, 10, 0, Math.PI * 2, Math.PI / 2, Math.PI / 2)
      .scale(2.55, 0.42, 3.0)
      .translate(0, 1.18, -0.3),
    (point, _normal, out) => {
      const seam = Math.abs(point.x) < 0.04 || Math.abs(((point.z + 3) % 1.1) - 0.55) < 0.035 ? 0.45 : 1;
      out.copy(BELLY).multiplyScalar(seam * (0.8 + 0.2 * valueNoise(point.x * 3, 0, point.z * 3, SEED + 50)));
    },
  );

  const merged = merge([mass, plastron]);
  merged.setAttribute("uv", new Float32BufferAttribute(new Float32Array(merged.getAttribute("position").count * 2), 2));

  return merged;
}

function cellEdge(x: number, y: number, z: number): number {
  const ix = Math.floor(x);
  const iy = Math.floor(y);
  const iz = Math.floor(z);
  let first = Infinity;
  let second = Infinity;

  for (let dz = -1; dz <= 1; dz += 1) {
    for (let dy = -1; dy <= 1; dy += 1) {
      for (let dx = -1; dx <= 1; dx += 1) {
        const cx = ix + dx + valueNoise(ix + dx + 0.5, iy + dy + 0.5, iz + dz + 0.5, SEED + 60);
        const cy = iy + dy + valueNoise(ix + dx + 0.5, iy + dy + 0.5, iz + dz + 0.5, SEED + 61);
        const cz = iz + dz + valueNoise(ix + dx + 0.5, iy + dy + 0.5, iz + dz + 0.5, SEED + 62);
        const distance = Math.hypot(x - cx, y - cy, z - cz);

        if (distance < first) {
          second = first;
          first = distance;
        } else if (distance < second) {
          second = distance;
        }
      }
    }
  }

  return second - first;
}

function headParts(): Part[] {
  const skin: PartStyle = { group: 0, blend: 0.16 };
  const soft: PartStyle = { group: 0, blend: 0.1 };
  const beak: PartStyle = { group: 1, blend: 0.07 };
  const carve: PartStyle = { group: 0, blend: 0.03, carve: true };

  const parts: Part[] = [
    ellipsoid(v(0, 0.13, 0.3), v(0.5, 0.45, 0.6), skin),
    ellipsoid(v(0, 0.02, 0.0), v(0.44, 0.42, 0.36), skin),
    taper(v(0, 0.1, 0.55), v(0, 0.03, 1.06), 0.37, 0.24, skin),
    ellipsoid(v(0, -0.22, 0.52), v(0.33, 0.2, 0.44), skin),
    taper(v(0, -0.2, 0.35), v(0, -0.12, -0.12), 0.3, 0.36, skin),
    ellipsoid(v(0, -0.02, 1.12), v(0.26, 0.2, 0.3), beak),
    ellipsoid(v(0, -0.11, 1.32), v(0.12, 0.13, 0.13), beak),
    ellipsoid(v(0, -0.23, 1.02), v(0.22, 0.12, 0.3), beak),
  ];

  for (const side of [1, -1]) {
    parts.push(
      ellipsoid(v(side * 0.29, 0.37, 0.69), v(0.2, 0.11, 0.25), soft),
      ellipsoid(v(side * 0.31, -0.06, 0.34), v(0.25, 0.28, 0.34), soft),
      ellipsoid(v(side * 0.36, 0.2, 0.74), v(EYE_RADIUS + 0.035, EYE_RADIUS + 0.035, EYE_RADIUS + 0.035), carve),
      ellipsoid(v(side * 0.07, 0.1, 1.32), v(0.03, 0.022, 0.03), carve),
    );

    const mouth = [
      v(side * 0.02, -0.14, 1.37),
      v(side * 0.14, -0.13, 1.27),
      v(side * 0.25, -0.09, 1.05),
      v(side * 0.31, -0.04, 0.84),
      v(side * 0.33, 0.03, 0.66),
    ];

    for (let index = 0; index + 1 < mouth.length; index += 1) {
      parts.push(taper(mouth[index], mouth[index + 1], 0.042, 0.036, carve));
    }
  }

  return parts;
}

function buildHead(): BufferGeometry {
  const parts = headParts();
  const bounds = partBounds(parts, 0.08);
  const field = localField(parts, bounds, HEAD_CELL, HEAD_REACH);
  const geometry = meshField(field, bounds, HEAD_STEP);
  paintSurface(geometry, parts, field, [SKIN_PAINT, BEAK_PAINT], SEED + 70);
  const positions = geometry.getAttribute("position");
  const normals = geometry.getAttribute("normal");
  const colors = geometry.getAttribute("color");

  for (let vertex = 0; vertex < positions.count; vertex += 1) {
    const x = positions.getX(vertex);
    const y = positions.getY(vertex);
    const z = positions.getZ(vertex);
    const ny = normals.getY(vertex);
    const beaked = z > 0.95 || (z > 0.72 && y < -0.1);

    const plates = beaked
      ? 1
      : 1 - 0.5 * (1 - smoothstep(0.03, 0.09, cellEdge(x * 6.5, y * 6.5, z * 6.5))) * smoothstep(-0.2, 0.4, ny);

    const under = beaked ? 0 : 0.5 * smoothstep(0.1, -0.6, ny);
    const r = colors.getX(vertex) * plates;
    const g = colors.getY(vertex) * plates;
    const b = colors.getZ(vertex) * plates;
    colors.setXYZ(vertex, r + (THROAT.r - r) * under, g + (THROAT.g - g) * under, b + (THROAT.b - b) * under);
  }

  return geometry;
}

export function headGeometry(): BufferGeometry {
  headCache ??= buildHead();

  return headCache;
}

export function eyeGeometry(): BufferGeometry {
  return new SphereGeometry(EYE_RADIUS, 24, 16);
}

export function lidGeometry(upper: boolean): BufferGeometry {
  const shell = upper
    ? new SphereGeometry(EYE_RADIUS * 1.12, 22, 10, 0, Math.PI * 2, 0, Math.PI / 2)
    : new SphereGeometry(EYE_RADIUS * 1.08, 22, 6, 0, Math.PI * 2, Math.PI * 0.72, Math.PI * 0.28);

  return paintVertices(shell, (point, _normal, out) => {
    const rim = upper
      ? 1 - smoothstep(0, EYE_RADIUS * 0.35, point.y)
      : 1 - smoothstep(0, EYE_RADIUS * 0.3, -point.y - EYE_RADIUS * 0.75);

    out
      .copy(SKIN)
      .multiplyScalar(0.92)
      .lerp(LID_EDGE, 0.75 * rim);
  });
}

export function eyeFrame(index: number): EyeFrame {
  return { center: EYES[index], gaze: GAZE[index] };
}
