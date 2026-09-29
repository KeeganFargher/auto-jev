import {
  berserker,
  bubbleCleric,
  firebrand,
  harpooner,
  paladin,
  trainingDummy,
} from "@jev-game/content";
import type { HeroDefinitionId, SetupWant } from "@jev-game/game";
import type { UnitStatusKind } from "../../game/unit-status.js";
import {
  BOMB,
  BROKEN_HEART,
  BUBBLE,
  CROSSED_AXES,
  DOWN_ARROW,
  FLAME,
  HAMMER,
  HARPOON,
  HUDDLE,
  MENDING_BUBBLE,
  PLUS,
  STARS,
  SURGE,
  SWORD,
  TARGET,
  UP_ARROW,
} from "./paths.js";

const HERO_GLYPHS: ReadonlyMap<HeroDefinitionId, string> = new Map([
  [paladin.id, HAMMER],
  [berserker.id, CROSSED_AXES],
  [firebrand.id, FLAME],
  [bubbleCleric.id, BUBBLE],
  [harpooner.id, HARPOON],
  [trainingDummy.id, TARGET],
]);

export const STATUS_GLYPHS: Readonly<Record<UnitStatusKind, string>> = {
  primed: BOMB,
  burning: FLAME,
  floating: BUBBLE,
  airborne: UP_ARROW,
  downed: DOWN_ARROW,
  stunned: STARS,
  rampage: SURGE,
  "safety-bubble": MENDING_BUBBLE,
};

export const WANT_GLYPHS: Readonly<Record<SetupWant, string>> = {
  airborne: UP_ARROW,
  floating: BUBBLE,
  burning: FLAME,
  grouped: HUDDLE,
};

export type MeterMetric = "dealt" | "taken" | "healing";

export const METER_GLYPHS: Readonly<Record<MeterMetric, string>> = {
  dealt: SWORD,
  taken: BROKEN_HEART,
  healing: PLUS,
};

export function heroGlyph(heroId: HeroDefinitionId): string {
  const path = HERO_GLYPHS.get(heroId);

  if (path === undefined) {
    throw new Error(`Hero "${heroId}" has no icon`);
  }

  return path;
}
