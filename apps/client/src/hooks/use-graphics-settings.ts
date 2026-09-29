import { useGame } from "../app/game-context.js";
import type { GraphicsSettings, GraphicsSettingsStore } from "../graphics/settings.js";
import { useStore } from "../state/use-store.js";

export function useGraphicsStore(): GraphicsSettingsStore {
  return useGame().graphics;
}

export function useGraphicsSettings(): GraphicsSettings {
  return useStore(useGraphicsStore());
}
