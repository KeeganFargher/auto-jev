import {
  createBattle,
  getBattleSnapshot,
  stepBattle,
  TICK_SECONDS,
  type BattleEvent,
  type BattleRecording,
  type BattleSetup,
  type BattleState,
} from "@jev-game/game";
import {
  gameCatalogue as catalogue,
  createCustomLabSetup,
  createDuelSetup,
  createThreeVersusThreeSetup,
  THREE_VERSUS_THREE_TEAM_A,
  THREE_VERSUS_THREE_TEAM_B,
  validateCatalogue,
} from "@jev-game/content";
import type { BattleLabSession, LabScenarioKind, LabTeams, LabPicksByHero } from "./types.js";

const MAX_STEPS_PER_FRAME = 10;

export const DEFAULT_LAB_TEAMS: LabTeams = { a: THREE_VERSUS_THREE_TEAM_A, b: THREE_VERSUS_THREE_TEAM_B };

function buildSetup(
  scenario: LabScenarioKind,
  seed: number,
  teamAPicksByHero: LabPicksByHero,
  teams: LabTeams,
): BattleSetup {
  switch (scenario) {
    case "duel":
      return createDuelSetup(seed, teamAPicksByHero);

    case "three-vs-three":
      return createThreeVersusThreeSetup(seed, teamAPicksByHero);

    case "custom":
      return createCustomLabSetup(seed, teams.a, teams.b, teamAPicksByHero);

    default: {
      const exhaustive: never = scenario;

      return exhaustive;
    }
  }
}

export function createLocalBattleLabSession(
  initialSeed: number,
  initialScenario: LabScenarioKind = "three-vs-three",
  initialUpgrades: LabPicksByHero = new Map(),
  initialTeams: LabTeams = DEFAULT_LAB_TEAMS,
): BattleLabSession {
  validateCatalogue(catalogue);

  let seed = initialSeed;
  let scenario = initialScenario;
  let teamAPicksByHero = initialUpgrades;
  let teams = initialTeams;
  let state: BattleState = createBattle(buildSetup(scenario, seed, teamAPicksByHero, teams), catalogue);
  let isRunning = false;
  let speedMultiplier = 1;
  let accumulatedSeconds = 0;
  let behindBySteps = 0;
  let pendingEvents: BattleEvent[] = [];
  let recordedEvents: BattleEvent[] = [];

  let recordedFrames: BattleRecording["frames"] = [
    { tick: state.tick, snapshot: getBattleSnapshot(state) },
  ];

  const listeners = new Set<() => void>();

  function notify(): void {
    for (const listener of listeners) {
      listener();
    }
  }

  function stepOnceInternal(): void {
    if (state.result !== null) {
      return;
    }

    const step = stepBattle(state, catalogue);
    pendingEvents.push(...step.events);
    recordedEvents.push(...step.events);
    recordedFrames.push({ tick: state.tick, snapshot: getBattleSnapshot(state) });

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
        scenario,
        isRunning,
        speedMultiplier,
        behindBySteps,
        latestEvents,
      };
    },

    peekSnapshot() {
      return { seed, scenario, teams, snapshot: getBattleSnapshot(state) };
    },

    getRecording() {
      if (state.result === null) {
        return null;
      }

      return {
        rulesetId: state.rulesetId,
        rulesetVersion: state.rulesetVersion,
        seed,
        events: recordedEvents,
        frames: recordedFrames,
      };
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

    reset(newSeed, newScenario, newTeamAPicksByHero, newTeams) {
      seed = newSeed;
      scenario = newScenario ?? scenario;
      teamAPicksByHero = newTeamAPicksByHero ?? teamAPicksByHero;
      teams = newTeams ?? teams;
      state = createBattle(buildSetup(scenario, seed, teamAPicksByHero, teams), catalogue);
      isRunning = false;
      accumulatedSeconds = 0;
      behindBySteps = 0;
      pendingEvents = [];
      recordedEvents = [];
      recordedFrames = [{ tick: state.tick, snapshot: getBattleSnapshot(state) }];
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
