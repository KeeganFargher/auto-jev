import { audio } from "../../audio/engine.js";
import { decideLine, type LineMoment } from "../../audio/line-policy.js";
import type { SoundId } from "../../audio/catalogue.js";
import { heroLines, type HeroLines } from "../../audio/voice-lines.js";

export interface HeroVoices {
  pick(heroId: string): void;
  cast(heroId: string, friendly: boolean): void;
  death(heroId: string, friendly: boolean): void;
  win(heroIds: readonly string[]): void;
}

function createHeroVoices(): HeroVoices {
  const heroLastAt = new Map<string, number>();
  const castTurn = new Map<string, number>();
  let busyUntil = 0;
  let lastLineAt: number | undefined;

  function castLine(heroId: string, lines: HeroLines): SoundId | undefined {
    const turn = castTurn.get(heroId) ?? 0;
    castTurn.set(heroId, turn + 1);

    return lines.cast[turn % lines.cast.length];
  }

  function say(moment: LineMoment, heroId: string, friendly: boolean): void {
    const lines = heroLines(heroId);

    if (lines === undefined) {
      return;
    }

    const now = performance.now();
    const decision = decideLine(moment, heroId, friendly, { busyUntil, lastLineAt, heroLastAt }, now, Math.random());

    if (decision.kind === "skip") {
      return;
    }

    const id = moment === "cast" ? castLine(heroId, lines) : lines[moment];

    if (id === undefined) {
      return;
    }

    if (decision.interrupt) {
      audio.stopBus("dialogue");
    }

    const seconds = audio.play(id);

    if (seconds <= 0) {
      return;
    }

    busyUntil = now + seconds * 1000;
    lastLineAt = now;
    heroLastAt.set(heroId, now);
  }

  return {
    pick(heroId) {
      say("pick", heroId, true);
    },

    cast(heroId, friendly) {
      say("cast", heroId, friendly);
    },

    death(heroId, friendly) {
      say("death", heroId, friendly);
    },

    win(heroIds) {
      const voiced = heroIds.filter((heroId) => heroLines(heroId) !== undefined);
      const heroId = voiced[Math.floor(Math.random() * voiced.length)];

      if (heroId !== undefined) {
        say("win", heroId, true);
      }
    },
  };
}

export const heroVoices = createHeroVoices();
