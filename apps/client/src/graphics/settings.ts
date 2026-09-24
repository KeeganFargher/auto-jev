export type RenderResolution = "sharp" | "balanced" | "fast";

export type ShadowQuality = "soft" | "simple";

export interface GraphicsSettings {
  resolution: RenderResolution;
  shadows: ShadowQuality;
  glow: boolean;
  monitor: boolean;
}

export const RENDER_RESOLUTIONS: readonly RenderResolution[] = ["sharp", "balanced", "fast"];

export const SHADOW_QUALITIES: readonly ShadowQuality[] = ["soft", "simple"];

export const DEFAULT_GRAPHICS: GraphicsSettings = { resolution: "sharp", shadows: "soft", glow: true, monitor: false };

const STORAGE_PREFIX = "jev-game.graphics";

const RESOLUTION_KEY = `${STORAGE_PREFIX}.resolution`;

const SHADOWS_KEY = `${STORAGE_PREFIX}.shadows`;

const GLOW_KEY = `${STORAGE_PREFIX}.glow`;

const MONITOR_KEY = `${STORAGE_PREFIX}.monitor`;

const MAX_DEVICE_PIXEL_RATIO = 2;

const RESOLUTION_SCALE: Readonly<Record<RenderResolution, number>> = { sharp: 1, balanced: 0.75, fast: 0.5 };

function isRenderResolution(value: string | null): value is RenderResolution {
  return RENDER_RESOLUTIONS.some((resolution) => resolution === value);
}

function isShadowQuality(value: string | null): value is ShadowQuality {
  return SHADOW_QUALITIES.some((quality) => quality === value);
}

function parseSwitch(stored: string | null, fallback: boolean): boolean {
  if (stored === "1") {
    return true;
  }

  return stored === "0" ? false : fallback;
}

export function parseGraphicsSettings(read: (key: string) => string | null): GraphicsSettings {
  const resolution = read(RESOLUTION_KEY);
  const shadows = read(SHADOWS_KEY);

  return {
    resolution: isRenderResolution(resolution) ? resolution : DEFAULT_GRAPHICS.resolution,
    shadows: isShadowQuality(shadows) ? shadows : DEFAULT_GRAPHICS.shadows,
    glow: parseSwitch(read(GLOW_KEY), DEFAULT_GRAPHICS.glow),
    monitor: parseSwitch(read(MONITOR_KEY), DEFAULT_GRAPHICS.monitor),
  };
}

export function renderPixelRatio(resolution: RenderResolution, devicePixelRatio: number): number {
  return Math.min(devicePixelRatio, MAX_DEVICE_PIXEL_RATIO) * RESOLUTION_SCALE[resolution];
}

function readStoredSettings(): GraphicsSettings {
  try {
    return parseGraphicsSettings((key) => localStorage.getItem(key));
  } catch {
    return DEFAULT_GRAPHICS;
  }
}

function writeStoredSettings(settings: GraphicsSettings): void {
  try {
    localStorage.setItem(RESOLUTION_KEY, settings.resolution);
    localStorage.setItem(SHADOWS_KEY, settings.shadows);
    localStorage.setItem(GLOW_KEY, settings.glow ? "1" : "0");
    localStorage.setItem(MONITOR_KEY, settings.monitor ? "1" : "0");
  } catch {
    return;
  }
}

export interface GraphicsSettingsStore {
  get(): GraphicsSettings;
  setResolution(resolution: RenderResolution): void;
  setShadows(shadows: ShadowQuality): void;
  setGlow(glow: boolean): void;
  setMonitor(monitor: boolean): void;
  subscribe(listener: (settings: GraphicsSettings) => void): () => void;
}

export function createGraphicsSettingsStore(): GraphicsSettingsStore {
  let settings = readStoredSettings();
  const listeners = new Set<(settings: GraphicsSettings) => void>();

  function commit(next: GraphicsSettings): void {
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

    setResolution(resolution) {
      commit({ ...settings, resolution });
    },

    setShadows(shadows) {
      commit({ ...settings, shadows });
    },

    setGlow(glow) {
      commit({ ...settings, glow });
    },

    setMonitor(monitor) {
      commit({ ...settings, monitor });
    },

    subscribe(listener) {
      listeners.add(listener);

      return () => {
        listeners.delete(listener);
      };
    },
  };
}

export const graphicsSettings = createGraphicsSettingsStore();
