import {
  BoxGeometry,
  BufferGeometry,
  CatmullRomCurve3,
  Color,
  ConeGeometry,
  CylinderGeometry,
  Float32BufferAttribute,
  SphereGeometry,
  TorusGeometry,
  TubeGeometry,
  Vector3,
} from "three";
import { fbm, seededRandom, valueNoise } from "../sculpt/noise.js";
import { lathe, merge, paintVertices, placed } from "../sculpt/props.js";
import { shellTop } from "./shell.js";

export interface ShrineGeometry {
  readonly wood: BufferGeometry;
  readonly metal: BufferGeometry;
  readonly paper: BufferGeometry;
  readonly sun: BufferGeometry;
  readonly bell: BufferGeometry;
  readonly lantern: BufferGeometry;
  readonly lanternGlow: BufferGeometry;
}

export interface MalletGeometry {
  readonly wood: BufferGeometry;
  readonly gold: BufferGeometry;
}

interface RidgeParts {
  readonly wood: BufferGeometry[];
  readonly metal: BufferGeometry[];
}

interface RopeParts {
  readonly straw: BufferGeometry[];
  readonly paper: BufferGeometry[];
}

interface LanternParts {
  readonly body: BufferGeometry;
  readonly glow: BufferGeometry;
}

type Paint = (point: Vector3, normal: Vector3, out: Color) => void;

export const SHRINE_ORIGIN = new Vector3(0, 4.26, -0.45);

const EAVE = 1.48;

const RIDGE = 2.3;

const ROOF_W = 2.05;

const ROOF_D = 1.72;

const SWEEP = 0.38;

const ROOF_THICK = 0.1;

const RIDGE_HALF = ROOF_W - ROOF_D;

const ROW = 0.2;

const SHINGLE = 0.19;

const POST_X = 1.0;

const POST_Z = 0.95;

const POST_TOP = 1.46;

const DECK_X = 1.42;

const DECK_Z = 1.3;

const SUN_RADIUS = 0.6;

export const SUN_AT = new Vector3(0, RIDGE + 0.5, 0);

export const BELL_AT = new Vector3(1.8, 1.66, 1.48);

export const LANTERNS_AT: readonly Vector3[] = [new Vector3(-1.84, 1.62, -1.46), new Vector3(1.84, 1.62, -1.46)];

export const MALLET_AT = new Vector3(1.56, 0.18, 0.2);

const SEED = 8111;

const WOOD = new Color("#6f4d2e");

const WOOD_DARK = new Color("#3a2716");

const WOOD_LIGHT = new Color("#9a7449");

const SHAKE = new Color("#5c4a3a");

const SHAKE_LIGHT = new Color("#7e6650");

const SHAKE_DARK = new Color("#2e251c");

const ROOF_MOSS = new Color("#56752a");

const ROOF_MOSS_LIGHT = new Color("#93aa48");

const ROPE = new Color("#cdb47c");

const ROPE_DARK = new Color("#8a7045");

const PAPER = new Color("#f4f0e4");

const GOLD = new Color("#e0ac45");

const GOLD_DEEP = new Color("#94621b");

const BRONZE = new Color("#8f6d36");

const PATINA = new Color("#4f8a70");

const LANTERN_RED = new Color("#c0392b");

const LANTERN_CAP = new Color("#1f1812");

const LACQUER = new Color("#7a2618");

const LACQUER_DEEP = new Color("#3d110a");

const TASSEL = new Color("#c23a2a");

let cachedShrine: ShrineGeometry | null = null;

let cachedMallet: MalletGeometry | null = null;

function clamp01(value: number): number {
  return Math.min(1, Math.max(0, value));
}

function smoothstep(from: number, to: number, value: number): number {
  const t = clamp01((value - from) / (to - from));

  return t * t * (3 - 2 * t);
}

function v(x: number, y: number, z: number): Vector3 {
  return new Vector3(x, y, z);
}

function flat(color: Color, tone = 1): Paint {
  return (_point, _normal, out) => {
    out.copy(color).multiplyScalar(tone);
  };
}

export function roofHeight(x: number, z: number): number {
  const edge = Math.max(0, Math.min(ROOF_W - Math.abs(x), ROOF_D - Math.abs(z)));
  const t = Math.min(1, edge / ROOF_D);
  const corner = (Math.min(1, Math.abs(x) / ROOF_W) * Math.min(1, Math.abs(z) / ROOF_D)) ** 4;

  return EAVE + (RIDGE - EAVE) * t ** 1.55 + SWEEP * corner;
}

function beam(from: Vector3, to: Vector3, width: number, height: number, paint: Paint): BufferGeometry {
  const direction = to.clone().sub(from);
  const middle = from.clone().add(to).multiplyScalar(0.5);

  return paintVertices(
    placed(new BoxGeometry(width, height, direction.length()), middle, v(0, 1, 0), direction, v(1, 1, 1)),
    paint,
  );
}

function woodGrain(tone: number): Paint {
  return (point, normal, out) => {
    const streak = valueNoise(point.x * 2.5, point.y * 9, point.z * 2.5, SEED + 1);
    out
      .copy(WOOD)
      .lerp(WOOD_LIGHT, 0.35 * streak)
      .multiplyScalar(tone);

    if (normal.y < -0.5) {
      out.lerp(WOOD_DARK, 0.6);
    }
  };
}

function deck(): BufferGeometry[] {
  const random = seededRandom(SEED + 2);
  const parts: BufferGeometry[] = [];
  const planks = 6;
  const width = (DECK_Z * 2) / planks;

  for (let plank = 0; plank < planks; plank += 1) {
    const z = -DECK_Z + width * (plank + 0.5);
    const lift = (random() - 0.5) * 0.02;
    parts.push(
      beam(
        v(-DECK_X, -0.07 + lift, z),
        v(DECK_X, -0.07 + lift, z),
        width - 0.035,
        0.12,
        woodGrain(0.82 + random() * 0.3),
      ),
    );
  }

  for (const side of [-1, 1]) {
    parts.push(
      beam(
        v(side * (DECK_X - 0.05), -0.2, -DECK_Z - 0.06),
        v(side * (DECK_X - 0.05), -0.2, DECK_Z + 0.06),
        0.14,
        0.14,
        woodGrain(0.7),
      ),
    );
  }

  for (const z of [-0.86, 0.86]) {
    parts.push(saddle(z));
  }

  return parts;
}

function saddle(z: number): BufferGeometry {
  const steps = 18;
  const positions: number[] = [];
  const indices: number[] = [];
  const thick = 0.16;

  for (let step = 0; step <= steps; step += 1) {
    const x = -DECK_X + 0.1 + ((DECK_X - 0.1) * 2 * step) / steps;
    const bottom = shellTop(x + SHRINE_ORIGIN.x, z + SHRINE_ORIGIN.z) - SHRINE_ORIGIN.y - 0.06;

    for (const side of [-1, 1]) {
      positions.push(x, -0.13, z + (side * thick) / 2, x, bottom, z + (side * thick) / 2);
    }
  }

  for (let step = 0; step < steps; step += 1) {
    const a = step * 4;
    const b = a + 4;
    indices.push(a + 2, a + 3, b + 2, b + 2, a + 3, b + 3);
    indices.push(a, b, a + 1, b, b + 1, a + 1);
    indices.push(a + 1, b + 1, a + 3, b + 1, b + 3, a + 3);
  }

  const geometry = new BufferGeometry();
  geometry.setAttribute("position", new Float32BufferAttribute(positions, 3));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();

  return paintVertices(geometry, woodGrain(0.62));
}

function frame(): BufferGeometry[] {
  const parts: BufferGeometry[] = [];

  for (const x of [-POST_X, POST_X]) {
    for (const z of [-POST_Z, POST_Z]) {
      parts.push(
        paintVertices(
          new CylinderGeometry(0.1, 0.115, POST_TOP, 8).translate(x, POST_TOP / 2, z),
          (point, normal, out) => {
            woodGrain(0.95)(point, normal, out);
            out.multiplyScalar(0.62 + 0.38 * smoothstep(0, 0.5, point.y));
          },
        ),
        beam(v(x, POST_TOP + 0.07, z), v(x, POST_TOP + 0.21, z), 0.3, 0.3, woodGrain(0.72)),
      );
    }
  }

  for (const z of [-POST_Z, POST_Z]) {
    parts.push(beam(v(-POST_X - 0.18, 1.08, z), v(POST_X + 0.18, 1.08, z), 0.09, 0.13, woodGrain(0.85)));
    parts.push(
      beam(v(-POST_X - 0.26, POST_TOP + 0.02, z), v(POST_X + 0.26, POST_TOP + 0.02, z), 0.15, 0.13, woodGrain(0.78)),
    );
  }

  for (const x of [-POST_X, POST_X]) {
    parts.push(beam(v(x, 1.08, -POST_Z - 0.18), v(x, 1.08, POST_Z + 0.18), 0.09, 0.13, woodGrain(0.85)));
    parts.push(
      beam(v(x, POST_TOP + 0.02, -POST_Z - 0.26), v(x, POST_TOP + 0.02, POST_Z + 0.26), 0.15, 0.13, woodGrain(0.78)),
    );
  }

  return parts;
}

function roofSlab(): BufferGeometry {
  const nx = 30;
  const nz = 26;
  const positions: number[] = [];
  const indices: number[] = [];
  const top = (i: number, j: number): number => i * (nz + 1) + j;
  const count = (nx + 1) * (nz + 1);

  for (const drop of [0, ROOF_THICK]) {
    for (let i = 0; i <= nx; i += 1) {
      for (let j = 0; j <= nz; j += 1) {
        const x = -ROOF_W + (2 * ROOF_W * i) / nx;
        const z = -ROOF_D + (2 * ROOF_D * j) / nz;
        positions.push(x, roofHeight(x, z) - drop, z);
      }
    }
  }

  for (let i = 0; i < nx; i += 1) {
    for (let j = 0; j < nz; j += 1) {
      const a = top(i, j);
      const b = top(i + 1, j);
      const c = top(i, j + 1);
      const d = top(i + 1, j + 1);
      indices.push(a, c, b, b, c, d);
      indices.push(a + count, b + count, c + count, b + count, d + count, c + count);
    }
  }

  const rim: number[] = [];

  for (let i = 0; i <= nx; i += 1) {
    rim.push(top(i, 0));
  }

  for (let j = 1; j <= nz; j += 1) {
    rim.push(top(nx, j));
  }

  for (let i = nx - 1; i >= 0; i -= 1) {
    rim.push(top(i, nz));
  }

  for (let j = nz - 1; j >= 1; j -= 1) {
    rim.push(top(0, j));
  }

  for (let index = 0; index < rim.length; index += 1) {
    const a = rim[index];
    const b = rim[(index + 1) % rim.length];
    indices.push(a, b, a + count, b, b + count, a + count);
  }

  const geometry = new BufferGeometry();
  geometry.setAttribute("position", new Float32BufferAttribute(positions, 3));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();

  return paintVertices(geometry, (_point, normal, out) => {
    out.copy(normal.y > 0.3 ? SHAKE_DARK : WOOD_DARK).multiplyScalar(normal.y < -0.3 ? 0.8 : 1);

    if (Math.abs(normal.y) <= 0.3) {
      out.copy(WOOD).multiplyScalar(0.8);
    }
  });
}

function sidePoint(side: number, along: number, edge: number, out: Vector3): Vector3 {
  const hx = ROOF_W - edge;
  const hz = ROOF_D - edge;

  switch (side) {
    case 0:
      return out.set(along * hx, 0, hz);

    case 1:
      return out.set(-along * hx, 0, -hz);

    case 2:
      return out.set(hx, 0, -along * hz);

    default:
      return out.set(-hx, 0, along * hz);
  }
}

function shingles(): BufferGeometry {
  const random = seededRandom(SEED + 3);
  const positions: number[] = [];
  const colors: number[] = [];
  const corners = [new Vector3(), new Vector3(), new Vector3(), new Vector3()];
  const butt = new Color();
  const hidden = new Color();

  for (let row = 0; row * ROW < ROOF_D - 0.14; row += 1) {
    const e0 = row * ROW;
    const e1 = Math.min(ROOF_D - 0.02, e0 + ROW * 1.4);

    for (let side = 0; side < 4; side += 1) {
      const length = 2 * (side < 2 ? ROOF_W - e0 : ROOF_D - e0);
      const count = Math.max(1, Math.round(length / SHINGLE));

      for (let index = 0; index < count; index += 1) {
        const a0 = -1 + (2 * index) / count;
        const a1 = -1 + (2 * (index + 1)) / count;
        sidePoint(side, a0, e0, corners[0]);
        sidePoint(side, a1, e0, corners[1]);
        sidePoint(side, a1, e1, corners[2]);
        sidePoint(side, a0, e1, corners[3]);
        const lift = 0.05 + random() * 0.018;

        for (const [corner, point] of corners.entries()) {
          point.y = roofHeight(point.x, point.z) + (corner < 2 ? lift : 0.012);
        }

        const center = corners[0].clone().add(corners[1]).multiplyScalar(0.5);
        const growth = fbm(center.x * 1.3 + 7, center.z * 1.3, row * 0.3, SEED + 4, 3);
        const moss = smoothstep(0.58, 0.72, growth + 0.1 * (1 - e0 / ROOF_D));
        const tone = 0.78 + random() * 0.36;
        butt
          .copy(SHAKE)
          .lerp(SHAKE_LIGHT, random() * 0.6)
          .multiplyScalar(tone);
        butt.lerp(ROOF_MOSS, moss).lerp(ROOF_MOSS_LIGHT, moss * smoothstep(0.62, 0.8, growth) * 0.8);
        hidden.copy(butt).lerp(SHAKE_DARK, 0.72);

        for (const corner of [0, 1, 2, 0, 2, 3]) {
          const point = corners[corner];
          const color = corner < 2 ? butt : hidden;
          positions.push(point.x, point.y, point.z);
          colors.push(color.r, color.g, color.b);
        }
      }
    }
  }

  const geometry = new BufferGeometry();
  geometry.setAttribute("position", new Float32BufferAttribute(positions, 3));
  geometry.setAttribute("color", new Float32BufferAttribute(colors, 3));
  geometry.computeVertexNormals();

  return geometry;
}

function ridges(): RidgeParts {
  const wood: BufferGeometry[] = [];
  const metal: BufferGeometry[] = [];

  const tile: Paint = (point, _normal, out) => {
    out.copy(SHAKE_DARK).lerp(SHAKE, 0.35 + 0.3 * valueNoise(point.x * 6, point.y * 6, point.z * 6, SEED + 5));
  };

  wood.push(beam(v(-RIDGE_HALF - 0.16, RIDGE + 0.05, 0), v(RIDGE_HALF + 0.16, RIDGE + 0.05, 0), 0.2, 0.2, tile));

  for (const sx of [-1, 1]) {
    for (const sz of [-1, 1]) {
      const points: Vector3[] = [];

      for (let step = 0; step <= 10; step += 1) {
        const t = step / 10;
        const x = sx * (RIDGE_HALF + (ROOF_W - RIDGE_HALF) * t);
        const z = sz * ROOF_D * t;
        points.push(v(x, roofHeight(x, z) + 0.07, z));
      }

      const tip = points[points.length - 1];
      points.push(v(tip.x + sx * 0.1, tip.y + 0.12, tip.z + sz * 0.1));
      wood.push(paintVertices(new TubeGeometry(new CatmullRomCurve3(points), 26, 0.07, 6, false), tile));
      metal.push(
        paintVertices(
          new SphereGeometry(0.07, 8, 6).translate(tip.x + sx * 0.12, tip.y + 0.15, tip.z + sz * 0.12),
          flat(GOLD),
        ),
      );
    }

    const end = v(sx * (RIDGE_HALF + 0.2), RIDGE + 0.12, 0);
    wood.push(beam(end.clone().setY(RIDGE - 0.02), end.clone().setY(RIDGE + 0.3), 0.16, 0.26, tile));
    metal.push(
      paintVertices(new ConeGeometry(0.1, 0.22, 8).translate(end.x + sx * 0.02, RIDGE + 0.42, 0), flat(GOLD, 0.9)),
    );
  }

  metal.push(paintVertices(new CylinderGeometry(0.05, 0.07, 0.3, 8).translate(0, RIDGE + 0.2, 0), flat(GOLD_DEEP)));

  return { wood, metal };
}

function rope(): RopeParts {
  const straw: BufferGeometry[] = [];
  const paper: BufferGeometry[] = [];
  const center = (s: number): Vector3 => v(-POST_X + 2 * POST_X * s, 1.36 - 0.12 * Math.sin(Math.PI * s), POST_Z + 0.1);

  for (const strand of [0, 1]) {
    const points: Vector3[] = [];

    for (let step = 0; step <= 60; step += 1) {
      const s = step / 60;
      const twist = s * 30 + strand * Math.PI;
      points.push(center(s).add(v(0, Math.cos(twist) * 0.032, Math.sin(twist) * 0.032)));
    }

    straw.push(
      paintVertices(new TubeGeometry(new CatmullRomCurve3(points), 84, 0.036, 5, false), (point, _normal, out) => {
        out.copy(ROPE).lerp(ROPE_DARK, 0.5 + 0.5 * Math.sin(point.x * 60 + strand));
      }),
    );
  }

  for (const s of [0.25, 0.5, 0.75]) {
    const hang = center(s);
    const positions: number[] = [];

    for (let fold = 0; fold < 4; fold += 1) {
      const shift = fold % 2 === 0 ? -0.03 : 0.03;
      const y0 = hang.y - 0.03 - fold * 0.11;
      const y1 = y0 - 0.1;
      const x0 = hang.x + shift - 0.045;
      const x1 = hang.x + shift + 0.045;
      const z = hang.z + 0.02 + fold * 0.008;
      positions.push(x0, y0, z, x0, y1, z, x1, y0, z, x1, y0, z, x0, y1, z, x1, y1, z);
    }

    const geometry = new BufferGeometry();
    geometry.setAttribute("position", new Float32BufferAttribute(positions, 3));
    geometry.computeVertexNormals();
    paper.push(paintVertices(geometry, flat(PAPER)));
  }

  return { straw, paper };
}

function sunDisc(): BufferGeometry {
  const r = SUN_RADIUS;

  const profile: [number, number][] = [
    [0, 0.08],
    [0.15 * r, 0.085],
    [0.22 * r, 0.06],
    [0.76 * r, 0.05],
    [0.84 * r, 0.07],
    [0.95 * r, 0.07],
    [r, 0.045],
    [r, -0.045],
    [0.95 * r, -0.07],
    [0.84 * r, -0.07],
    [0.76 * r, -0.05],
    [0.22 * r, -0.06],
    [0.15 * r, -0.085],
    [0, -0.08],
  ];

  const face = paintVertices(lathe(profile, 44).rotateX(Math.PI / 2), (point, _normal, out) => {
    const reach = Math.hypot(point.x, point.y) / r;
    out.copy(GOLD).lerp(GOLD_DEEP, 0.45 * smoothstep(0.2, 0.3, reach) * (1 - smoothstep(0.7, 0.78, reach)));
  });

  const rays: BufferGeometry[] = [face];

  for (let ray = 0; ray < 16; ray += 1) {
    const angle = (ray / 16) * Math.PI * 2;
    const length = ray % 2 === 0 ? 0.42 : 0.26;
    const out = v(Math.cos(angle), Math.sin(angle), 0);
    rays.push(
      paintVertices(
        placed(
          new ConeGeometry(0.075, length, 4),
          out.clone().multiplyScalar(r + length / 2 - 0.03),
          out,
          v(0, 0, 1),
          v(1, 1, 0.5),
        ),
        flat(GOLD, ray % 2 === 0 ? 1 : 0.85),
      ),
    );
  }

  for (const facing of [1, -1]) {
    for (let ray = 0; ray < 12; ray += 1) {
      const angle = ((ray + 0.5) / 12) * Math.PI * 2;
      const out = v(Math.cos(angle), Math.sin(angle), 0);
      rays.push(
        paintVertices(
          placed(
            new ConeGeometry(0.04, 0.24, 3),
            out
              .clone()
              .multiplyScalar(0.33)
              .setZ(facing * 0.05),
            out,
            v(0, 0, facing),
            v(1, 1, 0.5),
          ),
          flat(GOLD, 1.1),
        ),
      );
    }
  }

  return merge(rays);
}

function bell(): BufferGeometry {
  const body = paintVertices(
    lathe(
      [
        [0.02, -0.3],
        [0.1, -0.31],
        [0.15, -0.35],
        [0.165, -0.42],
        [0.17, -0.56],
        [0.185, -0.68],
        [0.215, -0.76],
        [0.2, -0.78],
        [0.17, -0.76],
      ],
      20,
    ),
    (point, _normal, out) => {
      const verdigris = smoothstep(
        0.45,
        0.75,
        fbm(point.x * 9, point.y * 9, point.z * 9, SEED + 6, 2) + (-0.5 - point.y) * 0.6,
      );

      out.copy(BRONZE).lerp(PATINA, verdigris * 0.8);
    },
  );

  return merge([
    body,
    paintVertices(new CylinderGeometry(0.018, 0.018, 0.28, 5).translate(0, -0.14, 0), flat(ROPE)),
    paintVertices(new TorusGeometry(0.05, 0.016, 5, 10).translate(0, -0.29, 0), flat(BRONZE, 0.8)),
    paintVertices(
      new TorusGeometry(0.172, 0.014, 5, 20).rotateX(Math.PI / 2).translate(0, -0.47, 0),
      flat(BRONZE, 1.15),
    ),
    paintVertices(
      new TorusGeometry(0.186, 0.014, 5, 20).rotateX(Math.PI / 2).translate(0, -0.66, 0),
      flat(BRONZE, 1.15),
    ),
    paintVertices(new SphereGeometry(0.045, 8, 6).scale(1, 1, 0.6).translate(0, -0.6, 0.18), flat(GOLD, 0.9)),
  ]);
}

function lantern(): LanternParts {
  const body = merge([
    paintVertices(new CylinderGeometry(0.012, 0.012, 0.14, 4).translate(0, -0.07, 0), flat(LANTERN_CAP)),
    paintVertices(new CylinderGeometry(0.075, 0.085, 0.04, 10).translate(0, -0.15, 0), flat(LANTERN_CAP)),
    paintVertices(new CylinderGeometry(0.085, 0.075, 0.04, 10).translate(0, -0.45, 0), flat(LANTERN_CAP)),
  ]);

  const glow = paintVertices(
    lathe(
      [
        [0.07, -0.16],
        [0.11, -0.19],
        [0.135, -0.25],
        [0.14, -0.31],
        [0.13, -0.38],
        [0.1, -0.42],
        [0.07, -0.44],
      ],
      14,
    ),
    (point, _normal, out) => {
      const rib = Math.abs(Math.sin(point.y * Math.PI * 25)) < 0.18 ? 0.55 : 1;
      out.copy(LANTERN_RED).multiplyScalar(rib);
    },
  );

  return { body, glow };
}

function build(): ShrineGeometry {
  const top = ridges();
  const tied = rope();
  const lamp = lantern();

  return {
    wood: merge([...deck(), ...frame(), roofSlab(), shingles(), ...top.wood, ...tied.straw]),
    metal: merge(top.metal),
    paper: merge(tied.paper),
    sun: sunDisc(),
    bell: bell(),
    lantern: lamp.body,
    lanternGlow: lamp.glow,
  };
}

export function shrineGeometry(): ShrineGeometry {
  cachedShrine ??= build();

  return cachedShrine;
}

function buildMallet(): MalletGeometry {
  const head = paintVertices(
    lathe(
      [
        [0, -0.23],
        [0.16, -0.23],
        [0.2, -0.19],
        [0.215, 0],
        [0.2, 0.19],
        [0.16, 0.23],
        [0, 0.23],
      ],
      18,
    ).rotateZ(Math.PI / 2),
    (point, _normal, out) => {
      out.copy(LACQUER).lerp(LACQUER_DEEP, 0.4 * valueNoise(point.x * 8, point.y * 8, point.z * 8, SEED + 7));
    },
  );

  const handle = paintVertices(new CylinderGeometry(0.045, 0.055, 0.62, 8).translate(0, -0.52, 0), woodGrain(1.05));
  const tassel = paintVertices(new ConeGeometry(0.07, 0.2, 7).rotateX(Math.PI).translate(0, -0.93, 0), flat(TASSEL));

  const gold = merge([
    paintVertices(new TorusGeometry(0.205, 0.026, 6, 20).rotateY(Math.PI / 2).translate(0.15, 0, 0), flat(GOLD)),
    paintVertices(new TorusGeometry(0.205, 0.026, 6, 20).rotateY(Math.PI / 2).translate(-0.15, 0, 0), flat(GOLD)),
    paintVertices(
      new CylinderGeometry(0.12, 0.12, 0.03, 16).rotateZ(Math.PI / 2).translate(0.235, 0, 0),
      flat(GOLD, 1.1),
    ),
    paintVertices(
      new CylinderGeometry(0.12, 0.12, 0.03, 16).rotateZ(Math.PI / 2).translate(-0.235, 0, 0),
      flat(GOLD, 1.1),
    ),
    paintVertices(new SphereGeometry(0.065, 8, 6).translate(0, -0.84, 0), flat(GOLD)),
    paintVertices(new CylinderGeometry(0.06, 0.06, 0.05, 8).translate(0, -0.22, 0), flat(GOLD, 0.9)),
  ]);

  return { wood: merge([head, handle, tassel]), gold };
}

export function malletGeometry(): MalletGeometry {
  cachedMallet ??= buildMallet();

  return cachedMallet;
}
