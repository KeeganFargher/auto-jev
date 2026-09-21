import { STOCK_KEYS, type Stock } from "./catalog.js";
import { buildingCost, buildingDefinition, type BuildingKind } from "./industry-catalog.js";
import { recipeCosts, rewardWork } from "./development.js";
import { findRoute } from "./navigation.js";
import { storageRoom } from "./economy.js";
import type { Building, Colonist, Position, Task, WorldState } from "./types.js";

export const PASSIVE_BUILDINGS = new Set<BuildingKind>(["home", "granary", "warehouse"]);
/** Counts physical housing rather than inferring residents from a population cap. */
export function housingCapacity(world: Pick<WorldState,"structures"|"buildings">): number { return world.buildings.huts * 4 + world.structures.filter(b=>b.kind === "home").reduce((sum,b)=>sum+b.tier*4,0); }
/** Finds active capacity for production and services. */
export function buildingTiers(world: Pick<WorldState,"structures">, kind: BuildingKind): number { return world.structures.filter(b=>b.kind===kind).reduce((sum,b)=>sum+b.tier,0); }
/** Counts military buildings only while their operator is physically at work. */
export function staffedTiers(world:WorldState,kind:BuildingKind):number{return world.structures.filter(b=>b.kind===kind&&b.tier===b.targetTier&&b.condition>0&&world.colonists.some(p=>p.health>0&&p.task?.action==="work_building"&&p.task.targetId===b.id&&p.task.route.length===0)).reduce((sum,b)=>sum+b.tier,0);}
/** Reserves material once; callers supply a cost that has already been validated. */
export function spend(world: WorldState, cost: Partial<Stock>): void { for (const [key, amount] of recipeCosts(cost)) world.stockpile[key] -= amount; }
/** Checks available inventory, preserving supplies already promised to meals and drinks. */
export function affordable(world: WorldState, cost: Partial<Stock>): boolean {
  return recipeCosts(cost).every(([key,amount])=>world.stockpile[key] - world.colonists.filter(p=>p.health>0 && p.task?.action === (key === "food" ? "eat" : key === "water" ? "drink" : "never")).length*4 >= amount);
}
/** Produces the current tier's recipe; automation has an explicit recurring fuel cost. */
export function buildingRecipe(building: Building) {
  const definition = buildingDefinition(building.kind);
  const output: Partial<Stock> = {};
  for (const [key,amount] of recipeCosts(definition.output)) output[key]=Math.ceil(amount*(1+(building.tier-1)*.6));
  if (building.kind === "foundry" && building.tier >= 2) output.steel=2*(building.tier-1);
  const input = {...definition.input};
  if (building.tier >= 2 && ["sawmill","pump_house"].includes(building.kind)) input.coal=1;
  if (building.tier === 3 && building.cycles % 8 === 7) input.parts=1;
  return {input,output};
}
const nearbySource = (world: WorldState, building: Building) => {
  const source=buildingDefinition(building.kind).source;
  return world.resources.find(node=>node.kind===source && (node.amount>0 || building.kind==="forester") && Math.abs(node.x-building.x)+Math.abs(node.y-building.y)<=14);
};
/** Returns one authoritative stop reason for workers, the HUD and Jev. */
export function buildingStatus(world: WorldState, building: Building): string {
  if (building.tier !== building.targetTier) return "Under construction";
  if (building.condition <= 0) return "Needs repair";
  if (PASSIVE_BUILDINGS.has(building.kind)) return "Ready";
  if(building.kind==="forester"&&!world.resources.some(n=>n.kind==="tree"&&n.amount===0&&n.regrowAt!==null&&Math.hypot(n.x-building.x,n.y-building.y)<14))return "Forest healthy";
  const definition = buildingDefinition(building.kind);
  if (definition.source !== null && nearbySource(world,building) === undefined) return "Local resource exhausted";
  const {input,output}=buildingRecipe(building);
  if (recipeCosts(input).some(([key,n])=>!["food","water"].includes(key)&&world.stockpile[key]-(world.strategy.budget[key] ?? 0)<n))return "Materials reserved for settlement plan";
  if (!affordable(world,input)) return `Needs ${recipeCosts(input).filter(([key,n])=>world.stockpile[key]<n).map(([key])=>key).join(", ") || "unreserved supplies"}`;
  if (recipeCosts(output).some(([key,n])=>storageRoom(world,key)<n)) return "Storage full";
  if (building.tier>=2 && ["sawmill","pump_house"].includes(building.kind)) return "Automated";
  return building.staff.length===0 ? "Needs staff" : "Operating";
}
/** Chooses a reachable clear footprint, near deposits for extraction and distant land for outposts. */
export function buildingSite(world: WorldState, kind: BuildingKind): Position | null {
  const definition = buildingDefinition(kind);
  const sources = definition.source === null ? [kind === "outpost" ? {x:Math.round((world.camp.x+world.width/2)/2),y:world.camp.y} : world.camp] : world.resources.filter(n=>n.kind===definition.source && n.amount>0).toSorted((a,b)=>Math.hypot(a.x-world.camp.x,a.y-world.camp.y)-Math.hypot(b.x-world.camp.x,b.y-world.camp.y)).slice(0,12);
  for (const source of sources) for (let radius=4;radius<=(definition.source===null?52:14);radius+=3) for (const [dx,dy] of Array.from({length:16},(_,index)=>[Math.round(Math.cos(index*Math.PI/8)*radius),Math.round(Math.sin(index*Math.PI/8)*radius)])) {
    if (dx === undefined || dy === undefined) throw new Error("Invalid building offset");
    const position={x:source.x+dx,y:source.y+dy};
    if (definition.source!==null && Math.abs(dx)+Math.abs(dy)>14) continue;
    if (position.x<4||position.y<4||position.x>=world.width-4||position.y>=world.height-4) continue;
    if (Math.abs(position.x-world.camp.x)<9 && Math.abs(position.y-world.camp.y)<9) continue;
    const occupied=[...Object.values(world.stations),...world.obstacles,...world.structures,...world.farms,...(world.project===null?[]:[world.project])];
    if (occupied.some(p=>Math.abs(p.x-position.x)<=3&&Math.abs(p.y-position.y)<=3)) continue;
    if(world.resources.some(p=>!["tree","berries"].includes(p.kind)&&Math.abs(p.x-position.x)<=1&&Math.abs(p.y-position.y)<=1))continue;
    if(world.colonists.some(p=>Math.abs(p.x-position.x)<=1&&Math.abs(p.y-position.y)<=1))continue;
    if ([-2,-1,0,1,2].some(x=>[-2,-1,0,1,2].some(y=>"wmr".includes(world.terrain.tiles.charAt((position.y+y)*world.width+position.x+x))))) continue;
    if (findRoute(world,world.camp,position,true,2)===null) continue;
    return position;
  }
  return null;
}
/** Clears renewable vegetation permanently beneath a funded building footprint. */
export function clearBuildingSite(world: WorldState, building: Building): void {
  for(const node of world.resources)if(["tree","berries"].includes(node.kind)&&Math.abs(node.x-building.x)<=1&&Math.abs(node.y-building.y)<=1){node.amount=0;node.regrowAt=null;}
}
/** Funds one durable construction project whose work survives need breaks and reloads. */
export function startBuilding(world: WorldState, kind: BuildingKind, existing: Building | undefined): Building | null {
  const tier=existing===undefined?1:existing.tier+1;
  const cost=buildingCost(kind,tier);
  if (!affordable(world,cost)) return null;
  const position=existing===undefined?buildingSite(world,kind):existing;
  if (position===null) return null;
  spend(world,cost);
  if (existing!==undefined) {existing.targetTier=tier;existing.totalWork=160*tier;existing.workDone=0;return existing;}
  const building:Building={...position,id:`${world.id}-${kind}-${world.structures.length}`,kind,tier:0,targetTier:1,workDone:0,totalWork:160,staff:[],residents:[],condition:100,cycles:0,status:"Under construction"};
  clearBuildingSite(world,building);
  world.structures.push(building);
  return building;
}
/** Runs one funded production cycle, consuming finite local deposits and applying service effects. */
export function produce(world: WorldState, rival: WorldState, building: Building): void {
  const {output}=buildingRecipe(building);
  const source=nearbySource(world,building);
  if(buildingDefinition(building.kind).source!==null&&source===undefined)return;
  if (source!==undefined && !["river","forester"].includes(source.kind) && building.kind!=="forester") {
    const extracted=Math.min(source.amount,Math.max(...Object.values(output)));
    source.amount-=extracted;
    if (source.amount===0 && source.kind==="tree") source.regrowAt=world.tick+2400;
    for (const key of STOCK_KEYS) if (output[key]!==undefined) output[key]=Math.min(output[key],extracted);
  }
  for (const [key,n] of recipeCosts(output)) world.stockpile[key]+=Math.min(n,storageRoom(world,key));
  const living=world.colonists.filter(p=>p.health>0);
  if (building.kind==="forester") for (const node of world.resources.filter(n=>n.kind==="tree"&&n.amount===0&&n.regrowAt!==null&&Math.hypot(n.x-building.x,n.y-building.y)<14).slice(0,building.tier)) {node.amount=24;node.regrowAt=null;}
  if (building.kind==="clinic") for (const person of living.toSorted((a,b)=>a.health-b.health).slice(0,3)) person.health=Math.min(100,person.health+10*building.tier);
  if (building.kind==="school") for (const person of living.filter(p=>!building.staff.includes(p.id)).toSorted((a,b)=>a.level-b.level).slice(0,2)) rewardWork(world,person,"work_research");
  if (building.kind==="barracks") for (const person of living.filter(p=>p.equipment.weapon>0).slice(0,building.tier)) rewardWork(world,person,"raid");
  if (building.kind==="scout_lodge") world.intel={observedAt:world.tick,food:rival.stockpile.food,defense:rival.development.defenses,population:rival.colonists.filter(p=>p.health>0).length};
  if (building.kind==="outpost") for (const person of living.filter(p=>Math.hypot(p.x-building.x,p.y-building.y)<8)) {
    if (person.hunger>40&&world.stockpile.food>=4){world.stockpile.food-=4;person.hunger=Math.max(0,person.hunger-60);}
    if (person.thirst>40&&world.stockpile.water>=4){world.stockpile.water-=4;person.thirst=Math.max(0,person.thirst-60);}
  }
  if (building.kind==="irrigation_station") for (const farm of world.farms.filter(f=>Math.hypot(f.x-building.x,f.y-building.y)<=16)) {
    if (farm.stage==="fallow") {farm.stage="growing";farm.growth=0;}
    else if(farm.stage==="ripe"&&storageRoom(world,"food")>=18){world.stockpile.food+=Math.min(storageRoom(world,"food"),18*building.tier);farm.stage="fallow";farm.growth=0;}
    else if(farm.stage==="growing") farm.growth=Math.min(359,farm.growth+20*building.tier);
  }
  building.cycles++;building.condition=Math.max(0,building.condition-(building.tier>=2?.15:0));
}
/** Starts a staffed cycle only after arrival can be routed and its inputs are reserved. */
export function buildingTask(world:WorldState, person:Colonist, building:Building):Task|null {
  if (buildingStatus(world,building)!=="Operating") return null;
  const route=findRoute(world,person,building,true,2);
  if(route===null)return null;
  const {input}=buildingRecipe(building);
  spend(world,input);
  return {action:"work_building",targetId:building.id,route,totalWork:80,workRemaining:80,reserved:input};
}
/** Refreshes workers and operates genuinely automated tiers at a bounded cadence. */
export function industryTick(world:WorldState,rival:WorldState):void {
  let housed=world.buildings.huts*4;
  const living=world.colonists.filter(p=>p.health>0);
  for(const building of world.structures){
    if(building.kind==="home"){building.residents=living.slice(housed,housed+building.tier*4).map(p=>p.id);housed+=building.tier*4;}
    building.staff=building.staff.filter(id=>world.colonists.some(p=>p.id===id&&p.health>0));
    building.status=buildingStatus(world,building);
    if(world.tick%100===0&&building.status==="Automated"){spend(world,buildingRecipe(building).input);produce(world,rival,building);}
  }
}
