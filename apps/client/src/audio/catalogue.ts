import type { LimitBehaviour, VoiceRules } from "./voice-policy.js";

export type Bus = "music" | "sfx";

export const BUSES: readonly Bus[] = ["music", "sfx"];

export type OneShotBus = Exclude<Bus, "music">;

export type PreloadGroup = "boot" | "battle";

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
  priority: number;
  pitchJitter: number;
  volumeJitter: number;
}

const AUDIO_ROOT = "/assets/audio";

const SWING: Mix = {
  volume: 0.32,
  maxVoices: 4,
  cooldownMs: 45,
  onLimit: "steal-oldest",
  priority: 0,
  pitchJitter: 0.08,
  volumeJitter: 0.15,
};

const IMPACT: Mix = {
  volume: 0.42,
  maxVoices: 4,
  cooldownMs: 35,
  onLimit: "steal-oldest",
  priority: 0,
  pitchJitter: 0.08,
  volumeJitter: 0.15,
};

const HEAVY: Mix = {
  volume: 0.8,
  maxVoices: 2,
  cooldownMs: 120,
  onLimit: "steal-oldest",
  priority: 2,
  pitchJitter: 0.03,
  volumeJitter: 0.05,
};

const STING: Mix = {
  volume: 0.85,
  maxVoices: 1,
  cooldownMs: 500,
  onLimit: "skip",
  priority: 3,
  pitchJitter: 0,
  volumeJitter: 0,
};

const UI: Mix = {
  volume: 0.45,
  maxVoices: 2,
  cooldownMs: 40,
  onLimit: "steal-oldest",
  priority: 3,
  pitchJitter: 0.04,
  volumeJitter: 0.05,
};

function sfx(
  file: string,
  group: PreloadGroup,
  mix: Mix,
  overrides: Partial<Mix> = {},
): SoundDefinition {
  return { url: `${AUDIO_ROOT}/${file}.mp3`, bus: "sfx", group, ...mix, ...overrides };
}

export const SOUNDS = {
  "ui-click": sfx("ui-click", "boot", UI),
  "draft-rise": sfx("draft-rise", "boot", UI, { volume: 0.5, maxVoices: 1, cooldownMs: 400 }),
  "draft-pick": sfx("draft-pick", "boot", UI, { volume: 0.6 }),
  "draft-unpick": sfx("draft-unpick", "boot", UI, { volume: 0.45 }),
  "draft-lock": sfx("draft-lock", "boot", STING, { volume: 0.7 }),
  "countdown-tick": sfx("countdown-tick", "boot", STING, {
    volume: 0.7,
    maxVoices: 2,
    cooldownMs: 300,
  }),
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
  "crit-hit": sfx("crit-hit", "battle", IMPACT, { volume: 0.55, maxVoices: 2 }),
  "crit-heavy": sfx("crit-heavy", "battle", HEAVY, { volume: 0.75 }),
  stun: sfx("stun", "battle", IMPACT, { volume: 0.5, maxVoices: 2, cooldownMs: 80 }),
  death: sfx("death", "battle", HEAVY, { volume: 0.6, maxVoices: 3, cooldownMs: 60 }),
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
