import { MAX_LEVEL, SKILLS, STOCK_KEYS, TECHNOLOGIES, experienceRequired, type SkillId } from "./catalog.js";
import type { ActionKind, Colonist, Position, WorldState } from "./types.js";

export const ORDER_JOB_LIMIT = 8;

export const REPEAT_JOBS = new Set<ActionKind>(["chop_tree", "mine_stone", "mine_ore", "mine_coal", "gather_berries", "fish", "fetch_water", "craft_planks", "smelt_metal", "craft_tools", "craft_weapons"]);
const branches: Partial<Record<ActionKind, NonNullable<WorldState["development"]["branch"]>>> = { choose_agriculture: "agriculture", choose_industry: "industry", choose_frontier: "frontier" };

/** Creates a complete untrained tree, avoiding missing rank values downstream. */
export function emptyTalents(): Record<SkillId, number> {
  // SAFETY: SKILLS defines exactly one entry for every SkillId in the current catalogue.
  return Object.fromEntries(SKILLS.map((skill) => [skill.id, 0])) as Record<SkillId, number>;
}

/** Records a bounded, persistent character or colony milestone history. */
export function remember(history: Array<{ tick: number; text: string }>, tick: number, text: string): void {
  history.push({ tick, text });
  if (history.length > 100) history.shift();
}

/** Offers only earned ranks whose level and prerequisite investments are satisfied. */
export function milestoneChoices(world: WorldState, person: Colonist): Partial<Record<ActionKind, string>> | null {
  if (person.hunger >= 65 || person.thirst >= 65) return null;
  if (person.skillPoints > 0) {
    const choices: Partial<Record<ActionKind, string>> = {};
    for (const skill of SKILLS) {
      if (person.level < skill.level || person.talents[skill.id] >= skill.maxRank || !skill.requires.every((id) => person.talents[id] > 0)) continue;
      choices[`learn_${skill.id}`] = `Invest one skill point in ${skill.name}, rank ${person.talents[skill.id] + 1}/${skill.maxRank}: ${skill.effect}`;
    }
    if (Object.keys(choices).length > 0) return choices;
  }
  if (world.development.technologies.includes("settlement") && world.development.branch === null) return {
    choose_agriculture: "Agriculture identity: +4 food per harvest and 25% faster agriculture research",
    choose_industry: "Industry identity: 3 planks per recipe instead of 2 and 25% faster industry research",
    choose_frontier: "Frontier identity: raiders carry +4 food, take 10 less damage, and frontier research is 25% faster",
  };
  return null;
}

/** Returns the population ceiling unlocked by civic research. */
export function populationLimit(world: Pick<WorldState, "development">): number {
  const known = world.development.technologies;
  return known.includes("citadel") ? 48 : known.includes("township") ? 24 : known.includes("settlement") ? 12 : 8;
}

/** Returns exact costs and destinations for repeatable production and construction. */
export function developmentJob(world: WorldState, rival: WorldState, action: ActionKind): { destination: Position; work: number; cost: Partial<WorldState["stockpile"]> } | null {
  const workshop = world.stations.workshop;
  switch (action) {
    case "build_workshop": return { destination: workshop, work: 140, cost: { wood: 24, stone: 12 } };
    case "craft_planks": return { destination: workshop, work: 70, cost: { wood: 4 } };
    case "smelt_metal": return { destination: workshop, work: 110, cost: { ore: 3, coal: 1, wood: 2 } };
    case "craft_tools": return { destination: workshop, work: 100, cost: { metal: 2, planks: 2 } };
    case "craft_weapons": return { destination: workshop, work: 100, cost: { planks: 3, stone: 3 } };
    case "equip_tool": return { destination: workshop, work: 4, cost: { tools: 1 } };
    case "equip_weapon": return { destination: workshop, work: 4, cost: { weapons: 1 } };
    case "build_defense": return { destination: world.stations.defense, work: 160, cost: { planks: 16, stone: 12 } };
    case "upgrade_home": return { destination: { x: world.camp.x - 2 + world.development.homes % 4, y: world.camp.y + 2 + Math.floor(world.development.homes / 4) }, work: 160, cost: { planks: 16, stone: 8 } };
    case "build_hut": return { destination: { x: world.camp.x - 2 + world.buildings.huts % 4, y: world.camp.y + 2 + Math.floor(world.buildings.huts / 4) }, work: 160, cost: { wood: 30, planks: 8, stone: 12 } };
    case "recruit": return { destination: world.stations.food, work: 100, cost: { food: 16, water: 16, planks: 8 } };
    case "commission_monument": return { destination: world.stations.defense, work: 600, cost: { planks: 60 + world.development.monuments * 20, metal: 30 + world.development.monuments * 10, food: 40, stone: 40 } };
    case "scout": return { destination: rival.stations.food, work: 30, cost: {} };
    case "raid": return { destination: rival.stations.food, work: 50, cost: {} };
    case "guard": return { destination: world.stations.defense, work: 240, cost: {} };
    default: return null;
  }
}

/** Applies an earned skill or identity choice once, recording its lasting consequences. */
export function applyMilestone(world: WorldState, person: Colonist, action: ActionKind): string | null {
  const skill = SKILLS.find((definition) => action === `learn_${definition.id}`);
  if (skill !== undefined) {
    person.skillPoints -= 1;
    person.talents[skill.id] += 1;
    const message = `${person.name} learned ${skill.name} ${person.talents[skill.id]}: ${skill.effect}`;
    remember(person.biography, world.tick, message);
    return message;
  }
  const branch = branches[action];
  if (branch !== undefined) {
    world.development.branch = branch;
    const message = `${world.name} chose the ${branch} path`;
    remember(world.development.history, world.tick, message);
    return message;
  }
  return null;
}

/** Rewards productive work with a rising level curve and separately spendable skill points. */
export function rewardWork(world: WorldState, person: Colonist, action: ActionKind): void {
  if (["eat", "drink", "rest", "plan_farm", "equip_tool", "equip_weapon"].includes(action) || action.startsWith("learn_") || action.startsWith("choose_") || action.startsWith("research_")) return;
  const xp = action === "fetch_water" ? 4 : action === "raid" || action === "work_research" ? 24 : action.startsWith("build_") || action === "recruit" ? 18 : 8;
  if (person.level < MAX_LEVEL) person.experience += Math.round(xp * (world.development.technologies.includes("education") ? 1.2 : 1));
  while (person.level < MAX_LEVEL && person.experience >= experienceRequired(person.level)) {
    person.experience -= experienceRequired(person.level); person.level += 1; person.skillPoints += 1;
    remember(person.biography, world.tick, `Reached level ${person.level}; earned a skill point`);
  }
  world.development.completedWork += 1;
}

/** Lists research projects whose prerequisite technologies are known, without exposing locked actions to Jev. */
export function researchChoices(world: WorldState): Partial<Record<ActionKind, string>> {
  if (world.development.research !== null || !world.development.workshop || world.development.completedWork < 20) return {};
  const choices: Partial<Record<ActionKind, string>> = {};
  for (const tech of TECHNOLOGIES) {
    if (world.development.technologies.includes(tech.id) || !tech.requires.every((id) => world.development.technologies.includes(id))) continue;
    choices[`research_${tech.id}`] = `Plan ${tech.name}: ${tech.effect}. Materials: ${recipeCosts(tech.cost).map(([key, amount]) => `${amount} ${key}`).join(", ")}; ${tech.work} research work. Can plan before materials are gathered.`;
  }
  return choices;
}

/** Lists recipe costs with their stockpile keys intact. */
export function recipeCosts(cost: Partial<WorldState["stockpile"]>): Array<[keyof WorldState["stockpile"], number]> {
  const entries: Array<[keyof WorldState["stockpile"], number]> = [];
  for (const resource of STOCK_KEYS) {
    const amount = cost[resource];
    if (amount !== undefined) entries.push([resource, amount]);
  }
  return entries;
}
