import {
  recordBattle,
  TICK_SECONDS,
  type BattleEvent,
  type BattleRecording,
  type BattleSnapshot,
  type Catalogue,
} from "@jev-game/game";
import { PLAYBACK_SPEED, type RoundBattle } from "@jev-game/run";

export interface BattleFrame {
  snapshot: BattleSnapshot;
  isDone: boolean;
}

export interface RoundPlayback {
  tick(): number;
  elapsedSeconds(): number;
  secondsLeft(tickLimit: number): number;
  isDone(): boolean;
  hasEnded(battle: RoundBattle): boolean;
  advance(deltaSeconds: number): void;
  skipToEnd(): void;
  frame(battle: RoundBattle): BattleFrame;
  openingSnapshot(battle: RoundBattle): BattleSnapshot;
  eventsBetween(battle: RoundBattle, afterTick: number, uptoTick: number): BattleEvent[];
}

function endTickOf(battle: RoundBattle): number {
  return battle.result?.endedAtTick ?? 0;
}

export function createRoundPlayback(battles: readonly RoundBattle[], catalogue: Catalogue): RoundPlayback {
  const recordings = new Map<string, BattleRecording>();
  const roundEndTick = battles.reduce((latest, battle) => Math.max(latest, endTickOf(battle)), 0);
  let elapsedTicks = 0;

  function recordingFor(battle: RoundBattle): BattleRecording {
    const cached = recordings.get(battle.battleId);

    if (cached !== undefined) {
      return cached;
    }

    if (battle.setup === null) {
      throw new Error(`battle "${battle.battleId}" has not started yet`);
    }

    const recording = recordBattle(battle.setup, catalogue);
    recordings.set(battle.battleId, recording);

    return recording;
  }

  function currentTick(): number {
    return Math.floor(elapsedTicks);
  }

  return {
    tick: currentTick,

    elapsedSeconds() {
      return (elapsedTicks * TICK_SECONDS) / PLAYBACK_SPEED;
    },

    secondsLeft(tickLimit) {
      return Math.max(0, ((tickLimit - elapsedTicks) * TICK_SECONDS) / PLAYBACK_SPEED);
    },

    isDone() {
      return elapsedTicks >= roundEndTick;
    },

    hasEnded(battle) {
      return currentTick() >= endTickOf(battle);
    },

    advance(deltaSeconds) {
      const step = (Math.max(0, deltaSeconds) / TICK_SECONDS) * PLAYBACK_SPEED;
      elapsedTicks = Math.min(roundEndTick, elapsedTicks + step);
    },

    skipToEnd() {
      elapsedTicks = roundEndTick;
    },

    frame(battle) {
      const { frames } = recordingFor(battle);
      const index = Math.max(0, Math.min(currentTick(), frames.length - 1));

      return { snapshot: frames[index]!.snapshot, isDone: index >= frames.length - 1 };
    },

    openingSnapshot(battle) {
      return recordingFor(battle).frames[0]!.snapshot;
    },

    eventsBetween(battle, afterTick, uptoTick) {
      if (uptoTick <= afterTick) {
        return [];
      }

      return recordingFor(battle).events.filter((event) => event.tick > afterTick && event.tick <= uptoTick);
    },
  };
}
