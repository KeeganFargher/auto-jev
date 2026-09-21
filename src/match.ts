import { HERO_IDS, type HeroId } from "./heroes.js";
import { WORLD_MODIFIER_IDS } from "./world-modifiers.js";
import { makeCard } from "./army.js";
import { generateCampaign } from "./map.js";
import { nextRandom } from "./resolve.js";
import type { Army, CampaignFaction, CampaignState, Lord } from "./types.js";

/** Five powers on a pentagon, far enough apart that the middle of the map is worth fighting over. */
const FACTIONS = [
  { id: "thornwatch", name: "Thornwatch", color: "#d64d3c", x: 128, y: 30 },
  { id: "greyhaven", name: "Greyhaven", color: "#5b8fd6", x: 218, y: 96 },
  { id: "goldmere", name: "Goldmere", color: "#e0b13a", x: 182, y: 150 },
  { id: "hallowmere", name: "Hallowmere", color: "#7fb464", x: 74, y: 150 },
  { id: "ashkeep", name: "Ashkeep", color: "#a87fd6", x: 38, y: 96 },
];
/** How many provinces the generator aims for; capitals are part of the count. */
const PROVINCE_TARGET = 35;
export const STARTING_GOLD = 500;

/** Creates a fresh campaign: one capital, one Jev and one small army for each of the five powers. */
export function createCampaign(seed: number, number = 1): CampaignState {
  const width = 256, height = 168;
  const state: CampaignState = {
    id: `campaign-${seed}`, number, seed, width, height,
    terrain: { seed, tiles: "" }, ownership: "", provinces: [], factions: [], armies: [],
    turn: 0, phase: "planning", modifier: "age_of_war",
    pendingBattle: null, battles: [],
    status: { state: "running", winnerId: null, reason: "" },
    randomState: (seed ^ 0x9e3779b9) >>> 0, sequence: 0,
    startedAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
  };
  for (let warm = 0; warm < 6; warm++) nextRandom(state);
  state.modifier = WORLD_MODIFIER_IDS[Math.floor(nextRandom(state) * WORLD_MODIFIER_IDS.length)] ?? "age_of_war";
  const map = generateCampaign(seed, width, height, FACTIONS.map((faction) => ({ factionId: faction.id, name: faction.name, x: faction.x, y: faction.y })), state.modifier, PROVINCE_TARGET);
  state.terrain = map.terrain; state.ownership = map.ownership; state.provinces = map.provinces;

  // Each faction is offered a different Jev, so no two runs open the same way.
  const heroes = [...HERO_IDS];
  for (let index = heroes.length - 1; index > 0; index--) {
    const swap = Math.floor(nextRandom(state) * (index + 1));
    const a = heroes[index], b = heroes[swap];
    if (a !== undefined && b !== undefined) { heroes[index] = b; heroes[swap] = a; }
  }
  FACTIONS.forEach((definition, index) => {
    const heroId = heroes[index % heroes.length] as HeroId;
    const lord: Lord = {
      id: `lord-${definition.id}`, heroId, factionId: definition.id,
      level: 1, experience: 0, skills: [], skillPoints: 1, relics: [],
      condition: "ready", unavailableUntil: 0, kills: 0, battlesWon: 0, battlesLost: 0,
      health: 100, maxHealth: 100,
    };
    const faction: CampaignFaction = {
      id: definition.id, name: definition.name, color: definition.color,
      gold: STARTING_GOLD, income: 0, upkeep: 0, eliminated: false, eliminatedAt: null,
      lords: [lord], armies: [`army-${definition.id}`], doctrines: [],
      relations: {}, intel: {}, pendingOrders: [],
      jev: { status: "running", lastError: null }, decisions: [],
      history: [{ turn: 0, text: `${definition.name} marches under ${heroId}` }],
    };
    for (const other of FACTIONS) if (other.id !== definition.id) faction.relations[other.id] = { war: true, tension: 40, truceUntil: 0 };
    state.factions.push(faction);
    const capital = state.provinces.find((province) => province.id === `cap_${definition.id}`);
    const army: Army = {
      id: `army-${definition.id}`, factionId: definition.id, name: `${definition.name} Host`,
      lordId: lord.id, units: [], provinceId: capital?.id ?? "", x: definition.x, y: definition.y,
      movement: 0, maxMovement: 34, route: [],
      order: { kind: "hold", targetProvinceId: null, label: "Holding at the capital", issuedTurn: 0 },
      stance: "march", morale: 80, shattered: false,
    };
    for (const unitId of ["spearmen", "spearmen", "swordsmen", "archers"] as const) army.units.push(makeCard(state, unitId));
    state.armies.push(army);
    if (capital !== undefined) for (const unitId of ["militia", "militia"] as const) capital.garrison.push(makeCard(state, unitId));
  });
  // Neutral provinces still need a garrison, or the first turn is a free land grab.
  for (const province of state.provinces) {
    if (province.ownerId !== null || province.settlement === null) continue;
    const count = province.kind === "chokepoint" || province.kind === "fort" ? 3 : province.kind === "wilds" ? 1 : 2;
    for (let index = 0; index < count; index++) province.garrison.push(makeCard(state, province.kind === "wilds" ? "militia" : "spearmen"));
  }
  return state;
}
