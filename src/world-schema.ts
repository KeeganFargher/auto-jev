import { BUILDING_IDS } from "./industry-catalog.js";
import { SKILL_IDS, TECH_IDS, STOCK_KEYS, type Stock, isActionKind } from "./catalog.js";
import type { ActionKind } from "./types.js";
import { z } from "zod";

const positionSchema = z.object({ x: z.number().int(), y: z.number().int() });
const actionSchema = z.custom<ActionKind>((value) => z.string().refine(isActionKind).safeParse(value).success);
const stockSchema = z.object({ food: z.number().nonnegative(), water: z.number().nonnegative(), wood: z.number().nonnegative(), stone: z.number().nonnegative(), planks: z.number().nonnegative(), ore: z.number().nonnegative(), coal: z.number().nonnegative(), metal: z.number().nonnegative(), tools: z.number().nonnegative(), weapons: z.number().nonnegative(), clay:z.number().nonnegative(),bricks:z.number().nonnegative(),steel:z.number().nonnegative(),parts:z.number().nonnegative() });
const partialStockSchema=stockSchema.partial().transform(raw=>{const stock:Partial<Stock>={};for(const key of STOCK_KEYS){const amount=raw[key];if(amount!==undefined)stock[key]=amount;}return stock;});
const historySchema = z.array(z.object({ tick: z.number().int(), text: z.string() })).max(100);

const decisionTraceSchema = z.object({
  action: actionSchema,
  probabilities: z.record(z.string(), z.number()),
  confidence: z.number(),
  latencyMs: z.number(),
  source: z.literal("jev"),
  decidedAt: z.number(),
});

const taskSchema = z.object({
  action: actionSchema,
  targetId: z.string().optional(),
  cargo: z.number().nonnegative().optional(),
  cargoKind: z.enum(["food","water","wood","stone","planks","ore","coal","metal","tools","weapons","clay","bricks","steel","parts"]).optional(),
  reserved: partialStockSchema.optional(),
  supplies: z.object({ food: z.boolean(), water: z.boolean() }).optional(),
  route: z.array(positionSchema),
  workRemaining: z.number(),
  totalWork: z.number(),
});

const colonistSchema = positionSchema.extend({
  id: z.string(),
  name: z.string(),
  health: z.number(),
  hunger: z.number(),
  thirst: z.number(),
  fatigue: z.number(),
  trait: z.enum(["hard_worker", "risk_averse", "resourceful", "communal"]),
  experience: z.number().nonnegative(),
  level: z.number().int().min(1).max(30),
  talents: z.record(z.enum(SKILL_IDS), z.number().int().min(0).max(3)),
  skillPoints: z.number().int().nonnegative(),
  equipment: z.object({ tool: z.number().int().nonnegative(), weapon: z.number().int().nonnegative() }),
  movementCredit: z.number().nonnegative(), retreatReadyAt: z.number().int(), biography: historySchema,
  order: z.object({ action: actionSchema, remaining: z.number().int().positive() }).nullable(),
  skills: z.object({ building: z.number(), gathering: z.number() }),
  task: taskSchema.nullable(),
  lastDecision: decisionTraceSchema.nullable(),
});

const resourceSchema = positionSchema.extend({
  id: z.string(),
  kind: z.enum(["tree", "berries", "stone", "river", "ore", "coal", "clay"]),
  amount: z.number(),
});

const farmSchema = positionSchema.extend({
  id: z.string(), stage: z.enum(["fallow", "growing", "ripe"]), growth: z.number().nonnegative(), radius: z.number().int().min(1).max(2),
});

const terrainSchema=z.object({seed:z.number().int(),tiles:z.string(),regions:z.array(positionSchema.extend({name:z.string(),kind:z.string()}))});
export const worldStateSchema = z.object({
  terrain:terrainSchema,
  structures:z.array(positionSchema.extend({id:z.string(),kind:z.enum(BUILDING_IDS),tier:z.number().int().min(0).max(3),targetTier:z.number().int().min(1).max(3),workDone:z.number().nonnegative(),totalWork:z.number().positive(),staff:z.array(z.string()),residents:z.array(z.string()),condition:z.number().min(0).max(100),cycles:z.number().int().nonnegative(),status:z.string()})),
  strategy:z.object({goal:z.string(),title:z.string(),startedAt:z.number(),reviewedAt:z.number(),progressAt:z.number(),workers:z.array(z.string()),completed:z.number().int(),status:z.string(),budget:partialStockSchema}),
  incident:positionSchema.extend({id:z.string(),kind:z.enum(["drought","travellers","caravan","breakdown","raiders"]),title:z.string(),startedAt:z.number(),deadline:z.number(),choice:z.string().nullable(),resolved:z.boolean(),outcome:z.string()}).nullable(),
  nextIncidentAt:z.number().int(),randomState:z.number().int(),
  id: z.string(), name: z.string(), color: z.string(),
  obstacles: z.array(positionSchema),
  intel: z.object({ observedAt: z.number().int(), food: z.number(), defense: z.number().int(), population: z.number().int() }).nullable(),
  raids: z.object({ stolen: z.number().nonnegative(), lost: z.number().nonnegative() }),
  development: z.object({ completedWork: z.number().int().nonnegative(),
    technologies: z.array(z.enum(TECH_IDS)),
    research: z.object({ id: z.enum(TECH_IDS), funded: z.boolean(), workDone: z.number().nonnegative(), totalWork: z.number().positive() }).nullable(),
    nextRecruitAt: z.number().int(), monuments: z.number().int().nonnegative(), history: historySchema, branch: z.enum(["agriculture", "industry", "frontier"]).nullable(), workshop: z.boolean(), defenses: z.number().int().min(0).max(3), homes: z.number().int().min(0).max(12) }),
  width: z.number().int().positive(),
  height: z.number().int().positive(),
  tick: z.number().int().nonnegative(),
  day: z.number().int().positive(),
  startedAt: z.string(),
  updatedAt: z.string(),
  priority: z.enum(["food", "water", "shelter", "materials", "recovery", "research", "expansion", "security"]),
  jev: z.object({
    status: z.enum(["running", "waiting"]),
    lastError: z.string().nullable(),
  }),
  stockpile: stockSchema,
  buildings: z.object({ huts: z.number().int(), campfires: z.number().int() }),
  colonists: z.array(colonistSchema),
  stats: z.object({
    decisions: z.number().int(),
    jevDecisions: z.number().int(),
    jevRequests: z.number().int(),
    deaths: z.number().int(),
    inputTokens: z.number().int(),
    outputTokens: z.number().int(),
  }),
  camp: positionSchema,
  resources: z.array(resourceSchema.extend({ regrowAt: z.number().int().nonnegative().nullable() })),
  farms: z.array(farmSchema),
  project: positionSchema.extend({ id: z.string(), radius: z.number().int().min(1).max(2), funded: z.boolean(), workDone: z.number().nonnegative(), totalWork: z.number().positive() }).nullable(),
  progression: z.object({ stage: z.enum(["camp", "village", "town", "capital"]), harvests: z.number().int().nonnegative() }),
  stations: z.object({ food: positionSchema, water: positionSchema, workshop: positionSchema, defense: positionSchema }),
  resourceHistory: z.array(stockSchema.extend({ tick: z.number().int().nonnegative() })).max(960),
});

export const matchStateSchema = z.object({
  terrain:terrainSchema,
  width: z.number().int().positive(), height: z.number().int().positive(),
  resources: worldStateSchema.shape.resources,
  colonies: z.array(worldStateSchema.omit({ width: true, height: true, resources: true, obstacles: true, terrain:true })).length(2),
});
