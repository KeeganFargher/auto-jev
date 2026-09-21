import { KITS, type AbilityDefinition } from "./abilities.js";
import { heroDefinition, type HeroId } from "./heroes.js";
import { cardStrength, lordOf, provinceById } from "./army.js";
import { lordAftermath, nextRandom, predict, type BattleSides } from "./resolve.js";
import { RANK_NAMES } from "./units.js";
import type { BattleReport } from "./types.js";
import type { Biome, CampaignState, Lord, UnitCard, UnitCategory, UnitId } from "./types.js";
import { rankBonus, unitDefinition } from "./units.js";

export const FIELD_WIDTH = 120;
export const FIELD_DEPTH = 88;
export const BATTLE_TICK_MS = 100;
/** Three minutes at one tick per 100ms; a battle that has not resolved by then is a stalemate. */
export const BATTLE_TIMEOUT = 2400;
/**
 * Blows are scaled so a duel between two evenly matched men resolves in ten to fifteen seconds.
 * Melee is one-against-one now, so a blow has to be worth something: under the old free-for-all
 * nothing died to a duel at all, and every kill came from a dozen men piling onto one victim.
 */
export const BLOW_SCALE = 1.1;
/**
 * Armour sheds a fraction of a blow instead of subtracting from it. Subtraction meant a militiaman
 * could swing at Shieldguard all afternoon for nothing — measured at eleven minutes for one kill.
 */
const ARMOUR_SOFTNESS = 10;
/** Models stand this far apart in formation; it is also roughly a man's reach. */
const SPACING = 2.4;
/** How fast a block walks. Slow enough that the approach is a phase of the battle, not an instant. */
const ADVANCE = 0.24;
/** The unit-order layer re-reads the field on this cadence rather than every tick. */
const THINK_INTERVAL = 12;
/** A fighter without an opponent steps this far out of formation to find one, and no further. */
const SEEK_RANGE = 9;
/** How far a unit may stray from its own army before its orders pull it back. */
const LEASH = 34;
/** Where the wall stands in a siege. The assault forms up against it; the garrison holds behind it. */
const WALL_LINE = FIELD_DEPTH * 0.58;

export type Side = "attacker" | "defender";
/**
 * What a unit is trying to do with itself. This is the layer that was missing: without it every
 * model ran at its own nearest enemy, the two armies walked through each other, and the fight
 * became one undifferentiated crowd.
 */
export type UnitStance = "hold" | "engage" | "skirmish" | "flank";
export type UnitState = "forming" | "advancing" | "engaged" | "withdrawing" | "broken";

export interface Fighter {
  id: string; side: Side; unitId: UnitId; cardId: string; lordId: string | null;
  x: number; y: number; health: number; maxHealth: number;
  /** Whoever this fighter is set against: its duel partner in melee, its mark at range. */
  targetId: string | null; nextAttackAt: number;
  /** Place in the unit's formation. The file decides frontage, the rank decides who waits behind. */
  slot: number;
  /** Where the model is looking, in field space. The renderer reads this rather than guessing. */
  facing: number;
  /** Distance run since last contact; a mobile unit converts it into a charge on its first blow. */
  charge: number;
  state: "advancing" | "fighting" | "routing" | "dead";
  /** Cues the renderer consumes; the keys match what combat-effects.js already observes. */
  effects: Record<string, number>;
}
export interface BattleUnit {
  id: string; cardId: string; unitId: UnitId; side: Side;
  morale: number; routed: boolean; startingCount: number;
  stance: UnitStance;
  state: UnitState;
  /** The enemy unit this one is set against; every model in the block inherits it. */
  targetUnitId: string | null;
  /** Where the block wants to stand and which way it wants to look. */
  ax: number; ay: number; facing: number;
  /** How many men stand abreast. Everyone behind the first rank waits their turn. */
  frontage: number;
  /** Next tick the order layer re-reads the field for this unit. */
  thinkAt: number;
  /** Cavalry: when the current run through the enemy began, so the cycle can pull them out again. */
  runAt: number;
}
/** A Jev mid-cast: they stand still through the telegraph, and the payoff lands at resolveAt. */
export interface Casting { slot: number; castId: number; at: number; resolveAt: number; targetId: string | null; tx: number; ty: number }
export interface BattleLord {
  id: string; side: Side; heroId: HeroId; fighterId: string; level: number;
  /** Tick at which each kit slot is ready again. */
  cooldowns: number[];
  casting: Casting | null;
}
/** One ability cast as the renderer sees it: where it was aimed, when it lands and whom it touched. */
export interface Cast {
  id: number; lordId: string; heroId: HeroId; side: Side; slot: number; abilityId: string;
  at: number; resolveAt: number;
  /** Where the Jev stood when the cast began, and where it was aimed. */
  x: number; y: number; tx: number; ty: number;
  /** Where a dash or blink put the Jev, filled at resolution. */
  land: { x: number; y: number } | null;
  /** Fighters the payoff touched, filled at resolution. */
  hits: string[];
}
/**
 * The ground the battle is fought over, as a coarse grid sampled bilinearly. Height is in field
 * units and cover runs 0 to 1, where 1 is dense wood. Sent once with the opening frame.
 */
export interface BattleTerrain { cols: number; rows: number; height: number[]; cover: number[] }
export interface BattleState {
  id: string; provinceId: string; biome: Biome; siege: boolean;
  /** Generated from the province, so the same ground fights the same way every time. */
  terrain: BattleTerrain;
  attackerFactionId: string; defenderFactionId: string;
  units: BattleUnit[]; fighters: Fighter[];
  lords: BattleLord[];
  /** Recent casts, kept a few seconds so a late-joining frame can still draw the telegraph. */
  casts: Cast[];
  tick: number; phase: "deploying" | "fighting" | "finished";
  outcome: "attacker" | "defender" | "draw" | null;
  walls: number;
  /**
   * What holding the ground is worth, on the same terms the campaign's own odds use. Without it the
   * live battle ignored home advantage and walls entirely, and the attacker won nine fights in ten
   * that the pre-battle estimate called even.
   */
  edge: { attacker: number; defender: number };
  randomState: number; sequence: number;
}


/** How much relief and wood each biome carries onto its battlefield. */
const GROUND: Record<Biome, { relief: number; wood: number }> = {
  grassland: { relief: 2.2, wood: 0.1 },
  forest: { relief: 2.6, wood: 0.55 },
  mountain: { relief: 6.5, wood: 0.15 },
  marsh: { relief: 1.2, wood: 0.3 },
  badlands: { relief: 4.2, wood: 0.05 },
};
const TERRAIN_COLS = 17, TERRAIN_ROWS = 13;
/**
 * The battlefield a province generates: two or three broad ridges and a few woods, seeded from the
 * province id. Broad shapes rather than noise, so high ground is somewhere a line can march to.
 */
export function makeTerrain(provinceId: string, biome: Biome): BattleTerrain {
  let seed = 2166136261;
  for (const letter of provinceId) seed = Math.imul(seed ^ letter.charCodeAt(0), 16777619) >>> 0;
  const random = (): number => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed / 4294967296; };
  const shape = GROUND[biome];
  const ridges = Array.from({ length: 2 + Math.floor(random() * 2) }, () => ({
    x: random(), y: random(), spread: 0.22 + random() * 0.3, lift: (0.45 + random() * 0.55) * shape.relief,
  }));
  const woods = Array.from({ length: 2 + Math.floor(random() * 3) }, () => ({ x: random(), y: random(), spread: 0.12 + random() * 0.16 }));
  const height: number[] = [], cover: number[] = [];
  for (let row = 0; row < TERRAIN_ROWS; row++) for (let col = 0; col < TERRAIN_COLS; col++) {
    const u = col / (TERRAIN_COLS - 1), v = row / (TERRAIN_ROWS - 1);
    let lift = 0;
    for (const ridge of ridges) {
      const distance = Math.hypot(u - ridge.x, v - ridge.y);
      lift += ridge.lift * Math.exp(-(distance * distance) / (2 * ridge.spread * ridge.spread));
    }
    let wood = shape.wood * 0.3;
    for (const patch of woods) {
      const distance = Math.hypot(u - patch.x, v - patch.y);
      wood += shape.wood * Math.exp(-(distance * distance) / (2 * patch.spread * patch.spread));
    }
    height.push(Math.round(lift * 100) / 100);
    cover.push(Math.round(Math.min(1, wood) * 100) / 100);
  }
  return { cols: TERRAIN_COLS, rows: TERRAIN_ROWS, height, cover };
}
/** Bilinear sample of one terrain layer at a field position. */
function sample(terrain: BattleTerrain, layer: number[], x: number, y: number): number {
  const u = Math.max(0, Math.min(1, x / FIELD_WIDTH)) * (terrain.cols - 1);
  const v = Math.max(0, Math.min(1, y / FIELD_DEPTH)) * (terrain.rows - 1);
  const col = Math.min(terrain.cols - 2, Math.floor(u)), row = Math.min(terrain.rows - 2, Math.floor(v));
  const fx = u - col, fy = v - row;
  const at = (c: number, r: number): number => layer[r * terrain.cols + c] ?? 0;
  const top = at(col, row) * (1 - fx) + at(col + 1, row) * fx;
  const bottom = at(col, row + 1) * (1 - fx) + at(col + 1, row + 1) * fx;
  return top * (1 - fy) + bottom * fy;
}
export const elevationAt = (battle: BattleState, x: number, y: number): number => sample(battle.terrain, battle.terrain.height, x, y);
export const coverAt = (battle: BattleState, x: number, y: number): number => sample(battle.terrain, battle.terrain.cover, x, y);

/**
 * Reach, cadence, how wide the block stands, and how many men can set about one model at once.
 * `duels` is the frontage rule in miniature: one man fights one man, so a line reads as a line of
 * pairs rather than a scrum. A monster is big enough to be surrounded, and so is a Jev.
 */
interface Profile { range: number; interval: number; frontage: number; duels: number }
function profile(category: UnitCategory): Profile {
  switch (category) {
    case "ranged": return { range: 26, interval: 30, frontage: 6, duels: 1 };
    case "mage": return { range: 22, interval: 40, frontage: 4, duels: 1 };
    case "siege": return { range: 44, interval: 60, frontage: 2, duels: 1 };
    case "mobile": return { range: 3.0, interval: 12, frontage: 4, duels: 1 };
    case "monster": return { range: 3.6, interval: 20, frontage: 1, duels: 2 };
    case "frontline": return { range: 2.8, interval: 14, frontage: 6, duels: 1 };
    default: return { range: 2.8, interval: 14, frontage: 5, duels: 1 };
  }
}
/** The default a unit fights under. A Jev may override it later; these are what read correctly. */
function defaultStance(category: UnitCategory): UnitStance {
  switch (category) {
    case "frontline": return "hold";
    case "ranged": case "mage": case "siege": return "skirmish";
    case "mobile": return "flank";
    default: return "engage";
  }
}
const isRanged = (category: UnitCategory): boolean => category === "ranged" || category === "mage" || category === "siege";
/** How many men may set about this one model at once. */
function duelCapacity(fighter: Fighter): number {
  if (fighter.lordId !== null) return 2;
  return profile(unitDefinition(fighter.unitId).category).duels;
}
function random(battle: BattleState): number {
  battle.randomState = (Math.imul(battle.randomState, 1664525) + 1013904223) >>> 0;
  return battle.randomState / 4294967296;
}

/** Which way a side looks when it deploys: attackers up the field, defenders down it. */
const facingOf = (side: Side): number => (side === "attacker" ? Math.PI / 2 : -Math.PI / 2);
/**
 * Where one model belongs in its block. The file spreads it across the frontage, the rank sets it
 * back behind the men in front — which is what stops eight men mobbing the same victim.
 */
function slotPosition(unit: BattleUnit, slot: number): { x: number; y: number } {
  const file = slot % unit.frontage, rank = Math.floor(slot / unit.frontage);
  const fx = Math.cos(unit.facing), fy = Math.sin(unit.facing);
  const rx = Math.sin(unit.facing), ry = -Math.cos(unit.facing);
  const across = (file - (unit.frontage - 1) / 2) * SPACING;
  return { x: unit.ax + rx * across - fx * rank * SPACING, y: unit.ay + ry * across - fy * rank * SPACING };
}

/**
 * Lays a side out as a line: frontline forward, shooters behind it, horse on the wings, siege at the
 * back. The two armies start far enough apart that closing the distance is a phase of the battle —
 * the shooting phase — rather than something that happens before the spectator has looked up.
 */
function deploy(battle: BattleState, cards: UnitCard[], side: Side, lord: Lord | undefined): void {
  // The defender picks their ground: of the bands they could form on, they take the highest one.
  const bands = [0, 1, 2, 3].map((step) => (side === "attacker" ? 4 + step * 3 : FIELD_DEPTH - 4 - step * 3));
  const meanHeight = (y: number): number => [0.2, 0.35, 0.5, 0.65, 0.8]
    .reduce((sum, across) => sum + elevationAt(battle, FIELD_WIDTH * across, y), 0) / 5;
  const front = side === "defender"
    ? bands.reduce((best, y) => (meanHeight(y) > meanHeight(best) + 0.15 ? y : best), bands[0] ?? FIELD_DEPTH - 4)
    : 4;
  const toward = side === "attacker" ? 1 : -1;
  // Rank 0 is the front rank, so it needs the GREATEST depth: depth is measured toward the enemy.
  const rank = (category: UnitCategory): number =>
    category === "frontline" ? 0 : category === "damage" || category === "monster" ? 1 : category === "mobile" ? 0 : category === "siege" ? 3 : 2;
  const depthOf = (category: UnitCategory): number => (3 - rank(category)) * 5;
  const ordered = [...cards].sort((left, right) => rank(unitDefinition(left.unitId).category) - rank(unitDefinition(right.unitId).category));
  const wings: UnitCard[] = ordered.filter((card) => unitDefinition(card.unitId).category === "mobile");
  const centre = ordered.filter((card) => !wings.includes(card));
  const place = (card: UnitCard, index: number, of: number, depth: number, spread: number, offset: number): void => {
    const definition = unitDefinition(card.unitId);
    const shape = profile(definition.category);
    battle.sequence += 1;
    const unitId = `bu-${battle.sequence}`;
    const blockX = Math.max(8, Math.min(FIELD_WIDTH - 8, offset + (of <= 1 ? 0 : (index / (of - 1) - 0.5) * spread)));
    const unit: BattleUnit = {
      id: unitId, cardId: card.id, unitId: card.unitId, side, morale: 100, routed: false, startingCount: card.models,
      stance: defaultStance(definition.category), state: "forming", targetUnitId: null,
      ax: blockX, ay: front + toward * depth, facing: facingOf(side),
      frontage: Math.min(shape.frontage, card.models), thinkAt: 0, runAt: 0,
    };
    battle.units.push(unit);
    for (let slot = 0; slot < card.models; slot++) {
      battle.sequence += 1;
      const at = slotPosition(unit, slot);
      battle.fighters.push({
        id: `f-${battle.sequence}`, side, unitId: card.unitId, cardId: unitId, lordId: null,
        x: Math.max(2, Math.min(FIELD_WIDTH - 2, at.x)), y: at.y,
        health: definition.health * rankBonus(card.rank), maxHealth: definition.health * rankBonus(card.rank),
        targetId: null, nextAttackAt: 0, slot, facing: unit.facing, charge: 0, state: "advancing", effects: {},
      });
    }
  };
  // Each rank spans the whole frontage on its own. Spreading the ordered list instead put the
  // spearmen down the left of the field and the archers off on the right, which is not a battle line.
  const byRank = new Map<number, UnitCard[]>();
  for (const card of centre) {
    const at = rank(unitDefinition(card.unitId).category);
    const list = byRank.get(at);
    if (list === undefined) byRank.set(at, [card]); else list.push(card);
  }
  for (const cards of byRank.values()) {
    const spread = Math.min(78, cards.length * 14);
    cards.forEach((card, index) => place(card, index, cards.length, depthOf(unitDefinition(card.unitId).category), spread, FIELD_WIDTH / 2));
  }
  wings.forEach((card, index) => place(card, index % 2, 2, 12, 0, index % 2 === 0 ? 16 : FIELD_WIDTH - 16));
  if (lord === undefined || lord.condition !== "ready") return;
  const hero = heroDefinition(lord.heroId);
  battle.sequence += 1;
  const fighterId = `f-${battle.sequence}`;
  battle.units.push({
    id: `lord-${side}`, cardId: `lord-${side}`, unitId: "swordsmen", side, morale: 100, routed: false, startingCount: 1,
    stance: "engage", state: "forming", targetUnitId: null,
    ax: FIELD_WIDTH / 2, ay: front + toward * 7, facing: facingOf(side), frontage: 1, thinkAt: 0, runAt: 0,
  });
  battle.fighters.push({
    id: fighterId, side, unitId: "swordsmen", cardId: `lord-${side}`, lordId: lord.id,
    x: FIELD_WIDTH / 2, y: front + toward * 7,
    health: hero.stats.health * (1 + lord.level * 0.15), maxHealth: hero.stats.health * (1 + lord.level * 0.15),
    targetId: null, nextAttackAt: 0, slot: 0, facing: facingOf(side), charge: 0, state: "advancing", effects: {},
  });
  // The poke comes early, the signature once the lines meet, the ultimate deep into the fight.
  battle.lords.push({ id: lord.id, side, heroId: lord.heroId, fighterId, level: lord.level, cooldowns: [40, 140, 380], casting: null });
}

/** Builds the real-time battle that a campaign encounter drops into. */
export function createBattle(state: CampaignState, sides: BattleSides): BattleState {
  const province = provinceById(state, sides.province.id);
  const battle: BattleState = {
    id: `battle-${state.sequence + 1}`, provinceId: sides.province.id, biome: province?.biome ?? "grassland", siege: sides.siege,
    terrain: makeTerrain(sides.province.id, province?.biome ?? "grassland"),
    attackerFactionId: sides.attacker.factionId, defenderFactionId: sides.defenderFactionId,
    units: [], fighters: [], lords: [], casts: [], tick: 0, phase: "deploying", outcome: null,
    walls: sides.siege ? sides.province.settlement?.walls ?? 0 : 0,
    // The same two factors resolve.predict() already prices in, so the live fight and the odds the
    // spectator was shown before it agree about who was favoured.
    edge: {
      attacker: 1,
      defender: (sides.province.ownerId === sides.defenderFactionId ? 1.3 : 1)
        * (sides.siege ? 1 + (sides.province.settlement?.walls ?? 0) / 500 : 1),
    },
    randomState: (state.randomState ^ 0x85ebca6b) >>> 0, sequence: 0,
  };
  state.sequence += 1;
  deploy(battle, sides.attacker.units, "attacker", lordOf(state, sides.attacker));
  deploy(battle, sides.defender?.units ?? sides.province.garrison, "defender", sides.defender === null ? undefined : lordOf(state, sides.defender));
  battle.phase = "fighting";
  return battle;
}

const living = (battle: BattleState): Fighter[] => battle.fighters.filter((fighter) => fighter.state !== "dead");
function unitOf(battle: BattleState, fighter: Fighter): BattleUnit | undefined { return battle.units.find((unit) => unit.id === fighter.cardId); }

/** A unit as the order layer sees it: its surviving models and where their mass actually is. */
interface UnitView { unit: BattleUnit; models: Fighter[]; cx: number; cy: number }
function survey(battle: BattleState): Map<string, UnitView> {
  const views = new Map<string, UnitView>();
  const grouped = new Map<string, Fighter[]>();
  for (const fighter of battle.fighters) {
    if (fighter.state === "dead" || fighter.state === "routing") continue;
    const list = grouped.get(fighter.cardId);
    if (list === undefined) grouped.set(fighter.cardId, [fighter]); else list.push(fighter);
  }
  for (const unit of battle.units) {
    const models = grouped.get(unit.id);
    if (models === undefined || models.length === 0) continue;
    let cx = 0, cy = 0;
    for (const model of models) { cx += model.x; cy += model.y; }
    views.set(unit.id, { unit, models, cx: cx / models.length, cy: cy / models.length });
  }
  return views;
}

/**
 * The layer that was missing. Once every twelve ticks a unit decides, as a unit, what it is fighting
 * and where its block should stand; the models below it only ever hold their place in that block or
 * duel whoever is opposite them. Everything the fight was short of — a line that stays a line, an
 * approach worth watching, horse that circle instead of shuffling — falls out of this function.
 */
function think(battle: BattleState, view: UnitView, views: Map<string, UnitView>, centre: { x: number; y: number }): void {
  const unit = view.unit;
  unit.thinkAt = battle.tick + THINK_INTERVAL;
  const definition = unitDefinition(unit.unitId);
  const shape = profile(definition.category);
  const foes: UnitView[] = [];
  let friendlyLine: number | null = null, lineCount = 0;
  for (const other of views.values()) {
    if (other.unit.side !== unit.side) { foes.push(other); continue; }
    // Where our own line is standing, so the shooters know what they are posting behind. A Jev is
    // not the line: counting them meant that when the Jev went wandering, the whole shooting line
    // picked up and followed, all the way to the far baseline.
    if (other.unit.id.startsWith("lord-")) continue;
    const category = unitDefinition(other.unit.unitId).category;
    if (category === "frontline" || category === "damage" || category === "monster") {
      friendlyLine = (friendlyLine ?? 0) + other.cy; lineCount += 1;
    }
  }
  if (lineCount > 0 && friendlyLine !== null) friendlyLine /= lineCount;
  if (foes.length === 0) { unit.state = "engaged"; return; }

  // --- what are we fighting? Counters first, then distance; horse go looking for the soft backline.
  let target: UnitView | null = null, bestScore = Infinity;
  for (const foe of foes) {
    const gap = Math.hypot(foe.cx - view.cx, foe.cy - view.cy);
    const foeDefinition = unitDefinition(foe.unit.unitId);
    let score = gap;
    if (definition.strongAgainst.includes(foeDefinition.category)) score *= 0.55;
    // Something that has got in behind us is somebody else's problem: a line that turns round to
    // chase a Jev who blinked past it has stopped being a line. Horse are the exception — chasing
    // whatever got behind the line is exactly their job.
    if (unit.stance !== "flank" && (foe.cy - view.cy) * (unit.side === "attacker" ? 1 : -1) < -4) score *= 3.5;
    if (unit.stance === "flank") {
      if (isRanged(foeDefinition.category)) score *= 0.4;
      if (foe.unit.state === "engaged") score *= 0.7;
      // Spears are what kills cavalry; go round them unless there is nothing else on the field.
      if (foeDefinition.strongAgainst.includes("mobile")) score *= 2.4;
    }
    if (foe.unit.morale < 45) score *= 0.85;
    if (score < bestScore) { bestScore = score; target = foe; }
  }
  if (target === null) return;
  unit.targetUnitId = target.unit.id;
  // Close the gaps the dead left, so a worn-down block still stands in ranks instead of in tatters.
  [...view.models].sort((left, right) => left.slot - right.slot).forEach((model, index) => { model.slot = index; });
  const here = { x: view.cx, y: view.cy }, there = { x: target.cx, y: target.cy };
  const toTarget = headingTo(here, there);
  const gap = distance(here, there);
  const back = unit.side === "attacker" ? -1 : 1;
  // Late in a stalemate everyone is ordered forward: a battle that never resolves is worse than a
  // battle someone loses. Horse keep cycling — that is the one behaviour that is already decisive.
  const stance: UnitStance = battle.tick > 1500 && unit.stance !== "flank" ? "engage"
    // Shooters with no line left in front of them stop being shooters and start being the line.
    : unit.stance === "skirmish" && lineCount === 0 ? "engage" : unit.stance;

  switch (stance) {
    case "hold": {
      // Walk up to the middle and wait there. Not crossing the midline is what stops the two
      // armies walking through each other and swapping ends, which is what they used to do.
      const midline = FIELD_DEPTH / 2 + back * 2;
      unit.ax = target.cx;
      const wanted = unit.side === "attacker" ? Math.min(target.cy - 3, midline) : Math.max(target.cy + 3, midline);
      // A shield wall goes forward or it stands. It never walks back down the field, which is what
      // it did when something slipped in behind it and became the nearest thing to hit.
      unit.ay = unit.side === "attacker" ? Math.max(wanted, unit.ay) : Math.min(wanted, unit.ay);
      unit.state = gap < 8 ? "engaged" : "advancing";
      break;
    }
    case "engage": {
      let ax = target.cx - Math.cos(toTarget) * 2.2, ay = target.cy - Math.sin(toTarget) * 2.2;
      // Leashed to their own army: a unit that chases past this is a unit that dies alone.
      const stray = Math.hypot(ax - centre.x, ay - centre.y);
      if (stray > LEASH) { ax = centre.x + (ax - centre.x) / stray * LEASH; ay = centre.y + (ay - centre.y) / stray * LEASH; }
      unit.ax = ax; unit.ay = ay;
      unit.state = gap < 9 ? "engaged" : "advancing";
      break;
    }
    case "skirmish": {
      let threat = Infinity;
      for (const foe of foes) for (const model of foe.models) threat = Math.min(threat, distance(here, model));
      const line = friendlyLine ?? centre.y;
      if (threat < 13) {
        // Reached. Retire through the line rather than being caught in the open.
        unit.state = "withdrawing";
        unit.ax = view.cx; unit.ay = line + back * 9;
      } else if (lineCount > 0 && Math.abs(line - FIELD_DEPTH / 2) < 10) {
        // The lines have met: post up behind our own and shoot over it.
        unit.state = gap < shape.range ? "engaged" : "advancing";
        unit.ax = target.cx; unit.ay = line + back * 7;
      } else {
        // Screen out in front while there is still ground between the armies.
        unit.state = gap < shape.range ? "engaged" : "advancing";
        unit.ax = target.cx; unit.ay = line - back * 6;
      }
      // Shooters stay in their own half whatever happens. Without this floor a withdraw can chase
      // its own reference point off the end of the field.
      unit.ay = unit.side === "attacker" ? Math.min(unit.ay, FIELD_DEPTH / 2) : Math.max(unit.ay, FIELD_DEPTH / 2);
      break;
    }
    case "flank": {
      // Horse fight in runs: swing wide, hit what is soft, stay in it a few seconds, pull out and
      // build another charge. One long shove in the press is worth nothing and looks like nothing.
      // Horse wait on the wing until the lines actually meet. Sent in ahead of the infantry they
      // arrive alone in the enemy's backline and are simply killed — which is what they used to do.
      let committed = battle.tick > 900, hasLine = false;
      for (const other of views.values()) {
        // A Jev who has blinked behind the enemy is not "the lines have met"; ignore them here or
        // the horse commit within seconds of the first cast, alone, and are killed for it.
        if (other.unit.side !== unit.side || other.unit.stance === "flank" || other.unit.id.startsWith("lord-")) continue;
        hasLine = true;
        if (other.unit.state === "engaged") { committed = true; break; }
      }
      // Nothing left to wait for: the horse are the army now, so they go in.
      if (!hasLine) committed = true;
      if (!committed) {
        unit.ax = view.cx < FIELD_WIDTH / 2 ? 12 : FIELD_WIDTH - 12;
        unit.ay = (friendlyLine ?? centre.y) + back * 2;
        unit.state = "advancing";
        break;
      }
      // Pull out of a melee that is grinding them down — but never out of shooters or broken men.
      // Riding back out of a block of archers to set up a second charge just means crossing their
      // field of fire twice, and it lost horse-versus-bow every time it was measured.
      const grinding = !isRanged(unitDefinition(target.unit.unitId).category) && !target.unit.routed;
      if (grinding && unit.state === "engaged" && battle.tick - unit.runAt > 70) { unit.state = "withdrawing"; unit.runAt = battle.tick; }
      else if (unit.state === "withdrawing" && battle.tick - unit.runAt > 45) { unit.state = "advancing"; unit.runAt = battle.tick; }
      if (unit.state === "withdrawing") {
        const out = headingTo(there, here);
        unit.ax = target.cx + Math.cos(out) * 30; unit.ay = target.cy + Math.sin(out) * 30;
        break;
      }
      const exposed = angleBetween(headingTo(there, here), target.unit.facing) > Math.PI * 0.45;
      if (gap < 12) {
        // Close enough: ride straight in. Aiming at the rear once already behind them made the horse
        // orbit forever, because a unit turns to face whoever is behind it and its rear moves again.
        unit.ax = target.cx; unit.ay = target.cy;
      } else if (exposed) {
        unit.ax = target.cx - Math.cos(target.unit.facing) * 12;
        unit.ay = target.cy - Math.sin(target.unit.facing) * 12;
      } else {
        const edge = view.cx < FIELD_WIDTH / 2 ? 11 : FIELD_WIDTH - 11;
        unit.ax = edge; unit.ay = view.cy + (target.cy - view.cy) * 0.75;
      }
      if (gap < 7) { if (unit.state !== "engaged") unit.runAt = battle.tick; unit.state = "engaged"; }
      else if (unit.state !== "advancing") unit.state = "advancing";
      break;
    }
  }
  // Two blocks ordered onto the same enemy used to be handed the same spot on the field and pile
  // into each other. Share the frontage out instead, so they arrive side by side as a line.
  if (stance === "hold" || stance === "engage") {
    const sharing: string[] = [unit.id];
    for (const other of views.values()) {
      if (other.unit.side !== unit.side || other.unit.id === unit.id) continue;
      if (other.unit.targetUnitId === target.unit.id && (other.unit.stance === "hold" || other.unit.stance === "engage")) sharing.push(other.unit.id);
    }
    if (sharing.length > 1) {
      sharing.sort();
      const index = sharing.indexOf(unit.id);
      const step = unit.frontage * SPACING + 3;
      const across = (index - (sharing.length - 1) / 2) * step;
      unit.ax += Math.sin(toTarget) * across;
      unit.ay += -Math.cos(toTarget) * across;
    }
  }
  // A siege is fought at the wall. Attackers used to halt at the midline, so nobody ever reached
  // the wall, nothing ever knocked it down, and the garrison's stonework counted for nothing.
  if (battle.siege && battle.walls > 0) {
    if (unit.side === "attacker" && stance !== "skirmish") unit.ay = Math.max(unit.ay, WALL_LINE - 1);
    if (unit.side === "defender") unit.ay = Math.max(unit.ay, WALL_LINE + 5);
  }
  unit.ax = Math.max(6, Math.min(FIELD_WIDTH - 6, unit.ax));
  unit.ay = Math.max(2, Math.min(FIELD_DEPTH - 2, unit.ay));
  // A block looks where it is going while it is going somewhere, and at its enemy once it arrives.
  const toAnchor = Math.hypot(unit.ax - view.cx, unit.ay - view.cy);
  unit.facing = unit.state === "advancing" && toAnchor > 5 ? headingTo(here, { x: unit.ax, y: unit.ay }) : toTarget;
}

/**
 * Matched combat, after Total War: melee is one man against one man, facing each other. Pairs are
 * mutual and stick until somebody dies or is dragged out of reach, so a line reads as a line of
 * duels. Only a monster or a Jev can be set upon by more than one man at a time.
 *
 * This is what a dozen men mobbing a single victim while three quarters of the field stood
 * untouched was actually a symptom of — nothing was ever pairing anybody off.
 */
function pair(battle: BattleState, alive: Fighter[], casting: Set<string>): void {
  const melee: Fighter[] = [];
  const byId = new Map<string, Fighter>();
  for (const fighter of alive) {
    byId.set(fighter.id, fighter);
    if (fighter.state === "routing" || casting.has(fighter.id)) continue;
    if (isRanged(unitDefinition(fighter.unitId).category)) continue;
    melee.push(fighter);
  }
  const attackers = new Map<string, number>();
  // Existing duels are revalidated closest-first, so the nearest man keeps the fight rather than
  // whoever happens to sit earliest in the array.
  const held = melee.filter((fighter) => fighter.targetId !== null)
    .map((fighter) => ({ fighter, mark: byId.get(fighter.targetId as string) }))
    .filter((entry): entry is { fighter: Fighter; mark: Fighter } => entry.mark !== undefined)
    .sort((left, right) => distance(left.fighter, left.mark) - distance(right.fighter, right.mark));
  for (const { fighter, mark } of held) {
    const reach = profile(unitDefinition(fighter.unitId).category).range;
    const used = attackers.get(mark.id) ?? 0;
    if (mark.state === "dead" || mark.state === "routing" || mark.side === fighter.side
      || distance(fighter, mark) > reach * 2.4 || used >= duelCapacity(mark)) { fighter.targetId = null; continue; }
    attackers.set(mark.id, used + 1);
  }
  // Free men are matched to free enemies, closest pair first, and the match is made both ways at
  // once. Pairing one way only left chains — A swinging at B while B swung at C — which is what
  // made three quarters of a melee look like men fighting nobody in particular.
  const candidates: Array<{ gap: number; a: Fighter; b: Fighter }> = [];
  for (const fighter of melee) {
    if (fighter.targetId !== null) continue;
    const span = profile(unitDefinition(fighter.unitId).category).range * 2.2;
    for (const other of melee) {
      if (other.side === fighter.side || other.targetId !== null || other.id < fighter.id) continue;
      const gap = distance(fighter, other);
      if (gap <= span) candidates.push({ gap, a: fighter, b: other });
    }
  }
  candidates.sort((left, right) => left.gap - right.gap);
  for (const { a, b } of candidates) {
    if (a.targetId !== null || b.targetId !== null) continue;
    if ((attackers.get(a.id) ?? 0) >= duelCapacity(a) || (attackers.get(b.id) ?? 0) >= duelCapacity(b)) continue;
    a.targetId = b.id; b.targetId = a.id;
    attackers.set(a.id, (attackers.get(a.id) ?? 0) + 1);
    attackers.set(b.id, (attackers.get(b.id) ?? 0) + 1);
  }
  // Anyone left over — the odd man on a longer line, the two extra men round a monster — takes
  // whatever still has room, even though that one will be looking the other way.
  for (const fighter of melee) {
    if (fighter.targetId !== null) continue;
    const span = profile(unitDefinition(fighter.unitId).category).range * 2.2;
    let best: Fighter | undefined, bestGap = span;
    for (const other of alive) {
      if (other.side === fighter.side || other.state === "routing" || other.state === "dead") continue;
      if ((attackers.get(other.id) ?? 0) >= duelCapacity(other)) continue;
      const gap = distance(fighter, other);
      if (gap < bestGap) { bestGap = gap; best = other; }
    }
    if (best === undefined) continue;
    fighter.targetId = best.id;
    attackers.set(best.id, (attackers.get(best.id) ?? 0) + 1);
  }
}

/** Shooters pick a model out of whatever their unit was ordered to shoot at, and keep shooting it. */
function mark(battle: BattleState, fighter: Fighter, unit: BattleUnit | undefined, enemies: Fighter[], range: number): string | null {
  const current = fighter.targetId === null ? undefined : enemies.find((entry) => entry.id === fighter.targetId);
  if (current !== undefined && current.state !== "dead" && distance(fighter, current) <= range) return current.id;
  let best: Fighter | undefined, bestGap = Infinity;
  for (const enemy of enemies) {
    if (enemy.state === "dead") continue;
    const gap = distance(fighter, enemy);
    if (gap > range) continue;
    // Stay on the unit the block was ordered onto; anything else is only a fallback.
    const score = gap * (enemy.cardId === unit?.targetUnitId ? 0.6 : 1) * (enemy.state === "routing" ? 1.8 : 1);
    if (score < bestGap) { bestGap = score; best = enemy; }
  }
  return best?.id ?? null;
}

const TICKS_PER_SECOND = 1000 / BATTLE_TICK_MS;
const distance = (a: { x: number; y: number }, b: { x: number; y: number }): number => Math.hypot(a.x - b.x, a.y - b.y);
const within = (list: Fighter[], at: { x: number; y: number }, radius: number): Fighter[] =>
  list.filter((fighter) => distance(fighter, at) <= radius).sort((left, right) => distance(left, at) - distance(right, at));
/** Angle from `from` to `to` in field space, so cones and sweeps can be aimed. */
const headingTo = (from: { x: number; y: number }, to: { x: number; y: number }): number => Math.atan2(to.y - from.y, to.x - from.x);
function angleBetween(a: number, b: number): number {
  let delta = a - b;
  while (delta > Math.PI) delta -= Math.PI * 2;
  while (delta < -Math.PI) delta += Math.PI * 2;
  return Math.abs(delta);
}
/** The fighter to centre an area on so that it covers the most of `list`. */
function densest(candidates: Fighter[], list: Fighter[], radius: number): { centre: Fighter; count: number } | null {
  let best: { centre: Fighter; count: number } | null = null;
  for (const centre of candidates) {
    const count = list.filter((fighter) => distance(fighter, centre) <= radius).length;
    if (best === null || count > best.count) best = { centre, count };
  }
  return best;
}
const ranged = (fighter: Fighter): boolean => ["ranged", "mage", "siege"].includes(unitDefinition(fighter.unitId).category);

/**
 * Everything an ability touches at resolution. Areas are re-read when the payoff lands, so the
 * telegraph is a real warning: a unit that walks out of the ring is not hit.
 */
function touched(ability: AbilityDefinition, cast: Casting, self: Fighter, foes: Fighter[], allies: Fighter[]): Fighter[] {
  const centre = ability.target === "self" ? self : { x: cast.tx, y: cast.ty };
  const heading = headingTo(self, { x: cast.tx, y: cast.ty });
  switch (ability.shape) {
    case "single": case "dash": case "blink": {
      const locked = [...foes, ...allies].find((fighter) => fighter.id === cast.targetId);
      return locked === undefined ? [] : [locked];
    }
    case "chain": return within(foes, centre, ability.radius).slice(0, 4);
    case "aoe": return ability.target === "foe" ? within(foes, centre, ability.radius) : within([...allies, ...foes], self, ability.radius);
    case "line":
      if (ability.target === "self") return within([...allies, ...foes], self, ability.radius);
      // A strip from the Jev toward the target, two radii long.
      return foes.filter((foe) => {
        const dx = foe.x - self.x, dy = foe.y - self.y;
        const along = dx * Math.cos(heading) + dy * Math.sin(heading), across = -dx * Math.sin(heading) + dy * Math.cos(heading);
        return along >= -1 && along <= ability.radius * 2 && Math.abs(across) <= 2.2;
      });
    case "cone": return within(foes, self, ability.radius).filter((foe) => angleBetween(headingTo(self, foe), heading) <= Math.PI * 0.21);
    case "sweep": return within(foes, self, ability.radius).filter((foe) => angleBetween(headingTo(self, foe), heading) <= Math.PI * 0.575);
    case "aura": case "shield": return within(allies, self, ability.radius);
  }
}

/** Where to aim a ready ability, or null when nothing on the field is worth it right now. */
function aim(ability: AbilityDefinition, self: Fighter, foes: Fighter[], allies: Fighter[]): { targetId: string | null; tx: number; ty: number } | null {
  const reachable = within(foes, self, ability.range);
  const at = (fighter: Fighter): { targetId: string; tx: number; ty: number } => ({ targetId: fighter.id, tx: fighter.x, ty: fighter.y });
  const enough = (count: number): boolean => count >= ability.minimum;
  switch (ability.shape) {
    case "single": {
      if (ability.target === "ally") {
        const wounded = within(allies, self, ability.range).filter((ally) => ally.health < ally.maxHealth * 0.75)
          .sort((left, right) => left.health / left.maxHealth - right.health / right.maxHealth)[0];
        return wounded === undefined ? null : at(wounded);
      }
      const pick = ability.id === "smite" ? [...reachable].sort((left, right) => right.health - left.health)[0] : reachable[0];
      return pick === undefined ? null : at(pick);
    }
    case "dash": {
      const prey = [...reachable].sort((left, right) => right.health - left.health)[0];
      return prey === undefined ? null : at(prey);
    }
    case "blink": {
      const mark = reachable.find(ranged) ?? reachable[0];
      return mark === undefined ? null : at(mark);
    }
    case "chain": {
      const best = densest(reachable, foes, ability.radius);
      return best === null || !enough(best.count) ? null : at(best.centre);
    }
    case "aoe": {
      if (ability.target === "foe") {
        const best = densest(reachable, foes, ability.radius);
        return best === null || !enough(best.count) ? null : at(best.centre);
      }
      // Self-centred: a buff wants allies in a fight, a nova wants enemies in reach.
      const crowd = ability.id === "orun" ? within(allies, self, ability.radius) : within(foes, self, ability.radius);
      const threatened = ability.id !== "orun" || within(foes, self, ability.radius + 8).length > 0;
      return enough(crowd.length) && threatened ? { targetId: null, tx: self.x, ty: self.y } : null;
    }
    case "line": {
      if (ability.target === "self") {
        const pressed = within(foes, self, ability.radius + 4).length > 0 && within(allies, self, ability.radius).length >= ability.minimum;
        return pressed ? { targetId: null, tx: self.x, ty: self.y } : null;
      }
      let best: { fighter: Fighter; count: number } | null = null;
      for (const foe of reachable) {
        const heading = headingTo(self, foe);
        const count = foes.filter((other) => {
          const dx = other.x - self.x, dy = other.y - self.y;
          const along = dx * Math.cos(heading) + dy * Math.sin(heading), across = -dx * Math.sin(heading) + dy * Math.cos(heading);
          return along >= -1 && along <= ability.radius * 2 && Math.abs(across) <= 2.2;
        }).length;
        if (best === null || count > best.count) best = { fighter: foe, count };
      }
      return best === null || !enough(best.count) ? null : at(best.fighter);
    }
    case "cone": case "sweep": {
      const span = ability.shape === "cone" ? Math.PI * 0.21 : Math.PI * 0.575;
      const near = within(foes, self, ability.radius);
      let best: { fighter: Fighter; count: number } | null = null;
      for (const foe of near) {
        const heading = headingTo(self, foe);
        const count = near.filter((other) => angleBetween(headingTo(self, other), heading) <= span).length;
        if (best === null || count > best.count) best = { fighter: foe, count };
      }
      return best === null || !enough(best.count) ? null : at(best.fighter);
    }
    case "aura": {
      const wounded = within(allies, self, ability.radius).filter((ally) => ally.health < ally.maxHealth * 0.85);
      return enough(wounded.length) ? { targetId: null, tx: self.x, ty: self.y } : null;
    }
    case "shield": {
      const covered = within(allies, self, ability.radius);
      const pressed = within(foes, self, ability.radius + 6).length >= 3;
      return enough(covered.length) && pressed ? { targetId: null, tx: self.x, ty: self.y } : null;
    }
  }
}

/**
 * Runs a Jev's kit: begins a cast when a slot is ready and has something worth hitting, and lands
 * it when the telegraph runs out. Each payoff writes the effect cues the renderer already reads
 * (hits, arcs, heals) on top of the cast record that drives the floor telegraph.
 */
function advanceCasting(battle: BattleState, lord: BattleLord, alive: Fighter[], incoming: Map<string, number>): void {
  const self = battle.fighters.find((fighter) => fighter.id === lord.fighterId);
  if (self === undefined || self.state === "dead" || self.state === "routing") { lord.casting = null; return; }
  const kit = KITS[lord.heroId];
  const foeSide = self.side === "attacker" ? "defender" : "attacker";
  const foes = alive.filter((fighter) => fighter.side === foeSide && fighter.state !== "dead" && fighter.state !== "routing");
  const allies = alive.filter((fighter) => fighter.side === self.side && fighter.state !== "dead" && fighter.state !== "routing" && fighter.id !== self.id);
  const power = heroDefinition(lord.heroId).stats.damage * (1 + lord.level * 0.2) * BLOW_SCALE;
  const hurt = (victim: Fighter, amount: number, arc: boolean): void => {
    incoming.set(victim.id, (incoming.get(victim.id) ?? 0) + amount);
    Object.assign(victim.effects, { hitAt: battle.tick, hitDamage: amount, hitFromX: self.x, hitFromY: self.y });
    if (arc) Object.assign(victim.effects, { arcAt: battle.tick, arcX: self.x, arcY: self.y });
  };
  const heal = (ally: Fighter, amount: number): void => {
    ally.health = Math.min(ally.maxHealth, ally.health + amount);
    Object.assign(ally.effects, { healAt: battle.tick, healX: self.x, healY: self.y });
  };

  if (lord.casting !== null) {
    const casting = lord.casting;
    if (battle.tick < casting.resolveAt) return;
    const ability = kit[casting.slot];
    const cast = battle.casts.find((entry) => entry.id === casting.castId);
    if (ability === undefined || cast === undefined) { lord.casting = null; return; }
    // A single target that died mid-windup is swapped for the nearest one; the cast is not wasted.
    if (casting.targetId !== null && !alive.some((fighter) => fighter.id === casting.targetId && fighter.state !== "dead")) {
      const fallback = aim(ability, self, foes, allies);
      if (fallback !== null) Object.assign(casting, fallback);
    }
    if (ability.shape === "dash" || ability.shape === "blink") {
      const mark = foes.find((foe) => foe.id === casting.targetId);
      if (mark !== undefined) {
        if (ability.shape === "dash") { self.x = mark.x + (self.x - mark.x) * 0.18; self.y = mark.y + (self.y - mark.y) * 0.18; }
        else {
          self.x = mark.x; self.y = mark.y + (self.side === "attacker" ? 2.5 : -2.5);
          // Alone behind the enemy line she would simply be swarmed; the veil buys her the moment she needs.
          self.effects.veiledUntil = battle.tick + 60;
        }
        cast.land = { x: self.x, y: self.y };
        self.effects.blinkAt = battle.tick;
      }
    }
    const targets = touched(ability, casting, self, foes, allies);
    const amount = power * ability.power;
    for (const [index, target] of targets.entries()) {
      const friendly = target.side === self.side;
      switch (ability.id) {
        case "veyra": hurt(target, amount * Math.pow(0.7, index), true); break;
        case "kael": hurt(target, amount, false); heal(self, power * 1.2); break;
        case "mend": heal(target, amount); break;
        case "elowen": heal(target, amount); break;
        case "dome": target.effects.shieldedUntil = battle.tick + 120; Object.assign(target.effects, { healAt: battle.tick, healX: self.x, healY: self.y }); break;
        case "orun":
          if (friendly) { target.effects.temperedUntil = battle.tick + 100; Object.assign(target.effects, { healAt: battle.tick, healX: self.x, healY: self.y }); }
          else hurt(target, amount, false);
          break;
        case "thorn":
          if (friendly) target.effects.rootedUntil = battle.tick + 160;
          else { target.effects.snaredUntil = battle.tick + 90; hurt(target, amount, false); }
          break;
        case "snare": target.effects.snaredUntil = battle.tick + 60; hurt(target, amount, false); break;
        case "fissure": target.effects.snaredUntil = battle.tick + 40; hurt(target, amount, false); break;
        case "maelstrom": target.effects.snaredUntil = battle.tick + 30; hurt(target, amount, false); break;
        default: hurt(target, amount, ability.id === "bolt" || ability.id === "thunderstorm"); break;
      }
    }
    if (ability.target === "self" && ability.shape !== "aura" && ability.shape !== "shield") Object.assign(self.effects, { strikeAt: battle.tick, strikeX: cast.tx, strikeY: cast.ty });
    else if (targets[0] !== undefined && ability.target === "foe") Object.assign(self.effects, { strikeAt: battle.tick, strikeX: targets[0].x, strikeY: targets[0].y });
    cast.hits = targets.map((target) => target.id);
    // Sanctuary covers the caster too.
    if (ability.id === "dome") self.effects.shieldedUntil = battle.tick + 120;
    lord.cooldowns[casting.slot] = battle.tick + ability.cooldown * TICKS_PER_SECOND;
    lord.casting = null;
    return;
  }

  // The biggest ready ability with a worthwhile target wins; the poke fills the gaps.
  for (let slot = kit.length - 1; slot >= 0; slot--) {
    const ability = kit[slot];
    if (ability === undefined || battle.tick < (lord.cooldowns[slot] ?? 0)) continue;
    const target = aim(ability, self, foes, allies);
    if (target === null) continue;
    battle.sequence += 1;
    const telegraph = Math.max(1, Math.round(ability.telegraph / BATTLE_TICK_MS));
    lord.casting = { slot, castId: battle.sequence, at: battle.tick, resolveAt: battle.tick + telegraph, ...target };
    battle.casts.push({
      id: battle.sequence, lordId: lord.id, heroId: lord.heroId, side: lord.side, slot, abilityId: ability.id,
      at: battle.tick, resolveAt: battle.tick + telegraph, x: self.x, y: self.y, tx: target.tx, ty: target.ty, land: null, hits: [],
    });
    self.effects.castAt = battle.tick;
    return;
  }
}

/**
 * Advances the battle one tick. Intents are gathered first and damage applied afterwards, so no
 * fighter benefits from being earlier in the array — resolving in order handed whichever side was
 * processed first a free, unanswered blow every tick.
 */
export function battleTick(battle: BattleState): void {
  if (battle.phase !== "fighting") return;
  battle.tick += 1;
  const alive = living(battle);
  const bySide = { attacker: alive.filter((fighter) => fighter.side === "attacker"), defender: alive.filter((fighter) => fighter.side === "defender") };
  const losses = new Map<string, number>();
  /** Blows landed on a unit from its flank or rear this tick; morale is counted per blow, not per tick. */
  const flanks = new Map<string, number>();
  const incoming = new Map<string, number>();
  const moves: Array<[Fighter, number, number]> = [];
  /**
   * Facing is deferred exactly like movement and damage. Writing it inside the loop meant a fighter
   * processed late read its opponent's freshly-turned facing while a fighter processed early read
   * last tick's — which handed the attacker, who is always first in the array, a standing edge on
   * the flank bonus. A mirror match was won by the attacker 92 times in 100 because of it.
   */
  const turns: Array<[Fighter, number]> = [];
  const casting = new Set(battle.lords.filter((lord) => lord.casting !== null).map((lord) => lord.fighterId));

  // --- orders: units decide as units, on their own slower clock, before any model moves.
  const views = survey(battle);
  const centres = { attacker: { x: 0, y: 0, n: 0 }, defender: { x: 0, y: 0, n: 0 } };
  for (const fighter of alive) {
    if (fighter.state === "routing") continue;
    const centre = centres[fighter.side];
    centre.x += fighter.x; centre.y += fighter.y; centre.n += 1;
  }
  for (const centre of Object.values(centres)) if (centre.n > 0) { centre.x /= centre.n; centre.y /= centre.n; }
  for (const view of views.values()) {
    if (view.unit.routed) { view.unit.state = "broken"; continue; }
    if (battle.tick >= view.unit.thinkAt) think(battle, view, views, centres[view.unit.side]);
  }
  // --- and only then is anybody matched against anybody.
  pair(battle, alive, casting);

  for (const fighter of alive) {
    const unit = unitDefinition(fighter.unitId);
    if (fighter.state === "routing") {
      // Broken troops run for their own edge and leave the field.
      const home = fighter.side === "attacker" ? -6 : FIELD_DEPTH + 6;
      fighter.y += Math.sign(home - fighter.y) * unit.speed * 1.5;
      fighter.facing = fighter.side === "attacker" ? -Math.PI / 2 : Math.PI / 2;
      if (Math.abs(fighter.y - home) < 4) fighter.state = "dead";
      continue;
    }
    // A Jev mid-cast plants their feet: the telegraph is the whole point of the windup.
    if (casting.has(fighter.id)) continue;
    const own = unitOf(battle, fighter);
    const reach = profile(unit.category);
    const enemies = bySide[fighter.side === "attacker" ? "defender" : "attacker"];
    if (enemies.length === 0) continue;
    const shooter = isRanged(unit.category);
    // A bowman on a ridge shoots further than one in a hollow.
    const sight = shooter ? reach.range * (1 + elevationAt(battle, fighter.x, fighter.y) * 0.035) : reach.range;
    if (shooter) fighter.targetId = mark(battle, fighter, own, enemies, sight);
    const target = fighter.targetId === null ? undefined : enemies.find((entry) => entry.id === fighter.targetId);
    const gap = target === undefined ? Infinity : distance(fighter, target);
    const snared = (fighter.effects.snaredUntil ?? 0) > battle.tick ? 0.35 : 1;

    // --- where this model wants to be. A man with an opponent closes on him; a man without one
    //     holds his place in the block. That second rule is the whole of the frontage mechanic:
    //     the back ranks wait instead of pouring round the sides to mob whoever is already losing.
    let wantX = fighter.x, wantY = fighter.y, hurry = 1;
    if (target !== undefined && !shooter && gap > reach.range * 0.92) { wantX = target.x; wantY = target.y; hurry = gap < 12 ? 1.7 : 1; }
    else if (target === undefined || shooter) {
      const slot = own === undefined ? { x: fighter.x, y: fighter.y } : slotPosition(own, fighter.slot);
      wantX = slot.x; wantY = slot.y;
      // The front two ranks may step out of formation to find an opponent, and no further.
      if (!shooter && own !== undefined && fighter.slot < own.frontage * 2) {
        let nearest: Fighter | undefined, best = SEEK_RANGE;
        for (const enemy of enemies) {
          if (enemy.state === "routing") continue;
          const away = distance(fighter, enemy);
          if (away < best) { best = away; nearest = enemy; }
        }
        if (nearest !== undefined) { wantX = nearest.x; wantY = nearest.y; hurry = 1.7; }
      }
    }
    const dx = wantX - fighter.x, dy = wantY - fighter.y;
    const span = Math.hypot(dx, dy);
    const contact = target !== undefined && !shooter ? reach.range * 0.92 : 0.7;
    if (span > contact) {
      fighter.state = "advancing";
      // A besieging attacker has to break the wall before it can reach the defenders.
      if (battle.siege && fighter.side === "attacker" && battle.walls > 0 && fighter.y > WALL_LINE - 3) {
        // Men with ladders and picks take a long time over a wall; engines are what it is afraid of.
        battle.walls -= unit.category === "siege" ? unit.damage * 0.5 : 0.045;
      } else {
        // Horse gallop. Crossing the open ground at a walk meant they spent ten seconds under
        // archery before they arrived, and arrived dead — which is not what cavalry are for.
        const gallop = unit.category === "mobile" && own !== undefined && own.state !== "forming" ? 1.9 : 1;
        // Ground fights you. Climbing a ridge is slow; coming down it is not.
        const climb = elevationAt(battle, fighter.x + dx / span * 4, fighter.y + dy / span * 4) - elevationAt(battle, fighter.x, fighter.y);
        const slope = Math.max(0.72, Math.min(1.15, 1 - climb * 0.12));
        const step = Math.min(span - contact, unit.speed * ADVANCE * hurry * gallop * snared * slope);
        // Movement is deferred like damage: applying it in the loop let whichever side was processed
        // second see the other arrive and land the first blow of every engagement.
        moves.push([fighter, dx / span * step, dy / span * step]);
        turns.push([fighter, Math.atan2(dy, dx)]);
        if (unit.category === "mobile") fighter.charge = Math.min(1, fighter.charge + step / 26);
      }
    } else if (own !== undefined) {
      turns.push([fighter, own.facing]);
    }
    // A man in a duel looks at the man he is fighting, whatever his feet are doing. Facing is sent
    // to the renderer now, so two ranks of soldiers visibly square off instead of milling about.
    if (target !== undefined && gap <= reach.range * 1.6) turns.push([fighter, headingTo(fighter, target)]);

    // --- and whether he lands a blow this tick.
    if (target === undefined || gap > reach.range * (shooter ? 1 : 1.35)) continue;
    fighter.state = "fighting";
    fighter.effects.engagedAt = battle.tick;
    if (battle.tick < fighter.nextAttackAt) continue;
    fighter.nextAttackAt = battle.tick + reach.interval;
    const power = fighter.lordId === null ? unit.damage : heroDefinition(battle.lords.find((lord) => lord.id === fighter.lordId)?.heroId ?? "kael").stats.damage;
    const targetUnit = unitDefinition(target.unitId);
    const targetCategory = targetUnit.category;
    const moraleFactor = own === undefined ? 1 : 0.7 + own.morale / 340;
    // A charge is what makes cavalry frightening; shooters caught in melee are nearly useless; and a
    // unit built to beat what it is facing hits appreciably harder.
    const charging = unit.category === "mobile" && fighter.charge > 0.3;
    // Shooting: murderous at close range, a nuisance at the edge of it, and nearly useless once
    // something has closed to arm's length. Flat damage at every range made archers beat both the
    // infantry and the cavalry that are supposed to counter them.
    const reached = shooter && gap < 5 ? 0.35 : 1;
    const falloff = shooter ? 1.15 - 0.75 * Math.min(1, gap / reach.range) : 1;
    // And a galloping horseman is a hard thing to hit. The roster says horse counter shooters but
    // only says it from the horse's side; without this the arrows won the matchup every time.
    const fleeting = shooter && targetCategory === "mobile" ? 0.6 : 1;
    // High ground carries a missile further and lets it fall harder; wood in the way blunts it.
    const rise = shooter ? elevationAt(battle, fighter.x, fighter.y) - elevationAt(battle, target.x, target.y) : 0;
    const highGround = shooter ? Math.max(0.85, Math.min(1.35, 1 + rise * 0.07)) : 1;
    const screened = shooter ? 1 - coverAt(battle, target.x, target.y) * 0.45 : 1;
    const smothered = reached * falloff * fleeting * highGround * screened;
    const counter = unit.strongAgainst.includes(targetUnit.category) ? 1.5 : 1;
    const tempered = (fighter.effects.temperedUntil ?? 0) > battle.tick ? 1.35 : 1;
    // Being taken in the side or the back hurts. This is what makes a flanking charge worth watching
    // rather than just another body in the press.
    const offAngle = angleBetween(headingTo(target, fighter), target.facing);
    const flank = shooter ? 1 : offAngle < Math.PI / 3 ? 1 : offAngle < Math.PI * 2 / 3 ? 1.3 : 1.6;
    // Armour sheds a share of the blow instead of subtracting from it, so a weak unit facing a
    // heavily armoured one is losing badly rather than achieving literally nothing.
    const shed = 1 - targetUnit.armour / (targetUnit.armour + ARMOUR_SOFTNESS);
    const dealt = Math.max(0.5, power * (0.85 + random(battle) * 0.3) * moraleFactor * smothered * counter
      * tempered * flank * shed * battle.edge[fighter.side] * (charging ? 2.4 : 1) * BLOW_SCALE);
    if (charging) { fighter.charge = 0; fighter.effects.chargeAt = battle.tick; }
    // A monster sweeps everyone in front of it; without this a single big model just gets swarmed.
    const splash = unit.category === "monster"
      ? enemies.filter((entry) => entry.id !== target.id && entry.state !== "dead" && distance(entry, target) < 4.2).slice(0, 4)
      : [];
    for (const caught of splash) {
      incoming.set(caught.id, (incoming.get(caught.id) ?? 0) + dealt * 0.8);
      Object.assign(caught.effects, { hitAt: battle.tick, hitDamage: dealt * 0.8, hitFromX: fighter.x, hitFromY: fighter.y });
    }
    incoming.set(target.id, (incoming.get(target.id) ?? 0) + dealt);
    Object.assign(fighter.effects, { strikeAt: battle.tick, strikeX: target.x, strikeY: target.y });
    Object.assign(target.effects, { hitAt: battle.tick, hitDamage: dealt, hitFromX: fighter.x, hitFromY: fighter.y });
    if (flank > 1.1) { target.effects.flanked = battle.tick; flanks.set(target.cardId, (flanks.get(target.cardId) ?? 0) + 1); }
  }

  for (const [fighter, dx, dy] of moves) { fighter.x += dx; fighter.y += dy; }
  for (const [fighter, facing] of turns) fighter.facing = facing;
  for (const lord of battle.lords) advanceCasting(battle, lord, alive, incoming);
  battle.casts = battle.casts.filter((cast) => cast.at > battle.tick - 80);

  // --- separation: two men cannot stand in the same place. Without this every model converging on
  //     the same target ends up stacked inside the others, and the fight reads as a single blob.
//     Pushes are gathered and applied together: resolving pairs in array order let whichever side
//     came first in the array settle a hair inside melee reach while the other sat a hair outside it.
  const standing = alive.filter((fighter) => fighter.state !== "routing");
  const shove = new Map<string, { x: number; y: number }>();
  const nudge = (fighter: Fighter, x: number, y: number): void => {
    const entry = shove.get(fighter.id) ?? { x: 0, y: 0 };
    entry.x += x; entry.y += y;
    shove.set(fighter.id, entry);
  };
  for (let left = 0; left < standing.length; left++) {
    const a = standing[left];
    if (a === undefined) continue;
    const reachA = unitDefinition(a.unitId).category === "monster" || a.lordId !== null ? 3 : 2.1;
    for (let right = left + 1; right < standing.length; right++) {
      const b = standing[right];
      if (b === undefined) continue;
      const dx = b.x - a.x, dy = b.y - a.y;
      const minimum = reachA + (unitDefinition(b.unitId).category === "monster" || b.lordId !== null ? 3 : 2.1) - 2.1;
      if (Math.abs(dx) > minimum || Math.abs(dy) > minimum) continue;
      const distance = Math.hypot(dx, dy);
      if (distance >= minimum) continue;
      const push = (minimum - distance) * 0.28;
      const nx = distance < 0.001 ? (left % 2 === 0 ? 1 : -1) : dx / distance, ny = distance < 0.001 ? 0 : dy / distance;
      nudge(a, -nx * push, -ny * push);
      nudge(b, nx * push, ny * push);
    }
  }
  for (const fighter of standing) {
    const entry = shove.get(fighter.id);
    if (entry !== undefined) { fighter.x += entry.x; fighter.y += entry.y; }
    fighter.x = Math.max(1, Math.min(FIELD_WIDTH - 1, fighter.x));
    fighter.y = Math.max(-2, Math.min(FIELD_DEPTH + 2, fighter.y));
  }

  // --- damage lands everywhere at once, so both sides trade the same tick.
  for (const [id, damage] of incoming) {
    const fighter = battle.fighters.find((entry) => entry.id === id);
    if (fighter === undefined || fighter.state === "dead") continue;
    // Sanctuary halves whatever reaches the men under it; a rooted line is braced and takes a fifth less.
    // Dug-in defenders are harder to kill as well as harder to shift; a 30% strength edge on the
    // campaign's books has to be worth about 30% here or the odds the spectator was shown are a lie.
    const dug = battle.edge[fighter.side] * (battle.siege && battle.walls > 0 && fighter.side === "defender" ? 2.2 : 1);
    const shielded = (fighter.effects.shieldedUntil ?? 0) > battle.tick ? 0.5 : 1;
    const braced = (fighter.effects.rootedUntil ?? 0) > battle.tick ? 0.8 : 1;
    const veiled = (fighter.effects.veiledUntil ?? 0) > battle.tick ? 0.4 : 1;
    fighter.health -= damage * shielded * braced * veiled / dug;
    if (fighter.health > 0) continue;
    fighter.state = "dead";
    losses.set(fighter.cardId, (losses.get(fighter.cardId) ?? 0) + 1);
  }

  // --- morale: losses break a unit, a lord nearby holds it together.
  // How much of each army is still standing, so an army that has been gutted comes apart instead of
  // playing keep-away with the survivors until the clock runs out.
  const standingBySide = { attacker: 0, defender: 0 }, raisedBySide = { attacker: 0, defender: 0 };
  for (const fighter of alive) if (fighter.state !== "routing") standingBySide[fighter.side] += 1;
  for (const unit of battle.units) raisedBySide[unit.side] += unit.startingCount;
  for (const unit of battle.units) {
    if (unit.routed) continue;
    // A Jev does not rout. They fight until they fall, and the aftermath decides what became of them.
    if (unit.id.startsWith("lord-")) continue;
    const lost = losses.get(unit.id) ?? 0;
    if (lost > 0) unit.morale -= lost * (135 / Math.max(1, unit.startingCount));
    const remaining = alive.filter((fighter) => fighter.cardId === unit.id && fighter.state !== "routing").length;
    if (remaining === 0) { unit.routed = true; unit.state = "broken"; continue; }
    // Men taken in the flank or the rear lose heart faster than men who can see what is hitting them.
    // The floor under the count keeps a single-model unit — an ogre, a Jev — from breaking in a
    // heartbeat the first time anything gets behind it.
    const flanked = flanks.get(unit.id) ?? 0;
    if (flanked > 0) unit.morale -= flanked * (18 / Math.max(4, unit.startingCount));
    const lord = battle.lords.find((entry) => entry.side === unit.side);
    const lordFighter = lord === undefined ? undefined : battle.fighters.find((fighter) => fighter.id === lord.fighterId);
    if (lordFighter !== undefined && lordFighter.state !== "dead") {
      const anchor = alive.find((fighter) => fighter.cardId === unit.id);
      if (anchor !== undefined && Math.hypot(anchor.x - lordFighter.x, anchor.y - lordFighter.y) < 26) unit.morale = Math.min(100, unit.morale + 0.4);
    }
    // Troops pulled deliberately out of a fight steady again. Without this, horse that disengage to
    // set up another charge read as horse that broke, and then actually do break.
    if (unit.state === "withdrawing") unit.morale = Math.min(100, unit.morale + 0.35);
    // Being outnumbered on the field is itself demoralising.
    const friends = bySide[unit.side].length, foes = bySide[unit.side === "attacker" ? "defender" : "attacker"].length;
    if (foes > friends * 1.6) unit.morale -= 0.25;
    // And once four fifths of the army is gone, what is left of it comes apart over a few seconds.
    if (standingBySide[unit.side] < raisedBySide[unit.side] * 0.22) unit.morale -= 0.9;
    // Thorn's roots hold a line together that would otherwise have broken.
    const rooted = alive.some((fighter) => fighter.cardId === unit.id && (fighter.effects.rootedUntil ?? 0) > battle.tick);
    if (unit.morale > (rooted ? 6 : 22)) continue;
    unit.routed = true;
    unit.state = "broken";
    for (const fighter of alive) if (fighter.cardId === unit.id && fighter.lordId === null) { fighter.state = "routing"; fighter.targetId = null; }
  }

  // --- resolution
  const holding = (side: Side): number => living(battle).filter((fighter) => fighter.side === side && fighter.state !== "routing").length;
  const attackerLeft = holding("attacker"), defenderLeft = holding("defender");
  if (attackerLeft > 0 && defenderLeft > 0 && battle.tick < BATTLE_TIMEOUT) return;
  battle.phase = "finished";
  battle.outcome = attackerLeft === 0 && defenderLeft === 0 ? "draw"
    : attackerLeft === 0 ? "defender"
    : defenderLeft === 0 ? "attacker"
    : attackerLeft > defenderLeft * 1.3 ? "attacker" : defenderLeft > attackerLeft * 1.3 ? "defender" : "draw";
}

/** Writes a finished battle's survivors back onto the campaign cards it was built from. */
export function applyBattle(battle: BattleState, attackerCards: UnitCard[], defenderCards: UnitCard[]): { attackerLosses: number; defenderLosses: number } {
  let attackerLosses = 0, defenderLosses = 0;
  for (const cards of [attackerCards, defenderCards]) {
    const side: Side = cards === attackerCards ? "attacker" : "defender";
    for (const card of [...cards]) {
      const unit = battle.units.find((entry) => entry.cardId === card.id && entry.side === side);
      if (unit === undefined) continue;
      const survivors = battle.fighters.filter((fighter) => fighter.cardId === unit.id && fighter.state !== "dead").length;
      const lost = card.models - survivors;
      if (side === "attacker") attackerLosses += lost; else defenderLosses += lost;
      card.models = survivors;
      if (card.models <= 0) cards.splice(cards.indexOf(card), 1);
    }
  }
  return { attackerLosses, defenderLosses };
}
/** Runs a battle to completion without rendering it, for headless balance work. */
export function runBattle(battle: BattleState): BattleState {
  while (battle.phase === "fighting") battleTick(battle);
  return battle;
}
export { nextRandom, cardStrength };

/**
 * Turns a finished real-time battle into the same campaign bookkeeping auto-resolve produces:
 * losses written back, survivors promoted, morale moved and the losing lord put at risk.
 */
export function reportFromBattle(state: CampaignState, battle: BattleState, sides: BattleSides): BattleReport {
  const share = predict(state, sides);
  const defenderCards = sides.defender?.units ?? sides.province.garrison;
  const { attackerLosses, defenderLosses } = applyBattle(battle, sides.attacker.units, defenderCards);
  const outcome = battle.outcome ?? "draw";
  const promote = (cards: UnitCard[]): void => {
    for (const card of cards) {
      card.experience += 90;
      while (card.rank < RANK_NAMES.length - 1 && card.experience >= (card.rank + 1) * 100) card.rank += 1;
    }
  };
  if (outcome === "attacker") { promote(sides.attacker.units); sides.attacker.morale = Math.min(100, sides.attacker.morale + 15); }
  else if (outcome === "defender") { promote(defenderCards); sides.attacker.morale = Math.max(5, sides.attacker.morale - 35); sides.attacker.shattered = true; }
  if (sides.defender !== null) {
    if (outcome === "defender") sides.defender.morale = Math.min(100, sides.defender.morale + 15);
    else if (outcome === "attacker") { sides.defender.morale = Math.max(5, sides.defender.morale - 35); sides.defender.shattered = true; }
  }
  const total = attackerLosses + defenderLosses;
  const margin = total === 0 ? 0 : Math.abs(attackerLosses - defenderLosses) / total;
  const attackerLord = lordOf(state, sides.attacker);
  const defenderLord = sides.defender === null ? undefined : lordOf(state, sides.defender);
  const notes = [
    lordAftermath(state, attackerLord, outcome === "attacker", outcome === "attacker" ? 0 : margin),
    lordAftermath(state, defenderLord, outcome === "defender", outcome === "defender" ? 0 : margin),
  ].filter((note): note is string => note !== null);
  if (outcome === "attacker" && attackerLord !== undefined) attackerLord.kills += defenderLosses;
  if (outcome === "defender" && defenderLord !== undefined) defenderLord.kills += attackerLosses;
  const nameOf = (id: string): string => state.factions.find((faction) => faction.id === id)?.name ?? "The defenders";
  const upset = share > 0.62 && outcome === "defender" ? " — an upset" : share < 0.38 && outcome === "attacker" ? " — against the odds" : "";
  state.sequence += 1;
  return {
    id: `battle-${state.sequence}`, turn: state.turn, provinceId: sides.province.id, resolution: "live",
    attackerId: sides.attacker.factionId, defenderId: sides.defenderFactionId, outcome,
    attackerLosses, defenderLosses, prediction: share,
    summary: `${outcome === "draw" ? "Neither side broke" : `${nameOf(outcome === "attacker" ? sides.attacker.factionId : sides.defenderFactionId)} held the field`} at ${sides.province.name}${upset}${notes.length > 0 ? `. ${notes.join("; ")}` : ""}`,
  };
}
