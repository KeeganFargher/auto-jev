import { buildingDefinition } from "./industry-catalog.js";
import { affordable, buildingRecipe, buildingTask, housingCapacity, industryTick, PASSIVE_BUILDINGS, produce, spend, startBuilding, buildingSite, buildingTiers, staffedTiers, clearBuildingSite } from "./industry.js";
import { strategyChoices, strategyStep, materialAction } from "./strategy.js";
import { incidentTick, incidentChoices, respondToIncident } from "./incidents.js";
import { TECHNOLOGIES, isActionKind } from "./catalog.js";
import { jobOutput, runEconomy, startingStock, storageRoom } from "./economy.js";
import { ORDER_JOB_LIMIT, applyMilestone, emptyTalents, populationLimit, remember, researchChoices, developmentJob, milestoneChoices, REPEAT_JOBS, recipeCosts, rewardWork } from "./development.js";
import { EventEmitter } from "node:events";
import { CROP_GROWTH_TICKS, FARM_STONE, FARM_WOOD, FARM_WORK, farmTiles, finishFarm, growFood, nextFarmSite, settlementSummary } from "./progression.js";
import { findOpenPosition, findRoute, isWalkable } from "./navigation.js";
import type { ColonistDecisionRequest, ColonistDecisionState, DecisionEngine } from "./jev.js";
import type {
  ActionKind,
  ColonyPriority,
  Colonist,
  DecisionAnswer,
  Farm,
  Position,
  ResourceKind,
  ResourceNode,
  Task,
  WorldEvent,
  WorldEventData,
  WorldState,
} from "./types.js";

const NAMES = ["Ada", "Bo", "Cleo", "Dev", "Eli", "Fia", "Gus", "Hope"];
const TRAITS: Colonist["trait"][] = [
  "hard_worker",
  "risk_averse",
  "resourceful",
  "communal",
];
const PRIORITY_CHOICES: Record<ColonyPriority, string> = {
  food: "Increase food reserves before hunger becomes dangerous",
  water: "Increase water reserves before thirst becomes dangerous",
  shelter: "Build enough huts to house the population",
  materials: "Gather wood and stone for future construction",
  recovery: "Let tired or injured colonists recover",
  research: "Invest materials and worker time in new technologies and production",
  expansion: "Develop housing, fields and recruitment for a larger population",
  security: "Equip fighters, defend the settlement and assess rival opportunities",
};
const DECISION_BATCH_SIZE = 8;
const DECISION_BATCH_WAIT_MS = 1_000;


const clamp = (value: number, minimum = 0, maximum = 100): number =>
  Math.min(maximum, Math.max(minimum, value));

const randomInt = (minimum: number, maximum: number): number =>
  Math.floor(Math.random() * (maximum - minimum + 1)) + minimum;

const isColonyPriority = (value: string): value is ColonyPriority => value in PRIORITY_CHOICES;

const distance = (from: Position, to: Position): number =>
  Math.abs(from.x - to.x) + Math.abs(from.y - to.y);

/** Creates a new authoritative colony world. */
export const createWorld = (): WorldState => ({
  terrain: {seed:1,tiles:"g".repeat(48*36),regions:[]}, structures: [], strategy: {goal:"",title:"Choosing a settlement plan",startedAt:0,reviewedAt:-480,progressAt:0,workers:[],completed:0,status:"Awaiting Jev",budget:{}}, incident:null,nextIncidentAt:1440,randomState:1,
  id: "ember", name: "Ember", color: "#dc9869", obstacles: [], intel: null,
  raids: { stolen: 0, lost: 0 },
  development: { completedWork: 0, technologies: [], research: null, nextRecruitAt: 0, monuments: 0, history: [], branch: null, workshop: false, defenses: 0, homes: 0 },
  stations: { food: { x: 21, y: 18 }, water: { x: 25, y: 18 }, workshop: { x: 23, y: 15 }, defense: { x: 23, y: 13 } },
  resourceHistory: [{ tick: 0, ...startingStock() }],
  width: 48,
  height: 36,
  camp: { x: 23, y: 18 },
  farms: [],
  project: null,
  progression: { stage: "camp", harvests: 0 },
  tick: 0,
  day: 1,
  startedAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
  priority: "water",
  jev: { status: "running", lastError: null },
  stockpile: startingStock(),
  buildings: { huts: 2, campfires: 1 },
  colonists: NAMES.map((name, index) => {
    const trait = TRAITS[index % TRAITS.length];
    if (trait === undefined) throw new Error("A starting colonist must have a trait");
    return ({
    id: `colonist-${index + 1}`,
    name,
    x: 22 + (index % 4),
    y: 17 + Math.floor(index / 4),
    health: 100,
    hunger: randomInt(12, 35),
    thirst: randomInt(12, 35),
    fatigue: randomInt(8, 30),
    trait,
    experience: 0, level: 1, talents: emptyTalents(), skillPoints: 0, equipment: { tool: 0, weapon: 0 }, movementCredit: 0, retreatReadyAt: 0, biography: [{ tick: 0, text: "Founded the colony" }], order: null,
    skills: {
      building: Number((0.4 + Math.random() * 0.6).toFixed(2)),
      gathering: Number((0.4 + Math.random() * 0.6).toFixed(2)),
    },
    task: null,
    lastDecision: null,
  }); }),
  resources: [],
  stats: {
    decisions: 0,
    jevDecisions: 0,
    jevRequests: 0,
    deaths: 0,
    inputTokens: 0,
    outputTokens: 0,
  },
});

/** Runs the headless simulation and publishes state changes to viewers. */
export class ColonySimulation extends EventEmitter {
  private readonly pendingDecisions = new Set<string>();
  private readonly decisionRetryAt = new Map<string, number>();
  private readonly decisionQueue: ColonistDecisionRequest[] = [];
  private decisionBatchTimer: NodeJS.Timeout | undefined;
  private decisionBatchInFlight = false;
  private priorityDecisionPending = false;
  private prioritySignature = "";
  private lastPriorityTick = -120;
  private jevRetryAt = 0;
  private nextDecisionErrorLogAt = 0;
  private orderSignature = "";
  private readonly decisionReasons = new Map<string, string>();
  private readonly reasonCounts: Record<string, number> = {};
  public readonly decisionUsage = {
    startedAt: new Date().toISOString(), startTick: 0, requests: 0, priorityRequests: 0,
    inputTokens: 0, questions: 0, applied: 0, discarded: 0, failedRequests: 0,
    autonomousJobs: 0, needBreaks: 0, reasons: this.reasonCounts,
  };
  private councilPending = false;
  private executingPlan = false;

  private finishStrategy(message: string): void {
    remember(this.state.development.history,this.state.tick,message);
    this.publish("strategy.completed",message);
    this.state.strategy={...this.state.strategy,goal:"",title:"Choosing next investment",status:message,budget:{},workers:[],completed:this.state.strategy.completed+1,reviewedAt:this.state.tick-480};
  }

  private async council(): Promise<void> {
    if(this.councilPending||this.stopped)return;
    const incident=this.state.incident;
    const responding=incident!==null&&!incident.resolved&&incident.choice===null;
    const choices=responding?incidentChoices(this.state):strategyChoices(this.state);
    if(Object.keys(choices).length===0)return;
    this.councilPending=true;
    try{
      const result=await this.decisionEngine.chooseCouncil({colony:this.state.name,day:this.state.day,population:this.livingColonists().length,stock:this.state.stockpile,plan:this.state.strategy,development:settlementSummary(this.state),incident:responding?incident:null,buildings:this.state.structures.map(b=>({id:b.id,kind:b.kind,tier:b.tier,status:b.status,staff:b.staff.length})),briefing:"Choose the next investment to build a thriving, distinctive settlement. Stable supplies should enable development. You may pursue growth, industrial efficiency or frontier power. Worker routines continue without asking you about every cycle."},choices);
      if(this.stopped)return;
      if(!(result.choice in choices))throw new Error("Council chose an unavailable option");
      this.state.stats.jevRequests++;this.state.stats.jevDecisions++;this.state.stats.decisions++;this.state.stats.inputTokens+=result.usage.inputTokens;
      this.decisionUsage.priorityRequests++;this.decisionUsage.inputTokens+=result.usage.inputTokens;
      if(responding){
        if(this.state.incident?.id!==incident.id)return;
        if(!(result.choice in incidentChoices(this.state))){this.state.strategy.reviewedAt=this.state.tick-480;return;}
        if(respondToIncident(this.state,result.choice))this.recruit();
        this.publish("incident.response",`${incident.title}: Jev chose ${result.choice}. ${incident.outcome}`);
      }else{
        const workers=this.livingColonists().filter(p=>!this.state.structures.some(b=>b.staff.includes(p.id))).toSorted((a,b)=>b.skills.building-a.skills.building).slice(0,2);
        for(const worker of workers){worker.order=null;}
        const description=choices[result.choice];
        if(description===undefined)throw new Error("Council goal description missing");
        const title=result.choice==="grow"?"Grow the settlement":result.choice.startsWith("raid:")?`Raid for ${result.choice.slice(5)}`:description.split(":")[0];
        if(title===undefined)throw new Error("Council goal title missing");
        this.state.strategy={goal:result.choice,title,startedAt:this.state.tick,reviewedAt:this.state.tick,progressAt:this.state.tick,workers:workers.map(p=>p.id),completed:this.state.strategy.completed,status:"Committed",budget:{}};
        this.publish("strategy.chosen",`${this.state.name} committed to ${this.state.strategy.title}`);
      }
      this.state.jev={status:"running",lastError:null};
    }catch(error){this.handleJevFailure(error instanceof Error?error:new Error("Council decision failed"));}
    finally{this.councilPending=false;}
  }

  private manageSettlement(): void {
    const message=incidentTick(this.state);
    if(message!==null){remember(this.state.development.history,this.state.tick,message);this.publish("incident.changed",message);}
    if(this.state.incident!==null&&!this.state.incident.resolved&&this.state.incident.choice===null){void this.council();return;}
    const strategy=this.state.strategy;
    if(strategy.goal===""||this.state.tick-strategy.progressAt>960){
      if(this.state.tick-strategy.reviewedAt>=480){strategy.reviewedAt=this.state.tick;void this.council();}
    }
    if(strategy.goal!==""){
      const step=strategyStep(this.state);
      strategy.budget=step.cost;strategy.status=step.label;
      if(step.done){this.finishStrategy(`${strategy.title} completed`);return;}
    }
    if(this.state.tick%30!==0)return;
    const staff=new Set(this.state.structures.flatMap(b=>b.staff));
    for(const building of this.state.structures){
      if(building.tier===0||PASSIVE_BUILDINGS.has(building.kind)||building.staff.length>0||building.status==="Automated")continue;
      if(staff.size>=Math.max(0,this.livingColonists().length-4))break;
      const person=this.livingColonists().find(p=>!staff.has(p.id)&&!strategy.workers.includes(p.id));
      if(person!==undefined){building.staff.push(person.id);person.order=null;staff.add(person.id);}
    }
  }

  private assignedTask(person: Colonist): boolean {
    const plan=this.state.strategy;
    const building=this.state.structures.find(b=>b.staff.includes(person.id));
    const strategic=plan.workers.includes(person.id)&&plan.goal!=="";
    if(!strategic&&building===undefined)return false;
    const milestone=milestoneChoices(this.state,person);
    if(milestone!==null)return false;
    const need=person.thirst>=55?"drink":person.hunger>=55?"eat":person.fatigue>=70?"rest":null;
    if(need!==null){person.task=this.createTask(person,need);if(person.task===null&&need!=="rest")person.task=this.createTask(person,need==="drink"?"fetch_water":"gather_berries");return person.task!==null;}
    const population=this.livingColonists().length;
    const shortage=this.state.stockpile.water<population*2?"fetch_water":this.state.stockpile.food<population*2?"gather_berries":null;
    if(shortage!==null){person.task=this.createTask(person,shortage);return person.task!==null;}
    this.executingPlan=true;
    try{
      if(strategic){
        const next=strategyStep(this.state);
        if(next.done)return false;
        if(plan.goal.startsWith("repair:")){
          const target=this.state.structures.find(b=>b.id===plan.goal.slice(7));
          if(target!==undefined&&affordable(this.state,next.cost)){spend(this.state,next.cost);target.condition=100;this.finishStrategy("Machinery repaired");}return false;
        }
        const missing=recipeCosts(next.cost).find(([key,amount])=>this.state.stockpile[key]<amount);
        if(missing!==undefined){const action=materialAction(this.state,missing[0]);if(action!==null)person.task=this.createTask(person,action);plan.status=`${next.label} · needs ${missing[0]}`;return person.task!==null;}
        if(next.building!==null){
          let target=next.existing;
          if(plan.goal.startsWith("relocate:")&&target!==undefined&&target.tier===target.targetTier){
            const position=buildingSite(this.state,target.kind);
            if(position===null){plan.status="No fresh reachable deposit";return false;}
            spend(this.state,next.cost);target.x=position.x;target.y=position.y;target.tier=0;target.targetTier=1;target.workDone=0;target.totalWork=160;target.condition=100;clearBuildingSite(this.state,target);
            for(const worker of this.state.colonists)if(worker.task?.targetId===target.id)this.cancelTask(worker);
          }else if(target===undefined||target.tier===target.targetTier){const started=startBuilding(this.state,next.building,target);if(started===null){plan.status="No reachable building site";return false;}target=started;plan.budget={};}
          const route=findRoute(this.state,person,target,true,2);
          if(route!==null)person.task={action:"construct_building",targetId:target.id,route,workRemaining:target.totalWork-target.workDone,totalWork:target.totalWork};
        }else if(next.action!==null){
          if(next.action==="raid"&&person.equipment.weapon===0&&this.state.stockpile.weapons>0)person.task=this.createTask(person,"equip_weapon");
          else if(!this.state.colonists.some(p=>p.id!==person.id&&p.task?.action===next.action&&!['work_research','raid'].includes(next.action)))person.task=this.createTask(person,next.action);
        }
        if(person.task!==null)plan.progressAt=this.state.tick;
        return person.task!==null;
      }
      if(building!==undefined){
        if(building.status==="Automated")return false;
        person.task=buildingTask(this.state,person,building);
        if(person.task===null){
          const missing=recipeCosts(buildingRecipe(building).input).find(([key,amount])=>this.state.stockpile[key]<amount);
          if(missing!==undefined){const action=materialAction(this.state,missing[0]);if(action!==null)person.task=this.createTask(person,action);}
        }
        return person.task!==null;
      }
      return false;
    }finally{this.executingPlan=false;}
  }

  private sequence = 0;
  private stopped = false;

  public constructor(
    public readonly state: WorldState,
    private readonly decisionEngine: DecisionEngine,
    private readonly rival: WorldState,
  ) {
    super();
    this.decisionUsage.startTick = state.tick;
    this.orderSignature = this.assignmentSignature();
    // Correct saved positions before publishing, including idle people in a paused colony.
    for (const colonist of state.colonists) {
      const position = findOpenPosition(state, colonist);
      colonist.x = position.x;
      colonist.y = position.y;
      const task = colonist.task;
      if (task === null) continue;
      const resource = state.resources.find((node) => node.id === task.targetId);
      const farm = state.farms.find((field) => field.id === task.targetId);
      const job = developmentJob(state, rival, task.action);
      let destination: Position;
      const structure=state.structures.find(b=>b.id===task.targetId);
      if(structure!==undefined)destination=structure;
      else if (resource !== undefined) destination = resource;
      else if (farm !== undefined) destination = farm;
      else if (task.action === "build_farm" && state.project !== null) destination = state.project;
      else if (task.action === "raid" && task.cargo !== undefined) destination = state.stations.food;
      else if (job !== null) destination = job.destination;
      else if (task.action === "work_research") destination = state.stations.workshop;
      else if (task.action === "plan_farm" || task.action.startsWith("learn_") || task.action.startsWith("choose_") || task.action.startsWith("research_")) destination = colonist;
      else if (task.action === "eat" || task.action === "drink") destination = state.stations[task.action === "eat" ? "food" : "water"];
      else if (task.action === "rest") destination = { x: state.camp.x - 1, y: state.camp.y + 1 };
      else if (task.action === "build_hut") destination = { x: state.camp.x - 2 + state.buildings.huts % 4, y: state.camp.y + 2 + Math.floor(state.buildings.huts / 4) };
      else {
        colonist.task = null;
        continue;
      }
      const route = findRoute(state, colonist, destination, task.action !== "rest" && destination !== colonist, structure !== undefined ? 2 : farm !== undefined ? farm.radius + 1 : task.action === "build_farm" && state.project !== null ? state.project.radius + 1 : 1);
      if (route === null) this.cancelTask(colonist);
      else task.route = route;
    }
  }

  /** Stops queued decisions; in-flight answers cannot mutate a stopped colony. */
  public stop(): void {
    this.stopped = true;
    if (this.decisionBatchTimer !== undefined) clearTimeout(this.decisionBatchTimer);
    this.decisionBatchTimer = undefined;
  }

  /** Advances one deterministic simulation step and schedules meaningful decisions. */
  public tick(): void {
    if (this.stopped) return;
    this.state.updatedAt = new Date().toISOString();
    if (this.state.jev.status === "waiting") {
      if (Date.now() >= this.jevRetryAt) {
        const idleColonist = this.state.colonists.find(
          (colonist) => colonist.health > 0 && colonist.task === null,
        );
        if (idleColonist !== undefined) this.queueNextTask(idleColonist);
        else void this.council();
      }
      this.emit("snapshot", this.state);
      return;
    }

    this.state.tick += 1;
    this.state.day = Math.floor(this.state.tick / 480) + 1;
    industryTick(this.state,this.rival);
    this.manageSettlement();
    for (const message of runEconomy(this.state)) this.publish("economy.production", message);
    for (const message of growFood(this.state)) this.publish("colony.growth", message);

    const orderSignature = this.assignmentSignature();
    if (orderSignature !== this.orderSignature) {
      this.orderSignature = orderSignature;
      for (const person of this.state.colonists) if (person.order !== null) this.endOrder(person, "strategy_changed");
    }
    for (const colonist of this.state.colonists) {
      if (colonist.health <= 0) continue;
      const previousHunger = colonist.hunger;
      const previousThirst = colonist.thirst;
      this.updateNeeds(colonist);
      if (colonist.health <= 0) continue;
      const task = colonist.task;
      if (task !== null && task.action !== "eat" && task.action !== "drink" &&
        ((previousHunger < 80 && colonist.hunger >= 80) ||
         (previousThirst < 80 && colonist.thirst >= 80))) {
        this.cancelTask(colonist);
        this.decisionReasons.set(colonist.id, "urgent_needs");
        this.publish("task.interrupted", `${colonist.name} paused ${task.action.replaceAll("_", " ")} to reconsider newly urgent needs`, colonist.id);
      }
      if (colonist.task === null) {
        if(this.assignedTask(colonist))continue;
        this.continueOrder(colonist);
        if (colonist.task === null) this.queueNextTask(colonist);
      }
      else this.advanceTask(colonist);
    }

    const population = this.livingColonists().length;
    const signature = JSON.stringify([population, this.state.stockpile.food < population * 3, this.state.stockpile.water < population * 3, this.state.progression.stage, this.state.development.branch, this.state.development.technologies.length, this.state.development.research?.id, this.state.intel !== null, this.state.raids.lost]);
    if ((signature !== this.prioritySignature || this.state.tick-this.lastPriorityTick>=480) && this.state.tick - this.lastPriorityTick >= 120) {
      this.prioritySignature = signature;
      this.lastPriorityTick = this.state.tick;
      void this.updateColonyPriority();
    }
    if (this.state.tick % 10 === 0) {
      const sample = { tick: this.state.tick, ...this.state.stockpile };
      this.state.resourceHistory.push(sample);
      if (this.state.resourceHistory.length > 960) this.state.resourceHistory.shift();
      this.emit("resource-sample", sample);
    }
    // Publish each movement step so viewers can interpolate without cutting route corners.
    this.emit("snapshot", this.state);
  }

  private updateNeeds(colonist: Colonist): void {
    colonist.hunger = clamp(colonist.hunger + 0.14 * (1 - colonist.talents.metabolism * 0.1));
    colonist.thirst = clamp(colonist.thirst + 0.18 * (this.state.incident?.kind==="drought"&&!this.state.incident.resolved?(this.state.incident.choice==="ration"?.7:1.3):1) * (1 - colonist.talents.hydration * 0.1));
    colonist.fatigue = clamp(colonist.fatigue + (colonist.task === null ? 0.04 : 0.09) * (1 - colonist.talents.endurance * 0.15));
    if (colonist.hunger >= 95 || colonist.thirst >= 95) {
      colonist.health = clamp(colonist.health - 0.35 * (1 - colonist.talents.survivor * 0.25));
    }
    if (colonist.health === 0) {
      this.cancelTask(colonist);
      colonist.order = null;
      this.state.stats.deaths += 1;
      this.publish("colonist.died", `${colonist.name} died`, colonist.id);
    }
  }

  private advanceTask(colonist: Colonist): void {
    const task = colonist.task;
    if (task === null) return;
    if (task.supplies?.food && colonist.hunger >= 60) { colonist.hunger = clamp(colonist.hunger - 60); task.supplies.food = false; }
    if (task.supplies?.water && colonist.thirst >= 60) { colonist.thirst = clamp(colonist.thirst - 65); task.supplies.water = false; }
    if (task.route.length > 0) {
      const expedition = task.action === "scout" || task.action === "raid";
      colonist.movementCredit += Math.min(1, 0.55 * (1 + colonist.talents.runner * 0.15 + (expedition ? colonist.talents.pathfinder * 0.1 : 0) + (this.state.development.technologies.includes("logistics") ? 0.1 : 0)));
      if (colonist.movementCredit < 1) return;
      colonist.movementCredit -= 1;
      const nextPosition = task.route.shift();
      if (nextPosition === undefined) throw new Error("Walking task lost its next tile");
      if (!isWalkable(this.state, nextPosition)) { this.cancelTask(colonist); colonist.order = null; return; }
      colonist.x = nextPosition.x; colonist.y = nextPosition.y;
      return;
    }
    if(task.action==="construct_building"){
      const building=this.state.structures.find(b=>b.id===task.targetId);
      if(building===undefined||building.tier===building.targetTier){colonist.task=null;return;}
      building.workDone=Math.min(building.totalWork,building.workDone+1+colonist.talents.builder*.2);task.workRemaining=building.totalWork-building.workDone;
      this.state.strategy.progressAt=this.state.tick;
      if(building.workDone>=building.totalWork){building.tier=building.targetTier;building.condition=100;for(const worker of this.state.colonists)if(worker.task?.targetId===building.id){worker.task=null;rewardWork(this.state,worker,"construct_building");}const message=`Completed ${buildingDefinition(building.kind).name} tier ${building.tier}`;remember(this.state.development.history,this.state.tick,message);this.publish("project.completed",message);}
      return;
    }
    if (task.action === "work_research") {
      this.advanceResearch(colonist, task);
      return;
    }

    if (task.action === "build_farm") {
      const project = this.state.project;
      if (project === null || task.targetId !== project.id) {
        colonist.task = null;
        return;
      }
      project.workDone = Math.min(project.totalWork, project.workDone + (0.75 + colonist.skills.building) * (1 + colonist.talents.builder * 0.15));
      task.workRemaining = project.totalWork - project.workDone;
      if (project.workDone >= project.totalWork) {
        const farm = finishFarm(this.state);
        for (const worker of this.state.colonists) {
          if (worker.task?.action === "build_farm" && worker.task.targetId === farm.id) { rewardWork(this.state, worker, "build_farm"); worker.task = null; }
        }
        this.publish("project.completed", `${farm.id.replaceAll("-", " ")} completed — ready for planting`);
      }
      return;
    }
    const construction = task.action.startsWith("build_") || task.action === "upgrade_home" || task.action === "expand_farm";
    const efficiency = construction ? colonist.talents.builder * 0.15 : (REPEAT_JOBS.has(task.action) || ["plant_crops", "harvest_crops"].includes(task.action)) ? colonist.talents.forager * 0.15 : 0;
    const craftBonus = ["craft_planks", "smelt_metal", "craft_tools", "craft_weapons"].includes(task.action) ? colonist.talents.artisan * 0.2 : 0;
    const toolBonus = colonist.equipment.tool > 0 && (construction || REPEAT_JOBS.has(task.action)) ? 0.3 : 0;
    task.workRemaining -= (colonist.trait === "hard_worker" ? 1.25 : 1) * (1 + efficiency + craftBonus + toolBonus);
    if (task.action === "rest") colonist.fatigue = clamp(colonist.fatigue - 2.4);
    if (task.workRemaining > 0) return;
    colonist.task = null;
    this.completeTask(colonist, task);
    if (colonist.task === null && !this.assignedTask(colonist)) this.continueOrder(colonist);
  }

  private completeTask(colonist: Colonist, task: Task): void {
    if (task.action.startsWith("choose_") || task.action.startsWith("learn_") || task.action.startsWith("research_")) return;
    const resource = this.state.resources.find((node) => node.id === task.targetId);
    const farm = this.state.farms.find((field) => field.id === task.targetId);
    const output = jobOutput(this.state, colonist, task.action);
    switch (task.action) {
      case "work_building": {const building=this.state.structures.find(b=>b.id===task.targetId);if(building!==undefined)produce(this.state,this.rival,building);break;}
      case "equip_tool": colonist.equipment.tool = 24; break;
      case "equip_weapon": colonist.equipment.weapon = 12; break;
      case "commission_monument": this.state.development.monuments += 1; remember(this.state.development.history, this.state.tick, `Completed civic monument ${this.state.development.monuments}`); break;
      case "recruit": this.recruit(); if(this.state.strategy.goal==="grow")this.finishStrategy("A new resident joined"); break;
      case "expand_farm":
        if (farm === undefined) throw new Error("Expansion lost its field");
        farm.radius = 2;
        if(this.state.strategy.goal==="expand")this.finishStrategy("Field expanded");
        for (const person of [...this.state.colonists, ...this.rival.colonists]) {
          if (Math.abs(person.x - farm.x) <= 2 && Math.abs(person.y - farm.y) <= 2) {
            const position = findOpenPosition(this.state, person); person.x = position.x; person.y = position.y;
          }
        }
        break;
      case "build_workshop": this.state.development.workshop = true; break;
      case "craft_planks": case "smelt_metal": case "craft_tools": case "craft_weapons":
        if (output === null) throw new Error("Crafting job has no output");
        this.state.stockpile[output.resource] += output.amount; break;
      case "build_defense": this.state.development.defenses += 1; break;
      case "upgrade_home": this.state.development.homes += 1; break;
      case "guard": break;
      case "scout":
        this.observeRival();
        this.publish("rival.scouted", `${colonist.name} scouted ${this.rival.name}: ${this.rival.stockpile.food} food, defense ${this.rival.development.defenses}`, colonist.id);
        break;
      case "raid":
        if (task.cargo !== undefined) {
          const cargoKind=task.cargoKind ?? "food";
          this.state.stockpile[cargoKind] += task.cargo;
          if(this.state.strategy.goal.startsWith("raid:"))this.finishStrategy(`Raid returned with ${task.cargo} ${cargoKind}`);
          this.state.raids.stolen += task.cargo;
          this.publish("raid.delivered", `${colonist.name} brought home ${task.cargo} stolen ${task.cargoKind ?? "food"}`, colonist.id);
          break;
        }
        this.resolveRaid(colonist, task);
        return;
      case "drink":
        this.state.stockpile.water -= 4;
        colonist.thirst = clamp(colonist.thirst - 72);
        break;
      case "eat":
        this.state.stockpile.food -= 4;
        colonist.hunger = clamp(colonist.hunger - 68);
        break;
      case "rest":
        colonist.fatigue = clamp(colonist.fatigue - 45 - this.state.development.homes * 10 - buildingTiers(this.state,"home")*3);
        colonist.health = clamp(colonist.health + 4 + colonist.talents.medic * 3 + (this.state.development.technologies.includes("medicine") ? 8 : 0));
        break;
      case "plan_farm":
      case "build_farm":
        break;
      case "plant_crops":
        if (farm === undefined || farm.stage !== "fallow") break;
        farm.stage = "growing";
        farm.growth = colonist.talents.irrigator * 40;
        this.publish("farm.planted", `${colonist.name} planted ${farm.id.replaceAll("-", " ")} — crops growing`, colonist.id);
        break;
      case "harvest_crops":
        if (farm === undefined || farm.stage !== "ripe") break;
        farm.stage = "fallow";
        farm.growth = 0;
        const harvest = (farm.radius === 2 ? 28 : 14) + colonist.talents.farmer * 2 + (this.state.development.technologies.includes("agronomy") ? 4 : 0) + (this.state.development.branch === "agriculture" ? 4 : 0);
        this.state.stockpile.food += harvest;
        this.state.progression.harvests += 1;
        this.publish("farm.harvested", `${colonist.name} harvested ${harvest} food`, colonist.id);
        break;
      case "fish": case "fetch_water":
        if (output === null) throw new Error("Gathering job has no output");
        this.state.stockpile[output.resource] += output.amount; break;
      case "gather_berries": case "chop_tree": case "mine_stone": case "mine_ore": case "mine_coal": case "mine_clay":
        if (resource === undefined || output === null) throw new Error("Harvest task lost its resource or output");
        this.collectResource(resource, resource.kind, output.amount);
        break;
      case "build_hut":
        this.state.buildings.huts += 1;
        // A passer-by can enter the construction tile before the hut is finished.
        for (const person of [...this.state.colonists, ...this.rival.colonists]) {
          const position = findOpenPosition(this.state, person); person.x = position.x; person.y = position.y;
        }
        break;
    }
    this.returnSupplies(task);
    if (colonist.equipment.tool > 0 && (REPEAT_JOBS.has(task.action) || task.action.startsWith("build_"))) colonist.equipment.tool -= 1;
    rewardWork(this.state, colonist, task.action);
    this.publish(
      "task.completed",
      `${colonist.name} completed ${task.action.replaceAll("_", " ")}`,
      colonist.id,
      { action: task.action },
    );
  }

  private advanceResearch(colonist: Colonist, task: Task): void {
    const project = this.state.development.research;
    if (project === null || project.id !== task.targetId) { colonist.task = null; return; }
    project.workDone = Math.min(project.totalWork, project.workDone + 1 + colonist.talents.engineer * 0.2);
    task.workRemaining = project.totalWork - project.workDone;
    if (project.workDone < project.totalWork) return;
    const definition = TECHNOLOGIES.find((tech) => tech.id === project.id);
    if (definition === undefined) throw new Error("Completed research has no definition");
    this.state.development.technologies.push(project.id);
    this.state.progression.stage = this.state.development.technologies.includes("citadel") ? "capital" : this.state.development.technologies.includes("township") ? "town" : "village";
    for (const worker of this.state.colonists) if (worker.task?.action === "work_research") { rewardWork(this.state, worker, "work_research"); worker.task = null; }
    this.state.development.research = null;
    remember(this.state.development.history, this.state.tick, `Unlocked ${definition.name}: ${definition.effect}`);
    this.publish("research.completed", `${this.state.name} unlocked ${definition.name}: ${definition.effect}`);
  }

  private recruit(): void {
    const index = this.state.colonists.length + 1;
    const position = findOpenPosition(this.state, { x: this.state.camp.x + 1, y: this.state.camp.y + 1 });
    const person: Colonist = { ...position, id: `${this.state.id}-colonist-${index}`, name: `Settler ${index} · ${this.state.name}`, health: 100, hunger: 20, thirst: 20, fatigue: 10, trait: "communal", experience: 0, level: 1, talents: emptyTalents(), skillPoints: 0, equipment: { tool: 0, weapon: 0 }, movementCredit: 0, retreatReadyAt: 0, biography: [{ tick: this.state.tick, text: "Joined the settlement" }], order: null, skills: { building: 0.6, gathering: 0.6 }, task: null, lastDecision: null };
    this.state.colonists.push(person);
    this.state.development.nextRecruitAt = this.state.tick + 480;
    remember(this.state.development.history, this.state.tick, `${person.name} joined; population ${this.livingColonists().length}`);
    this.publish("colonist.arrived", `${person.name} joined the colony`, person.id);
  }

  private cancelTask(colonist: Colonist): void {
    const task = colonist.task;
    if (task === null) return;
    this.returnSupplies(task);
    if(task.reserved!==undefined)for(const [key,amount]of recipeCosts(task.reserved))this.state.stockpile[key]+=amount;
    if (task.action === "expand_farm") { this.state.stockpile.planks += 20; this.state.stockpile.stone += 16; this.state.stockpile.wood += 20; }
    const job = developmentJob(this.state, this.rival, task.action);
    if (job !== null) for (const [resource, cost] of recipeCosts(job.cost)) this.state.stockpile[resource] += cost;
    colonist.task = null;
  }

  private observeRival(): void {
    this.state.intel = { observedAt: this.state.tick, food: this.rival.stockpile.food, defense: this.rival.development.defenses, population: this.rival.colonists.filter((person) => person.health > 0).length };
  }

  private resolveRaid(colonist: Colonist, task: Task): void {
    this.observeRival();
    const guards = this.rival.colonists.filter((person) => person.health > 0 && person.task?.action === "guard" && person.task.route.length === 0);
    const defense = staffedTiers(this.rival,"watchtower")*5 + staffedTiers(this.rival,"barracks")*4 + this.rival.development.defenses * 12 + guards.reduce((sum, guard) => sum + 10 + (guard.equipment.weapon > 0 ? 12 + guard.talents.fighter * 4 : 0), 0);
    const attack = colonist.equipment.weapon > 0 ? 10 + colonist.talents.fighter * 3 : 0;
    const damage = Math.max(0, defense - attack - (this.state.development.branch === "frontier" ? 10 : 0)) * (1 - colonist.talents.shield * 0.1);
    for (const guard of guards) if (guard.equipment.weapon > 0) guard.equipment.weapon -= 1;
    if (colonist.equipment.weapon > 0) colonist.equipment.weapon -= 1;
    colonist.health = clamp(colonist.health - damage);
    if (colonist.health <= 0 && colonist.talents.veteran > 0 && this.state.tick >= colonist.retreatReadyAt) {
      colonist.health = 10; colonist.retreatReadyAt = this.state.tick + 960;
      const route = findRoute(this.state, colonist, this.state.stations.food, true);
      if (route !== null) colonist.task = { action: "raid", cargo: 0, cargoKind:task.cargoKind, supplies: task.supplies, route, workRemaining: 1, totalWork: 1 };
      remember(colonist.biography, this.state.tick, "Veteran retreat saved them from a lethal raid");
      this.publish("raid.retreat", `${colonist.name} used Veteran Retreat and abandoned the raid`, colonist.id);
      return;
    }
    if (colonist.health <= 0) { remember(colonist.biography, this.state.tick, "Died on a raid"); this.state.stats.deaths += 1; colonist.order = null; this.publish("raid.repulsed", `${colonist.name} was lost raiding ${this.rival.name}`, colonist.id); return; }
    const goalResource=task.cargoKind;
    const resource = goalResource==="metal"||goalResource==="coal"||goalResource==="tools" ? goalResource : "food";
    const reserved = this.rival.colonists.filter((person) => person.health > 0 && person.task?.action === "eat").length * 4;
    const cargo = Math.min(Math.max(0, this.rival.stockpile[resource] - (resource==="food"?reserved:0)), storageRoom(this.state, resource), Math.max(0, 20 + colonist.talents.hauler * 4 + (this.state.development.branch === "frontier" ? 4 : 0) - this.rival.development.defenses * 3 - guards.length * 3));
    const route = findRoute(this.state, colonist, this.state.stations.food, true);
    if (route === null) { this.publish("raid.blocked", `${colonist.name} cannot find a return route`, colonist.id); return; }
    this.rival.stockpile[resource] -= cargo;
    this.rival.raids.lost += cargo;
    colonist.task = { action: "raid", cargo, cargoKind:resource, supplies: task.supplies, route, totalWork: 1, workRemaining: 1 };
    remember(colonist.biography, this.state.tick, `Raided ${this.rival.name}: ${cargo} ${resource}, ${Math.round(damage)} damage taken`);
    this.publish("raid.returning", `${colonist.name} took ${cargo} ${resource} from ${this.rival.name}; returning with ${Math.round(colonist.health)} health`, colonist.id);
  }

  private assignmentSignature(): string {
    const population = this.livingColonists().length;
    return JSON.stringify([this.state.priority, population, this.state.stockpile.food < population * 3,
      this.state.stockpile.water < population * 3, this.state.development.technologies,
      this.state.development.research?.id, this.state.project?.id, this.state.development.branch,
      this.state.intel?.observedAt, this.state.raids.lost]);
  }

  private endOrder(colonist: Colonist, reason: string): void {
    colonist.order = null;
    this.decisionReasons.set(colonist.id, reason);
  }

  private continueOrder(colonist: Colonist): void {
    const order = colonist.order;
    if (order === null) return;
    if (colonist.health < 35) { this.endOrder(colonist, "low_health"); return; }
    if (milestoneChoices(this.state, colonist) !== null) { this.endOrder(colonist, "milestone"); return; }
    // Needs are an interruption to an authorized assignment, not a fresh strategic decision.
    const needs: Array<[ActionKind, number, boolean]> = [
      ["drink", colonist.thirst, this.unreserved("water", "drink") >= 4],
      ["eat", colonist.hunger, this.unreserved("food", "eat") >= 4],
      ["rest", colonist.fatigue, true],
    ];
    const need = needs.filter(([action, level]) => level >= (action === "rest" ? 80 : 65)).toSorted((a, b) => b[1] - a[1])[0];
    if (need !== undefined) {
      colonist.task = need[2] ? this.createTask(colonist, need[0]) : null;
      if (colonist.task === null) this.endOrder(colonist, "needs_unavailable");
      else this.decisionUsage.needBreaks += 1;
      return;
    }
    if (!(order.action in this.availableActions(colonist))) { this.endOrder(colonist, "assignment_unavailable"); return; }
    const next = this.createTask(colonist, order.action);
    if (next === null) { this.endOrder(colonist, "route_unavailable"); return; }
    order.remaining -= 1;
    if (order.remaining <= 0) this.endOrder(colonist, "assignment_complete");
    colonist.task = next;
    this.decisionUsage.autonomousJobs += 1;
  }

  private collectResource(
    resource: ResourceNode | undefined,
    expectedKind: ResourceKind,
    yieldAmount: number,
  ): void {
    if (resource === undefined || resource.kind !== expectedKind || resource.amount <= 0) return;
    resource.amount -= 1;
    if (resource.amount === 0 && (expectedKind === "tree" || expectedKind === "berries")) {
      resource.regrowAt = this.state.tick + (expectedKind === "berries" ? 960 : this.state.development.technologies.includes("forestry") ? 2400 : 4800);
    }
    if (expectedKind === "berries") this.state.stockpile.food += yieldAmount;
    if (expectedKind === "tree") this.state.stockpile.wood += yieldAmount;
    if (expectedKind === "stone") this.state.stockpile.stone += yieldAmount;
    if (expectedKind === "ore") this.state.stockpile.ore += yieldAmount;
    if (expectedKind === "clay") this.state.stockpile.clay += yieldAmount;
    if (expectedKind === "coal") this.state.stockpile.coal += yieldAmount;
  }

  private queueNextTask(colonist: Colonist): void {
    if (
      this.pendingDecisions.has(colonist.id) ||
      (this.decisionRetryAt.get(colonist.id) ?? 0) > Date.now()
    ) {
      return;
    }
    this.pendingDecisions.add(colonist.id);
    this.decisionQueue.push({
      colonistId: colonist.id,
      choices: this.availableActions(colonist),
      state: this.buildDecisionState(colonist),
    });
    if (this.decisionQueue.length >= DECISION_BATCH_SIZE) {
      void this.flushDecisionBatch();
      return;
    }
    this.scheduleDecisionBatch();
  }

  private scheduleDecisionBatch(): void {
    if (this.decisionBatchTimer !== undefined || this.decisionBatchInFlight) return;
    this.decisionBatchTimer = setTimeout(() => {
      this.decisionBatchTimer = undefined;
      void this.flushDecisionBatch();
    }, DECISION_BATCH_WAIT_MS);
  }

  private async flushDecisionBatch(): Promise<void> {
    if (this.decisionBatchInFlight || this.decisionQueue.length === 0) return;
    if (this.decisionBatchTimer !== undefined) clearTimeout(this.decisionBatchTimer);
    this.decisionBatchTimer = undefined;
    this.decisionBatchInFlight = true;
    const batch = this.decisionQueue.splice(0, DECISION_BATCH_SIZE).flatMap((request) => {
      const person = this.state.colonists.find((candidate) => candidate.id === request.colonistId);
      if (person === undefined || person.health <= 0 || person.task !== null) {
        this.pendingDecisions.delete(request.colonistId);
        return [];
      }
      return [{ colonistId: person.id, state: this.buildDecisionState(person), choices: this.availableActions(person) }];
    });
    try {
      if (batch.length === 0) return;
      this.decisionUsage.requests += 1;
      this.decisionUsage.questions += batch.length;
      for (const request of batch) {
        const reason = this.decisionReasons.get(request.colonistId) ?? (request.state.colonist.skillPoints > 0 ? "milestone" : "job_complete_or_idle");
        this.decisionUsage.reasons[reason] = (this.decisionUsage.reasons[reason] ?? 0) + 1;
        this.decisionReasons.delete(request.colonistId);
      }
      const result = await this.decisionEngine.chooseActions(batch);
      if (this.stopped) return;
      this.state.stats.jevRequests += 1;
      this.state.stats.inputTokens += result.usage.inputTokens;
      this.decisionUsage.inputTokens += result.usage.inputTokens;
      this.state.stats.outputTokens += result.usage.outputTokens;
      this.state.jev = { status: "running", lastError: null };

      this.decisionUsage.discarded += batch.length;
      for (const answer of result.answers) {
        const request = batch.find((candidate) => candidate.colonistId === answer.colonistId);
        const colonist = this.state.colonists.find((candidate) => candidate.id === answer.colonistId);
        if (request === undefined || colonist === undefined || colonist.health <= 0 || colonist.task !== null) continue;
        const decision = answer.decision;
        if (!isActionKind(decision.choice) || !(decision.choice in request.choices)) {
          throw new Error(`Invalid action: ${decision.choice}`);
        }
        const currentChoices = this.availableActions(colonist);
        if (!(decision.choice in currentChoices)) continue;
        const task = this.createTask(colonist, decision.choice);
        if (task === null) continue;

        this.decisionUsage.applied += 1;
        this.decisionUsage.discarded -= 1;
        this.recordDecision(colonist, decision, task.action);
        this.decisionRetryAt.delete(colonist.id);
        colonist.task = task;
        colonist.order = REPEAT_JOBS.has(task.action) ? { action: task.action, remaining: ORDER_JOB_LIMIT - 1 } : null;
        this.publish(
          "colonist.decision",
          `${colonist.name} chose ${task.action.replaceAll("_", " ")}`,
          colonist.id,
          { action: task.action, decision: colonist.lastDecision },
        );
      }
    } catch (error) {
      this.decisionUsage.failedRequests += 1;
      this.handleJevFailure(error instanceof Error ? error : new Error("Unknown Jev error"));
      for (const request of batch) {
        this.decisionRetryAt.set(request.colonistId, Date.now() + 10_000);
      }
      for (const request of this.decisionQueue.splice(0)) {
        this.decisionRetryAt.set(request.colonistId, Date.now() + 10_000);
        this.pendingDecisions.delete(request.colonistId);
      }
    } finally {
      for (const request of batch) this.pendingDecisions.delete(request.colonistId);
      this.decisionBatchInFlight = false;
      if (!this.stopped && this.decisionQueue.length > 0 && this.state.jev.status === "running") {
        this.scheduleDecisionBatch();
      }
    }
  }

  private canAfford(cost: Partial<WorldState["stockpile"]>): boolean {
    return recipeCosts(cost).every(([resource, amount]) => (resource === "food" ? this.unreserved("food", "eat") : resource === "water" ? this.unreserved("water", "drink") : this.state.stockpile[resource]) - (this.executingPlan || resource==="food" || resource==="water" ? 0 : (this.state.strategy.budget[resource] ?? 0)) >= amount);
  }

  private availableActions(colonist: Colonist): Partial<Record<ActionKind, string>> {
    const milestone = milestoneChoices(this.state, colonist);
    if (milestone !== null) return milestone;
    const choices: Partial<Record<ActionKind, string>> = {};
    const busy = (action: ActionKind): boolean => this.state.colonists.some((person) => person.health > 0 && person.task?.action === action);
    const d = this.state.development;
    const known = (id: typeof d.technologies[number]): boolean => d.technologies.includes(id);
    const living = this.livingColonists().length;
    const candidates: Array<[ActionKind, boolean, string]> = [
      ["build_workshop", !d.workshop, "Build workshop; enables planks, tools, weapons and research"],
      ["craft_planks", d.workshop, "Craft 2 planks from 4 wood (3 with industry identity)"],
      ["smelt_metal", d.workshop && known("metalworking"), "Smelt 3 ore + 1 coal + 2 wood into 2 metal"],
      ["craft_tools", d.workshop && known("metalworking"), "Craft tool; equipped tools give +30% work speed for 24 jobs"],
      ["craft_weapons", d.workshop && known("militia"), "Craft spear; +12 guard strength or +10 raider strength for 12 encounters"],
      ["equip_tool", colonist.equipment.tool === 0, "Equip a tool from storage"],
      ["equip_weapon", colonist.equipment.weapon === 0 && known("militia"), "Equip a spear from storage"],
      ["build_defense", known("militia") && d.defenses < 3, "Build palisade tier; deals 12 raid damage and protects 3 food"],
      ["upgrade_home", d.workshop && d.homes < this.state.buildings.huts, "Improve housing; extra energy recovery during rest"],
      ["build_hut", d.workshop && housingCapacity(this.state) < populationLimit(this.state) && housingCapacity(this.state) < living + 4, "Build housing for 4 more people"],
      ["recruit", living < populationLimit(this.state) && living < housingCapacity(this.state) && this.state.tick >= d.nextRecruitAt, "Invite a new worker; increases labour and ongoing food/water consumption"],
      ["commission_monument", known("citadel"), "Invest in a civic monument; each raises lasting colony renown and the cost of the next"],
      ["scout", known("settlement"), "Scout rival supplies and defenses; report reflects observation time only"],
      ["raid", this.state.intel !== null, "Steal up to 20 food from rival and return; weapons/skills improve survival and loot; guards can kill raiders"],
      ["guard", this.state.intel !== null || this.state.raids.lost > 0, "Guard camp for 240 work ticks; equipped guards are stronger"],
    ];
    for (const [action, unlocked, description] of candidates) {
      if (!unlocked || busy(action) && action !== "equip_tool" && action !== "equip_weapon" && action !== "guard") continue;
      const job = developmentJob(this.state, this.rival, action);
      if (job === null || !this.canAfford(job.cost)) continue;
      const output = jobOutput(this.state, colonist, action);
      if (output !== null && storageRoom(this.state, output.resource) < output.amount) continue;
      choices[action] = `${description}. Cost: ${recipeCosts(job.cost).map(([resource, amount]) => `${amount} ${resource}`).join(", ") || "none"}`;
    }
    const research = d.research;
    if (research !== null && this.state.colonists.filter((person) => person.task?.action === "work_research").length < 2) {
      const definition = TECHNOLOGIES.find((tech) => tech.id === research.id);
      if (definition === undefined) throw new Error("Research project has no definition");
      if (research.funded || this.canAfford(definition.cost)) choices.work_research = `Work on ${definition.name}: ${definition.effect}`;
    }
    if (this.unreserved("water", "drink") >= 4) choices.drink = "Drink 4 stored water; restore 72 thirst";
    if (this.unreserved("food", "eat") >= 4) choices.eat = "Eat 4 stored food; restore 68 hunger";
    choices.rest = "Rest to recover energy and health";
    for (const [action, kind] of [["fetch_water", "river"], ["fish", "river"], ["gather_berries", "berries"], ["chop_tree", "tree"], ["mine_stone", "stone"], ["mine_ore", "ore"], ["mine_coal", "coal"], ["mine_clay", "clay"]] as const) {
      if ((kind === "ore" || kind === "coal") && !known("metalworking")) continue;
      const output = jobOutput(this.state, colonist, action);
      if (output === null || storageRoom(this.state, output.resource) < output.amount) continue;
      const target = this.findAvailableResource(colonist, kind);
      if (target !== undefined) choices[action] = `Collect ${output.amount} ${output.resource}; nearest available source ${distance(colonist, target)} tiles away`;
    }
    if (storageRoom(this.state, "food") >= 28 + colonist.talents.farmer * 2 + (known("agronomy") ? 4 : 0) + (d.branch === "agriculture" ? 4 : 0) && this.findAvailableFarm(colonist, "ripe") !== undefined) choices.harvest_crops = "Harvest ripe crops; yield depends on field size, skills and research";
    if (this.findAvailableFarm(colonist, "fallow") !== undefined) choices.plant_crops = `Plant crops; mature in ${CROP_GROWTH_TICKS} ticks`;
    if (this.state.project === null && this.state.farms.length < (known("agronomy") ? 6 : 3) && nextFarmSite(this.state) !== null) choices.plan_farm = "Plan a farm: 24 wood + 8 stone, then shared construction";
    const project = this.state.project;
    if (project !== null && (project.funded || this.canAfford({ wood: FARM_WOOD, stone: FARM_STONE })) && this.state.colonists.filter((person) => person.task?.action === "build_farm").length < 2) choices.build_farm = "Build the planned farm";
    if (known("large_fields") && !busy("expand_farm") && this.state.farms.some((farm) => farm.radius === 1) && this.canAfford({ planks: 20, stone: 16, wood: 20 })) choices.expand_farm = "Expand a 3×3 field to 5×5; doubles base harvest. Costs 20 planks, 16 stone, 20 wood";
    return choices;
  }

  private returnSupplies(task: Task): void {
    if (task.supplies?.food) { this.state.stockpile.food += 4; task.supplies.food = false; }
    if (task.supplies?.water) { this.state.stockpile.water += 4; task.supplies.water = false; }
  }

  private createTask(colonist: Colonist, action: ActionKind): Task | null {
    const task = this.planTask(colonist, action);
    if (task === null || task.route.length <= 40) return task;
    const food = this.unreserved("food", "eat") >= 4;
    const water = this.unreserved("water", "drink") >= 4;
    if (food) this.state.stockpile.food -= 4;
    if (water) this.state.stockpile.water -= 4;
    task.supplies = { food, water };
    return task;
  }

  private planTask(colonist: Colonist, action: ActionKind): Task | null {
    if (action.startsWith("choose_") || action.startsWith("learn_")) {
      const choices = milestoneChoices(this.state, colonist);
      if (choices === null || !(action in choices)) return null;
      // Apply the choice immediately so another answer in the same batch cannot choose it twice.
      const message = applyMilestone(this.state, colonist, action);
      if (message !== null) this.publish("development.chosen", message, colonist.id);
      return { action, route: [], workRemaining: 1, totalWork: 1 };
    }
    const technology = TECHNOLOGIES.find((tech) => action === `research_${tech.id}`);
    if (technology !== undefined) {
      if (!(action in researchChoices(this.state))) return null;
      this.state.development.research = { id: technology.id, funded: false, workDone: 0, totalWork: Math.round(technology.work * (technology.branch.toLowerCase() === this.state.development.branch ? 0.75 : 1)) };
      remember(this.state.development.history, this.state.tick, `Planned ${technology.name}`);
      this.publish("research.planned", `${this.state.name} planned ${technology.name}: ${technology.effect}`);
      return { action, route: [], totalWork: 1, workRemaining: 1 };
    }
    if (action === "work_research") {
      const project = this.state.development.research;
      if (project === null) return null;
      const definition = TECHNOLOGIES.find((tech) => tech.id === project.id);
      if (definition === undefined) throw new Error("Research definition is missing");
      const route = findRoute(this.state, colonist, this.state.stations.workshop, true);
      if (route === null) return null;
      if (!project.funded) {
        if (!this.canAfford(definition.cost)) return null;
        for (const [resource, amount] of recipeCosts(definition.cost)) this.state.stockpile[resource] -= amount;
        project.funded = true;
      }
      return { action, route, targetId: project.id, workRemaining: project.totalWork - project.workDone, totalWork: project.totalWork };
    }
    if (action === "expand_farm") {
      const farm = this.state.farms.find((field) => field.radius === 1 && !this.state.colonists.some((person) => person.task?.targetId === field.id));
      if (farm === undefined || !this.canAfford({ planks: 20, stone: 16, wood: 20 })) return null;
      const route = findRoute(this.state, colonist, farm, true, farm.radius + 1);
      if (route === null) return null;
      this.state.stockpile.planks -= 20; this.state.stockpile.stone -= 16; this.state.stockpile.wood -= 20;
      return { action, route, targetId: farm.id, workRemaining: 200, totalWork: 200 };
    }
    const job = developmentJob(this.state, this.rival, action);
    if(action==="recruit"&&this.state.tick<this.state.development.nextRecruitAt)return null;
    if (job !== null) {
      const route = findRoute(this.state, colonist, job.destination, true);
      if (route === null) return null;
      if (!this.canAfford(job.cost)) return null;
      for (const [resource, cost] of recipeCosts(job.cost)) this.state.stockpile[resource] -= cost;
      const task:Task={ action, route, workRemaining: job.work, totalWork: job.work };
      if(action==="raid"){const target=this.state.strategy.goal.split(":")[1];task.cargoKind=target==="metal"||target==="coal"||target==="tools"?target:"food";}
      return task;
    }
    if (action === "plan_farm") {
      if (this.state.project !== null || this.state.farms.length >= (this.state.development.technologies.includes("agronomy") ? 6 : 3)) return null;
      const site = nextFarmSite(this.state);
      if (site === null) return null;
      this.state.project = { ...site, radius: 1, id: `${this.state.id}-farm-${this.state.farms.length + 1}`, funded: false, workDone: 0, totalWork: FARM_WORK };
      // A new footprint invalidates routes that were planned across this formerly empty ground.
      const footprint = farmTiles({ ...site, radius: 1 });
      for (const person of this.state.colonists) {
        if (person.task?.route.some((step) => footprint.some((tile) => tile.x === step.x && tile.y === step.y))) this.cancelTask(person);
      }
      this.publish("project.started", `${colonist.name} committed the colony to ${this.state.project.id.replaceAll("-", " ")}: gather 24 wood and 8 stone`, colonist.id);
      return { action, route: [], workRemaining: 1, totalWork: 1 };
    }
    if (action === "build_farm") {
      const project = this.state.project;
      if (project === null) return null;
      const route = findRoute(this.state, colonist, project, true, 2);
      if (route === null) return null;
      if (!project.funded) {
        if (this.state.stockpile.wood < FARM_WOOD || this.state.stockpile.stone < FARM_STONE) return null;
        this.state.stockpile.wood -= FARM_WOOD;
        this.state.stockpile.stone -= FARM_STONE;
        project.funded = true;
        this.publish("project.funded", "Farm materials delivered — construction started");
      }
      return { action, targetId: project.id, route, workRemaining: project.totalWork - project.workDone, totalWork: project.totalWork };
    }
    if (action === "plant_crops" || action === "harvest_crops") {
      const farm = this.findAvailableFarm(colonist, action === "plant_crops" ? "fallow" : "ripe");
      if (farm === undefined) return null;
      const route = findRoute(this.state, colonist, farm, true, farm.radius + 1);
      if (route === null) return null;
      return { action, targetId: farm.id, route, workRemaining: 30, totalWork: 30 };
    }
    if (action === "drink" || action === "eat") {
      if(this.unreserved(action==="eat"?"food":"water",action)<4)return null;
      const route = findRoute(this.state, colonist, this.state.stations[action === "eat" ? "food" : "water"], true);
      return route === null ? null : { action, route, workRemaining: 2, totalWork: 2 };
    }
    if (action === "rest") {
      const route = findRoute(this.state, colonist, { x: this.state.camp.x - 1, y: this.state.camp.y + 1 });
      return route === null ? null : { action, route, workRemaining: 50, totalWork: 50 };
    }
    const kindByAction: Partial<Record<ActionKind, ResourceKind>> = {
      fetch_water: "river",
      fish: "river",
      gather_berries: "berries",
      chop_tree: "tree",
      mine_clay: "clay", mine_stone: "stone", mine_ore: "ore", mine_coal: "coal",
    };
    const resourceKind = kindByAction[action];
    if (resourceKind === undefined) return null;
    const resource = this.findAvailableResource(colonist, resourceKind);
    if (resource === undefined) return null;
    const route = findRoute(this.state, colonist, resource, true);
    if (route === null) return null;
    const workByAction: Partial<Record<ActionKind, number>> = {
      fetch_water: 40, fish: 75, gather_berries: 65, chop_tree: 100, mine_clay: 100, mine_stone: 110, mine_ore: 140, mine_coal: 120,
    };
    const totalWork = workByAction[action];
    if (totalWork === undefined) throw new Error(`Missing work duration for ${action}`);
    return {
      action,
      targetId: resource.id,
      route,
      workRemaining: totalWork,
      totalWork,
    };
  }

  private findAvailableResource(colonist: Colonist, kind: ResourceKind): ResourceNode | undefined {
    const reservedIds = new Set(
      [...this.state.colonists, ...this.rival.colonists].flatMap((person) =>
        person.task?.targetId === undefined ? [] : [person.task.targetId],
      ),
    );
    return this.state.resources
      .filter((resource) => resource.kind === kind && resource.amount > 0 && !reservedIds.has(resource.id))
      .toSorted((left, right) => distance(colonist, left) - distance(colonist, right))
      .find((resource) => findRoute(this.state, colonist, resource, true) !== null);
  }

  private unreserved(resource: "food" | "water", action: "eat" | "drink"): number {
    return this.state.stockpile[resource] - this.state.colonists.filter((person) => person.health > 0 && person.task?.action === action).length * 4;
  }

  private findAvailableFarm(colonist: Colonist, stage: Farm["stage"]): Farm | undefined {
    return this.state.farms.filter((farm) => farm.stage === stage &&
      !this.state.colonists.some((worker) => worker.task?.targetId === farm.id))
      .toSorted((a, b) => distance(colonist, a) - distance(colonist, b))
      .find((farm) => findRoute(this.state, colonist, farm, true, farm.radius + 1) !== null);
  }

  private buildDecisionState(colonist: Colonist): ColonistDecisionState {
    return {
      colonist: {
        name: colonist.name,
        health: Math.round(colonist.health),
        hunger: Math.round(colonist.hunger),
        thirst: Math.round(colonist.thirst),
        fatigue: Math.round(colonist.fatigue),
        trait: colonist.trait,
        skills: colonist.skills,
        level: colonist.level, experience: colonist.experience, talents: Object.fromEntries(Object.entries(colonist.talents).filter(([, rank]) => rank > 0)), skillPoints: colonist.skillPoints, equipment: colonist.equipment,
      },
      colony: {
        assignments: this.livingColonists().reduce<Record<string, number>>((counts, person) => {
          const action = person.order?.action ?? person.task?.action ?? "idle";
          counts[action] = (counts[action] ?? 0) + 1;
          return counts;
        }, {}),
        priority: this.state.priority,
        population: this.livingColonists().length,
        housing: housingCapacity(this.state),
        ...this.state.stockpile,
        ...settlementSummary(this.state),
      },
    };
  }

  private recordDecision(
    colonist: Colonist,
    decision: DecisionAnswer,
    action: ActionKind,
  ): void {
    colonist.lastDecision = {
      action,
      probabilities: decision.probabilities,
      confidence: decision.confidence,
      latencyMs: decision.latencyMs,
      source: decision.source,
      decidedAt: this.state.tick,
    };
    this.state.stats.decisions += 1;
    this.state.stats.jevDecisions += 1;
  }

  private async updateColonyPriority(): Promise<void> {
    if (this.priorityDecisionPending) return;
    this.priorityDecisionPending = true;
    const living = this.livingColonists();
    const averageHealth =
      living.reduce((total, colonist) => total + colonist.health, 0) / Math.max(1, living.length);
    try {
      this.decisionUsage.priorityRequests += 1;
      const decision = await this.decisionEngine.choosePriority(
        {
          population: living.length,
          housing: housingCapacity(this.state),
          averageHealth: Math.round(averageHealth),
          ...this.state.stockpile,
          ...settlementSummary(this.state),
        },
        PRIORITY_CHOICES,
      );
      if (this.stopped) return;
      if (!isColonyPriority(decision.choice)) {
        throw new Error(`Invalid colony priority: ${decision.choice}`);
      }
      const previous = this.state.priority;
      this.state.priority = decision.choice;
      this.state.jev = { status: "running", lastError: null };
      this.state.stats.decisions += 1;
      this.state.stats.inputTokens += decision.usage.inputTokens;
      this.decisionUsage.inputTokens += decision.usage.inputTokens;
      this.state.stats.outputTokens += decision.usage.outputTokens;
      this.state.stats.jevDecisions += 1;
      this.state.stats.jevRequests += 1;
      if (previous !== this.state.priority) {
        this.publish(
          "colony.priority",
          `Colony priority changed to ${this.state.priority}`,
          undefined,
          { probabilities: decision.probabilities, source: decision.source },
        );
      }
    } catch (error) {
      this.decisionUsage.failedRequests += 1;
      this.handleJevFailure(error instanceof Error ? error : new Error("Unknown Jev error"));
    } finally {
      this.priorityDecisionPending = false;
    }
  }

  private livingColonists(): Colonist[] {
    return this.state.colonists.filter((colonist) => colonist.health > 0);
  }

  private handleJevFailure(error: Error): void {
    if (this.stopped) return;
    this.state.jev = { status: "waiting", lastError: error.message };
    this.jevRetryAt = Date.now() + 10_000;
    // A shared provider failure must not become a request storm across every idle colonist.
    if (Date.now() >= this.nextDecisionErrorLogAt) {
      console.error("Jev decision failed; colony paused for 10 seconds", error);
      this.nextDecisionErrorLogAt = Date.now() + 10_000;
    }
  }

  private publish(type: string, message: string, colonistId?: string, data?: WorldEventData): void {
    const event: WorldEvent = {
      sequence: ++this.sequence,
      type,
      at: new Date().toISOString(),
      message,
    };
    if (colonistId !== undefined) event.colonistId = colonistId;
    if (data !== undefined) event.data = data;
    this.emit("event", event);
  }
}
