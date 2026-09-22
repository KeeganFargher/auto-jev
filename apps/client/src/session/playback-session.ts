import { TICK_SECONDS, type BattleEvent, type BattleRecording } from "@jev-game/game";
import type { BattleLabSession, LabScenarioKind } from "./types.js";

const MAX_STEPS_PER_FRAME = 10;

export function createPlaybackSession(
  recording: BattleRecording,
  scenario: LabScenarioKind,
): BattleLabSession {
  let frameIndex = 0;
  let isRunning = false;
  let speedMultiplier = 1;
  let accumulatedSeconds = 0;
  let pendingEvents: BattleEvent[] = [];
  const listeners = new Set<() => void>();
  const maxIndex = recording.frames.length - 1;

  function notify(): void {
    for (const listener of listeners) {
      listener();
    }
  }

  function advanceFrame(): void {
    if (frameIndex >= maxIndex) {
      isRunning = false;

      return;
    }

    const previousTick = recording.frames[frameIndex]!.tick;
    frameIndex += 1;
    const currentTick = recording.frames[frameIndex]!.tick;

    const stepped = recording.events.filter(
      (event) => event.tick > previousTick && event.tick <= currentTick,
    );

    pendingEvents.push(...stepped);
  }

  return {
    getView() {
      const latestEvents = pendingEvents;
      pendingEvents = [];
      const frame = recording.frames[frameIndex]!;

      return {
        snapshot: frame.snapshot,
        seed: recording.seed,
        scenario,
        isRunning,
        speedMultiplier,
        behindBySteps: 0,
        latestEvents,
      };
    },

    peekSnapshot() {
      const frame = recording.frames[frameIndex]!;

      return { seed: recording.seed, scenario, snapshot: frame.snapshot };
    },

    getRecording() {
      return recording;
    },

    subscribe(listener) {
      listeners.add(listener);

      return () => listeners.delete(listener);
    },

    play() {
      isRunning = frameIndex < maxIndex;
      notify();
    },

    pause() {
      isRunning = false;
      notify();
    },

    stepOnce() {
      advanceFrame();
      notify();
    },

    setSpeed(multiplier) {
      speedMultiplier = multiplier;
      notify();
    },

    reset() {
      frameIndex = 0;
      isRunning = false;
      accumulatedSeconds = 0;
      pendingEvents = [];
      notify();
    },

    advanceRealTime(deltaSeconds) {
      if (!isRunning) {
        return;
      }

      accumulatedSeconds += deltaSeconds * speedMultiplier;
      let stepsThisFrame = 0;

      while (
        accumulatedSeconds >= TICK_SECONDS &&
        frameIndex < maxIndex &&
        stepsThisFrame < MAX_STEPS_PER_FRAME
      ) {
        advanceFrame();
        accumulatedSeconds -= TICK_SECONDS;
        stepsThisFrame += 1;
      }

      if (stepsThisFrame > 0) {
        notify();
      }
    },

    dispose() {
      listeners.clear();
    },
  };
}
