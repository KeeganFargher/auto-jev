import type { AttackDefinition, DamageCause } from "@jev-game/game";
import { audio, type PlayOptions } from "../../audio/engine.js";
import {
  ATTACK_SOUNDS,
  CAUSE_HIT_SOUNDS,
  CRIT_SOUND,
  HEAVY_HIT_SOUND,
  HERO_DEATH_SOUND,
  IMPACT_SOUND,
  LANDING_SOUND,
  STUN_SOUND,
  TELEPORT_SOUNDS,
  THROW_SOUND,
  YANK_SOUND,
  type TeleportBeat,
} from "../../audio/sound-map.js";

type AttackKind = AttackDefinition["kind"];

function at(pan: number | undefined): PlayOptions {
  return pan === undefined ? {} : { pan };
}

export function playSwing(kind: AttackKind, pan: number | undefined): void {
  audio.play(ATTACK_SOUNDS[kind].swing, at(pan));
}

export function playDamage(
  cause: DamageCause,
  attackKind: AttackKind,
  crit: boolean,
  heavy: boolean,
  pan: number | undefined,
): void {
  const sound = cause === "attack" ? ATTACK_SOUNDS[attackKind].hit : CAUSE_HIT_SOUNDS[cause];

  if (sound === null) {
    return;
  }

  audio.play(sound, at(pan));

  if (crit) {
    audio.play(CRIT_SOUND, at(pan));
  } else if (heavy) {
    audio.play(HEAVY_HIT_SOUND, at(pan));
  }
}

export function playImpact(pan: number | undefined): void {
  audio.play(IMPACT_SOUND, at(pan));
}

export function playLanding(pan: number | undefined): void {
  audio.play(LANDING_SOUND, at(pan));
}

export function playStun(pan: number | undefined): void {
  audio.play(STUN_SOUND, at(pan));
}

export function playDeath(pan: number | undefined): void {
  audio.play(HERO_DEATH_SOUND, at(pan));
}

export function playThrow(pan: number | undefined): void {
  audio.play(THROW_SOUND, at(pan));
}

export function playYank(pan: number | undefined): void {
  audio.play(YANK_SOUND, at(pan));
}

export function playTeleport(beat: TeleportBeat, pan: number | undefined): void {
  audio.play(TELEPORT_SOUNDS[beat], at(pan));
}
