import { heroDefinition } from "./heroes.js";
import { buildingDefinition } from "./buildings.js";
import type { Army, CampaignFaction, CampaignState, Lord, Province, UnitCard, UnitId } from "./types.js";
import { rankBonus, unitDefinition, UNITS } from "./units.js";
import { modifiersFor } from "./progression.js";

export const MOVEMENT_PER_TURN = 34;

export function provinceById(state: CampaignState, id: string): Province | undefined { return state.provinces.find((province) => province.id === id); }
export function factionById(state: CampaignState, id: string): CampaignFaction | undefined { return state.factions.find((faction) => faction.id === id); }
export function armyById(state: CampaignState, id: string): Army | undefined { return state.armies.find((army) => army.id === id); }
export function lordOf(state: CampaignState, army: Army): Lord | undefined {
  for (const faction of state.factions) { const lord = faction.lords.find((entry) => entry.id === army.lordId); if (lord !== undefined) return lord; }
  return undefined;
}

/** A card's fighting weight, folding in how thin it has been worn and how long it has survived. */
export function cardStrength(card: UnitCard): number {
  const unit = unitDefinition(card.unitId);
  return card.models * (unit.health * 0.06 + unit.damage) * (1 + unit.armour * 0.04) * rankBonus(card.rank);
}
/**
 * Army strength, including the bonus each card earns against what the enemy actually brought.
 * Composition therefore decides fights, not just gold spent, which is what makes counters readable.
 */
export function armyStrength(state: CampaignState, army: Army, against: UnitCard[] = []): number {
  const enemyWeight = new Map<string, number>();
  let enemyTotal = 0;
  for (const card of against) {
    const unit = unitDefinition(card.unitId);
    const weight = cardStrength(card);
    enemyWeight.set(unit.category, (enemyWeight.get(unit.category) ?? 0) + weight);
    enemyTotal += weight;
  }
  let total = 0;
  for (const card of army.units) {
    const unit = unitDefinition(card.unitId);
    let value = cardStrength(card);
    if (enemyTotal > 0) {
      const share = unit.strongAgainst.reduce((sum, category) => sum + (enemyWeight.get(category) ?? 0), 0) / enemyTotal;
      value *= 1 + share * 0.5;
    }
    total += value;
  }
  const lord = lordOf(state, army);
  const faction = factionById(state, army.factionId);
  const build = faction === undefined ? undefined : modifiersFor(faction, lord);
  if (lord !== undefined && lord.condition === "ready") {
    const hero = heroDefinition(lord.heroId);
    total += (hero.stats.health * 0.3 + hero.stats.damage * 6) * (1 + lord.level * 0.12) * (build?.lordPower ?? 1);
  }
  return total * (build?.armyStrength ?? 1) * (0.75 + army.morale / 400);
}
export function armyModels(army: Army): number { return army.units.reduce((sum, card) => sum + card.models, 0); }
export function armyUpkeep(army: Army): number { return army.units.reduce((sum, card) => sum + unitDefinition(card.unitId).upkeep, 0); }

/** Every unit the faction may currently recruit, given its buildings and the territory it holds. */
export function recruitable(state: CampaignState, faction: CampaignFaction): UnitId[] {
  const owned = state.provinces.filter((province) => province.ownerId === faction.id);
  const buildings = new Set(owned.flatMap((province) => province.settlement?.buildings ?? []));
  const unlocked = new Set(owned.flatMap((province) => province.unlocks));
  const tier = Math.max(0, ...owned.map((province) => province.settlement?.tier ?? 0));
  return UNITS.filter((unit) => {
    if (unit.tier > tier) return false;
    // Ground that unlocks a unit stands in for its building: a shrine is an arcane tower.
    if (unit.requires !== null && !buildings.has(unit.requires) && !unlocked.has(unit.id)) return false;
    if (unit.territory && !unlocked.has(unit.id)) return false;
    return true;
  }).map((unit) => unit.id);
}
export function makeCard(state: CampaignState, unitId: UnitId): UnitCard {
  const unit = unitDefinition(unitId);
  state.sequence += 1;
  return { id: `card-${state.sequence}`, unitId, models: unit.models, maxModels: unit.models, experience: 0, rank: 0 };
}
/** How many cards a settlement should keep under arms; buildings pay for a larger standing garrison. */
export function garrisonTarget(province: Province): number {
  if (province.settlement === null) return 0;
  return province.settlement.tier + province.settlement.buildings.length;
}
/** Garrison strength standing in for a province with no army in it. Buildings and walls multiply it. */
export function garrisonStrength(state: CampaignState, province: Province): number {
  if (province.settlement === null) return 0;
  const defence = province.settlement.buildings.reduce((product, id) => product * buildingDefinition(id).defence, 1);
  const base = province.garrison.reduce((sum, card) => sum + cardStrength(card), 0);
  const owner = province.ownerId === null ? undefined : factionById(state, province.ownerId);
  const build = owner === undefined ? 1 : modifiersFor(owner, owner.lords.find((lord) => lord.condition !== "dead")).garrison;
  return (base + province.settlement.tier * 200) * defence * (1 + province.settlement.walls / 420) * build;
}
/**
 * Rebuilds a settlement's garrison a card at a time. Without this an army that survives a few turns
 * outscales every province on the map and the campaign stops being a contest.
 */
export function garrisonTick(state: CampaignState, province: Province): void {
  if (province.settlement === null || province.ownerId === null) return;
  const settlement = province.settlement;
  settlement.walls = Math.min(settlement.maxWalls, settlement.walls + Math.round(settlement.maxWalls * 0.08));
  for (const card of province.garrison) if (card.models < card.maxModels) card.models = Math.min(card.maxModels, card.models + 2);
  if (province.garrison.length >= garrisonTarget(province)) return;
  const buildings = new Set(settlement.buildings);
  const unit = buildings.has("forge") ? "shieldguard" : buildings.has("range") ? "archers" : buildings.has("barracks") ? "spearmen" : "militia";
  province.garrison.push(makeCard(state, unit));
}
/** Provincial income after buildings; a settlement pays for itself and then some. */
export function provinceIncome(province: Province): number {
  const buildings = province.settlement?.buildings ?? [];
  return province.income + buildings.reduce((sum, id) => sum + buildingDefinition(id).income, 0);
}

/** Armies sitting in friendly territory refill their thinned cards; a farm speeds it up. */
export function replenish(state: CampaignState, army: Army): void {
  const province = provinceById(state, army.provinceId);
  if (province === undefined || province.ownerId !== army.factionId) return;
  const faction = factionById(state, army.factionId);
  const build = faction === undefined ? 1 : modifiersFor(faction, lordOf(state, army)).replenish;
  // A fortified host recovers much faster than one merely standing about, and a raiding one not at all.
  const stance = army.stance === "fortify" ? 1.5 : army.stance === "raid" ? 0 : 1;
  const rate = ((province.settlement?.buildings.includes("farm") ?? false) ? 0.22 : 0.12) * build * stance;
  for (const card of army.units) {
    if (card.models >= card.maxModels) continue;
    card.models = Math.min(card.maxModels, card.models + Math.max(1, Math.round(card.maxModels * rate)));
  }
  army.morale = Math.min(100, army.morale + 12);
  if (army.morale >= 70) army.shattered = false;
}
