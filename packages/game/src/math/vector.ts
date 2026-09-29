import { RANGE_EPSILON } from "../constants.js";

export interface Vector2 {
  x: number;
  y: number;
}

export function length(vector: Vector2): number {
  return Math.sqrt(vector.x * vector.x + vector.y * vector.y);
}

export function distance(a: Vector2, b: Vector2): number {
  const dx = a.x - b.x;
  const dy = a.y - b.y;

  return Math.sqrt(dx * dx + dy * dy);
}

export function isWithinRange(actualDistance: number, range: number): boolean {
  return actualDistance <= range + RANGE_EPSILON;
}

export function directionTo(from: Vector2, to: Vector2): Vector2 {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const span = Math.sqrt(dx * dx + dy * dy);

  if (span === 0) {
    return { x: 0, y: 0 };
  }

  return { x: dx / span, y: dy / span };
}

export function normalize(vector: Vector2): Vector2 {
  const span = length(vector);

  if (span === 0) {
    return { x: 0, y: 0 };
  }

  return { x: vector.x / span, y: vector.y / span };
}

export function add(a: Vector2, b: Vector2): Vector2 {
  return { x: a.x + b.x, y: a.y + b.y };
}

export function scale(vector: Vector2, factor: number): Vector2 {
  return { x: vector.x * factor, y: vector.y * factor };
}

export function lerp(from: Vector2, to: Vector2, fraction: number): Vector2 {
  return { x: from.x + (to.x - from.x) * fraction, y: from.y + (to.y - from.y) * fraction };
}

export function perpendicular(vector: Vector2): Vector2 {
  return { x: -vector.y, y: vector.x };
}

export function rotate(vector: Vector2, cosine: number, sine: number): Vector2 {
  return {
    x: vector.x * cosine - vector.y * sine,
    y: vector.x * sine + vector.y * cosine,
  };
}

export function clampToArena(position: Vector2, width: number, height: number): Vector2 {
  return {
    x: Math.min(Math.max(position.x, 0), width),
    y: Math.min(Math.max(position.y, 0), height),
  };
}

export function isInsideArena(position: Vector2, width: number, height: number): boolean {
  return position.x >= 0 && position.x <= width && position.y >= 0 && position.y <= height;
}
