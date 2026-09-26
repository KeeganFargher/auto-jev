import { BufferGeometry, Float32BufferAttribute, Vector3 } from "three";

export type DistanceField = (x: number, y: number, z: number) => number;

export interface FieldBounds {
  readonly min: Vector3;
  readonly max: Vector3;
}

interface GridCounts {
  readonly nx: number;
  readonly ny: number;
  readonly nz: number;
}

interface Axis {
  readonly along: readonly [number, number, number];
  readonly first: readonly [number, number, number];
  readonly second: readonly [number, number, number];
  readonly turn: number;
}

const COARSE = 4;

const BAND = 1.1;

const RELAX_PASSES = 3;

const RELAX_SHARE = 0.6;

const GRADIENT_STEP = 0.002;

const CORNERS: readonly (readonly [number, number, number])[] = [
  [0, 0, 0],
  [1, 0, 0],
  [0, 1, 0],
  [1, 1, 0],
  [0, 0, 1],
  [1, 0, 1],
  [0, 1, 1],
  [1, 1, 1],
];

const EDGES: readonly (readonly [number, number])[] = [
  [0, 1],
  [2, 3],
  [4, 5],
  [6, 7],
  [0, 2],
  [1, 3],
  [4, 6],
  [5, 7],
  [0, 4],
  [1, 5],
  [2, 6],
  [3, 7],
];

const AXES: readonly Axis[] = [
  { along: [1, 0, 0], first: [0, 1, 0], second: [0, 0, 1], turn: 1 },
  { along: [0, 1, 0], first: [1, 0, 0], second: [0, 0, 1], turn: -1 },
  { along: [0, 0, 1], first: [1, 0, 0], second: [0, 1, 0], turn: 1 },
];

function gradient(field: DistanceField, x: number, y: number, z: number, out: Vector3): Vector3 {
  const h = GRADIENT_STEP;
  const a = field(x + h, y - h, z - h);
  const b = field(x - h, y - h, z + h);
  const c = field(x - h, y + h, z - h);
  const d = field(x + h, y + h, z + h);

  return out.set(a - b - c + d, -a - b + c + d, -a + b - c + d).normalize();
}

function cellGradient(corner: Float32Array, out: Vector3): Vector3 {
  const at = (index: number): number => corner[index] ?? 0;

  return out
    .set(
      at(1) - at(0) + at(3) - at(2) + at(5) - at(4) + at(7) - at(6),
      at(2) - at(0) + at(3) - at(1) + at(6) - at(4) + at(7) - at(5),
      at(4) - at(0) + at(5) - at(1) + at(6) - at(2) + at(7) - at(3),
    )
    .normalize();
}

function sampleNarrowBand(field: DistanceField, bounds: FieldBounds, step: number, counts: GridCounts): Float32Array {
  const { min } = bounds;
  const { nx, ny, nz } = counts;
  const coarseStep = step * COARSE;
  const cx = Math.ceil((nx - 1) / COARSE) + 1;
  const cy = Math.ceil((ny - 1) / COARSE) + 1;
  const cz = Math.ceil((nz - 1) / COARSE) + 1;
  const coarse = new Float32Array(cx * cy * cz);
  const coarseAt = (i: number, j: number, k: number): number => coarse[i + cx * (j + cy * k)] ?? 1;

  for (let k = 0; k < cz; k += 1) {
    for (let j = 0; j < cy; j += 1) {
      for (let i = 0; i < cx; i += 1) {
        coarse[i + cx * (j + cy * k)] = field(min.x + i * coarseStep, min.y + j * coarseStep, min.z + k * coarseStep);
      }
    }
  }

  const reach = coarseStep * BAND;
  const near = new Uint8Array((cx - 1) * (cy - 1) * (cz - 1));
  const cellIndex = (i: number, j: number, k: number): number => i + (cx - 1) * (j + (cy - 1) * k);

  for (let k = 0; k < cz - 1; k += 1) {
    for (let j = 0; j < cy - 1; j += 1) {
      for (let i = 0; i < cx - 1; i += 1) {
        let closest = Number.POSITIVE_INFINITY;
        let inside = 0;

        for (const [ci, cj, ck] of CORNERS) {
          const value = coarseAt(i + ci, j + cj, k + ck);
          closest = Math.min(closest, Math.abs(value));
          inside += value < 0 ? 1 : 0;
        }

        near[cellIndex(i, j, k)] = closest < reach || (inside > 0 && inside < 8) ? 1 : 0;
      }
    }
  }

  const nearAny = (i: number, j: number, k: number): boolean => {
    const i0 = Math.min(cx - 2, Math.floor(i / COARSE));
    const j0 = Math.min(cy - 2, Math.floor(j / COARSE));
    const k0 = Math.min(cz - 2, Math.floor(k / COARSE));
    const i1 = i % COARSE === 0 ? Math.max(0, i0 - 1) : i0;
    const j1 = j % COARSE === 0 ? Math.max(0, j0 - 1) : j0;
    const k1 = k % COARSE === 0 ? Math.max(0, k0 - 1) : k0;

    for (let ck = k1; ck <= k0; ck += 1) {
      for (let cj = j1; cj <= j0; cj += 1) {
        for (let ci = i1; ci <= i0; ci += 1) {
          if (near[cellIndex(ci, cj, ck)] === 1) {
            return true;
          }
        }
      }
    }

    return false;
  };

  const values = new Float32Array(nx * ny * nz);

  for (let k = 0; k < nz; k += 1) {
    const ck = Math.min(cz - 2, Math.floor(k / COARSE));
    const fk = k / COARSE - ck;

    for (let j = 0; j < ny; j += 1) {
      const cj = Math.min(cy - 2, Math.floor(j / COARSE));
      const fj = j / COARSE - cj;

      for (let i = 0; i < nx; i += 1) {
        if (nearAny(i, j, k)) {
          values[i + nx * (j + ny * k)] = field(min.x + i * step, min.y + j * step, min.z + k * step);
          continue;
        }

        const ci = Math.min(cx - 2, Math.floor(i / COARSE));
        const fi = i / COARSE - ci;
        const x00 = coarseAt(ci, cj, ck) * (1 - fi) + coarseAt(ci + 1, cj, ck) * fi;
        const x10 = coarseAt(ci, cj + 1, ck) * (1 - fi) + coarseAt(ci + 1, cj + 1, ck) * fi;
        const x01 = coarseAt(ci, cj, ck + 1) * (1 - fi) + coarseAt(ci + 1, cj, ck + 1) * fi;
        const x11 = coarseAt(ci, cj + 1, ck + 1) * (1 - fi) + coarseAt(ci + 1, cj + 1, ck + 1) * fi;
        const y0 = x00 * (1 - fj) + x10 * fj;
        const y1 = x01 * (1 - fj) + x11 * fj;
        values[i + nx * (j + ny * k)] = y0 * (1 - fk) + y1 * fk;
      }
    }
  }

  return values;
}

function relax(field: DistanceField, positions: number[], normals: number[], indices: readonly number[]): void {
  const count = positions.length / 3;
  const neighbours: number[][] = Array.from({ length: count }, () => []);

  for (let index = 0; index < indices.length; index += 3) {
    const a = indices[index] ?? 0;
    const b = indices[index + 1] ?? 0;
    const c = indices[index + 2] ?? 0;
    neighbours[a]?.push(b, c);
    neighbours[b]?.push(c, a);
    neighbours[c]?.push(a, b);
  }

  const next = new Float64Array(positions.length);

  for (let pass = 0; pass < RELAX_PASSES; pass += 1) {
    for (let vertex = 0; vertex < count; vertex += 1) {
      const around = neighbours[vertex] ?? [];
      let sx = 0;
      let sy = 0;
      let sz = 0;

      for (const other of around) {
        sx += positions[other * 3] ?? 0;
        sy += positions[other * 3 + 1] ?? 0;
        sz += positions[other * 3 + 2] ?? 0;
      }

      const share = around.length === 0 ? 0 : RELAX_SHARE / around.length;
      const keep = around.length === 0 ? 1 : 1 - RELAX_SHARE;
      let x = (positions[vertex * 3] ?? 0) * keep + sx * share;
      let y = (positions[vertex * 3 + 1] ?? 0) * keep + sy * share;
      let z = (positions[vertex * 3 + 2] ?? 0) * keep + sz * share;
      const d = field(x, y, z);
      x -= d * (normals[vertex * 3] ?? 0);
      y -= d * (normals[vertex * 3 + 1] ?? 0);
      z -= d * (normals[vertex * 3 + 2] ?? 0);
      next[vertex * 3] = x;
      next[vertex * 3 + 1] = y;
      next[vertex * 3 + 2] = z;
    }

    for (const [index, value] of next.entries()) {
      positions[index] = value;
    }
  }

  const normal = new Vector3();

  for (let vertex = 0; vertex < count; vertex += 1) {
    gradient(field, positions[vertex * 3] ?? 0, positions[vertex * 3 + 1] ?? 0, positions[vertex * 3 + 2] ?? 0, normal);
    normals[vertex * 3] = normal.x;
    normals[vertex * 3 + 1] = normal.y;
    normals[vertex * 3 + 2] = normal.z;
  }
}

function orient(positions: readonly number[], normals: readonly number[], indices: number[]): void {
  const a = new Vector3();
  const b = new Vector3();
  const c = new Vector3();
  const facing = new Vector3();

  for (let index = 0; index < indices.length; index += 3) {
    const ia = indices[index] ?? 0;
    const ib = indices[index + 1] ?? 0;
    const ic = indices[index + 2] ?? 0;
    a.fromArray(positions, ia * 3);
    b.fromArray(positions, ib * 3).sub(a);
    c.fromArray(positions, ic * 3).sub(a);
    facing.crossVectors(b, c);
    const nx = (normals[ia * 3] ?? 0) + (normals[ib * 3] ?? 0) + (normals[ic * 3] ?? 0);
    const ny = (normals[ia * 3 + 1] ?? 0) + (normals[ib * 3 + 1] ?? 0) + (normals[ic * 3 + 1] ?? 0);
    const nz = (normals[ia * 3 + 2] ?? 0) + (normals[ib * 3 + 2] ?? 0) + (normals[ic * 3 + 2] ?? 0);

    if (facing.x * nx + facing.y * ny + facing.z * nz < 0) {
      indices[index + 1] = ic;
      indices[index + 2] = ib;
    }
  }
}

export function meshField(field: DistanceField, bounds: FieldBounds, step: number): BufferGeometry {
  const { min, max } = bounds;
  const nx = Math.ceil((max.x - min.x) / step) + 1;
  const ny = Math.ceil((max.y - min.y) / step) + 1;
  const nz = Math.ceil((max.z - min.z) / step) + 1;
  const values = sampleNarrowBand(field, bounds, step, { nx, ny, nz });
  const sample = (i: number, j: number, k: number): number => values[i + nx * (j + ny * k)] ?? 1;
  const cells = new Int32Array((nx - 1) * (ny - 1) * (nz - 1)).fill(-1);
  const cellOf = (i: number, j: number, k: number): number => i + (nx - 1) * (j + (ny - 1) * k);
  const positions: number[] = [];
  const normals: number[] = [];
  const corner = new Float32Array(8);
  const normal = new Vector3();

  for (let k = 0; k < nz - 1; k += 1) {
    for (let j = 0; j < ny - 1; j += 1) {
      for (let i = 0; i < nx - 1; i += 1) {
        let inside = 0;

        for (const [index, [ci, cj, ck]] of CORNERS.entries()) {
          corner[index] = sample(i + ci, j + cj, k + ck);
          inside += (corner[index] ?? 1) < 0 ? 1 : 0;
        }

        if (inside === 0 || inside === 8) {
          continue;
        }

        let sx = 0;
        let sy = 0;
        let sz = 0;
        let crossings = 0;

        for (const [a, b] of EDGES) {
          const va = corner[a] ?? 1;
          const vb = corner[b] ?? 1;

          if (va < 0 === vb < 0) {
            continue;
          }

          const t = va / (va - vb);
          const [ax, ay, az] = CORNERS[a] ?? [0, 0, 0];
          const [bx, by, bz] = CORNERS[b] ?? [0, 0, 0];
          sx += ax + (bx - ax) * t;
          sy += ay + (by - ay) * t;
          sz += az + (bz - az) * t;
          crossings += 1;
        }

        const x = min.x + (i + sx / crossings) * step;
        const y = min.y + (j + sy / crossings) * step;
        const z = min.z + (k + sz / crossings) * step;
        cells[cellOf(i, j, k)] = positions.length / 3;
        positions.push(x, y, z);
        cellGradient(corner, normal);
        normals.push(normal.x, normal.y, normal.z);
      }
    }
  }

  const indices: number[] = [];

  for (const axis of AXES) {
    const [ax, ay, az] = axis.along;
    const [fx, fy, fz] = axis.first;
    const [gx, gy, gz] = axis.second;

    for (let k = fz + gz; k < nz - 1; k += 1) {
      for (let j = fy + gy; j < ny - 1; j += 1) {
        for (let i = fx + gx; i < nx - 1; i += 1) {
          const here = sample(i, j, k);
          const next = sample(i + ax, j + ay, k + az);

          if (here < 0 === next < 0) {
            continue;
          }

          const q0 = cells[cellOf(i - fx - gx, j - fy - gy, k - fz - gz)] ?? -1;
          const q1 = cells[cellOf(i - gx, j - gy, k - gz)] ?? -1;
          const q2 = cells[cellOf(i, j, k)] ?? -1;
          const q3 = cells[cellOf(i - fx, j - fy, k - fz)] ?? -1;

          if (q0 < 0 || q1 < 0 || q2 < 0 || q3 < 0) {
            continue;
          }

          if ((here < 0 ? 1 : -1) * axis.turn > 0) {
            indices.push(q0, q1, q2, q0, q2, q3);
          } else {
            indices.push(q0, q2, q1, q0, q3, q2);
          }
        }
      }
    }
  }

  relax(field, positions, normals, indices);
  orient(positions, normals, indices);
  const geometry = new BufferGeometry();
  geometry.setAttribute("position", new Float32BufferAttribute(positions, 3));
  geometry.setAttribute("normal", new Float32BufferAttribute(normals, 3));
  geometry.setIndex(indices);
  geometry.computeBoundingSphere();

  return geometry;
}
