import type { CastEvent, ComboKind, DamageDealtEvent } from "@jev-game/game";
import { audio, type PlayOptions } from "../../audio/engine.js";
import {
  abilitySounds,
  COMBO_SOUNDS,
  CRIT_SOUND,
  FALL_START_FRACTION,
  HEAVY_HIT_SOUND,
  HERO_DEATH_SOUND,
  SHIELD_SOUND,
  SILENT_SHIELD_ABILITIES,
  TELEPORT_SOUNDS,
  type TeleportBeat,
  unitSounds,
} from "../../audio/sound-map.js";
import { heroVoices } from "./hero-voices.js";

export interface SoundSource {
  heroId: string;
  friendly: boolean;
}

export interface Falling {
  impactId: number;
  abilityId: string;
  landsAtTick: number;
}

export interface FallingTracker {
  sync(impacts: readonly Falling[], tick: number, panFor: (impactId: number) => number | undefined): void;
  reset(): void;
}

function at(pan: number | undefined): PlayOptions {
  return pan === undefined ? {} : { pan };
}

export function playCast(event: CastEvent, source: SoundSource, pan: number | undefined): void {
  const sound = abilitySounds(event.abilityId)?.cast ?? null;

  if (sound !== null) {
    audio.play(sound, at(pan));
  }

  if (event.signature === true && event.triggered !== true) {
    heroVoices.cast(source.heroId, source.friendly);
  }
}

export function playHit(event: DamageDealtEvent, heavy: boolean, pan: number | undefined): void {
  if (event.dot !== undefined || event.reaction === true) {
    return;
  }

  const sound = abilitySounds(event.abilityId)?.hit ?? null;

  if (sound !== null) {
    audio.play(sound, at(pan));
  }

  if (heavy) {
    audio.play(HEAVY_HIT_SOUND, at(pan));
  } else if (event.crit === true) {
    audio.play(CRIT_SOUND, at(pan));
  }
}

export function playHeal(abilityId: string, pan: number | undefined): void {
  const sound = abilitySounds(abilityId)?.heal;

  if (sound !== undefined) {
    audio.play(sound, at(pan));
  }
}

export function playShield(abilityId: string, pan: number | undefined): void {
  if (!SILENT_SHIELD_ABILITIES.has(abilityId)) {
    audio.play(SHIELD_SOUND, at(pan));
  }
}

export function playCombo(combo: ComboKind, pan: number | undefined): void {
  audio.play(COMBO_SOUNDS[combo], at(pan));
}

export function playDeath(source: SoundSource, pan: number | undefined): void {
  audio.play(unitSounds(source.heroId)?.death ?? HERO_DEATH_SOUND, at(pan));
  heroVoices.death(source.heroId, source.friendly);
}

export function playSpawn(heroId: string, pan: number | undefined): void {
  const sound = unitSounds(heroId)?.spawn;

  if (sound !== undefined) {
    audio.play(sound, at(pan));
  }
}

export function playLanding(abilityId: string, pan: number | undefined): void {
  const sound = abilitySounds(abilityId)?.landing;

  if (sound !== undefined) {
    audio.play(sound, at(pan));
  }
}

export function playTeleport(beat: TeleportBeat, pan: number | undefined): void {
  audio.play(TELEPORT_SOUNDS[beat], at(pan));
}

export function createFallingTracker(): FallingTracker {
  const firstSeen = new Map<number, number>();
  const played = new Set<number>();

  return {
    sync(impacts, tick, panFor) {
      for (const impact of impacts) {
        const sound = abilitySounds(impact.abilityId)?.falling;

        if (sound === undefined || played.has(impact.impactId)) {
          continue;
        }

        const seenAt = firstSeen.get(impact.impactId) ?? tick;
        firstSeen.set(impact.impactId, seenAt);

        if (tick >= seenAt + (impact.landsAtTick - seenAt) * FALL_START_FRACTION) {
          played.add(impact.impactId);
          audio.play(sound, at(panFor(impact.impactId)));
        }
      }
    },

    reset() {
      firstSeen.clear();
      played.clear();
    },
  };
}
