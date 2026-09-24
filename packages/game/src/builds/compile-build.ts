import type {
  AbilityDefinitionId,
  HeroDefinitionId,
} from "../ids.js";
import {
  BASIC_ATTACK_ABILITY,
  SIGNATURE_ABILITY,
  type AbilityDefinition,
  type AreaDefinition,
  type Catalogue,
  type EffectDefinition,
  type HeroDefinition,
  type PassiveDefinition,
  type RuneDefinition,
  type School,
  type StatModifier,
  type StatModifierTarget,
  type UpgradeDefinition,
  type ZoneDefinition,
} from "../definitions.js";
import type { HeroBuild } from "./state.js";
import { DEFAULT_TICK_LIMIT } from "../constants.js";

export const DEFAULT_CRIT_MULTIPLIER = 1.75;

export const DEFAULT_MANA_PER_ATTACK = 15;

export const MAX_ARMOR = 0.8;

export const MAX_SLOW_FRACTION = 0.9;

export const MAX_BIND_FRACTION = 0.9;

export interface CompiledRunes {
  chain: { extraTargets: number; fraction: number; rangeUnits: number } | null;
  echo: { fraction: number; delayTicks: number } | null;
  leech: number;
  retaliate: { fraction: number; hpLossFraction: number } | null;
  fork: { branches: number; fraction: number; angleDegrees: number; lengthUnits: number } | null;
  twincast: number;
  opener: { atTick: number } | null;
  lastWord: boolean;
  tandem: { fraction: number; cooldownTicks: number } | null;
  resonance: boolean;
  overchargeHpCost: number;
}

export interface CompiledAbility extends AbilityDefinition {
  runes: CompiledRunes;
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
  lifesteal: number;
  slowStrengthBonus: number;
  conditionDurationBonusTicks: number;
  dotDamageMultiplier: number;
  dotMaxStacksBonus: number;
  startingMana: number;
  maxMana: number;
  manaPerAttack: number;
  signatureAbilityId: AbilityDefinitionId | null;
  abilities: Record<AbilityDefinitionId, CompiledAbility>;
  passives: PassiveDefinition[];
  runeSockets: number;
}

interface PieceSelection {
  upgrade: UpgradeDefinition;
  stacks: number;
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
    case "zone-duration":
      return `${target.kind}:${target.abilityId}`;

    case "max-hp":
    case "basic-attack-cooldown":
    case "armor":
    case "crit-chance":
    case "crit-multiplier":
    case "damage":
    case "move-speed":
    case "starting-mana":
    case "mana-per-attack":
    case "slow-strength":
    case "condition-duration":
    case "dot-damage":
    case "dot-max-stacks":
    case "lifesteal":
    case "rune-sockets":
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

    pieces.push({ upgrade, stacks: selection.stacks });
  }

  for (const pieceId of [...(build.itemIds ?? []), ...(build.runeIds ?? [])]) {
    const upgrade = catalogue.upgrades[pieceId];

    if (upgrade === undefined) {
      throw new Error(`build "${build.buildId}" equips unknown piece "${pieceId}"`);
    }

    pieces.push({ upgrade, stacks: 1 });
  }

  return pieces;
}

function applyModifiers(
  modifiers: readonly StatModifier[],
  stacks: number,
  flat: Map<string, number>,
  percent: Map<string, number>,
): void {
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

export function findSignatureAbilityId(hero: HeroDefinition, catalogue: Catalogue): AbilityDefinitionId | null {
  for (const abilityId of hero.abilityIds) {
    if (catalogue.abilities[abilityId]?.manaCost !== undefined) {
      return abilityId;
    }
  }

  return null;
}

function resolveAbilityToken(
  token: AbilityDefinitionId,
  hero: HeroDefinition,
  signatureAbilityId: AbilityDefinitionId | null,
): AbilityDefinitionId | null {
  if (token === BASIC_ATTACK_ABILITY) {
    return hero.basicAttackId;
  }

  if (token === SIGNATURE_ABILITY) {
    return signatureAbilityId;
  }

  return token;
}

function abilityKeys(
  kind: string,
  abilityId: AbilityDefinitionId,
  hero: HeroDefinition,
  signatureAbilityId: AbilityDefinitionId | null,
): string[] {
  const keys = [`${kind}:${abilityId}`];

  if (abilityId === hero.basicAttackId) {
    keys.push(`${kind}:${BASIC_ATTACK_ABILITY}`);
  }

  if (abilityId === signatureAbilityId) {
    keys.push(`${kind}:${SIGNATURE_ABILITY}`);
  }

  return keys;
}

export function emptyRunes(): CompiledRunes {
  return {
    chain: null,
    echo: null,
    leech: 0,
    retaliate: null,
    fork: null,
    twincast: 0,
    opener: null,
    lastWord: false,
    tandem: null,
    resonance: false,
    overchargeHpCost: 0,
  };
}

function scaleEffect(effect: EffectDefinition, multiplier: number): EffectDefinition {
  if (effect.kind !== "damage") {
    return effect;
  }

  const amount = Math.max(1, Math.round(effect.amount * multiplier));
  const scaled: EffectDefinition = { kind: "damage", amount };

  if (effect.maxAmount !== undefined) {
    scaled.maxAmount = Math.max(amount, Math.round(effect.maxAmount * multiplier));
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

function applyAbilityChanges(
  abilities: Record<AbilityDefinitionId, CompiledAbility>,
  pieces: readonly PieceSelection[],
  hero: HeroDefinition,
  signatureAbilityId: AbilityDefinitionId | null,
): void {
  for (const piece of pieces) {
    for (const change of piece.upgrade.abilityChanges ?? []) {
      const abilityId = resolveAbilityToken(change.abilityId, hero, signatureAbilityId);
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

      if (change.setSchool !== undefined) {
        ability.school = change.setSchool;
      }

      if (change.setEffects !== undefined) {
        ability.effects = structuredClone(change.setEffects);
      }

      if (change.setMaxTargets !== undefined) {
        ability.maxTargets = change.setMaxTargets;
      }

      if (change.setChannel !== undefined) {
        ability.channel = structuredClone(change.setChannel);
      }
    }
  }
}

function scaleHealing(effects: readonly EffectDefinition[], multiplier: number): EffectDefinition[] {
  return effects.map((effect) => (effect.kind === "heal" ? { ...effect, amount: Math.round(effect.amount * multiplier) } : effect));
}

function applyAbilityModifiers(
  ability: CompiledAbility,
  sums: ModifierSums,
  hero: HeroDefinition,
  signatureAbilityId: AbilityDefinitionId | null,
): void {
  const damageKeys = abilityKeys("ability-damage", ability.id, hero, signatureAbilityId);

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

  const healingKeys = abilityKeys("ability-healing", ability.id, hero, signatureAbilityId);

  if (hasModifier(sums, healingKeys)) {
    const multiplier = compileKeyedStat(sums, healingKeys, 1);
    ability.effects = scaleHealing(ability.effects, multiplier);

    if (ability.allyEffects !== undefined) {
      ability.allyEffects = scaleHealing(ability.allyEffects, multiplier);
    }

    if (ability.zone?.allyEffects !== undefined) {
      ability.zone = { ...ability.zone, allyEffects: scaleHealing(ability.zone.allyEffects, multiplier) };
    }
  }

  const costKeys = abilityKeys("ability-mana-cost", ability.id, hero, signatureAbilityId);

  if (ability.manaCost !== undefined && hasModifier(sums, costKeys)) {
    ability.manaCost = Math.max(1, Math.round(compileKeyedStat(sums, costKeys, ability.manaCost)));
  }

  const areaKeys = abilityKeys("ability-area", ability.id, hero, signatureAbilityId);

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

  const zoneKeys = abilityKeys("zone-duration", ability.id, hero, signatureAbilityId);

  if (ability.zone !== undefined && hasModifier(sums, zoneKeys)) {
    ability.zone = {
      ...ability.zone,
      durationTicks: Math.max(1, Math.round(compileKeyedStat(sums, zoneKeys, ability.zone.durationTicks))),
    };
  }
}

function applyRunes(ability: CompiledAbility, pieces: readonly PieceSelection[]): void {
  for (const piece of pieces) {
    const rune = piece.upgrade.rune;

    if (rune === undefined || piece.upgrade.category !== "rune") {
      continue;
    }

    switch (rune.kind) {
      case "chain":
        ability.runes.chain = {
          extraTargets: (ability.runes.chain?.extraTargets ?? 0) + rune.extraTargets,
          fraction: rune.fraction,
          rangeUnits: rune.rangeUnits,
        };
        break;

      case "echo":
        ability.runes.echo = { fraction: Math.min(1, (ability.runes.echo?.fraction ?? 0) + rune.fraction), delayTicks: rune.delayTicks };
        break;

      case "widen":
        if (ability.area !== undefined) {
          ability.area = scaleArea(ability.area, rune.radiusMultiplier);
        }

        if (ability.zone !== undefined) {
          ability.zone = { ...ability.zone, radiusUnits: ability.zone.radiusUnits * rune.radiusMultiplier };
        }

        if (ability.channel !== undefined) {
          ability.channel = { ...ability.channel, radiusUnits: ability.channel.radiusUnits * rune.radiusMultiplier };
        }

        break;

      case "primer":
        ability.effects.push({ kind: "apply-condition", condition: rune.condition });
        break;

      case "leech":
        ability.runes.leech += rune.fraction;
        break;

      case "retaliate":
        ability.runes.retaliate = { fraction: rune.fraction, hpLossFraction: rune.hpLossFraction };
        break;

      case "fork":
        ability.runes.fork = {
          branches: rune.branches,
          fraction: rune.fraction,
          angleDegrees: rune.angleDegrees,
          lengthUnits: rune.lengthUnits,
        };
        break;

      case "twincast":
        ability.runes.twincast = Math.min(1, ability.runes.twincast + rune.chance);
        break;

      case "split":
        ability.effects = scaleSummons(ability.effects, rune.strength, rune.extraSummons);
        break;

      case "empower":
        ability.effects = scaleSummons(ability.effects, rune.strength, 0);
        break;

      case "linger":
        applyLinger(ability, rune);
        break;

      case "opener":
        ability.runes.opener = { atTick: rune.atTick };
        break;

      case "last-word":
        ability.runes.lastWord = true;
        break;

      case "tandem":
        ability.runes.tandem = { fraction: rune.fraction, cooldownTicks: rune.cooldownTicks };
        break;

      case "resonance":
        ability.runes.resonance = true;
        break;

      case "haste":
        if (ability.manaCost !== undefined) {
          ability.manaCost = Math.max(1, Math.round(ability.manaCost * rune.manaCostMultiplier));
        }

        break;

      case "overcharge":
        applyOvercharge(ability, rune.effectMultiplier);
        ability.runes.overchargeHpCost += rune.hpCostFraction;
        break;

      default: {
        const exhaustive: never = rune;

        void exhaustive;
      }
    }
  }
}

function scaleSummons(effects: readonly EffectDefinition[], strength: number, extraSummons: number): EffectDefinition[] {
  return effects.map((effect) => {
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
    if (effect.kind === "damage" && kind === "damage") {
      return [scaleEffect(effect, fraction)];
    }

    if (effect.kind === "heal" && kind === "heal") {
      return [{ kind: "heal", amount: Math.max(1, Math.round(effect.amount * fraction)) }];
    }

    return [];
  });
}

function applyLinger(ability: CompiledAbility, rune: Extract<RuneDefinition, { kind: "linger" }>): void {
  if (ability.zone !== undefined) {
    ability.zone = { ...ability.zone, durationTicks: ability.zone.durationTicks + rune.durationTicks };

    return;
  }

  if (ability.channel !== undefined) {
    ability.channel = { ...ability.channel, durationTicks: ability.channel.durationTicks + rune.channelTicks };

    return;
  }

  if (ability.area?.kind !== "circle") {
    return;
  }

  const zone: ZoneDefinition = {
    radiusUnits: ability.area.radiusUnits,
    durationTicks: rune.durationTicks,
    periodTicks: rune.periodTicks,
    effects: lingeringEffects(ability.effects, rune.fraction, "damage"),
  };

  const heals = lingeringEffects(ability.allyEffects ?? [], rune.fraction, "heal");

  if (heals.length > 0) {
    zone.allyEffects = heals;
  }

  ability.zone = zone;
}

function overchargeEffect(effect: EffectDefinition, multiplier: number): EffectDefinition {
  switch (effect.kind) {
    case "damage":
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

      return shielded;
    }

    case "bind":
      return { ...effect, fraction: Math.min(MAX_BIND_FRACTION, effect.fraction * multiplier) };

    case "summon":
      return { ...effect, hpScale: (effect.hpScale ?? 1) * multiplier, damageScale: (effect.damageScale ?? 1) * multiplier };

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

  if (ability.casterShieldPerTarget !== undefined) {
    ability.casterShieldPerTarget = {
      ...ability.casterShieldPerTarget,
      maxHpFraction: ability.casterShieldPerTarget.maxHpFraction * multiplier,
    };
  }
}

function passiveIdentity(passive: PassiveDefinition): string {
  if (
    passive.kind === "hp-threshold" ||
    passive.kind === "every-nth-basic-attack" ||
    passive.kind === "first-hit-per-enemy" ||
    passive.kind === "empower-summons"
  ) {
    return `${passive.kind}:${passive.key}`;
  }

  return passive.kind;
}

function compilePassives(hero: HeroDefinition, pieces: readonly PieceSelection[]): PassiveDefinition[] {
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

  return passives;
}

export function findBloodContract(passives: readonly PassiveDefinition[]): Extract<PassiveDefinition, { kind: "blood-contract" }> | null {
  for (const passive of passives) {
    if (passive.kind === "blood-contract") {
      return passive;
    }
  }

  return null;
}

function triggeredAbilityIds(passives: readonly PassiveDefinition[]): AbilityDefinitionId[] {
  const ids: AbilityDefinitionId[] = [];

  for (const passive of passives) {
    if (passive.kind === "hp-threshold" && !ids.includes(passive.abilityId)) {
      ids.push(passive.abilityId);
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
  signatureAbilityId: AbilityDefinitionId | null,
): Record<AbilityDefinitionId, CompiledAbility> {
  const abilities: Record<AbilityDefinitionId, CompiledAbility> = {};
  const ids = [...hero.abilityIds, hero.basicAttackId, ...triggeredAbilityIds(passives)];

  for (const abilityId of ids) {
    const definition = catalogue.abilities[abilityId];

    if (definition === undefined || abilities[abilityId] !== undefined) {
      continue;
    }

    abilities[abilityId] = { ...structuredClone(definition), runes: emptyRunes() };
  }

  applyAbilityChanges(abilities, pieces, hero, signatureAbilityId);

  for (const ability of Object.values(abilities)) {
    applyAbilityModifiers(ability, sums, hero, signatureAbilityId);
  }

  const signature = signatureAbilityId === null ? undefined : abilities[signatureAbilityId];

  if (signature !== undefined) {
    applyRunes(signature, pieces);
  }

  return abilities;
}

export function compileBuild(build: HeroBuild, catalogue: Catalogue): CompiledUnitStats {
  const hero = catalogue.heroes[build.heroId];

  if (hero === undefined) {
    throw new Error(`build "${build.buildId}" references unknown hero "${build.heroId}"`);
  }

  const pieces = collectPieces(build, catalogue);
  const sums = collectModifierSums(pieces);

  const maxHp = Math.max(1, Math.round(compileStat(sums, "max-hp", hero.maxHp)));

  const abilityCooldownDurations: Record<AbilityDefinitionId, number> = {};

  for (const abilityId of [...hero.abilityIds, hero.basicAttackId]) {
    const ability = catalogue.abilities[abilityId];

    if (ability === undefined) {
      continue;
    }

    if (abilityId === hero.basicAttackId) {
      const baseRate = 1 / ability.cooldownTicks;
      const compiledRate = compileStat(sums, "basic-attack-cooldown", baseRate);
      const rawTicks = compiledRate > 0 ? Math.round(1 / compiledRate) : DEFAULT_TICK_LIMIT;
      abilityCooldownDurations[abilityId] = Math.max(1, Math.min(DEFAULT_TICK_LIMIT, rawTicks));
    } else {
      abilityCooldownDurations[abilityId] = ability.cooldownTicks;
    }
  }

  const signatureAbilityId = findSignatureAbilityId(hero, catalogue);
  const passives = compilePassives(hero, pieces);
  const abilities = compileAbilities(hero, catalogue, pieces, sums, passives, signatureAbilityId);
  const signature = signatureAbilityId === null ? undefined : abilities[signatureAbilityId];
  const unlockedSockets = pieces.some((piece) => piece.upgrade.unlocksRuneSocket === true) ? 1 : 0;
  const contract = findBloodContract(passives);

  if (contract !== null && signatureAbilityId !== null) {
    abilityCooldownDurations[signatureAbilityId] = Math.max(abilityCooldownDurations[signatureAbilityId] ?? 0, contract.cooldownTicks);
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
    lifesteal: Math.max(0, compileStat(sums, "lifesteal", 0)),
    slowStrengthBonus: compileStat(sums, "slow-strength", 0),
    conditionDurationBonusTicks: Math.round(compileStat(sums, "condition-duration", 0)),
    dotDamageMultiplier: Math.max(0, compileStat(sums, "dot-damage", 1)),
    dotMaxStacksBonus: Math.round(compileStat(sums, "dot-max-stacks", 0)),
    startingMana: Math.max(0, compileStat(sums, "starting-mana", 0)),
    maxMana: contract === null ? (signature?.manaCost ?? 0) : 0,
    manaPerAttack: Math.max(0, compileStat(sums, "mana-per-attack", hero.manaPerAttack ?? DEFAULT_MANA_PER_ATTACK)),
    signatureAbilityId,
    abilities,
    passives,
    runeSockets:
      signatureAbilityId === null
        ? 0
        : 1 + unlockedSockets + (build.extraRuneSockets ?? 0) + Math.round(compileStat(sums, "rune-sockets", 0)),
  };
}
