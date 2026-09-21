import { OfflineDecisionEngine } from "./jev.js";
import { armyModels, armyStrength, provinceIncome } from "./army.js";
import { heroDefinition } from "./heroes.js";
import { createCampaign } from "./match.js";
import { resolveTurn, type TurnEvent } from "./turn.js";

/** Fast-forwards a whole campaign with the offline stub so pacing can be checked without a commander. */
const seed = Number(process.argv[2] ?? 1);
const maxTurns = Number(process.argv[3] ?? 60);
const threshold = Number(process.argv[4] ?? 40);
const state = createCampaign(seed);
const engines = new Map(state.factions.map((faction, index) => [faction.id, new OfflineDecisionEngine(seed * 31 + index, 0)]));
const events: TurnEvent[] = [];
const publish = (event: TurnEvent): void => {
  events.push(event);
  if (event.importance >= threshold) console.log(`  T${String(event.turn).padStart(2)} [${String(event.importance).padStart(3)}] ${event.text}`);
};
const started = performance.now();
console.log(`Campaign ${seed}: ${state.provinces.length} provinces, modifier ${state.modifier}`);
for (const faction of state.factions) console.log(`  ${faction.name.padEnd(11)} ${heroDefinition(faction.lords[0]!.heroId).name}`);
console.log("");
for (let turn = 0; turn < maxTurns; turn++) {
  await resolveTurn(state, engines, publish);
  if (state.status.state === "finished") break;
}
console.log(`\n=== turn ${state.turn} · ${state.status.state} · ${state.status.reason} · ${Math.round(performance.now() - started)}ms ===`);
for (const faction of state.factions) {
  const owned = state.provinces.filter((province) => province.ownerId === faction.id);
  const armies = state.armies.filter((army) => army.factionId === faction.id);
  const lord = faction.lords[0];
  console.log(`${faction.name.padEnd(11)} ${faction.eliminated ? "FALLEN  " : "alive   "} gold=${Math.round(faction.gold)} (+${faction.income}/-${faction.upkeep}) provinces=${owned.length} armies=${armies.length} models=${armies.reduce((sum, army) => sum + armyModels(army), 0)} strength=${Math.round(armies.reduce((sum, army) => sum + armyStrength(state, army), 0))}`);
  console.log(`            ${lord === undefined ? "no lord" : `${heroDefinition(lord.heroId).name} L${lord.level} ${lord.condition} (${lord.battlesWon}W/${lord.battlesLost}L, ${lord.kills} kills)`}`);
  console.log(`            holds: ${owned.map((province) => `${province.name}[${province.kind} ${provinceIncome(province)}g${(province.settlement?.buildings.length ?? 0) > 0 ? ` ${province.settlement?.buildings.join("+")}` : ""}]`).join(", ") || "nothing"}`);
}
const battles = state.battles;
const upsets = battles.filter((battle) => (battle.prediction > 0.62 && battle.outcome === "defender") || (battle.prediction < 0.38 && battle.outcome === "attacker"));
console.log(`battles=${battles.length} upsets=${upsets.length} events=${events.length} captures=${events.filter((event) => event.type === "capture").length}`);
