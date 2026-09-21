import { TECHNOLOGIES, type Stock, type StockKey, type TechId } from "./catalog.js";
import { BUILDINGS, buildingCost, buildingDefinition, type BuildingKind } from "./industry-catalog.js";
import { buildingTiers, housingCapacity } from "./industry.js";
import { populationLimit, recipeCosts } from "./development.js";
import type { ActionKind, Building, WorldState } from "./types.js";

export interface PlanStep { action: ActionKind | null; building: BuildingKind | null; existing: Building | undefined; cost: Partial<Stock>; label: string; done: boolean }
const step=(label:string,action:ActionKind|null,cost:Partial<Stock>={}):PlanStep=>({label,action,cost,building:null,existing:undefined,done:false});
const known=(world:WorldState,id:TechId)=>world.development.technologies.includes(id);
/** Resolves the first missing prerequisite, keeping the chosen destination visible to Jev. */
export function researchStep(world:WorldState,id:TechId):PlanStep {
  if(known(world,id))return {...step("Research complete",null),done:true};
  if(!world.development.workshop)return step("Build a workshop","build_workshop",{wood:24,stone:12});
  const tech=TECHNOLOGIES.find(t=>t.id===id);
  if(tech===undefined)throw new Error(`Unknown technology ${id}`);
  const missing=tech.requires.find(required=>!known(world,required));
  if(missing!==undefined)return researchStep(world,missing);
  if(world.development.research!==null){
    const active=TECHNOLOGIES.find(t=>t.id===world.development.research?.id);
    if(active===undefined)throw new Error("Unknown active research");
    return step(`Research ${active.name}`,"work_research",world.development.research.funded?{}:active.cost);
  }
  return step(`Plan ${tech.name}`,`research_${id}`,{});
}
const dependencies:Partial<Record<BuildingKind,BuildingKind>>={mill:"farm",bakery:"mill",smokehouse:"fishery",machine_shop:"foundry"};
/** Resolves an industry goal into its missing technology, supplier, or construction step. */
export function constructionStep(world:WorldState,kind:BuildingKind,upgrade=false,depth=0,additional=false,preferred:Building|undefined=undefined):PlanStep {
  if(depth>12)throw new Error("Cyclic industrial dependency");
  const definition=buildingDefinition(kind);
  if(definition.technology!==null&&!known(world,definition.technology))return researchStep(world,definition.technology);
  if(kind==="machine_shop"&&buildingTiers(world,"foundry")===1)return constructionStep(world,"foundry",true,depth+1);
  const dependency=dependencies[kind];
  if(dependency!==undefined&&buildingTiers(world,dependency)===0)return constructionStep(world,dependency,false,depth+1);
  const existing=preferred ?? world.structures.find(b=>b.kind===kind&&(!additional||b.tier!==b.targetTier));
  if(existing!==undefined&&existing.targetTier!==existing.tier)return {...step(`Construct ${definition.name}`,"construct_building"),building:kind,existing};
  if(existing!==undefined&&!upgrade)return {...step(`${definition.name} ready`,null),done:true};
  const tier=existing===undefined?1:existing.tier+1;
  if(tier>3)return {...step("Fully upgraded",null),done:true};
  if(tier>=2&&!known(world,"township"))return researchStep(world,"township");
  if(tier===3&&!known(world,"citadel"))return researchStep(world,"citadel");
  const cost=buildingCost(kind,tier);
  for(const [key,amount]of recipeCosts(cost)){
    if(world.stockpile[key]>=amount)continue;
    const producer=key==="bricks"?"brick_kiln":key==="steel"?"foundry":key==="parts"?"machine_shop":null;
    if(producer!==null){
      if(buildingTiers(world,producer)===0)return constructionStep(world,producer,false,depth+1);
      if(key==="steel"&&buildingTiers(world,"foundry")<2)return constructionStep(world,"foundry",true,depth+1);
    }
  }
  return {...step(`${existing===undefined?"Build":"Upgrade"} ${definition.name}`,"construct_building",cost),building:kind,existing};
}
/** Offers consequential goals with downstream benefits instead of mixing them into survival questions. */
export function strategyChoices(world:WorldState){
  const choices:Record<string,string>={};
  for(const tech of TECHNOLOGIES){
    if(known(world,tech.id))continue;
    if(tech.requires.some(id=>!known(world,id))&&!['township','citadel'].includes(tech.id))continue;
    choices[`research:${tech.id}`]=`${tech.name}: ${tech.effect}. Prerequisites: ${tech.requires.join(", ") || "workshop"}. Commit two workers and gather required materials.`;
  }
  for(const definition of BUILDINGS){
    if(definition.technology!==null&&!known(world,definition.technology))continue;
    const building=world.structures.find(b=>b.kind===definition.id);
    if(definition.id==="home"&&housingCapacity(world)<Math.min(populationLimit(world),world.colonists.filter(p=>p.health>0).length+8)){
      const count=world.structures.filter(b=>b.kind==="home").length;
      choices[`build:home:${count+1}`]=`Residential hall: house four more residents; costs ${JSON.stringify(definition.cost)}`;
    }
    if(building===undefined)choices[`build:${definition.id}`]=`${definition.name}: ${definition.effect}. Cost ${JSON.stringify(definition.cost)}; one operator unless housing/storage.`;
    else if(building.status==="Local resource exhausted")choices[`relocate:${building.id}`]=`Relocate ${definition.name} to a fresh deposit. Rebuild at tier I for ${JSON.stringify(definition.cost)}.`;
    else if(building.condition<=0)choices[`repair:${building.id}`]=`Repair ${definition.name}; 4 metal or 2 parts to resume production.`;
    else if(building.tier<3&&known(world,building.tier===1?"township":"citadel"))choices[`upgrade:${building.id}:${building.tier+1}`]=`Upgrade ${definition.name} to tier ${building.tier+1}; more capacity/output, higher-tier materials and maintenance. ${JSON.stringify(buildingCost(building.kind,building.tier+1))}`;
  }
  const living=world.colonists.filter(p=>p.health>0).length;
  if(living<populationLimit(world)&&world.tick>=world.development.nextRecruitAt)choices.grow=`Recruit another resident (${living}/${populationLimit(world)}); build housing if needed. Ongoing food and water demand rises.`;
  if(known(world,"large_fields")&&world.farms.some(f=>f.radius===1))choices.expand="Expand a field to 5×5; doubles its base harvest";
  if(world.intel!==null)for(const key of ["metal","coal","tools","food"] as const)choices[`raid:${key}`]=`Send up to two armed raiders to steal ${key}. Last observed rival defense ${world.intel.defense}; risk injury and retaliation. Base carrying capacity is 20 units before skills and defenses; this goal does not promise success.`;
  return choices;
}
/** Computes the next executable step of the committed objective. */
export function strategyStep(world:WorldState):PlanStep{
  const [type,id,tier]=world.strategy.goal.split(":");
  if(type==="research"){const tech=TECHNOLOGIES.find(t=>t.id===id);if(tech===undefined)throw new Error("Invalid research goal");return researchStep(world,tech.id);}
  if(type==="build"){
    const definition=BUILDINGS.find(b=>b.id===id);if(definition===undefined)throw new Error("Invalid construction goal");
    if(definition.id==="home"&&tier!==undefined){
      if(world.structures.filter(b=>b.kind==="home"&&b.tier>0).length>=Number(tier))return {...step("Housing completed",null),done:true};
      return constructionStep(world,"home",false,0,true);
    }
    return constructionStep(world,definition.id);
  }
  if(type==="upgrade"){
    const building=world.structures.find(b=>b.id===id);
    if(building===undefined)throw new Error("Upgrade target missing");
    return building.tier>=Number(tier)?{...step("Upgrade complete",null),done:true}:constructionStep(world,building.kind,true,0,false,building);
  }
  if(type==="relocate"){
    const building=world.structures.find(b=>b.id===id);
    if(building===undefined)throw new Error("Relocation target missing");
    if(building.tier!==building.targetTier)return {...step("Rebuilding workplace","construct_building"),building:building.kind,existing:building};
    if(building.status!=="Local resource exhausted")return {...step("Relocation complete",null),done:true};
    return {...step("Relocate workplace","construct_building",buildingDefinition(building.kind).cost),building:building.kind,existing:building};
  }
  if(type==="repair")return step("Repair machinery",null,world.stockpile.parts>=2?{parts:2}:{metal:4});
  if(type==="grow"){
    const living=world.colonists.filter(p=>p.health>0).length;
    if(living>=housingCapacity(world))return constructionStep(world,"home",false,0,true);
    return step("Recruit a resident","recruit",{food:16,water:16,planks:8});
  }
  if(type==="expand")return step("Expand a field","expand_farm",{planks:20,stone:16,wood:20});
  if(type==="raid")return step(`Raid for ${id}`,"raid");
  return step("Awaiting strategic decision",null);
}
/** Maps a material shortage to an existing, real production job. */
export function materialAction(world:WorldState,key:StockKey):ActionKind|null{
  const direct:Partial<Record<StockKey,ActionKind>>={wood:"chop_tree",stone:"mine_stone",clay:"mine_clay",ore:"mine_ore",coal:"mine_coal",food:"gather_berries",water:"fetch_water"};
  if(direct[key]!==undefined)return direct[key];
  if(key==="planks")return world.stockpile.wood<4?"chop_tree":"craft_planks";
  if(key==="metal")return world.stockpile.ore<3?"mine_ore":world.stockpile.coal<1?"mine_coal":world.stockpile.wood<2?"chop_tree":"smelt_metal";
  return null;
}
