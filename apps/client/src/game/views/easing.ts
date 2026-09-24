export type Easing = (progress: number) => number;

const NEWTON_STEPS = 8;

const PRECISION = 1e-6;

function curve(t: number, first: number, second: number): number {
  return (((1 - 3 * second + 3 * first) * t + (3 * second - 6 * first)) * t + 3 * first) * t;
}

function slope(t: number, first: number, second: number): number {
  return 3 * (1 - 3 * second + 3 * first) * t * t + 2 * (3 * second - 6 * first) * t + 3 * first;
}

export function cubicBezier(x1: number, y1: number, x2: number, y2: number): Easing {
  function solve(x: number): number {
    let t = x;

    for (let step = 0; step < NEWTON_STEPS; step += 1) {
      const error = curve(t, x1, x2) - x;

      if (Math.abs(error) < PRECISION) {
        return t;
      }

      const gradient = slope(t, x1, x2);

      if (Math.abs(gradient) < PRECISION) {
        break;
      }

      t = Math.min(1, Math.max(0, t - error / gradient));
    }

    let low = 0;
    let high = 1;
    t = x;

    while (high - low > PRECISION) {
      if (curve(t, x1, x2) < x) {
        low = t;
      } else {
        high = t;
      }

      t = (low + high) / 2;
    }

    return t;
  }

  return (progress) => {
    if (progress <= 0) {
      return 0;
    }

    if (progress >= 1) {
      return 1;
    }

    return curve(solve(progress), y1, y2);
  };
}

export const easeOut = cubicBezier(0.23, 1, 0.32, 1);

export const easeInOut = cubicBezier(0.77, 0, 0.175, 1);
