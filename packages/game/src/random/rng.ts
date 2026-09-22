export const RNG_ALGORITHM = "mulberry32";

export const RNG_VERSION = 1;

export interface RngState {
  algorithm: typeof RNG_ALGORITHM;
  version: typeof RNG_VERSION;
  state: number;
}

export function createRng(seed: number): RngState {
  return { algorithm: RNG_ALGORITHM, version: RNG_VERSION, state: seed >>> 0 };
}

export function nextFloat(rng: RngState): number {
  rng.state = (rng.state + 0x6d2b79f5) >>> 0;
  let t = rng.state;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);

  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}

export function nextInt(rng: RngState, exclusiveMax: number): number {
  return Math.floor(nextFloat(rng) * exclusiveMax);
}

export function cloneRng(rng: RngState): RngState {
  return { algorithm: rng.algorithm, version: rng.version, state: rng.state };
}
