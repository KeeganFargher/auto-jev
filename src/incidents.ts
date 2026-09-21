import { storageRoom } from "./economy.js";
import { affordable, staffedTiers, housingCapacity, spend } from "./industry.js";
import { populationLimit } from "./development.js";
import { randomStep } from "./map-generation.js";
import type { WorldState } from "./types.js";

/** Creates a persisted, eligible incident after a grace period and a variable quiet interval. */
export function incidentTick(world:WorldState):string|null{
  const incident=world.incident;
  if(incident!==null&&!incident.resolved){
    if(incident.choice===null||world.tick<incident.deadline)return null;
    if(incident.kind==="drought")incident.outcome="Rain returned. The dry spell is over.";
    if(incident.kind==="raiders"){
      if(incident.choice==="pay")incident.outcome="The raiders accepted payment and left.";
      else{
        const guards=world.colonists.filter(p=>p.health>0&&Math.hypot(p.x-world.camp.x,p.y-world.camp.y)<16&&(p.task?.action==="guard"||p.equipment.weapon>0));
        const strength=world.development.defenses*8+guards.length*5+staffedTiers(world,"watchtower")*8+staffedTiers(world,"barracks")*5;
        const losses=Math.max(0,45-strength);
        const stolen=Math.min(world.stockpile.metal,Math.ceil(losses/3));world.stockpile.metal-=stolen;
        for(const person of guards.slice(0,3))person.health=Math.max(1,person.health-losses*(incident.choice==="shelter"?.3:.6));
        incident.outcome=losses===0?"The garrison drove the raiders away.":`The raid cost ${stolen} metal; ${Math.min(3,guards.length)} defenders were injured.`;
      }
    }
    incident.resolved=true;
    return incident.outcome;
  }
  if(world.tick<world.nextIncidentAt)return null;
  world.randomState=randomStep(world.randomState);
  const kinds=["drought","travellers","caravan","breakdown","raiders"] as const;
  let kind=kinds[world.randomState%kinds.length];
  if(kind===undefined)throw new Error("Incident selection failed");
  if(kind==="breakdown"&&!world.structures.some(b=>b.tier>=2))kind="caravan";
  if(kind==="raiders"&&world.day<12)kind="travellers";
  if(kind==="breakdown"){const building=world.structures.find(b=>b.tier>=2);if(building!==undefined)building.condition=0;}
  const titles={drought:"A dry spell approaches",travellers:"Travellers seek a home",caravan:"A merchant caravan arrives",breakdown:"Machinery has broken down",raiders:"Raiders approach the settlement"};
  world.incident={id:`${world.id}-incident-${world.tick}`,kind,title:titles[kind],startedAt:world.tick,deadline:world.tick+(kind==="drought"?960:kind==="raiders"?360:240),choice:null,resolved:false,outcome:"",x:world.camp.x+7,y:world.camp.y-10};
  world.randomState=randomStep(world.randomState);world.nextIncidentAt=world.tick+1440+world.randomState%1440;
  return titles[kind];
}
/** Lists only event responses whose material and housing contracts can currently be honored. */
export function incidentChoices(world:WorldState){
  const choices:Record<string,string>={};
  const incident=world.incident;
  if(incident===null||incident.resolved||incident.choice!==null)return choices;
  switch(incident.kind){
    case "drought":
      choices.ration="Ration water: lower thirst growth; crops grow at half speed";
      if(affordable(world,{water:40}))choices.irrigate="Spend 40 water to protect crops; thirst rises faster";
      break;
    case "travellers":
      choices.decline="Turn the travellers away";
      if(affordable(world,{food:16,water:16})&&world.colonists.filter(p=>p.health>0).length<Math.min(housingCapacity(world),populationLimit(world)))choices.welcome="Spend 16 food and water; welcome a new named resident";
      break;
    case "caravan":
      choices.decline="Decline the trade";
      if(affordable(world,{wood:40})&&storageRoom(world,"metal")>=10)choices.trade="Exchange 40 wood for 10 metal";
      if(affordable(world,{food:24})&&storageRoom(world,"coal")>=20)choices.fuel="Exchange 24 food for 20 coal";
      break;
    case "breakdown":
      choices.defer="Leave the machine stopped; arrange a repair later";
      if(affordable(world,{metal:4}))choices.repair="Spend 4 metal to restore the broken machine";
      break;
    case "raiders":
      choices.defend="Stand and defend; weapons, fortifications and military buildings reduce losses";
      choices.shelter="Shelter the settlement; reduce defender injuries if the raid breaks through";
      if(affordable(world,{food:30}))choices.pay="Pay 30 food to avoid the attack";
      break;
  }
  return choices;
}

/** Applies an explicitly chosen response once; returns whether a new resident must arrive. */
export function respondToIncident(world:WorldState,choice:string):boolean{
  const incident=world.incident;
  if(incident===null||!(choice in incidentChoices(world)))throw new Error("Invalid incident response");
  incident.choice=choice;
  if(choice==="irrigate")spend(world,{water:40});
  if(choice==="welcome"){spend(world,{food:16,water:16});incident.outcome="A traveller joined the colony.";}
  if(choice==="trade"){spend(world,{wood:40});world.stockpile.metal+=10;incident.outcome="The caravan exchanged 40 wood for 10 metal.";}
  if(choice==="fuel"){spend(world,{food:24});world.stockpile.coal+=20;incident.outcome="The caravan exchanged 24 food for 20 coal.";}
  if(choice==="repair"){spend(world,{metal:4});const machine=world.structures.find(b=>b.condition<=0);if(machine!==undefined)machine.condition=100;incident.outcome="The machine was repaired and can resume work.";}
  if(choice==="pay")spend(world,{food:30});
  if(choice==="decline")incident.outcome="Jev declined the offer.";
  if(choice==="defer")incident.outcome="Jev left the machine stopped for now.";
  if(!["drought","raiders"].includes(incident.kind))incident.resolved=true;
  return choice==="welcome";
}
