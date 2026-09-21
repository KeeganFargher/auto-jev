import type { Modifiers } from "./progression.js";

export const DOCTRINE_IDS = [
  "drill", "masonry", "sharp_blades", "fletching", "efficient_training", "scouts",
  "war_drums", "repair_crews", "blood_price", "veteran_command", "field_medicine", "defensive_formation",
  "conscription", "retribution", "momentum", "salvagers", "last_stand",
  "red_standard", "citadel", "war_economy", "old_guard",
] as const;
export type DoctrineId = (typeof DOCTRINE_IDS)[number];
export type Rarity = "common" | "uncommon" | "rare" | "legendary";
export type DoctrineCategory = "military" | "defence" | "economy" | "mobility" | "hero" | "weird";
export interface DoctrineDefinition {
  id: DoctrineId; name: string; rarity: Rarity; category: DoctrineCategory; maxStacks: number;
  /** What one stack does to the faction's modifier bag; stacks multiply. */
  modifiers: Partial<Modifiers>;
  effect: string; synergy: string;
}
const define = (id: DoctrineId, name: string, rarity: Rarity, category: DoctrineCategory, maxStacks: number, modifiers: Partial<Modifiers>, effect: string, synergy: string): DoctrineDefinition =>
  ({ id, name, rarity, category, maxStacks, modifiers, effect, synergy });
export const DOCTRINES: DoctrineDefinition[] = [
  define("drill", "Drill", "common", "military", 3, { armyStrength: 1.07 }, "Endless drill. Every stack makes this faction's soldiers fight 7% harder.", "Compounds with Sharp Blades and Last Stand."),
  define("masonry", "Masonry", "common", "defence", 3, { garrison: 1.12 }, "Thicker walls. Garrisons hold 12% harder per stack.", "Fortress build with Repair Crews and Citadel."),
  define("sharp_blades", "Sharp Blades", "common", "military", 3, { armyStrength: 1.08 }, "Better steel. Armies hit 8% harder per stack.", "Cheap infantry swarms suddenly bite."),
  define("fletching", "Fletching", "common", "military", 2, { armyStrength: 1.06 }, "Better arrows and longer draws. Armies hit 6% harder per stack.", "Archers behind a watchtower become hard to approach."),
  define("efficient_training", "Efficient Training", "common", "economy", 2, { recruitCost: 0.85 }, "Drill sergeants, not tutors. Recruits cost 15% less per stack.", "Stacks with Conscription for very cheap armies."),
  define("scouts", "Scouts", "common", "mobility", 2, { movement: 1.15 }, "Outriders ahead of the column. Armies march 15% farther per stack.", "Raids arrive before the defender can react."),
  define("war_drums", "War Drums", "uncommon", "military", 5, { armyStrength: 1.05 }, "Drums keep the line moving. Armies hit 5% harder per stack, to five stacks.", "Absurd at high stacks with Red Standard."),
  define("repair_crews", "Repair Crews", "uncommon", "defence", 1, { garrison: 1.2 }, "Masons follow the army. Garrisons hold 20% harder and walls come back faster.", "Keeps a Citadel standing."),
  define("blood_price", "Blood Price", "uncommon", "economy", 1, { upkeep: 0.85 }, "War pays for war. Army upkeep falls 15%.", "Lets a poor faction keep a big host."),
  define("veteran_command", "Veteran Command", "uncommon", "hero", 1, { lordPower: 1.25 }, "The Jev is always where the line bends. Lord power up 25%.", "Pairs with Old Guard and relic-heavy Jevs."),
  define("field_medicine", "Field Medicine", "uncommon", "military", 1, { replenish: 1.5 }, "Surgeons, not gravediggers. Armies refill half again as fast.", "Attrition wars turn in your favour."),
  define("defensive_formation", "Defensive Formation", "uncommon", "defence", 1, { garrison: 1.25 }, "Shields locked at the gate. Garrisons hold 25% harder.", "Home ground becomes very expensive to take."),
  define("conscription", "Conscription", "rare", "economy", 2, { recruitCost: 0.7, armyStrength: 0.92 }, "Everyone marches. Recruits cost 30% less but armies are 8% weaker per stack.", "Swarm core with War Drums and Blood Price."),
  define("retribution", "Retribution", "rare", "defence", 1, { garrison: 1.35 }, "A wounded garrison fights hardest. Garrisons hold 35% harder.", "Fortress core with Masonry and Citadel."),
  define("momentum", "Momentum", "rare", "mobility", 1, { movement: 1.3 }, "Never let them regroup. Armies march 30% farther.", "Chain captures before the enemy can answer."),
  define("salvagers", "Salvagers", "rare", "economy", 1, { income: 1.15 }, "Nothing is left on the field. Provinces yield 15% more gold.", "Sieges pay for themselves."),
  define("last_stand", "Last Stand", "rare", "military", 1, { armyStrength: 1.15 }, "Outnumbered and unbothered. Armies hit 15% harder.", "Small elite hosts against swarms."),
  define("red_standard", "Red Standard", "legendary", "weird", 1, { armyStrength: 1.25, upkeep: 1.15 }, "The banner that never falls. Armies hit 25% harder and cost 15% more to keep.", "Fanatical, and expensive."),
  define("citadel", "Citadel", "legendary", "defence", 1, { garrison: 1.6 }, "The walls are the faction. Garrisons hold 60% harder.", "Sieges stall for ever alongside Masonry."),
  define("war_economy", "War Economy", "legendary", "weird", 1, { income: 1.4, upkeep: 1.25 }, "Everything feeds the war. Provinces yield 40% more, armies cost 25% more.", "A faction that must keep winning to eat."),
  define("old_guard", "Old Guard", "legendary", "hero", 1, { lordPower: 1.35, replenish: 1.2 }, "The survivors teach the recruits. Lord power up 35% and armies refill faster.", "Deaths make the army stronger."),
];
/** Resolves a doctrine definition at its typed boundary. */
export function doctrineDefinition(id: DoctrineId): DoctrineDefinition {
  const definition = DOCTRINES.find((entry) => entry.id === id);
  if (definition === undefined) throw new Error(`Unknown doctrine ${id}`);
  return definition;
}
export const RARITY_WEIGHTS: Record<Rarity, number> = { common: 60, uncommon: 28, rare: 10, legendary: 2 };
export const isDoctrineId = (value: string): value is DoctrineId => (DOCTRINE_IDS as readonly string[]).includes(value);
