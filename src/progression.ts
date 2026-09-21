import type { HeroId } from "./heroes.js";
import { doctrineDefinition, isDoctrineId } from "./doctrines.js";
import type { CampaignFaction, CampaignState, Lord } from "./types.js";

/** Every way a build can bend the rules. Skills, relics and doctrines all fold into one bag. */
export interface Modifiers {
  movement: number; recruitCost: number; income: number; lordPower: number;
  armyStrength: number; garrison: number; replenish: number; charge: number; upkeep: number;
}
export const NEUTRAL: Modifiers = { movement: 1, recruitCost: 1, income: 1, lordPower: 1, armyStrength: 1, garrison: 1, replenish: 1, charge: 1, upkeep: 1 };

export interface SkillNode {
  id: string; name: string; level: number; branch: string;
  effect: Partial<Modifiers>; text: string;
}
const node = (id: string, name: string, level: number, branch: string, effect: Partial<Modifiers>, text: string): SkillNode => ({ id, name, level, branch, effect, text });

/**
 * Two branches per Jev, opening at the same levels, so the same hero develops differently every run
 * and the spectator can read the build from the choices.
 */
export const SKILL_TREES: Record<HeroId, SkillNode[]> = {
  veyra: [
    node("veyra_arc", "Widening Arc", 2, "storm", { lordPower: 1.2 }, "Her lightning jumps further and hits harder."),
    node("veyra_squall", "Squall Line", 2, "tempest", { movement: 1.25 }, "Storms carry her armies along; they march faster."),
    node("veyra_overcharge", "Overcharge", 4, "storm", { lordPower: 1.35, armyStrength: 1.05 }, "Every bolt overloads. Veyra becomes a battlefield in herself."),
    node("veyra_front", "Storm Front", 4, "tempest", { charge: 1.4, movement: 1.15 }, "Cavalry ride the wind in; charges land much harder."),
    node("veyra_tempest", "Tempest", 7, "storm", { lordPower: 1.6 }, "The ultimate: a standing storm over the enemy line."),
    node("veyra_unbound", "Unbound", 7, "tempest", { movement: 1.4, armyStrength: 1.12 }, "Her host moves like weather and hits like it too."),
  ],
  thorn: [
    node("thorn_bark", "Living Bark", 2, "root", { lordPower: 1.15, replenish: 1.3 }, "He mends, and so does everything near him."),
    node("thorn_stone", "Stonebound", 2, "bastion", { garrison: 1.35 }, "His provinces hold far larger garrisons."),
    node("thorn_wall", "Rootwall", 4, "root", { armyStrength: 1.15, replenish: 1.35 }, "Roots close the line; the army grinds forward and heals."),
    node("thorn_citadel", "Seed Bastion", 4, "bastion", { garrison: 1.6, income: 1.1 }, "Settlements become fortresses that pay for themselves."),
    node("thorn_awaken", "Awaken the Earth", 7, "root", { lordPower: 1.5, armyStrength: 1.2 }, "The ultimate: the ground itself joins the battle."),
    node("thorn_eternal", "The Ancient", 7, "bastion", { garrison: 2, replenish: 1.5 }, "Taking his land becomes a siege every time."),
  ],
  kael: [
    node("kael_lust", "Bloodlust", 2, "hunt", { lordPower: 1.25 }, "Each kill makes the next one faster."),
    node("kael_pack", "Pack Tactics", 2, "war", { charge: 1.35 }, "His riders hit like a hammer."),
    node("kael_exec", "Execution", 4, "hunt", { lordPower: 1.45 }, "He finishes wounded enemies outright."),
    node("kael_levy", "Blood Price", 4, "war", { recruitCost: 0.7, upkeep: 0.85 }, "War pays for war; his armies cost far less."),
    node("kael_mist", "Red Mist", 7, "hunt", { lordPower: 1.7, armyStrength: 1.15 }, "The ultimate: nothing near him survives long."),
    node("kael_horde", "The Horde", 7, "war", { recruitCost: 0.55, armyStrength: 1.1 }, "Cheap, endless, and coming for you."),
  ],
  elowen: [
    node("elowen_line", "Lifeline", 2, "life", { replenish: 1.45 }, "Her wounded come back."),
    node("elowen_ward", "Warding", 2, "grace", { armyStrength: 1.12 }, "Her presence steadies the whole line."),
    node("elowen_renew", "Renewal", 4, "life", { replenish: 1.8, garrison: 1.15 }, "Armies rebuild between battles at remarkable speed."),
    node("elowen_grace", "Second Breath", 4, "grace", { armyStrength: 1.22, lordPower: 1.15 }, "Broken units rally instead of routing."),
    node("elowen_rebirth", "Rebirth Seed", 7, "life", { replenish: 2.2, armyStrength: 1.1 }, "The ultimate: her armies refuse to stay dead."),
    node("elowen_radiance", "Radiance", 7, "grace", { armyStrength: 1.35 }, "An army that simply will not break."),
  ],
  nyx: [
    node("nyx_veil", "Veil", 2, "shadow", { movement: 1.3 }, "Her armies move unseen and unusually fast."),
    node("nyx_step", "Shadowstep", 2, "guile", { charge: 1.3, lordPower: 1.15 }, "She is already behind you."),
    node("nyx_black", "Blackout", 4, "shadow", { movement: 1.5 }, "Nobody sees her host coming until it arrives."),
    node("nyx_coin", "Cutpurse", 4, "guile", { income: 1.3, recruitCost: 0.8 }, "What she takes, she keeps."),
    node("nyx_fold", "Fold the World", 7, "shadow", { movement: 1.9 }, "The ultimate: distance stops mattering."),
    node("nyx_mirror", "Mirror Court", 7, "guile", { income: 1.5, armyStrength: 1.15 }, "Wealth and deception in equal measure."),
  ],
  orun: [
    node("orun_master", "Masterwork", 2, "forge", { armyStrength: 1.15 }, "His soldiers carry better steel than anyone's."),
    node("orun_temper", "Temper", 2, "anvil", { recruitCost: 0.78 }, "He arms an army for the price of a warband."),
    node("orun_ward", "Warforge", 4, "forge", { armyStrength: 1.3 }, "Ordinary troops fight like veterans."),
    node("orun_industry", "Industry", 4, "anvil", { income: 1.35, recruitCost: 0.85 }, "Every holding becomes a workshop."),
    node("orun_arsenal", "Living Arsenal", 7, "forge", { armyStrength: 1.5, lordPower: 1.2 }, "The ultimate: his host is simply better equipped than yours."),
    node("orun_empire", "The Great Foundry", 7, "anvil", { income: 1.7, recruitCost: 0.65 }, "An economy that can replace any loss."),
  ],
};

export interface Relic { id: string; name: string; text: string; effect: Partial<Modifiers>; from: HeroId | null }
const relic = (id: string, name: string, from: HeroId | null, effect: Partial<Modifiers>, text: string): Relic => ({ id, name, from, effect, text });
/** Relics come off dead Jevs and out of shrines; they are how builds cross over between factions. */
export const RELICS: Relic[] = [
  relic("storm_core", "Storm Core", "veyra", { lordPower: 1.3, charge: 1.2 }, "Lightning chains further for whoever carries it."),
  relic("heartwood", "Heartwood", "thorn", { garrison: 1.4, replenish: 1.3 }, "The land around it will not yield."),
  relic("blood_crown", "Blood Crown", "kael", { movement: 1.25, armyStrength: 1.15 }, "Kills feed the army's appetite for more."),
  relic("lifebloom", "Lifebloom", "elowen", { replenish: 1.7 }, "Wounds close overnight."),
  relic("mirror_shard", "Mirror Shard", "nyx", { movement: 1.35, income: 1.15 }, "Nothing about its bearer is quite where it seems."),
  relic("great_hammer", "Ancient Hammer", "orun", { armyStrength: 1.25 }, "Forged for breaking walls and the men behind them."),
  relic("gold_seal", "Seal of Plenty", null, { income: 1.4 }, "Every holding renders more than it should."),
  relic("iron_standard", "Iron Standard", null, { armyStrength: 1.2, upkeep: 0.85 }, "Men follow it further, and for less."),
  relic("swift_banner", "Swift Banner", null, { movement: 1.45 }, "The host marches before the enemy has finished planning."),
  relic("dread_helm", "Dread Helm", null, { lordPower: 1.4 }, "Its wearer is not entirely a person any more."),
];
const RELIC_BY_ID = new Map(RELICS.map((entry) => [entry.id, entry]));
export function relicById(id: string): Relic | undefined { return RELIC_BY_ID.get(id); }
export function skillById(heroId: HeroId, id: string): SkillNode | undefined { return SKILL_TREES[heroId].find((entry) => entry.id === id); }

/** Skill nodes a lord may take right now: right level, and not already taken. */
export function availableSkills(lord: Lord): SkillNode[] {
  return SKILL_TREES[lord.heroId].filter((entry) => entry.level <= lord.level && !lord.skills.includes(entry.id));
}
/** Folds a lord's skills and relics, plus the faction's doctrines, into one multiplier bag. */
export function modifiersFor(faction: CampaignFaction, lord: Lord | undefined): Modifiers {
  const bag: Modifiers = { ...NEUTRAL };
  const apply = (effect: Partial<Modifiers>): void => {
    for (const [key, value] of Object.entries(effect)) {
      if (value === undefined) continue;
      bag[key as keyof Modifiers] *= value;
    }
  };
  if (lord !== undefined) {
    for (const id of lord.skills) { const skill = skillById(lord.heroId, id); if (skill !== undefined) apply(skill.effect); }
    for (const id of lord.relics) { const found = relicById(id); if (found !== undefined) apply(found.effect); }
    // "__looted" is a bookkeeping marker for a plundered corpse, not a relic; relicById ignores it.
  }
  // Doctrines belong to the faction, not the Jev, and every stack applies again.
  for (const held of faction.doctrines) {
    if (!isDoctrineId(held.id)) continue;
    const { modifiers } = doctrineDefinition(held.id);
    for (let stack = 0; stack < Math.max(1, held.stacks); stack++) apply(modifiers);
  }
  return bag;
}
/** A relic the faction does not already hold, for a shrine claim or a dead Jev's remains. */
export function freeRelic(state: CampaignState, preferred: HeroId | null): Relic | undefined {
  const held = new Set(state.factions.flatMap((faction) => faction.lords.flatMap((lord) => lord.relics)));
  return RELICS.find((entry) => entry.from === preferred && !held.has(entry.id)) ?? RELICS.find((entry) => !held.has(entry.id));
}
