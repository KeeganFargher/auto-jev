import type { Catalogue } from "../definitions.js";
import { createBattle, type BattleSetup } from "./create-battle.js";
import type { BattleEvent } from "./events.js";
import { buildPresentationTimeline, type PresentationTimeline } from "./presentation.js";
import type { BattleResult } from "./result.js";
import { getBattleSnapshot, type BattleSnapshot } from "./snapshot.js";
import { stepBattle } from "./step-battle.js";

export interface RecordedFrame {
  tick: number;
  snapshot: BattleSnapshot;
}

export interface BattleRecording {
  rulesetId: string;
  rulesetVersion: number;
  seed: number;
  events: BattleEvent[];
  frames: RecordedFrame[];
  timeline: PresentationTimeline;
  result: BattleResult;
}

export interface BattleOutcome {
  events: BattleEvent[];
  timeline: PresentationTimeline;
  result: BattleResult;
}

export function runBattle(setup: BattleSetup, catalogue: Catalogue): BattleOutcome {
  const state = createBattle(setup, catalogue);
  const events: BattleEvent[] = [];
  let result: BattleResult | null = null;

  while (result === null) {
    const step = stepBattle(state);
    events.push(...step.events);
    result = step.result;
  }

  return { events, timeline: buildPresentationTimeline(events, state.tick), result };
}

export function recordBattle(setup: BattleSetup, catalogue: Catalogue): BattleRecording {
  const state = createBattle(setup, catalogue);
  const events: BattleEvent[] = [];
  const frames: RecordedFrame[] = [{ tick: state.tick, snapshot: getBattleSnapshot(state) }];
  let result: BattleResult | null = null;

  while (result === null) {
    const step = stepBattle(state);
    events.push(...step.events);
    frames.push({ tick: state.tick, snapshot: getBattleSnapshot(state) });
    result = step.result;
  }

  return {
    rulesetId: setup.rulesetId,
    rulesetVersion: setup.rulesetVersion,
    seed: setup.seed,
    events,
    frames,
    timeline: buildPresentationTimeline(events, state.tick),
    result,
  };
}
