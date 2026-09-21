import { buildingTiers } from "./industry.js";
import { type Stock, type StockKey } from "./catalog.js";
import type { ActionKind, Colonist, WorldState } from "./types.js";

/** Returns visible storage limits; research expands capacity instead of allowing endless piles. */
export function storageLimits(world: Pick<WorldState, "development" | "buildings" | "structures">): Stock {
  const depots = world.development.technologies.includes("logistics") ? 2 : 1;
  const granary = world.development.technologies.includes("preservation") ? 2 : 1;
  const extra=buildingTiers(world,"warehouse")*100;
  return { food: (80 + world.buildings.huts * 24) * granary + buildingTiers(world,"granary")*100, water: (80 + world.buildings.huts * 24) * granary, wood: 220 * depots + extra, stone: 140 * depots + extra, planks: 150 * depots + extra, ore: 100 * depots + extra, coal: 100 * depots + extra, metal: 100 * depots + extra, tools: 16, weapons: 32, clay: 120 + extra, bricks: 160 + extra, steel: 100 + extra, parts: 60 + extra };
}

/** Computes the real output of a worker job, including learned and researched bonuses. */
export function jobOutput(world: WorldState, person: Colonist, action: ActionKind): { resource: StockKey; amount: number } | null {
  switch (action) {
    case "gather_berries": return { resource: "food", amount: 3 + person.talents.botanist };
    case "raid": {
      if(person.task?.action!=="raid"||person.task.cargo===undefined)return null;
      if(person.task.cargoKind===undefined)throw new Error("Raid cargo has no resource kind");
      return {resource:person.task.cargoKind,amount:person.task.cargo};
    }
    case "fish": return { resource: "food", amount: 3 };
    case "fetch_water": return { resource: "water", amount: 5 };
    case "chop_tree": return { resource: "wood", amount: 4 + person.talents.lumberjack + Number(world.development.technologies.includes("forestry")) };
    case "mine_clay": return { resource: "clay", amount: 4 };
    case "mine_stone": return { resource: "stone", amount: 3 };
    case "mine_ore": return { resource: "ore", amount: 3 + person.talents.prospector };
    case "mine_coal": return { resource: "coal", amount: 3 + person.talents.prospector };
    case "craft_planks": return { resource: "planks", amount: world.development.branch === "industry" ? 3 : 2 };
    case "smelt_metal": return { resource: "metal", amount: 2 };
    case "craft_tools": return { resource: "tools", amount: 1 };
    case "craft_weapons": return { resource: "weapons", amount: 1 };
    case "harvest_crops": {
      const farm = world.farms.find((field) => field.id === person.task?.targetId);
      return { resource: "food", amount: (farm !== undefined && farm.radius === 2 ? 28 : 14) + person.talents.farmer * 2 + (world.development.technologies.includes("agronomy") ? 4 : 0) + (world.development.branch === "agriculture" ? 4 : 0) };
    }
    default: return null;
  }
}

/** Includes in-progress output so simultaneous jobs do not overbook storage. */
export function storageRoom(world: WorldState, resource: StockKey): number {
  const incoming = world.colonists.reduce((sum, person) => {
    if (person.task === null || person.health <= 0) return sum;
    const output = jobOutput(world, person, person.task.action);
    const packed = (resource === "food" || resource === "water") && person.task.supplies?.[resource] ? 4 : 0;
    return sum + packed + (output?.resource === resource ? output.amount : 0);
  }, 0);
  return Math.max(0, storageLimits(world)[resource] - world.stockpile[resource] - incoming);
}

/** Runs fuelled machines and upkeep on simulation time, with explicit costs and stopped inputs. */
export function runEconomy(world: WorldState): string[] {
  const events: string[] = [];
  if (world.tick % 120 === 0) {
    const meals = world.colonists.filter((person) => person.health > 0 && person.task?.action === "eat").length * 4;
    const spoilRate = world.development.technologies.includes("preservation") || buildingTiers(world,"granary")>0 ? 0.0075 : 0.03;
    const spoilage = Math.min(Math.max(0, world.stockpile.food - meals), Math.floor(world.stockpile.food * spoilRate));
    world.stockpile.food -= spoilage;
    const fuel = Math.min(world.stockpile.wood, world.buildings.huts);
    world.stockpile.wood -= fuel;
  }
  return events;
}

/** Starts every stored resource at a defined value. */
export function startingStock(): Stock {
  return { food: 64, water: 64, wood: 20, stone: 8, planks: 0, ore: 0, coal: 0, metal: 0, tools: 0, weapons: 0, clay: 0, bricks: 0, steel: 0, parts: 0 };
}
