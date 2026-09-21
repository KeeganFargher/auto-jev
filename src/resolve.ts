import { heroDefinition } from "./heroes.js";
import { armyStrength, cardStrength, garrisonStrength, lordOf, provinceById } from "./army.js";
import type { Army, BattleOutcome, BattleReport, CampaignState, Lord, Province, UnitCard } from "./types.js";
import { RANK_NAMES } from "./units.js";

/** Advances the campaign PRNG; every resolution is reproducible from the seed. */
export function nextRandom(state: CampaignState): number {
  state.randomState = (Math.imul(state.randomState, 1664525) + 1013904223) >>> 0;
  return state.randomState / 4294967296;
}

export interface BattleSides {
  attacker: Army;
  defender: Army | null;
  defenderFactionId: string;
  province: Province;
  siege: boolean;
}
/**
 * The pre-battle estimate the spectator sees: the attacker's share of total strength. It is only an
 * estimate on purpose — auto-resolve rolls around it, so the favourite genuinely can lose.
 */
export function predict(state: CampaignState, sides: BattleSides): number {
  const defenderCards = sides.defender?.units ?? sides.province.garrison;
  const attack = armyStrength(state, sides.attacker, defenderCards);
  // Holding your own province is worth a real bonus; without it nobody ever defends anything.
  const home = sides.province.ownerId === sides.defenderFactionId ? 1.3 : 1;
  const defend = sides.defender === null
    ? garrisonStrength(state, sides.province) * home
    : armyStrength(state, sides.defender, sides.attacker.units) * home * (sides.siege ? 1 + (sides.province.settlement?.walls ?? 0) / 500 : 1);
  return attack / Math.max(1, attack + defend);
}
export function predictionLabel(share: number): string {
  if (share >= 0.78) return "overwhelming";
  if (share >= 0.6) return "favourable";
  if (share >= 0.42) return "even";
  if (share >= 0.25) return "risky";
  return "disastrous";
}

/** Thins a side's cards by a share of their models, destroying any that run out. Returns models lost. */
function applyLosses(cards: UnitCard[], share: number, random: () => number): number {
  let lost = 0;
  for (const card of [...cards]) {
    // Weaker cards break first, so a army does not lose its best troops evenly across the line.
    const weight = Math.min(0.95, share * (0.6 + random() * 0.9));
    const casualties = Math.min(card.models, Math.round(card.models * weight));
    card.models -= casualties;
    lost += casualties;
    if (card.models <= 0) cards.splice(cards.indexOf(card), 1);
  }
  return lost;
}
/** Survivors of a won battle gain veterancy; ranks cap at Elite. */
function promote(cards: UnitCard[], experience: number): void {
  for (const card of cards) {
    card.experience += experience;
    while (card.rank < RANK_NAMES.length - 1 && card.experience >= (card.rank + 1) * 100) card.rank += 1;
  }
}
/** A lord who loses a battle risks a wound, capture or death rather than simply surviving it. */
export function lordAftermath(state: CampaignState, lord: Lord | undefined, won: boolean, margin: number): string | null {
  if (lord === undefined || lord.condition !== "ready") return null;
  if (won) { lord.battlesWon += 1; lord.experience += 150; return null; }
  lord.battlesLost += 1;
  lord.experience += 55;
  const danger = Math.min(0.75, 0.2 + margin * 0.7);
  const roll = nextRandom(state);
  if (roll > danger) return null;
  const severity = nextRandom(state);
  const name = heroDefinition(lord.heroId).name;
  if (severity < 0.12) { lord.condition = "dead"; return `${name} was killed`; }
  if (severity < 0.26) { lord.condition = "captured"; lord.unavailableUntil = state.turn + 6; return `${name} was captured`; }
  lord.condition = "wounded";
  lord.unavailableUntil = state.turn + 2 + Math.floor(nextRandom(state) * 3);
  return `${name} was wounded`;
}

/**
 * Resolves a battle without the real-time scene. Strength sets the odds, but the roll is wide enough
 * that a favourite loses often enough to be worth watching, and losses scale with how close it was.
 */
export function autoResolve(state: CampaignState, sides: BattleSides): BattleReport {
  const share = predict(state, sides);
  // A wide roll around the prediction. The swing is widest in an even fight and narrows as the odds
  // lengthen, so a close battle is genuinely uncertain while a rout stays a rout.
  const swing = 0.34 + (1 - Math.abs(share - 0.5) * 2) * 0.42;
  const roll = share + (nextRandom(state) - 0.5) * swing;
  const attackerWon = roll > 0.5;
  const margin = Math.min(1, Math.abs(roll - 0.5) * 2);
  const outcome: BattleOutcome = margin < 0.06 ? "draw" : attackerWon ? "attacker" : "defender";
  const random = (): number => nextRandom(state);
  // The loser bleeds; a close battle costs the winner nearly as much.
  const winnerShare = 0.1 + (1 - margin) * 0.3;
  const loserShare = 0.42 + margin * 0.45;
  const attackerCards = sides.attacker.units;
  const defenderCards = sides.defender?.units ?? sides.province.garrison;
  const attackerLosses = applyLosses(attackerCards, outcome === "attacker" ? winnerShare : loserShare, random);
  const defenderLosses = applyLosses(defenderCards, outcome === "defender" ? winnerShare : loserShare, random);
  if (outcome === "attacker") { promote(attackerCards, 90); sides.attacker.morale = Math.min(100, sides.attacker.morale + 15); }
  else if (outcome === "defender") { promote(defenderCards, 90); sides.attacker.morale = Math.max(5, sides.attacker.morale - 35); sides.attacker.shattered = true; }
  if (sides.defender !== null) {
    if (outcome === "defender") sides.defender.morale = Math.min(100, sides.defender.morale + 15);
    else if (outcome === "attacker") { sides.defender.morale = Math.max(5, sides.defender.morale - 35); sides.defender.shattered = true; }
  }
  const attackerLord = lordOf(state, sides.attacker);
  const defenderLord = sides.defender === null ? undefined : lordOf(state, sides.defender);
  const notes = [
    lordAftermath(state, attackerLord, outcome === "attacker", outcome === "attacker" ? 0 : margin),
    lordAftermath(state, defenderLord, outcome === "defender", outcome === "defender" ? 0 : margin),
  ].filter((note): note is string => note !== null);
  if (outcome === "attacker" && attackerLord !== undefined) attackerLord.kills += defenderLosses;
  if (outcome === "defender" && defenderLord !== undefined) defenderLord.kills += attackerLosses;
  state.sequence += 1;
  const upset = share > 0.62 && outcome === "defender" ? " — an upset" : share < 0.38 && outcome === "attacker" ? " — against the odds" : "";
  const nameOf = (id: string): string => state.factions.find((faction) => faction.id === id)?.name ?? "The defenders";
  return {
    id: `battle-${state.sequence}`, turn: state.turn, provinceId: sides.province.id, resolution: "auto",
    attackerId: sides.attacker.factionId, defenderId: sides.defenderFactionId, outcome,
    attackerLosses, defenderLosses, prediction: share,
    summary: `${outcome === "draw" ? "Neither side broke" : `${nameOf(outcome === "attacker" ? sides.attacker.factionId : sides.defenderFactionId)} held the field`} at ${sides.province.name}${upset}${notes.length > 0 ? `. ${notes.join("; ")}` : ""}`,
  };
}

/** Whether a battle is worth dropping the spectator into rather than rolling the dice. */
export function worthWatching(state: CampaignState, sides: BattleSides): boolean {
  const share = predict(state, sides);
  const strength = sides.attacker.units.reduce((sum, card) => sum + cardStrength(card), 0);
  const lords = [lordOf(state, sides.attacker), sides.defender === null ? undefined : lordOf(state, sides.defender)].filter((lord) => lord !== undefined);
  // Close fights, sieges of real settlements, and anything with two lords in it.
  if (share > 0.32 && share < 0.68 && strength > 600) return true;
  if (sides.siege && (sides.province.settlement?.tier ?? 0) >= 2) return true;
  if (lords.length === 2) return true;
  return false;
}
export { provinceById };
