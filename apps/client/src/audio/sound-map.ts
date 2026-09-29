import type { AttackDefinition, DamageCause } from "@jev-game/game";
import type { SoundId } from "./catalogue.js";

export interface AttackSound {
  swing: SoundId;
  hit: SoundId;
}

export const ATTACK_SOUNDS: Readonly<Record<AttackDefinition["kind"], AttackSound>> = {
  melee: { swing: "swing-heavy", hit: "hit-blunt" },
  projectile: { swing: "swing-light", hit: "hit-blade" },
};

export const CAUSE_HIT_SOUNDS: Readonly<Record<Exclude<DamageCause, "attack">, SoundId | null>> = {
  splash: null,
  hammer: null,
  throw: "hit-blunt",
  bowling: "hit-blunt",
  blast: null,
  burn: null,
  yank: "hit-blunt",
  pull: null,
  frost: null,
};

export const HERO_DEATH_SOUND: SoundId = "death";

export const CRIT_SOUND: SoundId = "crit-hit";

export const HEAVY_HIT_SOUND: SoundId = "crit-heavy";

export const IMPACT_SOUND: SoundId = "crit-heavy";

export const LANDING_SOUND: SoundId = "hit-blunt";

export const THROW_SOUND: SoundId = "swing-heavy";

export const YANK_SOUND: SoundId = "hit-blade";

export const STUN_SOUND: SoundId = "stun";

export type TeleportBeat = "out" | "in" | "warp";

export const TELEPORT_SOUNDS: Readonly<Record<TeleportBeat, SoundId>> = {
  out: "teleport-out",
  in: "teleport-in",
  warp: "teleport-warp",
};
