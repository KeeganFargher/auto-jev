import {
  createBattle,
  getBattleSnapshot,
  stepBattle,
  TICK_SECONDS,
  type BattleEvent,
  type BattleState,
  type Catalogue,
} from "@jev-game/game";
import { bruiser, catalogue, createDuelSetup, validateCatalogue } from "@jev-game/content";
import type { BattleLabSession, HeroOverrides } from "./types.js";

const MAX_STEPS_PER_FRAME = 10;

function catalogueWithOverrides(overrides: Partial<HeroOverrides> | undefined): Catalogue {
  if (overrides === undefined) {
    return catalogue;
  }

  const overridden = { ...catalogue, heroes: { ...catalogue.heroes } };
  overridden.heroes[bruiser.id] = { ...bruiser, ...overrides };
  validateCatalogue(overridden);

  return overridden;
}

export function createLocalBattleLabSession(initialSeed: number): BattleLabSession {
  validateCatalogue(catalogue);

  let seed = initialSeed;
  let activeCatalogue: Catalogue = catalogue;
  let state: BattleState = createBattle(createDuelSetup(seed), activeCatalogue);
  let isRunning = false;
  let speedMultiplier = 1;
  let accumulatedSeconds = 0;
  let behindBySteps = 0;
  let pendingEvents: BattleEvent[] = [];
  const listeners = new Set<() => void>();

  function notify(): void {
    for (const listener of listeners) {
      listener();
    }
  }

  function stepOnceInternal(): void {
    const step = stepBattle(state, activeCatalogue);
    pendingEvents.push(...step.events);

    if (state.result !== null) {
      isRunning = false;
    }
  }

  return {
    getView() {
      const latestEvents = pendingEvents;
      pendingEvents = [];

      return {
        snapshot: getBattleSnapshot(state),
        seed,
        isRunning,
        speedMultiplier,
        behindBySteps,
        latestEvents,
      };
    },

    peekSnapshot() {
      return { seed, snapshot: getBattleSnapshot(state) };
    },

    subscribe(listener) {
      listeners.add(listener);

      return () => listeners.delete(listener);
    },

    play() {
      if (state.result === null) {
        isRunning = true;
        notify();
      }
    },

    pause() {
      isRunning = false;
      notify();
    },

    stepOnce() {
      stepOnceInternal();
      notify();
    },

    setSpeed(multiplier) {
      speedMultiplier = multiplier;
      notify();
    },

    reset(newSeed, overrides) {
      seed = newSeed;
      activeCatalogue = catalogueWithOverrides(overrides);
      state = createBattle(createDuelSetup(seed), activeCatalogue);
      isRunning = false;
      accumulatedSeconds = 0;
      behindBySteps = 0;
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
        state.result === null &&
        stepsThisFrame < MAX_STEPS_PER_FRAME
      ) {
        stepOnceInternal();
        accumulatedSeconds -= TICK_SECONDS;
        stepsThisFrame += 1;
      }

      behindBySteps =
        state.result === null && accumulatedSeconds >= TICK_SECONDS
          ? Math.floor(accumulatedSeconds / TICK_SECONDS)
          : 0;

      if (stepsThisFrame > 0) {
        notify();
      }
    },

    dispose() {
      listeners.clear();
    },
  };
}
