import type { BattleEvent, BattleRecording, BattleSnapshot, HeroDefinitionId } from "@jev-game/game";
import type { LabPicksByHero } from "@jev-game/content";

export type { LabPicksByHero };

export type LabScenarioKind = "duel" | "three-vs-three" | "custom";

export interface LabTeams {
  a: readonly HeroDefinitionId[];
  b: readonly HeroDefinitionId[];
}

export interface BattleLabView {
  snapshot: BattleSnapshot;
  seed: number;
  scenario: LabScenarioKind;
  isRunning: boolean;
  speedMultiplier: number;
  behindBySteps: number;
  latestEvents: BattleEvent[];
}

export interface BattleLabSession {
  getView(): BattleLabView;
  peekSnapshot(): { seed: number; scenario: LabScenarioKind; teams: LabTeams; snapshot: BattleSnapshot };
  getRecording(): BattleRecording | null;
  subscribe(listener: () => void): () => void;
  play(): void;
  pause(): void;
  stepOnce(): void;
  setSpeed(multiplier: number): void;
  reset(seed: number, scenario?: LabScenarioKind, teamAPicksByHero?: LabPicksByHero, teams?: LabTeams): void;
  advanceRealTime(deltaSeconds: number): void;
  dispose(): void;
}
