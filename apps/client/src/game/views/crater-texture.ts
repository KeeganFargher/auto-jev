import {
  DataTexture,
  LinearFilter,
  LinearMipmapLinearFilter,
  RGBAFormat,
  SRGBColorSpace,
  UnsignedByteType,
} from "three";
import { createRng, nextFloat, type RngState } from "@jev-game/game";

interface GradientStop {
  readonly at: number;
  readonly color: readonly [number, number, number];
  readonly alpha: number;
}

const TEXELS = 256;

const CENTER = TEXELS / 2;

const SEED = 11207;

const GRADIENT: readonly GradientStop[] = [
  { at: 0, color: [12, 8, 6], alpha: 0.85 },
  { at: 0.35, color: [20, 14, 10], alpha: 0.6 },
  { at: 1, color: [20, 14, 10], alpha: 0 },
];

const CRACK_COLOR = [8, 5, 4] as const;

const CRACK_ALPHA = 0.95;

const CRACKS = 9;

const CRACK_WIDTH = 5;

const CRACK_STEP = 10;

const CRACK_WANDER = 0.7;

const CRACK_START_JITTER = 0.4;

const CRACK_SHORTEST = 70;

const CRACK_EXTRA_LENGTH = 45;

const BRANCH_CHANCE = 0.18;

const BRANCH_TURN = 1.6;

const BRANCH_LENGTH = 0.4;

const BRANCH_WIDTH = 0.6;

const THINNEST_BRANCHING = 1.5;

let cached: DataTexture | null = null;

function gradientAt(fraction: number): GradientStop {
  for (let index = 1; index < GRADIENT.length; index += 1) {
    const from = GRADIENT[index - 1];
    const to = GRADIENT[index];

    if (fraction <= to.at) {
      const amount = (fraction - from.at) / (to.at - from.at);

      return {
        at: fraction,
        color: [
          from.color[0] + (to.color[0] - from.color[0]) * amount,
          from.color[1] + (to.color[1] - from.color[1]) * amount,
          from.color[2] + (to.color[2] - from.color[2]) * amount,
        ],
        alpha: from.alpha + (to.alpha - from.alpha) * amount,
      };
    }
  }

  throw new Error(`Crater gradient has no stop at ${fraction}`);
}

function strokeSegment(
  coverage: Float32Array,
  fromX: number,
  fromY: number,
  toX: number,
  toY: number,
  width: number,
): void {
  const reach = width / 2 + 1;
  const minX = Math.max(0, Math.floor(Math.min(fromX, toX) - reach));
  const maxX = Math.min(TEXELS - 1, Math.ceil(Math.max(fromX, toX) + reach));
  const minY = Math.max(0, Math.floor(Math.min(fromY, toY) - reach));
  const maxY = Math.min(TEXELS - 1, Math.ceil(Math.max(fromY, toY) + reach));
  const alongX = toX - fromX;
  const alongY = toY - fromY;
  const lengthSquared = alongX * alongX + alongY * alongY;

  for (let y = minY; y <= maxY; y += 1) {
    for (let x = minX; x <= maxX; x += 1) {
      const pointX = x + 0.5 - fromX;
      const pointY = y + 0.5 - fromY;
      const along = Math.min(1, Math.max(0, (pointX * alongX + pointY * alongY) / lengthSquared));
      const gap = Math.hypot(pointX - alongX * along, pointY - alongY * along);
      const covered = Math.min(1, Math.max(0, width / 2 + 0.5 - gap));
      const texel = y * TEXELS + x;
      coverage[texel] = Math.max(coverage[texel], covered);
    }
  }
}

function crack(
  rng: RngState,
  coverage: Float32Array,
  startX: number,
  startY: number,
  heading: number,
  length: number,
  width: number,
): void {
  let x = startX;
  let y = startY;
  let turn = heading;

  for (let travelled = 0; travelled < length; travelled += CRACK_STEP) {
    turn += (nextFloat(rng) - 0.5) * CRACK_WANDER;
    const nextX = x + Math.cos(turn) * CRACK_STEP;
    const nextY = y + Math.sin(turn) * CRACK_STEP;
    strokeSegment(coverage, x, y, nextX, nextY, width);
    x = nextX;
    y = nextY;

    if (width > THINNEST_BRANCHING && nextFloat(rng) < BRANCH_CHANCE) {
      crack(
        rng,
        coverage,
        x,
        y,
        turn + (nextFloat(rng) - 0.5) * BRANCH_TURN,
        length * BRANCH_LENGTH,
        width * BRANCH_WIDTH,
      );
    }
  }
}

export function craterTexels(): Uint8Array {
  const rng = createRng(SEED);
  const coverage = new Float32Array(TEXELS * TEXELS);

  for (let index = 0; index < CRACKS; index += 1) {
    crack(
      rng,
      coverage,
      CENTER,
      CENTER,
      (index / CRACKS) * Math.PI * 2 + nextFloat(rng) * CRACK_START_JITTER,
      CRACK_SHORTEST + nextFloat(rng) * CRACK_EXTRA_LENGTH,
      CRACK_WIDTH,
    );
  }

  const texels = new Uint8Array(TEXELS * TEXELS * 4);

  for (let y = 0; y < TEXELS; y += 1) {
    for (let x = 0; x < TEXELS; x += 1) {
      const texel = y * TEXELS + x;
      const fraction = Math.min(1, Math.hypot(x + 0.5 - CENTER, y + 0.5 - CENTER) / CENTER);
      const ground = gradientAt(fraction);
      const over = coverage[texel] * CRACK_ALPHA;
      const alpha = over + ground.alpha * (1 - over);
      const under = alpha > 0 ? (ground.alpha * (1 - over)) / alpha : 0;
      const top = alpha > 0 ? over / alpha : 0;
      texels[texel * 4] = Math.round(CRACK_COLOR[0] * top + ground.color[0] * under);
      texels[texel * 4 + 1] = Math.round(CRACK_COLOR[1] * top + ground.color[1] * under);
      texels[texel * 4 + 2] = Math.round(CRACK_COLOR[2] * top + ground.color[2] * under);
      texels[texel * 4 + 3] = Math.round(alpha * 255);
    }
  }

  return texels;
}

export function craterTexture(): DataTexture {
  if (cached === null) {
    const texture = new DataTexture(craterTexels(), TEXELS, TEXELS, RGBAFormat, UnsignedByteType);
    texture.colorSpace = SRGBColorSpace;
    texture.magFilter = LinearFilter;
    texture.minFilter = LinearMipmapLinearFilter;
    texture.generateMipmaps = true;
    texture.needsUpdate = true;
    cached = texture;
  }

  return cached;
}
