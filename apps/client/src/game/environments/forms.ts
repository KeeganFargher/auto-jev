import {
  BufferGeometry,
  Color,
  CylinderGeometry,
  Float32BufferAttribute,
  IcosahedronGeometry,
  LatheGeometry,
  PlaneGeometry,
  Vector2,
  type ColorRepresentation,
} from "three";
import type { PropKit } from "./prop-kit.js";

export type Profile = readonly (readonly [number, number])[];

type Point = [number, number, number];

const FROND_SEGMENTS = 6;

export function frondGeometry(length: number, width: number, rise: number, droop: number): BufferGeometry {
  const positions: number[] = [];

  function spine(step: number): Point {
    const along = step / FROND_SEGMENTS;

    return [length * along, rise * along - droop * along * along, 0];
  }

  function edge(step: number, direction: number): Point {
    const along = step / FROND_SEGMENTS;
    const half = (width / 2) * Math.pow(Math.sin(Math.PI * along), 0.7);
    const [x, y] = spine(step);

    return [x, y - half * 0.45, direction * half];
  }

  for (let step = 0; step < FROND_SEGMENTS; step += 1) {
    for (const direction of [-1, 1]) {
      const near = spine(step);
      const far = spine(step + 1);
      const farEdge = edge(step + 1, direction);
      const nearEdge = edge(step, direction);
      positions.push(...near, ...far, ...farEdge, ...near, ...farEdge, ...nearEdge);
    }
  }

  const geometry = new BufferGeometry();
  geometry.setAttribute("position", new Float32BufferAttribute(positions, 3));
  geometry.computeVertexNormals();

  return geometry;
}

export function rockGeometry(kit: PropKit, radius: number, flatten: number, detail = 1): BufferGeometry {
  const geometry = new IcosahedronGeometry(radius, detail);
  const position = geometry.getAttribute("position");
  const scales = new Map<string, number>();

  for (let index = 0; index < position.count; index += 1) {
    const x = position.getX(index);
    const y = position.getY(index);
    const z = position.getZ(index);
    const key = `${Math.round(x * 100)}:${Math.round(y * 100)}:${Math.round(z * 100)}`;
    let scale = scales.get(key);

    if (scale === undefined) {
      scale = kit.between(0.8, 1.12);
      scales.set(key, scale);
    }

    position.setXYZ(index, x * scale, Math.max(y * scale * flatten, -radius * 0.2), z * scale);
  }

  geometry.computeVertexNormals();

  return geometry;
}

export function latheGeometry(profile: Profile, segments: number): LatheGeometry {
  return new LatheGeometry(
    profile.map(([radius, height]) => new Vector2(radius, height)),
    segments,
  );
}

export function islandGeometry(
  kit: PropKit,
  radius: number,
  height: number,
  flare: number,
  wobble: number,
): BufferGeometry {
  const geometry = new CylinderGeometry(radius, radius * flare, height, 56, 2);
  const phases = [kit.between(0, Math.PI * 2), kit.between(0, Math.PI * 2), kit.between(0, Math.PI * 2)];
  const position = geometry.getAttribute("position");

  for (let index = 0; index < position.count; index += 1) {
    const x = position.getX(index);
    const z = position.getZ(index);
    const angle = Math.atan2(z, x);

    const scale =
      1 +
      wobble *
        (0.55 * Math.sin(3 * angle + phases[0]!) +
          0.3 * Math.sin(5 * angle + phases[1]!) +
          0.15 * Math.sin(11 * angle + phases[2]!));

    position.setXYZ(index, x * scale, position.getY(index), z * scale);
  }

  geometry.computeVertexNormals();

  return geometry;
}

export interface Clearing {
  x: number;
  z: number;
  radius: number;
}

export interface TerrainOptions {
  size: number;
  segments: number;
  height: number;
  flatRadius: number;
  rampWidth: number;
  low: ColorRepresentation;
  high: ColorRepresentation;
  clearings: readonly Clearing[];
}

export function terrainGeometry(kit: PropKit, options: TerrainOptions): BufferGeometry {
  const geometry = new PlaneGeometry(options.size, options.size, options.segments, options.segments);
  geometry.rotateX(-Math.PI / 2);

  const position = geometry.getAttribute("position");
  const colors: number[] = [];
  const low = new Color(options.low);
  const high = new Color(options.high);
  const phases = Array.from({ length: 6 }, () => kit.between(0, Math.PI * 2));
  const tint = new Color();

  for (let index = 0; index < position.count; index += 1) {
    const x = position.getX(index);
    const z = position.getZ(index);
    const distance = Math.hypot(x, z);
    let mask = Math.min(1, Math.max(0, (distance - options.flatRadius) / options.rampWidth));

    for (const clearing of options.clearings) {
      const reach = Math.hypot(x - clearing.x, z - clearing.z);
      mask = Math.min(mask, Math.max(0, (reach - clearing.radius) / (clearing.radius * 0.8)));
    }

    const noise =
      0.5 +
      0.22 * Math.sin(x * 0.045 + phases[0]!) * Math.cos(z * 0.05 + phases[1]!) +
      0.16 * Math.sin(x * 0.11 + z * 0.07 + phases[2]!) +
      0.12 * Math.cos(z * 0.13 - x * 0.05 + phases[3]!);

    const jitter = kit.between(-0.08, 0.08);
    position.setY(index, options.height * mask * noise);
    tint.copy(low).lerp(high, Math.min(1, Math.max(0, noise * mask + jitter + 0.1)));
    colors.push(tint.r, tint.g, tint.b);
  }

  geometry.setAttribute("color", new Float32BufferAttribute(colors, 3));
  geometry.computeVertexNormals();

  return geometry;
}
