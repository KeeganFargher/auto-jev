import { TICK_SECONDS } from "../constants.js";
import type { BattleEvent } from "./events.js";

export interface PresentationTimeline {
  finalTick: number;
  holds: number[];
  rates: number[];
  starts: number[];
  totalSeconds: number;
}

function valueAt(values: readonly number[], tick: number): number {
  const value = values[tick];

  if (value === undefined) {
    throw new Error(`Presentation timeline has no tick ${tick}`);
  }

  return value;
}

export function buildPresentationTimeline(
  events: readonly BattleEvent[],
  finalTick: number,
): PresentationTimeline {
  if (!Number.isInteger(finalTick) || finalTick < 0) {
    throw new Error(`Invalid final tick ${finalTick}`);
  }

  const holds = Array.from({ length: finalTick + 1 }, () => 0);
  const rates = Array.from({ length: finalTick + 1 }, () => 1);
  let previousTick = 0;
  let slowEndTick = 0;

  for (const event of events) {
    if (event.tick < previousTick || event.tick > finalTick) {
      throw new Error(`Event at tick ${event.tick} is out of order or past tick ${finalTick}`);
    }

    previousTick = event.tick;

    if (event.kind !== "beat") {
      continue;
    }

    const beat = event.beat;

    if (beat.kind === "freeze") {
      if (beat.seconds <= 0) {
        throw new Error(`Freeze at tick ${event.tick} has no length`);
      }

      holds[event.tick] = Math.max(valueAt(holds, event.tick), beat.seconds);

      continue;
    }

    if (beat.rate <= 0 || beat.rate > 1 || beat.ticks <= 0) {
      throw new Error(`Slow at tick ${event.tick} is malformed`);
    }

    if (event.tick < slowEndTick) {
      continue;
    }

    slowEndTick = event.tick + beat.ticks;

    for (let tick = event.tick + 1; tick <= Math.min(slowEndTick, finalTick); tick += 1) {
      rates[tick] = beat.rate;
    }
  }

  const starts = [0];
  let clock = 0;

  for (let tick = 1; tick <= finalTick; tick += 1) {
    clock += valueAt(holds, tick - 1) + TICK_SECONDS / valueAt(rates, tick);
    starts.push(clock);
  }

  return { finalTick, holds, rates, starts, totalSeconds: clock + valueAt(holds, finalTick) };
}

export function presentationSecondsAtTick(timeline: PresentationTimeline, tick: number): number {
  return valueAt(timeline.starts, tick);
}

export function tickAtPresentationSeconds(timeline: PresentationTimeline, seconds: number): number {
  if (!Number.isFinite(seconds) || seconds < 0) {
    throw new Error(`Invalid presentation time ${seconds}`);
  }

  if (seconds >= timeline.totalSeconds) {
    return timeline.finalTick;
  }

  let low = 0;
  let high = timeline.finalTick;

  while (low < high) {
    const middle = Math.floor((low + high + 1) / 2);

    if (valueAt(timeline.starts, middle) <= seconds) {
      low = middle;
    } else {
      high = middle - 1;
    }
  }

  const released = valueAt(timeline.starts, low) + valueAt(timeline.holds, low);

  if (seconds < released || low === timeline.finalTick) {
    return low;
  }

  const advanceSeconds = TICK_SECONDS / valueAt(timeline.rates, low + 1);

  return low + Math.min(1, (seconds - released) / advanceSeconds);
}
