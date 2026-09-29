import type {
  BattleEvent,
  BattleRecording,
  BattleSnapshot,
  HeroDefinitionId,
} from "@jev-game/game";

export interface LabTeams {
  a: readonly HeroDefinitionId[];
  b: readonly HeroDefinitionId[];
}

export interface LabFight {
  seed: number;
  teams: LabTeams;
}

export interface BattleMoment {
  tick: number;
  snapshot: BattleSnapshot;
  next: BattleSnapshot;
  timeScale: number;
}

export interface LabControls {
  isRunning: boolean;
  isDone: boolean;
  speedMultiplier: number;
}

export interface BattleLabView extends LabControls {
  moment: BattleMoment;
  fight: LabFight;
}

export interface BattleLabSession {
  getView(): BattleLabView;
  controls(): LabControls;
  fight(): LabFight;
  recording(): BattleRecording;
  takeEvents(): BattleEvent[];
  subscribe(listener: () => void): () => void;
  play(): void;
  pause(): void;
  stepOnce(): void;
  setSpeed(multiplier: number): void;
  advanceRealTime(deltaSeconds: number): void;
  dispose(): void;
}
