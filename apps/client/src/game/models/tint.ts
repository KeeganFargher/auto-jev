import type { TintRule } from "./catalogue.js";

const MIN_SATURATION = 0.15;

function clamp01(value: number): number {
  return Math.min(1, Math.max(0, value));
}

function withinHues(hue: number, [from, to]: readonly [number, number]): boolean {
  return from <= to ? hue >= from && hue <= to : hue >= from || hue <= to;
}

function hueToChannel(p: number, q: number, t: number): number {
  const wrapped = t < 0 ? t + 1 : t > 1 ? t - 1 : t;

  if (wrapped < 1 / 6) {
    return p + (q - p) * 6 * wrapped;
  }

  if (wrapped < 1 / 2) {
    return q;
  }

  if (wrapped < 2 / 3) {
    return p + (q - p) * (2 / 3 - wrapped) * 6;
  }

  return p;
}

function tintedColor(
  red: number,
  green: number,
  blue: number,
  rules: readonly TintRule[],
): number | null {
  const r = red / 255;
  const g = green / 255;
  const b = blue / 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const lightness = (max + min) / 2;
  const chroma = max - min;

  if (chroma === 0) {
    return null;
  }

  const saturation = chroma / (1 - Math.abs(2 * lightness - 1));

  if (saturation < MIN_SATURATION) {
    return null;
  }

  const sector =
    max === r
      ? ((g - b) / chroma + 6) % 6
      : max === g
        ? (b - r) / chroma + 2
        : (r - g) / chroma + 4;

  const hue = sector * 60;
  const rule = rules.find((candidate) => withinHues(hue, candidate.hues));

  if (rule === undefined) {
    return null;
  }

  const s = clamp01(saturation * rule.saturation);
  const l = clamp01(lightness + rule.lightness);
  const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
  const p = 2 * l - q;
  const h = rule.hue / 360;

  return (
    (Math.round(hueToChannel(p, q, h + 1 / 3) * 255) << 16) |
    (Math.round(hueToChannel(p, q, h) * 255) << 8) |
    Math.round(hueToChannel(p, q, h - 1 / 3) * 255)
  );
}

export function tintPixels(pixels: Uint8ClampedArray, rules: readonly TintRule[]): void {
  if (pixels.length % 4 !== 0) {
    throw new Error(`Tinting needs RGBA pixels, got ${pixels.length} bytes`);
  }

  const cache = new Map<number, number | null>();

  for (let index = 0; index < pixels.length; index += 4) {
    const red = pixels[index];
    const green = pixels[index + 1];
    const blue = pixels[index + 2];
    const key = (red << 16) | (green << 8) | blue;
    let tinted = cache.get(key);

    if (tinted === undefined) {
      tinted = tintedColor(red, green, blue, rules);
      cache.set(key, tinted);
    }

    if (tinted !== null) {
      pixels[index] = tinted >> 16;
      pixels[index + 1] = (tinted >> 8) & 0xff;
      pixels[index + 2] = tinted & 0xff;
    }
  }
}
