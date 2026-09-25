import type { AbilityDefinitionId, HeroDefinitionId } from "../ids.js";
import {
  ABILITY_SKILL,
  BASIC_ATTACK_ABILITY,
  SKILL_SLOTS,
  ULTIMATE_SKILL,
  type AbilityDefinition,
  type AreaDefinition,
  type Catalogue,
  type EffectDefinition,
  type FormDefinition,
  type GemDefinition,
  type HeroDefinition,
  type PassiveDefinition,
  type School,
  type SkillSlot,
  type StacksPatch,
  type StatModifier,
  type StatModifierTarget,
  type TriggerEvent,
  type UpgradeDefinition,
  type ZoneDefinition,
} from "../definitions.js";
import { trainedSocketCount, type HeroBuild } from "./state.js";
import { carriedShot, gemWorksOn, gemWorksOnShot } from "./gem-fit.js";
import { DEFAULT_TICK_LIMIT } from "../constants.js";

export const DEFAULT_CRIT_MULTIPLIER = 1.75;

export const DEFAULT_MANA_PER_ATTACK = 15;

export const MAX_ARMOR = 0.8;

export const MAX_SLOW_FRACTION = 0.9;

export const MAX_BIND_FRACTION = 0.9;

export const BASE_GEM_SOCKETS = 1;

export interface CompiledTrigger {
  key: string;
  on: TriggerEvent;
  rechargeTicks: number;
  fraction: number;
  hpLossFraction: number;
  atTick: number;
  every: number;
}

export interface ArmedGem {
  id: string;
  gem: GemDefinition;
}

export interface SummonArming {
  passives: readonly PassiveDefinition[];
  gems: readonly ArmedGem[];
}

const NO_ARMING: SummonArming = { passives: [], gems: [] };

export interface CompiledGems {
  chain: { extraTargets: number; fraction: number; rangeUnits: number } | null;
  fork: { branches: number; fraction: number; rangeUnits: number } | null;
  multistrike: { repeats: number; delayTicks: number; fraction: number } | null;
  multicast: { delayTicks: number; fraction: number } | null;
  triggers: CompiledTrigger[];
  leech: number;
  resonance: boolean;
  overchargeHpCost: number;
  barrage: { extraProjectiles: number; fraction: number } | null;
  pierceWidthUnits: number;
  vortex: { pullUnits: number; reachMultiplier: number } | null;
  ruthless: { every: number; damageMultiplier: number; stunTicks: number } | null;
  cullThreshold: number;
  carried: ArmedGem[];
}

export interface CompiledAbility extends AbilityDefinition {
  slot: SkillSlot | "basic" | null;
  gems: CompiledGems;
}

export interface CompiledUnitStats {
  heroId: HeroDefinitionId;
  maxHp: number;
  moveSpeedUnitsPerSecond: number;
  abilityCooldownDurations: Record<AbilityDefinitionId, number>;
  school: School | null;
  armor: number;
  critChance: number;
  critMultiplier: number;
  damageMultiplier: number;
  attackDamageMultiplier: number;
  spellDamageMultiplier: number;
  lifesteal: number;
  slowStrengthBonus: number;
  conditionDurationBonusTicks: number;
  maxMana: number;
  manaPerAttack: number;
  basicAttackId: AbilityDefinitionId;
  abilityId: AbilityDefinitionId | null;
  ultimateId: AbilityDefinitionId | null;
  abilities: Record<AbilityDefinitionId, CompiledAbility>;
  passives: PassiveDefinition[];
  gemSockets: Record<SkillSlot, number>;
}

interface PieceSelection {
  upgrade: UpgradeDefinition;
  stacks: number;
  slot: SkillSlot | null;
}

interface ModifierSums {
  flat: Map<string, number>;
  percent: Map<string, number>;
}

function statModifierKey(target: StatModifierTarget): string {
  switch (target.kind) {
    case "ability-mana-cost":
    case "ability-damage":
    case "ability-healing":
    case "ability-area":
    case "ability-cooldown":
    case "zone-duration":
      return `${target.kind}:${target.abilityId}`;

    case "max-hp":
    case "basic-attack-cooldown":
    case "armor":
    case "crit-chance":
    case "crit-multiplier":
    case "damage":
    case "attack-damage":
    case "spell-damage":
    case "dash-reach":
    case "move-speed":
    case "mana-per-attack":
    case "slow-strength":
    case "condition-duration":
    case "lifesteal":
      return target.kind;

    default: {
      const exhaustive: never = target;

      return exhaustive;
    }
  }
}

function addToSum(sums: Map<string, number>, key: string, amount: number): void {
  sums.set(key, (sums.get(key) ?? 0) + amount);
}

function collectPieces(build: HeroBuild, catalogue: Catalogue): PieceSelection[] {
  const pieces: PieceSelection[] = [];

  for (const selection of build.upgrades) {
    const upgrade = catalogue.upgrades[selection.upgradeId];

    if (upgrade === undefined) {
      throw new Error(`build "${build.buildId}" references unknown upgrade "${selection.upgradeId}"`);
    }

    pieces.push({ upgrade, stacks: selection.stacks, slot: null });
  }

  for (const itemId of build.itemIds ?? []) {
    const upgrade = catalogue.upgrades[itemId];

    if (upgrade === undefined) {
      throw new Error(`build "${build.buildId}" equips unknown item "${itemId}"`);
    }

    pieces.push({ upgrade, stacks: 1, slot: null });
  }

  for (const equipped of build.gems ?? []) {
    const upgrade = catalogue.upgrades[equipped.gemId];

    if (upgrade === undefined) {
      throw new Error(`build "${build.buildId}" sockets unknown gem "${equipped.gemId}"`);
    }

    pieces.push({ upgrade, stacks: 1, slot: equipped.slot });
  }

  return pieces;
}

function applyModifiers(modifiers: readonly StatModifier[], stacks: number, flat: Map<string, number>, percent: Map<string, number>): void {
  for (const modifier of modifiers) {
    const key = statModifierKey(modifier.target);
    const total = modifier.value * stacks;

    if (modifier.kind === "flat") {
      addToSum(flat, key, total);
    } else {
      addToSum(percent, key, total);
    }
  }
}

function collectModifierSums(pieces: readonly PieceSelection[]): ModifierSums {
  const flat = new Map<string, number>();
  const percent = new Map<string, number>();

  for (const piece of pieces) {
    applyModifiers(piece.upgrade.statModifiers, piece.stacks, flat, percent);
  }

  return { flat, percent };
}

function compileStat(sums: ModifierSums, key: string, base: number): number {
  const flatSum = sums.flat.get(key) ?? 0;
  const percentSum = sums.percent.get(key) ?? 0;

  return (base + flatSum) * (1 + percentSum);
}

function compileKeyedStat(sums: ModifierSums, keys: readonly string[], base: number): number {
  let flatSum = 0;
  let percentSum = 0;

  for (const key of keys) {
    flatSum += sums.flat.get(key) ?? 0;
    percentSum += sums.percent.get(key) ?? 0;
  }

  return (base + flatSum) * (1 + percentSum);
}

function hasModifier(sums: ModifierSums, keys: readonly string[]): boolean {
  return keys.some((key) => sums.flat.has(key) || sums.percent.has(key));
}

export function skillIdFor(hero: HeroDefinition, slot: SkillSlot): AbilityDefinitionId | null {
  return (slot === "ability" ? hero.abilityId : hero.ultimateId) ?? null;
}

export function skillSlotOf(hero: HeroDefinition, abilityId: AbilityDefinitionId): SkillSlot | "basic" | null {
  if (abilityId === hero.basicAttackId) {
    return "basic";
  }

  if (abilityId === hero.abilityId) {
    return "ability";
  }

  return abilityId === hero.ultimateId ? "ultimate" : null;
}

function resolveAbilityToken(token: AbilityDefinitionId, hero: HeroDefinition): AbilityDefinitionId | null {
  if (token === BASIC_ATTACK_ABILITY) {
    return hero.basicAttackId;
  }

  if (token === ULTIMATE_SKILL) {
    return hero.ultimateId ?? null;
  }

  if (token === ABILITY_SKILL) {
    return hero.abilityId ?? null;
  }

  return token;
}

function abilityKeys(kind: string, abilityId: AbilityDefinitionId, hero: HeroDefinition): string[] {
  const keys = [`${kind}:${abilityId}`];

  if (abilityId === hero.basicAttackId) {
    keys.push(`${kind}:${BASIC_ATTACK_ABILITY}`);
  }

  if (abilityId === hero.ultimateId) {
    keys.push(`${kind}:${ULTIMATE_SKILL}`);
  }

  if (abilityId === hero.abilityId) {
    keys.push(`${kind}:${ABILITY_SKILL}`);
  }

  return keys;
}

export function emptyGems(): CompiledGems {
  return {
    chain: null,
    fork: null,
    multistrike: null,
    multicast: null,
    triggers: [],
    leech: 0,
    resonance: false,
    overchargeHpCost: 0,
    barrage: null,
    pierceWidthUnits: 0,
    vortex: null,
    ruthless: null,
    cullThreshold: 0,
    carried: [],
  };
}

function scaleEffect(effect: EffectDefinition, multiplier: number): EffectDefinition {
  if (effect.kind === "strike") {
    return { kind: "strike", scale: effect.scale * multiplier };
  }

  if (effect.kind !== "damage") {
    return effect;
  }

  const amount = Math.max(1, Math.round(effect.amount * multiplier));
  const scaled: EffectDefinition = { kind: "damage", amount };

  if (effect.maxAmount !== undefined) {
    scaled.maxAmount = Math.max(amount, Math.round(effect.maxAmount * multiplier));
  }

  if (effect.casterMaxHpFraction !== undefined) {
    scaled.casterMaxHpFraction = effect.casterMaxHpFraction * multiplier;
  }

  if (effect.consumedMaxHpFraction !== undefined) {
    scaled.consumedMaxHpFraction = effect.consumedMaxHpFraction * multiplier;
  }

  return scaled;
}

function scaleArea(area: AreaDefinition, multiplier: number): AreaDefinition {
  if (area.kind === "circle") {
    return { ...area, radiusUnits: area.radiusUnits * multiplier };
  }

  return { ...area, widthUnits: area.widthUnits * multiplier };
}

function scaleEffects(effects: readonly EffectDefinition[], multiplier: number): EffectDefinition[] {
  return effects.map((effect) => scaleEffect(effect, multiplier));
}

function applyAbilityChanges(abilities: Record<AbilityDefinitionId, CompiledAbility>, pieces: readonly PieceSelection[], hero: HeroDefinition): void {
  for (const piece of pieces) {
    for (const change of piece.upgrade.abilityChanges ?? []) {
      const abilityId = resolveAbilityToken(change.abilityId, hero);
      const ability = abilityId === null ? undefined : abilities[abilityId];

      if (ability === undefined) {
        continue;
      }

      if (change.addEffects !== undefined) {
        ability.effects.push(...structuredClone(change.addEffects));
      }

      if (change.setArea !== undefined) {
        ability.area = structuredClone(change.setArea);
      }

      if (change.setSecondary !== undefined) {
        ability.secondary = structuredClone(change.setSecondary);
      }

      if (change.setZone !== undefined) {
        ability.zone = structuredClone(change.setZone);
      }

      if (change.setEffects !== undefined) {
        ability.effects = structuredClone(change.setEffects);
      }

      if (change.setMaxTargets !== undefined) {
        ability.maxTargets = change.setMaxTargets;
      }

      if (ability.channel !== undefined && change.patchChannel !== undefined) {
        ability.channel = { ...ability.channel, ...structuredClone(change.patchChannel) };
      }

      if (ability.dash !== undefined && change.patchDash !== undefined) {
        ability.dash = { ...ability.dash, ...structuredClone(change.patchDash) };
      }

      if (ability.dash !== undefined && change.addHops !== undefined) {
        ability.dash = { ...ability.dash, hops: ability.dash.hops + change.addHops };
      }

      if (change.setBounces !== undefined) {
        ability.bounces = structuredClone(change.setBounces);
      }

      if (ability.bounces !== undefined && change.patchBounces !== undefined) {
        ability.bounces = { ...ability.bounces, ...structuredClone(change.patchBounces) };
      }

      if (ability.bounces !== undefined && change.addBounces !== undefined) {
        ability.bounces = { ...ability.bounces, count: ability.bounces.count + change.addBounces };
      }

      if (change.setHpCostFraction !== undefined) {
        ability.hpCostFraction = change.setHpCostFraction;
      }

      if (change.setForm !== undefined) {
        ability.form = structuredClone(change.setForm);
      }

      const bindPatch = change.patchBind;

      if (bindPatch !== undefined) {
        ability.effects = ability.effects.map((effect) => (effect.kind === "bind" ? { ...effect, ...bindPatch } : effect));
      }

      if (ability.form !== undefined && change.patchForm !== undefined) {
        ability.form = { ...ability.form, ...structuredClone(change.patchForm) };
      }

      if (ability.shower !== undefined && change.patchShower !== undefined) {
        ability.shower = { ...ability.shower, ...structuredClone(change.patchShower) };
      }

      if (change.setSplits !== undefined) {
        ability.splits = structuredClone(change.setSplits);
      }

      if (change.setBomb !== undefined) {
        ability.bomb = structuredClone(change.setBomb);
      }

      if (change.setEmitter !== undefined) {
        ability.emitter = structuredClone(change.setEmitter);
      }

      if (ability.emitter !== undefined && change.patchEmitter !== undefined) {
        ability.emitter = { ...ability.emitter, ...structuredClone(change.patchEmitter) };
      }
    }
  }
}

function scaleHealing(effects: readonly EffectDefinition[], multiplier: number): EffectDefinition[] {
  return effects.map((effect) => (effect.kind === "heal" ? { ...effect, amount: Math.round(effect.amount * multiplier) } : effect));
}

function applyAbilityModifiers(ability: CompiledAbility, sums: ModifierSums, hero: HeroDefinition): void {
  const damageKeys = abilityKeys("ability-damage", ability.id, hero);

  if (hasModifier(sums, damageKeys)) {
    const multiplier = compileKeyedStat(sums, damageKeys, 1);
    ability.effects = scaleEffects(ability.effects, multiplier);

    if (ability.secondary !== undefined) {
      ability.secondary = { ...ability.secondary, effects: scaleEffects(ability.secondary.effects, multiplier) };
    }

    if (ability.zone !== undefined) {
      ability.zone = { ...ability.zone, effects: scaleEffects(ability.zone.effects, multiplier) };
    }

    if (ability.channel !== undefined) {
      ability.channel = { ...ability.channel, effects: scaleEffects(ability.channel.effects, multiplier) };
    }
  }

  const healingKeys = abilityKeys("ability-healing", ability.id, hero);

  if (hasModifier(sums, healingKeys)) {
    const multiplier = compileKeyedStat(sums, healingKeys, 1);
    ability.effects = scaleHealing(ability.effects, multiplier);

    if (ability.allyEffects !== undefined) {
      ability.allyEffects = scaleHealing(ability.allyEffects, multiplier);
    }

    if (ability.zone?.allyEffects !== undefined) {
      ability.zone = { ...ability.zone, allyEffects: scaleHealing(ability.zone.allyEffects, multiplier) };
    }

    if (ability.bounces?.allyEffects !== undefined) {
      ability.bounces = { ...ability.bounces, allyEffects: scaleHealing(ability.bounces.allyEffects, multiplier) };
    }
  }

  const costKeys = abilityKeys("ability-mana-cost", ability.id, hero);

  if (ability.manaCost !== undefined && hasModifier(sums, costKeys)) {
    ability.manaCost = Math.max(1, Math.round(compileKeyedStat(sums, costKeys, ability.manaCost)));
  }

  const cooldownKeys = abilityKeys("ability-cooldown", ability.id, hero);

  if (hasModifier(sums, cooldownKeys)) {
    ability.cooldownTicks = Math.max(1, Math.round(compileKeyedStat(sums, cooldownKeys, ability.cooldownTicks)));
  }

  const areaKeys = abilityKeys("ability-area", ability.id, hero);

  if (hasModifier(sums, areaKeys)) {
    const multiplier = compileKeyedStat(sums, areaKeys, 1);

    if (ability.area !== undefined) {
      ability.area = scaleArea(ability.area, multiplier);
    }

    if (ability.zone !== undefined) {
      ability.zone = { ...ability.zone, radiusUnits: ability.zone.radiusUnits * multiplier };
    }

    if (ability.channel !== undefined) {
      ability.channel = { ...ability.channel, radiusUnits: ability.channel.radiusUnits * multiplier };
    }
  }

  const zoneKeys = abilityKeys("zone-duration", ability.id, hero);

  if (ability.zone !== undefined && hasModifier(sums, zoneKeys)) {
    ability.zone = {
      ...ability.zone,
      durationTicks: Math.max(1, Math.round(compileKeyedStat(sums, zoneKeys, ability.zone.durationTicks))),
    };
  }

  const reach = compileStat(sums, "dash-reach", 0);

  if (ability.dash !== undefined && reach > 0) {
    ability.range += reach;

    if (ability.dash.hopRangeUnits > 0) {
      ability.dash = { ...ability.dash, hopRangeUnits: ability.dash.hopRangeUnits + reach };
    }
  }
}

function triggerFor(abilityId: AbilityDefinitionId, gemId: string, gem: Extract<GemDefinition, { kind: "trigger" }>): CompiledTrigger {
  return {
    key: `${abilityId}:${gemId}`,
    on: gem.on,
    rechargeTicks: gem.rechargeTicks,
    fraction: gem.fraction,
    hpLossFraction: gem.hpLossFraction ?? 0,
    atTick: gem.atTick ?? 0,
    every: gem.every ?? 0,
  };
}

function applyGem(ability: CompiledAbility, gemId: string, gem: GemDefinition): void {
  switch (gem.kind) {
    case "chain":
      if (ability.tags.includes("link")) {
        ability.maxTargets = (ability.maxTargets ?? 1) + gem.extraTargets;
      } else if (ability.bounces !== undefined) {
        const pairs = ability.bounces.allyEffects === undefined ? gem.extraTargets : Math.ceil(gem.extraTargets / 2);
        ability.bounces = { ...ability.bounces, count: ability.bounces.count + pairs };
      } else {
        ability.gems.chain = {
          extraTargets: (ability.gems.chain?.extraTargets ?? 0) + gem.extraTargets,
          fraction: gem.fraction,
          rangeUnits: gem.rangeUnits,
        };
      }

      break;

    case "fork":
      ability.gems.fork = { branches: gem.branches, fraction: gem.fraction, rangeUnits: gem.rangeUnits };
      break;

    case "widen":
      if (ability.area !== undefined) {
        ability.area = scaleArea(ability.area, gem.radiusMultiplier);
      }

      if (ability.zone !== undefined) {
        ability.zone = { ...ability.zone, radiusUnits: ability.zone.radiusUnits * gem.radiusMultiplier };
      }

      if (ability.channel !== undefined) {
        ability.channel = { ...ability.channel, radiusUnits: ability.channel.radiusUnits * gem.radiusMultiplier };
      }

      if (ability.dash?.splashRadiusUnits !== undefined) {
        ability.dash = { ...ability.dash, splashRadiusUnits: ability.dash.splashRadiusUnits * gem.radiusMultiplier };
      }

      break;

    case "linger":
      applyLinger(ability, gem);
      break;

    case "multistrike":
      ability.gems.multistrike = { repeats: gem.repeats, delayTicks: gem.delayTicks, fraction: gem.fraction };
      break;

    case "multicast":
      ability.gems.multicast = { delayTicks: gem.delayTicks, fraction: gem.fraction };
      break;

    case "trigger":
      ability.gems.triggers.push(triggerFor(ability.id, gemId, gem));
      break;

    case "primer":
      ability.effects.push({ kind: "apply-condition", condition: gem.condition });
      break;

    case "leech":
      ability.gems.leech += gem.fraction;
      break;

    case "resonance":
      ability.gems.resonance = true;
      break;

    case "split":
      ability.effects = scaleSummons(ability.effects, gem.strength, gem.extraSummons);
      break;

    case "empower":
      ability.effects = scaleSummons(ability.effects, gem.strength, 0);
      break;

    case "haste":
      if (ability.manaCost !== undefined) {
        ability.manaCost = Math.max(1, Math.round(ability.manaCost * gem.multiplier));
      } else {
        ability.cooldownTicks = Math.max(1, Math.round(ability.cooldownTicks * gem.multiplier));
      }

      break;

    case "overcharge":
      applyOvercharge(ability, gem.effectMultiplier);
      ability.gems.overchargeHpCost += gem.hpCostFraction;
      break;

    case "barrage":
      ability.gems.barrage = {
        extraProjectiles: (ability.gems.barrage?.extraProjectiles ?? 0) + gem.extraProjectiles,
        fraction: gem.fraction,
      };
      break;

    case "pierce":
      ability.gems.pierceWidthUnits = Math.max(ability.gems.pierceWidthUnits, gem.widthUnits);
      break;

    case "concentrate":
      if (ability.area !== undefined) {
        ability.area = scaleArea(ability.area, gem.radiusMultiplier);
      }

      ability.effects = scaleEffects(ability.effects, gem.damageMultiplier);
      break;

    case "vortex":
      ability.gems.vortex = { pullUnits: gem.pullUnits, reachMultiplier: gem.reachMultiplier };

      if (ability.channel !== undefined && ability.channel.pull === undefined) {
        ability.channel = { ...ability.channel, pull: { radiusUnits: ability.channel.radiusUnits * gem.reachMultiplier, distanceUnits: gem.pullUnits } };
      }

      break;

    case "ruthless":
      ability.gems.ruthless = { every: gem.every, damageMultiplier: gem.damageMultiplier, stunTicks: gem.stunTicks };
      break;

    case "culling":
      ability.gems.cullThreshold = Math.max(ability.gems.cullThreshold, gem.threshold);
      break;

    default: {
      const exhaustive: never = gem;

      void exhaustive;
    }
  }
}

function scaleSummons(effects: readonly EffectDefinition[], strength: number, extraSummons: number): EffectDefinition[] {
  return effects.map((effect) => {
    if (effect.kind === "raise-army") {
      return { ...effect, thralls: effect.thralls + extraSummons, strength: effect.strength * strength, thrallScale: effect.thrallScale * strength };
    }

    if (effect.kind !== "summon") {
      return effect;
    }

    const scaled: Extract<EffectDefinition, { kind: "summon" }> = {
      ...effect,
      count: effect.count + extraSummons,
      hpScale: (effect.hpScale ?? 1) * strength,
      damageScale: (effect.damageScale ?? 1) * strength,
    };

    if (effect.maxActive !== undefined) {
      scaled.maxActive = effect.maxActive + extraSummons;
    }

    return scaled;
  });
}

function lingeringEffects(effects: readonly EffectDefinition[], fraction: number, kind: "damage" | "heal"): EffectDefinition[] {
  return effects.flatMap((effect): EffectDefinition[] => {
    if ((effect.kind === "damage" || effect.kind === "strike") && kind === "damage") {
      return [scaleEffect(effect, fraction)];
    }

    if (effect.kind === "heal" && kind === "heal") {
      return [{ kind: "heal", amount: Math.max(1, Math.round(effect.amount * fraction)) }];
    }

    return [];
  });
}

function applyLinger(ability: CompiledAbility, gem: Extract<GemDefinition, { kind: "linger" }>): void {
  if (ability.zone !== undefined) {
    ability.zone = { ...ability.zone, durationTicks: ability.zone.durationTicks + gem.durationTicks };

    return;
  }

  if (ability.channel !== undefined) {
    ability.channel = { ...ability.channel, durationTicks: ability.channel.durationTicks + gem.channelTicks };

    return;
  }

  if (ability.area?.kind !== "circle") {
    return;
  }

  const zone: ZoneDefinition = {
    radiusUnits: ability.area.radiusUnits,
    durationTicks: gem.durationTicks,
    periodTicks: gem.periodTicks,
    effects: lingeringEffects(ability.effects, gem.fraction, "damage"),
  };

  const heals = lingeringEffects(ability.allyEffects ?? [], gem.fraction, "heal");

  if (heals.length > 0) {
    zone.allyEffects = heals;
  }

  ability.zone = zone;
}

function overchargeEffect(effect: EffectDefinition, multiplier: number): EffectDefinition {
  switch (effect.kind) {
    case "damage":
    case "strike":
      return scaleEffect(effect, multiplier);

    case "heal": {
      const healed: Extract<EffectDefinition, { kind: "heal" }> = { kind: "heal", amount: Math.round(effect.amount * multiplier) };

      if (effect.maxHpFraction !== undefined) {
        healed.maxHpFraction = effect.maxHpFraction * multiplier;
      }

      return healed;
    }

    case "shield": {
      const shielded: Extract<EffectDefinition, { kind: "shield" }> = {
        kind: "shield",
        amount: Math.round(effect.amount * multiplier),
        durationTicks: effect.durationTicks,
      };

      if (effect.maxHpFraction !== undefined) {
        shielded.maxHpFraction = effect.maxHpFraction * multiplier;
      }

      if (effect.casterMaxHpFraction !== undefined) {
        shielded.casterMaxHpFraction = effect.casterMaxHpFraction * multiplier;
      }

      return shielded;
    }

    case "bind":
      return { ...effect, fraction: Math.min(MAX_BIND_FRACTION, effect.fraction * multiplier) };

    case "summon":
      return { ...effect, hpScale: (effect.hpScale ?? 1) * multiplier, damageScale: (effect.damageScale ?? 1) * multiplier };

    case "raise-army":
      return { ...effect, strength: effect.strength * multiplier, thrallScale: effect.thrallScale * multiplier };

    default:
      return effect;
  }
}

function overchargeEffects(effects: readonly EffectDefinition[], multiplier: number): EffectDefinition[] {
  return effects.map((effect) => overchargeEffect(effect, multiplier));
}

function applyOvercharge(ability: CompiledAbility, multiplier: number): void {
  ability.effects = overchargeEffects(ability.effects, multiplier);

  if (ability.allyEffects !== undefined) {
    ability.allyEffects = overchargeEffects(ability.allyEffects, multiplier);
  }

  if (ability.secondary !== undefined) {
    ability.secondary = { ...ability.secondary, effects: overchargeEffects(ability.secondary.effects, multiplier) };
  }

  if (ability.zone !== undefined) {
    const zone: ZoneDefinition = { ...ability.zone, effects: overchargeEffects(ability.zone.effects, multiplier) };

    if (ability.zone.allyEffects !== undefined) {
      zone.allyEffects = overchargeEffects(ability.zone.allyEffects, multiplier);
    }

    ability.zone = zone;
  }

  if (ability.channel !== undefined) {
    ability.channel = { ...ability.channel, effects: overchargeEffects(ability.channel.effects, multiplier) };
  }

  if (ability.bounces?.allyEffects !== undefined) {
    ability.bounces = { ...ability.bounces, allyEffects: overchargeEffects(ability.bounces.allyEffects, multiplier) };
  }

  if (ability.dash?.finalEffects !== undefined) {
    ability.dash = { ...ability.dash, finalEffects: overchargeEffects(ability.dash.finalEffects, multiplier) };
  }

  if (ability.casterShieldPerTarget !== undefined) {
    ability.casterShieldPerTarget = {
      ...ability.casterShieldPerTarget,
      maxHpFraction: ability.casterShieldPerTarget.maxHpFraction * multiplier,
    };
  }
}

function passiveIdentity(passive: PassiveDefinition): string {
  if (
    passive.kind === "every-nth-attack" ||
    passive.kind === "first-hit-per-enemy" ||
    passive.kind === "empower-summons" ||
    passive.kind === "stacks"
  ) {
    return `${passive.kind}:${passive.key}`;
  }

  return passive.kind;
}

function compilePassives(hero: HeroDefinition, pieces: readonly PieceSelection[], arming: SummonArming): PassiveDefinition[] {
  const passives = structuredClone(hero.passives ?? []);

  for (const piece of pieces) {
    for (const granted of piece.upgrade.grantsPassives ?? []) {
      const identity = passiveIdentity(granted);
      const existingIndex = passives.findIndex((passive) => passiveIdentity(passive) === identity);

      if (existingIndex >= 0) {
        passives[existingIndex] = structuredClone(granted);
      } else {
        passives.push(structuredClone(granted));
      }
    }
  }

  applyPassiveChanges(passives, pieces);
  passives.push(...structuredClone(arming.passives));

  return passives;
}

type StacksPassive = Extract<PassiveDefinition, { kind: "stacks" }>;

function patchStacks(passive: StacksPassive, patch: StacksPatch): StacksPassive {
  const patched: StacksPassive = {
    kind: "stacks",
    key: passive.key,
    name: passive.name,
    description: passive.description,
    gains: passive.gains,
    max: passive.max,
    attackSpeedPerStack: passive.attackSpeedPerStack,
  };

  const startsAt = patch.startsAt ?? passive.startsAt;
  const atMax = patch.atMax === undefined ? passive.atMax : { ...passive.atMax, ...patch.atMax };
  const channelHastePerStack = patch.channelHastePerStack ?? passive.channelHastePerStack;

  if (passive.spentBy !== undefined) {
    patched.spentBy = passive.spentBy;
  }

  if (passive.extraHopsPerStack !== undefined) {
    patched.extraHopsPerStack = passive.extraHopsPerStack;
  }

  if (startsAt !== undefined) {
    patched.startsAt = startsAt;
  }

  if (passive.decay !== undefined && patch.removeDecay !== true) {
    patched.decay = passive.decay;
  }

  if (atMax !== undefined) {
    patched.atMax = atMax;
  }

  if (channelHastePerStack !== undefined) {
    patched.channelHastePerStack = channelHastePerStack;
  }

  return patched;
}

function applyPassiveChanges(passives: PassiveDefinition[], pieces: readonly PieceSelection[]): void {
  for (const piece of pieces) {
    for (const change of piece.upgrade.passiveChanges ?? []) {
      const index = passives.findIndex((passive) => passive.kind === "stacks" && passive.key === change.key);
      const passive = passives[index];

      if (passive?.kind === "stacks") {
        passives[index] = patchStacks(passive, change.stacks);
      }
    }
  }
}

export function findBloodPact(passives: readonly PassiveDefinition[]): Extract<PassiveDefinition, { kind: "blood-pact" }> | null {
  for (const passive of passives) {
    if (passive.kind === "blood-pact") {
      return passive;
    }
  }

  return null;
}

function triggeredAbilityIds(passives: readonly PassiveDefinition[]): AbilityDefinitionId[] {
  const ids: AbilityDefinitionId[] = [];

  for (const passive of passives) {
    if ((passive.kind === "self-destruct" || passive.kind === "dash-trail" || passive.kind === "voidheart") && !ids.includes(passive.abilityId)) {
      ids.push(passive.abilityId);
    }
  }

  return ids;
}

function formsOf(abilities: Record<AbilityDefinitionId, CompiledAbility>, passives: readonly PassiveDefinition[]): FormDefinition[] {
  const forms: FormDefinition[] = [];

  for (const ability of Object.values(abilities)) {
    if (ability.form !== undefined) {
      forms.push(ability.form);
    }
  }

  for (const passive of passives) {
    if (passive.kind === "stacks" && passive.atMax?.form !== undefined) {
      forms.push(passive.atMax.form);
    }

    if (passive.kind === "revive" && passive.form !== undefined) {
      forms.push(passive.form);
    }
  }

  return forms;
}

function linkedAbilityIds(abilities: Record<AbilityDefinitionId, CompiledAbility>, passives: readonly PassiveDefinition[], hero: HeroDefinition): AbilityDefinitionId[] {
  const ids: AbilityDefinitionId[] = [];

  for (const ability of Object.values(abilities)) {
    for (const linked of [ability.bomb?.abilityId, ability.bounces?.trail]) {
      if (linked !== undefined && !ids.includes(linked)) {
        ids.push(linked);
      }
    }
  }

  for (const form of formsOf(abilities, passives)) {
    for (const token of [form.retaliate?.abilityId, form.castEveryNthHitTaken?.abilityId, form.basicAttackId]) {
      const abilityId = token === undefined ? null : resolveAbilityToken(token, hero);

      if (abilityId !== null && !ids.includes(abilityId)) {
        ids.push(abilityId);
      }
    }
  }

  return ids;
}

function heroSkillIds(hero: HeroDefinition): AbilityDefinitionId[] {
  const ids: AbilityDefinitionId[] = [];

  for (const slot of SKILL_SLOTS) {
    const skillId = skillIdFor(hero, slot);

    if (skillId !== null) {
      ids.push(skillId);
    }
  }

  return ids;
}

function compileAbilities(
  hero: HeroDefinition,
  catalogue: Catalogue,
  pieces: readonly PieceSelection[],
  sums: ModifierSums,
  passives: readonly PassiveDefinition[],
  arming: SummonArming,
): Record<AbilityDefinitionId, CompiledAbility> {
  const abilities: Record<AbilityDefinitionId, CompiledAbility> = {};
  const ids = [...heroSkillIds(hero), hero.basicAttackId, ...triggeredAbilityIds(passives)];

  for (const abilityId of ids) {
    const definition = catalogue.abilities[abilityId];

    if (definition === undefined || abilities[abilityId] !== undefined) {
      continue;
    }

    abilities[abilityId] = { ...structuredClone(definition), slot: skillSlotOf(hero, abilityId), gems: emptyGems() };
  }

  applyAbilityChanges(abilities, pieces, hero);

  for (const linkedAbilityId of linkedAbilityIds(abilities, passives, hero)) {
    const definition = catalogue.abilities[linkedAbilityId];

    if (definition !== undefined && abilities[linkedAbilityId] === undefined) {
      abilities[linkedAbilityId] = { ...structuredClone(definition), slot: skillSlotOf(hero, linkedAbilityId), gems: emptyGems() };
    }
  }

  for (const ability of Object.values(abilities)) {
    applyAbilityModifiers(ability, sums, hero);
  }

  for (const piece of pieces) {
    const gem = piece.upgrade.gem;
    const skillId = piece.slot === null ? null : skillIdFor(hero, piece.slot);
    const skill = skillId === null ? undefined : abilities[skillId];
    const definition = skillId === null ? undefined : catalogue.abilities[skillId];

    if (gem === undefined || skill === undefined || definition === undefined) {
      continue;
    }

    const shot = carriedShot(definition, catalogue);

    if (shot !== null && gemWorksOnShot(piece.upgrade, shot)) {
      skill.gems.carried.push({ id: piece.upgrade.id, gem });
    } else if (gemWorksOn(piece.upgrade, definition)) {
      applyGem(skill, piece.upgrade.id, gem);
    }
  }

  const basicAttack = abilities[hero.basicAttackId];

  if (basicAttack !== undefined) {
    for (const armed of arming.gems) {
      applyGem(basicAttack, armed.id, armed.gem);
    }
  }

  return abilities;
}

function cooldownDurations(hero: HeroDefinition, abilities: Record<AbilityDefinitionId, CompiledAbility>, sums: ModifierSums): Record<AbilityDefinitionId, number> {
  const durations: Record<AbilityDefinitionId, number> = {};

  for (const abilityId of [...heroSkillIds(hero), hero.basicAttackId]) {
    const ability = abilities[abilityId];

    if (ability === undefined) {
      continue;
    }

    if (abilityId === hero.basicAttackId) {
      const baseRate = 1 / ability.cooldownTicks;
      const compiledRate = compileStat(sums, "basic-attack-cooldown", baseRate);
      const rawTicks = compiledRate > 0 ? Math.round(1 / compiledRate) : DEFAULT_TICK_LIMIT;
      durations[abilityId] = Math.max(1, Math.min(DEFAULT_TICK_LIMIT, rawTicks));
    } else {
      durations[abilityId] = ability.cooldownTicks;
    }
  }

  return durations;
}

function itemGemSockets(build: HeroBuild, catalogue: Catalogue): number {
  let sockets = 0;

  for (const itemId of build.itemIds ?? []) {
    sockets += catalogue.upgrades[itemId]?.extraGemSockets ?? 0;
  }

  return sockets;
}

export function gemSocketsFor(hero: HeroDefinition, build: HeroBuild, catalogue: Catalogue): Record<SkillSlot, number> {
  const fromItems = itemGemSockets(build, catalogue);

  return {
    ability: hero.abilityId === undefined ? 0 : BASE_GEM_SOCKETS + trainedSocketCount(build, "ability") + fromItems,
    ultimate: hero.ultimateId === undefined ? 0 : BASE_GEM_SOCKETS + trainedSocketCount(build, "ultimate") + fromItems,
  };
}

export function compileBuild(build: HeroBuild, catalogue: Catalogue, arming: SummonArming = NO_ARMING): CompiledUnitStats {
  const hero = catalogue.heroes[build.heroId];

  if (hero === undefined) {
    throw new Error(`build "${build.buildId}" references unknown hero "${build.heroId}"`);
  }

  const pieces = collectPieces(build, catalogue);
  const sums = collectModifierSums(pieces);
  const maxHp = Math.max(1, Math.round(compileStat(sums, "max-hp", hero.maxHp)));
  const passives = compilePassives(hero, pieces, arming);
  const abilities = compileAbilities(hero, catalogue, pieces, sums, passives, arming);
  const abilityCooldownDurations = cooldownDurations(hero, abilities, sums);
  const ultimateId = hero.ultimateId ?? null;
  const ultimate = ultimateId === null ? undefined : abilities[ultimateId];
  const pact = findBloodPact(passives);

  if (pact !== null) {
    for (const skillId of heroSkillIds(hero)) {
      abilityCooldownDurations[skillId] = pact.floorTicks;
    }
  }

  return {
    heroId: hero.id,
    maxHp,
    moveSpeedUnitsPerSecond: compileStat(sums, "move-speed", hero.moveSpeedUnitsPerSecond),
    abilityCooldownDurations,
    school: hero.school ?? null,
    armor: Math.min(MAX_ARMOR, Math.max(0, compileStat(sums, "armor", hero.armor ?? 0))),
    critChance: Math.min(1, Math.max(0, compileStat(sums, "crit-chance", hero.critChance ?? 0))),
    critMultiplier: Math.max(1, compileStat(sums, "crit-multiplier", hero.critMultiplier ?? DEFAULT_CRIT_MULTIPLIER)),
    damageMultiplier: Math.max(0, compileStat(sums, "damage", 1)),
    attackDamageMultiplier: Math.max(0, compileStat(sums, "attack-damage", 1)),
    spellDamageMultiplier: Math.max(0, compileStat(sums, "spell-damage", 1)),
    lifesteal: Math.max(0, compileStat(sums, "lifesteal", 0)),
    slowStrengthBonus: compileStat(sums, "slow-strength", 0),
    conditionDurationBonusTicks: Math.round(compileStat(sums, "condition-duration", 0)),
    maxMana: pact === null ? (ultimate?.manaCost ?? 0) : 0,
    manaPerAttack: Math.max(0, compileStat(sums, "mana-per-attack", hero.manaPerAttack ?? DEFAULT_MANA_PER_ATTACK)),
    basicAttackId: hero.basicAttackId,
    abilityId: hero.abilityId ?? null,
    ultimateId,
    abilities,
    passives,
    gemSockets: gemSocketsFor(hero, build, catalogue),
  };
}
