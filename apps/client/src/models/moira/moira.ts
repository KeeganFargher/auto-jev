import {
  Color,
  Group,
  Mesh,
  MeshPhysicalMaterial,
  MeshStandardMaterial,
  Object3D,
  SphereGeometry,
  Vector2,
  Vector3,
  type BufferGeometry,
  type ColorRepresentation,
  type Material,
  type Texture,
} from "three";
import {
  buildEyeKit,
  createEye,
  eyeballMaterialOf,
  LID_SHELL,
  type EyeDesign,
  type EyeDetail,
  type EyeKit,
} from "./eye.js";
import { createFuzz } from "./fuzz.js";
import type { SphereField } from "./sphere-field.js";
import { createTendrils, type TendrilDesign, type TendrilDetail } from "./tendrils.js";
import {
  createIrisTextures,
  createStudioLight,
  createThreadTextures,
  type IrisTextures,
  type ThreadTextures,
} from "./textures.js";
import { strandGeometry, windBall, type WindingDetail } from "./winding.js";

export type MoiraDetail = "studio" | "board";

export interface Moira {
  readonly root: Group;
  readonly eyeSocket: Object3D;
  readonly ballCenter: Vector3;
  readonly eyeCenter: Vector3;
  readonly ballRadius: number;
  readonly triangles: number;
  readonly surfaces: readonly MeshStandardMaterial[];
  update(deltaSeconds: number): void;
  gaze(yaw: number, pitch: number): void;
  wander(): void;
  blink(): void;
  setOpenness(amount: number): void;
  setGlow(amount: number): void;
  setStir(amount: number): void;
  setClench(amount: number): void;
  setFlash(amount: number): void;
  setTeamColor(color: ColorRepresentation | null): void;
  dispose(): void;
}

interface DetailLevel {
  readonly winding: WindingDetail;
  readonly sides: number;
  readonly rays: number;
  readonly eye: EyeDetail;
  readonly tendril: TendrilDetail;
  readonly coreSegments: number;
  readonly lean: number;
  readonly fuzz: number;
}

interface MoiraKit {
  readonly fibres: ThreadTextures;
  readonly iris: IrisTextures;
  readonly light: Texture;
  readonly field: SphereField;
  readonly thread: BufferGeometry;
  readonly team: BufferGeometry;
  readonly glow: BufferGeometry;
  readonly core: BufferGeometry;
  readonly fuzz: BufferGeometry | null;
  readonly eye: EyeKit;
  readonly triangles: number;
}

const DETAILS: Record<MoiraDetail, DetailLevel> = {
  studio: {
    winding: { bands: 8, fewestWraps: 2, mostWraps: 3, step: 0.035, fieldResolution: 192 },
    sides: 12,
    rays: 12,
    eye: { segments: 96, lidWraps: 4, lidSides: 10, lidStep: 0.04, rays: 12 },
    tendril: { points: 90, sides: 10 },
    coreSegments: 48,
    lean: 0,
    fuzz: 420,
  },
  board: {
    winding: { bands: 6, fewestWraps: 2, mostWraps: 3, step: 0.16, fieldResolution: 96 },
    sides: 6,
    rays: 8,
    eye: { segments: 28, lidWraps: 3, lidSides: 6, lidStep: 0.18, rays: 8 },
    tendril: { points: 26, sides: 6 },
    coreSegments: 16,
    lean: -0.78,
    fuzz: 0,
  },
};

const SEED = 7_071_979;

const BALL_HEIGHT = 5.75;

const CORE_RADIUS = 2.3;

const STRAND_WIDTH = 0.54;

const STRAND_THICKNESS = 0.24;

const EYE_AXIS = new Vector3(0.17, 0.06, 1).normalize();

const EYE_CENTER_DISTANCE = 1.3;

const EYE_RADIUS = 1.55;

const LID_GAP = 0.1;

const SOCKET_CLEARANCE = 0.4;

const LOOP_PEAKS = [new Vector3(-0.55, 0.78, 0.28), new Vector3(-0.15, 0.92, -0.35), new Vector3(-0.88, 0.42, -0.1)];

const TENDRIL_REACH = 2.5;

const BOB_UNITS = 0.16;

const GLOW_INTENSITY = 3.6;

const THREAD_TILE = 1.2;

const THREAD_COLOR = "#c0136a";

const LID_TINT = new Color("#b0125f");

const TENDRIL_TINT = new Color("#bc1668");

const MASS_BLEND = 0.32;

const RIM_COLOR = new Color("#ff3fb4").multiplyScalar(0.3);

const RIM_POWER = 6;

const EYE_DESIGN: EyeDesign = {
  axis: EYE_AXIS,
  centerDistance: EYE_CENTER_DISTANCE,
  radius: EYE_RADIUS,
  lidGap: LID_GAP,
  upperEdge: 0.5,
  lowerEdge: -0.38,
  closedEdge: -0.16,
  roll: -0.06,
  lidTint: LID_TINT,
};

const TENDRIL_DESIGN: TendrilDesign = {
  roots: [
    { direction: new Vector3(-0.55, -1, 0.35), length: TENDRIL_REACH, phase: 0.2, curl: 8.4, turn: 0.5 },
    { direction: new Vector3(0.1, -1, 0.55), length: TENDRIL_REACH * 0.85, phase: 1.9, curl: 9.6, turn: -1.3 },
    { direction: new Vector3(0.6, -1, 0.2), length: TENDRIL_REACH * 1.05, phase: 3.4, curl: 7.8, turn: -0.4 },
    { direction: new Vector3(0.35, -1, -0.55), length: TENDRIL_REACH * 0.9, phase: 4.6, curl: 9, turn: 1.1 },
    { direction: new Vector3(-0.45, -1, -0.45), length: TENDRIL_REACH * 0.8, phase: 5.8, curl: 10.2, turn: -0.9 },
  ],
  ballRadius: CORE_RADIUS + STRAND_THICKNESS,
  rootWidth: 0.5,
  tipWidth: 0.05,
  rootThickness: 0.38,
  tipThickness: 0.04,
  tint: TENDRIL_TINT,
};

const IRIS_GLOW = 0.35;

const kits = new Map<MoiraDetail, MoiraKit>();

function patch(source: string, anchor: string, addition: string): string {
  if (!source.includes(anchor)) {
    throw new Error(`Shader anchor ${anchor} is missing`);
  }

  return source.replace(anchor, `${anchor}\n${addition}`);
}

function addSilhouetteRim(material: MeshPhysicalMaterial): void {
  material.onBeforeCompile = (shader) => {
    shader.uniforms["rimColor"] = { value: RIM_COLOR };
    shader.uniforms["rimPower"] = { value: RIM_POWER };
    shader.vertexShader = patch(shader.vertexShader, "#include <common>", "varying vec3 vBallNormal;");
    shader.vertexShader = patch(
      shader.vertexShader,
      "#include <begin_vertex>",
      "vBallNormal = normalize((modelViewMatrix * vec4(position, 0.0)).xyz);",
    );
    shader.fragmentShader = patch(
      shader.fragmentShader,
      "#include <common>",
      "varying vec3 vBallNormal;\nuniform vec3 rimColor;\nuniform float rimPower;",
    );
    shader.fragmentShader = patch(
      shader.fragmentShader,
      "#include <emissivemap_fragment>",
      "totalEmissiveRadiance += rimColor * pow(1.0 - saturate(dot(normalize(vBallNormal), normalize(vViewPosition))), rimPower);",
    );
  };

  material.customProgramCacheKey = () => "moira-silhouette-rim";
}

function buildKit(detail: MoiraDetail): MoiraKit {
  const level = DETAILS[detail];
  const socketRadius = EYE_RADIUS + LID_GAP + LID_SHELL;

  const ball = windBall(
    {
      seed: SEED,
      coreRadius: CORE_RADIUS,
      width: STRAND_WIDTH,
      thickness: STRAND_THICKNESS,
      socket: {
        axis: EYE_AXIS,
        center: EYE_AXIS.clone().multiplyScalar(EYE_CENTER_DISTANCE),
        radius: socketRadius,
        clearance: SOCKET_CLEARANCE,
      },
      loops: detail === "studio" ? LOOP_PEAKS : LOOP_PEAKS.slice(0, 1),
      browTilt: -0.1,
    },
    level.winding,
  );

  const style = { sides: level.sides, squareness: 2.2, tileLength: THREAD_TILE };
  const thread = strandGeometry(ball.strands, "thread", style, ball.field, level.rays, MASS_BLEND);
  const team = strandGeometry(ball.strands, "team", style, ball.field, level.rays, MASS_BLEND);

  const glow = strandGeometry(
    ball.strands,
    "glow",
    { sides: Math.max(6, level.sides - 4), squareness: 2, tileLength: THREAD_TILE },
    ball.field,
    0,
    0,
  );

  const core = new SphereGeometry(CORE_RADIUS - 0.03, level.coreSegments, Math.round(level.coreSegments * 0.7));
  const fuzz = level.fuzz > 0 ? createFuzz(ball.strands, level.fuzz, SEED + 2, STRAND_THICKNESS) : null;
  const eye = buildEyeKit(EYE_DESIGN, level.eye, ball.field);
  let triangles = eye.triangles;

  for (const geometry of [thread, team, glow, core, fuzz]) {
    triangles += (geometry?.index?.count ?? 0) / 3;
  }

  return {
    fibres: createThreadTextures(SEED),
    iris: createIrisTextures(SEED + 1, 0.98),
    light: createStudioLight(),
    field: ball.field,
    thread,
    team,
    glow,
    core,
    fuzz,
    eye,
    triangles,
  };
}

function kitFor(detail: MoiraDetail): MoiraKit {
  const known = kits.get(detail);

  if (known !== undefined) {
    return known;
  }

  const built = buildKit(detail);
  kits.set(detail, built);

  return built;
}

export function createMoira(detail: MoiraDetail): Moira {
  const level = DETAILS[detail];
  const kit = kitFor(detail);
  const root = new Group();
  root.name = "moira";
  const body = new Group();
  body.position.y = BALL_HEIGHT;
  root.add(body);

  const thread = new MeshPhysicalMaterial({
    color: new Color("#ffffff"),
    vertexColors: true,
    map: kit.fibres.albedo,
    normalMap: kit.fibres.normal,
    normalScale: new Vector2(0.9, 0.9),
    roughness: 0.62,
    sheen: 0.15,
    sheenColor: new Color("#ff2f8f"),
    sheenRoughness: 0.5,
    envMap: kit.light,
    envMapIntensity: 0.12,
  });

  const plain = thread.clone();
  addSilhouetteRim(thread);

  const team = thread.clone();
  team.color.set(THREAD_COLOR);
  addSilhouetteRim(team);

  const glow = new MeshStandardMaterial({
    color: new Color("#4a1244"),
    emissive: new Color("#e45cff"),
    emissiveIntensity: GLOW_INTENSITY,
    emissiveMap: kit.fibres.albedo,
    map: kit.fibres.albedo,
    roughness: 0.5,
  });

  const core = new MeshStandardMaterial({ color: new Color("#4a0f2c"), roughness: 1 });
  const fuzz = new MeshStandardMaterial({ color: new Color("#ffffff"), vertexColors: true, roughness: 0.78 });
  const eyeball = eyeballMaterialOf(kit.iris.color, kit.iris.glow, kit.light);
  const materials: Material[] = [thread, plain, team, glow, core, eyeball, fuzz];

  const meshes = [
    new Mesh(kit.core, core),
    new Mesh(kit.thread, thread),
    new Mesh(kit.team, team),
    new Mesh(kit.glow, glow),
  ];

  const eye = createEye(kit.eye, EYE_DESIGN, plain, eyeball);
  const tendrils = createTendrils(TENDRIL_DESIGN, level.tendril, kit.field);
  const tendrilMesh = new Mesh(tendrils.geometry, plain);
  const eyeSocket = new Object3D();
  eyeSocket.position.copy(EYE_AXIS).multiplyScalar(EYE_CENTER_DISTANCE + EYE_RADIUS);
  body.add(...meshes, eye.root, tendrilMesh, eyeSocket);

  if (kit.fuzz !== null) {
    const fuzzMesh = new Mesh(kit.fuzz, fuzz);
    fuzzMesh.receiveShadow = true;
    body.add(fuzzMesh);
  }

  const selfShadowing = detail === "studio";

  for (const mesh of [...meshes, eye.eyeball, tendrilMesh]) {
    mesh.castShadow = true;
    mesh.receiveShadow = selfShadowing;
  }

  eye.root.traverse((node) => {
    if (node instanceof Mesh) {
      node.receiveShadow = selfShadowing;
    }
  });

  let time = 0;
  let glowBoost = 1;
  let stir = 0;
  let clench = 0;

  return {
    root,
    eyeSocket,
    ballCenter: new Vector3(0, BALL_HEIGHT, 0),
    eyeCenter: new Vector3(0, BALL_HEIGHT, 0).addScaledVector(EYE_AXIS, EYE_CENTER_DISTANCE + EYE_RADIUS),
    ballRadius: CORE_RADIUS + STRAND_THICKNESS * 2,
    triangles: kit.triangles + tendrils.triangles,
    surfaces: [thread, plain, team, core, eyeball],

    update(deltaSeconds) {
      time += deltaSeconds;
      body.position.y = BALL_HEIGHT + BOB_UNITS * Math.sin(time * 1.25);
      body.rotation.set(
        level.lean + 0.035 * Math.sin(time * 0.93 + 1.1),
        0.07 * Math.sin(time * 0.41),
        0.045 * Math.sin(time * 0.7),
      );
      eye.update(deltaSeconds);
      tendrils.update(time, Math.min(1, 0.5 + 0.5 * Math.sin(time * 1.25 - 0.8) + stir), clench);
      glow.emissiveIntensity = GLOW_INTENSITY * glowBoost * (0.82 + 0.18 * Math.sin(time * 2.1));
      eyeball.emissiveIntensity = IRIS_GLOW * glowBoost;
    },

    gaze(yaw, pitch) {
      eye.gaze(yaw, pitch);
    },

    wander() {
      eye.wander();
    },

    blink() {
      eye.blink();
    },

    setOpenness(amount) {
      eye.setOpenness(amount);
    },

    setGlow(amount) {
      glowBoost = Math.max(0, amount);
    },

    setStir(amount) {
      stir = Math.max(0, amount);
    },

    setClench(amount) {
      clench = Math.min(1, Math.max(0, amount));
    },

    setFlash(amount) {
      for (const surface of [thread, plain, team, core]) {
        surface.emissive.setScalar(amount);
      }
    },

    setTeamColor(color) {
      team.color.set(color ?? THREAD_COLOR);
    },

    dispose() {
      tendrils.geometry.dispose();

      for (const material of materials) {
        material.dispose();
      }
    },
  };
}
