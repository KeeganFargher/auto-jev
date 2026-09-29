import type { MeterMetric } from "./damage-tally.js";

export const METRIC_TITLES: Readonly<Record<MeterMetric, string>> = {
  dealt: "Damage dealt",
  taken: "Damage taken",
  healing: "Healing done",
};

export const METRIC_LABELS: Readonly<Record<MeterMetric, string>> = {
  dealt: "Damage",
  taken: "Taken",
  healing: "Healing",
};

export const METRIC_HELP: Readonly<Record<MeterMetric, string>> = {
  dealt: "Damage each hero dealt to enemies this fight, fire and knock-on hits included.",
  taken: "Damage each hero took this fight, from enemies and from friendly blasts.",
  healing: "HP each hero restored to its allies this fight.",
};

export function percent(fraction: number): string {
  return `${Math.round(fraction * 100)}%`;
}

export function plural(count: number, one: string, many: string): string {
  return `${count} ${count === 1 ? one : many}`;
}
