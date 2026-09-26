import { BufferGeometry, CatmullRomCurve3, Color, Float32BufferAttribute, Vector3 } from "three";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";
import { fbm, seededRandom, valueNoise } from "./noise.js";

export interface TubeOptions {
  readonly radius: (t: number) => number;
  readonly sides: number;
  readonly segments: number;
  readonly lumps: number;
  readonly seed: number;
  readonly reference: Vector3;
  readonly turns: number;
  readonly repeat: number;
  readonly oval?: readonly [number, number];
}

export interface BundleOptions {
  readonly count: number;
  readonly radius: (t: number) => number;
  readonly oval: readonly [number, number];
  readonly twist: number;
  readonly reference: Vector3;
  readonly samples: number;
  readonly seed: number;
}

export interface BarkPaint {
  readonly base: Color;
  readonly light: Color;
  readonly moss: Color;
  readonly mossLight: Color;
}

export type Shade = (point: Vector3, normal: Vector3) => number;

export type Mossy = (point: Vector3, normal: Vector3) => number;

interface Frame {
  readonly point: Vector3;
  readonly tangent: Vector3;
  readonly normal: Vector3;
  readonly binormal: Vector3;
}

const FALLBACK = new Vector3(0, 0, 1);

function frames(curve: CatmullRomCurve3, count: number, reference: Vector3): Frame[] {
  const out: Frame[] = [];

  for (let index = 0; index <= count; index += 1) {
    const t = index / count;
    const point = curve.getPointAt(t);
    const tangent = curve.getTangentAt(t).normalize();
    const axis = Math.abs(tangent.dot(reference)) > 0.97 ? FALLBACK : reference;
    const normal = axis.clone().addScaledVector(tangent, -axis.dot(tangent)).normalize();
    const binormal = new Vector3().crossVectors(tangent, normal).normalize();
    out.push({ point, tangent, normal, binormal });
  }

  return out;
}

export function tube(path: readonly Vector3[], options: TubeOptions): BufferGeometry {
  const curve = new CatmullRomCurve3(
    path.map((point) => point.clone()),
    false,
    "centripetal",
  );

  const length = curve.getLength();
  const rings = frames(curve, options.segments, options.reference);
  const positions: number[] = [];
  const uvs: number[] = [];
  const indices: number[] = [];
  const offset = new Vector3();
  const stride = options.sides + 1;
  const [ovalNormal, ovalBinormal] = options.oval ?? [1, 1];

  for (let ring = 0; ring < rings.length; ring += 1) {
    const t = ring / options.segments;
    const frame = rings[ring];
    const radius = options.radius(t);

    for (let side = 0; side <= options.sides; side += 1) {
      const angle = ((side % options.sides) / options.sides) * Math.PI * 2;

      const lump =
        1 +
        options.lumps *
          (valueNoise(Math.cos(angle) * 1.6 + 7, Math.sin(angle) * 1.6, t * length * 2.2, options.seed) - 0.5) *
          2;

      offset
        .copy(frame.normal)
        .multiplyScalar(Math.cos(angle) * ovalNormal)
        .addScaledVector(frame.binormal, Math.sin(angle) * ovalBinormal)
        .multiplyScalar(radius * lump);
      positions.push(frame.point.x + offset.x, frame.point.y + offset.y, frame.point.z + offset.z);
      uvs.push((side / options.sides) * options.turns, t * length * options.repeat);
    }
  }

  for (let ring = 0; ring < options.segments; ring += 1) {
    for (let side = 0; side < options.sides; side += 1) {
      const a = ring * stride + side;
      const b = a + 1;
      const c = a + stride;
      const d = c + 1;
      indices.push(a, c, b, b, c, d);
    }
  }

  const geometry = new BufferGeometry();
  geometry.setAttribute("position", new Float32BufferAttribute(positions, 3));
  geometry.setAttribute("uv", new Float32BufferAttribute(uvs, 2));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  const normals = geometry.getAttribute("normal");
  const seam = new Vector3();

  for (let ring = 0; ring < rings.length; ring += 1) {
    const first = ring * stride;
    const last = first + options.sides;
    seam
      .set(
        normals.getX(first) + normals.getX(last),
        normals.getY(first) + normals.getY(last),
        normals.getZ(first) + normals.getZ(last),
      )
      .normalize();
    normals.setXYZ(first, seam.x, seam.y, seam.z);
    normals.setXYZ(last, seam.x, seam.y, seam.z);
  }

  return geometry;
}

export function bundle(center: readonly Vector3[], options: BundleOptions): Vector3[][] {
  const curve = new CatmullRomCurve3(
    center.map((point) => point.clone()),
    false,
    "centripetal",
  );

  const rings = frames(curve, options.samples, options.reference);
  const random = seededRandom(options.seed);
  const strands: Vector3[][] = [];

  for (let strand = 0; strand < options.count; strand += 1) {
    const phase = (strand / options.count) * Math.PI * 2 + (random() - 0.5) * 0.5;
    const path: Vector3[] = [];

    for (let index = 0; index < rings.length; index += 1) {
      const t = index / options.samples;
      const frame = rings[index];
      const angle = phase + options.twist * t;
      const radius = options.radius(t);
      path.push(
        frame.point
          .clone()
          .addScaledVector(frame.normal, Math.cos(angle) * radius * options.oval[0])
          .addScaledVector(frame.binormal, Math.sin(angle) * radius * options.oval[1]),
      );
    }

    strands.push(path);
  }

  return strands;
}

export function bundleShade(center: readonly Vector3[], depth: number): Shade {
  const curve = new CatmullRomCurve3(
    center.map((point) => point.clone()),
    false,
    "centripetal",
  );

  const samples = curve.getSpacedPoints(32);
  const outward = new Vector3();

  return (point, normal) => {
    let nearest = samples[0];
    let best = Number.POSITIVE_INFINITY;

    for (const sample of samples) {
      const distance = sample.distanceToSquared(point);

      if (distance < best) {
        best = distance;
        nearest = sample;
      }
    }

    outward.copy(point).sub(nearest).normalize();
    const facing = normal.dot(outward);

    return 1 - depth * (1 - Math.min(1, Math.max(0, (facing + 0.35) / 1.1)));
  };
}

export function paintBark(
  geometry: BufferGeometry,
  paint: BarkPaint,
  shade: Shade,
  mossy: Mossy,
  seed: number,
): BufferGeometry {
  const positions = geometry.getAttribute("position");
  const normals = geometry.getAttribute("normal");
  const colors = new Float32Array(positions.count * 3);
  const point = new Vector3();
  const normal = new Vector3();
  const color = new Color();
  const moss = new Color();

  for (let index = 0; index < positions.count; index += 1) {
    point.fromBufferAttribute(positions, index);
    normal.fromBufferAttribute(normals, index);
    const tone = fbm(point.x * 2.2, point.y * 1.1, point.z * 2.2, seed, 3);
    const lift = 0.6 + 0.46 * Math.min(1, Math.max(0, point.y / 3));
    const light = shade(point, normal) * lift * (0.75 + 0.25 * (normal.y * 0.5 + 0.5));
    color.copy(paint.base).lerp(paint.light, Math.min(1, Math.max(0, (tone - 0.35) * 1.6)));
    const cover = mossy(point, normal);

    if (cover > 0) {
      const fleck = valueNoise(point.x * 22, point.y * 22, point.z * 22, seed + 3);
      moss.copy(paint.moss).lerp(paint.mossLight, Math.min(1, Math.max(0, normal.y * 0.7 + fleck * 0.5)));
      color.lerp(moss, Math.min(1, cover * (0.7 + 0.5 * fleck)));
    }

    color.multiplyScalar(light);
    colors[index * 3] = color.r;
    colors[index * 3 + 1] = color.g;
    colors[index * 3 + 2] = color.b;
  }

  geometry.setAttribute("color", new Float32BufferAttribute(colors, 3));

  return geometry;
}

export function mergeTextured(geometries: readonly BufferGeometry[]): BufferGeometry {
  const indexed = geometries.every((geometry) => geometry.index !== null);

  const merged = mergeGeometries(
    indexed
      ? [...geometries]
      : geometries.map((geometry) => (geometry.index === null ? geometry : geometry.toNonIndexed())),
  );

  for (const geometry of geometries) {
    geometry.dispose();
  }

  return merged;
}
