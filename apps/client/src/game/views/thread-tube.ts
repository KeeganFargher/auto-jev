import { BufferAttribute, BufferGeometry, DynamicDrawUsage, Mesh, Vector3, type Material } from "three";

export interface TubeBatch {
  readonly mesh: Mesh;
  begin(): void;
  tube(points: readonly Vector3[], radius: (along: number) => number): void;
  end(): void;
  dispose(): void;
}

export interface TubeCapacity {
  readonly tubes: number;
  readonly rings: number;
  readonly sides: number;
}

const UP = new Vector3(0, 1, 0);

const SIDE = new Vector3(1, 0, 0);

export function samplePolyline(points: readonly Vector3[], along: number, out: Vector3): Vector3 {
  const last = points.length - 1;

  if (last <= 0) {
    return out.copy(points[0] ?? out);
  }

  const scaled = Math.min(Math.max(along, 0), 1) * last;
  const index = Math.min(Math.floor(scaled), last - 1);

  return out.lerpVectors(points[index]!, points[index + 1]!, scaled - index);
}

export function createTubeBatch(material: Material, capacity: TubeCapacity): TubeBatch {
  const { tubes, rings, sides } = capacity;
  const vertexTotal = tubes * rings * sides;
  const positions = new BufferAttribute(new Float32Array(vertexTotal * 3), 3);
  const normals = new BufferAttribute(new Float32Array(vertexTotal * 3), 3);
  positions.setUsage(DynamicDrawUsage);
  normals.setUsage(DynamicDrawUsage);
  const perTube = (rings - 1) * sides * 6;
  const indices = new Uint32Array(tubes * perTube);
  let cursor = 0;

  for (let slot = 0; slot < tubes; slot += 1) {
    const base = slot * rings * sides;

    for (let ring = 0; ring < rings - 1; ring += 1) {
      for (let side = 0; side < sides; side += 1) {
        const a = base + ring * sides + side;
        const b = base + ring * sides + ((side + 1) % sides);
        const c = a + sides;
        const d = b + sides;
        indices.set([a, c, b, b, c, d], cursor);
        cursor += 6;
      }
    }
  }

  const geometry = new BufferGeometry();
  geometry.setAttribute("position", positions);
  geometry.setAttribute("normal", normals);
  geometry.setIndex(new BufferAttribute(indices, 1));
  geometry.setDrawRange(0, 0);
  const mesh = new Mesh(geometry, material);
  mesh.frustumCulled = false;
  const tangent = new Vector3();
  const across = new Vector3();
  const over = new Vector3();
  const point = new Vector3();
  const ahead = new Vector3();
  const behind = new Vector3();
  const radial = new Vector3();
  let used = 0;

  return {
    mesh,

    begin() {
      used = 0;
    },

    tube(points, radius) {
      if (used >= tubes || points.length < 2) {
        return;
      }

      const data = positions.array;
      const normalData = normals.array;
      const base = used * rings * sides;

      for (let ring = 0; ring < rings; ring += 1) {
        const along = ring / (rings - 1);
        samplePolyline(points, along, point);
        samplePolyline(points, Math.min(1, along + 0.5 / (rings - 1)), ahead);
        samplePolyline(points, Math.max(0, along - 0.5 / (rings - 1)), behind);
        tangent.subVectors(ahead, behind);

        if (tangent.lengthSq() < 1e-10) {
          tangent.set(0, 0, 1);
        }

        tangent.normalize();
        across.crossVectors(tangent, Math.abs(tangent.y) < 0.95 ? UP : SIDE).normalize();
        over.crossVectors(across, tangent);
        const size = Math.max(0, radius(along));

        for (let side = 0; side < sides; side += 1) {
          const angle = (side / sides) * Math.PI * 2;
          radial.copy(across).multiplyScalar(Math.cos(angle)).addScaledVector(over, Math.sin(angle));
          const vertex = (base + ring * sides + side) * 3;
          data[vertex] = point.x + radial.x * size;
          data[vertex + 1] = point.y + radial.y * size;
          data[vertex + 2] = point.z + radial.z * size;
          normalData[vertex] = radial.x;
          normalData[vertex + 1] = radial.y;
          normalData[vertex + 2] = radial.z;
        }
      }

      used += 1;
    },

    end() {
      geometry.setDrawRange(0, used * perTube);
      positions.needsUpdate = true;
      normals.needsUpdate = true;
      mesh.visible = used > 0;
    },

    dispose() {
      mesh.removeFromParent();
      geometry.dispose();
    },
  };
}
