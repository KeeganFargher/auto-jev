import { TECHNOLOGIES } from "./catalog.js";
import { populationLimit, recipeCosts } from "./development.js";
import { storageLimits } from "./economy.js";
import type { Farm, Position, WorldState } from "./types.js";

export const FARM_WOOD = 24;
export const FARM_STONE = 8;
export const FARM_WORK = 160;
export const CROP_GROWTH_TICKS = 360;
export const HARVEST_FOOD = 14;

/** Returns every occupied tile in a three-by-three farm or construction site. */
export function farmTiles(farm: Position & { radius: number }): Position[] {
  const offsets = Array.from({ length: farm.radius * 2 + 1 }, (_, index) => index - farm.radius);
  return offsets.flatMap((x) => offsets.map((y) => ({ x: farm.x + x, y: farm.y + y })));
}

/** Finds a clear farm footprint beside camp without building over people or existing props. */
export function nextFarmSite(world: WorldState): Position | null {
  for (const dx of [7, -7]) {
    for (const dy of [-6, 0, 6]) {
      const site = { x: world.camp.x + dx, y: world.camp.y + dy };
      const tiles = farmTiles({ ...site, radius: 1 });
      const occupied = tiles.some((tile) =>
        tile.x < 0 || tile.y < 0 || tile.x >= world.width || tile.y >= world.height ||
        ["w","m"].includes(world.terrain.tiles.charAt(tile.y*world.width+tile.x)) ||
        world.structures.some(b=>Math.abs(b.x-tile.x)<=2&&Math.abs(b.y-tile.y)<=2) ||
        world.resources.some((resource) => resource.x === tile.x && resource.y === tile.y) ||
        world.colonists.some((person) => person.health > 0 && person.x === tile.x && person.y === tile.y) ||
        world.farms.some((farm) => Math.abs(tile.x - farm.x) <= farm.radius && Math.abs(tile.y - farm.y) <= farm.radius));
      if (!occupied) return site;
    }
  }
  return null;
}

/** Summarises real project and crop state for Jev's decision inputs. */
export function settlementSummary(world: WorldState) {
  const { history: _history, ...development } = world.development;
  const research = world.development.research;
  const definition = research === null ? undefined : TECHNOLOGIES.find((tech) => tech.id === research.id);
  return {
    strategy: world.strategy,
    capacity: storageLimits(world),
    populationLimit: populationLimit(world),
    nextRecruitInTicks: Math.max(0, world.development.nextRecruitAt - world.tick),
    upkeep: "Meals and drinks use 4 stock each; food spoils; houses burn wood; powered machines burn coal. Full stores cannot accept gathering jobs.",
    researchGoal: definition === undefined || research === null ? null : { name: definition.name, effect: definition.effect, missingMaterials: research.funded ? [] : recipeCosts(definition.cost).filter(([key, amount]) => world.stockpile[key] < amount).map(([key, amount]) => ({ resource: key, needed: amount - world.stockpile[key] })), progress: research.workDone / research.totalWork },
    colony: world.name,
    development,
    planks: world.stockpile.planks,
    rivalReport: world.intel,
    raiding: world.raids,
    stage: world.progression.stage,
    harvests: world.progression.harvests,
    farms: {
      fallow: world.farms.filter((farm) => farm.stage === "fallow").length,
      growing: world.farms.filter((farm) => farm.stage === "growing").length,
      ripe: world.farms.filter((farm) => farm.stage === "ripe").length,
    },
    project: world.project === null ? null : {
      goal: "Establish a renewable food supply",
      phase: world.project.funded ? "construction" : "gathering materials",
      woodNeeded: world.project.funded ? 0 : Math.max(0, FARM_WOOD - world.stockpile.wood),
      stoneNeeded: world.project.funded ? 0 : Math.max(0, FARM_STONE - world.stockpile.stone),
      progress: Math.round(world.project.workDone / world.project.totalWork * 100),
    },
  };
}

/** Advances renewable resources and crops on simulation time, never while Jev is paused. */
export function growFood(world: WorldState): string[] {
  const events: string[] = [];
  for (const resource of world.resources) {
    if (resource.regrowAt === null || world.tick < resource.regrowAt) continue;
    resource.amount = resource.kind === "tree" ? 4 : 3;
    resource.regrowAt = null;
  }
  for (const farm of world.farms) {
    if (farm.stage !== "growing") continue;
    farm.growth = Math.min(CROP_GROWTH_TICKS, farm.growth + (world.incident?.kind==="drought"&&!world.incident.resolved&&world.incident.choice!=="irrigate"?.5:1));
    if (farm.growth < CROP_GROWTH_TICKS) continue;
    farm.stage = "ripe";
    events.push(`${farm.id.replaceAll("-", " ")} is ready to harvest (+${HARVEST_FOOD} food)`);
  }
  return events;
}

/** Creates the finished field after workers complete the shared construction project. */
export function finishFarm(world: WorldState): Farm {
  const project = world.project;
  if (project === null) throw new Error("Cannot complete a farm without a construction project");
  const farm: Farm = { id: project.id, x: project.x, y: project.y, stage: "fallow", growth: 0, radius: project.radius };
  world.farms.push(farm);
  world.project = null;
  return farm;
}
