import { BufferGeometry, Float32BufferAttribute, Uint16BufferAttribute } from "three";
import { BODY_BOUNDS, GROUPS, HEAD_BOUNDS, bodyBones, bodyParts, headParts } from "./anatomy.js";
import { crestFlames, type CrestFlame } from "./crest.js";
import { bakeOcclusion, localField, skinWeights } from "./sdf.js";
import { meshField, type DistanceField } from "./surface-nets.js";

export interface VesperGeometry {
  readonly body: BufferGeometry;
  readonly head: BufferGeometry;
  readonly crest: readonly CrestFlame[];
}

const BODY_STEP = 0.062;

const HEAD_STEP = 0.04;

const FIELD_CELL = 0.2;

const FIELD_REACH = 0.42;

const HEAD_CELL = 0.1;

const HEAD_REACH = 0.26;

let cached: VesperGeometry | null = null;

function shade(geometry: BufferGeometry, field: DistanceField): void {
  const light = bakeOcclusion(field, geometry.getAttribute("position").array, geometry.getAttribute("normal").array);
  const colors = new Float32Array(light.length * 3);

  for (const [index, value] of light.entries()) {
    colors[index * 3] = value;
    colors[index * 3 + 1] = value;
    colors[index * 3 + 2] = value;
  }

  geometry.setAttribute("color", new Float32BufferAttribute(colors, 3));
}

export function vesperGeometry(): VesperGeometry {
  if (cached !== null) {
    return cached;
  }

  const parts = bodyParts();
  const field = localField(parts, BODY_BOUNDS, FIELD_CELL, FIELD_REACH);
  const body = meshField(field, BODY_BOUNDS, BODY_STEP);
  shade(body, field);
  const skin = skinWeights(parts, bodyBones(), GROUPS, body.getAttribute("position").array);
  body.setAttribute("skinIndex", new Uint16BufferAttribute(skin.indices, 4));
  body.setAttribute("skinWeight", new Float32BufferAttribute(skin.weights, 4));
  const headField = localField(headParts(), HEAD_BOUNDS, HEAD_CELL, HEAD_REACH);
  const head = meshField(headField, HEAD_BOUNDS, HEAD_STEP);
  shade(head, headField);
  cached = { body, head, crest: crestFlames(field) };

  return cached;
}
