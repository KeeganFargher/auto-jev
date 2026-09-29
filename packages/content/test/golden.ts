import { writeFileSync } from "node:fs";
import { runBattle } from "@jev-game/game";
import { LAB_PRESETS, battleDigest, createCustomLabSetup, gameCatalogue } from "../src/index.js";

export interface GoldenDigest {
  presetId: string;
  seed: number;
  digest: string;
}

export const GOLDEN_SEEDS: readonly number[] = [1, 2, 3, 4, 5, 6, 7, 8];

export function presetDigest(presetId: string, seed: number): string {
  const preset = LAB_PRESETS.find((candidate) => candidate.id === presetId);

  if (preset === undefined) {
    throw new Error(`Golden digest names unknown lab preset "${presetId}"`);
  }

  const outcome = runBattle(createCustomLabSetup(seed, preset.teamA, preset.teamB), gameCatalogue);

  return battleDigest(outcome.events);
}

export function recordGolden(): GoldenDigest[] {
  const digests: GoldenDigest[] = [];

  for (const preset of LAB_PRESETS) {
    for (const seed of GOLDEN_SEEDS) {
      digests.push({ presetId: preset.id, seed, digest: presetDigest(preset.id, seed) });
    }
  }

  return digests;
}

function entrySource(entry: GoldenDigest): string {
  return [
    "  {",
    `    presetId: "${entry.presetId}",`,
    `    seed: ${entry.seed},`,
    `    digest: "${entry.digest}",`,
    "  },",
  ].join("\n");
}

export function writeGolden(digests: readonly GoldenDigest[]): void {
  const source = [
    'import type { GoldenDigest } from "./golden.js";',
    "",
    "export const GOLDEN_DIGESTS: readonly GoldenDigest[] = [",
    ...digests.map(entrySource),
    "];",
    "",
  ].join("\n");

  writeFileSync(new URL("./golden-digests.ts", import.meta.url), source);
}
