import {
  CanvasTexture,
  DataTexture,
  EquirectangularReflectionMapping,
  FloatType,
  LinearFilter,
  LinearMipmapLinearFilter,
  LinearSRGBColorSpace,
  RepeatWrapping,
  RGBAFormat,
  SRGBColorSpace,
  Vector3,
  type Texture,
} from "three";
import { createRng, nextFloat } from "@jev-game/game";

export interface ThreadTextures {
  readonly albedo: Texture;
  readonly normal: Texture;
}

export interface IrisTextures {
  readonly color: Texture;
  readonly glow: Texture;
}

interface Softbox {
  readonly direction: Vector3;
  readonly width: number;
  readonly height: number;
  readonly color: readonly [number, number, number];
}

const FIBRE_WIDTH = 512;

const FIBRE_HEIGHT = 256;

const FIBRES = 300;

const FLYAWAYS = 70;

const WAVE_SEGMENTS = 48;

const NORMAL_STRENGTH = 2.2;

const IRIS_SIZE = 1024;

const IRIS_FIBRES = 900;

const LIGHT_WIDTH = 512;

const LIGHT_HEIGHT = 256;

const ANISOTROPY = 8;

interface PaintCanvas {
  readonly canvas: HTMLCanvasElement;
  readonly context: CanvasRenderingContext2D;
}

function canvasOf(width: number, height: number): PaintCanvas {
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext("2d");

  if (context === null) {
    throw new Error("2D canvas is unavailable");
  }

  return { canvas, context };
}

function grey(level: number, alpha: number): string {
  const value = Math.round(Math.min(Math.max(level, 0), 1) * 255);

  return `rgba(${value}, ${value}, ${value}, ${alpha})`;
}

export function createThreadTextures(seed: number): ThreadTextures {
  const rng = createRng(seed);
  const { canvas, context } = canvasOf(FIBRE_WIDTH, FIBRE_HEIGHT);
  const slope = FIBRE_HEIGHT / FIBRE_WIDTH;

  function random(): number {
    return nextFloat(rng);
  }

  function wavyLine(start: number, amplitude: number, waves: number, phase: number): void {
    for (const shift of [-FIBRE_HEIGHT, 0, FIBRE_HEIGHT]) {
      context.beginPath();

      for (let segment = 0; segment <= WAVE_SEGMENTS; segment += 1) {
        const x = (segment / WAVE_SEGMENTS) * FIBRE_WIDTH;
        const y = start + shift + slope * x + amplitude * Math.sin((x / FIBRE_WIDTH) * Math.PI * 2 * waves + phase);

        if (segment === 0) {
          context.moveTo(x, y);
        } else {
          context.lineTo(x, y);
        }
      }

      context.stroke();
    }
  }

  context.fillStyle = grey(0.84, 1);
  context.fillRect(0, 0, FIBRE_WIDTH, FIBRE_HEIGHT);
  context.lineCap = "round";

  for (let ply = 0; ply < 3; ply += 1) {
    context.filter = "blur(5px)";
    context.strokeStyle = grey(0.42, 0.55);
    context.lineWidth = 10;
    wavyLine((ply / 3) * FIBRE_HEIGHT, 3, 2, random() * Math.PI * 2);
  }

  context.filter = "none";

  for (let fibre = 0; fibre < FIBRES; fibre += 1) {
    context.strokeStyle = grey(0.55 + random() * 0.5, 0.35 + random() * 0.45);
    context.lineWidth = 0.8 + random() * 2.4;
    wavyLine(random() * FIBRE_HEIGHT, random() * 2.5, 1 + Math.floor(random() * 3), random() * Math.PI * 2);
  }

  for (let flyaway = 0; flyaway < FLYAWAYS; flyaway += 1) {
    const x = random() * FIBRE_WIDTH;
    const y = random() * FIBRE_HEIGHT;
    const length = 14 + random() * 40;
    const lean = slope + (random() - 0.5) * 0.6;
    context.strokeStyle = grey(0.95, 0.35 + random() * 0.3);
    context.lineWidth = 0.7 + random() * 0.8;
    context.beginPath();
    context.moveTo(x, y);
    context.lineTo(x + length, y + length * lean);
    context.stroke();
  }

  const pixels = context.getImageData(0, 0, FIBRE_WIDTH, FIBRE_HEIGHT).data;
  const heights = new Float32Array(FIBRE_WIDTH * FIBRE_HEIGHT);

  for (let index = 0; index < heights.length; index += 1) {
    heights[index] = (pixels[index * 4] ?? 0) / 255;
  }

  const normalData = new Uint8Array(FIBRE_WIDTH * FIBRE_HEIGHT * 4);

  function heightAt(column: number, row: number): number {
    const wrappedColumn = (column + FIBRE_WIDTH) % FIBRE_WIDTH;
    const wrappedRow = (row + FIBRE_HEIGHT) % FIBRE_HEIGHT;

    return heights[wrappedRow * FIBRE_WIDTH + wrappedColumn] ?? 0;
  }

  for (let row = 0; row < FIBRE_HEIGHT; row += 1) {
    for (let column = 0; column < FIBRE_WIDTH; column += 1) {
      const dx = (heightAt(column + 1, row) - heightAt(column - 1, row)) * NORMAL_STRENGTH;
      const dy = (heightAt(column, row + 1) - heightAt(column, row - 1)) * NORMAL_STRENGTH;
      const length = Math.hypot(dx, dy, 1);
      const index = (row * FIBRE_WIDTH + column) * 4;
      normalData[index] = Math.round(((-dx / length) * 0.5 + 0.5) * 255);
      normalData[index + 1] = Math.round(((-dy / length) * 0.5 + 0.5) * 255);
      normalData[index + 2] = Math.round(((1 / length) * 0.5 + 0.5) * 255);
      normalData[index + 3] = 255;
    }
  }

  const albedo = new CanvasTexture(canvas);
  albedo.colorSpace = SRGBColorSpace;
  albedo.flipY = false;
  const normal = new DataTexture(normalData, FIBRE_WIDTH, FIBRE_HEIGHT, RGBAFormat);
  normal.colorSpace = LinearSRGBColorSpace;

  for (const texture of [albedo, normal]) {
    texture.wrapS = RepeatWrapping;
    texture.wrapT = RepeatWrapping;
    texture.anisotropy = ANISOTROPY;
    texture.generateMipmaps = true;
    texture.minFilter = LinearMipmapLinearFilter;
    texture.magFilter = LinearFilter;
    texture.needsUpdate = true;
  }

  return { albedo, normal };
}

function slitPath(
  context: CanvasRenderingContext2D,
  centerX: number,
  centerY: number,
  halfWidth: number,
  halfHeight: number,
): void {
  const radius = (halfHeight * halfHeight + halfWidth * halfWidth) / (2 * halfWidth);
  const offset = radius - halfWidth;
  const sweep = Math.asin(halfHeight / radius);
  context.beginPath();
  context.arc(centerX - offset, centerY, radius, -sweep, sweep);
  context.arc(centerX + offset, centerY, radius, Math.PI - sweep, Math.PI + sweep);
  context.closePath();
}

export function createIrisTextures(seed: number, irisFraction: number): IrisTextures {
  const rng = createRng(seed);
  const size = IRIS_SIZE;
  const center = size / 2;
  const iris = center * irisFraction;
  const color = canvasOf(size, size);
  const glow = canvasOf(size, size);
  const paint = color.context;

  function random(): number {
    return nextFloat(rng);
  }

  paint.fillStyle = "#4f1033";
  paint.fillRect(0, 0, size, size);

  const body = paint.createRadialGradient(center, center, iris * 0.04, center, center, iris);
  body.addColorStop(0, "#ffd66a");
  body.addColorStop(0.16, "#ffb070");
  body.addColorStop(0.36, "#f78a86");
  body.addColorStop(0.6, "#e2609a");
  body.addColorStop(0.82, "#a82e70");
  body.addColorStop(1, "#4f1033");
  paint.fillStyle = body;
  paint.beginPath();
  paint.arc(center, center, iris, 0, Math.PI * 2);
  paint.fill();

  for (let fibre = 0; fibre < IRIS_FIBRES; fibre += 1) {
    const angle = random() * Math.PI * 2;
    const inner = iris * (0.08 + random() * 0.16);
    const outer = iris * (0.55 + random() * 0.4);
    const bright = random() < 0.5;
    paint.strokeStyle = bright
      ? `rgba(255, 226, 150, ${0.05 + random() * 0.12})`
      : `rgba(120, 30, 60, ${0.1 + random() * 0.2})`;
    paint.lineWidth = 0.8 + random() * 1.8;
    paint.beginPath();

    for (let segment = 0; segment <= 10; segment += 1) {
      const along = segment / 10;
      const radius = inner + (outer - inner) * along;
      const bend = angle + Math.sin(along * Math.PI * 2 + fibre) * 0.018;
      const x = center + Math.cos(bend) * radius;
      const y = center + Math.sin(bend) * radius;

      if (segment === 0) {
        paint.moveTo(x, y);
      } else {
        paint.lineTo(x, y);
      }
    }

    paint.stroke();
  }

  const slitHalfWidth = iris * 0.075;
  const slitHalfHeight = iris * 0.5;

  for (let halo = 4; halo >= 1; halo -= 1) {
    paint.fillStyle = "rgba(110, 20, 40, 0.1)";
    slitPath(paint, center, center, slitHalfWidth + halo * iris * 0.014, slitHalfHeight + halo * iris * 0.02);
    paint.fill();
  }

  paint.fillStyle = "#0b0206";
  slitPath(paint, center, center, slitHalfWidth, slitHalfHeight);
  paint.fill();

  const light = glow.context;
  light.fillStyle = "#000000";
  light.fillRect(0, 0, size, size);
  const warm = light.createRadialGradient(center, center, iris * 0.04, center, center, iris * 0.6);
  warm.addColorStop(0, "rgba(255, 200, 100, 0.7)");
  warm.addColorStop(0.45, "rgba(255, 140, 140, 0.2)");
  warm.addColorStop(1, "rgba(0, 0, 0, 0)");
  light.fillStyle = warm;
  light.fillRect(0, 0, size, size);
  light.fillStyle = "#000000";
  slitPath(light, center, center, slitHalfWidth * 1.3, slitHalfHeight * 1.05);
  light.fill();

  const colorTexture = new CanvasTexture(color.canvas);
  colorTexture.colorSpace = SRGBColorSpace;
  const glowTexture = new CanvasTexture(glow.canvas);
  glowTexture.colorSpace = SRGBColorSpace;

  for (const texture of [colorTexture, glowTexture]) {
    texture.flipY = false;
    texture.anisotropy = ANISOTROPY;
    texture.needsUpdate = true;
  }

  return { color: colorTexture, glow: glowTexture };
}

const SOFTBOXES: readonly Softbox[] = [
  { direction: new Vector3(-0.55, 0.72, 0.5), width: 0.55, height: 0.38, color: [7.5, 6.9, 6.2] },
  { direction: new Vector3(0.72, 0.28, -0.62), width: 0.16, height: 0.55, color: [5.2, 2.6, 4.6] },
  { direction: new Vector3(0.62, 0.12, 0.78), width: 0.7, height: 0.4, color: [0.9, 0.95, 1.2] },
  { direction: new Vector3(-0.85, 0.1, -0.4), width: 0.3, height: 0.3, color: [1.6, 1.3, 2.4] },
];

export function createStudioLight(): Texture {
  const data = new Float32Array(LIGHT_WIDTH * LIGHT_HEIGHT * 4);
  const direction = new Vector3();
  const worldUp = new Vector3(0, 1, 0);

  const boxes = SOFTBOXES.map((box) => {
    const forward = box.direction.clone().normalize();
    const right = new Vector3().crossVectors(forward, worldUp).normalize();
    const up = new Vector3().crossVectors(right, forward);

    return { ...box, forward, right, up };
  });

  for (let row = 0; row < LIGHT_HEIGHT; row += 1) {
    const elevation = ((row + 0.5) / LIGHT_HEIGHT - 0.5) * Math.PI;

    for (let column = 0; column < LIGHT_WIDTH; column += 1) {
      const azimuth = ((column + 0.5) / LIGHT_WIDTH - 0.5) * Math.PI * 2;
      direction.set(
        Math.cos(elevation) * Math.cos(azimuth),
        Math.sin(elevation),
        Math.cos(elevation) * Math.sin(azimuth),
      );
      const sky = Math.max(direction.y, 0);
      const floor = Math.max(-direction.y, 0);
      let red = 0.16 + sky * 0.22 - floor * 0.1;
      let green = 0.13 + sky * 0.18 - floor * 0.09;
      let blue = 0.2 + sky * 0.3 - floor * 0.1;

      for (const box of boxes) {
        const facing = direction.dot(box.forward);

        if (facing <= 0.05) {
          continue;
        }

        const horizontal = Math.abs(direction.dot(box.right) / facing);
        const vertical = Math.abs(direction.dot(box.up) / facing);
        const falloff = Math.max(0, 1 - (horizontal / box.width) ** 4) * Math.max(0, 1 - (vertical / box.height) ** 4);
        red += box.color[0] * falloff;
        green += box.color[1] * falloff;
        blue += box.color[2] * falloff;
      }

      const index = (row * LIGHT_WIDTH + column) * 4;
      data[index] = Math.max(red, 0.01);
      data[index + 1] = Math.max(green, 0.01);
      data[index + 2] = Math.max(blue, 0.01);
      data[index + 3] = 1;
    }
  }

  const texture = new DataTexture(data, LIGHT_WIDTH, LIGHT_HEIGHT, RGBAFormat, FloatType);
  texture.mapping = EquirectangularReflectionMapping;
  texture.colorSpace = LinearSRGBColorSpace;
  texture.magFilter = LinearFilter;
  texture.minFilter = LinearFilter;
  texture.needsUpdate = true;

  return texture;
}
