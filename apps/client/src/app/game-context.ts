import { createContext, useContext } from "react";
import type { AudioEngine } from "../audio/engine.js";
import type { GraphicsSettingsStore } from "../graphics/settings.js";
import type { NavigationStore } from "./navigation.js";

export interface GameServices {
  readonly audio: AudioEngine;
  readonly graphics: GraphicsSettingsStore;
  readonly navigation: NavigationStore;
}

export const GameContext = createContext<GameServices | null>(null);

export function useGame(): GameServices {
  const services = useContext(GameContext);

  if (services === null) {
    throw new Error("useGame needs a <GameProvider> above it");
  }

  return services;
}
