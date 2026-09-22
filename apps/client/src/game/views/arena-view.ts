import type { Vector2 } from "@jev-game/game";

const PADDING_PIXELS = 32;

const GRID_UNITS = 10;

const FLOOR_COLOR = "#191926";

const GRID_COLOR = "rgba(255, 255, 255, 0.06)";

export interface CanvasTransform {
  scale: number;
  worldToCanvas(point: Vector2): Vector2;
  canvasToWorld(point: Vector2): Vector2;
}

export interface ArenaView {
  canvas: HTMLCanvasElement;
  ctx: CanvasRenderingContext2D;
  arenaWidthUnits: number;
  arenaHeightUnits: number;
  getTransform(): CanvasTransform;
  drawFloor(): void;
  dispose(): void;
}

function computeTransform(
  viewportWidth: number,
  viewportHeight: number,
  arenaWidthUnits: number,
  arenaHeightUnits: number,
): CanvasTransform {
  const safeWidth = Math.max(1, viewportWidth - PADDING_PIXELS * 2);
  const safeHeight = Math.max(1, viewportHeight - PADDING_PIXELS * 2);

  const scale = Math.min(safeWidth / arenaWidthUnits, safeHeight / arenaHeightUnits);
  const offsetX = (viewportWidth - arenaWidthUnits * scale) / 2;
  const offsetY = (viewportHeight - arenaHeightUnits * scale) / 2;

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
  onResize: () => void,
): ArenaView {
  const canvas = document.createElement("canvas");
  container.appendChild(canvas);

  const ctx = canvas.getContext("2d")!;

  let transform = computeTransform(1, 1, arenaWidthUnits, arenaHeightUnits);

  function resize(): void {
    const dpr = window.devicePixelRatio || 1;
    const width = container.clientWidth;
    const height = container.clientHeight;
    canvas.width = width * dpr;
    canvas.height = height * dpr;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    transform = computeTransform(width, height, arenaWidthUnits, arenaHeightUnits);
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

    drawFloor() {
      const width = container.clientWidth;
      const height = container.clientHeight;

      ctx.fillStyle = FLOOR_COLOR;
      ctx.fillRect(0, 0, width, height);

      const topLeftWorld = transform.canvasToWorld({ x: 0, y: 0 });
      const bottomRightWorld = transform.canvasToWorld({ x: width, y: height });

      ctx.strokeStyle = GRID_COLOR;
      ctx.lineWidth = 1;
      ctx.beginPath();

      const firstWorldX = Math.floor(topLeftWorld.x / GRID_UNITS) * GRID_UNITS;

      for (let worldX = firstWorldX; worldX <= bottomRightWorld.x; worldX += GRID_UNITS) {
        const canvasX = transform.worldToCanvas({ x: worldX, y: 0 }).x;
        ctx.moveTo(canvasX, 0);
        ctx.lineTo(canvasX, height);
      }

      const firstWorldY = Math.floor(topLeftWorld.y / GRID_UNITS) * GRID_UNITS;

      for (let worldY = firstWorldY; worldY <= bottomRightWorld.y; worldY += GRID_UNITS) {
        const canvasY = transform.worldToCanvas({ x: 0, y: worldY }).y;
        ctx.moveTo(0, canvasY);
        ctx.lineTo(width, canvasY);
      }

      ctx.stroke();
    },

    dispose() {
      window.removeEventListener("resize", resize);
      canvas.remove();
    },
  };
}
