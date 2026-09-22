import type { Catalogue, EffectDefinition } from "@jev-game/game";

function isPositiveFinite(value: number): boolean {
  return Number.isFinite(value) && value > 0;
}

function isPositiveInteger(value: number): boolean {
  return Number.isInteger(value) && value > 0;
}

function isNonNegativeInteger(value: number): boolean {
  return Number.isInteger(value) && value >= 0;
}

function validateEffect(abilityId: string, targetPolicy: string, effect: EffectDefinition): void {
  switch (effect.kind) {
    case "damage": {
      if (!isPositiveInteger(effect.amount)) {
        throw new Error(`ability "${abilityId}" has a non-integer damage amount`);
      }

      if (targetPolicy !== "nearest-enemy") {
        throw new Error(
          `ability "${abilityId}" has a damage effect but its target policy "${targetPolicy}" does not target an enemy`,
        );
      }

      break;
    }

    case "heal": {
      if (!isPositiveInteger(effect.amount)) {
        throw new Error(`ability "${abilityId}" has a non-integer heal amount`);
      }

      if (targetPolicy !== "lowest-hp-fraction-ally") {
        throw new Error(
          `ability "${abilityId}" has a heal effect but its target policy "${targetPolicy}" does not target an ally`,
        );
      }

      break;
    }

    case "shield": {
      if (!isPositiveInteger(effect.amount) || !isPositiveInteger(effect.durationTicks)) {
        throw new Error(`ability "${abilityId}" has a non-integer shield amount or duration`);
      }

      if (targetPolicy !== "lowest-hp-fraction-ally") {
        throw new Error(
          `ability "${abilityId}" has a shield effect but its target policy "${targetPolicy}" does not target an ally`,
        );
      }

      break;
    }

    case "slow": {
      if (effect.slowFraction <= 0 || effect.slowFraction >= 1) {
        throw new Error(`ability "${abilityId}" has a slow fraction outside (0, 1) — a full root is not allowed`);
      }

      if (!isPositiveInteger(effect.durationTicks)) {
        throw new Error(`ability "${abilityId}" has a non-integer slow duration`);
      }

      if (targetPolicy !== "nearest-enemy") {
        throw new Error(
          `ability "${abilityId}" has a slow effect but its target policy "${targetPolicy}" does not target an enemy`,
        );
      }

      break;
    }

    case "chain-damage": {
      if (!isPositiveInteger(effect.amount)) {
        throw new Error(`ability "${abilityId}" has a non-integer chain-damage amount`);
      }

      if (!isNonNegativeInteger(effect.maxBounces)) {
        throw new Error(`ability "${abilityId}" has a non-integer chain-damage bounce count`);
      }

      if (!isPositiveFinite(effect.bounceRangeUnits)) {
        throw new Error(`ability "${abilityId}" has a non-positive chain-damage bounce range`);
      }

      if (targetPolicy !== "nearest-enemy") {
        throw new Error(
          `ability "${abilityId}" has a chain-damage effect but its target policy "${targetPolicy}" does not target an enemy`,
        );
      }

      break;
    }

    default: {
      const exhaustive: never = effect;

      void exhaustive;
    }
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

    if (!isPositiveFinite(ability.range)) {
      throw new Error(`ability "${ability.id}" has a non-positive or non-finite range`);
    }

    if (ability.effects.length === 0) {
      throw new Error(`ability "${ability.id}" has no effects`);
    }

    for (const effect of ability.effects) {
      validateEffect(ability.id, ability.targetPolicy, effect);
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

    if (!isPositiveFinite(hero.moveSpeedUnitsPerSecond)) {
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
  }
}

function validateReactions(catalogue: Catalogue): void {
  for (const [key, reaction] of Object.entries(catalogue.reactions)) {
    if (reaction.id !== key) {
      throw new Error(`reaction catalogue key "${key}" does not match its id "${reaction.id}"`);
    }

    if (!isPositiveInteger(reaction.shieldDurationTicks)) {
      throw new Error(`reaction "${reaction.id}" has a non-integer shield duration`);
    }

    const isGranted = Object.values(catalogue.upgrades).some(
      (upgrade) => upgrade.grantsReactionId === reaction.id,
    );

    if (!isGranted) {
      throw new Error(`reaction "${reaction.id}" is not granted by any upgrade`);
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

    if (upgrade.prerequisiteUpgradeIds !== undefined) {
      for (const prerequisiteId of upgrade.prerequisiteUpgradeIds) {
        if (catalogue.upgrades[prerequisiteId] === undefined) {
          throw new Error(
            `upgrade "${upgrade.id}" references unknown prerequisite upgrade "${prerequisiteId}"`,
          );
        }
      }
    }

    if (upgrade.statModifiers.length === 0 && upgrade.grantsReactionId === undefined) {
      throw new Error(`upgrade "${upgrade.id}" has no statModifiers and grants no reaction`);
    }

    for (const modifier of upgrade.statModifiers) {
      if (!Number.isFinite(modifier.value) || modifier.value === 0) {
        throw new Error(`upgrade "${upgrade.id}" has a zero or non-finite modifier value`);
      }

      if (
        modifier.target.kind === "ability-chain-bounces" &&
        catalogue.abilities[modifier.target.abilityId] === undefined
      ) {
        throw new Error(
          `upgrade "${upgrade.id}" references unknown ability "${modifier.target.abilityId}"`,
        );
      }

      if (
        modifier.target.kind === "reaction-shield-amount" &&
        catalogue.reactions[modifier.target.reactionId] === undefined
      ) {
        throw new Error(
          `upgrade "${upgrade.id}" references unknown reaction "${modifier.target.reactionId}"`,
        );
      }
    }

    if (upgrade.grantsReactionId !== undefined && catalogue.reactions[upgrade.grantsReactionId] === undefined) {
      throw new Error(`upgrade "${upgrade.id}" grants unknown reaction "${upgrade.grantsReactionId}"`);
    }
  }
}

function validatePrerequisiteGraph(catalogue: Catalogue): void {
  for (const upgrade of Object.values(catalogue.upgrades)) {
    if (upgrade.prerequisiteUpgradeIds === undefined) {
      continue;
    }

    for (const prerequisiteId of upgrade.prerequisiteUpgradeIds) {
      if (prerequisiteId === upgrade.id) {
        throw new Error(`upgrade "${upgrade.id}" lists itself as its own prerequisite`);
      }

      const prerequisite = catalogue.upgrades[prerequisiteId];

      if (
        prerequisite !== undefined &&
        prerequisite.heroId !== undefined &&
        upgrade.heroId !== undefined &&
        prerequisite.heroId !== upgrade.heroId
      ) {
        throw new Error(
          `upgrade "${upgrade.id}" (hero "${upgrade.heroId}") requires prerequisite "${prerequisiteId}" (hero "${prerequisite.heroId}") — permanently unreachable`,
        );
      }
    }

    const visited = new Set<string>();
    const stack = [...upgrade.prerequisiteUpgradeIds];

    while (stack.length > 0) {
      const currentId = stack.pop();

      if (currentId === undefined || visited.has(currentId)) {
        continue;
      }

      if (currentId === upgrade.id) {
        throw new Error(`upgrade "${upgrade.id}" has a prerequisite cycle`);
      }

      visited.add(currentId);
      stack.push(...(catalogue.upgrades[currentId]?.prerequisiteUpgradeIds ?? []));
    }
  }
}

export function validateCatalogue(catalogue: Catalogue): void {
  validateAbilities(catalogue);
  validateHeroes(catalogue);
  validateArenas(catalogue);
  validateUpgrades(catalogue);
  validateReactions(catalogue);
  validatePrerequisiteGraph(catalogue);
}
