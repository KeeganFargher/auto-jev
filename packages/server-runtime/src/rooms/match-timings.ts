import { DEFAULT_RUN_RULES, type RunRules } from "@jev-game/run";

export interface MatchTimings {
  draftSeconds: number;
  preparingSeconds: number;
  rewardSeconds: number;
  milestoneRewardSeconds: number;
  reconnectGraceSeconds: number;
  roundHoldScale: number;
  clockMilliseconds: number;
}

export const DEFAULT_MATCH_TIMINGS: MatchTimings = {
  draftSeconds: 30,
  preparingSeconds: 25,
  rewardSeconds: 20,
  milestoneRewardSeconds: 35,
  reconnectGraceSeconds: 30,
  roundHoldScale: 1,
  clockMilliseconds: 200,
};

let activeTimings: MatchTimings = DEFAULT_MATCH_TIMINGS;

export function configureMatchTimings(timings: MatchTimings): void {
  activeTimings = timings;
}

export function matchTimings(): MatchTimings {
  return activeTimings;
}

let activeRules: RunRules = DEFAULT_RUN_RULES;

export function configureMatchRules(rules: RunRules): void {
  activeRules = rules;
}

export function matchRules(): RunRules {
  return activeRules;
}
