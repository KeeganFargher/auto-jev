import { HERO_IDS, heroDefinition } from "./heroes.js";
import type { DecisionEngine } from "./jev.js";
import { armyById, armyModels, armyStrength, armyUpkeep, factionById, garrisonStrength, garrisonTick, lordOf, makeCard, provinceById, provinceIncome, recruitable, replenish, MOVEMENT_PER_TURN } from "./army.js";
import { DOCTRINES, RARITY_WEIGHTS, doctrineDefinition, isDoctrineId } from "./doctrines.js";
import { BUILDINGS, buildingDefinition } from "./buildings.js";
import { autoResolve, nextRandom, predict, predictionLabel, worthWatching, type BattleSides } from "./resolve.js";
import type { Army, CampaignFaction, CampaignState, DecisionRecord, Position, Province } from "./types.js";
import { unitDefinition } from "./units.js";
import { availableSkills, freeRelic, modifiersFor, relicById, skillById } from "./progression.js";

export const MAX_CARDS = 12;
export const LAST_AGE_TURN = 22;
/**
 * Late-campaign pressure. Holding ground gets more expensive and garrisons stop keeping pace, so a
 * three-way deadlock has to break instead of grinding on until the spectator gives up.
 */
/**
 * The Last Age squeeze on upkeep. It is capped: left to grow it eventually made every army
 * unaffordable for every faction, so each turn bankruptcy stripped whatever anyone had just
 * mustered, nobody could ever conquer anything, and the campaign ran forever getting worse.
 */
export const PRESSURE_CAP = 2.6;
export function pressure(state: CampaignState): number {
  return state.turn <= LAST_AGE_TURN ? 1 : Math.min(PRESSURE_CAP, 1 + (state.turn - LAST_AGE_TURN) * 0.07);
}
/** No campaign runs past this; a stalemate is decided on holdings rather than going on forever. */
export const CAMPAIGN_LIMIT = 120;
/**
 * How much of the map a faction must hold to win. It relaxes as the campaign drags on, so a long war
 * still reaches a conclusion rather than grinding past the point the spectator cares.
 */
export function dominationShare(state: CampaignState): number {
  // An even split between N powers is 1/N, so domination has to sit above that and no higher.
  // Fixed at 0.55 it was unreachable on a five-faction map and every campaign ran to the limit.
  const alive = Math.max(2, state.factions.filter((faction) => !faction.eliminated).length);
  const base = Math.max(0.34, Math.min(0.55, 1.65 / alive));
  return Math.max(0.3, base - Math.max(0, state.turn - 30) * 0.004);
}
export const SECOND_LORD_COST = 450;

/** Lets the server run the battle that matters in real time instead of rolling the dice for it. */
export type BattleRunner = (sides: BattleSides) => Promise<import("./types.js").BattleReport>;

export interface TurnEvent {
  turn: number; type: string; text: string; factionId: string | null; importance: number;
  /** A Jev's choice, with how long the server will hold on it so the spectator can watch it land. */
  decision?: DecisionRecord; hold?: number;
  /** An army's march this turn: the points it passes through and how long the client should take. */
  march?: { armyId: string; path: Position[]; ms: number };
  /** Whose turn is playing out. The client follows that faction until its turn ends. */
  stage?: { factionId: string; phase: "turn" | "end"; lord?: string | null; hosts?: number; provinces?: number };
  /** What this faction's hosts are about to do, published as its turn ends. */
  forecast?: Forecast[];
}
/** One thing the spectator can expect next turn. */
export interface Forecast { armyId: string; factionId: string; provinceId: string; text: string; hostile: boolean }
export type Publish = (event: TurnEvent) => void;
/** Waits so the spectator can take in what just happened; headless runs pass nothing and never wait. */
export type Pace = (ms: number) => Promise<void>;
/** Set for the duration of a turn so every Jev decision reaches the spectator as it is made. */
let announce: Publish | null = null;
let pacer: Pace = async () => undefined;
/**
 * Tells the spectator something happened, then holds on it for as long as its stakes deserve. Every
 * consequence goes through here rather than straight to `publish`, so the campaign spends its time
 * in proportion to what is actually at stake. Anything scoring under 40 holds for nothing at all and
 * simply scrolls past in the rail.
 */
async function beat(publish: Publish, event: TurnEvent): Promise<void> {
  const hold = dwellFor(event.importance);
  publish(hold === 0 ? event : { ...event, hold });
  await pacer(hold);
}
/**
 * How much a choice is worth watching. This is the same 0..100 scale every event carries, so a
 * decision and its consequence are weighed against each other rather than against their own kind.
 */
const DECISION_IMPORTANCE: Record<string, number> = { battle: 80, doctrine: 78, truce: 74, skill: 70, lord: 65, objective: 55, build: 48, recruit: 30 };
/**
 * How long the campaign holds on something, from its own stakes alone.
 *
 * The old scheme paced on the *kind* of thing that happened, which meant a Jev mulling over a
 * granary got 3.4 seconds and a capital changing hands got none at all — the campaign spent all its
 * time on deliberation and none on consequence, which is exactly why it was impossible to follow.
 * Every event already scores itself 30..95; that score now buys the time. Routine business goes by
 * in a blink, the turning points get room to land, and the total runtime is about what it was.
 */
export function dwellFor(importance: number): number {
  if (importance < 40) return 0;
  const reach = Math.max(0, Math.min(1, (importance - 40) / 55));
  return Math.round(700 + Math.pow(reach, 1.7) * 5800);
}
/** Every faction's turn opens with a held card, so the match has a beat even when nothing happens. */
const TURN_CARD_MS = 1600;
/** How long a truce holds before the two factions are at war again. */
const TRUCE_TURNS = 8;
/** No peace before this: the opening turns are when the war is supposed to start. */
const TRUCE_EARLIEST = 8;
const MARCH_MS = 2800;

/** Shortest province route, so an army ordered somewhere distant marches a sensible way there. */
export function routeTo(state: CampaignState, fromId: string, toId: string): string[] {
  const previous = new Map<string, string | null>([[fromId, null]]);
  const queue = [fromId];
  while (queue.length > 0) {
    const current = queue.shift();
    if (current === undefined) break;
    if (current === toId) {
      const path: string[] = [];
      let step: string | null | undefined = toId;
      while (step !== undefined && step !== null) { path.unshift(step); step = previous.get(step); }
      return path.slice(1);
    }
    for (const next of provinceById(state, current)?.neighbours ?? []) if (!previous.has(next)) { previous.set(next, current); queue.push(next); }
  }
  return [];
}

/** `art` names what the choice is about, most specific first, space separated. */
interface Option { id: string; label: string; verb: string; subject: string; tags: string[]; art?: string | null; description: string; hint: number }
/** Puts one situation to a faction's Jev and returns the option it chose. */
interface Subject { armyId?: string | undefined; provinceId?: string | undefined }
async function ask(engine: DecisionEngine, faction: CampaignFaction, instructions: string, context: Record<string, unknown>, options: Option[], kind = "objective", turn = 0, subject: Subject = {}): Promise<Option> {
  const fallback = [...options].sort((left, right) => right.hint - left.hint)[0];
  if (options.length === 0 || fallback === undefined) throw new Error("A decision needs at least one option");
  if (options.length === 1) return fallback;
  const record = (choice: Option, probabilities: Record<string, number>, source: "jev" | "offline" | "forced", confidence: number, latencyMs: number): void => {
    const entry: DecisionRecord = {
      id: `d-${faction.id}-${turn}-${faction.decisions.length}`, kind, title: instructions, turn,
      options: options.map((option) => ({ id: option.id, label: option.label, verb: option.verb, subject: option.subject, tags: option.tags, art: option.art ?? null, description: option.description, score: probabilities[option.id] ?? null })),
      choice: choice.id, outcome: choice.label, source, confidence, latencyMs,
      importance: DECISION_IMPORTANCE[kind] ?? 40,
      armyId: subject.armyId ?? null, provinceId: subject.provinceId ?? null,
    };
    faction.decisions.push(entry);
    if (faction.decisions.length > 40) faction.decisions.shift();
    announce?.({ turn, type: "decision", text: `${faction.name}: ${choice.label}`, factionId: faction.id, importance: entry.importance, decision: entry, hold: dwellFor(entry.importance) });
  };
  try {
    const result = await engine.choose(context, {
      instructions,
      criteria: Object.fromEntries(options.map((option) => [option.id, option.description])),
      hints: Object.fromEntries(options.map((option) => [option.id, option.hint])),
    });
    faction.jev = { status: "running", lastError: null };
    const choice = options.find((option) => option.id === result.choice) ?? fallback;
    record(choice, result.probabilities, result.source, result.confidence, result.latencyMs);
    await pacer(dwellFor(DECISION_IMPORTANCE[kind] ?? 40));
    return choice;
  } catch (error) {
    faction.jev = { status: "running", lastError: error instanceof Error ? error.message : String(error) };
    record(fallback, {}, "forced", 0, 0);
    await pacer(dwellFor(DECISION_IMPORTANCE[kind] ?? 40));
    return fallback;
  }
}

/** The compact picture a Jev reasons over; it never sees the whole campaign database. */
function blackboard(state: CampaignState, faction: CampaignFaction): Record<string, unknown> {
  const owned = state.provinces.filter((province) => province.ownerId === faction.id);
  return {
    faction: faction.name, turn: state.turn, gold: faction.gold, income: faction.income, upkeep: faction.upkeep,
    provinces: owned.map((province) => `${province.name} (${province.kind})`),
    armies: state.armies.filter((army) => army.factionId === faction.id).map((army) => `${army.name}: ${armyModels(army)} models, morale ${Math.round(army.morale)}${army.shattered ? ", shattered" : ""} at ${provinceById(state, army.provinceId)?.name ?? "?"}`),
    // Rival strength is counted from our own reports, so a quiet neighbour can be badly misjudged.
    rivals: state.factions.filter((other) => other.id !== faction.id && !other.eliminated).map((other) => {
      const known = state.provinces.filter((province) => faction.intel[province.id]?.ownerId === other.id).length;
      const relation = faction.relations[other.id];
      return `${other.name}: ${known} provinces known to us, ${relation?.truceUntil ?? 0 > state.turn ? "truce" : relation?.war === false ? "at peace" : "at war"}`;
    }),
  };
}

/** Chooses each army's objective for the turn, then recruitment and construction if gold allows. */
async function plan(state: CampaignState, faction: CampaignFaction, engine: DecisionEngine, publish: Publish): Promise<void> {
  faction.pendingOrders = [];
  const context = blackboard(state, faction);
  for (const army of state.armies.filter((entry) => entry.factionId === faction.id)) {
    const lord = lordOf(state, army);
    if (lord === undefined || lord.condition !== "ready") continue;
    const here = provinceById(state, army.provinceId);
    if (here === undefined) continue;
    // An army that has been given a distant objective keeps marching rather than re-deciding every
    // turn; commitments are what make a faction look purposeful instead of twitchy.
    if (army.route.length > 0 && army.order.targetProvinceId !== null && provinceById(state, army.order.targetProvinceId)?.ownerId !== faction.id && !army.shattered) {
      faction.pendingOrders.push({ armyId: army.id, order: army.order });
      continue;
    }
    const options: Option[] = [{
      id: "hold", label: `Hold ${here.name}`, verb: "Hold", subject: here.name, art: here.biome,
      tags: [here.kind === "capital" ? "Capital" : here.ownerId === faction.id ? "Own ground" : "Contested", army.shattered ? "Rebuild" : "Dig in"],
      description: `Fortify ${here.name}. The host digs in, replenishes half again as fast and holds the ground.`, hint: army.shattered && here.ownerId === faction.id ? 3 : 0.6 / pressure(state),
    }];
    if (here.ownerId !== faction.id && here.ownerId !== null && !army.shattered) {
      const owner = factionById(state, here.ownerId);
      options.push({
        id: `raid_${here.id}`, label: `Raid ${here.name}`, verb: "Raid", subject: here.name, art: here.biome,
        tags: ["Burns the country", `${owner?.name ?? "The owner"} pays`],
        description: `Stay at ${here.name} and strip it. Gold every turn from ${owner?.name ?? "its owner"}, no replenishment, and they will not forget it.`,
        hint: (faction.gold < 220 ? 2.6 : 0.8) * pressure(state),
      });
    }
    if (army.shattered && here.ownerId !== faction.id) {
      // Nothing replenishes in enemy country, so a shattered host must get home or bleed out.
      const refuge = state.provinces
        .filter((province) => province.ownerId === faction.id)
        .map((province) => ({ province, steps: routeTo(state, army.provinceId, province.id).length }))
        .filter((entry) => entry.steps > 0)
        .sort((left, right) => left.steps - right.steps)[0];
      if (refuge !== undefined) options.push({
        id: `move_${refuge.province.id}`, label: `Fall back to ${refuge.province.name}`, verb: "Fall back", subject: refuge.province.name, art: refuge.province.biome,
        tags: [`${refuge.steps} move${refuge.steps === 1 ? "" : "s"}`, "Friendly", "Rebuild"],
        description: `Withdraw to friendly ground at ${refuge.province.name} and rebuild.`, hint: 5,
      });
    }
    // A host can march into a neighbour's land to strip it instead of storming a settlement.
    for (const id of here.neighbours) {
      const neighbour = provinceById(state, id);
      if (neighbour === undefined || neighbour.ownerId === faction.id || neighbour.ownerId === null) continue;
      if (atTruce(state, faction, neighbour.ownerId)) continue;
      if (state.armies.some((entry) => entry.provinceId === neighbour.id && entry.factionId !== faction.id)) continue;
      const owner = factionById(state, neighbour.ownerId);
      options.push({
        id: `raidmove_${neighbour.id}`, label: `Raid ${neighbour.name}`, verb: "Raid", subject: neighbour.name, art: neighbour.biome,
        tags: ["Gold every turn", `${owner?.name ?? "They"} pay`],
        description: `Cross into ${neighbour.name} and strip it rather than storm it. Gold every turn, no replenishment, and the garrison bites back.`,
        hint: (faction.gold < 220 ? 2.4 : 0.7) * pressure(state),
      });
    }
    // Enemy hosts standing on our own ground can be driven off.
    for (const intruder of state.armies.filter((entry) => entry.factionId !== faction.id)) {
      const where = provinceById(state, intruder.provinceId);
      if (where === undefined || where.ownerId !== faction.id) continue;
      if (routeTo(state, army.provinceId, where.id).length === 0 && army.provinceId !== where.id) continue;
      const lord = lordOf(state, intruder);
      options.push({
        id: `attack_${where.id}`, label: `Drive them out of ${where.name}`, verb: "Drive out", subject: where.name, art: where.biome,
        tags: ["Our ground", `${armyModels(intruder)} intruders`],
        description: `${lord === undefined ? intruder.name : heroDefinition(lord.heroId).name} is stripping ${where.name}. Throw them off it.`,
        hint: 1.8 * pressure(state),
      });
    }
    const fieldable = new Set(recruitable(state, faction));
    const targets = state.provinces
      .filter((province) => province.ownerId !== faction.id && !atTruce(state, faction, province.ownerId))
      .map((province) => {
        // The Jev plans from the last report, which may be several turns old or missing entirely.
        const intel = faction.intel[province.id];
        const defence = state.armies.find((entry) => entry.provinceId === province.id && entry.factionId !== faction.id);
        const mine = armyStrength(state, army, defence?.units ?? province.garrison);
        const theirs = intel === undefined ? guessDefence(province) : Math.max(1, intel.defence);
        const odds = mine / Math.max(1, mine + theirs);
        const steps = routeTo(state, army.provinceId, province.id).length;
        // Ground is worth what it yields, what it guards and what it lets the faction field. Without
        // the last term nobody ever took a shrine, so Battle Mages were never recruited by anyone.
        const opens = province.unlocks.filter((id) => !fieldable.has(id));
        const value = provinceIncome(province) / 12
          + (province.kind === "capital" ? 3 : province.kind === "chokepoint" || province.kind === "mine" ? 1.4 : 0.4)
          + opens.length * 1.6;
        return { province, defence, odds, steps, opens, intel, score: steps === 0 ? 0 : odds * value / (1 + steps * 0.45) };
      })
      .filter((entry) => entry.steps > 0)
      .sort((left, right) => right.score - left.score)
      .slice(0, 5);
    for (const target of targets) {
      const believedOwner = target.intel === undefined ? target.province.ownerId : target.intel.ownerId;
      const owner = believedOwner === null ? "neutral" : factionById(state, believedOwner)?.name ?? "a rival";
      const age = intelAge(state, target.intel);
      options.push({
        id: `attack_${target.province.id}`,
        label: `March on ${target.province.name}`,
        verb: "March on", subject: target.province.name, art: target.province.biome,
        tags: [`${target.steps} move${target.steps === 1 ? "" : "s"}`, `${provinceIncome(target.province)}g/turn`, predictionLabel(target.odds), age,
          ...(target.opens.length > 0 ? [`Fields ${unitDefinition(target.opens[0]!).name}`] : [])],
        description: `${target.province.name} (${target.province.kind}, ${owner}, ${provinceIncome(target.province)} gold/turn) is ${target.steps} province${target.steps === 1 ? "" : "s"} away. Estimate: ${predictionLabel(target.odds)}, ${age}${target.intel?.host != null ? `, ${target.intel.host} was standing there` : ""}.${target.opens.length > 0 ? ` Holding it fields ${target.opens.map((id) => unitDefinition(id).name).join(" and ")}.` : ""}`,
        hint: army.shattered ? 0.05 : target.score * 2.4 * pressure(state),
      });
    }
    const chosen = await ask(engine, faction, `Where should ${heroDefinition(lord.heroId).name} take the ${army.name} this turn?`, context, options, "objective", state.turn, { armyId: army.id, provinceId: army.provinceId });
    // The stance is part of the order: what the host does where it stands, not only where it goes.
    army.stance = chosen.id === "hold" ? "fortify" : chosen.id.startsWith("raid") ? "raid" : "march";
    const targetId = chosen.id === "hold" || chosen.id.startsWith("raid_") ? null : chosen.id.slice(chosen.id.indexOf("_") + 1);
    faction.pendingOrders.push({
      armyId: army.id,
      order: {
        kind: chosen.id.startsWith("attack") ? "attack" : chosen.id.startsWith("move") || chosen.id.startsWith("raidmove") ? "move" : "hold",
        targetProvinceId: targetId, label: chosen.label, issuedTurn: state.turn,
      },
    });
  }

  // --- recruitment: fill the army up to its cap, so income turns into troops instead of a hoard.
  const available = recruitable(state, faction);
  const hosts = state.armies.filter((army) => army.factionId === faction.id && provinceById(state, army.provinceId)?.ownerId === faction.id && army.units.length < MAX_CARDS);
  const host = hosts.sort((left, right) => left.units.length - right.units.length)[0];
  const hired: string[] = [];
  for (let slot = 0; slot < 3 && host !== undefined && host.units.length < MAX_CARDS; slot++) {
    const discount = modifiersFor(faction, lordOf(state, host)).recruitCost;
    const priceOf = (unitId: ReturnType<typeof recruitable>[number]): number => Math.round(unitDefinition(unitId).cost * discount);
    const affordable = available.filter((unitId) => priceOf(unitId) <= faction.gold);
    if (affordable.length === 0 || faction.gold < 90) break;
    const options: Option[] = affordable.map((unitId) => {
      const unit = unitDefinition(unitId);
      return {
        id: `recruit_${unitId}`, label: `Recruit ${unit.name}`, verb: "Recruit", subject: unit.name, art: unitId,
        tags: [`${priceOf(unitId)}g`, `${unit.upkeep}/turn`, unit.strongAgainst[0] === undefined ? `Tier ${unit.tier}` : `Beats ${unit.strongAgainst[0].replaceAll("_", " ")}`],
        description: `${unit.blurb} ${priceOf(unitId)} gold, ${unit.upkeep}/turn. Strong against ${unit.strongAgainst.join(", ") || "nothing in particular"}.`, hint: unit.tier + 0.5,
      };
    });
    options.push({
      id: "save", label: "Recruit nothing", verb: "Hire", subject: "Nobody",
      tags: [`Bank ${Math.round(faction.gold)}g`, "No upkeep"],
      description: "Bank the gold this turn.", hint: faction.gold > 600 ? 0.15 : 1.2,
    });
    const chosen = await ask(engine, faction, "What should we recruit?", context, options, "recruit", state.turn, { armyId: host.id, provinceId: host.provinceId });
    if (chosen.id === "save") break;
    const unitId = chosen.id.slice("recruit_".length) as ReturnType<typeof recruitable>[number];
    faction.gold -= priceOf(unitId);
    host.units.push(makeCard(state, unitId));
    hired.push(unitDefinition(unitId).name);
  }
  // One line for the turn's hiring: three events inside a tenth of a second read as noise.
  if (hired.length > 0) {
    const list = hired.length === 1 ? hired[0] : `${hired.slice(0, -1).join(", ")} and ${hired.at(-1)}`;
    await beat(publish, { turn: state.turn, type: "recruit", text: `${faction.name} recruits ${list}`, factionId: faction.id, importance: 30 });
  }

  await build(state, faction, engine, publish);

  // --- putting a Jev in the field. An idle lord always gets an army if the faction can pay for one:
  //     losing your last army must never be terminal while you still hold a settlement.
  const capital = state.provinces.find((province) => province.id === `cap_${faction.id}` && province.ownerId === faction.id)
    ?? state.provinces.find((province) => province.ownerId === faction.id && province.settlement !== null);
  const holdings = state.provinces.filter((province) => province.ownerId === faction.id).length;
  const fielded = state.armies.filter((army) => army.factionId === faction.id).length;
  const idleLord = faction.lords.find((lord) => lord.condition === "ready" && !state.armies.some((army) => army.lordId === lord.id));
  const muster = async (lordId: string, heroId: (typeof HERO_IDS)[number], spend: number): Promise<void> => {
    faction.gold -= spend;
    state.sequence += 1;
    const raised = {
      id: `army-${state.sequence}`, factionId: faction.id, name: `${heroDefinition(heroId).name}'s Host`,
      lordId, units: [makeCard(state, "spearmen"), makeCard(state, "spearmen")], provinceId: capital?.id ?? "",
      x: capital?.x ?? 0, y: capital?.y ?? 0, movement: 0, maxMovement: 34, route: [],
      order: { kind: "hold" as const, targetProvinceId: null, label: "Mustering", issuedTurn: state.turn },
      stance: "march" as const, morale: 80, shattered: false,
    };
    state.armies.push(raised);
    faction.armies.push(raised.id);
    await beat(publish, { turn: state.turn, type: "lord", text: `${heroDefinition(heroId).name} musters a new host at ${capital?.name ?? "the capital"}`, factionId: faction.id, importance: 70 });
  };
  const living = faction.lords.filter((lord) => lord.condition !== "dead");
  if (capital !== undefined && idleLord !== undefined && faction.gold >= 180) {
    await muster(idleLord.id, idleLord.heroId, 180);
  } else if (capital !== undefined && living.length === 0 && faction.gold >= SECOND_LORD_COST) {
    // Every Jev dead is not the same as defeated: while the faction holds a settlement it finds
    // someone to carry the banner, or it would hoard gold and do nothing for the rest of the match.
    const heroId = HERO_IDS.find((id) => !new Set(state.factions.flatMap((entry) => entry.lords.map((lord) => lord.heroId))).has(id));
    if (heroId !== undefined) {
      state.sequence += 1;
      const lord = { id: `lord-${state.sequence}`, heroId, factionId: faction.id, level: 1, experience: 0, skills: [], skillPoints: 1, relics: [], condition: "ready" as const, unavailableUntil: 0, kills: 0, battlesWon: 0, battlesLost: 0, health: 100, maxHealth: 100 };
      faction.lords.push(lord);
      await beat(publish, { turn: state.turn, type: "lord", text: `${faction.name} names ${heroDefinition(heroId).name} to lead what is left`, factionId: faction.id, importance: 80 });
      await muster(lord.id, heroId, SECOND_LORD_COST);
    }
  } else if (capital !== undefined && faction.gold >= SECOND_LORD_COST && holdings >= 4 && fielded < 3 && living.length < 4) {
    const taken = new Set(state.factions.flatMap((entry) => entry.lords.map((lord) => lord.heroId)));
    const heroId = HERO_IDS.find((id) => !taken.has(id));
    if (heroId !== undefined) {
      const chosen = await ask(engine, faction, `We can afford to raise another Jev at ${capital.name}.`, context, [
        { id: "raise", label: `Raise ${heroDefinition(heroId).name}`, verb: "Raise", subject: heroDefinition(heroId).name, art: heroId, tags: [`${SECOND_LORD_COST}g`, "Second host"], description: `${heroDefinition(heroId).fantasy} Costs ${SECOND_LORD_COST} gold and opens a second front.`, hint: 1.6 },
        { id: "wait", label: "Not yet", verb: "Wait", subject: "Not yet", tags: [`Keep ${Math.round(faction.gold)}g`, "Troops first"], description: "Keep the gold for troops and building.", hint: 0.7 },
      ], "lord", state.turn, { provinceId: capital.id });
      if (chosen.id === "raise") {
        state.sequence += 1;
        const lord = { id: `lord-${state.sequence}`, heroId, factionId: faction.id, level: 1, experience: 0, skills: [], skillPoints: 1, relics: [], condition: "ready" as const, unavailableUntil: 0, kills: 0, battlesWon: 0, battlesLost: 0, health: 100, maxHealth: 100 };
        faction.lords.push(lord);
        await muster(lord.id, heroId, SECOND_LORD_COST);
      }
    }
  }
}

/** Marches an army along its route, spending its movement budget across the continuous map. Returns every point it passed through. */
function march(state: CampaignState, army: Army): Position[] {
  const path: Position[] = [];
  army.movement = army.maxMovement;
  while (army.movement > 0 && army.route.length > 0) {
    const nextId = army.route[0];
    const next = nextId === undefined ? undefined : provinceById(state, nextId);
    if (next === undefined) { army.route.shift(); continue; }
    const distance = Math.hypot(next.x - army.x, next.y - army.y);
    if (distance <= army.movement) {
      army.x = next.x; army.y = next.y; army.provinceId = next.id;
      army.movement -= distance; army.route.shift();
      path.push({ x: army.x, y: army.y });
      continue;
    }
    const step = army.movement / distance;
    army.x += (next.x - army.x) * step; army.y += (next.y - army.y) * step;
    army.movement = 0;
    path.push({ x: army.x, y: army.y });
  }
  return path;
}

/** An army that has arrived somewhere hostile has to fight for it: the Jev decides how. */
async function resolveArrival(state: CampaignState, army: Army, engines: Map<string, DecisionEngine>, publish: Publish, runLiveBattle: BattleRunner | undefined): Promise<void> {
  if (army.order.kind !== "attack" || army.route.length > 0) return;
  const province = provinceById(state, army.provinceId);
  const faction = factionById(state, army.factionId);
  if (province === undefined || faction === undefined) return;
  const defender = state.armies.find((entry) => entry.id !== army.id && entry.provinceId === province.id && entry.factionId !== army.factionId);
  // Our own province is only a non-event while nobody else is standing on it.
  if (province.ownerId === faction.id && defender === undefined) return;
  const defenderFactionId = defender?.factionId ?? province.ownerId;
  if (defenderFactionId === null && province.garrison.length === 0) { await capture(state, province, faction, publish); return; }
  const sides: BattleSides = { attacker: army, defender: defender ?? null, defenderFactionId: defenderFactionId ?? "neutral", province, siege: defender === undefined && province.settlement !== null };
  // The moment the fog lifts. If the ground is nothing like the last report, that is the story.
  const believed = faction.intel[province.id];
  const truth = Math.round(defender === undefined ? garrisonStrength(state, province) : armyStrength(state, defender));
  if (believed !== undefined && state.turn - believed.turn >= 1 && truth > believed.defence * 1.5 && truth - believed.defence > 250) {
    const lord = lordOf(state, army);
    await beat(publish, {
      turn: state.turn, type: "surprise", factionId: faction.id, importance: 82,
      text: `${lord === undefined ? army.name : heroDefinition(lord.heroId).name} expected ${believed.defence} at ${province.name} and finds ${truth}`,
    });
    await pacer(2200);
  }
  observe(state, faction);
  const share = predict(state, sides);
  // The Jev gets the call every real battle: commit, roll the dice, or pull out.
  const engine = engines.get(faction.id);
  const decision = engine === undefined ? "auto" : (await ask(engine, faction, `${army.name} has reached ${province.name}. The estimate is ${predictionLabel(share)}.`, blackboard(state, faction), [
    { id: "fight", label: "Fight the battle", verb: "Fight", subject: "Full battle", art: province.biome, tags: [`${Math.round(share * 100)}% to win`, predictionLabel(share)], description: `Commit to a full battle at ${province.name}. Estimate ${predictionLabel(share)} (${Math.round(share * 100)}%).`, hint: share * 2 },
    { id: "auto", label: "Press the attack", verb: "Press", subject: "Quick assault", art: province.biome, tags: ["Over in a turn", "Costly"], description: "Resolve it quickly and accept the casualties.", hint: 1 },
    { id: "withdraw", label: "Withdraw", verb: "Withdraw", subject: "Pull back", art: province.biome, tags: ["No losses", `${province.name} stays lost`], description: "Pull back without committing. The province stays in enemy hands.", hint: (1 - share) * 1.6 },
  ], "battle", state.turn, { armyId: army.id, provinceId: province.id })).id;
  if (decision === "withdraw") {
    army.order = { kind: "retreat", targetProvinceId: null, label: "Withdrew", issuedTurn: state.turn };
    army.morale = Math.max(10, army.morale - 8);
    await beat(publish, { turn: state.turn, type: "withdraw", text: `${faction.name} withdraws from ${province.name} rather than commit`, factionId: faction.id, importance: 45 });
    return;
  }
  // One battle a turn is worth dropping into; the rest are rolled so the campaign keeps moving.
  const live = runLiveBattle !== undefined && decision === "fight" && state.pendingBattle === null && worthWatching(state, sides);
  if (live) state.pendingBattle = { id: `pending-${state.sequence + 1}`, provinceId: province.id, turn: state.turn, attackerArmyId: army.id, defenderArmyId: defender?.id ?? null, defenderFactionId: sides.defenderFactionId, siege: sides.siege };
  const report = live && runLiveBattle !== undefined ? await runLiveBattle(sides) : autoResolve(state, sides);
  state.pendingBattle = null;
  state.battles.push(report);
  await beat(publish, { turn: state.turn, type: "battle", text: `${report.summary} (${report.attackerLosses} vs ${report.defenderLosses} lost)`, factionId: faction.id, importance: report.outcome === "draw" ? 55 : 75 });
  if (report.outcome === "attacker") await capture(state, province, faction, publish);
}

/**
 * What this faction's hosts will do next turn, as far as it can be honestly told from where they
 * stand and how far they can march. The most legible moment in any match is the one you saw coming:
 * an army arriving somewhere matters much more to a spectator who was told last turn it was on its
 * way. Only marches that can actually finish next turn are promised, so the rail never lies.
 */
function forecastFor(state: CampaignState, faction: CampaignFaction): Forecast[] {
  const ahead: Forecast[] = [];
  for (const army of state.armies) {
    if (army.factionId !== faction.id) continue;
    const nextId = army.route[0];
    if (nextId === undefined) continue;
    const province = provinceById(state, nextId);
    if (province === undefined) continue;
    // One turn's march, with a little slack; anything further away is not a promise worth making.
    if (Math.hypot(province.x - army.x, province.y - army.y) > army.maxMovement * 1.15) continue;
    const lord = lordOf(state, army);
    const who = lord === undefined ? army.name : heroDefinition(lord.heroId).name;
    const hostile = province.ownerId !== null && province.ownerId !== faction.id;
    ahead.push({
      armyId: army.id, factionId: faction.id, provinceId: province.id, hostile,
      text: hostile ? `${who} strikes ${province.name}` : `${who} reaches ${province.name}`,
    });
  }
  // The threats first; a rail of four is a glance, a rail of ten is another thing to read.
  return ahead.sort((left, right) => Number(right.hostile) - Number(left.hostile)).slice(0, 4);
}

/** A host that sits on someone else's ground and strips it: gold to the raider, grievance to the owner. */
async function raid(state: CampaignState, army: Army, publish: Publish): Promise<void> {
  if (army.stance !== "raid" || army.shattered) return;
  const province = provinceById(state, army.provinceId);
  const faction = factionById(state, army.factionId);
  if (province === undefined || faction === undefined || province.ownerId === army.factionId) return;
  const owner = province.ownerId === null ? undefined : factionById(state, province.ownerId);
  const loot = Math.max(4, Math.round(Math.min(45, provinceIncome(province) * 0.7 + armyModels(army) * 0.5)));
  faction.gold += loot;
  const lord = lordOf(state, army);
  const who = lord === undefined ? army.name : heroDefinition(lord.heroId).name;
  if (owner !== undefined) {
    owner.gold = Math.max(0, owner.gold - Math.round(loot * 0.6));
    strain(state, faction.id, owner.id, 12);
  }
  // The garrison and the countryside bite back, so a raid is a tactic rather than an income stream.
  army.morale = Math.max(15, army.morale - 6);
  const thinnest = [...army.units].sort((left, right) => left.models - right.models)[0];
  if (thinnest !== undefined && thinnest.models > 1) thinnest.models -= 1;
  await beat(publish, { turn: state.turn, type: "raid", text: `${who} strips ${province.name} for ${loot} gold`, factionId: faction.id, importance: 55 });
}

/** Takes an undefended province, transferring income and unlocks to the new owner. */
async function capture(state: CampaignState, province: Province, faction: CampaignFaction, publish: Publish): Promise<void> {
  const previous = province.ownerId === null ? undefined : factionById(state, province.ownerId);
  // Taking someone's ground is the thing they remember longest.
  if (previous !== undefined) strain(state, faction.id, previous.id, province.kind === "capital" ? 45 : 30);
  province.ownerId = faction.id;
  province.capturedAt = state.turn;
  province.garrison = [];
  if (province.settlement !== null) { province.settlement.walls = Math.round(province.settlement.maxWalls * 0.4); province.settlement.project = null; }
  if (province.kind === "shrine" && !province.claimed) {
    province.claimed = true;
    const lord = faction.lords.find((entry) => entry.condition !== "dead");
    const prize = freeRelic(state, null);
    if (lord !== undefined && prize !== undefined) {
      lord.relics.push(prize.id);
      await beat(publish, { turn: state.turn, type: "relic", text: `${faction.name} claims the ${prize.name} at ${province.name} — ${prize.text}`, factionId: faction.id, importance: 85 });
    }
  }
  await beat(publish, {
    turn: state.turn, type: "capture",
    text: `${faction.name} takes ${province.name}${previous === undefined ? "" : ` from ${previous.name}`}`,
    factionId: faction.id, importance: province.kind === "capital" ? 95 : 65,
  });
  faction.history.push({ turn: state.turn, text: `Took ${province.name}` });
}

/** Resolves one full campaign turn: income, then each faction in turn plans, marches and fights. */


/**
 * What a faction can see this turn: its own ground, wherever its hosts stand, and one province
 * beyond both. A watchtower sees one further again. Everything else is remembered, not observed.
 */
function observe(state: CampaignState, faction: CampaignFaction): void {
  const seen = new Set<string>();
  const spread = (id: string, depth: number): void => {
    if (depth < 0 || seen.has(`${id}:${depth}`)) return;
    seen.add(id);
    seen.add(`${id}:${depth}`);
    if (depth === 0) return;
    const province = provinceById(state, id);
    for (const neighbour of province?.neighbours ?? []) spread(neighbour, depth - 1);
  };
  for (const province of state.provinces) {
    if (province.ownerId !== faction.id) continue;
    spread(province.id, (province.settlement?.buildings.includes("watchtower") ?? false) ? 2 : 1);
  }
  for (const army of state.armies) {
    if (army.factionId !== faction.id) continue;
    spread(army.provinceId, 1);
  }
  for (const province of state.provinces) {
    if (!seen.has(province.id)) continue;
    const host = state.armies.find((army) => army.provinceId === province.id && army.factionId !== faction.id);
    const lord = host === undefined ? undefined : lordOf(state, host);
    faction.intel[province.id] = {
      turn: state.turn,
      ownerId: province.ownerId,
      defence: Math.round(host === undefined ? garrisonStrength(state, province) : armyStrength(state, host)),
      host: host === undefined ? null : lord === undefined ? host.name : `${heroDefinition(lord.heroId).name}'s host`,
    };
  }
}
/** What a Jev would guess about ground it has never laid eyes on. */
function guessDefence(province: Province): number {
  const base = province.kind === "capital" ? 1500 : province.kind === "fort" ? 900 : province.kind === "town" ? 600 : province.kind === "wilds" ? 180 : 420;
  return base;
}
/** How a briefing describes the age of its own information. */
function intelAge(state: CampaignState, intel: { turn: number } | undefined): string {
  if (intel === undefined) return "never scouted";
  const age = state.turn - intel.turn;
  return age <= 0 ? "in sight" : age === 1 ? "seen last turn" : `seen ${age} turns ago`;
}

/** True while two factions have an unexpired truce, which is what stops them attacking each other. */
export function atTruce(state: CampaignState, a: CampaignFaction, bId: string | null): boolean {
  if (bId === null || bId === a.id) return false;
  const relation = a.relations[bId];
  return relation !== undefined && relation.truceUntil > state.turn;
}
/** Both sides remember a grievance; relations are symmetric so neither Jev is surprised by them. */
function strain(state: CampaignState, aId: string, bId: string | null, amount: number): void {
  if (bId === null || aId === bId) return;
  for (const [left, right] of [[aId, bId], [bId, aId]] as const) {
    const faction = factionById(state, left);
    if (faction === undefined) continue;
    const relation = faction.relations[right] ?? { war: true, tension: 40, truceUntil: 0 };
    relation.tension = Math.max(0, Math.min(100, relation.tension + amount));
    if (amount > 0 && relation.truceUntil <= state.turn) relation.war = true;
    faction.relations[right] = relation;
  }
}

/**
 * War, truce and the grudges between them. Tension cools on its own, a lapsed truce puts two
 * factions back at war, and a Jev that is tired of a front can ask for peace — which the other Jev
 * is free to refuse.
 */
async function diplomacy(state: CampaignState, faction: CampaignFaction, engines: Map<string, DecisionEngine>, publish: Publish): Promise<void> {
  const rivals = state.factions.filter((other) => other.id !== faction.id && !other.eliminated);
  for (const rival of rivals) {
    const relation = faction.relations[rival.id] ?? { war: true, tension: 40, truceUntil: 0 };
    relation.tension = Math.max(0, relation.tension - 2);
    if (relation.truceUntil > 0 && state.turn >= relation.truceUntil && !relation.war) {
      relation.war = true;
      relation.truceUntil = 0;
      relation.tension = Math.max(relation.tension, 55);
      faction.relations[rival.id] = relation;
      const theirs = rival.relations[faction.id];
      if (theirs !== undefined) { theirs.war = true; theirs.truceUntil = 0; theirs.tension = Math.max(theirs.tension, 55); }
      await beat(publish, { turn: state.turn, type: "war", text: `The truce between ${faction.name} and ${rival.name} has lapsed`, factionId: faction.id, importance: 80 });
      continue;
    }
    faction.relations[rival.id] = relation;
  }
  const engine = engines.get(faction.id);
  if (engine === undefined) return;
  // Only worth asking when a front has genuinely gone quiet and there is another war to win. The
  // early turns are excluded outright: three factions suing for peace on turn two is not a war.
  if (state.turn < TRUCE_EARLIEST) return;
  const wars = rivals.filter((rival) => faction.relations[rival.id]?.war === true);
  if (wars.length < 2) return;
  const quiet = wars
    .filter((rival) => (faction.relations[rival.id]?.tension ?? 100) < 25)
    .sort((left, right) => (faction.relations[left.id]?.tension ?? 0) - (faction.relations[right.id]?.tension ?? 0))[0];
  if (quiet === undefined) return;
  const held = (entry: CampaignFaction): number => state.provinces.filter((province) => province.ownerId === entry.id).length;
  const offer = await ask(engine, faction, `${faction.name} is fighting on two fronts. Sue for peace with ${quiet.name}?`, blackboard(state, faction), [
    { id: "offer", label: `Offer ${quiet.name} a truce`, verb: "Sue for peace", subject: quiet.name, art: quiet.id, tags: [`${TRUCE_TURNS} turns`, "One front closes"], description: `Ten turns of peace with ${quiet.name} (${held(quiet)} provinces), so the war elsewhere can be won.`, hint: 1.4 },
    { id: "refuse", label: "Fight on", verb: "Fight on", subject: "No terms", art: quiet.id, tags: ["Two fronts", "No concessions"], description: "No terms. Both wars continue.", hint: 1 },
  ], "truce", state.turn, { provinceId: state.provinces.find((province) => province.ownerId === faction.id)?.id });
  if (offer.id !== "offer") return;
  const theirEngine = engines.get(quiet.id);
  const reply = theirEngine === undefined ? { id: "accept" } : await ask(theirEngine, quiet, `${faction.name} offers ${quiet.name} a truce.`, blackboard(state, quiet), [
    { id: "accept", label: `Accept ${faction.name}'s truce`, verb: "Accept", subject: `${faction.name}'s terms`, art: faction.id, tags: [`${TRUCE_TURNS} turns`, `They hold ${held(faction)}`], description: `Ten turns of peace. ${faction.name} holds ${held(faction)} provinces.`, hint: 1.3 },
    { id: "reject", label: "Refuse the terms", verb: "Refuse", subject: "Their terms", art: faction.id, tags: ["War continues", "Grudge held"], description: `Keep the war with ${faction.name} going.`, hint: 1 },
  ], "truce", state.turn, { provinceId: state.provinces.find((province) => province.ownerId === quiet.id)?.id });
  if (reply.id !== "accept") {
    await beat(publish, { turn: state.turn, type: "war", text: `${quiet.name} refuses ${faction.name}'s terms`, factionId: quiet.id, importance: 70 });
    strain(state, faction.id, quiet.id, 10);
    return;
  }
  for (const [left, right] of [[faction, quiet], [quiet, faction]] as const) {
    const relation = left.relations[right.id] ?? { war: true, tension: 40, truceUntil: 0 };
    relation.war = false;
    relation.truceUntil = state.turn + TRUCE_TURNS;
    relation.tension = Math.max(0, relation.tension - 25);
    left.relations[right.id] = relation;
  }
  await beat(publish, { turn: state.turn, type: "truce", text: `${faction.name} and ${quiet.name} agree a truce for ${TRUCE_TURNS} turns`, factionId: faction.id, importance: 90 });
}

/**
 * A doctrine every time the faction has grown enough to deserve one. This is the roguelike spine:
 * the same three factions end a run with completely different multipliers behind them.
 */
async function adoptDoctrine(state: CampaignState, faction: CampaignFaction, engine: DecisionEngine, publish: Publish): Promise<void> {
  const held = state.provinces.filter((province) => province.ownerId === faction.id).length;
  const won = faction.lords.reduce((sum, lord) => sum + lord.battlesWon, 0);
  const earned = Math.floor(held / 2) + Math.floor(won / 3);
  const taken = faction.doctrines.reduce((sum, entry) => sum + entry.stacks, 0);
  if (earned <= taken) return;
  const stacksOf = (id: string): number => faction.doctrines.find((entry) => entry.id === id)?.stacks ?? 0;
  const open = DOCTRINES.filter((doctrine) => stacksOf(doctrine.id) < doctrine.maxStacks);
  if (open.length === 0) return;
  // Three on offer, drawn by rarity, so a legendary is a moment rather than a routine pick.
  const draw: typeof open = [];
  const pool = [...open];
  for (let slot = 0; slot < 3 && pool.length > 0; slot++) {
    const total = pool.reduce((sum, doctrine) => sum + RARITY_WEIGHTS[doctrine.rarity], 0);
    let roll = nextRandom(state) * total;
    let picked = pool.length - 1;
    for (const [index, doctrine] of pool.entries()) { roll -= RARITY_WEIGHTS[doctrine.rarity]; if (roll <= 0) { picked = index; break; } }
    draw.push(...pool.splice(picked, 1));
  }
  const chosen = await ask(engine, faction, `${faction.name} has grown enough to change how it makes war. Which doctrine?`, blackboard(state, faction),
    draw.map((doctrine) => ({
      id: `doctrine_${doctrine.id}`,
      label: stacksOf(doctrine.id) > 0 ? `${doctrine.name} ${stacksOf(doctrine.id) + 1}` : doctrine.name,
      verb: "Adopt", subject: doctrine.name, art: `${doctrine.id} doctrine_${doctrine.category}`,
      tags: [doctrine.rarity, doctrine.category, ...(stacksOf(doctrine.id) > 0 ? [`Stack ${stacksOf(doctrine.id) + 1}`] : [])],
      description: `${doctrine.effect} ${doctrine.synergy}`,
      hint: { common: 1, uncommon: 1.25, rare: 1.6, legendary: 2.2 }[doctrine.rarity],
    })), "doctrine", state.turn, { provinceId: state.provinces.find((province) => province.ownerId === faction.id)?.id });
  const id = chosen.id.slice("doctrine_".length);
  if (!isDoctrineId(id)) return;
  const existing = faction.doctrines.find((entry) => entry.id === id);
  if (existing === undefined) faction.doctrines.push({ id, stacks: 1 }); else existing.stacks += 1;
  const doctrine = doctrineDefinition(id);
  await beat(publish, {
    turn: state.turn, type: "doctrine", factionId: faction.id, importance: 88,
    text: `${faction.name} adopts ${doctrine.name}${existing === undefined ? "" : ` ${existing.stacks}`} — ${doctrine.effect}`,
  });
}

/**
 * Settlements grow by being built in. One project at a time, paid for up front, finishing some
 * turns later — which is where the gold that could have bought soldiers actually goes.
 */
async function build(state: CampaignState, faction: CampaignFaction, engine: DecisionEngine, publish: Publish): Promise<void> {
  const sites = state.provinces.filter((province) =>
    province.ownerId === faction.id && province.settlement !== null
    && province.settlement.project === null && province.settlement.buildings.length < province.settlement.slots);
  // Build the best settlement first: its slots are worth the most and it is hardest to lose.
  const site = sites.sort((left, right) => (right.settlement?.tier ?? 0) - (left.settlement?.tier ?? 0))[0];
  const settlement = site?.settlement ?? null;
  if (site === undefined || settlement === null) return;
  const held = new Set(settlement.buildings);
  const everywhere = new Set(state.provinces.filter((province) => province.ownerId === faction.id).flatMap((province) => province.settlement?.buildings ?? []));
  const options = BUILDINGS.filter((building) =>
    building.cost > 0 && !held.has(building.id) && building.minTier <= settlement.tier
    && (building.kinds.length === 0 || building.kinds.includes(site.kind))
    && building.cost <= faction.gold);
  if (options.length === 0) return;
  const poor = faction.income <= faction.upkeep;
  const chosen = await ask(engine, faction, `There is room to build at ${site.name}. What should go up?`, blackboard(state, faction),
    options.slice(0, 5).map((building): Option => ({
      id: `build_${building.id}`,
      label: `${building.name} at ${site.name}`,
      verb: "Build", subject: building.name, art: building.id,
      tags: [`${building.cost}g`, `${building.turns} turn${building.turns === 1 ? "" : "s"}`, ...(building.income > 0 ? [`+${building.income}g/turn`] : [])],
      description: `${building.effect} ${building.cost} gold, ${building.turns} turn${building.turns === 1 ? "" : "s"}.${building.income > 0 ? ` +${building.income} gold/turn.` : ""}`,
      // A faction bleeding gold wants income; one that already has it wants what it cannot recruit.
      hint: (building.income > 0 ? (poor ? 2.4 : 0.9) : 1) * (everywhere.has(building.id) ? 0.7 : 1.4),
    })).concat([{ id: "wait", label: "Build nothing yet", verb: "Wait", subject: "Nothing", art: null, tags: [`Keep ${Math.round(faction.gold)}g`, "Troops first"], description: "Keep the gold for troops.", hint: faction.gold > 400 ? 0.3 : 1 }]),
    "build", state.turn, { provinceId: site.id });
  if (chosen.id === "wait") return;
  const building = BUILDINGS.find((entry) => `build_${entry.id}` === chosen.id);
  if (building === undefined || building.cost > faction.gold) return;
  faction.gold -= building.cost;
  settlement.project = { building: building.id, turnsLeft: building.turns };
  const article = /^[AEIOU]/.test(building.name) ? "an" : "a";
  await beat(publish, { turn: state.turn, type: "construction", text: `${faction.name} begins ${article} ${building.name} at ${site.name}`, factionId: faction.id, importance: 60 });
}

/**
 * A faction's own bookkeeping: income, upkeep, what it finished building and how its Jevs grew.
 * This runs inside the faction's turn rather than in one pass over everybody beforehand, so every
 * pop-out the spectator sees belongs to the faction whose turn card is on screen.
 */
async function upkeepAndProgress(state: CampaignState, faction: CampaignFaction, engines: Map<string, DecisionEngine>, publish: Publish): Promise<void> {
  const owned = state.provinces.filter((province) => province.ownerId === faction.id);
  const build = modifiersFor(faction, faction.lords.find((lord) => lord.condition !== "dead"));
  faction.income = Math.round(owned.reduce((sum, province) => sum + provinceIncome(province), 0) * build.income);
  faction.upkeep = Math.round(state.armies.filter((army) => army.factionId === faction.id).reduce((sum, army) => sum + armyUpkeep(army), 0) * build.upkeep);
  faction.upkeep = Math.round(faction.upkeep * pressure(state));
  faction.gold += faction.income - faction.upkeep;
  if (faction.gold > 0 && faction.history.at(-1)?.text === "insolvent") faction.history.push({ turn: state.turn, text: "solvent again" });
  if (faction.gold < 0) {
    // Bankruptcy costs a card rather than stalling the campaign; big armies really do ruin small empires.
    const army = state.armies.filter((entry) => entry.factionId === faction.id).sort((left, right) => armyUpkeep(right) - armyUpkeep(left))[0];
    const dropped = army?.units.pop();
    faction.gold = 0;
    const announced = faction.history.at(-1)?.text === "insolvent";
    if (!announced) faction.history.push({ turn: state.turn, text: "insolvent" });
    if (dropped !== undefined && !announced) await beat(publish, { turn: state.turn, type: "bankrupt", text: `${faction.name} cannot pay its army — ${unitDefinition(dropped.unitId).name} disbands`, factionId: faction.id, importance: 60 });
  }
  for (const province of owned) {
    const project = province.settlement?.project;
    if (project === undefined || project === null) continue;
    project.turnsLeft -= 1;
    if (project.turnsLeft > 0) continue;
    province.settlement?.buildings.push(project.building);
    if (province.settlement !== null) province.settlement.project = null;
    await beat(publish, { turn: state.turn, type: "built", text: `${buildingDefinition(project.building).name} completed at ${province.name} — ${buildingDefinition(project.building).effect}`, factionId: faction.id, importance: 75 });
  }
  for (const lord of faction.lords) {
    if (lord.condition !== "ready" && lord.condition !== "dead" && state.turn >= lord.unavailableUntil) {
      lord.condition = "ready";
      await beat(publish, { turn: state.turn, type: "lord", text: `${heroDefinition(lord.heroId).name} returns to the field`, factionId: faction.id, importance: 55 });
    }
    while (lord.experience >= lord.level * 250 && lord.level < 10) {
      lord.experience -= lord.level * 250; lord.level += 1; lord.skillPoints += 1;
      await beat(publish, { turn: state.turn, type: "level", text: `${heroDefinition(lord.heroId).name} reaches level ${lord.level}`, factionId: faction.id, importance: 60 });
    }
    // The Jev picks its own branch, so the same hero develops differently every run.
    const engine = engines.get(faction.id);
    const choices = availableSkills(lord);
    if (lord.skillPoints > 0 && choices.length > 0 && engine !== undefined) {
      const chosen = await ask(engine, faction, `${heroDefinition(lord.heroId).name} has learned something. Which path?`, { faction: faction.name, level: lord.level, taken: lord.skills },
        choices.map((skill) => ({ id: skill.id, label: skill.name, verb: "Learn", subject: skill.name, tags: [`${skill.branch} branch`, `Level ${lord.level}`], description: `${skill.text} (${skill.branch} branch)`, hint: 1 + (lord.skills.some((id) => skillById(lord.heroId, id)?.branch === skill.branch) ? 0.9 : 0) })), "skill", state.turn, { armyId: state.armies.find((army) => army.lordId === lord.id)?.id, provinceId: state.armies.find((army) => army.lordId === lord.id)?.provinceId });
      const skill = skillById(lord.heroId, chosen.id);
      if (skill !== undefined) {
        lord.skills.push(skill.id); lord.skillPoints -= 1;
        await beat(publish, { turn: state.turn, type: "skill", text: `${heroDefinition(lord.heroId).name} takes ${skill.name} — ${skill.text}`, factionId: faction.id, importance: 65 });
      }
    }
  }
}

export async function resolveTurn(state: CampaignState, engines: Map<string, DecisionEngine>, publish: Publish, runLiveBattle?: BattleRunner, pace?: Pace): Promise<void> {
  if (state.status.state === "finished") return;
  state.turn += 1;
  state.updatedAt = new Date().toISOString();
  announce = publish;
  pacer = pace ?? (async () => undefined);

  for (const army of state.armies) replenish(state, army);
  const slowGarrisons = state.turn > LAST_AGE_TURN && state.turn % 2 === 0;
  if (!slowGarrisons) for (const province of state.provinces) garrisonTick(state, province);

  if (state.turn === LAST_AGE_TURN) await beat(publish, { turn: state.turn, type: "age", text: "THE LAST AGE — armies cost more to keep, and garrisons can no longer keep pace", factionId: null, importance: 90 });

  // --- factions take their turns one after another, like a table of players: each Jev decides,
  //     its hosts march, and any fight it walks into is settled before the next faction moves.
  //     The order rotates so nobody always moves first.
  const alive0 = state.factions.filter((faction) => !faction.eliminated);
  const rotate = state.turn % Math.max(1, alive0.length);
  const sequence = [...alive0.slice(rotate), ...alive0.slice(0, rotate)];
  for (const faction of sequence) {
    const engine = engines.get(faction.id);
    if (engine === undefined) continue;
    state.phase = "planning";
    const hosts = state.armies.filter((entry) => entry.factionId === faction.id);
    const leading = hosts.map((army) => lordOf(state, army)).find((entry) => entry !== undefined)
      ?? faction.lords.find((entry) => entry.condition !== "dead");
    await beat(publish, {
      turn: state.turn, type: "stage", text: `${faction.name}'s turn`, factionId: faction.id, importance: 0,
      stage: {
        factionId: faction.id, phase: "turn",
        lord: leading === undefined ? null : heroDefinition(leading.heroId).name,
        hosts: hosts.length,
        provinces: state.provinces.filter((province) => province.ownerId === faction.id).length,
      },
    });
    // Held even for a faction with nothing to do: a turn that flashes past in no time at all is the
    // main reason the match is hard to follow.
    await pacer(TURN_CARD_MS);
    observe(state, faction);
    await upkeepAndProgress(state, faction, engines, publish);
    await adoptDoctrine(state, faction, engine, publish);
    await diplomacy(state, faction, engines, publish);
    await plan(state, faction, engine, publish);
    state.phase = "resolving";
    for (const pending of faction.pendingOrders) {
      const army = armyById(state, pending.armyId);
      if (army === undefined) continue;
      army.order = pending.order;
      army.route = pending.order.targetProvinceId === null ? [] : routeTo(state, army.provinceId, pending.order.targetProvinceId);
    }
    faction.pendingOrders = [];
    for (const army of state.armies.filter((entry) => entry.factionId === faction.id)) {
      const from = { x: army.x, y: army.y };
      army.maxMovement = Math.round(MOVEMENT_PER_TURN * modifiersFor(faction, lordOf(state, army)).movement);
      const path = march(state, army);
      if (path.length > 0) {
        const lord = lordOf(state, army);
        const distance = path.reduce((sum, point, index) => sum + Math.hypot(point.x - (path[index - 1] ?? from).x, point.y - (path[index - 1] ?? from).y), 0);
        const ms = Math.round(MARCH_MS * Math.max(0.45, Math.min(1, distance / MOVEMENT_PER_TURN)));
        // "Kael · March on Old Foundry" five turns running tells the spectator nothing about progress,
        // so the caption carries the destination and how much of the road is left.
        const who = lord === undefined ? army.name : heroDefinition(lord.heroId).name;
        const destination = army.order.targetProvinceId === null ? undefined : provinceById(state, army.order.targetProvinceId);
        const left = army.route.length;
        const heading = destination === undefined ? army.order.label.toLowerCase() : `marches on ${destination.name}`;
        const progress = left === 0 ? " · arriving" : left === 1 ? " · one province short" : ` · ${left} provinces to go`;
        await beat(publish, { turn: state.turn, type: "march", text: `${who} ${heading}${progress}`, factionId: faction.id, importance: 20, march: { armyId: army.id, path: [from, ...path], ms } });
        await pacer(ms);
      }
      await resolveArrival(state, army, engines, publish, runLiveBattle);
      await raid(state, army, publish);
    }
    await beat(publish, {
      turn: state.turn, type: "stage", text: `${faction.name}'s turn ends`, factionId: faction.id, importance: 0,
      stage: { factionId: faction.id, phase: "end" }, forecast: forecastFor(state, faction),
    });
  }

  // --- a Jev who dies leaves something behind for the faction that killed them.
  for (const faction of state.factions) for (const lord of faction.lords) {
    if (lord.condition !== "dead" || lord.relics.includes("__looted")) continue;
    lord.relics.push("__looted");
    const killer = state.battles.at(-1);
    const winnerId = killer === undefined ? null : killer.outcome === "attacker" ? killer.attackerId : killer.defenderId;
    const winner = winnerId === null ? undefined : factionById(state, winnerId);
    const heir = winner?.lords.find((entry) => entry.condition !== "dead");
    const prize = freeRelic(state, lord.heroId);
    if (winner === undefined || heir === undefined || prize === undefined || winner.id === faction.id) continue;
    heir.relics.push(prize.id);
    await beat(publish, { turn: state.turn, type: "relic", text: `${heroDefinition(lord.heroId).name} falls; ${winner.name} takes the ${prize.name} — ${prize.text}`, factionId: winner.id, importance: 92 });
  }

  // --- armies whose cards are all gone, and lords who are not coming back
  for (const army of [...state.armies]) {
    const lord = lordOf(state, army);
    if (army.units.length > 0 && lord?.condition !== "dead") continue;
    state.armies.splice(state.armies.indexOf(army), 1);
    const faction = factionById(state, army.factionId);
    if (faction !== undefined) {
      faction.armies = faction.armies.filter((id) => id !== army.id);
      await beat(publish, { turn: state.turn, type: "destroyed", text: `${army.name} is destroyed`, factionId: faction.id, importance: 80 });
    }
  }

  // --- victory: the last faction holding a capital
  for (const faction of state.factions) {
    if (faction.eliminated) continue;
    // Losing the capital is catastrophic, not instantly fatal: a faction is out once it holds no
    // settlement and has no army left to take one back.
    const settlements = state.provinces.filter((province) => province.ownerId === faction.id && province.settlement !== null);
    const armies = state.armies.filter((army) => army.factionId === faction.id && army.units.length > 0);
    if (settlements.length > 0 || armies.length > 0) continue;
    faction.eliminated = true; faction.eliminatedAt = state.turn;
    // Their ground goes back to nobody. Left flagged to a fallen faction it could never be taken,
    // which quietly put domination out of everyone's reach.
    for (const province of state.provinces) if (province.ownerId === faction.id) province.ownerId = null;
    await beat(publish, { turn: state.turn, type: "eliminated", text: `${faction.name} has fallen`, factionId: faction.id, importance: 100 });
  }
  const alive = state.factions.filter((faction) => !faction.eliminated);
  const settled = state.provinces.filter((province) => province.settlement !== null);
  for (const faction of alive) {
    const share = settled.filter((province) => province.ownerId === faction.id).length / Math.max(1, settled.length);
    const capitals = state.factions.filter((other) => state.provinces.find((province) => province.id === `cap_${other.id}`)?.ownerId === faction.id).length;
    if (share < dominationShare(state) && capitals < state.factions.length) continue;
    state.status = { state: "finished", winnerId: faction.id, reason: capitals >= state.factions.length ? `${faction.name} holds every capital` : `${faction.name} dominates the map` };
    state.phase = "finished";
    await beat(publish, { turn: state.turn, type: "victory", text: state.status.reason, factionId: faction.id, importance: 100 });
    return;
  }
  if (alive.length <= 1) {
    const winner = alive[0];
    state.status = { state: "finished", winnerId: winner?.id ?? null, reason: winner === undefined ? "Everyone fell" : `${winner.name} holds the last capital` };
    state.phase = "finished";
    return;
  }
  if (state.turn < CAMPAIGN_LIMIT) return;
  // The age runs out. Whoever holds the most ground takes it, gold and then kills breaking ties.
  const standing = [...alive].sort((left, right) =>
    settled.filter((province) => province.ownerId === right.id).length - settled.filter((province) => province.ownerId === left.id).length
    || right.gold - left.gold
    || right.lords.reduce((sum, lord) => sum + lord.kills, 0) - left.lords.reduce((sum, lord) => sum + lord.kills, 0));
  const leader = standing[0];
  if (leader === undefined) return;
  state.status = { state: "finished", winnerId: leader.id, reason: `${leader.name} holds the most ground as the age ends` };
  state.phase = "finished";
  await beat(publish, { turn: state.turn, type: "victory", text: state.status.reason, factionId: leader.id, importance: 100 });
}
