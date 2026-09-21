import type { BuildingId, ProvinceKind } from "./types.js";

export interface BuildingDefinition {
  id: BuildingId; name: string; cost: number; turns: number; minTier: number;
  /** Extra gold per turn from the province that holds it. */
  income: number;
  /** Multiplier on the province's garrison strength. */
  defence: number;
  /** Only buildable in these province kinds; empty means anywhere with a settlement. */
  kinds: ProvinceKind[];
  effect: string;
}
const define = (id: BuildingId, name: string, cost: number, turns: number, minTier: number, income: number, defence: number, kinds: ProvinceKind[], effect: string): BuildingDefinition =>
  ({ id, name, cost, turns, minTier, income, defence, kinds, effect });

/** Settlement buildings are the whole upgrade path: what you can recruit, and how hard you are to take. */
export const BUILDINGS: BuildingDefinition[] = [
  define("keep", "Keep", 0, 0, 3, 10, 1.5, ["capital"], "The seat of the faction. Its fall is catastrophic."),
  define("barracks", "Barracks", 150, 2, 1, 0, 1.15, [], "Recruits Spearmen and Swordsmen."),
  define("range", "Archery Range", 160, 2, 1, 0, 1.1, [], "Recruits Archers, and Crossbowmen where the territory allows."),
  define("stable", "Stable", 200, 3, 2, 0, 1, [], "Recruits Light and Heavy Cavalry."),
  define("forge", "Forge", 240, 3, 2, 10, 1.2, [], "Recruits Shieldguard, Great Weapons and Catapults."),
  define("arcane_tower", "Arcane Tower", 260, 3, 2, 5, 1.1, [], "Recruits Battle Mages."),
  define("market", "Market", 180, 2, 1, 22, 1, [], "Substantially more gold every turn."),
  define("farm", "Farm", 120, 2, 1, 12, 1, [], "Replenishes armies stationed here faster."),
  define("watchtower", "Watchtower", 110, 1, 1, 0, 1.25, [], "Sees further, and holds longer."),
  define("walls", "Walls", 220, 3, 2, 0, 1.8, [], "An attacker must break them before reaching the garrison."),
];
const BY_ID = new Map(BUILDINGS.map((building) => [building.id, building]));
export function buildingDefinition(id: BuildingId): BuildingDefinition {
  const building = BY_ID.get(id);
  if (building === undefined) throw new Error(`Unknown building ${id}`);
  return building;
}
