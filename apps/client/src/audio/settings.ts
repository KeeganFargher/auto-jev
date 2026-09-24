import type { Bus } from "./catalogue.js";

export type VolumeChannel = "master" | Bus;

export interface AudioSettings {
  volumes: Record<VolumeChannel, number>;
  muted: boolean;
}

export const VOLUME_CHANNELS: readonly VolumeChannel[] = ["master", "music", "sfx", "dialogue"];

const STORAGE_PREFIX = "jev-game.audio";

const MUTED_KEY = `${STORAGE_PREFIX}.muted`;

const DEFAULT_VOLUMES: Readonly<Record<VolumeChannel, number>> = { master: 0.8, music: 0.6, sfx: 0.8, dialogue: 1 };

function volumeKey(channel: VolumeChannel): string {
  return `${STORAGE_PREFIX}.${channel}`;
}

function clampVolume(value: number): number {
  return Math.min(1, Math.max(0, value));
}

function parseVolume(stored: string | null, fallback: number): number {
  const value = stored === null ? Number.NaN : Number(stored);

  return Number.isFinite(value) ? clampVolume(value) : fallback;
}

function readStoredSettings(): AudioSettings {
  const volumes = { ...DEFAULT_VOLUMES };

  try {
    for (const channel of VOLUME_CHANNELS) {
      volumes[channel] = parseVolume(localStorage.getItem(volumeKey(channel)), volumes[channel]);
    }

    return { volumes, muted: localStorage.getItem(MUTED_KEY) === "1" };
  } catch {
    return { volumes, muted: false };
  }
}

function writeStoredSettings(settings: AudioSettings): void {
  try {
    for (const channel of VOLUME_CHANNELS) {
      localStorage.setItem(volumeKey(channel), String(settings.volumes[channel]));
    }

    localStorage.setItem(MUTED_KEY, settings.muted ? "1" : "0");
  } catch {
    return;
  }
}

export interface AudioSettingsStore {
  get(): AudioSettings;
  setVolume(channel: VolumeChannel, value: number): void;
  setMuted(muted: boolean): void;
  subscribe(listener: (settings: AudioSettings) => void): () => void;
}

export function createAudioSettingsStore(): AudioSettingsStore {
  let settings = readStoredSettings();
  const listeners = new Set<(settings: AudioSettings) => void>();

  function commit(next: AudioSettings): void {
    settings = next;
    writeStoredSettings(settings);

    for (const listener of listeners) {
      listener(settings);
    }
  }

  return {
    get() {
      return settings;
    },

    setVolume(channel, value) {
      commit({ ...settings, volumes: { ...settings.volumes, [channel]: clampVolume(value) } });
    },

    setMuted(muted) {
      commit({ ...settings, muted });
    },

    subscribe(listener) {
      listeners.add(listener);

      return () => listeners.delete(listener);
    },
  };
}
