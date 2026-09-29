import type { PlayerId, PlayerView, RoundBattle } from "@jev-game/run";
import type { AudioEngine } from "../../../audio/engine.js";
import { outcomeFor, winnersOf } from "../model/match-model.js";

export interface Announcer {
  roundResult(round: number, battle: RoundBattle, playerId: PlayerId): void;
  finish(view: PlayerView): void;
  reset(): void;
}

export function createAnnouncer(audio: Pick<AudioEngine, "play">): Announcer {
  const announcedRounds = new Set<number>();
  let finishAnnounced = false;

  return {
    roundResult(round, battle, playerId) {
      if (announcedRounds.has(round)) {
        return;
      }

      announcedRounds.add(round);
      const tone = outcomeFor(battle.result, playerId);

      if (tone === "won") {
        audio.play("round-won");
      } else if (tone === "lost") {
        audio.play("round-lost");
      }
    },

    finish(view) {
      if (finishAnnounced) {
        return;
      }

      finishAnnounced = true;

      if (view.you.eliminated) {
        audio.play("eliminated");
      } else if (winnersOf(view).includes(view.you.playerId)) {
        audio.play("run-won");
      }
    },

    reset() {
      announcedRounds.clear();
      finishAnnounced = false;
    },
  };
}
