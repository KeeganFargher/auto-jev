import type { UpgradeCategory } from "@jev-game/game";

export const ICON_KINDS = ["items", "gems", "levels", "heroes", "faces"] as const;

export type IconKind = (typeof ICON_KINDS)[number];

export interface KindContract {
  subject: UpgradeCategory | "hero";
  masterSize: number;
  runtimeSize: number;
  byteBudget: number;
}

export const KIND_CONTRACTS = {
  items: { subject: "item", masterSize: 512, runtimeSize: 192, byteBudget: 20 * 1024 },
  gems: { subject: "gem", masterSize: 512, runtimeSize: 192, byteBudget: 20 * 1024 },
  levels: { subject: "level", masterSize: 512, runtimeSize: 192, byteBudget: 20 * 1024 },
  heroes: { subject: "hero", masterSize: 512, runtimeSize: 320, byteBudget: 48 * 1024 },
  faces: { subject: "hero", masterSize: 256, runtimeSize: 128, byteBudget: 12 * 1024 },
} as const satisfies Record<IconKind, KindContract>;

export const WEBP_QUALITY = 85;

export const ALPHA_QUALITY = 90;
