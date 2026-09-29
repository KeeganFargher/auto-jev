import { useGame } from "../app/game-context.js";
import type { AudioEngine } from "../audio/engine.js";
import type { AudioSettings } from "../audio/settings.js";
import { useStore } from "../state/use-store.js";

export function useAudio(): AudioEngine {
  return useGame().audio;
}

export function useAudioSettings(): AudioSettings {
  return useStore(useGame().audio.settings);
}
