import {
  BufferGeometry,
  CircleGeometry,
  Color,
  Float32BufferAttribute,
  LatheGeometry,
  Matrix4,
  Quaternion,
  SphereGeometry,
  Vector2,
  Vector3,
} from "three";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";

const UP = new Vector3(0, 1, 0);

const FORWARD = new Vector3(0, 0, 1);

export function paintVertices(
  geometry: BufferGeometry,
  paint: (point: Vector3, normal: Vector3, out: Color) => void,
): BufferGeometry {
  const positions = geometry.getAttribute("position");
  const normals = geometry.getAttribute("normal");
  const colors = new Float32Array(positions.count * 3);
  const point = new Vector3();
  const normal = new Vector3();
  const color = new Color();

  for (let index = 0; index < positions.count; index += 1) {
    point.fromBufferAttribute(positions, index);
    normal.fromBufferAttribute(normals, index);
    paint(point, normal, color);
    colors[index * 3] = color.r;
    colors[index * 3 + 1] = color.g;
    colors[index * 3 + 2] = color.b;
  }

  geometry.setAttribute("color", new Float32BufferAttribute(colors, 3));

  return geometry;
}

export function bare(geometry: BufferGeometry): BufferGeometry {
  geometry.deleteAttribute("uv");

  return geometry.index === null ? geometry : geometry.toNonIndexed();
}

export function merge(geometries: readonly BufferGeometry[]): BufferGeometry {
  const merged = mergeGeometries(geometries.map(bare));

  for (const geometry of geometries) {
    geometry.dispose();
  }

  return merged;
}

export function placed(
  geometry: BufferGeometry,
  position: Vector3,
  up: Vector3,
  facing: Vector3,
  scale: Vector3,
): BufferGeometry {
  const y = up.clone().normalize();
  const z = facing.clone().sub(y.clone().multiplyScalar(facing.dot(y)));

  if (z.lengthSq() < 1e-6) {
    const fallback = Math.abs(y.z) < 0.9 ? FORWARD : UP;
    z.copy(fallback).sub(y.clone().multiplyScalar(fallback.dot(y)));
  }

  z.normalize();
  const x = new Vector3().crossVectors(y, z);
  const rotation = new Quaternion().setFromRotationMatrix(new Matrix4().makeBasis(x, y, z));

  return geometry.applyMatrix4(new Matrix4().compose(position, rotation, scale));
}

export function lathe(profile: readonly (readonly [number, number])[], segments: number): BufferGeometry {
  return new LatheGeometry(
    profile.map(([radius, height]) => new Vector2(radius, height)),
    segments,
  );
}

export function dome(segments: number, rings: number, half: boolean): BufferGeometry {
  return new SphereGeometry(1, segments, rings, 0, half ? Math.PI : Math.PI * 2, 0, Math.PI / 2);
}

export function disc(segments: number, half: boolean): BufferGeometry {
  return new CircleGeometry(1, segments, 0, half ? Math.PI : Math.PI * 2).rotateX(Math.PI / 2);
}
