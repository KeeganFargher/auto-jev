import type { LimitBehaviour, VoiceRules } from "./voice-policy.js";

export type Bus = "music" | "sfx" | "dialogue";

export const BUSES: readonly Bus[] = ["music", "sfx", "dialogue"];

export type OneShotBus = Exclude<Bus, "music">;

export type PreloadGroup = "boot" | "battle" | "voices";

export interface SoundDefinition extends VoiceRules {
  url: string;
  bus: OneShotBus;
  group: PreloadGroup;
  volume: number;
  pitchJitter: number;
  volumeJitter: number;
}

export interface MusicDefinition {
  url: string;
  volume: number;
}

interface Mix {
  volume: number;
  maxVoices: number;
  cooldownMs: number;
  onLimit: LimitBehaviour;
  pitchJitter: number;
  volumeJitter: number;
}

const AUDIO_ROOT = "/assets/audio";

const SWING: Mix = { volume: 0.32, maxVoices: 4, cooldownMs: 45, onLimit: "steal-oldest", pitchJitter: 0.08, volumeJitter: 0.15 };

const IMPACT: Mix = { volume: 0.42, maxVoices: 4, cooldownMs: 35, onLimit: "steal-oldest", pitchJitter: 0.08, volumeJitter: 0.15 };

const ABILITY: Mix = { volume: 0.6, maxVoices: 3, cooldownMs: 80, onLimit: "steal-oldest", pitchJitter: 0.04, volumeJitter: 0.08 };

const HEAVY: Mix = { volume: 0.8, maxVoices: 2, cooldownMs: 120, onLimit: "steal-oldest", pitchJitter: 0.03, volumeJitter: 0.05 };

const STING: Mix = { volume: 0.85, maxVoices: 1, cooldownMs: 500, onLimit: "skip", pitchJitter: 0, volumeJitter: 0 };

const UI: Mix = { volume: 0.45, maxVoices: 2, cooldownMs: 40, onLimit: "steal-oldest", pitchJitter: 0.04, volumeJitter: 0.05 };

const LINE: Mix = { volume: 1, maxVoices: 1, cooldownMs: 0, onLimit: "skip", pitchJitter: 0, volumeJitter: 0 };

function sfx(file: string, group: PreloadGroup, mix: Mix, overrides: Partial<Mix> = {}): SoundDefinition {
  return { url: `${AUDIO_ROOT}/${file}.mp3`, bus: "sfx", group, ...mix, ...overrides };
}

function line(file: string): SoundDefinition {
  return { url: `${AUDIO_ROOT}/vo/${file}.mp3`, bus: "dialogue", group: "voices", ...LINE };
}

export const SOUNDS = {
  "ui-click": sfx("ui-click", "boot", UI),
  "draft-rise": sfx("draft-rise", "boot", UI, { volume: 0.5, maxVoices: 1, cooldownMs: 400 }),
  "draft-pick": sfx("draft-pick", "boot", UI, { volume: 0.6 }),
  "draft-unpick": sfx("draft-unpick", "boot", UI, { volume: 0.45 }),
  "draft-lock": sfx("draft-lock", "boot", STING, { volume: 0.7 }),
  recruit: sfx("recruit", "boot", STING, { volume: 0.7 }),
  "reward-claim": sfx("reward-claim", "boot", UI, { volume: 0.6, cooldownMs: 150 }),
  "countdown-tick": sfx("countdown-tick", "boot", STING, { volume: 0.7, maxVoices: 2, cooldownMs: 300 }),
  "battle-start": sfx("battle-start", "boot", STING, { volume: 0.7 }),
  "round-won": sfx("round-won", "boot", STING),
  "round-lost": sfx("round-lost", "boot", STING),
  "run-won": sfx("run-won", "boot", STING, { volume: 0.9 }),
  eliminated: sfx("eliminated", "boot", STING, { volume: 0.9 }),
  "teleport-out": sfx("teleport-out", "battle", IMPACT, { cooldownMs: 40 }),
  "teleport-in": sfx("teleport-in", "battle", IMPACT, { cooldownMs: 40 }),
  "teleport-warp": sfx("teleport-warp", "battle", HEAVY, { volume: 0.6, maxVoices: 1 }),
  "swing-heavy": sfx("swing-heavy", "battle", SWING),
  "swing-light": sfx("swing-light", "battle", SWING),
  "hit-blunt": sfx("hit-blunt", "battle", IMPACT),
  "hit-blade": sfx("hit-blade", "battle", IMPACT),
  "hit-fire": sfx("hit-fire", "battle", IMPACT),
  "hit-frost": sfx("hit-frost", "battle", IMPACT),
  "hit-dark": sfx("hit-dark", "battle", IMPACT),
  "hit-thorn": sfx("hit-thorn", "battle", IMPACT),
  "hit-rivet": sfx("hit-rivet", "battle", IMPACT),
  "cast-firebolt": sfx("cast-firebolt", "battle", SWING, { volume: 0.36 }),
  "cast-frostbolt": sfx("cast-frostbolt", "battle", SWING, { volume: 0.36 }),
  "cast-darkbolt": sfx("cast-darkbolt", "battle", SWING, { volume: 0.36 }),
  "cast-thorn": sfx("cast-thorn", "battle", SWING, { volume: 0.36 }),
  "cast-rivet": sfx("cast-rivet", "battle", SWING, { volume: 0.36 }),
  "crit-hit": sfx("crit-hit", "battle", IMPACT, { volume: 0.55, maxVoices: 2 }),
  "crit-heavy": sfx("crit-heavy", "battle", HEAVY, { volume: 0.75 }),
  challenge: sfx("challenge", "battle", ABILITY),
  "shield-bash": sfx("shield-bash", "battle", ABILITY),
  consecrate: sfx("consecrate", "battle", ABILITY),
  mend: sfx("mend", "battle", ABILITY, { volume: 0.5, cooldownMs: 150 }),
  whirlwind: sfx("whirlwind", "battle", HEAVY),
  leap: sfx("leap", "battle", ABILITY),
  shadowstep: sfx("shadowstep", "battle", ABILITY),
  "meteor-fall": sfx("meteor-fall", "battle", ABILITY, { volume: 0.7 }),
  "meteor-impact": sfx("meteor-impact", "battle", HEAVY, { volume: 0.9 }),
  "flame-ward": sfx("flame-ward", "battle", ABILITY),
  "glacial-lance": sfx("glacial-lance", "battle", ABILITY),
  "shared-fate": sfx("shared-fate", "battle", ABILITY),
  hex: sfx("hex", "battle", ABILITY),
  "plague-cloud": sfx("plague-cloud", "battle", ABILITY),
  "caustic-spit": sfx("caustic-spit", "battle", ABILITY),
  "raise-dead": sfx("raise-dead", "battle", ABILITY),
  "corpse-explosion": sfx("corpse-explosion", "battle", ABILITY, { volume: 0.7 }),
  "deploy-turret": sfx("deploy-turret", "battle", ABILITY),
  flashbang: sfx("flashbang", "battle", ABILITY, { volume: 0.65 }),
  smoke: sfx("smoke", "battle", ABILITY, { volume: 0.5 }),
  "ice-block": sfx("ice-block", "battle", ABILITY),
  "ward-bell": sfx("ward-bell", "battle", ABILITY, { volume: 0.55 }),
  "golem-rise": sfx("golem-rise", "battle", ABILITY, { volume: 0.7 }),
  "shield-up": sfx("shield-up", "battle", IMPACT, { maxVoices: 2, cooldownMs: 150 }),
  "combo-overload": sfx("combo-overload", "battle", HEAVY, { volume: 0.85, cooldownMs: 100 }),
  "combo-shatter": sfx("combo-shatter", "battle", HEAVY, { volume: 0.85, cooldownMs: 100 }),
  "combo-crush": sfx("combo-crush", "battle", HEAVY, { volume: 0.85, cooldownMs: 100 }),
  death: sfx("death", "battle", HEAVY, { volume: 0.6, maxVoices: 3, cooldownMs: 60 }),
  "death-bones": sfx("death-bones", "battle", HEAVY, { volume: 0.5, maxVoices: 3, cooldownMs: 60 }),
  "death-turret": sfx("death-turret", "battle", HEAVY, { volume: 0.5, maxVoices: 3, cooldownMs: 60 }),
  "vo-bulwark-pick": line("bulwark-pick"),
  "vo-bulwark-cast-1": line("bulwark-cast-1"),
  "vo-bulwark-cast-2": line("bulwark-cast-2"),
  "vo-bulwark-death": line("bulwark-death"),
  "vo-bulwark-win": line("bulwark-win"),
  "vo-oathkeeper-pick": line("oathkeeper-pick"),
  "vo-oathkeeper-cast-1": line("oathkeeper-cast-1"),
  "vo-oathkeeper-cast-2": line("oathkeeper-cast-2"),
  "vo-oathkeeper-death": line("oathkeeper-death"),
  "vo-oathkeeper-win": line("oathkeeper-win"),
  "vo-ravager-pick": line("ravager-pick"),
  "vo-ravager-cast-1": line("ravager-cast-1"),
  "vo-ravager-cast-2": line("ravager-cast-2"),
  "vo-ravager-death": line("ravager-death"),
  "vo-ravager-win": line("ravager-win"),
  "vo-duskblade-pick": line("duskblade-pick"),
  "vo-duskblade-cast-1": line("duskblade-cast-1"),
  "vo-duskblade-cast-2": line("duskblade-cast-2"),
  "vo-duskblade-death": line("duskblade-death"),
  "vo-duskblade-win": line("duskblade-win"),
  "vo-pyromancer-pick": line("pyromancer-pick"),
  "vo-pyromancer-cast-1": line("pyromancer-cast-1"),
  "vo-pyromancer-cast-2": line("pyromancer-cast-2"),
  "vo-pyromancer-death": line("pyromancer-death"),
  "vo-pyromancer-win": line("pyromancer-win"),
  "vo-frostweaver-pick": line("frostweaver-pick"),
  "vo-frostweaver-cast-1": line("frostweaver-cast-1"),
  "vo-frostweaver-cast-2": line("frostweaver-cast-2"),
  "vo-frostweaver-death": line("frostweaver-death"),
  "vo-frostweaver-win": line("frostweaver-win"),
  "vo-hexbinder-pick": line("hexbinder-pick"),
  "vo-hexbinder-cast-1": line("hexbinder-cast-1"),
  "vo-hexbinder-cast-2": line("hexbinder-cast-2"),
  "vo-hexbinder-death": line("hexbinder-death"),
  "vo-hexbinder-win": line("hexbinder-win"),
  "vo-blightmother-pick": line("blightmother-pick"),
  "vo-blightmother-cast-1": line("blightmother-cast-1"),
  "vo-blightmother-cast-2": line("blightmother-cast-2"),
  "vo-blightmother-death": line("blightmother-death"),
  "vo-blightmother-win": line("blightmother-win"),
  "vo-bonecaller-pick": line("bonecaller-pick"),
  "vo-bonecaller-cast-1": line("bonecaller-cast-1"),
  "vo-bonecaller-cast-2": line("bonecaller-cast-2"),
  "vo-bonecaller-death": line("bonecaller-death"),
  "vo-bonecaller-win": line("bonecaller-win"),
  "vo-clockwright-pick": line("clockwright-pick"),
  "vo-clockwright-cast-1": line("clockwright-cast-1"),
  "vo-clockwright-cast-2": line("clockwright-cast-2"),
  "vo-clockwright-death": line("clockwright-death"),
  "vo-clockwright-win": line("clockwright-win"),
} as const satisfies Record<string, SoundDefinition>;

export type SoundId = keyof typeof SOUNDS;

export const MUSIC = {
  "music-planning": {
    url: `${AUDIO_ROOT}/music-planning.mp3`,
    volume: 0.85,
  },
} as const satisfies Record<string, MusicDefinition>;

export type MusicId = keyof typeof MUSIC;

export type MusicScreen = "menu" | "planning" | "battle";

export const MUSIC_FOR_SCREEN: Readonly<Record<MusicScreen, MusicId>> = {
  menu: "music-planning",
  planning: "music-planning",
  battle: "music-planning",
};

export const GLOBAL_VOICE_LIMIT = 16;

export const MUSIC_CROSSFADE_SECONDS = 1;

export const DIALOGUE_DUCK_GAIN = 0.35;
