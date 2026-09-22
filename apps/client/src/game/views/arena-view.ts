import type { Vector2 } from "@jev-game/game";

const PADDING_PIXELS = 32;

export interface CanvasTransform {
  scale: number;
  worldToCanvas(point: Vector2): Vector2;
  canvasToWorld(point: Vector2): Vector2;
}

export interface SafeAreaInsets {
  top: number;
  right: number;
  bottom: number;
  left: number;
}

const NO_INSETS: SafeAreaInsets = { top: 0, right: 0, bottom: 0, left: 0 };

export interface ArenaView {
  canvas: HTMLCanvasElement;
  ctx: CanvasRenderingContext2D;
  arenaWidthUnits: number;
  arenaHeightUnits: number;
  getTransform(): CanvasTransform;
  clear(): void;
  drawBoundary(): void;
  dispose(): void;
}

function computeTransform(
  viewportWidth: number,
  viewportHeight: number,
  insets: SafeAreaInsets,
  arenaWidthUnits: number,
  arenaHeightUnits: number,
): CanvasTransform {
  const safeLeft = insets.left + PADDING_PIXELS;
  const safeTop = insets.top + PADDING_PIXELS;

  const safeWidth = Math.max(
    1,
    viewportWidth - insets.left - insets.right - PADDING_PIXELS * 2,
  );

  const safeHeight = Math.max(
    1,
    viewportHeight - insets.top - insets.bottom - PADDING_PIXELS * 2,
  );

  const scale = Math.min(safeWidth / arenaWidthUnits, safeHeight / arenaHeightUnits);
  const offsetX = safeLeft + (safeWidth - arenaWidthUnits * scale) / 2;
  const offsetY = safeTop + (safeHeight - arenaHeightUnits * scale) / 2;

  return {
    scale,
    worldToCanvas: (point) => ({ x: offsetX + point.x * scale, y: offsetY + point.y * scale }),
    canvasToWorld: (point) => ({
      x: (point.x - offsetX) / scale,
      y: (point.y - offsetY) / scale,
    }),
  };
}

export function createArenaView(
  container: HTMLElement,
  arenaWidthUnits: number,
  arenaHeightUnits: number,
  getSafeAreaInsets: () => SafeAreaInsets,
  onResize: () => void,
): ArenaView {
  const canvas = document.createElement("canvas");
  container.appendChild(canvas);

  const ctx = canvas.getContext("2d")!;

  let transform = computeTransform(1, 1, NO_INSETS, arenaWidthUnits, arenaHeightUnits);

  function resize(): void {
    const dpr = window.devicePixelRatio || 1;
    const width = container.clientWidth;
    const height = container.clientHeight;
    canvas.width = width * dpr;
    canvas.height = height * dpr;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    transform = computeTransform(
      width,
      height,
      getSafeAreaInsets(),
      arenaWidthUnits,
      arenaHeightUnits,
    );
    onResize();
  }

  resize();
  window.addEventListener("resize", resize);

  return {
    canvas,
    ctx,
    arenaWidthUnits,
    arenaHeightUnits,
    getTransform: () => transform,

    clear() {
      ctx.clearRect(0, 0, container.clientWidth, container.clientHeight);
    },

    drawBoundary() {
      const topLeft = transform.worldToCanvas({ x: 0, y: 0 });
      ctx.strokeStyle = "rgba(255, 255, 255, 0.18)";
      ctx.lineWidth = 1;
      ctx.strokeRect(
        topLeft.x,
        topLeft.y,
        arenaWidthUnits * transform.scale,
        arenaHeightUnits * transform.scale,
      );
    },

    dispose() {
      window.removeEventListener("resize", resize);
      canvas.remove();
    },
  };
}
