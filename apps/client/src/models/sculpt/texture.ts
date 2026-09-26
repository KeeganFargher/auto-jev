import {
  ClampToEdgeWrapping,
  DataTexture,
  LinearFilter,
  LinearMipmapLinearFilter,
  NoColorSpace,
  RepeatWrapping,
  RGBAFormat,
  SRGBColorSpace,
} from "three";
import { periodicFbm, periodicNoise } from "./noise.js";

export interface BarkTextures {
  readonly detail: DataTexture;
  readonly normal: DataTexture;
}

interface Leaf {
  readonly x: number;
  readonly y: number;
  readonly angle: number;
  readonly length: number;
  readonly width: number;
  readonly teeth: number;
}

interface Stem {
  readonly from: readonly [number, number];
  readonly to: readonly [number, number];
  readonly width: number;
}

interface Sprig {
  readonly leaves: readonly Leaf[];
  readonly stems: readonly Stem[];
}

export const LEAF_CELLS = 2;

export const FROND_CELL = 3;

const BARK_WIDTH = 256;

const BARK_HEIGHT = 512;

const BARK_BANDS = 5;

const BARK_PLATES = 2;

const BARK_RELIEF = 4.5;

const LEAF_SIZE = 512;

const CELL_PIXELS = LEAF_SIZE / LEAF_CELLS;

const LEAF_TINT = [0.86, 1, 0.66] as const;

const STEM_TINT = [0.62, 0.55, 0.34] as const;

let bark: BarkTextures | null = null;

let leaves: DataTexture | null = null;

function clamp01(value: number): number {
  return Math.min(1, Math.max(0, value));
}

function smoothstep(from: number, to: number, value: number): number {
  const t = clamp01((value - from) / (to - from));

  return t * t * (3 - 2 * t);
}

function encode(linear: number): number {
  const value = clamp01(linear);
  const srgb = value <= 0.0031308 ? value * 12.92 : 1.055 * value ** (1 / 2.4) - 0.055;

  return Math.round(srgb * 255);
}

function barkHeight(u: number, v: number): number {
  const warp = periodicFbm(u, v, 3, 2, 11, 3) - 0.5;
  const wobble = periodicFbm(u, v, 6, 10, 12, 2) - 0.5;
  const band = u * BARK_BANDS + warp * 2.6 + wobble * 0.6;
  const index = Math.floor(band);
  const across = Math.abs(band - index - 0.5) * 2;
  const shift = periodicNoise(((index % BARK_BANDS) + BARK_BANDS) % BARK_BANDS, 0, BARK_BANDS, 1, 13);
  const along = v * BARK_PLATES + shift * 3 + warp * 0.8;
  const end = Math.abs(along - Math.floor(along) - 0.5) * 2;
  const plate = 1 - across ** 3.2;
  const split = smoothstep(0.9, 0.985, end) * 0.35;
  const fibre = periodicFbm(u, v, 40, 6, 14, 2);

  return Math.max(0, plate * (1 - split)) * (0.84 + 0.16 * fibre);
}

function makeBark(): BarkTextures {
  const heights = new Float32Array(BARK_WIDTH * BARK_HEIGHT);

  for (let y = 0; y < BARK_HEIGHT; y += 1) {
    for (let x = 0; x < BARK_WIDTH; x += 1) {
      heights[y * BARK_WIDTH + x] = barkHeight(x / BARK_WIDTH, y / BARK_HEIGHT);
    }
  }

  const detail = new Uint8Array(BARK_WIDTH * BARK_HEIGHT * 4);
  const normal = new Uint8Array(BARK_WIDTH * BARK_HEIGHT * 4);

  const at = (x: number, y: number): number =>
    heights[((y + BARK_HEIGHT) % BARK_HEIGHT) * BARK_WIDTH + ((x + BARK_WIDTH) % BARK_WIDTH)];

  for (let y = 0; y < BARK_HEIGHT; y += 1) {
    for (let x = 0; x < BARK_WIDTH; x += 1) {
      const index = (y * BARK_WIDTH + x) * 4;
      const height = at(x, y);
      const tone = 0.86 + 0.28 * periodicFbm(x / BARK_WIDTH, y / BARK_HEIGHT, 2, 4, 15, 2);
      const crevice = 0.62 + 0.38 * smoothstep(0.02, 0.35, height);
      const value = (0.5 + 0.5 * height ** 0.8) * crevice * tone;
      detail[index] = encode(value);
      detail[index + 1] = encode(value * 0.94);
      detail[index + 2] = encode(value * 0.84);
      detail[index + 3] = 255;
      const dx = ((at(x + 1, y) - at(x - 1, y)) / 2) * BARK_RELIEF;
      const dy = ((at(x, y + 1) - at(x, y - 1)) / 2) * BARK_RELIEF;
      const length = Math.hypot(dx, dy, 1);
      normal[index] = Math.round(((-dx / length) * 0.5 + 0.5) * 255);
      normal[index + 1] = Math.round(((-dy / length) * 0.5 + 0.5) * 255);
      normal[index + 2] = Math.round(((1 / length) * 0.5 + 0.5) * 255);
      normal[index + 3] = 255;
    }
  }

  return {
    detail: finish(new DataTexture(detail, BARK_WIDTH, BARK_HEIGHT, RGBAFormat), SRGBColorSpace, RepeatWrapping),
    normal: finish(new DataTexture(normal, BARK_WIDTH, BARK_HEIGHT, RGBAFormat), NoColorSpace, RepeatWrapping),
  };
}

function finish(
  texture: DataTexture,
  colorSpace: string,
  wrap: typeof RepeatWrapping | typeof ClampToEdgeWrapping,
): DataTexture {
  texture.colorSpace = colorSpace;
  texture.wrapS = wrap;
  texture.wrapT = wrap;
  texture.magFilter = LinearFilter;
  texture.minFilter = LinearMipmapLinearFilter;
  texture.generateMipmaps = true;
  texture.anisotropy = 4;
  texture.needsUpdate = true;

  return texture;
}

export function barkTextures(): BarkTextures {
  bark ??= makeBark();

  return bark;
}

function leafWidth(leaf: Leaf, along: number): number {
  const body = Math.sin(Math.PI * along ** 0.72) ** 0.9 * leaf.width;

  if (leaf.teeth === 0) {
    return body;
  }

  const saw = (along * leaf.teeth + 0.3) % 1;
  const edge = smoothstep(0.04, 0.2, along) * (1 - smoothstep(0.86, 1, along));

  return body * (1 - 0.17 * saw * edge);
}

function paintLeaf(leaf: Leaf, px: number, py: number, out: number[]): number {
  const dx = px - leaf.x;
  const dy = py - leaf.y;
  const sin = Math.sin(leaf.angle);
  const cos = Math.cos(leaf.angle);
  const along = (dx * sin + dy * cos) / leaf.length;
  const side = (dx * cos - dy * sin) / leaf.length;

  if (along <= 0 || along >= 1) {
    return 0;
  }

  const width = leafWidth(leaf, along);
  const coverage = clamp01((width - Math.abs(side)) * leaf.length * CELL_PIXELS + 0.5);

  if (coverage <= 0) {
    return 0;
  }

  const spine = Math.abs(side) < 0.016 * (1.1 - along) + 0.004 ? 0.2 : 0;
  const rib = (along - Math.abs(side) * 0.85) / 0.105;
  const vein = Math.abs(side) < width * 0.86 && Math.abs(rib - Math.floor(rib) - 0.5) * 0.105 < 0.0065 ? 0.13 : 0;
  const fold = side > 0 ? 1.06 : 0.93;
  const rim = 1 - 0.14 * smoothstep(0.55, 1, Math.abs(side) / Math.max(width, 1e-4));
  const value = (0.6 + 0.32 * along + spine + vein) * fold * rim;
  out[0] = value * LEAF_TINT[0];
  out[1] = value * LEAF_TINT[1];
  out[2] = value * LEAF_TINT[2];

  return coverage;
}

function paintStem(stem: Stem, px: number, py: number, out: number[]): number {
  const [ax, ay] = stem.from;
  const [bx, by] = stem.to;
  const lx = bx - ax;
  const ly = by - ay;
  const t = clamp01(((px - ax) * lx + (py - ay) * ly) / (lx * lx + ly * ly));
  const distance = Math.hypot(px - ax - lx * t, py - ay - ly * t);
  const coverage = clamp01((stem.width / 2 - distance) * CELL_PIXELS + 0.5);
  out[0] = STEM_TINT[0];
  out[1] = STEM_TINT[1];
  out[2] = STEM_TINT[2];

  return coverage;
}

function sprigs(): readonly Sprig[] {
  const leaf = (x: number, y: number, angle: number, length: number, width = 0.36, teeth = 11): Leaf => ({
    x,
    y,
    angle,
    length,
    width,
    teeth,
  });

  const stem = (from: readonly [number, number], to: readonly [number, number], width: number): Stem => ({
    from,
    to,
    width,
  });

  const frond: Leaf[] = [];

  for (let y = 0.08; y < 0.93; y += 0.052) {
    const reach = 0.34 * Math.sin(Math.PI * ((y - 0.04) / 0.94) ** 0.75) + 0.05;
    frond.push(leaf(0.494, y, -1.12, reach, 0.2, 0), leaf(0.506, y + 0.02, 1.12, reach, 0.2, 0));
  }

  frond.push(leaf(0.5, 0.9, 0, 0.1, 0.24, 0));

  return [
    { leaves: [leaf(0.5, 0.05, 0, 0.93)], stems: [stem([0.5, 0], [0.5, 0.08], 0.02)] },
    {
      leaves: [leaf(0.5, 0.46, 0, 0.52), leaf(0.49, 0.3, -0.92, 0.44), leaf(0.51, 0.2, 0.96, 0.44)],
      stems: [stem([0.5, 0], [0.5, 0.5], 0.022)],
    },
    {
      leaves: [
        leaf(0.5, 0.56, 0, 0.42),
        leaf(0.49, 0.43, -0.86, 0.37),
        leaf(0.51, 0.34, 0.86, 0.37),
        leaf(0.49, 0.2, -1.12, 0.34),
        leaf(0.51, 0.12, 1.16, 0.33),
      ],
      stems: [stem([0.5, 0], [0.5, 0.6], 0.02)],
    },
    { leaves: frond, stems: [stem([0.5, 0], [0.5, 0.97], 0.014)] },
  ];
}

function makeLeaves(): DataTexture {
  const data = new Uint8Array(LEAF_SIZE * LEAF_SIZE * 4);
  const shade = [0, 0, 0];
  const cells = sprigs();

  for (let cell = 0; cell < cells.length; cell += 1) {
    const sprig = cells[cell];
    const originX = (cell % LEAF_CELLS) * CELL_PIXELS;
    const originY = Math.floor(cell / LEAF_CELLS) * CELL_PIXELS;

    for (let y = 0; y < CELL_PIXELS; y += 1) {
      for (let x = 0; x < CELL_PIXELS; x += 1) {
        const px = (x + 0.5) / CELL_PIXELS;
        const py = (y + 0.5) / CELL_PIXELS;
        let red = 0.5 * LEAF_TINT[0];
        let green = 0.5 * LEAF_TINT[1];
        let blue = 0.5 * LEAF_TINT[2];
        let alpha = 0;

        for (const stem of sprig.stems) {
          const coverage = paintStem(stem, px, py, shade);
          red += (shade[0] - red) * coverage;
          green += (shade[1] - green) * coverage;
          blue += (shade[2] - blue) * coverage;
          alpha = coverage + alpha * (1 - coverage);
        }

        for (const leaf of sprig.leaves) {
          const coverage = paintLeaf(leaf, px, py, shade);
          red += (shade[0] - red) * coverage;
          green += (shade[1] - green) * coverage;
          blue += (shade[2] - blue) * coverage;
          alpha = coverage + alpha * (1 - coverage);
        }

        const index = ((originY + y) * LEAF_SIZE + originX + x) * 4;
        data[index] = encode(red);
        data[index + 1] = encode(green);
        data[index + 2] = encode(blue);
        data[index + 3] = Math.round(clamp01(alpha) * 255);
      }
    }
  }

  return finish(new DataTexture(data, LEAF_SIZE, LEAF_SIZE, RGBAFormat), SRGBColorSpace, ClampToEdgeWrapping);
}

export function leafAtlas(): DataTexture {
  leaves ??= makeLeaves();

  return leaves;
}
