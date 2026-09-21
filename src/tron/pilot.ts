import type { DecisionEngine } from "../jev.js";
import { type Arena, type Cycle, type Steer, isOpen, landing, openSpace, renderBoard, runway, steered, survivableSteers } from "./arena.js";

export interface PilotChoice {
  steer: Steer;
  /** False when the position decided itself and no commander was asked. */
  asked: boolean;
  confidence: number;
  probabilities: Record<string, number>;
  latencyMs: number;
  note: string;
  /** Diagnostics: how many steers were on the table, and whether the commander took the one with the most floor behind it. */
  options: number;
  tookRoomiest: boolean;
}

interface SteerRead { steer: Steer; legal: boolean; to: { x: number; y: number }; heading: string; runway: number; space: number; nearestRival: number }

function readSteer(arena: Arena, cycle: Cycle, steer: Steer): SteerRead {
  const to = landing(cycle, steer);
  const heading = steered(cycle.heading, steer);
  const legal = isOpen(arena, to);
  const rivals = arena.cycles.filter((other) => other.alive && other.id !== cycle.id);
  const nearestRival = rivals.length === 0 ? 99 : Math.min(...rivals.map((other) => Math.abs(other.x - to.x) + Math.abs(other.y - to.y)));
  return { steer, legal, to, heading, runway: legal ? runway(arena, to, heading) : 0, space: legal ? openSpace(arena, to) : 0, nearestRival };
}

function describe(read: SteerRead): string {
  if (!read.legal) return `turns ${read.heading} into a wall at (${read.to.x},${read.to.y}) — instant derez`;
  return `turns ${read.heading} to (${read.to.x},${read.to.y}); ${read.runway} clear cells straight ahead after that, ${read.space} cells of floor still reachable from there, nearest rival ${read.nearestRival} cells away`;
}

/** Everything the commander is allowed to see: the whole board, plus who is standing where. */
export function boardState(arena: Arena, cycle: Cycle): Record<string, unknown> {
  const rivals = arena.cycles.filter((other) => other.id !== cycle.id);
  return {
    game: "Tron light cycles — you leave a solid wall behind you every tick, you can never stop or reverse, and you derez the moment you touch any wall, any rival, or the edge",
    tick: arena.tick,
    board: renderBoard(arena).join("\n"),
    legend: `${arena.size}x${arena.size} grid, x runs left to right and y runs top to bottom. '.' is open floor. '#' is arena the armageddon has already eaten and is lethal. ${arena.cycles.map((other) => `'${other.glyph.toUpperCase()}' is ${other.name}'s head and '${other.glyph.toLowerCase()}' is ${other.name}'s wall`).join(". ")}`,
    armageddon: `every ${arena.shrinkEvery} ticks one ring of the arena is eaten from all four sides; the live rectangle is now x ${arena.bounds.minX}-${arena.bounds.maxX}, y ${arena.bounds.minY}-${arena.bounds.maxY}, and the next ring falls in ${arena.shrinkEvery - (arena.tick % arena.shrinkEvery)} ticks`,
    you: `${cycle.name} ('${cycle.glyph.toUpperCase()}') at (${cycle.x},${cycle.y}) heading ${cycle.heading}, ${cycle.distance} ticks of wall laid`,
    rivals: rivals.map((other) => other.alive ? `${other.name} ('${other.glyph.toUpperCase()}') alive at (${other.x},${other.y}) heading ${other.heading}, ${Math.abs(other.x - cycle.x) + Math.abs(other.y - cycle.y)} cells from you` : `${other.name} derezzed on tick ${other.diedOnTick} (${other.cause})`).join("; "),
    goal: "outlast the other cycles: survive the shrinking arena and make them run out of room before you do",
  };
}

/** Asks the commander for one steer. Positions with a single way out answer themselves and cost no call. */
export async function pilot(engine: DecisionEngine, arena: Arena, cycle: Cycle): Promise<PilotChoice> {
  const open = survivableSteers(arena, cycle);
  if (open.length === 0) return { steer: "straight", asked: false, confidence: 1, probabilities: { straight: 1 }, latencyMs: 0, note: "boxed in, nothing survives", options: 0, tookRoomiest: false };
  if (open.length === 1) return { steer: open[0]!, asked: false, confidence: 1, probabilities: { [open[0]!]: 1 }, latencyMs: 0, note: "only one way out", options: 1, tookRoomiest: true };

  const reads = open.map((steer) => readSteer(arena, cycle, steer));
  const criteria = Object.fromEntries(reads.map((read) => [read.steer, describe(read)]));
  const hints = Object.fromEntries(reads.map((read) => [read.steer, read.space + read.runway * 2]));
  const result = await engine.choose(boardState(arena, cycle), {
    instructions: `You are piloting ${cycle.name} in a Tron light cycle duel. Pick the steer that keeps you alive longest and cuts the others off. Turning is relative to your current heading (${cycle.heading}).`,
    criteria, hints,
  });
  const steer = (open.includes(result.choice as Steer) ? result.choice : open[0]!) as Steer;
  const roomiest = reads.reduce((best, read) => (read.space > best.space ? read : best), reads[0]!);
  return { steer, asked: true, confidence: result.confidence, probabilities: result.probabilities, latencyMs: result.latencyMs, note: open.includes(result.choice as Steer) ? "" : `commander picked '${result.choice}', which is not on the table`, options: open.length, tookRoomiest: steer === roomiest.steer };
}
