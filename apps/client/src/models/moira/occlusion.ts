import { Vector3 } from "three";
import type { SphereField } from "./sphere-field.js";

const MARCH = [0.035, 0.09, 0.18, 0.32, 0.55] as const;

const LIFT_OFF = 0.012;

const SURFACE_SLACK = 0.003;

const FLOOR = 0.12;

const CURVE = 1.1;

const GOLDEN_ANGLE = Math.PI * (3 - Math.sqrt(5));

function hemisphere(rays: number): Vector3[] {
  const directions: Vector3[] = [];

  for (let ray = 0; ray < rays; ray += 1) {
    const height = Math.sqrt(1 - (ray + 0.5) / rays);
    const spread = Math.sqrt(1 - height * height);
    const angle = ray * GOLDEN_ANGLE;
    directions.push(new Vector3(spread * Math.cos(angle), spread * Math.sin(angle), height));
  }

  return directions;
}

export function bakeOcclusion(
  field: SphereField,
  positions: Float32Array,
  normals: Float32Array,
  rays: number,
): Float32Array {
  const count = positions.length / 3;
  const light = new Float32Array(count);
  const directions = hemisphere(rays);
  const point = new Vector3();
  const normal = new Vector3();
  const across = new Vector3();
  const along = new Vector3();
  const helper = new Vector3();
  const ray = new Vector3();
  const probe = new Vector3();

  for (let vertex = 0; vertex < count; vertex += 1) {
    point.fromArray(positions, vertex * 3);
    normal.fromArray(normals, vertex * 3);
    helper.set(Math.abs(normal.x) < 0.9 ? 1 : 0, Math.abs(normal.x) < 0.9 ? 0 : 1, 0);
    across.crossVectors(helper, normal).normalize();
    along.crossVectors(normal, across);
    let open = 0;

    for (const direction of directions) {
      ray
        .copy(across)
        .multiplyScalar(direction.x)
        .addScaledVector(along, direction.y)
        .addScaledVector(normal, direction.z);
      let blocked = false;

      for (const distance of MARCH) {
        probe.copy(point).addScaledVector(normal, LIFT_OFF).addScaledVector(ray, distance);

        if (probe.length() < field.heightAt(probe) - SURFACE_SLACK) {
          blocked = true;
          break;
        }
      }

      if (!blocked) {
        open += 1;
      }
    }

    light[vertex] = FLOOR + (1 - FLOOR) * (open / directions.length) ** CURVE;
  }

  return light;
}
