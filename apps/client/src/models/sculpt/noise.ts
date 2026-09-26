function lattice(x: number, y: number, z: number, seed: number): number {
  let h = Math.imul(x, 0x27d4eb2d) ^ Math.imul(y, 0x165667b1) ^ Math.imul(z, 0x1b873593) ^ Math.imul(seed, 0x85ebca6b);
  h = Math.imul(h ^ (h >>> 15), 0x2c1b3c6d);
  h = Math.imul(h ^ (h >>> 12), 0x297a2d39);
  h ^= h >>> 15;

  return (h >>> 0) / 4294967296;
}

function fade(t: number): number {
  return t * t * (3 - 2 * t);
}

function mix(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

export function valueNoise(x: number, y: number, z: number, seed = 0): number {
  const ix = Math.floor(x);
  const iy = Math.floor(y);
  const iz = Math.floor(z);
  const ux = fade(x - ix);
  const uy = fade(y - iy);
  const uz = fade(z - iz);
  const a = mix(lattice(ix, iy, iz, seed), lattice(ix + 1, iy, iz, seed), ux);
  const b = mix(lattice(ix, iy + 1, iz, seed), lattice(ix + 1, iy + 1, iz, seed), ux);
  const c = mix(lattice(ix, iy, iz + 1, seed), lattice(ix + 1, iy, iz + 1, seed), ux);
  const d = mix(lattice(ix, iy + 1, iz + 1, seed), lattice(ix + 1, iy + 1, iz + 1, seed), ux);

  return mix(mix(a, b, uy), mix(c, d, uy), uz);
}

export function fbm(x: number, y: number, z: number, seed = 0, octaves = 3): number {
  let sum = 0;
  let amplitude = 0.5;
  let frequency = 1;
  let total = 0;

  for (let octave = 0; octave < octaves; octave += 1) {
    sum += amplitude * valueNoise(x * frequency, y * frequency, z * frequency, seed + octave * 31);
    total += amplitude;
    amplitude *= 0.5;
    frequency *= 2.03;
  }

  return sum / total;
}

export function seededRandom(seed: number): () => number {
  let state = seed >>> 0;

  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);

    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function wrap(value: number, period: number): number {
  return ((value % period) + period) % period;
}

export function periodicNoise(x: number, y: number, periodX: number, periodY: number, seed = 0): number {
  const ix = Math.floor(x);
  const iy = Math.floor(y);
  const ux = fade(x - ix);
  const uy = fade(y - iy);
  const x0 = wrap(ix, periodX);
  const x1 = wrap(ix + 1, periodX);
  const y0 = wrap(iy, periodY);
  const y1 = wrap(iy + 1, periodY);
  const a = mix(lattice(x0, y0, 0, seed), lattice(x1, y0, 0, seed), ux);
  const b = mix(lattice(x0, y1, 0, seed), lattice(x1, y1, 0, seed), ux);

  return mix(a, b, uy);
}

export function periodicFbm(u: number, v: number, cellsX: number, cellsY: number, seed = 0, octaves = 3): number {
  let sum = 0;
  let amplitude = 0.5;
  let scale = 1;
  let total = 0;

  for (let octave = 0; octave < octaves; octave += 1) {
    sum +=
      amplitude *
      periodicNoise(u * cellsX * scale, v * cellsY * scale, cellsX * scale, cellsY * scale, seed + octave * 31);
    total += amplitude;
    amplitude *= 0.5;
    scale *= 2;
  }

  return sum / total;
}
