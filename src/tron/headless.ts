import { createDecisionEngine } from "../jev.js";
import { type Arena, type Steer, advance, renderBoard, verdict } from "./arena.js";
import { createArena, type Cycle } from "./arena.js";
import { pilot, type PilotChoice } from "./pilot.js";

/** Headless Tron Armageddon: one commander per light cycle, the whole board handed over every tick. */

try { process.loadEnvFile(".env"); } catch { /* the shell may already hold the credentials */ }

const seed = Number(process.env.TRON_SEED ?? process.argv[2] ?? 1);
const size = Number(process.env.TRON_SIZE ?? 21);
const shrinkEvery = Number(process.env.TRON_SHRINK ?? 15);
const maxTicks = Number(process.env.TRON_MAX_TICKS ?? 400);
const quiet = process.env.TRON_QUIET === "1";

const RIDERS = [
  { id: "azure", name: "Azure", glyph: "a" },
  { id: "crimson", name: "Crimson", glyph: "c" },
  { id: "ember", name: "Ember", glyph: "e" },
];

const arena = createArena(size, RIDERS, shrinkEvery);
const engines = new Map(RIDERS.map((rider, index) => [rider.id, createDecisionEngine(rider.name, seed * 97 + index)]));
const source = engines.get(RIDERS[0]!.id)!.source;
const stats = new Map(RIDERS.map((rider) => [rider.id, { calls: 0, latency: 0, confidence: 0, roomiest: 0, chance: 0 }]));

function paint(arena: Arena, headline: string): void {
  if (quiet) return;
  const rows = renderBoard(arena);
  const status = arena.cycles.map((cycle) => cycle.alive ? `${cycle.glyph.toUpperCase()}=${cycle.name} (${cycle.x},${cycle.y}) ${cycle.heading}` : `${cycle.glyph.toUpperCase()}=${cycle.name} DEREZZED`);
  console.log(`\n-- tick ${arena.tick} -- ${headline}`);
  rows.forEach((row, index) => console.log(`  ${row}${status[index] === undefined ? "" : `   ${status[index]}`}`));
}

console.log(`Tron Armageddon · ${size}x${size} · ring falls every ${shrinkEvery} ticks · commander: ${source} · seed ${seed}`);
paint(arena, "riders on the grid");

let ticks = 0;
while (verdict(arena).state === "running" && ticks < maxTicks) {
  const living = arena.cycles.filter((cycle) => cycle.alive);
  const choices = await Promise.all(living.map(async (cycle): Promise<[Cycle, PilotChoice]> => [cycle, await pilot(engines.get(cycle.id)!, arena, cycle)]));
  const steers = new Map<string, Steer>();
  for (const [cycle, choice] of choices) {
    steers.set(cycle.id, choice.steer);
    if (!choice.asked) continue;
    const stat = stats.get(cycle.id)!;
    stat.calls += 1; stat.latency += choice.latencyMs; stat.confidence += choice.confidence;
    if (choice.tookRoomiest) stat.roomiest += 1;
    stat.chance += 1 / choice.options;
  }
  const report = advance(arena, steers);
  ticks += 1;

  if (!quiet) {
    const line = choices.map(([cycle, choice]) => `${cycle.glyph.toUpperCase()}:${choice.steer}${choice.asked ? `@${Math.round(choice.confidence * 100)}%` : "*"}${choice.note === "" ? "" : ` (${choice.note})`}`).join("  ");
    const deaths = report.deaths.map((death) => `${arena.cycles.find((cycle) => cycle.id === death.cycleId)!.name} ${death.cause}`);
    paint(arena, `${line}${report.collapsed ? "  [ARENA COLLAPSED]" : ""}${deaths.length > 0 ? `\n   DEREZ: ${deaths.join(" | ")}` : ""}`);
  }
}

const result = verdict(arena);
console.log(`\n=== ${result.state === "finished" ? result.reason : `no result in ${maxTicks} ticks`} ===`);
for (const cycle of arena.cycles) {
  const stat = stats.get(cycle.id)!;
  const survived = cycle.diedOnTick ?? arena.tick;
  console.log(`${cycle.name.padEnd(8)} ${cycle.alive ? "RIDING " : "derezzed"} survived=${String(survived).padStart(3)} ticks  wall=${String(cycle.distance).padStart(3)}  decisions=${String(stat.calls).padStart(3)}  avg-confidence=${stat.calls === 0 ? "n/a" : `${Math.round((stat.confidence / stat.calls) * 100)}%`}  avg-latency=${stat.calls === 0 ? "n/a" : `${Math.round(stat.latency / stat.calls)}ms`}  roomiest-pick=${stat.calls === 0 ? "n/a" : `${Math.round((stat.roomiest / stat.calls) * 100)}% (chance ${Math.round((stat.chance / stat.calls) * 100)}%)`}`);
  if (!cycle.alive) console.log(`         ${cycle.cause} on tick ${cycle.diedOnTick}`);
}
const totalCalls = [...stats.values()].reduce((sum, stat) => sum + stat.calls, 0);
const roomiest = [...stats.values()].reduce((sum, stat) => sum + stat.roomiest, 0);
const chance = [...stats.values()].reduce((sum, stat) => sum + stat.chance, 0);
console.log(`roomiest-pick overall: ${Math.round((roomiest / Math.max(1, totalCalls)) * 100)}% vs ${Math.round((chance / Math.max(1, totalCalls)) * 100)}% by coin-flip`);
console.log(`ticks=${arena.tick} commander-calls=${totalCalls} free-moves=${arena.cycles.reduce((sum, cycle) => sum + cycle.distance, 0) - totalCalls}`);
