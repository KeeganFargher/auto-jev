import {
  BufferGeometry,
  Color,
  DataTexture,
  Float32BufferAttribute,
  LinearFilter,
  LinearMipmapLinearFilter,
  NoColorSpace,
  RepeatWrapping,
  RGBAFormat,
  SRGBColorSpace,
  Vector3,
} from "three";
import { fbm, valueNoise } from "../sculpt/noise.js";

export interface ShellTextures {
  readonly color: DataTexture;
  readonly normal: DataTexture;
}

export interface Shell {
  readonly geometry: BufferGeometry;
  readonly textures: ShellTextures;
}

interface Scute {
  readonly x: number;
  readonly z: number;
  readonly weight: number;
  readonly areola: number;
}

interface Cell {
  index: number;
  edge: number;
  areola: number;
  marginal: boolean;
}

export const SHELL_CENTER = new Vector3(0, 1.2, -0.35);

export const SHELL_RADIUS_X = 3.05;

export const SHELL_RADIUS_Z = 3.6;

export const SHELL_HEIGHT = 2.8;

export const SHELL_CURL = -0.16;

const MAP_X = 4.6;

const MAP_Z = 5.0;

const MARGIN_FROM = 0.8;

const MARGINALS = 24;

const RING = 0.115;

const RING_RISE = 0.011;

const SEAM = 0.055;

const SEAM_DEPTH = 0.07;

const PILLOW = 0.1;

const MARGINAL_PILLOW = 0.05;

const TEXTURE_WIDTH = 1024;

const TEXTURE_HEIGHT = 512;

const AROUND = 120;

const UP_SEGMENTS = 44;

const RELIEF = 5.5;

const SEED = 4077;

const SCUTE_DARK = new Color("#3f3520");

const SCUTE_MID = new Color("#806b3d");

const SCUTE_LIGHT = new Color("#bba062");

const AREOLA = new Color("#a58c54");

const SEAM_COLOR = new Color("#16120a");

const MOSS_DEEP = new Color("#35501a");

const MOSS = new Color("#6a8c2a");

const MOSS_LIGHT = new Color("#a7bd4c");

const UNDERSIDE = new Color("#1d1a10");

const INNER: readonly Scute[] = [
  { x: 0, z: 3.5, weight: 0.5, areola: 0.42 },
  { x: 0, z: 1.78, weight: 0.9, areola: 0.5 },
  { x: 0, z: 0, weight: 0.9, areola: 0.5 },
  { x: 0, z: -1.78, weight: 0.9, areola: 0.5 },
  { x: 0, z: -3.5, weight: 0.5, areola: 0.42 },
  ...[1, -1].flatMap((side) => [
    { x: side * 2.3, z: 2.72, weight: 0, areola: 0.46 },
    { x: side * 2.62, z: 0.9, weight: 0.1, areola: 0.5 },
    { x: side * 2.62, z: -0.9, weight: 0.1, areola: 0.5 },
    { x: side * 2.3, z: -2.72, weight: 0, areola: 0.46 },
  ]),
];

let cached: Shell | null = null;

function clamp01(value: number): number {
  return Math.min(1, Math.max(0, value));
}

function smoothstep(from: number, to: number, value: number): number {
  const t = clamp01((value - from) / (to - from));

  return t * t * (3 - 2 * t);
}

function hash(index: number): number {
  const value = Math.sin(index * 127.1 + 311.7) * 43758.5453;

  return value - Math.floor(value);
}

function rimLift(phi: number): number {
  const front = Math.max(0, Math.cos(phi));
  const back = Math.max(0, -Math.cos(phi));

  return 0.55 * front ** 6 + 0.12 * back ** 4;
}

export function shellPoint(phi: number, theta: number, out: Vector3): Vector3 {
  const lift = rimLift(phi);
  let radial: number;
  let height: number;

  if (theta >= 0) {
    const t = Math.min(theta, Math.PI / 2);
    radial = Math.cos(t) ** 0.62 + 0.07 * Math.max(0, 1 - t / 0.28) ** 2;
    height = SHELL_HEIGHT * Math.sin(t) ** 0.92 + lift * (1 - Math.sin(t)) ** 1.5;
  } else {
    const s = theta / SHELL_CURL;
    radial = 1.07 - 0.1 * s * s;
    height = lift - 0.16 * s;
  }

  return out.set(
    SHELL_CENTER.x + SHELL_RADIUS_X * radial * Math.sin(phi),
    SHELL_CENTER.y + height,
    SHELL_CENTER.z + SHELL_RADIUS_Z * radial * Math.cos(phi),
  );
}

export function shellTop(x: number, z: number): number {
  const dx = (x - SHELL_CENTER.x) / SHELL_RADIUS_X;
  const dz = (z - SHELL_CENTER.z) / SHELL_RADIUS_Z;
  const reach = Math.hypot(dx, dz);
  const phi = Math.atan2(dx, dz);
  let low = 0.28;
  let high = Math.PI / 2;

  for (let step = 0; step < 24; step += 1) {
    const mid = (low + high) / 2;

    if (Math.cos(mid) ** 0.62 > reach) {
      low = mid;
    } else {
      high = mid;
    }
  }

  return shellPoint(phi, (low + high) / 2, new Vector3()).y;
}

function cellAt(phi: number, theta: number, out: Cell): Cell {
  const m = (Math.PI / 2 - Math.max(theta, SHELL_CURL)) / (Math.PI / 2);
  const scale = Math.hypot(MAP_X * Math.sin(phi), MAP_Z * Math.cos(phi));

  if (m >= MARGIN_FROM) {
    const sector = (Math.PI * 2) / MARGINALS;
    const wrapped = ((phi % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2);
    const index = Math.round(wrapped / sector) % MARGINALS;
    const offset = Math.abs(wrapped - Math.round(wrapped / sector) * sector);
    const side = (sector / 2 - offset) * m * scale;
    const inner = (m - MARGIN_FROM) * scale;
    out.index = 100 + index;
    out.edge = Math.max(0, Math.min(side, inner));
    out.areola = 0.2;
    out.marginal = true;

    return out;
  }

  const px = m * MAP_X * Math.sin(phi);
  const pz = m * MAP_Z * Math.cos(phi);
  let best = 0;
  let bestPower = Infinity;

  for (const [index, scute] of INNER.entries()) {
    const power = (px - scute.x) ** 2 + (pz - scute.z) ** 2 - scute.weight;

    if (power < bestPower) {
      bestPower = power;
      best = index;
    }
  }

  const home = INNER[best];
  let edge = (MARGIN_FROM - m) * scale;

  for (const [index, scute] of INNER.entries()) {
    if (index !== best) {
      const power = (px - scute.x) ** 2 + (pz - scute.z) ** 2 - scute.weight;
      const apart = Math.hypot(scute.x - home.x, scute.z - home.z);
      edge = Math.min(edge, (power - bestPower) / (2 * apart));
    }
  }

  out.index = best;
  out.edge = Math.max(0, edge);
  out.areola = home.areola;
  out.marginal = false;

  return out;
}

function fineHeight(cell: Cell, point: Vector3): number {
  const seam = -SEAM_DEPTH * (1 - smoothstep(0, SEAM, cell.edge));
  const capped = Math.min(cell.edge, cell.areola);
  const steps = capped / RING;
  const floor = Math.floor(steps);
  const terrace = RING_RISE * (floor + smoothstep(0.72, 1, steps - floor));
  const worn = cell.edge > cell.areola ? 0.006 * valueNoise(point.x * 22, point.y * 22, point.z * 22, SEED) : 0;

  return seam + terrace + worn;
}

function coarseHeight(cell: Cell): number {
  const groove = -0.05 * (1 - smoothstep(0, 0.12, cell.edge));
  const pillow = (cell.marginal ? MARGINAL_PILLOW : PILLOW) * smoothstep(0, cell.marginal ? 0.3 : 0.8, cell.edge);

  return groove + pillow;
}

function shade(cell: Cell, point: Vector3, theta: number, out: Color): Color {
  const tone = 0.8 + 0.34 * hash(cell.index);
  const capped = Math.min(cell.edge, cell.areola);
  const steps = capped / RING;
  const frac = steps - Math.floor(steps);
  const band = Math.floor(steps) % 2 === 0 ? 1.04 : 0.93;
  const riser = smoothstep(0.7, 0.95, frac) * (1 - smoothstep(0.95, 1, frac));
  out.copy(SCUTE_MID).lerp(SCUTE_DARK, 0.35 * (1 - smoothstep(0, 0.3, cell.edge)));
  out.lerp(SCUTE_LIGHT, 0.45 * smoothstep(0.02, 0.2, frac) * (1 - smoothstep(0.35, 0.7, frac)));
  out.multiplyScalar(tone * band * (1 - 0.3 * riser));

  if (cell.edge > cell.areola) {
    out.lerp(AREOLA, 0.55 * smoothstep(cell.areola, cell.areola + 0.12, cell.edge));
  }

  out.lerp(SEAM_COLOR, 1 - smoothstep(0.012, SEAM + 0.02, cell.edge));
  const lift = clamp01((point.y - SHELL_CENTER.y) / SHELL_HEIGHT);
  const growth = fbm(point.x * 0.9, point.y * 0.9, point.z * 0.9, SEED + 3, 3);
  const crevice = 1 - smoothstep(0, 0.14, cell.edge);
  const moss = smoothstep(0.6, 0.72, growth + 0.1 * crevice + 0.08 * lift) * smoothstep(0.35, 0.8, lift);
  const fleck = fbm(point.x * 7, point.y * 7, point.z * 7, SEED + 9, 2);

  const mossColor = new Color()
    .copy(MOSS_DEEP)
    .lerp(MOSS, smoothstep(0.3, 0.6, fleck))
    .lerp(MOSS_LIGHT, smoothstep(0.62, 0.8, fleck));

  out.lerp(mossColor, moss);
  out.multiplyScalar(0.72 + 0.4 * lift);

  if (theta < 0.06) {
    out.lerp(UNDERSIDE, smoothstep(0.06, SHELL_CURL, theta) * 0.85);
  }

  return out;
}

function encode(linear: number): number {
  const value = clamp01(linear);
  const srgb = value <= 0.0031308 ? value * 12.92 : 1.055 * value ** (1 / 2.4) - 0.055;

  return Math.round(srgb * 255);
}

function finish(texture: DataTexture, colorSpace: string): DataTexture {
  texture.colorSpace = colorSpace;
  texture.wrapS = RepeatWrapping;
  texture.magFilter = LinearFilter;
  texture.minFilter = LinearMipmapLinearFilter;
  texture.generateMipmaps = true;
  texture.anisotropy = 4;
  texture.needsUpdate = true;

  return texture;
}

function thetaOf(v: number): number {
  return SHELL_CURL + v * (Math.PI / 2 - SHELL_CURL);
}

function bake(): ShellTextures {
  const count = TEXTURE_WIDTH * TEXTURE_HEIGHT;
  const heights = new Float32Array(count);
  const points = new Float32Array(count * 3);
  const color = new Uint8Array(count * 4);
  const normal = new Uint8Array(count * 4);
  const cell: Cell = { index: 0, edge: 0, areola: 0, marginal: false };
  const point = new Vector3();
  const paint = new Color();

  for (let y = 0; y < TEXTURE_HEIGHT; y += 1) {
    const theta = thetaOf((y + 0.5) / TEXTURE_HEIGHT);

    for (let x = 0; x < TEXTURE_WIDTH; x += 1) {
      const phi = ((x + 0.5) / TEXTURE_WIDTH) * Math.PI * 2;
      const index = y * TEXTURE_WIDTH + x;
      shellPoint(phi, theta, point);
      cellAt(phi, theta, cell);
      heights[index] = fineHeight(cell, point);
      points[index * 3] = point.x;
      points[index * 3 + 1] = point.y;
      points[index * 3 + 2] = point.z;
      shade(cell, point, theta, paint);
      color[index * 4] = encode(paint.r);
      color[index * 4 + 1] = encode(paint.g);
      color[index * 4 + 2] = encode(paint.b);
      color[index * 4 + 3] = 255;
    }
  }

  const span = (a: number, b: number): number =>
    Math.max(
      0.004,
      Math.hypot(
        points[a * 3] - points[b * 3],
        points[a * 3 + 1] - points[b * 3 + 1],
        points[a * 3 + 2] - points[b * 3 + 2],
      ),
    );

  for (let y = 0; y < TEXTURE_HEIGHT; y += 1) {
    const down = Math.max(0, y - 1);
    const up = Math.min(TEXTURE_HEIGHT - 1, y + 1);

    for (let x = 0; x < TEXTURE_WIDTH; x += 1) {
      const index = y * TEXTURE_WIDTH + x;
      const left = y * TEXTURE_WIDTH + ((x + TEXTURE_WIDTH - 1) % TEXTURE_WIDTH);
      const right = y * TEXTURE_WIDTH + ((x + 1) % TEXTURE_WIDTH);
      const below = down * TEXTURE_WIDTH + x;
      const above = up * TEXTURE_WIDTH + x;
      const dx = ((heights[right] - heights[left]) / span(left, right)) * RELIEF * 0.2;
      const dy = ((heights[above] - heights[below]) / span(below, above)) * RELIEF * 0.2;
      const length = Math.hypot(dx, dy, 1);
      normal[index * 4] = Math.round(((-dx / length) * 0.5 + 0.5) * 255);
      normal[index * 4 + 1] = Math.round(((-dy / length) * 0.5 + 0.5) * 255);
      normal[index * 4 + 2] = Math.round(((1 / length) * 0.5 + 0.5) * 255);
      normal[index * 4 + 3] = 255;
    }
  }

  return {
    color: finish(new DataTexture(color, TEXTURE_WIDTH, TEXTURE_HEIGHT, RGBAFormat), SRGBColorSpace),
    normal: finish(new DataTexture(normal, TEXTURE_WIDTH, TEXTURE_HEIGHT, RGBAFormat), NoColorSpace),
  };
}

function carapace(): BufferGeometry {
  const columns = AROUND + 1;
  const rows = UP_SEGMENTS + 1;
  const positions = new Float32Array(columns * rows * 3);
  const uvs = new Float32Array(columns * rows * 2);
  const indices: number[] = [];
  const cell: Cell = { index: 0, edge: 0, areola: 0, marginal: false };
  const point = new Vector3();
  const along = new Vector3();
  const up = new Vector3();
  const outward = new Vector3();
  const step = 1e-3;

  for (let row = 0; row < rows; row += 1) {
    const v = row / UP_SEGMENTS;
    const theta = thetaOf(v);

    for (let column = 0; column < columns; column += 1) {
      const u = column / AROUND;
      const phi = u * Math.PI * 2;
      const index = row * columns + column;
      shellPoint(phi, theta, point);
      shellPoint(phi + step, theta, along).sub(point);
      shellPoint(phi, Math.min(Math.PI / 2, theta + step), up).sub(
        shellPoint(phi, Math.max(SHELL_CURL, theta - step), outward),
      );
      outward.crossVectors(along, up);

      if (outward.lengthSq() < 1e-12) {
        outward.set(0, 1, 0);
      }

      outward.normalize();
      const lift = row === UP_SEGMENTS ? 0 : coarseHeight(cellAt(phi, theta, cell));
      point.addScaledVector(outward, lift);
      positions[index * 3] = point.x;
      positions[index * 3 + 1] = point.y;
      positions[index * 3 + 2] = point.z;
      uvs[index * 2] = u;
      uvs[index * 2 + 1] = v;
    }
  }

  for (let row = 0; row < UP_SEGMENTS; row += 1) {
    for (let column = 0; column < AROUND; column += 1) {
      const a = row * columns + column;
      const b = a + 1;
      const c = a + columns;
      const d = c + 1;
      indices.push(a, b, c, b, d, c);
    }
  }

  const geometry = new BufferGeometry();
  geometry.setAttribute("position", new Float32BufferAttribute(positions, 3));
  geometry.setAttribute("uv", new Float32BufferAttribute(uvs, 2));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  const normals = geometry.getAttribute("normal");

  for (let row = 0; row < rows; row += 1) {
    const first = row * columns;
    const last = first + AROUND;
    const nx = normals.getX(first) + normals.getX(last);
    const ny = normals.getY(first) + normals.getY(last);
    const nz = normals.getZ(first) + normals.getZ(last);
    const length = Math.hypot(nx, ny, nz) || 1;
    normals.setXYZ(first, nx / length, ny / length, nz / length);
    normals.setXYZ(last, nx / length, ny / length, nz / length);
  }

  for (let column = 0; column < columns; column += 1) {
    normals.setXYZ(UP_SEGMENTS * columns + column, 0, 1, 0);
  }

  return geometry;
}

export function shell(): Shell {
  cached ??= { geometry: carapace(), textures: bake() };

  return cached;
}

export function shellRim(phi: number, out: Vector3): Vector3 {
  return shellPoint(phi, SHELL_CURL, out);
}
