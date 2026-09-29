import {
  createRng,
  GRAVITY_UNITS_PER_SECOND_SQUARED,
  nextFloat,
  type RngState,
} from "@jev-game/game";
import { hashSeed } from "@jev-game/run";
import { Vector3 } from "three";
import { KAYKIT_UNIT } from "./figure-base.js";

export interface Spin {
  readonly axis: Vector3;
  readonly turns: number;
}

const TURN = Math.PI * 2;

const FLIP_SLOWEST = 6;

const FLIP_FASTEST = 12;

const TWIST_FASTEST = 6;

const SPIN_DAMPING = -Math.log(1 - 0.25);

const BOUNCE_SPEED = Math.sqrt(2 * GRAVITY_UNITS_PER_SECOND_SQUARED * 0.6 * KAYKIT_UNIT);

export const BOUNCE_SECONDS = (2 * BOUNCE_SPEED) / GRAVITY_UNITS_PER_SECOND_SQUARED;

export const HOP_UNITS = 0.7 * KAYKIT_UNIT;

export const HOP_SECONDS = 0.45;

export const SQUASH_SECONDS = 1;

const SQUASH_DAMPING = 7;

const SQUASH_RATE = 38;

const SQUASH_WIDEN = 0.14;

const SQUASH_FLATTEN = 0.22;

const SQUASH_FLOOR = 0.35;

const SQUASH_PER_DAMAGE = 1 / 250;

const CRIT_SQUASH = 1.3;

function between(rng: RngState, low: number, high: number): number {
  return low + (high - low) * nextFloat(rng);
}

export function flightSpin(unitId: string, startTick: number, flightSeconds: number): Spin {
  if (!Number.isFinite(flightSeconds) || flightSeconds <= 0) {
    throw new Error(`A spin needs a positive flight time, got ${flightSeconds}s`);
  }

  const rng = createRng(hashSeed([unitId, "spin", startTick]));
  const flip = between(rng, FLIP_SLOWEST, FLIP_FASTEST) * (nextFloat(rng) < 0.5 ? -1 : 1);

  const velocity = new Vector3(
    flip,
    between(rng, -TWIST_FASTEST, TWIST_FASTEST),
    between(rng, -FLIP_FASTEST, FLIP_FASTEST),
  );

  const spun = (velocity.length() * (1 - Math.exp(-SPIN_DAMPING * flightSeconds))) / SPIN_DAMPING;

  return { axis: velocity.normalize(), turns: Math.max(1, Math.round(spun / TURN)) };
}

export function spinAngle(spin: Spin, flightSeconds: number, fraction: number): number {
  const whole = 1 - Math.exp(-SPIN_DAMPING * flightSeconds);

  return (spin.turns * TURN * (1 - Math.exp(-SPIN_DAMPING * flightSeconds * fraction))) / whole;
}

export function bounceLift(age: number): number {
  if (age >= BOUNCE_SECONDS) {
    return 0;
  }

  return BOUNCE_SPEED * age - (GRAVITY_UNITS_PER_SECOND_SQUARED * age * age) / 2;
}

export function hopLift(age: number): number {
  if (age >= HOP_SECONDS) {
    return 0;
  }

  return HOP_UNITS * Math.sin((Math.PI * age) / HOP_SECONDS);
}

export function hitSquash(amount: number, crit: boolean): number {
  return Math.min(1, (SQUASH_FLOOR + amount * SQUASH_PER_DAMAGE) * (crit ? CRIT_SQUASH : 1));
}

export function squashLeft(peak: number, age: number): number {
  return age >= SQUASH_SECONDS ? 0 : peak * Math.exp(-age * SQUASH_DAMPING);
}

export function squashPeak(peak: number, age: number, strength: number): number {
  if (!Number.isFinite(strength) || strength <= 0 || strength > 1) {
    throw new Error(`A squash must be stronger than 0 and at most 1, got ${strength}`);
  }

  return Math.max(squashLeft(peak, age), strength);
}

export function squashWobble(peak: number, age: number): number {
  return age >= SQUASH_SECONDS ? 0 : squashLeft(peak, age) * Math.cos(age * SQUASH_RATE);
}

export function squashScale(wobble: number, out: Vector3): Vector3 {
  return out.set(1 + SQUASH_WIDEN * wobble, 1 - SQUASH_FLATTEN * wobble, 1 + SQUASH_WIDEN * wobble);
}
