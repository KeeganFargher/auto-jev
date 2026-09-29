import { METRICS, type MeterMetric } from "./damage-tally.js";

const STORAGE_KEY = "jev-game.meter-metric";

export function savedMetric(): MeterMetric {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);

    return METRICS.find((metric) => metric === stored) ?? "dealt";
  } catch {
    return "dealt";
  }
}

export function saveMetric(metric: MeterMetric): void {
  try {
    localStorage.setItem(STORAGE_KEY, metric);
  } catch {
    return;
  }
}
