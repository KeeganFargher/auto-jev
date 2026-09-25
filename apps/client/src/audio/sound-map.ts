import type { ComboKind, HpPaymentReason } from "@jev-game/game";
import type { SoundId } from "./catalogue.js";

export interface AbilitySound {
  cast: SoundId | null;
  hit: SoundId | null;
  falling?: SoundId;
  landing?: SoundId;
  heal?: SoundId;
  zone?: SoundId;
}

export interface UnitSound {
  spawn?: SoundId;
  death: SoundId;
}

export const ABILITY_SOUNDS = {
  "bulwark-strike": { cast: "swing-heavy", hit: "hit-blunt" },
  "shield-toss": { cast: "shield-toss", hit: "shield-ricochet" },
  "last-stand": { cast: "challenge", hit: null, landing: "last-stand" },
  "shield-bash": { cast: "shield-bash", hit: null },
  "oath-hammer": { cast: "swing-heavy", hit: "hit-blunt" },
  judgment: { cast: "judgment-throw", hit: "judgment-hit", heal: "judgment-heal" },
  "avatar-judgment": { cast: "judgment-throw", hit: "judgment-hit", heal: "judgment-heal" },
  "hallowed-path": { cast: null, hit: null },
  resurrection: { cast: "resurrection", hit: null, landing: "holy-pillar" },
  "ravager-axes": { cast: "swing-heavy", hit: "hit-blade" },
  whirlwind: { cast: "whirlwind", hit: "hit-blade" },
  "leap-slam": { cast: "leap", hit: null, landing: "leap-slam" },
  "dusk-strike": { cast: "swing-light", hit: "hit-blade" },
  "flicker-strike": { cast: null, hit: "flicker-strike" },
  "thousand-cuts": { cast: "thousand-cuts", hit: null },
  firebolt: { cast: "cast-firebolt", hit: "hit-fire" },
  meteor: { cast: null, hit: null, falling: "meteor-streak", landing: "meteor-strike" },
  fireball: { cast: "fireball-throw", hit: "fireball-blast" },
  "inferno-bolt": { cast: "cast-firebolt", hit: "inferno-burst" },
  "living-bomb": { cast: null, hit: null, landing: "living-bomb" },
  "frost-bolt": { cast: "cast-frostbolt", hit: "hit-frost" },
  "frozen-orb": { cast: "frozen-orb", hit: "ice-shard" },
  "glacial-prison": { cast: "glacial-prison", hit: null },
  "spite-bolt": { cast: "cast-darkbolt", hit: "hit-dark" },
  "shared-fate": { cast: "shared-fate", hit: null },
  hex: { cast: null, hit: null, landing: "hex" },
  thornshot: { cast: "cast-thorn", hit: "hit-thorn" },
  "plague-bloom": { cast: "plague-bloom", hit: null },
  pandemic: { cast: "pandemic", hit: null },
  "grave-bolt": { cast: "cast-darkbolt", hit: "hit-dark" },
  "lich-bolt": { cast: "cast-lichbolt", hit: "hit-dark" },
  "corpse-explosion": { cast: null, hit: null, landing: "corpse-explosion" },
  voidheart: { cast: null, hit: null, landing: "voidheart" },
  "army-of-the-dead": { cast: "army-of-the-dead", hit: null },
  "rivet-gun": { cast: "cast-rivet", hit: "hit-rivet" },
  "deploy-turret": { cast: "deploy-turret", hit: null },
  "ember-trail": { cast: null, hit: null, zone: "ember-trail" },
  "mech-suit": { cast: "mech-suit", hit: null, landing: "doomsday" },
  "mech-rocket": { cast: "cast-rocket", hit: "hit-rocket" },
  "thrall-blade": { cast: "swing-light", hit: "hit-blade" },
  "golem-slam": { cast: "swing-heavy", hit: "hit-blunt" },
  "turret-shot": { cast: "cast-rivet", hit: "hit-rivet" },
  "self-destruct": { cast: null, hit: null, landing: "self-destruct" },
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

export interface ImpactOverride {
  upgradeId: string;
  abilityId: string;
  falling: SoundId;
  landing: SoundId;
}

export const UPGRADE_IMPACT_SOUNDS: readonly ImpactOverride[] = [
  { upgradeId: "pyro-supernova", abilityId: "meteor", falling: "supernova-fall", landing: "supernova-impact" },
];

export function impactSounds(abilityId: string, upgradeIds: readonly string[]): Pick<AbilitySound, "falling" | "landing"> | undefined {
  return UPGRADE_IMPACT_SOUNDS.find((override) => override.abilityId === abilityId && upgradeIds.includes(override.upgradeId)) ?? abilitySounds(abilityId);
}

export const FORM_SOUNDS = {
  inferno: "inferno",
  avatar: "holy-pillar",
} as const satisfies Record<string, SoundId>;

export const REVIVE_SOUNDS = {
  "pyro-phoenix": "phoenix",
  "frost-ice-mirror": "ice-mirror",
} as const satisfies Record<string, SoundId>;

export const EMITTER_SOUNDS = {
  "glacial-prison": "hailstorm",
} as const satisfies Record<string, SoundId>;

export const PASSIVE_SOUNDS = {
  "deep-freeze": "deep-freeze",
  virulence: "plague-burst",
  "blessed-overflow": "blessed-burst",
  threads: "weaver",
  harvest: "thrall-rise",
} as const satisfies Record<string, SoundId>;

export const REACTION_SOUNDS = {
  "death-knell": "death-knell",
} as const satisfies Record<string, SoundId>;

export const PAYMENT_SOUNDS = {
  "unstable-core": "unstable-core",
} as const satisfies Partial<Record<HpPaymentReason, SoundId>>;

type MappedForm = keyof typeof FORM_SOUNDS;

type RevivingUpgrade = keyof typeof REVIVE_SOUNDS;

type EmittingAbility = keyof typeof EMITTER_SOUNDS;

type SoundingPassive = keyof typeof PASSIVE_SOUNDS;

type SoundingReaction = keyof typeof REACTION_SOUNDS;

type SoundingPayment = keyof typeof PAYMENT_SOUNDS;

function isMappedForm(key: string): key is MappedForm {
  return Object.hasOwn(FORM_SOUNDS, key);
}

function isRevivingUpgrade(upgradeId: string): upgradeId is RevivingUpgrade {
  return Object.hasOwn(REVIVE_SOUNDS, upgradeId);
}

function isEmittingAbility(abilityId: string): abilityId is EmittingAbility {
  return Object.hasOwn(EMITTER_SOUNDS, abilityId);
}

function isSoundingPassive(passive: string): passive is SoundingPassive {
  return Object.hasOwn(PASSIVE_SOUNDS, passive);
}

function isSoundingReaction(abilityId: string): abilityId is SoundingReaction {
  return Object.hasOwn(REACTION_SOUNDS, abilityId);
}

function isSoundingPayment(reason: HpPaymentReason): reason is SoundingPayment {
  return Object.hasOwn(PAYMENT_SOUNDS, reason);
}

export function formSound(key: string): SoundId | undefined {
  return isMappedForm(key) ? FORM_SOUNDS[key] : undefined;
}

export function reviveSound(upgradeIds: readonly string[]): SoundId | undefined {
  const upgradeId = upgradeIds.find(isRevivingUpgrade);

  return upgradeId === undefined ? undefined : REVIVE_SOUNDS[upgradeId];
}

export function emitterSound(abilityId: string): SoundId | undefined {
  return isEmittingAbility(abilityId) ? EMITTER_SOUNDS[abilityId] : undefined;
}

export function passiveSound(passive: string): SoundId | undefined {
  return isSoundingPassive(passive) ? PASSIVE_SOUNDS[passive] : undefined;
}

export function reactionSound(abilityId: string): SoundId | undefined {
  return isSoundingReaction(abilityId) ? REACTION_SOUNDS[abilityId] : undefined;
}

export function paymentSound(reason: HpPaymentReason): SoundId | undefined {
  return isSoundingPayment(reason) ? PAYMENT_SOUNDS[reason] : undefined;
}

export const HERO_DEATH_SOUND: SoundId = "death";

export const RISE_SOUND: SoundId = "grave-rise";

export const CRUMBLE_SOUND: SoundId = "death-bones";

export const COMBO_SOUNDS: Readonly<Record<ComboKind, SoundId>> = {
  overload: "combo-overload",
  shatter: "combo-shatter",
  crush: "combo-crush",
};

const SHIELD_SOUND: SoundId = "shield-up";

export const SILENT_SHIELDS: ReadonlySet<string> = new Set(["blessed-overflow", "mech-suit"]);

export function shieldSound(abilityId: string): SoundId | undefined {
  return SILENT_SHIELDS.has(abilityId) ? undefined : SHIELD_SOUND;
}

export const THAW_SOUND: SoundId = "ice-break";

export const OMEN_ECHO_SOUND: SoundId = "omen-echo";

export const PUPPET_SOUND: SoundId = "puppeteer";

export const CRIT_SOUND: SoundId = "crit-hit";

export const HEAVY_HIT_SOUND: SoundId = "crit-heavy";

export const STUN_SOUND: SoundId = "stun";

export type TeleportBeat = "out" | "in" | "warp";

export const TELEPORT_SOUNDS: Readonly<Record<TeleportBeat, SoundId>> = {
  out: "teleport-out",
  in: "teleport-in",
  warp: "teleport-warp",
};
