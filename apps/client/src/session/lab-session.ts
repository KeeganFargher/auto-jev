import { recordBattle, type BattleRecording } from "@jev-game/game";
import { createCustomLabSetup, gameCatalogue } from "@jev-game/content";
import { createBattleClock } from "./battle-clock.js";
import type { BattleLabSession, LabControls, LabFight } from "./types.js";

export function recordLabFight(fight: LabFight): BattleRecording {
  return recordBattle(
    createCustomLabSetup(fight.seed, fight.teams.a, fight.teams.b),
    gameCatalogue,
  );
}

export function createLabSession(fight: LabFight, recording: BattleRecording): BattleLabSession {
  if (recording.seed !== fight.seed) {
    throw new Error(`Recording seed ${recording.seed} does not match fight seed ${fight.seed}`);
  }

  const clock = createBattleClock(recording);
  const listeners = new Set<() => void>();
  let isRunning = false;
  let speedMultiplier = 1;
  let controls: LabControls = { isRunning, isDone: clock.isDone(), speedMultiplier };

  function notify(): void {
    controls = { isRunning, isDone: clock.isDone(), speedMultiplier };

    for (const listener of listeners) {
      listener();
    }
  }

  function stopAtEnd(): void {
    if (isRunning && clock.isDone()) {
      isRunning = false;
      notify();
    }
  }

  return {
    getView() {
      return { ...controls, moment: clock.moment(), fight };
    },

    controls() {
      return controls;
    },

    fight() {
      return fight;
    },

    recording() {
      return recording;
    },

    takeEvents() {
      return clock.takeEvents();
    },

    subscribe(listener) {
      listeners.add(listener);

      return () => {
        listeners.delete(listener);
      };
    },

    play() {
      isRunning = !clock.isDone();
      notify();
    },

    pause() {
      isRunning = false;
      notify();
    },

    stepOnce() {
      const whole = Math.floor(clock.moment().tick);
      isRunning = false;
      clock.seek(
        whole === recording.timeline.finalTick
          ? clock.totalSeconds()
          : clock.secondsAtTick(whole + 1),
      );
      notify();
    },

    setSpeed(multiplier) {
      if (!Number.isFinite(multiplier) || multiplier <= 0) {
        throw new Error(`Invalid lab speed ${multiplier}`);
      }

      speedMultiplier = multiplier;
      notify();
    },

    advanceRealTime(deltaSeconds) {
      if (!isRunning) {
        return;
      }

      clock.advance(deltaSeconds * speedMultiplier);
      stopAtEnd();
    },

    dispose() {
      isRunning = false;
      listeners.clear();
    },
  };
}
