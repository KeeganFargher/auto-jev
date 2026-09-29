import type { StageStats } from "../../game/views/board-stage.js";
import { createFrameSampler } from "../../game/views/frame-sampler.js";
import type { Store } from "../../state/store.js";
import type { StatsReading } from "./stats-format.js";

const SAMPLE_FRAMES = 90;

const REFRESH_MILLISECONDS = 250;

export interface StatsMonitor {
  frame(now: number, visible: boolean): void;
  publish(now: number): void;
}

export function createStatsMonitor(
  readings: Store<StatsReading>,
  readStats: () => StageStats,
  start: number,
): StatsMonitor {
  const sampler = createFrameSampler(SAMPLE_FRAMES, start);
  let refreshed = Number.NEGATIVE_INFINITY;

  function publish(now: number): void {
    refreshed = now;
    const stats = readStats();

    readings.set({
      averageMs: sampler.averageMs(),
      worstMs: sampler.worstMs(),
      drawCalls: stats.drawCalls,
      triangles: stats.triangles,
      geometries: stats.geometries,
      textures: stats.textures,
      shaders: stats.shaders,
    });
  }

  return {
    frame(now, visible) {
      sampler.record(now);

      if (visible && now - refreshed >= REFRESH_MILLISECONDS) {
        publish(now);
      }
    },

    publish,
  };
}
