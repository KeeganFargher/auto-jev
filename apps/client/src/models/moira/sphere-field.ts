import { Vector3 } from "three";

export interface SphereField {
  readonly resolution: number;
  heightAt(direction: Vector3): number;
  raise(direction: Vector3, height: number): void;
  raiseEverywhere(heightFor: (direction: Vector3) => number): void;
}

interface Texel {
  face: number;
  column: number;
  row: number;
}

const FACES = 6;

export function createSphereField(resolution: number, baseHeight: number): SphereField {
  const faces = Array.from({ length: FACES }, () => new Float32Array(resolution * resolution).fill(baseHeight));
  const texel: Texel = { face: 0, column: 0, row: 0 };
  const last = resolution - 1;

  function locate(direction: Vector3): void {
    const { x, y, z } = direction;
    const ax = Math.abs(x);
    const ay = Math.abs(y);
    const az = Math.abs(z);
    let a: number;
    let b: number;

    if (ax >= ay && ax >= az) {
      texel.face = x > 0 ? 0 : 1;
      a = y / ax;
      b = z / ax;
    } else if (ay >= az) {
      texel.face = y > 0 ? 2 : 3;
      a = x / ay;
      b = z / ay;
    } else {
      texel.face = z > 0 ? 4 : 5;
      a = x / az;
      b = y / az;
    }

    texel.column = ((a + 1) / 2) * resolution - 0.5;
    texel.row = ((b + 1) / 2) * resolution - 0.5;
  }

  function cell(face: Float32Array, column: number, row: number): number {
    return face[row * resolution + column] ?? 0;
  }

  return {
    resolution,

    heightAt(direction) {
      locate(direction);
      const face = faces[texel.face];

      if (face === undefined) {
        return baseHeight;
      }

      const column = Math.min(Math.max(Math.floor(texel.column), 0), last);
      const row = Math.min(Math.max(Math.floor(texel.row), 0), last);
      const nextColumn = Math.min(column + 1, last);
      const nextRow = Math.min(row + 1, last);
      const across = Math.min(Math.max(texel.column - column, 0), 1);
      const down = Math.min(Math.max(texel.row - row, 0), 1);
      const top = cell(face, column, row) * (1 - across) + cell(face, nextColumn, row) * across;
      const bottom = cell(face, column, nextRow) * (1 - across) + cell(face, nextColumn, nextRow) * across;

      return top * (1 - down) + bottom * down;
    },

    raise(direction, height) {
      locate(direction);
      const face = faces[texel.face];

      if (face === undefined) {
        return;
      }

      const column = Math.min(Math.max(Math.round(texel.column), 0), last);
      const row = Math.min(Math.max(Math.round(texel.row), 0), last);
      const index = row * resolution + column;

      if ((face[index] ?? 0) < height) {
        face[index] = height;
      }
    },

    raiseEverywhere(heightFor) {
      const direction = new Vector3();

      for (let faceIndex = 0; faceIndex < FACES; faceIndex += 1) {
        const face = faces[faceIndex]!;

        for (let row = 0; row < resolution; row += 1) {
          for (let column = 0; column < resolution; column += 1) {
            const a = ((column + 0.5) / resolution) * 2 - 1;
            const b = ((row + 0.5) / resolution) * 2 - 1;
            const sign = faceIndex % 2 === 0 ? 1 : -1;

            if (faceIndex < 2) {
              direction.set(sign, a, b);
            } else if (faceIndex < 4) {
              direction.set(a, sign, b);
            } else {
              direction.set(a, b, sign);
            }

            direction.normalize();
            const index = row * resolution + column;
            face[index] = Math.max(face[index] ?? 0, heightFor(direction));
          }
        }
      }
    },
  };
}
