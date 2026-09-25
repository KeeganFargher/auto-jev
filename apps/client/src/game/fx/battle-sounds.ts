import { TICK_RATE, type CastEvent, type ComboKind, type DamageDealtEvent, type HpPaymentReason } from "@jev-game/game";
import { audio, type PlayOptions } from "../../audio/engine.js";
import {
  abilitySounds,
  COMBO_SOUNDS,
  CRIT_SOUND,
  CRUMBLE_SOUND,
  emitterSound,
  formSound,
  HEAVY_HIT_SOUND,
  HERO_DEATH_SOUND,
  impactSounds,
  OMEN_ECHO_SOUND,
  passiveSound,
  paymentSound,
  PUPPET_SOUND,
  reactionSound,
  reviveSound,
  RISE_SOUND,
  shieldSound,
  STUN_SOUND,
  TELEPORT_SOUNDS,
  THAW_SOUND,
  type TeleportBeat,
  unitSounds,
} from "../../audio/sound-map.js";
import { heroVoices } from "./hero-voices.js";

export interface SoundSource {
  heroId: string;
  friendly: boolean;
  risen: boolean;
}

export interface Falling {
  impactId: number;
  sourceUnitId: string;
  abilityId: string;
  landsAtTick: number;
}

export type UpgradeLookup = (unitId: string) => readonly string[];

export interface FallingTracker {
  sync(impacts: readonly Falling[], tick: number, upgradesOf: UpgradeLookup, panFor: (impactId: number) => number | undefined): void;
  reset(current: readonly Falling[]): void;
}

function at(pan: number | undefined): PlayOptions {
  return pan === undefined ? {} : { pan };
}

export function playCast(event: CastEvent, source: SoundSource, pan: number | undefined): void {
  const sound = abilitySounds(event.abilityId)?.cast ?? null;

  if (sound !== null) {
    audio.play(sound, at(pan));
  }

  if (event.ultimate === true && event.triggered !== true && !source.risen) {
    heroVoices.cast(source.heroId, source.friendly);
  }
}

export function playHit(event: DamageDealtEvent, heavy: boolean, pan: number | undefined): void {
  if (event.dot !== undefined) {
    return;
  }

  if (event.reaction === true) {
    const reaction = reactionSound(event.abilityId);

    if (reaction !== undefined) {
      audio.play(reaction, at(pan));
    }

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
  const sound = shieldSound(abilityId);

  if (sound !== undefined) {
    audio.play(sound, at(pan));
  }
}

export function playStun(pan: number | undefined): void {
  audio.play(STUN_SOUND, at(pan));
}

export function playThaw(pan: number | undefined): void {
  audio.play(THAW_SOUND, at(pan));
}

export function playCombo(combo: ComboKind, pan: number | undefined): void {
  audio.play(COMBO_SOUNDS[combo], at(pan));
}

export function playOmenEcho(pan: number | undefined): void {
  audio.play(OMEN_ECHO_SOUND, at(pan));
}

export function playPuppet(pan: number | undefined): void {
  audio.play(PUPPET_SOUND, at(pan));
}

export function playDeath(source: SoundSource, pan: number | undefined): void {
  if (source.risen) {
    playCrumble(pan);

    return;
  }

  audio.play(unitSounds(source.heroId)?.death ?? HERO_DEATH_SOUND, at(pan));
  heroVoices.death(source.heroId, source.friendly);
}

export function playCrumble(pan: number | undefined): void {
  audio.play(CRUMBLE_SOUND, at(pan));
}

export function playRise(pan: number | undefined): void {
  audio.play(RISE_SOUND, at(pan));
}

export function playSpawn(heroId: string, pan: number | undefined): void {
  const sound = unitSounds(heroId)?.spawn;

  if (sound !== undefined) {
    audio.play(sound, at(pan));
  }
}

export function playLanding(abilityId: string, upgradeIds: readonly string[], pan: number | undefined): void {
  const sound = impactSounds(abilityId, upgradeIds)?.landing;

  if (sound !== undefined) {
    audio.play(sound, at(pan));
  }
}

export function playZone(abilityId: string, pan: number | undefined): void {
  const sound = abilitySounds(abilityId)?.zone;

  if (sound !== undefined) {
    audio.play(sound, at(pan));
  }
}

export function playForm(key: string, pan: number | undefined): void {
  const sound = formSound(key);

  if (sound !== undefined) {
    audio.play(sound, at(pan));
  }
}

export function playRevive(upgradeIds: readonly string[], pan: number | undefined): void {
  const sound = reviveSound(upgradeIds);

  if (sound !== undefined) {
    audio.play(sound, at(pan));
  }
}

export function playEmitter(abilityId: string, pan: number | undefined): void {
  const sound = emitterSound(abilityId);

  if (sound !== undefined) {
    audio.play(sound, at(pan));
  }
}

export function playPassive(passive: string, pan: number | undefined): void {
  const sound = passiveSound(passive);

  if (sound !== undefined) {
    audio.play(sound, at(pan));
  }
}

export function playPayment(reason: HpPaymentReason, pan: number | undefined): void {
  const sound = paymentSound(reason);

  if (sound !== undefined) {
    audio.play(sound, at(pan));
  }
}

export function playTeleport(beat: TeleportBeat, pan: number | undefined): void {
  audio.play(TELEPORT_SOUNDS[beat], at(pan));
}

export function createFallingTracker(): FallingTracker {
  const handled = new Set<number>();

  return {
    sync(impacts, tick, upgradesOf, panFor) {
      for (const impact of impacts) {
        const sound = impactSounds(impact.abilityId, upgradesOf(impact.sourceUnitId))?.falling;

        if (sound === undefined || handled.has(impact.impactId)) {
          continue;
        }

        if (tick >= impact.landsAtTick - Math.ceil(audio.duration(sound) * TICK_RATE)) {
          handled.add(impact.impactId);
          audio.play(sound, at(panFor(impact.impactId)));
        }
      }
    },

    reset(current) {
      handled.clear();

      for (const impact of current) {
        handled.add(impact.impactId);
      }
    },
  };
}
