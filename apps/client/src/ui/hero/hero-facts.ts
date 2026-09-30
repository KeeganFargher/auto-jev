import {
  cellSize,
  type HeroDefinition,
  type HeroRole,
  type SetupWant,
  type SignatureDefinition,
} from "@jev-game/game";
import { boardArena } from "@jev-game/content";

const ROLE_LABELS: Readonly<Record<HeroRole, string>> = {
  frontline: "Frontline",
  midline: "Midline",
  backline: "Backline",
};

const WANT_LABELS: Readonly<Record<SetupWant, string>> = {
  airborne: "Airborne",
  floating: "Floating",
  burning: "Burning",
  grouped: "Grouped",
  downed: "Downed",
  frozen: "Frozen",
};

function trimmed(value: number): string {
  return String(Math.round(value * 10) / 10);
}

export function formatCount(value: number): string {
  return Math.round(value).toLocaleString("en-US");
}

export function fraction(value: number, max: number): number {
  return Math.max(0, Math.min(1, value / max));
}

export function heroReach(hero: HeroDefinition): string {
  return hero.attack.kind === "melee"
    ? "Melee"
    : `${trimmed(hero.attack.rangeUnits / cellSize(boardArena))}-cell range`;
}

export function heroSub(hero: HeroDefinition): string {
  return `${ROLE_LABELS[hero.role]} · ${heroReach(hero)}`;
}

export function wantLabel(signature: SignatureDefinition, want: SetupWant): string {
  return want === "grouped" ? `${signature.groupSize}+ grouped` : WANT_LABELS[want];
}
