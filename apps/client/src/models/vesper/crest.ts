import {
  Color,
  DynamicDrawUsage,
  InstancedBufferAttribute,
  InstancedMesh,
  Matrix4,
  PlaneGeometry,
  Quaternion,
  ShaderMaterial,
  Vector3,
} from "three";
import type { DistanceField } from "./surface-nets.js";

export interface CrestFlame {
  readonly anchor: Vector3;
  readonly size: number;
  readonly phase: number;
}

export interface Crest {
  readonly mesh: InstancedMesh;
  place(index: number, position: Vector3): void;
  commit(): void;
  update(deltaSeconds: number, intensity: number): void;
  dispose(): void;
}

const CREST_FROM = 1.98;

const CREST_TO = 0.1;

const CREST_FLAMES = 11;

const CREST_SINK = 0.1;

const SEARCH_TOP = 4;

const SEARCH_STEPS = 24;

const CORE = new Color("#240954");

const BODY = new Color("#8c42ff");

const EDGE = new Color("#ecdcff");

const VERTEX = `
attribute float phase;
varying vec2 vUv;
varying float vPhase;
void main() {
  vUv = uv;
  vPhase = phase;
  mat4 placed = modelMatrix * instanceMatrix;
  vec3 origin = (placed * vec4(0.0, 0.0, 0.0, 1.0)).xyz;
  float scale = length(placed[1].xyz);
  vec3 up = vec3(0.0, 1.0, 0.0);
  vec3 right = normalize(cross(up, cameraPosition - origin));
  vec3 world = origin + right * position.x * scale * 0.75 + up * position.y * scale;
  gl_Position = projectionMatrix * viewMatrix * vec4(world, 1.0);
}
`;

const FRAGMENT = `
uniform float time;
uniform float intensity;
uniform vec3 core;
uniform vec3 body;
uniform vec3 edge;
varying vec2 vUv;
varying float vPhase;
float crestHash(vec2 p) {
  return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
}
float crestNoise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  return mix(mix(crestHash(i), crestHash(i + vec2(1.0, 0.0)), f.x), mix(crestHash(i + vec2(0.0, 1.0)), crestHash(i + vec2(1.0, 1.0)), f.x), f.y);
}
float crestFbm(vec2 p) {
  float sum = 0.0;
  float amplitude = 0.55;
  for (int octave = 0; octave < 4; octave++) {
    sum += amplitude * crestNoise(p);
    p = p * 2.03 + vec2(1.7, 9.2);
    amplitude *= 0.5;
  }
  return sum;
}
void main() {
  float v = vUv.y;
  float sway = sin(v * 3.0 - time * 3.1 + vPhase * 6.2832) * 0.28 * v * v;
  float x = (vUv.x - 0.5) * 2.0 - sway * 2.0;
  float n = crestFbm(vec2(vUv.x * 3.0 + vPhase * 7.0, v * 2.6 - time * 2.3));
  float radius = (1.0 - pow(v, 1.35)) * (0.62 + 0.38 * sin(v * 3.1416)) * (0.74 + 0.46 * n);
  float shape = radius - abs(x) - smoothstep(0.7, 1.0, v) * 0.25 * (1.0 - n);
  float alpha = smoothstep(0.0, 0.26, shape) * smoothstep(0.0, 0.1, v);
  float heat = clamp(shape * 1.9, 0.0, 1.0);
  vec3 color = mix(edge, body, smoothstep(0.06, 0.42, heat));
  color = mix(color, core, smoothstep(0.5, 1.0, heat) * (1.0 - v * 0.7));
  color *= 1.0 + max(0.0, intensity - 1.0) * 0.7;
  float fade = clamp(intensity, 0.0, 1.0);
  if (alpha * fade < 0.02) {
    discard;
  }
  gl_FragColor = vec4(color, alpha * fade);
}
`;

function dorsal(field: DistanceField, x: number, z: number): number {
  let high = SEARCH_TOP;
  let low = 1;

  for (let step = 0; step < SEARCH_STEPS; step += 1) {
    const middle = (high + low) / 2;

    if (field(x, middle, z) > 0) {
      high = middle;
    } else {
      low = middle;
    }
  }

  return low;
}

export function crestFlames(field: DistanceField): CrestFlame[] {
  const flames: CrestFlame[] = [];

  for (let index = 0; index < CREST_FLAMES; index += 1) {
    const along = index / (CREST_FLAMES - 1);
    const z = CREST_FROM + (CREST_TO - CREST_FROM) * along;
    const x = index % 2 === 0 ? 0.07 : -0.07;
    const shoulder = Math.exp(-(((z - 1.3) / 0.75) ** 2));
    flames.push({
      anchor: new Vector3(x, dorsal(field, x, z) - CREST_SINK, z),
      size: 0.55 + 0.85 * shoulder,
      phase: (index * 0.618) % 1,
    });
  }

  return flames;
}

export function createCrest(flames: readonly CrestFlame[]): Crest {
  const geometry = new PlaneGeometry(1, 1).translate(0, 0.5, 0);
  geometry.setAttribute(
    "phase",
    new InstancedBufferAttribute(
      Float32Array.from(flames, (flame) => flame.phase),
      1,
    ),
  );

  const material = new ShaderMaterial({
    vertexShader: VERTEX,
    fragmentShader: FRAGMENT,
    uniforms: {
      time: { value: Math.random() * 10 },
      intensity: { value: 1 },
      core: { value: CORE.clone() },
      body: { value: BODY.clone() },
      edge: { value: EDGE.clone() },
    },
    transparent: true,
    depthWrite: false,
  });

  const mesh = new InstancedMesh(geometry, material, flames.length);
  mesh.instanceMatrix.setUsage(DynamicDrawUsage);
  mesh.frustumCulled = false;
  mesh.renderOrder = 5;
  const matrix = new Matrix4();
  const scale = new Vector3();
  const identity = new Quaternion();

  return {
    mesh,

    place(index, position) {
      const size = flames[index]?.size ?? 1;
      mesh.setMatrixAt(index, matrix.compose(position, identity, scale.set(size, size, size)));
    },

    commit() {
      mesh.instanceMatrix.needsUpdate = true;
    },

    update(deltaSeconds, intensity) {
      const time = material.uniforms["time"];
      const strength = material.uniforms["intensity"];

      if (time !== undefined && strength !== undefined) {
        time.value += deltaSeconds;
        strength.value = intensity;
      }
    },

    dispose() {
      mesh.removeFromParent();
      geometry.dispose();
      material.dispose();
    },
  };
}
