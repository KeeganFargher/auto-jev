import {
  BASIC_ATTACK_ABILITY,
  SIGNATURE_ABILITY,
  type AreaDefinition,
  type Catalogue,
  type EffectDefinition,
  type PassiveDefinition,
  type RuneDefinition,
} from "@jev-game/game";

function isPositiveFinite(value: number): boolean {
  return Number.isFinite(value) && value > 0;
}

function isPositiveInteger(value: number): boolean {
  return Number.isInteger(value) && value > 0;
}

function isNonNegativeInteger(value: number): boolean {
  return Number.isInteger(value) && value >= 0;
}

type PolicySide = "enemy" | "ally" | "self";

function policySide(targetPolicy: string, hasArea: boolean): PolicySide {
  if (targetPolicy === "lowest-hp-fraction-ally") {
    return "ally";
  }

  if (targetPolicy === "self") {
    return hasArea ? "enemy" : "self";
  }

  return "enemy";
}

function requireSide(abilityId: string, effectKind: string, side: PolicySide, allowed: readonly PolicySide[]): void {
  if (!allowed.includes(side)) {
    throw new Error(`ability "${abilityId}" has a ${effectKind} effect but its targets are ${side}, not ${allowed.join(" or ")}`);
  }
}

function validateEffect(abilityId: string, side: PolicySide, effect: EffectDefinition): void {
  switch (effect.kind) {
    case "damage": {
      if (!isPositiveInteger(effect.amount)) {
        throw new Error(`ability "${abilityId}" has a non-integer damage amount`);
      }

      if (effect.maxAmount !== undefined && (!Number.isInteger(effect.maxAmount) || effect.maxAmount < effect.amount)) {
        throw new Error(`ability "${abilityId}" has a damage range whose maximum is not a whole number at or above its minimum`);
      }

      requireSide(abilityId, "damage", side, ["enemy"]);
      break;
    }

    case "heal": {
      if (!isNonNegativeInteger(effect.amount) || (effect.amount === 0 && (effect.maxHpFraction ?? 0) <= 0)) {
        throw new Error(`ability "${abilityId}" has a non-integer heal amount`);
      }

      requireSide(abilityId, "heal", side, ["ally", "self"]);
      break;
    }

    case "shield": {
      if (!isNonNegativeInteger(effect.amount) || !isPositiveInteger(effect.durationTicks) || (effect.amount === 0 && (effect.maxHpFraction ?? 0) <= 0)) {
        throw new Error(`ability "${abilityId}" has a non-integer shield amount or duration`);
      }

      requireSide(abilityId, "shield", side, ["ally", "self"]);
      break;
    }

    case "slow": {
      if (effect.slowFraction <= 0 || effect.slowFraction >= 1) {
        throw new Error(`ability "${abilityId}" has a slow fraction outside (0, 1) — a full root is not allowed`);
      }

      if (!isPositiveInteger(effect.durationTicks)) {
        throw new Error(`ability "${abilityId}" has a non-integer slow duration`);
      }

      requireSide(abilityId, "slow", side, ["enemy"]);
      break;
    }

    case "apply-condition":
    case "taunt":
    case "knockback": {
      requireSide(abilityId, effect.kind, side, ["enemy"]);

      if (effect.kind === "taunt" && !isPositiveInteger(effect.durationTicks)) {
        throw new Error(`ability "${abilityId}" has a non-integer taunt duration`);
      }

      if (effect.kind === "knockback" && !isPositiveFinite(effect.distanceUnits)) {
        throw new Error(`ability "${abilityId}" has a non-positive knockback distance`);
      }

      break;
    }

    case "control":
    case "dot": {
      requireSide(abilityId, effect.kind, side, ["enemy"]);

      if (!isPositiveInteger(effect.durationTicks)) {
        throw new Error(`ability "${abilityId}" has a non-integer ${effect.kind} duration`);
      }

      if (effect.kind === "dot" && (!isPositiveInteger(effect.stacks) || !isPositiveInteger(effect.maxStacks) || !isPositiveFinite(effect.damagePerStackPerSecond))) {
        throw new Error(`ability "${abilityId}" has an invalid damage-over-time definition`);
      }

      if (effect.kind === "dot" && effect.conditionAtStacks !== undefined && !isPositiveInteger(effect.conditionAtStacks.stacks)) {
        throw new Error(`ability "${abilityId}" has a non-integer condition threshold`);
      }

      break;
    }

    case "bind": {
      requireSide(abilityId, "bind", side, ["enemy"]);

      if (!(effect.fraction > 0 && effect.fraction <= 1) || !isPositiveInteger(effect.durationTicks)) {
        throw new Error(`ability "${abilityId}" has an invalid bind`);
      }

      break;
    }

    case "strip-shield": {
      requireSide(abilityId, "strip-shield", side, ["enemy"]);
      break;
    }

    case "summon": {
      requireSide(abilityId, "summon", side, ["self"]);

      if (!isPositiveInteger(effect.count) || (effect.maxActive !== undefined && !isPositiveInteger(effect.maxActive))) {
        throw new Error(`ability "${abilityId}" has an invalid summon count`);
      }

      break;
    }

    case "invulnerable":
    case "untargetable": {
      requireSide(abilityId, effect.kind, side, ["self", "ally"]);

      if (!isPositiveInteger(effect.durationTicks)) {
        throw new Error(`ability "${abilityId}" has a non-integer ${effect.kind} duration`);
      }

      break;
    }

    default: {
      const exhaustive: never = effect;

      void exhaustive;
    }
  }
}

function validateArea(abilityId: string, area: AreaDefinition): void {
  const size = area.kind === "circle" ? area.radiusUnits : Math.min(area.lengthUnits, area.widthUnits);

  if (!isPositiveFinite(size)) {
    throw new Error(`ability "${abilityId}" has a non-positive area`);
  }
}

function validateAbilities(catalogue: Catalogue): void {
  for (const [key, ability] of Object.entries(catalogue.abilities)) {
    if (ability.id !== key) {
      throw new Error(`ability catalogue key "${key}" does not match its id "${ability.id}"`);
    }

    if (!isPositiveInteger(ability.cooldownTicks)) {
      throw new Error(`ability "${ability.id}" has a non-integer cooldown`);
    }

    if (ability.targetPolicy === "self" ? !(ability.range >= 0) : !isPositiveFinite(ability.range)) {
      throw new Error(`ability "${ability.id}" has a non-positive or non-finite range`);
    }

    if (ability.effects.length === 0 && ability.channel === undefined) {
      throw new Error(`ability "${ability.id}" has no effects`);
    }

    if (ability.maxTargets !== undefined && !isPositiveInteger(ability.maxTargets)) {
      throw new Error(`ability "${ability.id}" has a non-integer target cap`);
    }

    if (ability.consumesTarget === true && ability.targetPolicy !== "own-summon") {
      throw new Error(`ability "${ability.id}" consumes its target but doesn't aim at its own summons`);
    }

    if (ability.targetPolicy === "own-summon" && ability.area?.kind !== "circle") {
      throw new Error(`ability "${ability.id}" aims at its own summon but has no circle area`);
    }

    for (const effect of [...ability.effects, ...(ability.allyEffects ?? [])]) {
      if (effect.kind === "summon" && catalogue.heroes[effect.heroId]?.summon !== true) {
        throw new Error(`ability "${ability.id}" summons "${effect.heroId}", which isn't a summon hero`);
      }

      if (effect.kind === "summon") {
        validatePassives(catalogue, `ability "${ability.id}" summon`, effect.passives ?? []);
      }
    }

    if (ability.manaCost !== undefined && !isPositiveInteger(ability.manaCost)) {
      throw new Error(`ability "${ability.id}" has a non-integer mana cost`);
    }

    if (ability.delayTicks !== undefined && !isPositiveInteger(ability.delayTicks)) {
      throw new Error(`ability "${ability.id}" has a non-integer delay`);
    }

    if (ability.area !== undefined) {
      validateArea(ability.id, ability.area);
    }

    if (ability.targetPolicy === "densest-enemy-cluster" && ability.area?.kind !== "circle") {
      throw new Error(`ability "${ability.id}" aims at the densest cluster but has no circle area`);
    }

    const side = policySide(ability.targetPolicy, ability.area !== undefined);

    for (const effect of ability.effects) {
      validateEffect(ability.id, side, effect);
    }

    for (const effect of ability.allyEffects ?? []) {
      validateEffect(ability.id, "ally", effect);
    }

    if (ability.channel !== undefined) {
      const channel = ability.channel;

      if (!isPositiveInteger(channel.durationTicks) || !isPositiveInteger(channel.periodTicks) || !isPositiveFinite(channel.radiusUnits)) {
        throw new Error(`ability "${ability.id}" has an invalid channel`);
      }

      for (const effect of channel.effects) {
        validateEffect(ability.id, "enemy", effect);
      }
    }

    if (ability.secondary !== undefined) {
      validateArea(ability.id, ability.secondary.area);

      for (const effect of ability.secondary.effects) {
        validateEffect(ability.id, "enemy", effect);
      }
    }

    if (ability.zone !== undefined) {
      if (!isPositiveFinite(ability.zone.radiusUnits) || !isPositiveInteger(ability.zone.durationTicks) || !isPositiveInteger(ability.zone.periodTicks)) {
        throw new Error(`ability "${ability.id}" has an invalid zone`);
      }

      for (const effect of ability.zone.effects) {
        validateEffect(ability.id, "enemy", effect);
      }

      for (const effect of ability.zone.allyEffects ?? []) {
        validateEffect(ability.id, "ally", effect);
      }
    }
  }
}

function abilityReferenceExists(catalogue: Catalogue, abilityId: string): boolean {
  return abilityId === SIGNATURE_ABILITY || abilityId === BASIC_ATTACK_ABILITY || catalogue.abilities[abilityId] !== undefined;
}

function validatePassives(catalogue: Catalogue, owner: string, passives: readonly PassiveDefinition[]): void {
  for (const passive of passives) {
    if (passive.kind === "hp-threshold") {
      if (catalogue.abilities[passive.abilityId] === undefined) {
        throw new Error(`${owner} triggers unknown ability "${passive.abilityId}"`);
      }

      if (!(passive.fraction > 0 && passive.fraction < 1)) {
        throw new Error(`${owner} has an hp threshold outside (0, 1)`);
      }
    }

    if (passive.kind === "every-nth-basic-attack" && !isPositiveInteger(passive.n)) {
      throw new Error(`${owner} has a non-integer attack count`);
    }

    if (passive.kind === "every-nth-basic-attack" || passive.kind === "first-hit-per-enemy") {
      for (const effect of passive.effects) {
        validateEffect(owner, "enemy", effect);
      }
    }

    const summoned = passive.kind === "harvest" ? passive.golemHeroId : passive.kind === "summon-on-death" ? passive.heroId : null;

    if (summoned !== null && catalogue.heroes[summoned]?.summon !== true) {
      throw new Error(`${owner} summons "${summoned}", which isn't a summon hero`);
    }

    if (passive.kind === "last-rites" && (!isPositiveInteger(passive.charges) || !isPositiveInteger(passive.untargetableTicks))) {
      throw new Error(`${owner} has an invalid Last Rites`);
    }

    if (passive.kind === "sentinel-ward" && (!isPositiveFinite(passive.radiusUnits) || !isPositiveInteger(passive.stunTicks))) {
      throw new Error(`${owner} has an invalid Sentinel Ward`);
    }

    if (passive.kind === "blight-ward" && !isUnitFraction(passive.poisonReduction)) {
      throw new Error(`${owner} has a poison reduction outside (0, 1]`);
    }

    if (
      passive.kind === "blood-contract" &&
      (!isUnitFraction(passive.hpFraction) || !(passive.minHpFraction >= 0 && passive.minHpFraction < 1) || !isPositiveInteger(passive.cooldownTicks))
    ) {
      throw new Error(`${owner} has an invalid Blood Contract`);
    }

    if (passive.kind === "soulbound" && !(passive.maxHpFractionPerSecond > 0 && passive.maxHpFractionPerSecond < 1)) {
      throw new Error(`${owner} drains a fraction of HP outside (0, 1)`);
    }
  }
}

function isUnitFraction(value: number): boolean {
  return value > 0 && value <= 1;
}

function validateRune(owner: string, rune: RuneDefinition): void {
  const valid = runeNumbersAreValid(rune);

  if (!valid) {
    throw new Error(`${owner} has invalid ${rune.kind} numbers`);
  }
}

function runeNumbersAreValid(rune: RuneDefinition): boolean {
  switch (rune.kind) {
    case "chain":
      return isPositiveInteger(rune.extraTargets) && isUnitFraction(rune.fraction) && isPositiveFinite(rune.rangeUnits);

    case "echo":
      return isUnitFraction(rune.fraction) && isPositiveInteger(rune.delayTicks);

    case "widen":
      return rune.radiusMultiplier > 1;

    case "primer":
    case "last-word":
    case "resonance":
      return true;

    case "leech":
      return isUnitFraction(rune.fraction);

    case "retaliate":
      return isUnitFraction(rune.fraction) && rune.hpLossFraction > 0 && rune.hpLossFraction < 1;

    case "fork":
      return (
        isPositiveInteger(rune.branches) &&
        isUnitFraction(rune.fraction) &&
        rune.angleDegrees > 0 &&
        rune.angleDegrees < 90 &&
        isPositiveFinite(rune.lengthUnits)
      );

    case "twincast":
      return isUnitFraction(rune.chance);

    case "split":
      return isPositiveInteger(rune.extraSummons) && isUnitFraction(rune.strength);

    case "empower":
      return rune.strength > 1;

    case "linger":
      return (
        isPositiveInteger(rune.durationTicks) &&
        isPositiveInteger(rune.periodTicks) &&
        isUnitFraction(rune.fraction) &&
        isPositiveInteger(rune.channelTicks)
      );

    case "opener":
      return isPositiveInteger(rune.atTick);

    case "tandem":
      return isUnitFraction(rune.fraction) && isPositiveInteger(rune.cooldownTicks);

    case "haste":
      return rune.manaCostMultiplier > 0 && rune.manaCostMultiplier < 1;

    case "overcharge":
      return rune.effectMultiplier > 1 && rune.hpCostFraction > 0 && rune.hpCostFraction < 1;

    default: {
      const exhaustive: never = rune;

      return exhaustive;
    }
  }
}

function validateHeroes(catalogue: Catalogue): void {
  for (const [key, hero] of Object.entries(catalogue.heroes)) {
    if (hero.id !== key) {
      throw new Error(`hero catalogue key "${key}" does not match its id "${hero.id}"`);
    }

    if (!isPositiveInteger(hero.maxHp)) {
      throw new Error(`hero "${hero.id}" has a non-integer max HP`);
    }

    if (hero.summon === true ? !(hero.moveSpeedUnitsPerSecond >= 0) : !isPositiveFinite(hero.moveSpeedUnitsPerSecond)) {
      throw new Error(`hero "${hero.id}" has a non-positive or non-finite move speed`);
    }

    if (catalogue.abilities[hero.basicAttackId] === undefined) {
      throw new Error(`hero "${hero.id}" references unknown basic attack "${hero.basicAttackId}"`);
    }

    for (const abilityId of hero.abilityIds) {
      if (catalogue.abilities[abilityId] === undefined) {
        throw new Error(`hero "${hero.id}" references unknown ability "${abilityId}"`);
      }
    }

    const signatures = hero.abilityIds.filter((abilityId) => catalogue.abilities[abilityId]?.manaCost !== undefined);

    if (signatures.length > 1) {
      throw new Error(`hero "${hero.id}" has more than one mana-cast signature`);
    }

    if (hero.armor !== undefined && !(hero.armor >= 0 && hero.armor < 1)) {
      throw new Error(`hero "${hero.id}" has armor outside [0, 1)`);
    }

    if (hero.critChance !== undefined && !(hero.critChance >= 0 && hero.critChance <= 1)) {
      throw new Error(`hero "${hero.id}" has a crit chance outside [0, 1]`);
    }

    validatePassives(catalogue, `hero "${hero.id}"`, hero.passives ?? []);
  }
}

function validateArenas(catalogue: Catalogue): void {
  for (const [key, arena] of Object.entries(catalogue.arenas)) {
    if (arena.id !== key) {
      throw new Error(`arena catalogue key "${key}" does not match its id "${arena.id}"`);
    }

    if (!isPositiveFinite(arena.width) || !isPositiveFinite(arena.height)) {
      throw new Error(`arena "${arena.id}" has a non-positive or non-finite dimension`);
    }

    if (!isPositiveInteger(arena.columns) || !isPositiveInteger(arena.rows) || arena.rows % 2 !== 0) {
      throw new Error(`arena "${arena.id}" needs a whole number of columns and an even number of rows`);
    }

    if (arena.width / arena.columns !== arena.height / arena.rows) {
      throw new Error(`arena "${arena.id}" has cells that are not square`);
    }
  }
}

function validateUpgrades(catalogue: Catalogue): void {
  for (const [key, upgrade] of Object.entries(catalogue.upgrades)) {
    if (upgrade.id !== key) {
      throw new Error(`upgrade catalogue key "${key}" does not match its id "${upgrade.id}"`);
    }

    if (!isPositiveInteger(upgrade.maxStacks)) {
      throw new Error(`upgrade "${upgrade.id}" has a non-integer max stack count`);
    }

    if (upgrade.heroId !== undefined && catalogue.heroes[upgrade.heroId] === undefined) {
      throw new Error(`upgrade "${upgrade.id}" references unknown hero "${upgrade.heroId}"`);
    }

    const grantsSomething =
      upgrade.statModifiers.length > 0 ||
      (upgrade.grantsPassives?.length ?? 0) > 0 ||
      (upgrade.abilityChanges?.length ?? 0) > 0 ||
      upgrade.rune !== undefined ||
      upgrade.unlocksRuneSocket === true;

    if (!grantsSomething) {
      throw new Error(`upgrade "${upgrade.id}" has no statModifiers and grants nothing`);
    }

    if (upgrade.category === "rune" && (upgrade.rune === undefined || (upgrade.runeFits?.length ?? 0) === 0)) {
      throw new Error(`rune "${upgrade.id}" needs a rune definition and the ability tags it fits`);
    }

    if (upgrade.rune !== undefined) {
      validateRune(`rune "${upgrade.id}"`, upgrade.rune);
    }

    if (upgrade.category === "item" && upgrade.rarity === undefined) {
      throw new Error(`item "${upgrade.id}" has no rarity`);
    }

    if (upgrade.cursed === true && (upgrade.category !== "item" || !upgrade.description.includes("Downside"))) {
      throw new Error(`cursed piece "${upgrade.id}" must be an item whose description states its downside`);
    }

    if (upgrade.category === "talent" && (upgrade.heroId === undefined || upgrade.tier === undefined)) {
      throw new Error(`talent "${upgrade.id}" needs a hero and a tier`);
    }

    for (const otherId of [...(upgrade.requiresAnyOfUpgradeIds ?? []), ...(upgrade.excludesUpgradeIds ?? [])]) {
      if (catalogue.upgrades[otherId] === undefined) {
        throw new Error(`upgrade "${upgrade.id}" references unknown upgrade "${otherId}"`);
      }
    }

    for (const change of upgrade.abilityChanges ?? []) {
      if (!abilityReferenceExists(catalogue, change.abilityId)) {
        throw new Error(`upgrade "${upgrade.id}" changes unknown ability "${change.abilityId}"`);
      }
    }

    validatePassives(catalogue, `upgrade "${upgrade.id}"`, upgrade.grantsPassives ?? []);

    for (const modifier of upgrade.statModifiers) {
      if (!Number.isFinite(modifier.value) || modifier.value === 0) {
        throw new Error(`upgrade "${upgrade.id}" has a zero or non-finite modifier value`);
      }

      if (
        (modifier.target.kind === "ability-mana-cost" ||
          modifier.target.kind === "ability-damage" ||
          modifier.target.kind === "ability-area" ||
          modifier.target.kind === "zone-duration") &&
        !abilityReferenceExists(catalogue, modifier.target.abilityId)
      ) {
        throw new Error(
          `upgrade "${upgrade.id}" references unknown ability "${modifier.target.abilityId}"`,
        );
      }
    }
  }
}

function validateTalentRequirements(catalogue: Catalogue): void {
  for (const upgrade of Object.values(catalogue.upgrades)) {
    const required = upgrade.requiresAnyOfUpgradeIds ?? [];

    for (const requiredId of required) {
      if (requiredId === upgrade.id) {
        throw new Error(`upgrade "${upgrade.id}" requires itself`);
      }

      const requirement = catalogue.upgrades[requiredId];

      if (requirement?.heroId !== undefined && upgrade.heroId !== undefined && requirement.heroId !== upgrade.heroId) {
        throw new Error(`upgrade "${upgrade.id}" requires "${requiredId}", which belongs to another hero`);
      }
    }

    const visited = new Set<string>();
    const stack = [...required];

    while (stack.length > 0) {
      const currentId = stack.pop();

      if (currentId === undefined || visited.has(currentId)) {
        continue;
      }

      if (currentId === upgrade.id) {
        throw new Error(`upgrade "${upgrade.id}" has a requirement cycle`);
      }

      visited.add(currentId);
      stack.push(...(catalogue.upgrades[currentId]?.requiresAnyOfUpgradeIds ?? []));
    }
  }
}

export function validateCatalogue(catalogue: Catalogue): void {
  validateAbilities(catalogue);
  validateHeroes(catalogue);
  validateArenas(catalogue);
  validateUpgrades(catalogue);
  validateTalentRequirements(catalogue);
}
