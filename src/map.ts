import type { Biome, Province, ProvinceKind, UnitId } from "./types.js";
import type { WorldModifierId } from "./world-modifiers.js";

/** Advances a persisted PRNG; the same seed produces the same provinces, biomes and passes. */
export function randomStep(state: number): number { return (Math.imul(state, 1664525) + 1013904223) >>> 0; }

export interface GeneratedCampaign {
  terrain: { seed: number; tiles: string };
  ownership: string;
  provinces: Province[];
}
export interface CapitalSite { factionId: string; name: string; x: number; y: number }

const NAMES = [
  "Black Ridge", "Three Crossings", "Ancient Forest", "Emerald Vale", "Dragon Peaks", "Old Foundry",
  "Saltmarsh", "Iron Highlands", "Blood Pits", "Sunken Temple", "Greyfen", "Ash Hollow",
  "Wolf's Gate", "Silverbrook", "Cinder Flats", "The Bonelands", "Mistmoor", "Stormwatch",
];
/** Each biome is a blend, so provinces read as distinct country rather than as flat colour fields. */
const KIND_NAMES: Record<ProvinceKind, string[]> = {
  capital: [],
  town: ["Silverbrook", "Greyfen", "Mistmoor", "Highmarch", "Willowford", "Oakhurst", "Larkhollow", "Penvale", "Thistledown", "Marrowford"],
  fort: ["Stormwatch", "Wolf's Gate", "Black Ridge", "Ironhold", "The Bulwark", "Grimwall", "Hawkspur", "Dunbarrow", "The Iron Gate", "Shieldfast"],
  mine: ["Iron Highlands", "Old Foundry", "Dragon Peaks", "Deepdelve", "The Slagworks", "Cinder Flats", "Blackseam", "The Deep Cut", "Emberlode", "Grimhollow"],
  farm: ["Emerald Vale", "Goldenfields", "Sunmeadow", "Harrowdale", "The Greenreach", "Appleford", "Wheatmere", "Longacre", "Fallowrise"],
  shrine: ["Sunken Temple", "Ancient Forest", "The Weeping Stones", "Moonwell", "Barrowmound", "The Hollow Crown", "Starfall", "The Quiet Grove"],
  chokepoint: ["Three Crossings", "The Dread Pass", "Ravensgate", "Bloodford", "The Narrows", "Kingsbridge", "Thornbridge", "The Sundering", "Coldgate"],
  wilds: ["The Bonelands", "Saltmarsh", "Ash Hollow", "Blood Pits", "The Rotfen", "Gravemire", "The Scour", "Wyrmwaste", "The Weeping Fen"],
};
const BIOME_MIX: Record<Biome, Array<[string, number]>> = {
  grassland: [["g", 0.86], ["f", 1]],
  forest: [["f", 0.74], ["g", 1]],
  mountain: [["g", 0.58], ["m", 0.94], ["f", 1]],
  marsh: [["s", 0.62], ["g", 0.86], ["w", 1]],
  badlands: [["b", 0.72], ["g", 0.92], ["m", 1]],
};
/** Smooth seeded value noise; keeps biome blends organic instead of speckled. */
const wobble = (x: number, y: number, phase: number): number =>
  (Math.sin(x / 9 + phase) + Math.cos(y / 7.5 - phase) + Math.sin((x + y) / 13 + phase * 2)) / 6 + 0.5;
/** Which kinds are most expendable when a map has to be rebalanced; wilds go first, capitals never. */
const SPARE_RANK: Record<ProvinceKind, number> = { wilds: 5, shrine: 3, farm: 3, town: 2, fort: 2, mine: 2, chokepoint: 0, capital: 0 };
/** What each province kind is worth per turn and what holding it lets its owner field. */
const KIND_RULES: Record<ProvinceKind, { income: number; unlocks: UnitId[] }> = {
  capital: { income: 40, unlocks: ["militia", "swordsmen", "spearmen", "archers"] },
  town: { income: 18, unlocks: [] },
  fort: { income: 8, unlocks: ["shieldguard"] },
  mine: { income: 26, unlocks: ["great_weapons"] },
  farm: { income: 14, unlocks: ["light_cavalry"] },
  shrine: { income: 10, unlocks: ["battle_mage"] },
  chokepoint: { income: 12, unlocks: ["crossbowmen"] },
  wilds: { income: 6, unlocks: ["ogre"] },
};

/**
 * Builds a continuous campaign map from a province layout rather than from noise, so that every
 * stretch of terrain belongs to something worth taking. Barriers are carved along the borders of
 * provinces that are *not* connected, which is what turns the surviving borders into real passes.
 */
export function generateCampaign(seed: number, width: number, height: number, capitals: CapitalSite[], modifier: WorldModifierId, target = 20): GeneratedCampaign {
  let randomState = (seed ^ 0x2545f491) >>> 0;
  const random = (): number => { randomState = randomStep(randomState); return randomState / 4294967296; };
  for (let warm = 0; warm < 4; warm++) random();
  const broken = modifier === "broken_lands";
  const phase = random() * 6.28;

  // --- province sites: capitals are fixed, the rest fill a jittered lattice away from the coast.
  const sites: Array<{ x: number; y: number; factionId: string | null }> = capitals.map((capital) => ({ x: capital.x, y: capital.y, factionId: capital.factionId }));
  // The lattice is sized to the province target rather than fixed, so a bigger world is one number.
  const aspect = width / Math.max(1, height);
  const rows = Math.max(4, Math.round(Math.sqrt(target * 1.6 / aspect)));
  const columns = Math.max(4, Math.round(rows * aspect));
  const spacing = Math.min(width / columns, height / rows) * 0.78;
  const inland = (x: number, y: number): boolean => ((x - width / 2) / (width * 0.47)) ** 4 + ((y - height / 2) / (height * 0.45)) ** 4 < 0.82;
  for (let row = 0; row < rows; row++) for (let column = 0; column < columns; column++) {
    const x = Math.round((column + 0.5) / columns * width + (random() - 0.5) * width / columns * 0.5);
    const y = Math.round((row + 0.5) / rows * height + (random() - 0.5) * height / rows * 0.5);
    if (!inland(x, y)) continue;
    // Keep provinces from crowding a capital or each other; a cramped map has no room to manoeuvre.
    if (sites.some((site) => Math.hypot(site.x - x, site.y - y) < spacing)) continue;
    sites.push({ x, y, factionId: null });
  }

  // --- provinces
  const nameOrder = [...NAMES];
  for (let index = nameOrder.length - 1; index > 0; index--) {
    const swap = Math.floor(random() * (index + 1));
    const a = nameOrder[index], b = nameOrder[swap];
    if (a !== undefined && b !== undefined) { nameOrder[index] = b; nameOrder[swap] = a; }
  }
  const provinces: Province[] = sites.map((site, index) => {
    const capital = capitals.find((entry) => entry.factionId === site.factionId);
    const middle = Math.hypot(site.x - width / 2, site.y - height / 2) / (width * 0.5);
    const biome: Biome = capital !== undefined ? "grassland"
      : site.y < height * 0.28 ? "mountain"
      : site.y > height * 0.74 ? "marsh"
      : middle < 0.3 ? "grassland"
      : random() < 0.45 ? "forest" : random() < 0.5 ? "badlands" : "grassland";
    return {
      id: capital !== undefined ? `cap_${site.factionId}` : `prov_${index}`,
      name: capital?.name ?? nameOrder[index % nameOrder.length] ?? `Province ${index}`,
      x: site.x, y: site.y,
      kind: capital !== undefined ? "capital" : "town",
      biome, ownerId: site.factionId, capturedAt: 0,
      neighbours: [], settlement: null,
      income: 0, unlocks: [], garrison: [], claimed: false,
    };
  });

  // --- voronoi assignment, which also gives us the border pairs
  const owner = new Int16Array(width * height);
  const borderPairs = new Map<string, number>();
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
    let best = 0, bestDistance = Infinity;
    for (let index = 0; index < provinces.length; index++) {
      const province = provinces[index];
      if (province === undefined) continue;
      const distance = (province.x - x) ** 2 + (province.y - y) ** 2;
      if (distance < bestDistance) { bestDistance = distance; best = index; }
    }
    owner[y * width + x] = best;
  }
  for (let y = 1; y < height; y++) for (let x = 1; x < width; x++) {
    const here = owner[y * width + x] ?? 0;
    for (const neighbour of [owner[y * width + x - 1] ?? 0, owner[(y - 1) * width + x] ?? 0]) {
      if (neighbour === here) continue;
      const key = here < neighbour ? `${here}:${neighbour}` : `${neighbour}:${here}`;
      borderPairs.set(key, (borderPairs.get(key) ?? 0) + 1);
    }
  }

  // --- adjacency: keep the longest shared borders, then guarantee the graph stays connected.
  const edges = [...borderPairs.entries()]
    .map(([key, length]) => { const [a, b] = key.split(":").map(Number); return { a: a ?? 0, b: b ?? 0, length }; })
    .filter((edge) => edge.length >= 6)
    .sort((left, right) => right.length - left.length);
  const kept: Array<{ a: number; b: number; spine: boolean }> = [];
  const parent = provinces.map((_, index) => index);
  const find = (index: number): number => { let root = index; while (parent[root] !== root) root = parent[root] ?? root; return root; };
  const union = (a: number, b: number): boolean => { const rootA = find(a), rootB = find(b); if (rootA === rootB) return false; parent[rootA] = rootB; return true; };
  // A spanning tree first, so nowhere is unreachable; then a limited number of shortcuts on top.
  for (const edge of edges) if (union(edge.a, edge.b)) kept.push({ a: edge.a, b: edge.b, spine: true });
  const spare = edges.filter((edge) => !kept.some((entry) => entry.a === edge.a && entry.b === edge.b));
  const shortcuts = Math.round(spare.length * (broken ? 0.12 : 0.3));
  for (let index = 0; index < shortcuts; index++) { const edge = spare[index]; if (edge !== undefined) kept.push({ a: edge.a, b: edge.b, spine: false }); }

  const capitalIndices = provinces.map((province, index) => ({ province, index })).filter((entry) => entry.province.kind === "capital").map((entry) => entry.index);
  const linksOf = (live: Array<{ a: number; b: number }>): Map<number, number[]> => {
    const links = new Map<number, number[]>();
    for (let index = 0; index < provinces.length; index++) links.set(index, []);
    for (const edge of live) { links.get(edge.a)?.push(edge.b); links.get(edge.b)?.push(edge.a); }
    return links;
  };
  /** Shortest province route between two points, used both for traffic and for connectivity checks. */
  const route = (links: Map<number, number[]>, from: number, to: number, banned = -1): number[] | null => {
    if (from === banned || to === banned) return null;
    const previous = new Map<number, number>([[from, -1]]);
    const queue = [from];
    while (queue.length > 0) {
      const current = queue.shift();
      if (current === undefined) break;
      if (current === to) { const path: number[] = []; let step: number | undefined = to; while (step !== undefined && step >= 0) { path.unshift(step); step = previous.get(step); } return path; }
      for (const next of links.get(current) ?? []) if (next !== banned && !previous.has(next)) { previous.set(next, current); queue.push(next); }
    }
    return null;
  };
  const connectedGraph = (live: Array<{ a: number; b: number }>): boolean => {
    const links = linksOf(live);
    const seen = new Set([0]); const queue = [0];
    while (queue.length > 0) { const current = queue.shift(); for (const next of links.get(current ?? 0) ?? []) if (!seen.has(next)) { seen.add(next); queue.push(next); } }
    return seen.size === provinces.length;
  };
  const isCut = (live: Array<{ a: number; b: number }>, node: number): boolean => {
    const links = linksOf(live);
    const others = provinces.map((_, index) => index).filter((index) => index !== node);
    const start = others[0];
    if (start === undefined) return false;
    const seen = new Set([start]); const queue = [start];
    while (queue.length > 0) { const current = queue.shift(); for (const next of links.get(current ?? 0) ?? []) if (next !== node && !seen.has(next)) { seen.add(next); queue.push(next); } }
    return seen.size < others.length;
  };

  // --- chokepoints: the provinces most capital-to-capital routes run through. Bypasses around them
  //     are pruned until marching past really is the only way, which is what makes them worth holding.
  const traffic = new Map<number, number>();
  const baseLinks = linksOf(kept);
  for (let left = 0; left < capitalIndices.length; left++) for (let right = left + 1; right < capitalIndices.length; right++) {
    const from = capitalIndices[left], to = capitalIndices[right];
    if (from === undefined || to === undefined) continue;
    for (const step of (route(baseLinks, from, to) ?? []).slice(1, -1)) traffic.set(step, (traffic.get(step) ?? 0) + 1);
  }
  const candidates = [...traffic.entries()]
    .filter(([node]) => !capitalIndices.includes(node))
    .sort((left, right) => right[1] - left[1] || (provinces[left[0]]?.neighbours.length ?? 0) - (provinces[right[0]]?.neighbours.length ?? 0))
    .map(([node]) => node)
    .slice(0, 3);
  let live = [...kept];
  for (const candidate of candidates) {
    // Walk the routes that currently dodge this province and cut their shortcuts, one at a time, until
    // marching through really is the only way. The spine is never touched, so nowhere becomes unreachable.
    for (let attempt = 0; attempt < 12 && !isCut(live, candidate); attempt++) {
      const links = linksOf(live);
      let removed = false;
      for (let left = 0; left < capitalIndices.length && !removed; left++) for (let right = left + 1; right < capitalIndices.length && !removed; right++) {
        const from = capitalIndices[left], to = capitalIndices[right];
        if (from === undefined || to === undefined) continue;
        const bypass = route(links, from, to, candidate);
        if (bypass === null) continue;
        for (let step = 0; step + 1 < bypass.length; step++) {
          const a = bypass[step], b = bypass[step + 1];
          const edge = live.find((entry) => !entry.spine && ((entry.a === a && entry.b === b) || (entry.a === b && entry.b === a)));
          if (edge === undefined) continue;
          const without = live.filter((entry) => entry !== edge);
          if (!connectedGraph(without)) continue;
          live = without; removed = true; break;
        }
      }
      if (!removed) break;
    }
  }
  for (const edge of live) {
    const a = provinces[edge.a], b = provinces[edge.b];
    if (a === undefined || b === undefined) continue;
    a.neighbours.push(b.id); b.neighbours.push(a.id);
  }
  const cutVertices = articulationPoints(provinces)
    .filter((index) => provinces[index]?.kind !== "capital")
    .sort((left, right) => (traffic.get(right) ?? 0) - (traffic.get(left) ?? 0) || (provinces[left]?.neighbours.length ?? 0) - (provinces[right]?.neighbours.length ?? 0));
  // A bigger world needs more than three passes worth holding.
  for (const index of cutVertices.slice(0, Math.max(3, Math.round(provinces.length / 8)))) { const province = provinces[index]; if (province !== undefined) province.kind = "chokepoint"; }
  // --- remaining kinds follow biome and distance from the middle, so territory means something different everywhere.
  const centre = { x: width / 2, y: height / 2 };
  for (const province of provinces) {
    if (province.kind === "capital" || province.kind === "chokepoint") continue;
    const reach = Math.hypot(province.x - centre.x, province.y - centre.y) / (width * 0.5);
    province.kind = province.biome === "mountain" ? (random() < 0.62 ? "mine" : "fort")
      : province.biome === "marsh" ? "wilds"
      : province.biome === "badlands" ? (random() < 0.5 ? "fort" : "wilds")
      : reach < 0.32 ? "shrine"
      : random() < 0.55 ? "farm" : "town";
  }
  // --- guarantee the kinds the game is built around. Left to biome alone, a quarter of maps had no
  //     mine, fort or town at all, which silently removed a whole branch of the recruitment tree.
  const scale = Math.max(1, Math.round(provinces.length / 12));
  const floors: Array<[ProvinceKind, number]> = [["mine", 2 * scale], ["fort", 2 * scale], ["town", 2 * scale], ["farm", scale], ["shrine", scale]];
  const countOf = (kind: ProvinceKind): number => provinces.filter((province) => province.kind === kind).length;
  for (const [kind, floor] of floors) {
    // Convert whichever province is the least useful, preferring one whose biome suits the kind.
    const suits = (province: Province): number =>
      kind === "mine" ? (province.biome === "mountain" ? 3 : province.biome === "badlands" ? 2 : 1)
      : kind === "fort" ? (province.biome === "badlands" || province.biome === "mountain" ? 3 : 1)
      : kind === "farm" ? (province.biome === "grassland" ? 3 : 1)
      : kind === "shrine" ? (province.biome === "forest" ? 3 : 1)
      : (province.biome === "grassland" || province.biome === "forest" ? 3 : 1);
    while (countOf(kind) < floor) {
      const donor = provinces
        .filter((province) => province.kind !== "capital" && province.kind !== "chokepoint" && province.kind !== kind)
        .filter((province) => countOf(province.kind) > 1)
        .sort((left, right) => (suits(right) - suits(left)) || (SPARE_RANK[right.kind] - SPARE_RANK[left.kind]))[0];
      if (donor === undefined) break;
      donor.kind = kind;
      if (kind === "mine") donor.biome = "mountain";
      if (kind === "farm") donor.biome = "grassland";
    }
  }

  // --- names last, so a mine is never called Ancient Forest.
  const used = new Set<string>();
  for (const province of provinces) {
    if (province.kind === "capital") continue;
    const pool = KIND_NAMES[province.kind].filter((name) => !used.has(name));
    const fallback = nameOrder.filter((name) => !used.has(name));
    const chosen = pool[Math.floor(random() * pool.length)] ?? fallback[Math.floor(random() * fallback.length)] ?? `March ${province.id}`;
    used.add(chosen);
    province.name = chosen;
  }
  for (const province of provinces) {
    const rules = KIND_RULES[province.kind];
    province.income = rules.income;
    province.unlocks = [...rules.unlocks];
    // Everything but open wilds is worth garrisoning and therefore worth attacking.
    if (province.kind !== "wilds") {
      const tier = province.kind === "capital" ? 3 : province.kind === "town" || province.kind === "fort" ? 2 : 1;
      province.settlement = {
        tier, slots: tier + 1, buildings: province.kind === "capital" ? ["keep", "barracks"] : [],
        walls: province.kind === "capital" ? 400 : province.kind === "fort" ? 300 : 120,
        maxWalls: province.kind === "capital" ? 400 : province.kind === "fort" ? 300 : 120,
        project: null,
      };
    }
  }
  const connected = new Set(live.map((edge) => `${Math.min(edge.a, edge.b)}:${Math.max(edge.a, edge.b)}`));

  // --- terrain: biome fill, then barriers along every border we did not keep.
  const tiles: string[] = new Array(width * height);
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
    const index = y * width + x;
    const province = provinces[owner[index] ?? 0];
    const coast = ((x - width / 2) / (width * 0.5)) ** 4 + ((y - height / 2) / (height * 0.48)) ** 4;
    if (coast > 1 || x < 2 || y < 2 || x >= width - 2 || y >= height - 2) { tiles[index] = "w"; continue; }
    const mix = BIOME_MIX[province?.biome ?? "grassland"];
    const roll = Math.min(0.999, Math.max(0, wobble(x, y, phase)));
    let tile = "g";
    for (const [candidate, ceiling] of mix) { if (roll < ceiling) { tile = candidate; break; } }
    if (coast > 0.87 && tile !== "w") tile = "s";
    tiles[index] = tile;
  }
  const barrier = (biomeA: Biome | undefined, biomeB: Biome | undefined): string =>
    biomeA === "marsh" || biomeB === "marsh" ? "w" : "m";
  for (let y = 1; y < height - 1; y++) for (let x = 1; x < width - 1; x++) {
    const here = owner[y * width + x] ?? 0;
    for (const [dx, dy] of [[1, 0], [0, 1]] as const) {
      const there = owner[(y + dy) * width + x + dx] ?? 0;
      if (there === here) continue;
      const key = `${Math.min(here, there)}:${Math.max(here, there)}`;
      if (connected.has(key)) continue;
      // Impassable border: thicken it so the wall reads clearly from the campaign camera.
      const wall = barrier(provinces[here]?.biome, provinces[there]?.biome);
      for (let spread = -1; spread <= 2; spread++) {
        const bx = x + dx * spread, by = y + dy * spread;
        if (bx < 2 || by < 2 || bx >= width - 2 || by >= height - 2) continue;
        if (tiles[by * width + bx] !== "w") tiles[by * width + bx] = wall;
      }
    }
  }
  // Province centres must stay walkable; a settlement inside a mountain cannot be reached.
  for (const province of provinces) for (let dy = -3; dy <= 3; dy++) for (let dx = -3; dx <= 3; dx++) {
    const x = province.x + dx, y = province.y + dy;
    if (x < 2 || y < 2 || x >= width - 2 || y >= height - 2) continue;
    tiles[y * width + x] = province.biome === "marsh" ? "s" : "g";
  }
  const ownership = Array.from(owner, (index) => String.fromCharCode(65 + (index % 60))).join("");
  return { terrain: { seed, tiles: tiles.join("") }, ownership, provinces };
}

/** Finds the provinces whose loss would split the map, using Hopcroft-Tarjan on the province graph. */
function articulationPoints(provinces: Province[]): number[] {
  const index = new Map(provinces.map((province, position) => [province.id, position]));
  const discovered = new Array<number>(provinces.length).fill(-1);
  const low = new Array<number>(provinces.length).fill(0);
  const cuts = new Set<number>();
  let counter = 0;
  const visit = (node: number, parent: number): void => {
    discovered[node] = low[node] = counter++;
    let children = 0;
    for (const neighbourId of provinces[node]?.neighbours ?? []) {
      const neighbour = index.get(neighbourId);
      if (neighbour === undefined || neighbour === parent) continue;
      if ((discovered[neighbour] ?? -1) >= 0) { low[node] = Math.min(low[node] ?? 0, discovered[neighbour] ?? 0); continue; }
      children++;
      visit(neighbour, node);
      low[node] = Math.min(low[node] ?? 0, low[neighbour] ?? 0);
      if (parent >= 0 && (low[neighbour] ?? 0) >= (discovered[node] ?? 0)) cuts.add(node);
    }
    if (parent < 0 && children > 1) cuts.add(node);
  };
  for (let node = 0; node < provinces.length; node++) if ((discovered[node] ?? -1) < 0) visit(node, -1);
  return [...cuts];
}
