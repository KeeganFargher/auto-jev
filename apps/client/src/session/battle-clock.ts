import {
  presentationSecondsAtTick,
  tickAtPresentationSeconds,
  type BattleEvent,
  type BattleRecording,
  type BattleSnapshot,
} from "@jev-game/game";
import type { BattleMoment } from "./types.js";

export interface BattleClock {
  seconds(): number;
  totalSeconds(): number;
  isDone(): boolean;
  advance(deltaSeconds: number): void;
  seek(seconds: number): void;
  secondsAtTick(tick: number): number;
  moment(): BattleMoment;
  takeEvents(): BattleEvent[];
}

function entry(values: readonly number[], index: number): number {
  const value = values[index];

  if (value === undefined) {
    throw new Error(`Presentation timeline has no entry ${index}`);
  }

  return value;
}

function frameSnapshot(recording: BattleRecording, tick: number): BattleSnapshot {
  const frame = recording.frames[tick];

  if (frame === undefined || frame.tick !== tick) {
    throw new Error(`Recording has no frame for tick ${tick}`);
  }

  return frame.snapshot;
}

export function createBattleClock(recording: BattleRecording): BattleClock {
  const { timeline, events } = recording;

  if (recording.frames.length !== timeline.finalTick + 1) {
    throw new Error(
      `Recording has ${recording.frames.length} frames for a battle that ends at tick ${timeline.finalTick}`,
    );
  }

  let seconds = 0;
  let eventCursor = 0;

  function currentTick(): number {
    return tickAtPresentationSeconds(timeline, seconds);
  }

  function timeScaleAt(tick: number): number {
    const whole = Math.floor(tick);
    const released = entry(timeline.starts, whole) + entry(timeline.holds, whole);

    if (seconds < released) {
      return 0;
    }

    return whole === timeline.finalTick ? 1 : entry(timeline.rates, whole + 1);
  }

  function moveTo(target: number): void {
    if (!Number.isFinite(target) || target < seconds) {
      throw new Error(`Battle clock cannot move from ${seconds}s to ${target}s`);
    }

    seconds = Math.min(timeline.totalSeconds, target);
  }

  return {
    seconds() {
      return seconds;
    },

    totalSeconds() {
      return timeline.totalSeconds;
    },

    isDone() {
      return seconds >= timeline.totalSeconds;
    },

    advance(deltaSeconds) {
      moveTo(seconds + deltaSeconds);
    },

    seek(target) {
      moveTo(target);
    },

    secondsAtTick(tick) {
      return presentationSecondsAtTick(timeline, tick);
    },

    moment() {
      const tick = currentTick();
      const whole = Math.floor(tick);

      return {
        tick,
        snapshot: frameSnapshot(recording, whole),
        next: frameSnapshot(recording, Math.min(whole + 1, timeline.finalTick)),
        timeScale: timeScaleAt(tick),
      };
    },

    takeEvents() {
      const reached = Math.floor(currentTick());
      const start = eventCursor;

      while (eventCursor < events.length && events[eventCursor].tick <= reached) {
        eventCursor += 1;
      }

      return events.slice(start, eventCursor);
    },
  };
}
