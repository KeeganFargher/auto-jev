export interface StatsReading {
  averageMs: number;
  worstMs: number;
  drawCalls: number;
  triangles: number;
  geometries: number;
  textures: number;
  shaders: number;
}

export interface StatsDisplay {
  fps: string;
  frame: string;
  worst: string;
  drawCalls: string;
  triangles: string;
  geometries: string;
  textures: string;
  shaders: string;
}

export const EMPTY_STATS_READING: StatsReading = {
  averageMs: 0,
  worstMs: 0,
  drawCalls: 0,
  triangles: 0,
  geometries: 0,
  textures: 0,
  shaders: 0,
};

const COMPACT_FROM = 10_000;

export function formatCount(value: number): string {
  return value >= COMPACT_FROM ? `${Math.round(value / 1000)}k` : String(value);
}

export function formatStatsReading(reading: StatsReading): StatsDisplay {
  return {
    fps: reading.averageMs === 0 ? "–" : String(Math.round(1000 / reading.averageMs)),
    frame: `${reading.averageMs.toFixed(1)} ms`,
    worst: `${Math.round(reading.worstMs)} ms`,
    drawCalls: formatCount(reading.drawCalls),
    triangles: formatCount(reading.triangles),
    geometries: String(reading.geometries),
    textures: String(reading.textures),
    shaders: String(reading.shaders),
  };
}
