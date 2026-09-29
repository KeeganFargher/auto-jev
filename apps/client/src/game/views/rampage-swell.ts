import { TICK_RATE, type RampageState } from "@jev-game/game";

export interface GrowStep {
  readonly at: number;
  readonly growth: number;
}

export const GROW_STEPS: readonly GrowStep[] = [
  { at: 0.15 / 0.95, growth: 0.7 / 5 },
  { at: 0.35 / 0.95, growth: 1.6 / 5 },
  { at: 0.55 / 0.95, growth: 2.6 / 5 },
  { at: 0.75 / 0.95, growth: 3.7 / 5 },
  { at: 1, growth: 1 },
];

const SWELL_RATE = 16;

function approach(from: number, to: number, ticks: number): number {
  return to + (from - to) * Math.exp((-SWELL_RATE * ticks) / TICK_RATE);
}

function stepTickOf(rampage: RampageState, step: GrowStep): number {
  return rampage.startTick + step.at * (rampage.growEndTick - rampage.startTick);
}

export function growStepsTaken(rampage: RampageState, tick: number): number {
  if (rampage.growEndTick <= rampage.startTick || rampage.shrinkStartTick < rampage.growEndTick) {
    throw new Error(
      `A rampage must grow before it shrinks, got ticks ${rampage.startTick}, ${rampage.growEndTick}, ${rampage.shrinkStartTick}`,
    );
  }

  if (!Number.isFinite(tick) || tick < rampage.startTick) {
    throw new Error(`A rampage starting at tick ${rampage.startTick} has no size at tick ${tick}`);
  }

  let taken = 0;

  for (const step of GROW_STEPS) {
    if (stepTickOf(rampage, step) <= tick) {
      taken += 1;
    }
  }

  return taken;
}

export function rampageSwell(rampage: RampageState, fullSize: number, tick: number): number {
  if (!Number.isFinite(fullSize) || fullSize <= 1) {
    throw new Error(`A rampage must swell past size 1, got ${fullSize}`);
  }

  const taken = growStepsTaken(rampage, tick);
  let size = 1;
  let target = 1;
  let since = rampage.startTick;

  for (const step of GROW_STEPS.slice(0, taken)) {
    const stepTick = stepTickOf(rampage, step);
    size = approach(size, target, stepTick - since);
    target = 1 + (fullSize - 1) * step.growth;
    since = stepTick;
  }

  if (tick >= rampage.shrinkStartTick) {
    size = approach(size, target, rampage.shrinkStartTick - since);
    target = 1;
    since = rampage.shrinkStartTick;
  }

  return approach(size, target, tick - since);
}
