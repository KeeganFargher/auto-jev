import { TICK_RATE } from "@jev-game/game";

export interface ScoreLine {
  score: number;
  battles: number;
}

export function scoreRate(line: ScoreLine): number {
  return line.battles === 0 ? 0.5 : line.score / line.battles;
}

export function standardError(line: ScoreLine): number {
  if (line.battles === 0) {
    return 0;
  }

  const rate = scoreRate(line);

  return Math.sqrt((rate * (1 - rate)) / line.battles);
}

export function addScore(target: ScoreLine, score: number, battles: number): void {
  target.score += score;
  target.battles += battles;
}

export function percent(value: number): string {
  return `${(value * 100).toFixed(1)}%`;
}

export function points(value: number): string {
  const rounded = (value * 100).toFixed(1);

  return value > 0 ? `+${rounded}` : rounded;
}

export function quantile(values: readonly number[], fraction: number): number {
  if (values.length === 0) {
    return 0;
  }

  const sorted = [...values].sort((a, b) => a - b);
  const position = Math.min(sorted.length - 1, Math.max(0, Math.round(fraction * (sorted.length - 1))));

  return sorted[position]!;
}

export function ticksToSeconds(ticks: number): number {
  return ticks / TICK_RATE;
}

export function seconds(ticks: number): string {
  return `${ticksToSeconds(ticks).toFixed(1)} s`;
}
