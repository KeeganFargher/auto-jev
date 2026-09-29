import type { StageStats } from "../../game/views/board-stage.js";

export const LEAK_ROUNDS = 4;

const SWITCH_FRAMES = 2;

const SETTLE_FRAMES = 3;

export type MemoryReading = Pick<StageStats, "geometries" | "textures">;

export interface LeakTestHost<T> {
  onFrame(listener: (deltaSeconds: number) => void): () => void;
  stats(): StageStats;
  show(theme: T): void;
  isActive(): boolean;
  report(text: string): void;
}

export function leakGrowth(before: MemoryReading, after: MemoryReading): number {
  return after.geometries - before.geometries + (after.textures - before.textures);
}

export function summarizeLeakTest(
  switches: number,
  before: MemoryReading,
  after: MemoryReading,
): string {
  const verdict = leakGrowth(before, after) > 0 ? "leaking" : "no leak";

  return `${switches} switches · geometries ${before.geometries} → ${after.geometries} · textures ${before.textures} → ${after.textures} · ${verdict}`;
}

function framesLater<T>(host: LeakTestHost<T>, frames: number): Promise<void> {
  return new Promise((resolve) => {
    let remaining = frames;

    const stop = host.onFrame(() => {
      remaining -= 1;

      if (remaining <= 0) {
        stop();
        resolve();
      }
    });
  });
}

async function tour<T>(host: LeakTestHost<T>, themes: readonly T[], home: T): Promise<boolean> {
  for (const theme of themes) {
    if (!host.isActive()) {
      return false;
    }

    host.show(theme);
    await framesLater(host, SWITCH_FRAMES);
  }

  host.show(home);
  await framesLater(host, SETTLE_FRAMES);

  return host.isActive();
}

export async function runLeakTest<T>(
  host: LeakTestHost<T>,
  themes: readonly T[],
  home: T,
): Promise<void> {
  if (themes.length === 0) {
    throw new Error("The leak test needs at least one theme to switch between");
  }

  host.report("Switching themes…");

  if (!(await tour(host, themes, home))) {
    return;
  }

  const before = host.stats();

  for (let round = 0; round < LEAK_ROUNDS; round += 1) {
    if (!(await tour(host, themes, home))) {
      return;
    }
  }

  const after = host.stats();

  host.report(summarizeLeakTest(LEAK_ROUNDS * themes.length, before, after));
}
