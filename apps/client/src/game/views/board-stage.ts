import {
  ACESFilmicToneMapping,
  BoxGeometry,
  CanvasTexture,
  CircleGeometry,
  Color,
  DirectionalLight,
  Fog,
  Group,
  HemisphereLight,
  InstancedMesh,
  Matrix4,
  Mesh,
  MeshStandardMaterial,
  PCFSoftShadowMap,
  PerspectiveCamera,
  Plane,
  Raycaster,
  SRGBColorSpace,
  Scene,
  Vector2 as NdcPoint,
  Vector3,
  WebGLRenderer,
  type ColorRepresentation,
} from "three";
import type { BoardGrid, Vector2 } from "@jev-game/game";
import { easeInOut } from "./easing.js";

export interface ViewportInsets {
  left: number;
  right: number;
  top: number;
  bottom: number;
}

export const NO_INSETS: ViewportInsets = { left: 0, right: 0, top: 0, bottom: 0 };

export type ViewSide = "south" | "north";

export interface ScreenPoint {
  x: number;
  y: number;
}

interface ScreenBounds {
  minX: number;
  maxX: number;
  minY: number;
  maxY: number;
}

interface CameraFit {
  distance: number;
  offsetX: number;
  offsetY: number;
}

interface CameraGlide {
  from: CameraFit;
  to: CameraFit;
  elapsed: number;
}

export interface BoardStyle {
  tileLight: ColorRepresentation;
  tileDark: ColorRepresentation;
  grout: ColorRepresentation;
  frame: ColorRepresentation;
  caps: ColorRepresentation;
  capsMetalness: number;
  plinth: ColorRepresentation;
}

export interface StageAtmosphere {
  backdrop: ColorRepresentation;
  fogBeyond: number;
  fogDepth: number;
  skyLight: ColorRepresentation;
  groundLight: ColorRepresentation;
  ambient: number;
  sun: ColorRepresentation;
  sunIntensity: number;
  rim: ColorRepresentation;
  rimIntensity: number;
  exposure: number;
  shadowReach: number;
  glowFloor: boolean;
}

export interface StageTheme {
  board: BoardStyle;
  atmosphere: StageAtmosphere;
}

export const DEFAULT_STAGE_THEME: StageTheme = {
  board: {
    tileLight: "#8f89a7",
    tileDark: "#7f7998",
    grout: "#2b2858",
    frame: "#4a4560",
    caps: "#e2bd5c",
    capsMetalness: 0.6,
    plinth: "#312e40",
  },
  atmosphere: {
    backdrop: "#0c0b1d",
    fogBeyond: 70,
    fogDepth: 640,
    skyLight: "#d6d2f0",
    groundLight: "#1f1c42",
    ambient: 1.25,
    sun: "#fff1dc",
    sunIntensity: 2.3,
    rim: "#8b84bd",
    rimIntensity: 1.1,
    exposure: 1.05,
    shadowReach: 70,
    glowFloor: true,
  },
};

export interface StageStats {
  drawCalls: number;
  triangles: number;
  geometries: number;
  textures: number;
  shaders: number;
}

export interface BoardStage {
  readonly scene: Scene;
  readonly canvas: HTMLCanvasElement;
  readonly overlay: HTMLElement;
  showBoard(grid: BoardGrid, side: ViewSide, insets: ViewportInsets): void;
  toScene(point: Vector2, height: number): Vector3;
  toScreen(point: Vector3): ScreenPoint | null;
  groundPointAt(clientX: number, clientY: number): Vector2 | null;
  setExposure(multiplier: number): void;
  setTheme(theme: StageTheme): void;
  stats(): StageStats;
  onFrame(listener: (deltaSeconds: number) => void): () => void;
  dispose(): void;
}

const FIELD_OF_VIEW_DEGREES = 30;

const PITCH_RADIANS = (56 * Math.PI) / 180;

const FIT_PADDING_PIXELS = 24;

const FIT_HEIGHT_UNITS = 11;

const MAX_FRAME_SECONDS = 0.1;

const TILE_HEIGHT = 1.2;

const TILE_GAP_FRACTION = 0.06;

const FRAME_WIDTH = 3;

const FRAME_HEIGHT = 1.8;

const PLINTH_DEPTH = 6;

export const STAGE_FLOOR_Y = -PLINTH_DEPTH;

const NEAR_TINT = new Color("#4ea1ff");

const FAR_TINT = new Color("#ff6b6b");

const SIDE_TINT_AMOUNT = 0.1;

const GROUND_RADIUS = 260;

const CORNER_CAP_SIZE = 4.2;

const GLIDE_SECONDS = 0.5;

export function boardFootprint(grid: BoardGrid): number {
  return Math.max(grid.width, grid.height) / 2 + FRAME_WIDTH + 1;
}

interface StageLights {
  hemisphere: HemisphereLight;
  key: DirectionalLight;
  rim: DirectionalLight;
  rig: Group;
}

function sameGrid(first: BoardGrid | null, second: BoardGrid): boolean {
  return (
    first !== null &&
    first.width === second.width &&
    first.height === second.height &&
    first.columns === second.columns &&
    first.rows === second.rows
  );
}

function sameInsets(first: ViewportInsets, second: ViewportInsets): boolean {
  return (
    first.left === second.left &&
    first.right === second.right &&
    first.top === second.top &&
    first.bottom === second.bottom
  );
}

function createLights(scene: Scene): StageLights {
  const hemisphere = new HemisphereLight();
  scene.add(hemisphere);

  const rig = new Group();
  const key = new DirectionalLight();
  key.position.set(-45, 95, 60);
  key.castShadow = true;
  key.shadow.mapSize.set(2048, 2048);
  key.shadow.camera.near = 10;
  key.shadow.camera.far = 260;
  key.shadow.bias = -0.0004;
  key.shadow.normalBias = 0.03;

  const rim = new DirectionalLight();
  rim.position.set(30, 60, -90);

  rig.add(key, rim);
  scene.add(rig);

  return { hemisphere, key, rim, rig };
}

function createGlowTexture(): CanvasTexture {
  const canvas = document.createElement("canvas");
  canvas.width = 256;
  canvas.height = 256;
  const context = canvas.getContext("2d")!;
  const gradient = context.createRadialGradient(128, 128, 0, 128, 128, 128);
  gradient.addColorStop(0, "#3a366f");
  gradient.addColorStop(0.45, "#1f1c42");
  gradient.addColorStop(1, "#0c0b1d");
  context.fillStyle = gradient;
  context.fillRect(0, 0, 256, 256);

  const texture = new CanvasTexture(canvas);
  texture.colorSpace = SRGBColorSpace;

  return texture;
}

function createGround(scene: Scene): Mesh<CircleGeometry, MeshStandardMaterial> {
  const ground = new Mesh(
    new CircleGeometry(GROUND_RADIUS, 48),
    new MeshStandardMaterial({ map: createGlowTexture(), roughness: 1 }),
  );

  ground.rotation.x = -Math.PI / 2;
  ground.position.y = -PLINTH_DEPTH;
  scene.add(ground);

  return ground;
}

function tileColor(grid: BoardGrid, side: ViewSide, style: BoardStyle, column: number, row: number): Color {
  const base = new Color((column + row) % 2 === 0 ? style.tileLight : style.tileDark);
  const isSouthHalf = row >= grid.rows / 2;
  const isNear = side === "south" ? isSouthHalf : !isSouthHalf;

  return base.lerp(isNear ? NEAR_TINT : FAR_TINT, SIDE_TINT_AMOUNT);
}

function createBoardMeshes(grid: BoardGrid, side: ViewSide, style: BoardStyle): Group {
  const board = new Group();
  const size = grid.width / grid.columns;
  const tileSize = size * (1 - TILE_GAP_FRACTION);

  const tiles = new InstancedMesh(
    new BoxGeometry(tileSize, TILE_HEIGHT, tileSize),
    new MeshStandardMaterial({ roughness: 0.85, metalness: 0 }),
    grid.columns * grid.rows,
  );

  const placement = new Matrix4();

  for (let row = 0; row < grid.rows; row += 1) {
    for (let column = 0; column < grid.columns; column += 1) {
      const index = row * grid.columns + column;

      placement.makeTranslation(
        (column + 0.5) * size - grid.width / 2,
        -TILE_HEIGHT / 2,
        (row + 0.5) * size - grid.height / 2,
      );

      tiles.setMatrixAt(index, placement);
      tiles.setColorAt(index, tileColor(grid, side, style, column, row));
    }
  }

  tiles.receiveShadow = true;

  const grout = new Mesh(
    new BoxGeometry(grid.width, TILE_HEIGHT, grid.height),
    new MeshStandardMaterial({ color: style.grout, roughness: 1 }),
  );

  grout.position.y = -TILE_HEIGHT / 2 - 0.15;
  grout.receiveShadow = true;

  const frameMaterial = new MeshStandardMaterial({ color: style.frame, roughness: 0.9 });
  const outerWidth = grid.width + FRAME_WIDTH * 2;

  const frameParts = [
    { x: 0, z: -(grid.height + FRAME_WIDTH) / 2, width: outerWidth, depth: FRAME_WIDTH },
    { x: 0, z: (grid.height + FRAME_WIDTH) / 2, width: outerWidth, depth: FRAME_WIDTH },
    { x: -(grid.width + FRAME_WIDTH) / 2, z: 0, width: FRAME_WIDTH, depth: grid.height },
    { x: (grid.width + FRAME_WIDTH) / 2, z: 0, width: FRAME_WIDTH, depth: grid.height },
  ];

  for (const part of frameParts) {
    const mesh = new Mesh(new BoxGeometry(part.width, FRAME_HEIGHT, part.depth), frameMaterial);
    mesh.position.set(part.x, FRAME_HEIGHT / 2 - TILE_HEIGHT, part.z);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    board.add(mesh);
  }

  const brass = new MeshStandardMaterial({ color: style.caps, roughness: 0.45, metalness: style.capsMetalness });
  const cornerX = (grid.width + FRAME_WIDTH) / 2;
  const cornerZ = (grid.height + FRAME_WIDTH) / 2;

  for (const x of [-cornerX, cornerX]) {
    for (const z of [-cornerZ, cornerZ]) {
      const cap = new Mesh(new BoxGeometry(CORNER_CAP_SIZE, FRAME_HEIGHT + 0.6, CORNER_CAP_SIZE), brass);
      cap.position.set(x, (FRAME_HEIGHT + 0.6) / 2 - TILE_HEIGHT, z);
      cap.castShadow = true;
      board.add(cap);
    }
  }

  const plinth = new Mesh(
    new BoxGeometry(outerWidth + 2, PLINTH_DEPTH, grid.height + FRAME_WIDTH * 2 + 2),
    new MeshStandardMaterial({ color: style.plinth, roughness: 1 }),
  );

  plinth.position.y = -TILE_HEIGHT - PLINTH_DEPTH / 2;
  plinth.receiveShadow = true;

  board.add(tiles, grout, plinth);

  return board;
}

function disposeTree(root: Group): void {
  root.traverse((node) => {
    if (node instanceof InstancedMesh) {
      node.dispose();
    }

    if (node instanceof Mesh) {
      node.geometry.dispose();
      const materials = Array.isArray(node.material) ? node.material : [node.material];

      for (const material of materials) {
        material.dispose();
      }
    }
  });
}

export function createBoardStage(container: HTMLElement): BoardStage {
  const renderer = new WebGLRenderer({ antialias: true, powerPreference: "high-performance" });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.toneMapping = ACESFilmicToneMapping;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = PCFSoftShadowMap;

  const canvas = renderer.domElement;
  canvas.classList.add("board-canvas");

  const overlay = document.createElement("div");
  overlay.className = "board-overlay";
  container.append(canvas, overlay);

  const scene = new Scene();
  const camera = new PerspectiveCamera(FIELD_OF_VIEW_DEGREES, 1, 1, 3000);
  const lights = createLights(scene);
  const ground = createGround(scene);
  const raycaster = new Raycaster();
  const groundPlane = new Plane(new Vector3(0, 1, 0), 0);
  const listeners = new Set<(deltaSeconds: number) => void>();

  let grid: BoardGrid | null = null;
  let side: ViewSide = "south";
  let insets: ViewportInsets = NO_INSETS;
  let board: Group | null = null;
  let viewportWidth = 1;
  let viewportHeight = 1;
  let isVisible = true;
  let animationFrame = 0;
  let lastFrameTime = performance.now();
  let fit: CameraFit | null = null;
  let glide: CameraGlide | null = null;
  let theme = DEFAULT_STAGE_THEME;
  let exposureBoost = 1;
  const fog = new Fog(new Color(theme.atmosphere.backdrop));
  scene.fog = fog;

  function placeFog(): void {
    const distance = fit?.distance ?? 0;
    fog.near = distance + theme.atmosphere.fogBeyond;
    fog.far = fog.near + theme.atmosphere.fogDepth;
  }

  function applyAtmosphere(): void {
    const { atmosphere } = theme;
    const backdrop = new Color(atmosphere.backdrop);
    scene.background = backdrop;
    fog.color.copy(backdrop);
    placeFog();
    lights.hemisphere.color.set(atmosphere.skyLight);
    lights.hemisphere.groundColor.set(atmosphere.groundLight);
    lights.hemisphere.intensity = atmosphere.ambient;
    lights.key.color.set(atmosphere.sun);
    lights.key.intensity = atmosphere.sunIntensity;
    lights.rim.color.set(atmosphere.rim);
    lights.rim.intensity = atmosphere.rimIntensity;

    const shadowCamera = lights.key.shadow.camera;
    shadowCamera.left = -atmosphere.shadowReach;
    shadowCamera.right = atmosphere.shadowReach;
    shadowCamera.top = atmosphere.shadowReach;
    shadowCamera.bottom = -atmosphere.shadowReach;
    shadowCamera.updateProjectionMatrix();

    ground.visible = atmosphere.glowFloor;
    renderer.toneMappingExposure = atmosphere.exposure * exposureBoost;
  }

  function rebuildBoard(nextGrid: BoardGrid, nextSide: ViewSide): void {
    if (board !== null) {
      scene.remove(board);
      disposeTree(board);
    }

    board = createBoardMeshes(nextGrid, nextSide, theme.board);
    scene.add(board);
  }

  applyAtmosphere();

  function placeCamera(distance: number): void {
    const direction = side === "south" ? 1 : -1;

    camera.position.set(0, distance * Math.sin(PITCH_RADIANS), direction * distance * Math.cos(PITCH_RADIANS));
    camera.lookAt(0, 0, 0);
    camera.updateMatrixWorld();
    camera.updateProjectionMatrix();
  }

  function projectedBounds(): ScreenBounds {
    const halfWidth = (grid?.width ?? 80) / 2 + FRAME_WIDTH;
    const halfHeight = (grid?.height ?? 80) / 2 + FRAME_WIDTH;
    const corner = new Vector3();
    let minX = Number.POSITIVE_INFINITY;
    let maxX = Number.NEGATIVE_INFINITY;
    let minY = Number.POSITIVE_INFINITY;
    let maxY = Number.NEGATIVE_INFINITY;

    for (const x of [-halfWidth, halfWidth]) {
      for (const z of [-halfHeight, halfHeight]) {
        for (const y of [0, FIT_HEIGHT_UNITS]) {
          corner.set(x, y, z).project(camera);
          const pixelX = ((corner.x + 1) / 2) * viewportWidth;
          const pixelY = ((1 - corner.y) / 2) * viewportHeight;
          minX = Math.min(minX, pixelX);
          maxX = Math.max(maxX, pixelX);
          minY = Math.min(minY, pixelY);
          maxY = Math.max(maxY, pixelY);
        }
      }
    }

    return { minX, maxX, minY, maxY };
  }

  function applyFit(next: CameraFit): void {
    placeCamera(next.distance);
    camera.setViewOffset(viewportWidth, viewportHeight, next.offsetX, next.offsetY, viewportWidth, viewportHeight);
    camera.updateProjectionMatrix();
    fit = next;
    placeFog();
  }

  function solveFit(): CameraFit {
    camera.aspect = viewportWidth / viewportHeight;
    camera.clearViewOffset();

    const safeWidth = Math.max(1, viewportWidth - insets.left - insets.right - FIT_PADDING_PIXELS * 2);
    const safeHeight = Math.max(1, viewportHeight - insets.top - insets.bottom - FIT_PADDING_PIXELS * 2);

    let near = 20;
    let far = 4000;

    for (let step = 0; step < 40; step += 1) {
      const distance = (near + far) / 2;
      placeCamera(distance);
      const bounds = projectedBounds();
      const fits = bounds.maxX - bounds.minX <= safeWidth && bounds.maxY - bounds.minY <= safeHeight;

      if (fits) {
        far = distance;
      } else {
        near = distance;
      }
    }

    placeCamera(far);

    const bounds = projectedBounds();
    const safeCenterX = insets.left + FIT_PADDING_PIXELS + safeWidth / 2;
    const safeCenterY = insets.top + FIT_PADDING_PIXELS + safeHeight / 2;

    return {
      distance: far,
      offsetX: (bounds.minX + bounds.maxX) / 2 - safeCenterX,
      offsetY: (bounds.minY + bounds.maxY) / 2 - safeCenterY,
    };
  }

  function fitCamera(): void {
    glide = null;
    applyFit(solveFit());
  }

  function glideCamera(from: CameraFit): void {
    glide = { from, to: solveFit(), elapsed: 0 };
    applyFit(from);
  }

  function stepGlide(deltaSeconds: number): void {
    if (glide === null) {
      return;
    }

    glide.elapsed += deltaSeconds;
    const { from, to } = glide;
    const progress = easeInOut(Math.min(1, glide.elapsed / GLIDE_SECONDS));

    if (progress >= 1) {
      glide = null;
    }

    applyFit({
      distance: from.distance + (to.distance - from.distance) * progress,
      offsetX: from.offsetX + (to.offsetX - from.offsetX) * progress,
      offsetY: from.offsetY + (to.offsetY - from.offsetY) * progress,
    });
  }

  function measure(): boolean {
    const width = container.clientWidth;
    const height = container.clientHeight;
    isVisible = width > 0 && height > 0;

    if (!isVisible || (width === viewportWidth && height === viewportHeight)) {
      return false;
    }

    viewportWidth = width;
    viewportHeight = height;
    renderer.setSize(width, height, false);

    return true;
  }

  const resizeObserver = new ResizeObserver(() => {
    if (measure()) {
      fitCamera();
    }
  });

  resizeObserver.observe(container);
  measure();
  fitCamera();

  function frame(now: number): void {
    const deltaSeconds = Math.min(MAX_FRAME_SECONDS, Math.max(0, (now - lastFrameTime) / 1000));
    lastFrameTime = now;
    stepGlide(deltaSeconds);

    for (const listener of listeners) {
      listener(deltaSeconds);
    }

    if (isVisible) {
      renderer.render(scene, camera);
    }

    animationFrame = requestAnimationFrame(frame);
  }

  animationFrame = requestAnimationFrame(frame);

  return {
    scene,
    canvas,
    overlay,

    showBoard(nextGrid, nextSide, nextInsets) {
      if (!sameGrid(grid, nextGrid) || side !== nextSide || board === null) {
        rebuildBoard(nextGrid, nextSide);
      }

      const resized = measure();
      const reframe = resized || !sameGrid(grid, nextGrid);
      const turned = side !== nextSide;
      const shifted = !sameInsets(insets, nextInsets);
      grid = { ...nextGrid };
      side = nextSide;
      insets = nextInsets;
      lights.rig.rotation.y = side === "south" ? 0 : Math.PI;

      if (reframe || fit === null) {
        fitCamera();
      } else if (shifted) {
        glideCamera(fit);
      } else if (turned) {
        applyFit(fit);
      }
    },

    toScene(point, height) {
      const width = grid?.width ?? 0;
      const depth = grid?.height ?? 0;

      return new Vector3(point.x - width / 2, height, point.y - depth / 2);
    },

    toScreen(point) {
      const projected = point.clone().project(camera);

      if (projected.z > 1) {
        return null;
      }

      return {
        x: ((projected.x + 1) / 2) * viewportWidth,
        y: ((1 - projected.y) / 2) * viewportHeight,
      };
    },

    groundPointAt(clientX, clientY) {
      const rect = canvas.getBoundingClientRect();

      if (rect.width === 0 || rect.height === 0 || grid === null) {
        return null;
      }

      const ndc = new NdcPoint(
        ((clientX - rect.left) / rect.width) * 2 - 1,
        -((clientY - rect.top) / rect.height) * 2 + 1,
      );

      raycaster.setFromCamera(ndc, camera);
      const hit = raycaster.ray.intersectPlane(groundPlane, new Vector3());

      if (hit === null) {
        return null;
      }

      return { x: hit.x + grid.width / 2, y: hit.z + grid.height / 2 };
    },

    setExposure(multiplier) {
      exposureBoost = multiplier;
      renderer.toneMappingExposure = theme.atmosphere.exposure * exposureBoost;
    },

    stats() {
      const { info } = renderer;

      return {
        drawCalls: info.render.calls,
        triangles: info.render.triangles,
        geometries: info.memory.geometries,
        textures: info.memory.textures,
        shaders: info.programs?.length ?? 0,
      };
    },

    setTheme(nextTheme) {
      theme = nextTheme;
      applyAtmosphere();

      if (board !== null && grid !== null) {
        rebuildBoard(grid, side);
      }
    },

    onFrame(listener) {
      listeners.add(listener);

      return () => {
        listeners.delete(listener);
      };
    },

    dispose() {
      cancelAnimationFrame(animationFrame);
      resizeObserver.disconnect();
      listeners.clear();

      if (board !== null) {
        disposeTree(board);
      }

      ground.geometry.dispose();
      ground.material.map?.dispose();
      ground.material.dispose();
      renderer.dispose();
      renderer.forceContextLoss();
      canvas.remove();
      overlay.remove();
    },
  };
}
