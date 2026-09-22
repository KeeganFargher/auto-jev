import type { Catalogue } from "../definitions.js";
import type { BattleEvent } from "./events.js";
import type { BattleSnapshot } from "./snapshot.js";
import type { BattleSetup } from "./create-battle.js";
import { createBattle } from "./create-battle.js";
import { stepBattle } from "./step-battle.js";
import { getBattleSnapshot } from "./snapshot.js";

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
}

export function recordBattle(setup: BattleSetup, catalogue: Catalogue): BattleRecording {
  const state = createBattle(setup, catalogue);
  const events: BattleEvent[] = [];
  const frames: RecordedFrame[] = [{ tick: state.tick, snapshot: getBattleSnapshot(state) }];

  while (state.result === null) {
    const step = stepBattle(state, catalogue);
    events.push(...step.events);
    frames.push({ tick: state.tick, snapshot: getBattleSnapshot(state) });
  }

  return {
    rulesetId: setup.rulesetId,
    rulesetVersion: setup.rulesetVersion,
    seed: setup.seed,
    events,
    frames,
  };
}
