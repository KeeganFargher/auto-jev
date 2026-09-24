import type { ComboKind } from "@jev-game/game";
import type { SoundId } from "./catalogue.js";

export interface AbilitySound {
  cast: SoundId | null;
  hit: SoundId | null;
  falling?: SoundId;
  landing?: SoundId;
  heal?: SoundId;
}

export interface UnitSound {
  spawn?: SoundId;
  death: SoundId;
}

export const ABILITY_SOUNDS = {
  "bulwark-strike": { cast: "swing-heavy", hit: "hit-blunt" },
  challenge: { cast: "challenge", hit: null },
  "shield-bash": { cast: "shield-bash", hit: null },
  "oath-hammer": { cast: "swing-heavy", hit: "hit-blunt" },
  consecrate: { cast: "consecrate", hit: null },
  mend: { cast: null, hit: null, heal: "mend" },
  "ravager-axes": { cast: "swing-heavy", hit: "hit-blade" },
  whirlwind: { cast: "whirlwind", hit: "hit-blade" },
  leap: { cast: "leap", hit: null },
  "dusk-strike": { cast: "swing-light", hit: "hit-blade" },
  shadowstep: { cast: "shadowstep", hit: null },
  firebolt: { cast: "cast-firebolt", hit: "hit-fire" },
  meteor: { cast: null, hit: null, falling: "meteor-fall", landing: "meteor-impact" },
  "flame-ward": { cast: "flame-ward", hit: null },
  "frost-bolt": { cast: "cast-frostbolt", hit: "hit-frost" },
  "glacial-lance": { cast: "glacial-lance", hit: "hit-frost" },
  "spite-bolt": { cast: "cast-darkbolt", hit: "hit-dark" },
  "shared-fate": { cast: "shared-fate", hit: null },
  hex: { cast: "hex", hit: null },
  thornshot: { cast: "cast-thorn", hit: "hit-thorn" },
  "plague-cloud": { cast: "plague-cloud", hit: null },
  "caustic-spit": { cast: "caustic-spit", hit: null },
  "grave-bolt": { cast: "cast-darkbolt", hit: "hit-dark" },
  "raise-dead": { cast: "raise-dead", hit: null },
  "corpse-explosion": { cast: "corpse-explosion", hit: null },
  "rivet-gun": { cast: "cast-rivet", hit: "hit-rivet" },
  "deploy-turret": { cast: "deploy-turret", hit: null },
  flashbang: { cast: "flashbang", hit: null },
  "thrall-blade": { cast: "swing-light", hit: "hit-blade" },
  "golem-slam": { cast: "swing-heavy", hit: "hit-blunt" },
  "turret-shot": { cast: "cast-rivet", hit: "hit-rivet" },
  smoke: { cast: "smoke", hit: null },
  "ice-block": { cast: "ice-block", hit: null },
  "ward-bell": { cast: "ward-bell", hit: null },
} as const satisfies Record<string, AbilitySound>;

export const UNIT_SOUNDS = {
  thrall: { death: "death-bones" },
  "bone-golem": { spawn: "golem-rise", death: "death-bones" },
  turret: { death: "death-turret" },
} as const satisfies Record<string, UnitSound>;

type MappedAbility = keyof typeof ABILITY_SOUNDS;

type MappedUnit = keyof typeof UNIT_SOUNDS;

function isMappedAbility(abilityId: string): abilityId is MappedAbility {
  return Object.hasOwn(ABILITY_SOUNDS, abilityId);
}

function isMappedUnit(heroId: string): heroId is MappedUnit {
  return Object.hasOwn(UNIT_SOUNDS, heroId);
}

export function abilitySounds(abilityId: string): AbilitySound | undefined {
  return isMappedAbility(abilityId) ? ABILITY_SOUNDS[abilityId] : undefined;
}

export function unitSounds(heroId: string): UnitSound | undefined {
  return isMappedUnit(heroId) ? UNIT_SOUNDS[heroId] : undefined;
}

export const FALL_START_FRACTION = 0.45;

export const HERO_DEATH_SOUND: SoundId = "death";

export const COMBO_SOUNDS: Readonly<Record<ComboKind, SoundId>> = {
  overload: "combo-overload",
  shatter: "combo-shatter",
  crush: "combo-crush",
};

export const SHIELD_SOUND: SoundId = "shield-up";

export const SILENT_SHIELD_ABILITIES: ReadonlySet<string> = new Set(["challenge"]);

export const CRIT_SOUND: SoundId = "crit-hit";

export const HEAVY_HIT_SOUND: SoundId = "crit-heavy";

export type TeleportBeat = "out" | "in" | "warp";

export const TELEPORT_SOUNDS: Readonly<Record<TeleportBeat, SoundId>> = {
  out: "teleport-out",
  in: "teleport-in",
  warp: "teleport-warp",
};
