import { generateMap } from "./map-generation.js";
import { EventEmitter } from "node:events";
import { createDecisionEngine } from "./jev.js";
import { ColonySimulation, createWorld } from "./world.js";
import { farmTiles } from "./progression.js";
import type { MatchState, Position, WorldEvent, WorldState } from "./types.js";

/** Creates equally supplied colonies on opposite sides of a mirrored island. */
export function createMatch(): MatchState {
  const width = 192;
  const height = 128;
  const first = createWorld();
  const colonies = [first, structuredClone(first)];
  for (const [index, colony] of colonies.entries()) {
    const dx = (index === 0 ? 32 : width - 33) - colony.camp.x;
    const dy = 64 - colony.camp.y;
    colony.id = index === 0 ? "ember" : "tide";
    colony.name = index === 0 ? "Ember" : "Tide";
    colony.color = index === 0 ? "#dc9869" : "#65b8cc";
    for (const position of [colony.camp, ...Object.values(colony.stations), ...colony.colonists]) { position.x += dx; position.y += dy; }
    for (const person of colony.colonists) { person.id = `${colony.id}-${person.id}`; person.name = `${person.name} · ${colony.name}`; }
    colony.width = width;
    colony.height = height;
  }
  const {terrain, resources} = generateMap(Date.now() >>> 0, width, height, colonies.map((colony) => colony.camp));
  for (const [index,colony] of colonies.entries()) { colony.terrain = terrain; colony.randomState = (terrain.seed + index * 7919) >>> 0; }
  return { width, height, terrain, resources, colonies: colonies.map(({ resources: _resources, width: _width, height: _height, obstacles: _obstacles, terrain: _terrain, ...colony }) => colony) };
}

const structures = (world: WorldState): Position[] => [
  world.camp, ...Object.values(world.stations), ...world.structures.flatMap((building) => [-1,0,1].flatMap(dx => [-1,0,1].map(dy => ({x:building.x+dx,y:building.y+dy})))),
  ...world.farms.flatMap(farmTiles), ...(world.project === null ? [] : farmTiles(world.project)),
  ...Array.from({ length: world.buildings.huts }, (_, index) => ({ x: world.camp.x - 2 + index % 4, y: world.camp.y + 2 + Math.floor(index / 4) })),
];

/** Coordinates a shared map while keeping each commander's private decision state separate. */
export class RivalMatch extends EventEmitter {
  public readonly worlds: WorldState[];
  private readonly simulations: ColonySimulation[];
  private interval: NodeJS.Timeout | undefined;

  public constructor(private readonly state: MatchState, private readonly tickMs: number) {
    super();
    this.worlds = state.colonies.map((colony) => ({ ...colony, width: state.width, height: state.height, resources: state.resources, terrain: state.terrain, obstacles: [] }));
    const [ember, tide] = this.worlds;
    if (ember === undefined || tide === undefined || ember.id === tide.id) throw new Error("A rivalry requires two distinct colonies");
    ember.obstacles = structures(tide);
    tide.obstacles = structures(ember);
    this.simulations = [new ColonySimulation(ember, createDecisionEngine("Jev Ember"), tide), new ColonySimulation(tide, createDecisionEngine("Jev Tide"), ember)];
    for (const [index, simulation] of this.simulations.entries()) {
      const colony = this.worlds[index];
      if (colony === undefined) throw new Error("Simulation has no colony");
      simulation.on("event", (event: WorldEvent) => this.emit("event", { ...event, message: `[${colony.name}] ${event.message}` }));
      simulation.on("resource-sample", (sample: WorldState["resourceHistory"][number]) => this.emit("resource-sample", { colonyId: colony.id, sample }));
    }
  }

  /** Starts both colonies at the same simulation cadence. */
  public start(): void {
    this.interval = setInterval(() => {
      for (const [index, simulation] of this.simulations.entries()) {
        const rival = this.worlds[1 - index];
        if (rival === undefined) throw new Error("Simulation has no rival");
        simulation.state.obstacles = structures(rival);
        simulation.tick();
      }
      this.emit("snapshot", this.snapshot());
    }, this.tickMs);
  }

  /** Stops ticks and queued decisions before persistence. */
  public stop(): void {
    clearInterval(this.interval);
    for (const simulation of this.simulations) simulation.stop();
  }

  /** Reports decision costs since this process started, normalized to simulated colony days. */
  public decisionUsage() {
    return this.simulations.map((simulation) => {
      const usage = simulation.decisionUsage;
      const days = (simulation.state.tick - usage.startTick) / 480;
      return { colonyId: simulation.state.id, ...usage, colonyDays: days,
        inputTokensPerColonyDay: days > 0 ? Math.round(usage.inputTokens / days) : null,
        questionsPerWorkerRequest: usage.requests > 0 ? usage.questions / usage.requests : null };
    });
  }

  /** Serialises one shared map and each colony's private state, with no compatibility formats. */
  public snapshot(): MatchState {
    return { terrain: this.state.terrain, width: this.state.width, height: this.state.height, resources: this.state.resources, colonies: this.worlds.map(({ width: _width, height: _height, resources: _resources, obstacles: _obstacles, terrain: _terrain, ...colony }) => colony) };
  }
}
