import {
  BufferAttribute,
  BufferGeometry,
  Color,
  Group,
  Matrix4,
  Mesh,
  MeshPhysicalMaterial,
  SphereGeometry,
  Vector3,
  type Material,
  type Texture,
} from "three";
import { bakeOcclusion } from "./occlusion.js";
import {
  sweepIndexCount,
  sweepVertexCount,
  writeSweep,
  writeSweepIndices,
  type Sweep,
  type SweepStyle,
} from "./ribbon.js";
import type { SphereField } from "./sphere-field.js";

export interface EyeDesign {
  readonly axis: Vector3;
  readonly centerDistance: number;
  readonly radius: number;
  readonly lidGap: number;
  readonly upperEdge: number;
  readonly lowerEdge: number;
  readonly closedEdge: number;
  readonly roll: number;
  readonly lidTint: Color;
}

export interface EyeDetail {
  readonly segments: number;
  readonly lidWraps: number;
  readonly lidSides: number;
  readonly lidStep: number;
  readonly rays: number;
}

interface LidPiece {
  readonly geometry: BufferGeometry;
  readonly fraction: number;
}

interface LidWrap {
  readonly mesh: Mesh;
  readonly fraction: number;
}

export interface EyeKit {
  readonly placement: Matrix4;
  readonly eyeball: BufferGeometry;
  readonly upper: readonly LidPiece[];
  readonly lower: readonly LidPiece[];
  readonly lowerShut: number;
  readonly triangles: number;
}

export interface Eye {
  readonly root: Group;
  readonly eyeball: Mesh;
  update(deltaSeconds: number): void;
  gaze(yaw: number, pitch: number): void;
  wander(): void;
  blink(): void;
  setOpenness(amount: number): void;
}

const LID_THICKNESS = 0.13;

const MARGIN_WIDTH = 0.4;

const MARGIN_THICKNESS = 0.26;

const MARGIN_RAISE = 0.03;

const SHINGLE = 0.018;

const LID_WIDTH_OVERLAP = 1.3;

const LID_CORNER = 0.18;

const UPPER_BACK = 1.02;

const LOWER_BACK = -0.95;

export const LID_SHELL = 0.14;

const LID_TILE = 1.2;

const SACCADE_RATE = 22;

const LID_RATE = 30;

const CLOSE_SECONDS = 0.07;

const SHUT_SECONDS = 0.05;

const OPEN_SECONDS = 0.13;

const LID_FOLLOW = 0.55;

const WANDER_YAW = 0.34;

const WANDER_PITCH = 0.16;

const OPEN_RATE = 18;

const WIDEST_UPPER = UPPER_BACK - 0.12;

const WIDEST_LOWER = LOWER_BACK + 0.12;

function wrapSweep(detail: EyeDetail, lift: number, width: number, thickness: number): Sweep {
  const arc = Math.PI - LID_CORNER * 2;
  const count = Math.max(12, Math.ceil((arc * lift) / detail.lidStep));
  const points: Vector3[] = [];
  const ups: Vector3[] = [];
  const widths: number[] = [];

  for (let index = 0; index <= count; index += 1) {
    const along = index / count;
    const angle = LID_CORNER + along * arc;
    const radial = new Vector3(Math.cos(angle), 0, Math.sin(angle));
    points.push(radial.clone().multiplyScalar(lift));
    ups.push(radial);
    widths.push(width * (0.5 + 0.5 * Math.sin(along * Math.PI) ** 0.4));
  }

  return { points, ups, widths, thicknesses: Array.from({ length: points.length }, () => thickness), closed: false };
}

function sweepGeometry(sweep: Sweep, style: SweepStyle): BufferGeometry {
  const vertexTotal = sweepVertexCount(sweep, style);
  const positions = new Float32Array(vertexTotal * 3);
  const normals = new Float32Array(vertexTotal * 3);
  const tangents = new Float32Array(vertexTotal * 4);
  const uvs = new Float32Array(vertexTotal * 2);
  const indices = new Uint32Array(sweepIndexCount(sweep, style));
  writeSweep(sweep, style, { positions, normals, tangents, uvs }, 0, true);
  writeSweepIndices(sweep, style, indices, 0, 0);
  const geometry = new BufferGeometry();
  geometry.setAttribute("position", new BufferAttribute(positions, 3));
  geometry.setAttribute("normal", new BufferAttribute(normals, 3));
  geometry.setAttribute("tangent", new BufferAttribute(tangents, 4));
  geometry.setAttribute("uv", new BufferAttribute(uvs, 2));
  geometry.setIndex(new BufferAttribute(indices, 1));
  geometry.computeBoundingSphere();

  return geometry;
}

function shadeLid(geometry: BufferGeometry, placement: Matrix4, field: SphereField, rays: number, tint: Color): void {
  const position = geometry.getAttribute("position");
  const normal = geometry.getAttribute("normal");
  const count = position.count;
  const positions = new Float32Array(count * 3);
  const normals = new Float32Array(count * 3);
  const point = new Vector3();
  const facing = new Vector3();
  const turn = new Matrix4().extractRotation(placement);

  for (let vertex = 0; vertex < count; vertex += 1) {
    point.fromBufferAttribute(position, vertex).applyMatrix4(placement);
    facing.fromBufferAttribute(normal, vertex).applyMatrix4(turn).normalize();
    point.toArray(positions, vertex * 3);
    facing.toArray(normals, vertex * 3);
  }

  const light = bakeOcclusion(field, positions, normals, rays);
  const colors = new Float32Array(count * 3);

  for (let vertex = 0; vertex < count; vertex += 1) {
    const shade = light[vertex] ?? 1;
    colors[vertex * 3] = tint.r * shade;
    colors[vertex * 3 + 1] = tint.g * shade;
    colors[vertex * 3 + 2] = tint.b * shade;
  }

  geometry.setAttribute("color", new BufferAttribute(colors, 3));
}

function planarIrisUvs(geometry: BufferGeometry, radius: number): void {
  const position = geometry.getAttribute("position");
  const uvs = new Float32Array(position.count * 2);

  for (let vertex = 0; vertex < position.count; vertex += 1) {
    const x = position.getX(vertex);
    const y = position.getY(vertex);
    const z = position.getZ(vertex);
    const front = z > -radius * 0.2;
    uvs[vertex * 2] = front ? x / (2 * radius) + 0.5 : 0.02;
    uvs[vertex * 2 + 1] = front ? y / (2 * radius) + 0.5 : 0.02;
  }

  geometry.setAttribute("uv", new BufferAttribute(uvs, 2));
}

export function buildEyeKit(design: EyeDesign, detail: EyeDetail, field: SphereField): EyeKit {
  const forward = design.axis.clone().normalize();

  const right = new Vector3()
    .crossVectors(new Vector3(0, 1, 0), forward)
    .normalize()
    .applyAxisAngle(forward, design.roll);

  const up = new Vector3().crossVectors(forward, right);

  const placement = new Matrix4()
    .makeBasis(right, up, forward)
    .setPosition(forward.clone().multiplyScalar(design.centerDistance));

  const eyeball = new SphereGeometry(design.radius, detail.segments, Math.round(detail.segments * 0.75));
  eyeball.rotateX(Math.PI / 2);
  planarIrisUvs(eyeball, design.radius);

  const lidRadius = design.radius + design.lidGap;
  const style: SweepStyle = { sides: detail.lidSides, squareness: 2.4, tileLength: LID_TILE };
  const marginStyle: SweepStyle = { sides: detail.lidSides, squareness: 2.1, tileLength: LID_TILE };
  const lowerShut = design.lowerEdge + (design.closedEdge - 0.06 - design.lowerEdge) * 0.4;

  function buildLid(wraps: number, back: number, openEdge: number, shutEdge: number): LidPiece[] {
    const lid: LidPiece[] = [];
    const widest = Math.abs(back - shutEdge) / (wraps - 1);

    for (let wrap = 0; wrap < wraps; wrap += 1) {
      const fraction = wrap / (wraps - 1);
      const margin = wrap === 0;
      const lift = lidRadius + (wraps - 1 - wrap) * SHINGLE + (margin ? MARGIN_RAISE : 0);
      const width = margin ? MARGIN_WIDTH : lidRadius * widest * LID_WIDTH_OVERLAP;
      const thickness = margin ? MARGIN_THICKNESS : LID_THICKNESS;
      const geometry = sweepGeometry(wrapSweep(detail, lift, width, thickness), margin ? marginStyle : style);
      const openTilt = openEdge + (back - openEdge) * fraction;
      shadeLid(
        geometry,
        new Matrix4().makeRotationX(-openTilt).premultiply(placement),
        field,
        detail.rays,
        design.lidTint,
      );
      lid.push({ geometry, fraction });
    }

    return lid;
  }

  const upper = buildLid(Math.max(2, detail.lidWraps), UPPER_BACK, design.upperEdge, design.closedEdge);
  const lower = buildLid(Math.max(2, detail.lidWraps - 1), LOWER_BACK, design.lowerEdge, lowerShut);
  let triangles = (eyeball.index?.count ?? 0) / 3;

  for (const piece of [...upper, ...lower]) {
    triangles += (piece.geometry.index?.count ?? 0) / 3;
  }

  return { placement, eyeball, upper, lower, lowerShut, triangles };
}

export function createEye(
  kit: EyeKit,
  design: EyeDesign,
  lidMaterial: Material,
  eyeballMaterial: MeshPhysicalMaterial,
): Eye {
  const root = new Group();
  kit.placement.decompose(root.position, root.quaternion, root.scale);
  const eyeball = new Mesh(kit.eyeball, eyeballMaterial);
  root.add(eyeball);

  function lidMeshes(pieces: readonly LidPiece[]): LidWrap[] {
    return pieces.map((piece) => {
      const mesh = new Mesh(piece.geometry, lidMaterial);
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      root.add(mesh);

      return { mesh, fraction: piece.fraction };
    });
  }

  const upperLid = lidMeshes(kit.upper);
  const lowerLid = lidMeshes(kit.lower);
  let yaw = 0;
  let pitch = 0;
  let targetYaw = 0;
  let targetPitch = 0;
  let wandering = true;
  let nextGlance = 0.8;
  let blinkClock = -1;
  let nextBlink = 2.2;
  let upperTilt = design.upperEdge;
  let lowerTilt = design.lowerEdge;
  let openness = 1;
  let wantedOpenness = 1;

  function closure(): number {
    if (blinkClock < 0) {
      return 0;
    }

    if (blinkClock < CLOSE_SECONDS) {
      return blinkClock / CLOSE_SECONDS;
    }

    if (blinkClock < CLOSE_SECONDS + SHUT_SECONDS) {
      return 1;
    }

    return Math.max(0, 1 - (blinkClock - CLOSE_SECONDS - SHUT_SECONDS) / OPEN_SECONDS);
  }

  function place(): void {
    eyeball.rotation.set(-pitch, yaw, 0, "YXZ");

    for (const wrap of upperLid) {
      wrap.mesh.rotation.x = -(upperTilt + (UPPER_BACK - upperTilt) * wrap.fraction);
    }

    for (const wrap of lowerLid) {
      wrap.mesh.rotation.x = -(lowerTilt + (LOWER_BACK - lowerTilt) * wrap.fraction);
    }
  }

  place();

  return {
    root,
    eyeball,

    update(deltaSeconds) {
      if (wandering) {
        nextGlance -= deltaSeconds;

        if (nextGlance <= 0) {
          nextGlance = 0.5 + Math.random() * 2.2;
          targetYaw = (Math.random() * 2 - 1) * WANDER_YAW;
          targetPitch = (Math.random() * 2 - 1) * WANDER_PITCH;
        }
      }

      nextBlink -= deltaSeconds;

      if (nextBlink <= 0 && blinkClock < 0) {
        blinkClock = 0;
        nextBlink = Math.random() < 0.18 ? 0.32 : 2 + Math.random() * 4;
      }

      if (blinkClock >= 0) {
        blinkClock += deltaSeconds;

        if (blinkClock > CLOSE_SECONDS + SHUT_SECONDS + OPEN_SECONDS) {
          blinkClock = -1;
        }
      }

      const ease = 1 - Math.exp(-SACCADE_RATE * deltaSeconds);
      yaw += (targetYaw - yaw) * ease;
      pitch += (targetPitch - pitch) * ease;
      openness += (wantedOpenness - openness) * (1 - Math.exp(-OPEN_RATE * deltaSeconds));
      const shut = closure();
      const restUpper = design.upperEdge + pitch * LID_FOLLOW;
      const restLower = design.lowerEdge + Math.min(pitch, 0) * LID_FOLLOW * 0.5;
      const openUpper = Math.min(WIDEST_UPPER, design.closedEdge + (restUpper - design.closedEdge) * openness);
      const openLower = Math.max(WIDEST_LOWER, kit.lowerShut + (restLower - kit.lowerShut) * openness);
      const wantUpper = openUpper + (design.closedEdge - openUpper) * shut;
      const wantLower = openLower + (kit.lowerShut - openLower) * shut;
      const lidEase = 1 - Math.exp(-LID_RATE * deltaSeconds);
      upperTilt += (wantUpper - upperTilt) * (shut > 0 ? 1 : lidEase);
      lowerTilt += (wantLower - lowerTilt) * (shut > 0 ? 1 : lidEase);
      place();
    },

    gaze(nextYaw, nextPitch) {
      wandering = false;
      targetYaw = nextYaw;
      targetPitch = nextPitch;
    },

    wander() {
      wandering = true;
    },

    blink() {
      if (blinkClock < 0) {
        blinkClock = 0;
      }
    },

    setOpenness(amount) {
      wantedOpenness = Math.max(0, amount);
    },
  };
}

export function eyeballMaterialOf(color: Texture, glow: Texture, light: Texture): MeshPhysicalMaterial {
  return new MeshPhysicalMaterial({
    map: color,
    emissiveMap: glow,
    emissive: new Color("#ffffff"),
    emissiveIntensity: 0.35,
    roughness: 0.42,
    clearcoat: 1,
    clearcoatRoughness: 0.035,
    envMap: light,
    envMapIntensity: 0.3,
  });
}
