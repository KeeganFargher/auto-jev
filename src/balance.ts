import { OfflineDecisionEngine } from "./jev.js";
import { createCampaign } from "./match.js";
import { resolveTurn, type TurnEvent } from "./turn.js";

/**
 * Runs many campaigns headlessly and reports the numbers that decide whether the game is worth
 * watching: how long runs last, how often the favourite loses, and whether any faction is favoured.
 */

const runs = Number(process.argv[2] ?? 40);
const maxTurns = Number(process.argv[3] ?? 80);
const lengths: number[] = []; const battleCounts: number[] = []; const winners = new Map<string, number>();
let upsets = 0, battles = 0, attackerWins = 0, draws = 0, unfinished = 0, earlyOut = 0, lordDeaths = 0, sieges = 0;
const leadShare: number[] = [];
for (let seed = 1; seed <= runs; seed++) {
  const state = createCampaign(seed);
  const engines = new Map(state.factions.map((faction, index) => [faction.id, new OfflineDecisionEngine(seed * 31 + index, 0)]));
  const events: TurnEvent[] = [];
  for (let turn = 0; turn < maxTurns; turn++) {
    await resolveTurn(state, engines, (event) => events.push(event));
    if (state.status.state === "finished") break;
    // How lopsided is it halfway through? A good match is still contested at the midpoint.
    if (state.turn === 12) {
      const counts = state.factions.map((faction) => state.provinces.filter((province) => province.ownerId === faction.id).length);
      leadShare.push(Math.max(...counts) / Math.max(1, counts.reduce((a, b) => a + b, 0)));
    }
  }
  if (state.status.state !== "finished") unfinished++;
  lengths.push(state.turn);
  battleCounts.push(state.battles.length);
  winners.set(state.status.winnerId ?? "none", (winners.get(state.status.winnerId ?? "none") ?? 0) + 1);
  for (const battle of state.battles) {
    battles++;
    if (battle.outcome === "attacker") attackerWins++;
    if (battle.outcome === "draw") draws++;
    if ((battle.prediction > 0.62 && battle.outcome === "defender") || (battle.prediction < 0.38 && battle.outcome === "attacker")) upsets++;
  }
  const firstOut = events.find((event) => event.type === "eliminated");
  if (firstOut !== undefined && firstOut.turn < 12) earlyOut++;
  lordDeaths += events.filter((event) => event.text.includes("was killed")).length;
  sieges += events.filter((event) => event.type === "capture").length;
}
const mean = (values: number[]): string => (values.reduce((a, b) => a + b, 0) / Math.max(1, values.length)).toFixed(1);
console.log(`runs=${runs} turns mean=${mean(lengths)} min=${Math.min(...lengths)} max=${Math.max(...lengths)} unfinished=${unfinished}`);
console.log(`battles/match=${mean(battleCounts)} attackerWin=${(attackerWins / battles * 100).toFixed(0)}% draws=${(draws / battles * 100).toFixed(0)}% upsets=${(upsets / battles * 100).toFixed(0)}%`);
console.log(`captures/match=${(sieges / runs).toFixed(1)} lordDeaths/match=${(lordDeaths / runs).toFixed(2)} earlyElimination=${(earlyOut / runs * 100).toFixed(0)}%`);
console.log(`leader share of provinces at turn 12: ${mean(leadShare.map((value) => value * 100))}%`);
console.log(`winners: ${[...winners].map(([id, count]) => `${id}=${count}`).join(" ")}`);
