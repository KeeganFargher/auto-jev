import { mkdir, open as openFile, readdir, readFile, rename, unlink } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import express from "express";
import { armyStrength, armyUpkeep, provinceIncome } from "./army.js";
import { battleTick, createBattle, reportFromBattle, BATTLE_TICK_MS, type BattleState } from "./battle.js";
import { KITS } from "./abilities.js";
import { BUILDINGS } from "./buildings.js";
import { DOCTRINES } from "./doctrines.js";
import { HEROES } from "./heroes.js";
import { createDecisionEngine, type DecisionEngine } from "./jev.js";
import { createCampaign } from "./match.js";
import type { BattleSides } from "./resolve.js";
import type { CampaignState } from "./types.js";
import { resolveTurn, type TurnEvent } from "./turn.js";
import { summarise } from "./summary.js";
import { UNITS } from "./units.js";

const currentDirectory = dirname(fileURLToPath(import.meta.url));
const projectDirectory = join(currentDirectory, "..");
const publicDirectory = join(projectDirectory, "public");
const dataDirectory = join(projectDirectory, "data");
const worldPath = process.env.WORLD_PATH ?? join(dataDirectory, "campaign.json");
const temporaryWorldPath = `${worldPath}.${process.pid}.tmp`;
const port = Number(process.env.PORT ?? 3000);
const turnMs = Number(process.env.TURN_MS ?? 1400);
/** Scales every hold the turn makes for the spectator; 0 makes turns instant. */
const paceScale = Number(process.env.PACE ?? 1);
/** How long the battlefield holds after the fighting stops, so the result lands before the cut. */
const BATTLE_AFTERMATH_MS = 3800;
const battleSpeed = Number(process.env.BATTLE_SPEED ?? 1);
const restartDelayMs = Number(process.env.MATCH_RESTART_MS ?? 20_000);
/** Everything the client needs to name things, sent once on connect. */
const CATALOG = { units: UNITS, buildings: BUILDINGS, heroes: HEROES, doctrines: DOCTRINES, abilities: KITS, icons: [] as string[], portraits: [] as string[], vignettes: [] as string[], jevs: [] as string[], crests: [] as string[], scenes: [] as string[] };
/**
 * Which icons, unit portraits and biome vignettes have artwork on disk. Dropping `star.png` into
 * public/icons, `spearmen.png` into public/portraits or `marsh.png` into public/vignettes is the
 * whole install: the client swaps the drawing for it, and anything without a file keeps what it had.
 */
const SCENE_FOLDERS = ["doctrine", "buildings", "scenes"];
async function loadArtwork(): Promise<void> {
  // File names go over whole, extension included, so artwork can be webp or png without the client
  // guessing which; it keys on the part before the dot.
  const artFiles = async (folder: string): Promise<string[]> => {
    try {
      const files = await readdir(join(publicDirectory, folder));
      return files.filter((file) => /\.(png|webp|jpe?g|avif)$/i.test(file)).sort();
    } catch { return []; }
  };
  CATALOG.icons = await artFiles("icons");
  CATALOG.portraits = await artFiles("portraits");
  CATALOG.vignettes = await artFiles("vignettes");
  CATALOG.jevs = await artFiles("jevs");
  CATALOG.crests = await artFiles("faction");
  // Scene art is grouped by what it depicts, so each entry carries its folder and the client
  // keys on the file name within it.
  CATALOG.scenes = (await Promise.all(SCENE_FOLDERS.map(async (folder) =>
    (await artFiles(folder)).map((file) => `${folder}/${file}`)))).flat();
}

let state: CampaignState = await loadCampaign();
let engines: Map<string, DecisionEngine> = buildEngines(state);
let battle: BattleState | null = null;
let running = true;
let restartAt: number | null = null;
/** Spectator pacing: 0 pauses, 1 is normal, 2 and 4 fast-forward. Applies to turns and battles alike. */
let speed = 1;
const recentEvents: TurnEvent[] = [];
const viewers = new Set<express.Response>();
let saveQueue = Promise.resolve();

async function loadCampaign(): Promise<CampaignState> {
  try { return JSON.parse(await readFile(worldPath, "utf8")) as CampaignState; }
  catch (error) {
    if (error instanceof Error && "code" in error && error.code === "ENOENT") return createCampaign(Date.now() >>> 0, 1);
    // A malformed save must never silently replace campaign history.
    throw error;
  }
}
function buildEngines(campaign: CampaignState): Map<string, DecisionEngine> {
  return new Map(campaign.factions.map((faction, index) => [faction.id, createDecisionEngine(`Jev ${faction.name}`, campaign.seed + index * 7919)]));
}
async function saveCampaign(): Promise<void> {
  await mkdir(dataDirectory, { recursive: true });
  const handle = await openFile(temporaryWorldPath, "w");
  try { await handle.writeFile(JSON.stringify(state), "utf8"); await handle.sync(); } finally { await handle.close(); }
  await rename(temporaryWorldPath, worldPath);
}
const queueSave = (): Promise<void> => { saveQueue = saveQueue.then(saveCampaign, saveCampaign); return saveQueue; };

const broadcast = (event: string, payload: unknown): void => {
  const message = `event: ${event}\ndata: ${JSON.stringify(payload)}\n\n`;
  for (const viewer of viewers) viewer.write(message);
};
/** The campaign as the spectator sees it, with derived numbers the client would otherwise recompute. */
function snapshot(): Record<string, unknown> {
  return {
    ...state,
    restartAt,
    speed,
    provinces: state.provinces.map((province) => ({ ...province, effectiveIncome: provinceIncome(province) })),
    summary: state.status.state === "finished" ? summarise(state, recentEvents) : null,
    armies: state.armies.map((army) => ({ ...army, strength: Math.round(armyStrength(state, army)), upkeep: armyUpkeep(army) })),
  };
}
/** A battle frame: only what moves, so this can go out ten times a second. */
function battleFrame(current: BattleState, withTerrain = false): Record<string, unknown> {
  return {
    // The ground never changes, so it rides the opening frame rather than every frame.
    ...(withTerrain ? { terrain: current.terrain } : {}),
    id: current.id, provinceId: current.provinceId, biome: current.biome, siege: current.siege, walls: current.walls,
    attackerFactionId: current.attackerFactionId, defenderFactionId: current.defenderFactionId,
    tick: current.tick, phase: current.phase, outcome: current.outcome,
    units: current.units, lords: current.lords, casts: current.casts,
    fighters: current.fighters.filter((fighter) => fighter.state !== "dead").map((fighter) => ({
      i: fighter.id, s: fighter.side, u: fighter.unitId, c: fighter.cardId, l: fighter.lordId,
      x: Math.round(fighter.x * 10) / 10, y: Math.round(fighter.y * 10) / 10,
      h: Math.round(fighter.health), m: Math.round(fighter.maxHealth), st: fighter.state, e: fighter.effects,
      // Facing and opponent. The renderer used to infer facing from the last blow landed — once
      // every one and a half seconds — so men in a melee stood looking wherever they last walked.
      f: Math.round(fighter.facing * 100) / 100, d: fighter.targetId,
    })),
  };
}
const publish = (event: TurnEvent): void => {
  // The client counts a decision's hold down at the playback speed, so it needs the same wall-clock
  // budget the pacer will actually spend, PACE included.
  if (event.hold !== undefined) event = { ...event, hold: event.hold * paceScale };
  if (event.type !== "stage") {
    recentEvents.push(event);
    if (recentEvents.length > 300) recentEvents.shift();
  }
  broadcast("event", event);
  // A faction's turn changed the map; let the HUD catch up before the next faction moves.
  if (event.stage?.phase === "end") broadcast("snapshot", snapshot());
};
/** Holds the turn so the spectator can watch; honours pause and fast-forward as they change. */
const pace = async (ms: number): Promise<void> => {
  let remaining = ms * paceScale;
  while (remaining > 0 && running) {
    if (speed === 0) { await new Promise((resolve) => setTimeout(resolve, 120)); continue; }
    await new Promise((resolve) => setTimeout(resolve, 50));
    remaining -= 50 * speed;
  }
};

/** Plays one battle out in real time, streaming every frame, and hands the campaign its result. */
async function runLiveBattle(sides: BattleSides): Promise<ReturnType<typeof reportFromBattle>> {
  battle = createBattle(state, sides);
  state.phase = "battle";
  broadcast("battle-start", { ...battleFrame(battle, true), province: sides.province.name, prediction: sides.province.name });
  while (battle.phase === "fighting" && running) {
    battleTick(battle);
    if (battle.tick % 2 === 0 || battle.phase !== "fighting") broadcast("battle-frame", battleFrame(battle));
    while (speed === 0 && running) await new Promise((resolve) => setTimeout(resolve, 120));
    await new Promise((resolve) => setTimeout(resolve, BATTLE_TICK_MS / Math.max(0.25, battleSpeed * Math.max(0.25, speed))));
  }
  const report = reportFromBattle(state, battle, sides);
  // The field stands for a beat with the result on it before the camera goes anywhere. Cutting
  // straight back to the map threw away the only moment the spectator actually cares about: the
  // one where they find out what the fighting cost and who is still standing.
  broadcast("battle-aftermath", { frame: battleFrame(battle), report });
  await pace(BATTLE_AFTERMATH_MS);
  broadcast("battle-end", { frame: battleFrame(battle, true), report });
  battle = null;
  state.phase = "resolving";
  return report;
}

async function startNewCampaign(): Promise<void> {
  state = createCampaign(Date.now() >>> 0, state.number + 1);
  engines = buildEngines(state);
  recentEvents.length = 0;
  restartAt = null;
  broadcast("snapshot", snapshot());
  console.log(`Campaign ${state.number} started with seed ${state.seed}`);
}
/** The campaign loop: a turn, a pause for the spectator to read it, then the next turn. */
async function loop(): Promise<void> {
  while (running) {
    if (state.status.state === "finished") {
      if (restartAt === null) { restartAt = Date.now() + restartDelayMs; broadcast("snapshot", snapshot()); }
      if (Date.now() >= restartAt) await startNewCampaign();
      await new Promise((resolve) => setTimeout(resolve, 500));
      continue;
    }
    const started = Date.now();
    try { await resolveTurn(state, engines, publish, runLiveBattle, pace); }
    catch (error) { console.error("Turn failed", error); }
    broadcast("snapshot", snapshot());
    void queueSave().catch((error: Error) => console.error("Save failed", error));
    while (speed === 0 && running) await new Promise((resolve) => setTimeout(resolve, 120));
    const spent = Date.now() - started;
    const wanted = turnMs / Math.max(0.25, speed);
    if (spent < wanted) await new Promise((resolve) => setTimeout(resolve, wanted - spent));
  }
}

const app = express();
app.disable("x-powered-by");
app.use("/vendor/three", express.static(join(projectDirectory, "node_modules/three/build")));
app.use("/vendor/three/addons", express.static(join(projectDirectory, "node_modules/three/examples/jsm")));
app.use(express.static(publicDirectory));

app.get("/api/health", (_request, response) => {
  response.json({ status: state.status.state, campaign: state.number, turn: state.turn, phase: state.phase, inBattle: battle !== null, viewers: viewers.size });
});
app.get("/api/world", (_request, response) => {
  response.setHeader("Cache-Control", "no-store");
  response.json({ world: snapshot(), catalog: CATALOG, events: recentEvents.slice(-60) });
});
app.use(express.json());
app.post("/api/speed", (request, response) => {
  const wanted = Number((request.body as { speed?: unknown } | undefined)?.speed);
  if (![0, 1, 2, 4].includes(wanted)) { response.status(400).json({ error: "speed must be 0, 1, 2 or 4" }); return; }
  speed = wanted;
  broadcast("snapshot", snapshot());
  response.json({ speed });
});
app.post("/api/restart", async (_request, response) => { await startNewCampaign(); response.json({ campaign: state.number }); });
app.get("/api/events", (request, response) => {
  response.status(200);
  response.setHeader("Content-Type", "text/event-stream");
  response.setHeader("Cache-Control", "no-cache, no-transform");
  response.setHeader("Connection", "keep-alive");
  response.flushHeaders();
  response.write(`event: catalog\ndata: ${JSON.stringify(CATALOG)}\n\n`);
  response.write(`event: snapshot\ndata: ${JSON.stringify(snapshot())}\n\n`);
  response.write(`event: history\ndata: ${JSON.stringify(recentEvents.slice(-60))}\n\n`);
  if (battle !== null) response.write(`event: battle-start\ndata: ${JSON.stringify(battleFrame(battle, true))}\n\n`);
  viewers.add(response);
  const heartbeat = setInterval(() => response.write(": heartbeat\n\n"), 15_000);
  request.on("close", () => { clearInterval(heartbeat); viewers.delete(response); });
});

await loadArtwork();
const server = app.listen(port, () => {
  console.log(`Jev Rivals at http://localhost:${port} — campaign ${state.number}, seed ${state.seed}, ${state.provinces.length} provinces, ${CATALOG.icons.length} icons, ${CATALOG.portraits.length} portraits, ${CATALOG.vignettes.length} vignettes, ${CATALOG.jevs.length} Jevs, ${CATALOG.crests.length} crests and ${CATALOG.scenes.length} scenes`);
  void loop();
});
const shutdown = async (): Promise<void> => {
  if (!running) return;
  running = false;
  await queueSave().catch(() => undefined);
  for (const viewer of viewers) viewer.end();
  viewers.clear();
  await new Promise<void>((resolve) => { server.close(() => resolve()); });
  await unlink(temporaryWorldPath).catch(() => undefined);
  process.exit(0);
};
process.on("SIGINT", () => void shutdown());
process.on("SIGTERM", () => void shutdown());
