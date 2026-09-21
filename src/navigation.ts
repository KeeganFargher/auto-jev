import { farmTiles } from "./progression.js";
import type { Position, WorldState } from "./types.js";

const cached = new WeakMap<WorldState, { tick: number; layout: string; obstacles: Position[]; blocked: Uint8Array }>();
const blockedTiles = (world: WorldState): Uint8Array => {
  const layout = `${world.structures.map(b=>`${b.id}:${b.x}:${b.y}`).join(",")}:${world.buildings.huts}:${world.project?.id}:${world.farms.map((farm) => `${farm.id}:${farm.radius}`).join(",")}`;
  const previous = cached.get(world);
  if (previous !== undefined && previous.tick === world.tick && previous.layout === layout && previous.obstacles === world.obstacles) return previous.blocked;
  const blocked = new Uint8Array(world.width * world.height);
  const add = ({ x, y }: Position): void => { blocked[y * world.width + x] = 1; };
  for (const resource of world.resources) if (resource.kind !== "river" && (resource.amount > 0 || resource.kind === "tree" || resource.kind === "berries")) add(resource);
  for (let index = 0; index < world.terrain.tiles.length; index++) if ((world.terrain.tiles[index]==="w"||world.terrain.tiles[index]==="m")) blocked[index] = 1;
  for (const building of world.structures) for (const dx of [-1,0,1]) for (const dy of [-1,0,1]) add({x:building.x+dx,y:building.y+dy});
  add(world.camp);
  for (const station of Object.values(world.stations)) add(station);
  for (const obstacle of world.obstacles) add(obstacle);
  for (const farm of [...world.farms, ...(world.project === null ? [] : [world.project])]) for (const tile of farmTiles(farm)) add(tile);
  for (let index = 0; index < world.buildings.huts; index++) add({ x: world.camp.x - 2 + index % 4, y: world.camp.y + 2 + Math.floor(index / 4) });
  cached.set(world, { tick: world.tick, layout, obstacles: world.obstacles, blocked });
  return blocked;
};

/** Finds the nearest legal tile when a new structure or restored task occupies a worker's tile. */
export function findOpenPosition(world: WorldState, position: Position): Position {
  const blocked = blockedTiles(world);
  if (blocked[position.y * world.width + position.x] === 0) return position;
  for (let radius = 1; radius < world.width + world.height; radius++) {
    for (let dy = -radius; dy <= radius; dy++) for (const dx of [-1, 1].map((sign) => sign * (radius - Math.abs(dy)))) {
      const x = position.x + dx, y = position.y + dy;
      if (x >= 0 && y >= 0 && x < world.width && y < world.height && blocked[y * world.width + x] === 0) return { x, y };
    }
  }
  throw new Error("The colony has no open tile for a colonist");
}

/** Finds a cardinal A* route; proximity heuristics keep distant journeys affordable on large maps. */
export function findRoute(world: WorldState, from: Position, destination: Position, adjacent = false, reach = 1): Position[] | null {
  const blocked = blockedTiles(world);
  const size = world.width * world.height;
  const start = from.y * world.width + from.x;
  const destinationIndex = destination.y * world.width + destination.x;
  const parents = new Int32Array(size).fill(-1);
  const costs = new Int32Array(size).fill(2147483647);
  const closed = new Uint8Array(size);
  const heap: Array<{ index: number; priority: number }> = [];
  const heuristic = (index: number): number => Math.max(0, Math.abs(index % world.width - destination.x) + Math.abs(Math.floor(index / world.width) - destination.y) - (adjacent ? reach : 0));
  const push = (node: { index: number; priority: number }): void => {
    let cursor = heap.length;
    heap.push(node);
    while (cursor > 0) {
      const parent = Math.floor((cursor - 1) / 2), candidate = heap[parent];
      if (candidate === undefined || candidate.priority <= node.priority) break;
      heap[cursor] = candidate; cursor = parent;
    }
    heap[cursor] = node;
  };
  const pop = (): number => {
    const first = heap[0], last = heap.pop();
    if (first === undefined || last === undefined) throw new Error("Empty route frontier");
    if (heap.length > 0) {
      let cursor = 0;
      while (cursor * 2 + 1 < heap.length) {
        let child = cursor * 2 + 1;
        const left = heap[child], right = heap[child + 1];
        if (left === undefined) throw new Error("Missing route heap child");
        if (right !== undefined && right.priority < left.priority) child++;
        const candidate = heap[child];
        if (candidate === undefined || candidate.priority >= last.priority) break;
        heap[cursor] = candidate; cursor = child;
      }
      heap[cursor] = last;
    }
    return first.index;
  };
  costs[start] = 0;
  push({ index: start, priority: heuristic(start) });
  while (heap.length > 0) {
    const current = pop();
    if (closed[current]) continue;
    closed[current] = 1;
    const x = current % world.width, y = Math.floor(current / world.width);
    const distance = Math.abs(x - destination.x) + Math.abs(y - destination.y);
    if (distance === (adjacent ? reach : 0) && blocked[current] === 0) {
      const route: Position[] = [];
      let step = current;
      while (step !== start) {
        route.push({ x: step % world.width, y: Math.floor(step / world.width) });
        const parent = parents[step];
        if (parent === undefined || parent < 0) throw new Error("Route lost its parent tile");
        step = parent;
      }
      return route.toReversed();
    }
    const currentCost = costs[current];
    if (currentCost === undefined) throw new Error("Route cost is outside the map");
    for (const [dx, dy] of [[1, 0], [0, 1], [-1, 0], [0, -1]] as const) {
      const nx = x + dx, ny = y + dy, next = ny * world.width + nx;
      if (nx < 0 || ny < 0 || nx >= world.width || ny >= world.height || blocked[next] || closed[next] || adjacent && next === destinationIndex) continue;
      const previousCost = costs[next];
      if (previousCost === undefined || currentCost + 1 >= previousCost) continue;
      costs[next] = currentCost + 1; parents[next] = current;
      push({ index: next, priority: currentCost + 1 + heuristic(next) });
    }
  }
  return null;
}

/** Checks a planned step against structures built since routing. */
export function isWalkable(world: WorldState, position: Position): boolean { return blockedTiles(world)[position.y * world.width + position.x] === 0; }
