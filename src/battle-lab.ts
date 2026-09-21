import { createBattle, battleTick, runBattle, FIELD_DEPTH, type BattleState, type Fighter } from "./battle.js";
import { createCampaign } from "./match.js";
import { lordOf } from "./army.js";
import { unitDefinition } from "./units.js";
import type { UnitCard, UnitId } from "./types.js";

/**
 * The battle bench. Everything here answers a question about how a fight actually behaves that you
 * cannot answer by reading the code: does a line stay a line, does one man fight one man, do the
 * counters counter, and — the one that matters most — does the side an army is deployed on change
 * who wins. Re-run it after touching anything in battle.ts.
 *
 *   npx tsx src/battle-lab.ts           all of it
 *   npx tsx src/battle-lab.ts shape     just the formation and melee-quality numbers
 */

const card = (unitId: UnitId, id: string): UnitCard =>
  ({ id, unitId, models: unitDefinition(unitId).models, rank: 0, experience: 0 }) as UnitCard;
function build(spec: Array<[UnitId, number]>, tag: string): UnitCard[] {
  const out: UnitCard[] = [];
  let n = 0;
  for (const [id, count] of spec) for (let index = 0; index < count; index++) out.push(card(id, `${tag}-${n++}`));
  return out;
}
const isRanged = (fighter: Fighter): boolean => ["ranged", "mage", "siege"].includes(unitDefinition(fighter.unitId).category);

/** Sets up one battle between two given army lists on neutral ground. */
function stage(attacker: Array<[UnitId, number]>, defender: Array<[UnitId, number]>, seed: number, lords: boolean): BattleState {
  const state = createCampaign(seed);
  const province = state.provinces[0];
  const left = state.armies[0], right = state.armies[1];
  if (province === undefined || left === undefined || right === undefined) throw new Error("campaign has no battle to stage");
  left.units = build(attacker, "a");
  right.units = build(defender, "d");
  province.ownerId = null;
  const la = lordOf(state, left), ld = lordOf(state, right);
  if (la !== undefined && ld !== undefined && !lords) { la.condition = "dead"; ld.condition = "dead"; }
  return createBattle(state, { attacker: left, defender: right, defenderFactionId: right.factionId, province, siege: false });
}

const MIXED_A: Array<[UnitId, number]> = [["spearmen", 2], ["swordsmen", 2], ["archers", 2], ["light_cavalry", 2], ["shieldguard", 1]];
const MIXED_B: Array<[UnitId, number]> = [["spearmen", 2], ["great_weapons", 1], ["crossbowmen", 2], ["heavy_cavalry", 1], ["militia", 2], ["ogre", 1]];

/** How the fight is shaped over its length: cohesion, interpenetration, and whether melee is duels. */
function shape(): void {
  const battle = stage(MIXED_A, MIXED_B, 7, true);
  const started = battle.fighters.length;
  let firstMelee = -1, firstShot = -1, mutual = 0, mutualOf = 0, charges = 0, volleys = 0, pileSum = 0, pileOf = 0, maxPile = 0;
  console.log("  tick alive melee  cohesion  worst  mixed%  attY  defY");
  while (battle.phase === "fighting" && battle.tick < 2400) {
    battleTick(battle);
    const alive = battle.fighters.filter((f) => f.state !== "dead" && f.state !== "routing");
    const byId = new Map(alive.map((f) => [f.id, f]));
    const melee = alive.filter((f) => !isRanged(f));
    if (firstMelee < 0 && melee.some((f) => f.state === "fighting" && f.lordId === null)) firstMelee = battle.tick;
    for (const fighter of alive) {
      if (fighter.effects.chargeAt === battle.tick) charges += 1;
      if (isRanged(fighter) && fighter.effects.strikeAt === battle.tick) {
        if (firstShot < 0) firstShot = battle.tick;
        if (firstMelee < 0) volleys += 1;
      }
    }
    if (battle.tick % 10 === 0) {
      for (const fighter of melee) {
        if (fighter.state !== "fighting") continue;
        const mark = fighter.targetId === null ? undefined : byId.get(fighter.targetId);
        if (mark === undefined || isRanged(mark)) continue;
        mutualOf += 1;
        if (mark.targetId === fighter.id) mutual += 1;
      }
      const counts = new Map<string, number>();
      for (const fighter of melee) if (fighter.targetId !== null) counts.set(fighter.targetId, (counts.get(fighter.targetId) ?? 0) + 1);
      for (const value of counts.values()) { pileSum += value; pileOf += 1; maxPile = Math.max(maxPile, value); }
    }
    if (battle.tick % 80 !== 0 || alive.length === 0) continue;
    // Cohesion: how far a model sits from the middle of its own block. Interpenetration: how many
    // men are surrounded mostly by the enemy, which is what a mosh pit looks like as a number.
    const blocks = new Map<string, Fighter[]>();
    for (const fighter of alive) {
      const list = blocks.get(fighter.cardId);
      if (list === undefined) blocks.set(fighter.cardId, [fighter]); else list.push(fighter);
    }
    let spread = 0, counted = 0, worst = 0;
    for (const list of blocks.values()) {
      const cx = list.reduce((sum, f) => sum + f.x, 0) / list.length, cy = list.reduce((sum, f) => sum + f.y, 0) / list.length;
      for (const fighter of list) { const away = Math.hypot(fighter.x - cx, fighter.y - cy); spread += away; counted += 1; worst = Math.max(worst, away); }
    }
    let mixed = 0;
    for (const fighter of alive) {
      const near = alive.filter((o) => o.id !== fighter.id)
        .map((o) => ({ o, d: Math.hypot(o.x - fighter.x, o.y - fighter.y) }))
        .sort((l, r) => l.d - r.d).slice(0, 5);
      if (near.filter((e) => e.o.side !== fighter.side).length >= 3) mixed += 1;
    }
    const meanY = (side: string): string => {
      const list = alive.filter((f) => f.side === side);
      return list.length === 0 ? "--" : (list.reduce((s, f) => s + f.y, 0) / list.length).toFixed(0);
    };
    console.log(`  ${String(battle.tick).padStart(4)} ${String(alive.length).padStart(5)} ${String(melee.filter((f) => f.state === "fighting").length).padStart(5)} `
      + `${(spread / counted).toFixed(1).padStart(9)} ${worst.toFixed(0).padStart(6)} ${(mixed / alive.length * 100).toFixed(0).padStart(7)} `
      + `${meanY("attacker").padStart(5)} ${meanY("defender").padStart(5)}`);
  }
  console.log(`  ${battle.tick} ticks (${(battle.tick / 10).toFixed(0)}s), outcome ${battle.outcome}, ${battle.fighters.filter((f) => f.state !== "dead").length}/${started} still standing`);
  console.log(`  first shot ${(firstShot / 10).toFixed(1)}s, first melee ${(firstMelee / 10).toFixed(1)}s, ${volleys} volleys before contact`);
  console.log(`  one-against-one: ${(mutual / Math.max(1, mutualOf) * 100).toFixed(0)}% of duels are mutual; ${(pileSum / Math.max(1, pileOf)).toFixed(2)} men per defender (worst ${maxPile})`);
  console.log(`  ${charges} cavalry charge impacts`);
}

/** Do the counters counter? Each pair is costed to roughly the same gold. */
function counters(): void {
  const cases: Array<[string, Array<[UnitId, number]>, Array<[UnitId, number]>]> = [
    ["spears beat horse", [["spearmen", 8]], [["heavy_cavalry", 3], ["light_cavalry", 1]]],
    ["swords beat spears", [["swordsmen", 6]], [["spearmen", 7]]],
    ["horse beat loose bows", [["light_cavalry", 4], ["heavy_cavalry", 2]], [["archers", 5], ["crossbowmen", 3]]],
    ["a spear screen saves bows", [["light_cavalry", 4], ["heavy_cavalry", 2]], [["archers", 3], ["crossbowmen", 2], ["spearmen", 3]]],
    ["spears beat monsters", [["ogre", 3]], [["spearmen", 8]]],
  ];
  for (const [name, left, right] of cases) {
    let wins = 0, length = 0;
    const runs = 12;
    for (let seed = 1; seed <= runs; seed++) {
      const battle = stage(left, right, seed, false);
      runBattle(battle);
      length += battle.tick;
      if (battle.outcome === "attacker") wins += 1;
    }
    console.log(`  ${name.padEnd(26)} first army won ${String(Math.round(wins / runs * 100)).padStart(3)}% of ${runs}   mean ${(length / runs / 10).toFixed(0)}s`);
  }
}

/**
 * The fairness test, and the important one. Two random armies fight twice with the sides swapped.
 * If the simulation is fair the same army wins both times; if being the attacker is worth anything
 * in itself, the agreement rate collapses and the attacker win rate drifts off fifty.
 */
function fairness(): void {
  const pool: UnitId[] = ["militia", "spearmen", "swordsmen", "archers", "light_cavalry", "shieldguard", "great_weapons", "crossbowmen", "heavy_cavalry", "ogre"];
  let agree = 0, pairs = 0, firstWay = 0, secondWay = 0, length = 0;
  for (let seed = 1; seed <= 150; seed++) {
    let bits = (seed * 2654435761) >>> 0;
    const roll = (): number => { bits = (Math.imul(bits, 1664525) + 1013904223) >>> 0; return bits / 4294967296; };
    const draw = (): Array<[UnitId, number]> => {
      const spec: Array<[UnitId, number]> = [];
      let spent = 0;
      while (spent < 900 && spec.length < 10) {
        const id = pool[Math.floor(roll() * pool.length)];
        if (id === undefined) break;
        const cost = unitDefinition(id).cost;
        if (spent + cost > 990) break;
        spec.push([id, 1]); spent += cost;
      }
      return spec.length > 0 ? spec : [["spearmen", 1]];
    };
    const x = draw(), y = draw();
    const winners: string[] = [];
    for (const swapped of [false, true]) {
      const battle = stage(swapped ? y : x, swapped ? x : y, seed, false);
      runBattle(battle);
      length += battle.tick;
      if (battle.outcome === "attacker") { if (swapped) secondWay += 1; else firstWay += 1; }
      winners.push(battle.outcome === "draw" ? "draw" : battle.outcome === "attacker" ? (swapped ? "Y" : "X") : (swapped ? "X" : "Y"));
    }
    pairs += 1;
    if (winners[0] === winners[1] && winners[0] !== "draw") agree += 1;
  }
  console.log(`  ${pairs} random army pairs fought both ways (${pairs * 2} battles)`);
  console.log(`  the same army wins whichever side it is on: ${(agree / pairs * 100).toFixed(0)}%   (50% would mean the side decides it)`);
  console.log(`  attacker won ${(firstWay / pairs * 100).toFixed(0)}% one way and ${(secondWay / pairs * 100).toFixed(0)}% the other — both should sit near 50`);
  console.log(`  mean length ${(length / (pairs * 2) / 10).toFixed(0)}s`);
}

const only = process.argv[2];
if (only === undefined || only === "shape") { console.log("\nSHAPE OF A FIGHT"); shape(); }
if (only === undefined || only === "counters") { console.log("\nCOUNTERS"); counters(); }
if (only === undefined || only === "fairness") { console.log("\nFAIRNESS"); fairness(); }
