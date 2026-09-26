import {
  BufferGeometry,
  Color,
  DoubleSide,
  Float32BufferAttribute,
  MeshDepthMaterial,
  MeshStandardMaterial,
  ShaderChunk,
  Vector3,
} from "three";
import { seededRandom } from "./noise.js";
import { FROND_CELL, LEAF_CELLS, leafAtlas } from "./texture.js";

export interface LeafClump {
  readonly center: Vector3;
  readonly radii: Vector3;
  readonly cards: number;
  readonly size: number;
}

export interface LeafPalette {
  readonly deep: Color;
  readonly mid: Color;
  readonly tip: Color;
}

export interface Frond {
  readonly at: Vector3;
  readonly outward: Vector3;
  readonly length: number;
  readonly width: number;
}

export interface LeafMaterial {
  readonly material: MeshStandardMaterial;
  readonly depth: MeshDepthMaterial;
  advance(deltaSeconds: number): void;
  dispose(): void;
}

interface CardBuffers {
  readonly positions: number[];
  readonly normals: number[];
  readonly uvs: number[];
  readonly colors: number[];
  readonly sways: number[];
}

const ALPHA_TEST = 0.5;

const SPRIG_CELLS = [0, 1, 1, 2, 2, 2] as const;

const FOLD = 0.1;

const CLUMP_WEIGHT = 0.6;

const CROWN_WEIGHT = 0.32;

const CARD_WEIGHT = 0.08;

const FROND_SEGMENTS = 5;

const WIND_SPEED = 1.6;

const WIND_REACH = 0.02;

const UP = new Vector3(0, 1, 0);

function cellUv(cell: number, u: number, v: number): [number, number] {
  const column = cell % LEAF_CELLS;
  const row = Math.floor(cell / LEAF_CELLS);

  return [(column + 0.02 + u * 0.96) / LEAF_CELLS, (row + 0.01 + v * 0.98) / LEAF_CELLS];
}

function direction(random: () => number): Vector3 {
  const out = new Vector3(random() * 2 - 1, random() * 2 - 1, random() * 2 - 1);

  while (out.lengthSq() > 1 || out.lengthSq() < 0.01) {
    out.set(random() * 2 - 1, random() * 2 - 1, random() * 2 - 1);
  }

  return out.normalize();
}

function perpendicular(axis: Vector3, random: () => number): Vector3 {
  const guess = new Vector3(random() - 0.5, random() - 0.5, random() - 0.5);

  return guess.addScaledVector(axis, -guess.dot(axis)).normalize();
}

function push(
  buffers: CardBuffers,
  point: Vector3,
  normal: Vector3,
  uv: readonly [number, number],
  color: Color,
  sway: number,
): void {
  buffers.positions.push(point.x, point.y, point.z);
  buffers.normals.push(normal.x, normal.y, normal.z);
  buffers.uvs.push(uv[0], uv[1]);
  buffers.colors.push(color.r, color.g, color.b);
  buffers.sways.push(sway);
}

function toGeometry(buffers: CardBuffers): BufferGeometry {
  const geometry = new BufferGeometry();
  geometry.setAttribute("position", new Float32BufferAttribute(buffers.positions, 3));
  geometry.setAttribute("normal", new Float32BufferAttribute(buffers.normals, 3));
  geometry.setAttribute("uv", new Float32BufferAttribute(buffers.uvs, 2));
  geometry.setAttribute("color", new Float32BufferAttribute(buffers.colors, 3));
  geometry.setAttribute("sway", new Float32BufferAttribute(buffers.sways, 1));
  geometry.computeBoundingSphere();

  return geometry;
}

function buffers(): CardBuffers {
  return { positions: [], normals: [], uvs: [], colors: [], sways: [] };
}

export function leafCards(
  clumps: readonly LeafClump[],
  crownCenter: Vector3,
  palette: LeafPalette,
  seed: number,
  hidden: (point: Vector3) => boolean,
): BufferGeometry {
  const random = seededRandom(seed);
  const out = buffers();
  const normal = new Vector3();
  const blend = new Vector3();
  const color = new Color();
  const tint = new Color();
  const corners = Array.from({ length: 6 }, () => new Vector3());
  const bent = Array.from({ length: 6 }, () => new Vector3());

  for (const clump of clumps) {
    for (let card = 0; card < clump.cards; card += 1) {
      const radial = direction(random);
      radial.y = radial.y * 0.85 + 0.2;
      radial.normalize();
      const depth = 0.62 + 0.4 * random();
      const base = clump.center.clone().add(radial.clone().multiply(clump.radii).multiplyScalar(depth));

      if (hidden(base)) {
        continue;
      }

      const face = radial
        .clone()
        .add(new Vector3(random() - 0.5, random() - 0.5, random() - 0.5).multiplyScalar(0.9))
        .normalize();

      const axis = perpendicular(face, random).addScaledVector(radial, 0.35).addScaledVector(UP, -0.18).normalize();
      face.addScaledVector(axis, -face.dot(axis)).normalize();
      const across = new Vector3().crossVectors(axis, face).normalize();
      const size = clump.size * (0.8 + 0.4 * random());
      const width = size * 0.92;
      const start = base.clone().addScaledVector(axis, -size * 0.12);
      const end = base.clone().addScaledVector(axis, size * 0.88);
      corners[0].copy(start).addScaledVector(across, -width / 2);
      corners[1].copy(start).addScaledVector(face, size * FOLD);
      corners[2].copy(start).addScaledVector(across, width / 2);
      corners[3].copy(end).addScaledVector(across, -width / 2);
      corners[4].copy(end).addScaledVector(face, size * FOLD);
      corners[5].copy(end).addScaledVector(across, width / 2);
      const cell = SPRIG_CELLS[Math.floor(random() * SPRIG_CELLS.length)];
      const flip = random() < 0.5;
      const uvs = [0, 0.5, 1, 0, 0.5, 1].map((u, index) => cellUv(cell, flip ? 1 - u : u, index < 3 ? 0 : 1));
      const crown = base.clone().sub(crownCenter).normalize();
      const inner = (depth - 0.62) / 0.4;
      const light = 0.12 + 0.46 * inner + 0.5 * (crown.y * 0.5 + 0.5);
      const shine = Math.max(0, crown.y - 0.05) * random() * 0.9;
      tint.setHSL(0, 0, 0.8 + 0.35 * random());

      const cardColor = palette.deep
        .clone()
        .lerp(palette.mid, Math.min(1, light))
        .lerp(palette.tip, Math.min(0.65, shine))
        .multiply(tint);

      for (let index = 0; index < 6; index += 1) {
        const point = corners[index];
        normal.copy(point).sub(clump.center).divide(clump.radii).normalize().multiplyScalar(CLUMP_WEIGHT);
        blend.copy(point).sub(crownCenter).normalize().multiplyScalar(CROWN_WEIGHT);
        normal.add(blend).addScaledVector(face, CARD_WEIGHT).normalize();
        bent[index].copy(normal);
      }

      const order = [0, 1, 4, 0, 4, 3, 1, 2, 5, 1, 5, 4];

      for (const index of order) {
        color.copy(cardColor);
        push(out, corners[index], bent[index], uvs[index], color, index < 3 ? 0.15 : 1);
      }
    }
  }

  return toGeometry(out);
}

export function frondCards(fronds: readonly Frond[], palette: LeafPalette, seed: number): BufferGeometry {
  const random = seededRandom(seed);
  const out = buffers();
  const spine: Vector3[] = [];
  const normal = new Vector3();
  const color = new Color();

  for (const frond of fronds) {
    spine.length = 0;
    const outward = frond.outward.clone().setY(0).normalize();
    const across = new Vector3().crossVectors(UP, outward).normalize();
    const curl = 0.25 + random() * 0.2;

    for (let step = 0; step <= FROND_SEGMENTS; step += 1) {
      const t = step / FROND_SEGMENTS;
      spine.push(
        frond.at
          .clone()
          .addScaledVector(outward, frond.length * (0.22 * t + curl * t * t * 0.4))
          .addScaledVector(UP, -frond.length * t),
      );
    }

    const tip = palette.mid.clone().lerp(palette.tip, 0.35 + random() * 0.3);

    for (let step = 0; step < FROND_SEGMENTS; step += 1) {
      const t0 = step / FROND_SEGMENTS;
      const t1 = (step + 1) / FROND_SEGMENTS;
      const width0 = frond.width * (1 - t0 * 0.35);
      const width1 = frond.width * (1 - t1 * 0.35);

      const quad = [
        spine[step].clone().addScaledVector(across, -width0 / 2),
        spine[step].clone().addScaledVector(across, width0 / 2),
        spine[step + 1].clone().addScaledVector(across, -width1 / 2),
        spine[step + 1].clone().addScaledVector(across, width1 / 2),
      ];

      const uvs = [
        cellUv(FROND_CELL, 0, t0),
        cellUv(FROND_CELL, 1, t0),
        cellUv(FROND_CELL, 0, t1),
        cellUv(FROND_CELL, 1, t1),
      ];

      const sways = [t0, t0, t1, t1];

      for (const index of [0, 2, 1, 1, 2, 3]) {
        normal.copy(outward).multiplyScalar(0.7).addScaledVector(UP, 0.3).normalize();
        color.copy(palette.deep).lerp(tip, 0.4 + 0.6 * (index < 2 ? t0 : t1));
        push(out, quad[index], normal, uvs[index], color, sways[index] * 1.6);
      }
    }
  }

  return toGeometry(out);
}

const WIND_VERTEX = `
float windPhase = windTime * ${WIND_SPEED.toFixed(2)} + dot(position, vec3(2.3, 1.1, 1.9));
transformed += vec3(sin(windPhase), 0.4 * sin(windPhase * 1.31 + 1.1), cos(windPhase * 0.87)) * (${WIND_REACH.toFixed(3)} * sway);
`;

export function createLeafMaterial(): LeafMaterial {
  const atlas = leafAtlas();
  const wind = { value: Math.random() * 10 };

  const material = new MeshStandardMaterial({
    map: atlas,
    vertexColors: true,
    alphaTest: ALPHA_TEST,
    alphaToCoverage: true,
    side: DoubleSide,
    roughness: 0.78,
    metalness: 0,
  });

  material.onBeforeCompile = (shader) => {
    shader.uniforms.windTime = wind;
    shader.vertexShader = shader.vertexShader
      .replace("#include <common>", "#include <common>\nattribute float sway;\nuniform float windTime;")
      .replace("#include <begin_vertex>", `#include <begin_vertex>\n${WIND_VERTEX}`);
    shader.fragmentShader = shader.fragmentShader.replace(
      "#include <normal_fragment_begin>",
      ShaderChunk.normal_fragment_begin.replace("normal *= faceDirection;", ""),
    );
  };

  material.customProgramCacheKey = () => "sculpt-leaf";
  const depth = new MeshDepthMaterial({ map: atlas, alphaTest: ALPHA_TEST, side: DoubleSide });

  return {
    material,
    depth,

    advance(deltaSeconds) {
      wind.value += deltaSeconds;
    },

    dispose() {
      material.dispose();
      depth.dispose();
    },
  };
}
