import { CATALOG } from "./catalog.js";
import { storageLimits } from "./economy.js";
import { populationLimit } from "./development.js";
import { mkdir, open, readFile, rename } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import express from "express";
import type { WorldEvent, MatchState, WorldState } from "./types.js";
import { createMatch, RivalMatch } from "./match.js";
import { matchStateSchema } from "./world-schema.js";

const currentDirectory = dirname(fileURLToPath(import.meta.url));
const projectDirectory = join(currentDirectory, "..");
const publicDirectory = join(projectDirectory, "public");
const dataDirectory = join(projectDirectory, "data");
const worldPath = join(dataDirectory, "world.json");
const temporaryWorldPath = `${worldPath}.${process.pid}.tmp`;
const port = Number(process.env.PORT ?? 3000);
const tickMs = Number(process.env.SIMULATION_TICK_MS ?? 300);

const loadWorld = async (): Promise<MatchState> => {
  try {
    return matchStateSchema.parse(JSON.parse(await readFile(worldPath, "utf8")));
  } catch (error) {
    if (error instanceof Error && "code" in error && error.code === "ENOENT") return createMatch();
    // A malformed or unsupported save must never silently replace colony history.
    throw error;
  }
};

const saveWorld = async (world: MatchState): Promise<void> => {
  await mkdir(dataDirectory, { recursive: true });
  const temporaryWorld = await open(temporaryWorldPath, "w");
  try {
    await temporaryWorld.writeFile(JSON.stringify(world), "utf8");
    await temporaryWorld.sync();
  } finally {
    await temporaryWorld.close();
  }
  await rename(temporaryWorldPath, worldPath);
};

const world = await loadWorld();
const simulation = new RivalMatch(world, tickMs);
const app = express();
const viewers = new Set<express.Response>();
const recentEvents: WorldEvent[] = [];
let saveQueue = Promise.resolve();
let shuttingDown = false;

const queueWorldSave = (): Promise<void> => {
  saveQueue = saveQueue.then(
    () => saveWorld(simulation.snapshot()),
    () => saveWorld(simulation.snapshot()),
  );
  return saveQueue;
};

const publicSnapshot = (state: MatchState) => ({
  ...state, colonies: state.colonies.map(({ resourceHistory: _history, ...colony }) => ({ ...colony, limits: storageLimits(colony), populationLimit: populationLimit(colony) })),
});

app.disable("x-powered-by");
app.use("/vendor/three", express.static(join(projectDirectory, "node_modules/three/build")));
app.use("/vendor/three/addons", express.static(join(projectDirectory, "node_modules/three/examples/jsm")));
app.use(express.static(publicDirectory));

app.get("/api/health", (_request, response) => {
  const running = simulation.worlds.every((colony) => colony.jev.status === "running");
  const statusCode = running ? 200 : 503;
  response.status(statusCode).json({
    status: running ? "running" : "waiting",
    colonies: simulation.worlds.map((colony) => ({ id: colony.id, ...colony.jev, tick: colony.tick })),
    viewers: viewers.size,
  });
});

app.get("/api/decision-usage", (_request, response) => {
  response.setHeader("Cache-Control", "no-store");
  response.json(simulation.decisionUsage());
});

app.get("/api/world", (_request, response) => {
  response.setHeader("Cache-Control", "no-store");
  response.json({ world: simulation.snapshot(), catalog: CATALOG, events: recentEvents.slice(-30) });
});

app.get("/api/events", (request, response) => {
  response.status(200);
  response.setHeader("Content-Type", "text/event-stream");
  response.setHeader("Cache-Control", "no-cache, no-transform");
  response.setHeader("Connection", "keep-alive");
  response.flushHeaders();
  response.write(`event: catalog\ndata: ${JSON.stringify(CATALOG)}\n\n`);
  response.write(`event: snapshot\ndata: ${JSON.stringify(publicSnapshot(simulation.snapshot()))}\n\n`);
  response.write(`event: resource-history\ndata: ${JSON.stringify(simulation.worlds.map((colony) => ({ colonyId: colony.id, samples: colony.resourceHistory })))}\n\n`);
  viewers.add(response);

  const heartbeat = setInterval(() => response.write(": heartbeat\n\n"), 15_000);
  request.on("close", () => {
    clearInterval(heartbeat);
    viewers.delete(response);
  });
});

simulation.on("snapshot", (snapshot: MatchState) => {
  const payload = `event: snapshot\ndata: ${JSON.stringify(publicSnapshot(snapshot))}\n\n`;
  for (const viewer of viewers) viewer.write(payload);
});

simulation.on("resource-sample", (sample: { colonyId: string; sample: WorldState["resourceHistory"][number] }) => {
  const payload = `event: resource-sample\ndata: ${JSON.stringify(sample)}\n\n`;
  for (const viewer of viewers) viewer.write(payload);
});

simulation.on("event", (event: WorldEvent) => {
  recentEvents.push(event);
  if (recentEvents.length > 200) recentEvents.shift();
  const payload = `event: world-event\ndata: ${JSON.stringify(event)}\n\n`;
  for (const viewer of viewers) viewer.write(payload);
});

const server = app.listen(port, () => {
  simulation.start();
  console.log(`Jev Colony is running at http://localhost:${port}`);
});

const saveInterval = setInterval(() => {
  void queueWorldSave().catch((error: Error) => console.error("World save failed", error));
}, 5_000);

const shutdown = async (): Promise<void> => {
  if (shuttingDown) return;
  shuttingDown = true;
  simulation.stop();
  clearInterval(saveInterval);
  await queueWorldSave();
  for (const viewer of viewers) viewer.end();
  viewers.clear();
  await new Promise<void>((resolve, reject) => {
    server.close((error) => {
      if (error === undefined) resolve();
      else reject(error);
    });
  });
  process.exit(0);
};

process.on("SIGINT", () => void shutdown());
process.on("SIGTERM", () => void shutdown());
