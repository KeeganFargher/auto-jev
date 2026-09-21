import type { Position, ResourceNode } from "./types.js";

/** Advances a persisted PRNG; the same seed produces the same terrain and incidents. */
export function randomStep(state: number): number { return (Math.imul(state, 1664525) + 1013904223) >>> 0; }

/** Generates an island with reachable crossings, clustered resources and protected starting clearings. */
export function generateMap(seed: number, width: number, height: number, camps: Position[]) {
  let randomState = seed;
  const random = (): number => { randomState = randomStep(randomState); return randomState / 4294967296; };
  const tiles: string[] = [];
  const resources: ResourceNode[] = [];
  const phase = random() * 6;
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
    const coast = ((x - width / 2) / (width * .51)) ** 4 + ((y - height / 2) / (height * .49)) ** 4;
    const river = Math.round(width / 2 + Math.sin(y / 15 + phase) * 7);
    const crossing = [32, 64, 96].some((row) => Math.abs(y - row) <= 1);
    const campDistance = Math.min(...camps.map((camp) => Math.hypot(camp.x - x, camp.y - y)));
    const forest = Math.sin(x / 12 + phase) + Math.cos(y / 10) > .4;
    const ridge = y < 30 && x > 65 && x < width - 65 && Math.sin(x / 8) + Math.cos(y / 7) > .3;
    let tile = coast > 1 || y < 3 || y >= height - 3 || x < 3 || x >= width - 3 ? "w" : ridge ? "m" : forest ? "f" : "g";
    if (coast > .86 && tile !== "w") tile = "s";
    if (Math.abs(x - river) <= 2) tile = crossing ? "r" : "w";
    if (campDistance < 16) tile = "g";
    // Local streams keep early survival viable without making frontier minerals local.
    if (camps.some((camp) => Math.abs(x - (camp.x + (camp.x < width / 2 ? 13 : -13))) <= 1 && Math.abs(y - camp.y) < 5)) tile = "w";
    tiles.push(tile);
    if (tile === "w") {
      if (Math.abs(x - river) === 2 && y % 4 === 0 || camps.some((camp) => Math.abs(x - (camp.x + (camp.x < width / 2 ? 13 : -13))) === 1 && y === camp.y)) resources.push({id:`river-${x}-${y}`,kind:"river",x,y,amount:1000000,regrowAt:null});
      continue;
    }
    if (tile === "m" || tile === "r" || campDistance < 9) continue;
    const roll = random();
    let kind: ResourceNode["kind"] | null = null;
    if (roll < (tile === "f" ? .12 : .018)) kind = "tree";
    else if (roll < .145 && campDistance < 34) kind = "berries";
    else if (roll > .985) kind = "stone";
    else if (roll > .97 && Math.abs(x - river) < 32) kind = y < height / 2 ? "ore" : "coal";
    else if (roll > .96 && Math.abs(x - river) < 45) kind = "clay";
    if (kind !== null) resources.push({id:`${kind}-${x}-${y}`,kind,x,y,amount:kind === "berries" ? 12 : kind === "tree" ? 24 : 120,regrowAt:null});
  }
  // Equal starting caches prevent a seed from deciding the winner before Jev can act.
  for (const camp of camps) for (const [kind, dx, dy] of [["stone",-10,-3],["stone",-11,3],["tree",-10,6],["tree",-11,7],["berries",-9,-5],["clay",10,9]] as const) {
    const x = camp.x + dx, y = camp.y + dy;
    const old = resources.findIndex((node) => node.x === x && node.y === y);
    if (old >= 0) resources.splice(old,1);
    tiles[y * width + x] = "g";
    resources.push({id:`${kind}-${x}-${y}`,kind,x,y,amount:kind === "berries" ? 24 : 120,regrowAt:null});
  }
  return { terrain: {seed, tiles:tiles.join(""), regions:[{x:32,y:64,name:"Amber Vale",kind:"settlement"},{x:width-33,y:64,name:"Saltwind Vale",kind:"settlement"},{x:width/2-15,y:24,name:"Iron Highlands",kind:"ore"},{x:width/2+15,y:100,name:"Blackstone Basin",kind:"coal"},{x:width/2,y:64,name:"Three Crossings",kind:"frontier"}]}, resources };
}
