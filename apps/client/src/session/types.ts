import type { BattleEvent, BattleSnapshot } from "@jev-game/game";

export interface BattleLabView {
  snapshot: BattleSnapshot;
  seed: number;
  isRunning: boolean;
  speedMultiplier: number;
  behindBySteps: number;
  latestEvents: BattleEvent[];
}

export interface BattleLabSession {
  getView(): BattleLabView;
  peekSnapshot(): { seed: number; snapshot: BattleSnapshot };
  subscribe(listener: () => void): () => void;
  play(): void;
  pause(): void;
  stepOnce(): void;
  setSpeed(multiplier: number): void;
  reset(seed: number, overrides?: Partial<HeroOverrides>): void;
  advanceRealTime(deltaSeconds: number): void;
  dispose(): void;
}

export interface HeroOverrides {
  maxHp: number;
  attackDamage: number;
  attackRangeUnits: number;
  attackIntervalTicks: number;
  moveSpeedUnitsPerSecond: number;
}
