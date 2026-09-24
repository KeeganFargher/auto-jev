import type { VoiceRules } from "./voice-policy.js";

export type Bus = "music" | "sfx" | "dialogue";

export const BUSES: readonly Bus[] = ["music", "sfx", "dialogue"];

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

const AUDIO_ROOT = "/assets/audio";

export const SOUNDS = {
  "ui-click": {
    url: `${AUDIO_ROOT}/ui-click.mp3`,
    bus: "sfx",
    group: "boot",
    volume: 0.5,
    maxVoices: 2,
    cooldownMs: 40,
    onLimit: "steal-oldest",
    pitchJitter: 0.04,
    volumeJitter: 0.05,
  },
  "round-won": {
    url: `${AUDIO_ROOT}/round-won.mp3`,
    bus: "sfx",
    group: "boot",
    volume: 0.9,
    maxVoices: 1,
    cooldownMs: 500,
    onLimit: "skip",
    pitchJitter: 0,
    volumeJitter: 0,
  },
  "attack-swing": {
    url: `${AUDIO_ROOT}/attack-swing.mp3`,
    bus: "sfx",
    group: "battle",
    volume: 0.45,
    maxVoices: 4,
    cooldownMs: 45,
    onLimit: "steal-oldest",
    pitchJitter: 0.08,
    volumeJitter: 0.15,
  },
  "hit-impact": {
    url: `${AUDIO_ROOT}/hit-impact.mp3`,
    bus: "sfx",
    group: "battle",
    volume: 0.55,
    maxVoices: 4,
    cooldownMs: 35,
    onLimit: "steal-oldest",
    pitchJitter: 0.1,
    volumeJitter: 0.15,
  },
  "spell-cast": {
    url: `${AUDIO_ROOT}/spell-cast.mp3`,
    bus: "sfx",
    group: "battle",
    volume: 0.5,
    maxVoices: 3,
    cooldownMs: 80,
    onLimit: "steal-oldest",
    pitchJitter: 0.06,
    volumeJitter: 0.1,
  },
  heal: {
    url: `${AUDIO_ROOT}/heal.mp3`,
    bus: "sfx",
    group: "battle",
    volume: 0.4,
    maxVoices: 2,
    cooldownMs: 120,
    onLimit: "skip",
    pitchJitter: 0.05,
    volumeJitter: 0.1,
  },
  death: {
    url: `${AUDIO_ROOT}/death.mp3`,
    bus: "sfx",
    group: "battle",
    volume: 0.7,
    maxVoices: 3,
    cooldownMs: 60,
    onLimit: "steal-oldest",
    pitchJitter: 0.05,
    volumeJitter: 0.05,
  },
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
