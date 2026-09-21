import type { BuildingId, UnitCategory, UnitId } from "./types.js";

export interface UnitDefinition {
  id: UnitId; name: string; category: UnitCategory; tier: number;
  models: number; health: number; damage: number; armour: number; speed: number;
  cost: number; upkeep: number;
  /** Categories this unit beats badly; auto-resolve and battle targeting both read it. */
  strongAgainst: UnitCategory[];
  /** The building a settlement needs before it can recruit this. */
  requires: BuildingId | null;
  /** A province kind that must be owned somewhere, for territory-gated units. */
  territory: boolean;
  blurb: string;
}
const define = (
  id: UnitId, name: string, category: UnitCategory, tier: number, models: number, health: number, damage: number,
  armour: number, speed: number, cost: number, upkeep: number, strongAgainst: UnitCategory[], requires: BuildingId | null,
  territory: boolean, blurb: string,
): UnitDefinition => ({ id, name, category, tier, models, health, damage, armour, speed, cost, upkeep, strongAgainst, requires, territory, blurb });

/** The V1 roster: small enough to read at a glance, with counters obvious enough to watch. */
export const UNITS: UnitDefinition[] = [
  define("militia", "Militia", "frontline", 0, 8, 60, 6, 0, 1, 40, 4, [], null, false, "Farmers with spears. They die, but they die in front of someone who matters."),
  define("spearmen", "Spearmen", "frontline", 1, 8, 85, 8, 2, 1, 90, 8, ["mobile", "monster"], "barracks", false, "A braced wall of points. Cavalry break on them."),
  define("swordsmen", "Swordsmen", "damage", 1, 8, 95, 13, 2, 1, 110, 10, ["frontline"], "barracks", false, "Line breakers. They chew through anything holding still."),
  define("archers", "Archers", "ranged", 1, 6, 55, 11, 0, 1.1, 100, 9, ["frontline", "monster"], "range", false, "Loose at range, run when reached."),
  define("light_cavalry", "Light Cavalry", "mobile", 1, 4, 110, 15, 1, 1.9, 130, 14, ["ranged", "siege", "mage"], "stable", false, "Fast, and murder on anything without a spear."),
  define("shieldguard", "Shieldguard", "frontline", 2, 8, 140, 10, 6, 0.85, 190, 18, ["damage", "ranged"], "forge", false, "An immovable wall. Slow enough to walk around, hard enough that you won't."),
  define("great_weapons", "Great Weapons", "damage", 2, 6, 120, 24, 3, 0.95, 210, 20, ["frontline", "monster"], "forge", false, "Two-handed and lethal. Armour is a suggestion."),
  define("crossbowmen", "Crossbowmen", "ranged", 2, 6, 70, 19, 1, 1, 180, 16, ["frontline"], "range", true, "Slow to reload, punches through plate."),
  define("heavy_cavalry", "Heavy Cavalry", "mobile", 2, 4, 180, 26, 5, 1.7, 260, 26, ["ranged", "damage", "siege"], "stable", true, "The hammer. A charge into a flank ends battles."),
  define("battle_mage", "Battle Mage", "mage", 2, 2, 80, 30, 0, 1, 240, 24, ["frontline"], "arcane_tower", true, "Deletes packed formations. Dies to anything that reaches them."),
  define("ogre", "Ogre", "monster", 2, 1, 420, 40, 4, 1.1, 250, 24, ["frontline", "damage"], null, true, "One enormous problem. Spears are the answer; panic is the usual response."),
  define("catapult", "Catapult", "siege", 2, 1, 90, 55, 0, 0.6, 220, 20, ["siege"], "forge", false, "Breaks walls and formations. Helpless once found."),
];
const BY_ID = new Map(UNITS.map((unit) => [unit.id, unit]));
export function unitDefinition(id: UnitId): UnitDefinition {
  const unit = BY_ID.get(id);
  if (unit === undefined) throw new Error(`Unknown unit ${id}`);
  return unit;
}
/** Veterancy: each rank is a flat multiplier on damage and staying power. */
export function rankBonus(rank: number): number { return 1 + rank * 0.15; }
export const RANK_NAMES = ["Green", "Trained", "Seasoned", "Veteran", "Elite"];
