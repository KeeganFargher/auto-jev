export interface Vector2 {
  x: number;
  y: number;
}

export function distance(a: Vector2, b: Vector2): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

export function directionTo(from: Vector2, to: Vector2): Vector2 {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const length = Math.hypot(dx, dy);

  if (length === 0) {
    return { x: 0, y: 0 };
  }

  return { x: dx / length, y: dy / length };
}

export function clampToArena(position: Vector2, width: number, height: number): Vector2 {
  return {
    x: Math.min(Math.max(position.x, 0), width),
    y: Math.min(Math.max(position.y, 0), height),
  };
}
