/** Tron Armageddon: light cycles leave solid walls behind them and the arena eats itself from the edges in. */

export type Heading = "north" | "east" | "south" | "west";
/** A cycle can only ever hold its line or turn ninety degrees; it can never stop or reverse. */
export type Steer = "left" | "straight" | "right";

export interface Cell { x: number; y: number }

export interface Cycle {
  id: string; name: string;
  /** Uppercase marks the head on the board, lowercase marks the wall it has laid. */
  glyph: string;
  x: number; y: number; heading: Heading;
  alive: boolean; diedOnTick: number | null; cause: string | null;
  /** Ticks survived, which is also the length of wall this cycle owns. */
  distance: number;
}

/** -1 is open floor, -2 is arena that armageddon has already eaten, anything else is the index of the cycle whose wall fills it. */
export type CellOwner = number;

export interface Arena {
  size: number; tick: number;
  /** The live rectangle; armageddon pulls these edges inward until nothing is left. */
  bounds: { minX: number; maxX: number; minY: number; maxY: number };
  cells: CellOwner[];
  cycles: Cycle[];
  /** Ticks between each ring of the arena collapsing. */
  shrinkEvery: number;
}

const HEADINGS: Heading[] = ["north", "east", "south", "west"];
const STEP: Record<Heading, Cell> = { north: { x: 0, y: -1 }, east: { x: 1, y: 0 }, south: { x: 0, y: 1 }, west: { x: -1, y: 0 } };

/** The heading a cycle ends up on after a steer. */
export function steered(heading: Heading, steer: Steer): Heading {
  const index = HEADINGS.indexOf(heading);
  const delta = steer === "left" ? 3 : steer === "right" ? 1 : 0;
  return HEADINGS[(index + delta) % 4]!;
}

/** Where a cycle lands next tick if it takes this steer. */
export function landing(cycle: Cycle, steer: Steer): Cell {
  const heading = steered(cycle.heading, steer);
  const step = STEP[heading]!;
  return { x: cycle.x + step.x, y: cycle.y + step.y };
}

export function cellAt(arena: Arena, cell: Cell): CellOwner {
  if (cell.x < 0 || cell.y < 0 || cell.x >= arena.size || cell.y >= arena.size) return -2;
  return arena.cells[cell.y * arena.size + cell.x]!;
}

function setCell(arena: Arena, cell: Cell, owner: CellOwner): void { arena.cells[cell.y * arena.size + cell.x] = owner; }

/** Inside the shrinking rectangle and not yet filled by anyone's wall. */
export function isOpen(arena: Arena, cell: Cell): boolean {
  const { minX, maxX, minY, maxY } = arena.bounds;
  if (cell.x < minX || cell.x > maxX || cell.y < minY || cell.y > maxY) return false;
  return cellAt(arena, cell) === -1;
}

/** How far a cycle could run in a straight line from this cell before something stops it. */
export function runway(arena: Arena, from: Cell, heading: Heading): number {
  const step = STEP[heading]!;
  let length = 0;
  let cursor = { x: from.x + step.x, y: from.y + step.y };
  while (isOpen(arena, cursor) && length < arena.size * 2) { length += 1; cursor = { x: cursor.x + step.x, y: cursor.y + step.y }; }
  return length;
}

/** Floor reachable from a cell, which is what actually decides whether a cycle has boxed itself in. */
export function openSpace(arena: Arena, from: Cell, cap = 400): number {
  if (!isOpen(arena, from)) return 0;
  const seen = new Set<number>([from.y * arena.size + from.x]);
  const queue: Cell[] = [from];
  let counted = 0;
  while (queue.length > 0 && counted < cap) {
    const cell = queue.shift()!;
    counted += 1;
    for (const heading of HEADINGS) {
      const step = STEP[heading]!;
      const next = { x: cell.x + step.x, y: cell.y + step.y };
      const key = next.y * arena.size + next.x;
      if (seen.has(key) || !isOpen(arena, next)) continue;
      seen.add(key);
      queue.push(next);
    }
  }
  return counted;
}

/** Steers that do not kill the cycle outright this tick, ignoring what the rivals do. */
export function survivableSteers(arena: Arena, cycle: Cycle): Steer[] {
  return (["left", "straight", "right"] as Steer[]).filter((steer) => isOpen(arena, landing(cycle, steer)));
}

/** Each spawn points along the wall it sits next to, so every rider opens with the same clear run. */
const START_HEADINGS: Heading[] = ["east", "west", "south", "north"];

/** Three cycles on the rim of a square arena, each pointed along the wall rather than straight at a rival. */
export function createArena(size: number, riders: { id: string; name: string; glyph: string }[], shrinkEvery: number): Arena {
  const inset = Math.max(2, Math.round(size * 0.18));
  const far = size - 1 - inset;
  const spawns: Cell[] = [{ x: inset, y: inset }, { x: far, y: far }, { x: far, y: inset }, { x: inset, y: far }];
  const arena: Arena = {
    size, tick: 0, shrinkEvery,
    bounds: { minX: 0, maxX: size - 1, minY: 0, maxY: size - 1 },
    cells: new Array<CellOwner>(size * size).fill(-1),
    cycles: riders.map((rider, index) => ({
      ...rider, x: spawns[index % spawns.length]!.x, y: spawns[index % spawns.length]!.y,
      heading: START_HEADINGS[index % START_HEADINGS.length]!, alive: true, diedOnTick: null, cause: null, distance: 0,
    })),
  };
  arena.cycles.forEach((cycle, index) => setCell(arena, cycle, index));
  return arena;
}

export interface TickReport {
  tick: number;
  moves: { cycleId: string; steer: Steer; to: Cell }[];
  deaths: { cycleId: string; cause: string }[];
  /** Set on the tick the arena walls closed in another ring. */
  collapsed: boolean;
}

/** Applies every steer at once: nobody moves into a world the others have already updated. */
export function advance(arena: Arena, steers: Map<string, Steer>): TickReport {
  arena.tick += 1;
  const report: TickReport = { tick: arena.tick, moves: [], deaths: [], collapsed: false };
  const living = arena.cycles.filter((cycle) => cycle.alive);
  const targets = new Map<string, { cycle: Cycle; steer: Steer; to: Cell }>();
  for (const cycle of living) {
    const steer = steers.get(cycle.id) ?? "straight";
    targets.set(cycle.id, { cycle, steer, to: landing(cycle, steer) });
  }

  const doomed = new Map<string, string>();
  for (const [id, move] of targets) {
    const owner = cellAt(arena, move.to);
    const { minX, maxX, minY, maxY } = arena.bounds;
    if (move.to.x < minX || move.to.x > maxX || move.to.y < minY || move.to.y > maxY) doomed.set(id, owner === -2 ? "rode off the grid" : "rode into the collapsing edge");
    else if (owner !== -1) doomed.set(id, owner === -2 ? "rode into the collapsing edge" : `hit ${arena.cycles[owner]!.name}'s wall`);
  }
  for (const [id, move] of targets) {
    for (const [otherId, other] of targets) {
      if (id === otherId) continue;
      if (move.to.x === other.to.x && move.to.y === other.to.y) doomed.set(id, `head-on with ${other.cycle.name}`);
      if (move.to.x === other.cycle.x && move.to.y === other.cycle.y && other.to.x === move.cycle.x && other.to.y === move.cycle.y) doomed.set(id, `traded places with ${other.cycle.name}`);
    }
  }

  for (const [id, move] of targets) {
    move.cycle.heading = steered(move.cycle.heading, move.steer);
    report.moves.push({ cycleId: id, steer: move.steer, to: move.to });
    const cause = doomed.get(id);
    if (cause !== undefined) { kill(move.cycle, arena.tick, cause); report.deaths.push({ cycleId: id, cause }); continue; }
    move.cycle.x = move.to.x; move.cycle.y = move.to.y; move.cycle.distance += 1;
    setCell(arena, move.to, arena.cycles.indexOf(move.cycle));
  }

  if (arena.shrinkEvery > 0 && arena.tick % arena.shrinkEvery === 0) report.collapsed = collapse(arena, report);
  return report;
}

function kill(cycle: Cycle, tick: number, cause: string): void { cycle.alive = false; cycle.diedOnTick = tick; cycle.cause = cause; }

/** Armageddon: one ring of the arena is eaten from every side, and anyone still standing there goes with it. */
function collapse(arena: Arena, report: TickReport): boolean {
  const { minX, maxX, minY, maxY } = arena.bounds;
  if (maxX - minX < 2 || maxY - minY < 2) return false;
  for (let x = minX; x <= maxX; x++) for (const y of [minY, maxY]) setCell(arena, { x, y }, -2);
  for (let y = minY; y <= maxY; y++) for (const x of [minX, maxX]) setCell(arena, { x, y }, -2);
  arena.bounds = { minX: minX + 1, maxX: maxX - 1, minY: minY + 1, maxY: maxY - 1 };
  for (const cycle of arena.cycles) {
    if (!cycle.alive) continue;
    const { minX: nx, maxX: xx, minY: ny, maxY: yy } = arena.bounds;
    if (cycle.x < nx || cycle.x > xx || cycle.y < ny || cycle.y > yy) { kill(cycle, arena.tick, "swallowed by the collapsing arena"); report.deaths.push({ cycleId: cycle.id, cause: cycle.cause! }); }
  }
  return true;
}

export type Verdict = { state: "running" } | { state: "finished"; winnerId: string | null; reason: string };

export function verdict(arena: Arena): Verdict {
  const living = arena.cycles.filter((cycle) => cycle.alive);
  if (living.length > 1) return { state: "running" };
  if (living.length === 1) return { state: "finished", winnerId: living[0]!.id, reason: `${living[0]!.name} is the last cycle riding` };
  const lastTick = Math.max(...arena.cycles.map((cycle) => cycle.diedOnTick ?? 0));
  const last = arena.cycles.filter((cycle) => cycle.diedOnTick === lastTick);
  if (last.length === 1) return { state: "finished", winnerId: last[0]!.id, reason: `everyone derezzed, ${last[0]!.name} lasted longest` };
  return { state: "finished", winnerId: null, reason: `${last.map((cycle) => cycle.name).join(" and ")} derezzed together` };
}

/** The whole board as text rows: uppercase heads, lowercase walls, # eaten arena, . open floor. */
export function renderBoard(arena: Arena): string[] {
  const rows: string[] = [];
  for (let y = 0; y < arena.size; y++) {
    let row = "";
    for (let x = 0; x < arena.size; x++) {
      const owner = cellAt(arena, { x, y });
      if (owner === -2) { row += "#"; continue; }
      if (owner === -1) { row += "."; continue; }
      const cycle = arena.cycles[owner]!;
      row += cycle.alive && cycle.x === x && cycle.y === y ? cycle.glyph.toUpperCase() : cycle.glyph.toLowerCase();
    }
    rows.push(row);
  }
  return rows;
}
