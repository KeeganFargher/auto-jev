import type { BattleEvent, BattleRecording, BattleSnapshot, HeroDefinitionId, UpgradeDefinitionId } from "@jev-game/game";

export type LabScenarioKind = "duel" | "three-vs-three";

export type TeamAUpgradeIdsByHero = ReadonlyMap<HeroDefinitionId, readonly UpgradeDefinitionId[]>;

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
  peekSnapshot(): { seed: number; scenario: LabScenarioKind; snapshot: BattleSnapshot };
  getRecording(): BattleRecording | null;
  subscribe(listener: () => void): () => void;
  play(): void;
  pause(): void;
  stepOnce(): void;
  setSpeed(multiplier: number): void;
  reset(seed: number, scenario?: LabScenarioKind, teamAUpgradeIdsByHero?: TeamAUpgradeIdsByHero): void;
  advanceRealTime(deltaSeconds: number): void;
  dispose(): void;
}
