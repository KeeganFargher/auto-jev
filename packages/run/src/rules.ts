export interface RunRules {
  startingHealth: number;
  roundCap: number;
  maxLossCost: number;
  draftPicks: number;
}

export const DEFAULT_RUN_RULES: RunRules = {
  startingHealth: 13,
  roundCap: 15,
  maxLossCost: 3,
  draftPicks: 3,
};

export function lossCost(rules: RunRules, winnerSurvivors: number): number {
  return Math.min(rules.maxLossCost, 1 + winnerSurvivors);
}
