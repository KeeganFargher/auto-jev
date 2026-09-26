import {
  BufferGeometry,
  CircleGeometry,
  Color,
  ConeGeometry,
  Float32BufferAttribute,
  QuadraticBezierCurve3,
  ShaderMaterial,
  SphereGeometry,
  TorusGeometry,
  TubeGeometry,
  Vector3,
} from "three";

export interface DetailKit {
  readonly eye: BufferGeometry;
  readonly claw: BufferGeometry;
  readonly fang: BufferGeometry;
  readonly nose: BufferGeometry;
  readonly collar: BufferGeometry;
  readonly whiskers: readonly BufferGeometry[];
}

const CLAW_RINGS = 9;

const CLAW_SIDES = 6;

const CLAW_LENGTH = 0.3;

const CLAW_ARC = 1.25;

const CLAW_BASE = 0.045;

const WHISKER_ROWS = [-2, -1, 0, 1, 2] as const;

const EYE_INNER = new Color("#f6ebff");

const EYE_OUTER = new Color("#9a4dff");

const EYE_GLOW = 1.3;

const EYE_VERTEX = `
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`;

const EYE_FRAGMENT = `
uniform vec3 inner;
uniform vec3 outer;
uniform float glow;
varying vec2 vUv;
void main() {
  vec2 p = vUv * 2.0 - 1.0;
  float r = length(p);
  vec3 color = mix(inner, outer, smoothstep(0.05, 1.0, r));
  float slit = 1.0 - smoothstep(0.1, 0.17, abs(p.x) * (1.0 + 2.4 * p.y * p.y));
  color = mix(color, vec3(0.04, 0.0, 0.08), slit * 0.9);
  float spark = 1.0 - smoothstep(0.0, 0.17, length(p - vec2(-0.34, 0.36)));
  color = mix(color, vec3(1.0), spark * 0.85);
  color *= 1.0 - smoothstep(0.8, 1.0, r) * 0.55;
  gl_FragColor = vec4(color * glow, 1.0);
}
`;

let cachedKit: DetailKit | null = null;

function clawGeometry(): BufferGeometry {
  const positions: number[] = [];
  const indices: number[] = [];
  const radius = CLAW_LENGTH / CLAW_ARC;

  for (let ring = 0; ring <= CLAW_RINGS; ring += 1) {
    const t = ring / CLAW_RINGS;
    const angle = t * CLAW_ARC;
    const cy = -radius * (1 - Math.cos(angle));
    const cz = radius * Math.sin(angle);
    const ty = -Math.sin(angle);
    const tz = Math.cos(angle);
    const width = CLAW_BASE * (1 - t) ** 0.85 + 0.002;

    for (let side = 0; side < CLAW_SIDES; side += 1) {
      const turn = (side / CLAW_SIDES) * Math.PI * 2;
      const across = Math.cos(turn) * width * 0.75;
      const over = Math.sin(turn) * width;
      positions.push(across, cy + tz * over, cz - ty * over);

      if (ring < CLAW_RINGS) {
        const a = ring * CLAW_SIDES + side;
        const b = ring * CLAW_SIDES + ((side + 1) % CLAW_SIDES);
        indices.push(a, b, a + CLAW_SIDES, b, b + CLAW_SIDES, a + CLAW_SIDES);
      }
    }
  }

  const geometry = new BufferGeometry();
  geometry.setAttribute("position", new Float32BufferAttribute(positions, 3));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();

  return geometry;
}

function whiskerGeometry(side: number, row: number): BufferGeometry {
  const start = new Vector3(side * 0.2, -0.06 + row * 0.035, 0.99);
  const control = start.clone().add(new Vector3(side * 0.45, 0.07, -0.02));
  const end = start.clone().add(new Vector3(side * 0.82, -0.14 + row * 0.085, -0.3));

  return new TubeGeometry(new QuadraticBezierCurve3(start, control, end), 10, 0.0075, 3, false);
}

export function detailKit(): DetailKit {
  if (cachedKit !== null) {
    return cachedKit;
  }

  const whiskers: BufferGeometry[] = [];

  for (const side of [1, -1]) {
    for (const row of WHISKER_ROWS) {
      whiskers.push(whiskerGeometry(side, row));
    }
  }

  cachedKit = {
    eye: new CircleGeometry(1, 28),
    claw: clawGeometry(),
    fang: new ConeGeometry(0.03, 0.11, 8).rotateX(Math.PI).translate(0, -0.05, 0),
    nose: new SphereGeometry(1, 16, 10),
    collar: new TorusGeometry(0.6, 0.07, 8, 40),
    whiskers,
  };

  return cachedKit;
}

export function createEyeMaterial(): ShaderMaterial {
  return new ShaderMaterial({
    vertexShader: EYE_VERTEX,
    fragmentShader: EYE_FRAGMENT,
    uniforms: {
      inner: { value: EYE_INNER.clone() },
      outer: { value: EYE_OUTER.clone() },
      glow: { value: EYE_GLOW },
    },
  });
}
