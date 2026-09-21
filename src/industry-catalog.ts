import type { Stock, TechId } from "./catalog.js";
import type { ResourceKind } from "./types.js";

export const BUILDING_IDS = ["farm", "fishery", "mill", "bakery", "smokehouse", "well", "pump_house", "irrigation_station", "logging_camp", "forester", "quarry", "clay_pit", "brick_kiln", "iron_mine", "coal_mine", "sawmill", "foundry", "toolmaker", "armory", "machine_shop", "home", "granary", "warehouse", "clinic", "school", "scout_lodge", "trading_post", "outpost", "watchtower", "barracks"] as const;
export type BuildingKind = typeof BUILDING_IDS[number];
export interface BuildingDefinition {
  id: BuildingKind; name: string; category: string; technology: TechId | null;
  cost: Partial<Stock>; input: Partial<Stock>; output: Partial<Stock>;
  work: number; source: ResourceKind | null; effect: string;
}
const define = (id: BuildingKind, name: string, category: string, technology: TechId | null, cost: Partial<Stock>, input: Partial<Stock>, output: Partial<Stock>, source: ResourceKind | null, effect: string): BuildingDefinition => ({ id, name, category, technology, cost, input, output, source, effect, work: 80 });
export const BUILDINGS: BuildingDefinition[] = [
  define("farm", "Market garden", "Food", null, {wood:24,stone:8}, {water:3}, {food:9}, null, "A staffed garden; higher tiers yield more food per watering"),
  define("fishery", "Fishing lodge", "Food", null, {wood:20,stone:6}, {}, {food:5}, "river", "A permanent fishing workplace by water"),
  define("mill", "Grain mill", "Food", "agronomy", {planks:18,stone:16}, {food:3}, {food:7}, null, "Process crops into more usable food; requires a market garden"),
  define("bakery", "Bakery", "Food", "preservation", {bricks:12,planks:16}, {food:4,water:1,coal:1}, {food:12}, null, "Cook efficient meals from milled crops"),
  define("smokehouse", "Smokehouse", "Food", "preservation", {planks:16,stone:12}, {food:3,wood:1}, {food:8}, null, "Preserve fish; requires a fishing lodge"),
  define("well", "Village well", "Water", null, {wood:16,stone:16}, {}, {water:10}, "river", "A staffed water source; shorter trips than hand collecting"),
  define("pump_house", "Pump house", "Water", "irrigation", {planks:24,metal:12,stone:16}, {coal:1}, {water:18}, "river", "Powered water production; tier II also runs unattended"),
  define("irrigation_station", "Irrigation station", "Water", "irrigation", {planks:24,metal:12,stone:16}, {water:4}, {}, null, "Staff irrigate and harvest nearby fields within 16 tiles"),
  define("logging_camp", "Logging camp", "Forestry", null, {wood:16,stone:6}, {}, {wood:8}, "tree", "Workers cut local timber; needs nearby trees"),
  define("forester", "Forester lodge", "Forestry", "forestry", {planks:16,stone:8}, {water:2}, {}, "tree", "Restores nearby depleted trees; invests water and labor in regrowth"),
  define("quarry", "Stone quarry", "Materials", null, {wood:18,planks:6}, {}, {stone:7}, "stone", "Extract local stone; relocate when the deposit is exhausted"),
  define("clay_pit", "Clay pit", "Materials", "settlement", {wood:20,stone:8}, {}, {clay:8}, "clay", "Extract clay for masonry"),
  define("brick_kiln", "Brick kiln", "Materials", "settlement", {stone:20,planks:10}, {clay:4,wood:2}, {bricks:4}, null, "Fire clay into bricks for upgraded housing and industry"),
  define("iron_mine", "Iron mine", "Materials", "metalworking", {planks:20,stone:16}, {}, {ore:8}, "ore", "Extract remote iron; frontier sites offer richer deposits"),
  define("coal_mine", "Coal mine", "Materials", "metalworking", {planks:20,stone:16}, {}, {coal:8}, "coal", "Fuel workshops and powered machinery"),
  define("sawmill", "Sawmill", "Industry", "forestry", {planks:20,stone:16}, {wood:4}, {planks:5}, null, "Process logs into construction timber; tier II runs on coal unattended"),
  define("foundry", "Foundry", "Industry", "metalworking", {bricks:16,planks:20}, {ore:4,coal:2}, {metal:4}, null, "Smelt iron; tier II additionally produces steel"),
  define("toolmaker", "Toolmaker", "Industry", "metalworking", {planks:20,stone:16}, {metal:2,planks:1}, {tools:2}, null, "Make work tools; workers equip them from storage"),
  define("armory", "Armory", "Industry", "militia", {planks:20,stone:16}, {metal:2,planks:2}, {weapons:2}, null, "Equip the frontier with weapons"),
  define("machine_shop", "Machine shop", "Industry", "mechanization", {bricks:20,metal:16}, {steel:2,planks:2}, {parts:2}, null, "Produce machine parts for tier III upgrades and repairs"),
  define("home", "Residential hall", "Civic", "settlement", {wood:24,planks:12,stone:8}, {}, {}, null, "Adds 4 beds per tier; upgraded halls improve recovery"),
  define("granary", "Granary", "Civic", "preservation", {planks:20,stone:12}, {}, {}, null, "Adds 100 food capacity per tier and reduces spoilage"),
  define("warehouse", "Warehouse", "Civic", "logistics", {planks:24,stone:16}, {}, {}, null, "Adds 100 capacity per tier to construction materials"),
  define("clinic", "Clinic", "Civic", "medicine", {planks:24,bricks:12}, {food:2,water:2}, {}, null, "A medic heals the three most injured residents each cycle"),
  define("school", "School", "Civic", "education", {planks:24,stone:12}, {food:2}, {}, null, "A teacher trains two other workers, granting productive experience"),
  define("scout_lodge", "Scout lodge", "Frontier", "settlement", {planks:16,stone:10}, {food:2}, {}, null, "Assigned scouts update rival intelligence each cycle"),
  define("trading_post", "Trading post", "Frontier", "logistics", {planks:24,bricks:12}, {planks:5}, {coal:3,metal:1}, null, "Trade timber with travelling merchants for industrial supplies"),
  define("outpost", "Supply outpost", "Frontier", "logistics", {planks:28,stone:20}, {}, {}, null, "A frontier refuge; staff supply passing workers from colony stores"),
  define("watchtower", "Watchtower", "Frontier", "militia", {planks:22,stone:18}, {}, {}, null, "Staffed sentries add raid defense and guard valuable stores"),
  define("barracks", "Barracks", "Frontier", "militia", {planks:24,bricks:12}, {food:2}, {}, null, "Trains armed workers and strengthens camp defense when staffed"),
];

/** Resolves a catalogue entry at its typed boundary. */
export function buildingDefinition(kind: BuildingKind): BuildingDefinition {
  const definition = BUILDINGS.find((entry) => entry.id === kind);
  if (definition === undefined) throw new Error(`Unknown building ${kind}`);
  return definition;
}

/** Returns the construction price for a specific target tier. */
export function buildingCost(kind: BuildingKind, tier: number): Partial<Stock> {
  if (tier === 1) return buildingDefinition(kind).cost;
  return tier === 2 ? {planks:24,bricks:20,metal:8} : {bricks:32,steel:16,parts:8};
}
