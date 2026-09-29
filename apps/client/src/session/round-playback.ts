import {
  recordBattle,
  type BattleEvent,
  type BattleRecording,
  type BattleSnapshot,
  type Catalogue,
} from "@jev-game/game";
import { battleDigest } from "@jev-game/content";
import { PLAYBACK_SPEED, type RoundBattle } from "@jev-game/run";
import { createBattleClock, type BattleClock } from "./battle-clock.js";
import type { BattleMoment } from "./types.js";

export interface RoundPlayback {
  elapsedSeconds(): number;
  isDone(): boolean;
  hasEnded(battle: RoundBattle): boolean;
  advance(deltaSeconds: number): void;
  skipToEnd(): void;
  openingSnapshot(battle: RoundBattle): BattleSnapshot;
  follow(battle: RoundBattle): BattleEvent[];
  moment(): BattleMoment;
  takeEvents(): BattleEvent[];
}

function verifiedRecording(battle: RoundBattle, catalogue: Catalogue): BattleRecording {
  const recording = recordBattle(battle.setup, catalogue);
  const digest = battleDigest(recording.events);

  if (digest !== battle.digest) {
    throw new Error(
      `Battle "${battle.battleId}" replayed differently on this client: digest ${digest}, server ${battle.digest}`,
    );
  }

  if (recording.timeline.totalSeconds !== battle.presentationSeconds) {
    throw new Error(
      `Battle "${battle.battleId}" lasts ${recording.timeline.totalSeconds}s here but ${battle.presentationSeconds}s on the server`,
    );
  }

  return recording;
}

export function createRoundPlayback(
  battles: readonly RoundBattle[],
  followed: RoundBattle,
  catalogue: Catalogue,
): RoundPlayback {
  if (!battles.includes(followed)) {
    throw new Error(`Battle "${followed.battleId}" is not part of this round`);
  }

  const recordings = new Map<string, BattleRecording>();
  const totalSeconds = Math.max(...battles.map((battle) => battle.presentationSeconds));
  let presentationSeconds = 0;

  function recordingFor(battle: RoundBattle): BattleRecording {
    const cached = recordings.get(battle.battleId);

    if (cached !== undefined) {
      return cached;
    }

    const recording = verifiedRecording(battle, catalogue);
    recordings.set(battle.battleId, recording);

    return recording;
  }

  function clockFor(battle: RoundBattle): BattleClock {
    const clock = createBattleClock(recordingFor(battle));
    clock.seek(Math.min(presentationSeconds, clock.totalSeconds()));

    return clock;
  }

  let followedClock = clockFor(followed);

  function syncFollowed(): void {
    followedClock.seek(Math.min(presentationSeconds, followedClock.totalSeconds()));
  }

  return {
    elapsedSeconds() {
      return presentationSeconds / PLAYBACK_SPEED;
    },

    isDone() {
      return presentationSeconds >= totalSeconds;
    },

    hasEnded(battle) {
      return presentationSeconds >= battle.presentationSeconds;
    },

    advance(deltaSeconds) {
      if (!Number.isFinite(deltaSeconds) || deltaSeconds < 0) {
        throw new Error(`Round playback cannot advance by ${deltaSeconds}s`);
      }

      presentationSeconds = Math.min(
        totalSeconds,
        presentationSeconds + deltaSeconds * PLAYBACK_SPEED,
      );
      syncFollowed();
    },

    skipToEnd() {
      presentationSeconds = totalSeconds;
      syncFollowed();
    },

    openingSnapshot(battle) {
      return recordingFor(battle).frames[0].snapshot;
    },

    follow(battle) {
      if (!battles.includes(battle)) {
        throw new Error(`Battle "${battle.battleId}" is not part of this round`);
      }

      followedClock = clockFor(battle);

      return followedClock.takeEvents();
    },

    moment() {
      return followedClock.moment();
    },

    takeEvents() {
      return followedClock.takeEvents();
    },
  };
}
