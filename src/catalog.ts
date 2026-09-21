import { BUILDINGS } from "./industry-catalog.js";
import type { ActionKind } from "./types.js";
export const STOCK_KEYS = ["food", "water", "wood", "stone", "planks", "ore", "coal", "metal", "tools", "weapons", "clay", "bricks", "steel", "parts"] as const;
export type StockKey = typeof STOCK_KEYS[number];
export type Stock = Record<StockKey, number>;
export const SKILL_IDS = ["forager", "lumberjack", "prospector", "builder", "artisan", "engineer", "farmer", "botanist", "irrigator", "runner", "pathfinder", "hauler", "metabolism", "hydration", "endurance", "fighter", "shield", "veteran", "medic", "survivor"] as const;
export type SkillId = typeof SKILL_IDS[number];
export interface SkillDefinition {
  id: SkillId; name: string; branch: string; level: number; maxRank: number;
  requires: SkillId[]; effect: string;
}
export const SKILLS: SkillDefinition[] = [
  { id: "forager", name: "Forager", branch: "Gathering", level: 2, maxRank: 3, requires: [], effect: "+15% gathering speed per rank" },
  { id: "lumberjack", name: "Lumberjack", branch: "Gathering", level: 5, maxRank: 3, requires: ["forager"], effect: "+1 wood per chop per rank" },
  { id: "prospector", name: "Prospector", branch: "Gathering", level: 9, maxRank: 3, requires: ["lumberjack"], effect: "+1 ore/coal per mining job per rank" },
  { id: "builder", name: "Builder", branch: "Craft", level: 2, maxRank: 3, requires: [], effect: "+15% construction speed per rank" },
  { id: "artisan", name: "Artisan", branch: "Craft", level: 5, maxRank: 3, requires: ["builder"], effect: "+20% crafting speed per rank" },
  { id: "engineer", name: "Engineer", branch: "Craft", level: 10, maxRank: 3, requires: ["artisan"], effect: "+20% research speed per rank" },
  { id: "farmer", name: "Cultivation", branch: "Farming", level: 2, maxRank: 3, requires: [], effect: "+2 food per hand harvest per rank" },
  { id: "botanist", name: "Botanist", branch: "Farming", level: 6, maxRank: 3, requires: ["farmer"], effect: "+1 berry food per job per rank" },
  { id: "irrigator", name: "Seed keeper", branch: "Farming", level: 10, maxRank: 2, requires: ["botanist"], effect: "Hand-planted crops start 40 growth ticks ahead per rank" },
  { id: "runner", name: "Runner", branch: "Movement", level: 2, maxRank: 3, requires: [], effect: "+15% walking speed per rank" },
  { id: "pathfinder", name: "Pathfinder", branch: "Movement", level: 6, maxRank: 3, requires: ["runner"], effect: "+10% walking speed on scouting/raids per rank" },
  { id: "hauler", name: "Raider's pack", branch: "Movement", level: 10, maxRank: 3, requires: ["pathfinder"], effect: "+4 food carried home from raids per rank" },
  { id: "metabolism", name: "Light eater", branch: "Survival", level: 2, maxRank: 3, requires: [], effect: "Hunger rises 10% slower per rank" },
  { id: "hydration", name: "Water discipline", branch: "Survival", level: 4, maxRank: 3, requires: ["metabolism"], effect: "Thirst rises 10% slower per rank" },
  { id: "endurance", name: "Endurance", branch: "Survival", level: 8, maxRank: 3, requires: ["hydration"], effect: "Fatigue rises 15% slower per rank" },
  { id: "fighter", name: "Spear fighter", branch: "Warrior", level: 2, maxRank: 3, requires: [], effect: "Equipped guards deal +4 damage; equipped raiders bypass 3 defense per rank" },
  { id: "shield", name: "Shield stance", branch: "Warrior", level: 6, maxRank: 3, requires: ["fighter"], effect: "Take 10% less raid damage per rank" },
  { id: "veteran", name: "Veteran retreat", branch: "Warrior", level: 12, maxRank: 1, requires: ["shield"], effect: "Once per 2 days, withdraw from a lethal raid with 10 health and no loot" },
  { id: "medic", name: "Field medic", branch: "Care", level: 5, maxRank: 3, requires: ["metabolism"], effect: "Rest heals +3 health per rank" },
  { id: "survivor", name: "Survivor", branch: "Care", level: 15, maxRank: 2, requires: ["medic", "endurance"], effect: "Starvation/dehydration damage reduced 25% per rank" },
];
export const TECH_IDS = ["settlement", "agronomy", "forestry", "metalworking", "militia", "education", "logistics", "preservation", "irrigation", "mechanization", "township", "large_fields", "medicine", "citadel"] as const;
export type TechId = typeof TECH_IDS[number];
export interface TechDefinition {
  id: TechId; name: string; branch: string; requires: TechId[]; cost: Partial<Stock>; work: number; effect: string;
}
export const TECHNOLOGIES: TechDefinition[] = [
  { id: "settlement", name: "Village charter", branch: "Civic", requires: [], cost: { planks: 12, stone: 12, food: 12 }, work: 300, effect: "Colony level 2; recruit up to 12 people; unlock specialised research" },
  { id: "agronomy", name: "Crop rotation", branch: "Agriculture", requires: ["settlement"], cost: { wood: 30, planks: 16, food: 16 }, work: 360, effect: "+4 food per harvest; up to six fields" },
  { id: "forestry", name: "Managed forestry", branch: "Industry", requires: ["settlement"], cost: { wood: 50, stone: 18 }, work: 360, effect: "+1 wood per chop; regrowth is twice as fast" },
  { id: "metalworking", name: "Metalworking", branch: "Industry", requires: ["settlement"], cost: { stone: 30, planks: 24, wood: 40 }, work: 420, effect: "Mine remote iron and coal; smelt metal; craft tools" },
  { id: "militia", name: "Militia", branch: "Frontier", requires: ["settlement"], cost: { planks: 20, stone: 24, food: 20 }, work: 380, effect: "Craft and equip spears; guards and raiders gain weapon strength" },
  { id: "education", name: "Apprenticeships", branch: "Civic", requires: ["settlement"], cost: { planks: 26, food: 24 }, work: 480, effect: "+20% worker XP from productive jobs" },
  { id: "logistics", name: "Supply depots", branch: "Industry", requires: ["forestry"], cost: { planks: 30, stone: 30 }, work: 500, effect: "+100% material storage; +10% walking speed" },
  { id: "preservation", name: "Granaries", branch: "Agriculture", requires: ["agronomy"], cost: { planks: 32, stone: 24 }, work: 500, effect: "Double food/water storage; food spoilage falls from 12% to 3% per day" },
  { id: "irrigation", name: "Waterworks", branch: "Agriculture", requires: ["agronomy", "metalworking"], cost: { planks: 40, metal: 16, stone: 30 }, work: 650, effect: "Unlock pump houses and staffed field irrigation; tier II pumps run on coal" },
  { id: "mechanization", name: "Powered sawmills", branch: "Industry", requires: ["forestry", "metalworking"], cost: { planks: 40, metal: 24, stone: 30 }, work: 650, effect: "Unlock sawmills; tier II automates wood → planks using coal" },
  { id: "township", name: "Town charter", branch: "Civic", requires: ["settlement", "education", "metalworking"], cost: { planks: 60, metal: 30, stone: 40, food: 40 }, work: 900, effect: "Colony level 3; recruit up to 24 people; unlock larger farms" },
  { id: "large_fields", name: "Terraced fields", branch: "Agriculture", requires: ["township", "agronomy"], cost: { planks: 45, metal: 18, stone: 45 }, work: 800, effect: "Expand fields from 3×3 to 5×5, doubling base harvest yield" },
  { id: "medicine", name: "Infirmary practice", branch: "Civic", requires: ["education"], cost: { food: 40, water: 40, planks: 30 }, work: 600, effect: "Rest restores 8 extra health; supports safer long expeditions" },
  { id: "citadel", name: "Regional capital", branch: "Frontier", requires: ["township", "mechanization", "militia"], cost: { planks: 120, metal: 80, stone: 60, food: 60 }, work: 1400, effect: "Colony level 4; up to 32 people; commission escalating civic monuments" },
];
export const MAX_LEVEL = 30;
/** Makes later character levels cost progressively more productive work. */
export function experienceRequired(level: number): number { return 100 + level * 50 + level * level * 8; }
export const CATALOG = { buildings: BUILDINGS, skills: SKILLS, technologies: TECHNOLOGIES, maxLevel: MAX_LEVEL, stockKeys: STOCK_KEYS, levelCosts: Array.from({ length: MAX_LEVEL }, (_, index) => experienceRequired(index + 1)) };

export const BASE_ACTIONS = ["construct_building", "work_building", "mine_clay","drink", "eat", "rest", "fetch_water", "gather_berries", "chop_tree", "mine_stone", "build_hut", "plan_farm", "build_farm", "plant_crops", "harvest_crops", "fish", "craft_planks", "build_workshop", "build_defense", "upgrade_home", "scout", "raid", "guard", "choose_agriculture", "choose_industry", "choose_frontier", "work_research", "mine_ore", "mine_coal", "smelt_metal", "craft_tools", "equip_tool", "craft_weapons", "equip_weapon", "recruit", "expand_farm", "commission_monument"] as const;
const actionIds = new Set<string>([...BASE_ACTIONS, ...SKILL_IDS.map((id) => `learn_${id}`), ...TECH_IDS.map((id) => `research_${id}`)]);
/** Validates only actions implemented by the current simulation. */
export function isActionKind(value: string): value is ActionKind { return actionIds.has(value); }
