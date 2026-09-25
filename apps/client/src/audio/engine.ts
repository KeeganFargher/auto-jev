import {
  BUSES,
  DIALOGUE_DUCK_GAIN,
  GLOBAL_VOICE_LIMIT,
  MUSIC,
  MUSIC_CROSSFADE_SECONDS,
  SOUNDS,
  type Bus,
  type MusicId,
  type OneShotBus,
  type PreloadGroup,
  type SoundDefinition,
  type SoundId,
} from "./catalogue.js";
import { createAudioSettingsStore, type AudioSettings, type AudioSettingsStore } from "./settings.js";
import { decideVoice, type VoiceSlot } from "./voice-policy.js";

export interface PlayOptions {
  pan?: number;
}

export interface SoundStats {
  requested: number;
  started: number;
  skippedCooldown: number;
  skippedLimit: number;
  stolen: number;
  notReady: number;
}

export interface AudioEngine {
  readonly settings: AudioSettingsStore;
  play(id: SoundId, options?: PlayOptions): number;
  duration(id: SoundId): number;
  stopBus(bus: OneShotBus): void;
  setMusic(id: MusicId | null): void;
  preload(group: PreloadGroup): Promise<void>;
  isUnlocked(): boolean;
  stats(): Readonly<Record<string, SoundStats>>;
  activeVoiceCount(): number;
  currentMusic(): MusicId | null;
  lastEffectAt(): number;
}

interface Voice extends VoiceSlot {
  bus: Bus;
  source: AudioBufferSourceNode;
  gain: GainNode;
}

interface MusicTrack {
  element: HTMLAudioElement;
  gain: GainNode;
  stopTimer: number;
}

const STEAL_FADE_SECONDS = 0.015;

const BUS_SMOOTHING_SECONDS = 0.02;

const DUCK_ATTACK_SECONDS = 0.15;

const DUCK_RELEASE_SECONDS = 0.6;

const MAX_PAN = 0.6;

const UNLOCK_EVENTS: readonly string[] = ["pointerdown", "pointerup", "touchend", "keydown"];

function perceptualGain(value: number): number {
  return value * value;
}

function jitter(amount: number): number {
  return 1 + (Math.random() * 2 - 1) * amount;
}

function emptyStats(): SoundStats {
  return { requested: 0, started: 0, skippedCooldown: 0, skippedLimit: 0, stolen: 0, notReady: 0 };
}

export function createAudioEngine(): AudioEngine {
  const settings = createAudioSettingsStore();
  const context = new AudioContext({ latencyHint: "interactive" });
  const master = context.createGain();
  const duck = context.createGain();

  const buses: Record<Bus, GainNode> = {
    music: context.createGain(),
    sfx: context.createGain(),
    dialogue: context.createGain(),
  };

  buses.music.connect(duck);
  duck.connect(master);
  buses.sfx.connect(master);
  buses.dialogue.connect(master);
  master.connect(context.destination);

  const buffers = new Map<string, AudioBuffer>();
  const loading = new Map<string, Promise<void>>();
  const voices: Voice[] = [];
  const lastStartedAt = new Map<SoundId, number>();
  const soundStats = new Map<SoundId, SoundStats>();
  const tracks = new Map<MusicId, MusicTrack>();
  let lastEffectStartedAt = Number.NEGATIVE_INFINITY;
  let requestedMusic: MusicId | null = null;
  let playingMusic: MusicId | null = null;

  function applySettings(next: AudioSettings): void {
    const now = context.currentTime;
    const masterLevel = next.muted ? 0 : perceptualGain(next.volumes.master);
    master.gain.setTargetAtTime(masterLevel, now, BUS_SMOOTHING_SECONDS);

    for (const bus of BUSES) {
      buses[bus].gain.setTargetAtTime(perceptualGain(next.volumes[bus]), now, BUS_SMOOTHING_SECONDS);
    }
  }

  applySettings(settings.get());
  settings.subscribe(applySettings);

  function statsFor(id: SoundId): SoundStats {
    let entry = soundStats.get(id);

    if (entry === undefined) {
      entry = emptyStats();
      soundStats.set(id, entry);
    }

    return entry;
  }

  function load(id: string, definition: SoundDefinition): Promise<void> {
    const pending = loading.get(id);

    if (pending !== undefined) {
      return pending;
    }

    const task = fetch(definition.url)
      .then((response) => {
        if (!response.ok) {
          throw new Error(`audio "${id}" failed to load: ${response.status}`);
        }

        return response.arrayBuffer();
      })
      .then((bytes) => context.decodeAudioData(bytes))
      .then((buffer) => {
        buffers.set(id, buffer);
      })
      .catch((error: Error) => {
        loading.delete(id);
        console.warn(error);
      });

    loading.set(id, task);

    return task;
  }

  function isDialoguePlaying(): boolean {
    return voices.some((voice) => voice.bus === "dialogue");
  }

  function updateDuck(): void {
    const now = context.currentTime;
    duck.gain.cancelScheduledValues(now);
    duck.gain.setValueAtTime(duck.gain.value, now);

    if (isDialoguePlaying()) {
      duck.gain.linearRampToValueAtTime(DIALOGUE_DUCK_GAIN, now + DUCK_ATTACK_SECONDS);
    } else {
      duck.gain.linearRampToValueAtTime(1, now + DUCK_RELEASE_SECONDS);
    }
  }

  function removeVoice(voice: Voice): void {
    const index = voices.indexOf(voice);

    if (index === -1) {
      return;
    }

    voices.splice(index, 1);

    if (voice.bus === "dialogue") {
      updateDuck();
    }
  }

  function fadeOutVoice(voice: Voice): void {
    removeVoice(voice);
    const now = context.currentTime;
    voice.gain.gain.cancelScheduledValues(now);
    voice.gain.gain.setValueAtTime(voice.gain.gain.value, now);
    voice.gain.gain.linearRampToValueAtTime(0, now + STEAL_FADE_SECONDS);
    voice.source.stop(now + STEAL_FADE_SECONDS * 2);
  }

  function startVoice(id: SoundId, buffer: AudioBuffer, options: PlayOptions): number {
    const definition: SoundDefinition = SOUNDS[id];
    const source = context.createBufferSource();
    source.buffer = buffer;
    source.playbackRate.value = jitter(definition.pitchJitter);

    const gain = context.createGain();
    gain.gain.value = definition.volume * jitter(definition.volumeJitter);
    source.connect(gain);

    if (options.pan === undefined) {
      gain.connect(buses[definition.bus]);
    } else {
      const panner = context.createStereoPanner();
      panner.pan.value = Math.max(-1, Math.min(1, options.pan)) * MAX_PAN;
      gain.connect(panner);
      panner.connect(buses[definition.bus]);
    }

    const voice: Voice = { soundId: id, startedAt: performance.now(), priority: definition.priority, bus: definition.bus, source, gain };
    source.addEventListener("ended", () => removeVoice(voice));
    voices.push(voice);
    source.start();

    if (definition.bus === "dialogue") {
      updateDuck();
    } else {
      lastEffectStartedAt = performance.now();
    }

    return buffer.duration / source.playbackRate.value;
  }

  function trackFor(id: MusicId): MusicTrack {
    const existing = tracks.get(id);

    if (existing !== undefined) {
      return existing;
    }

    const element = new Audio();
    element.preload = "none";
    element.loop = true;
    element.src = MUSIC[id].url;

    const gain = context.createGain();
    gain.gain.value = 0;
    context.createMediaElementSource(element).connect(gain);
    gain.connect(buses.music);

    const track: MusicTrack = { element, gain, stopTimer: 0 };
    tracks.set(id, track);

    return track;
  }

  function rampTrack(track: MusicTrack, target: number): void {
    const now = context.currentTime;
    track.gain.gain.cancelScheduledValues(now);
    track.gain.gain.setValueAtTime(track.gain.gain.value, now);
    track.gain.gain.linearRampToValueAtTime(target, now + MUSIC_CROSSFADE_SECONDS);
  }

  function fadeOutTrack(id: MusicId): void {
    const track = tracks.get(id);

    if (track === undefined) {
      return;
    }

    rampTrack(track, 0);
    window.clearTimeout(track.stopTimer);
    track.stopTimer = window.setTimeout(() => track.element.pause(), MUSIC_CROSSFADE_SECONDS * 1000);
  }

  function fadeInTrack(id: MusicId): void {
    const track = trackFor(id);
    window.clearTimeout(track.stopTimer);
    rampTrack(track, MUSIC[id].volume);
    track.element.play().catch((error: Error) => console.warn(error));
  }

  function syncMusic(): void {
    if (context.state !== "running" || requestedMusic === playingMusic) {
      return;
    }

    if (playingMusic !== null) {
      fadeOutTrack(playingMusic);
    }

    if (requestedMusic !== null) {
      fadeInTrack(requestedMusic);
    }

    playingMusic = requestedMusic;
  }

  function unlock(): void {
    if (context.state === "running") {
      return;
    }

    context
      .resume()
      .then(() => {
        for (const type of UNLOCK_EVENTS) {
          window.removeEventListener(type, unlock, true);
        }

        syncMusic();
      })
      .catch((error: Error) => console.warn(error));
  }

  for (const type of UNLOCK_EVENTS) {
    window.addEventListener(type, unlock, true);
  }

  return {
    settings,

    play(id, options = {}) {
      const stats = statsFor(id);
      stats.requested += 1;
      const buffer = buffers.get(id);

      if (context.state !== "running" || buffer === undefined) {
        stats.notReady += 1;
        void load(id, SOUNDS[id]);

        return 0;
      }

      const now = performance.now();
      const definition: SoundDefinition = SOUNDS[id];
      const sameBus = voices.filter((voice) => voice.bus === definition.bus);
      const decision = decideVoice(id, definition, sameBus, GLOBAL_VOICE_LIMIT, lastStartedAt.get(id), now);

      if (decision.kind === "skip") {
        if (decision.reason === "cooldown") {
          stats.skippedCooldown += 1;
        } else {
          stats.skippedLimit += 1;
        }

        return 0;
      }

      if (decision.kind === "steal") {
        stats.stolen += 1;
        fadeOutVoice(decision.victim);
      }

      lastStartedAt.set(id, now);
      stats.started += 1;

      return startVoice(id, buffer, options);
    },

    duration(id) {
      return buffers.get(id)?.duration ?? 0;
    },

    stopBus(bus) {
      for (const voice of voices.filter((candidate) => candidate.bus === bus)) {
        fadeOutVoice(voice);
      }
    },

    setMusic(id) {
      requestedMusic = id;
      syncMusic();
    },

    async preload(group) {
      const entries: [string, SoundDefinition][] = Object.entries(SOUNDS);
      await Promise.all(entries.flatMap(([id, definition]) => (definition.group === group ? [load(id, definition)] : [])));
    },

    isUnlocked() {
      return context.state === "running";
    },

    stats() {
      return Object.fromEntries(soundStats);
    },

    activeVoiceCount() {
      return voices.length;
    },

    currentMusic() {
      return playingMusic;
    },

    lastEffectAt() {
      return lastEffectStartedAt;
    },
  };
}

export const audio = createAudioEngine();
