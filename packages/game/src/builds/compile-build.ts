import type {
  AbilityDefinitionId,
  HeroDefinitionId,
  ReactionDefinitionId,
} from "../ids.js";
import type { Catalogue, ReactionTrigger, StatModifier, StatModifierTarget } from "../definitions.js";
import type { HeroBuild } from "./state.js";
import { DEFAULT_TICK_LIMIT } from "../constants.js";

export interface CompiledReactionInstance {
  reactionId: ReactionDefinitionId;
  trigger: ReactionTrigger;
  shieldAmount: number;
  shieldDurationTicks: number;
}

export interface CompiledUnitStats {
  heroId: HeroDefinitionId;
  maxHp: number;
  moveSpeedUnitsPerSecond: number;
  abilityCooldownDurations: Record<AbilityDefinitionId, number>;
  chainBounceBonus: Record<AbilityDefinitionId, number>;
  slowedTargetBasicAttackDamageBonusFraction: number;
  reactions: CompiledReactionInstance[];
}

function statModifierKey(target: StatModifierTarget): string {
  switch (target.kind) {
    case "max-hp":
      return "max-hp";

    case "basic-attack-cooldown":
      return "basic-attack-cooldown";

    case "ability-chain-bounces":
      return `ability-chain-bounces:${target.abilityId}`;

    case "reaction-shield-amount":
      return `reaction-shield-amount:${target.reactionId}`;

    case "slowed-target-basic-attack-damage-bonus":
      return "slowed-target-basic-attack-damage-bonus";

    default: {
      const exhaustive: never = target;

      return exhaustive;
    }
  }
}

interface ModifierSums {
  flat: Map<string, number>;
  percent: Map<string, number>;
}

function addToSum(sums: Map<string, number>, key: string, amount: number): void {
  sums.set(key, (sums.get(key) ?? 0) + amount);
}

function collectModifierSums(build: HeroBuild, catalogue: Catalogue): ModifierSums {
  const flat = new Map<string, number>();
  const percent = new Map<string, number>();

  for (const selection of build.upgrades) {
    const upgrade = catalogue.upgrades[selection.upgradeId];

    if (upgrade === undefined) {
      throw new Error(`build "${build.buildId}" references unknown upgrade "${selection.upgradeId}"`);
    }

    applyModifiers(upgrade.statModifiers, selection.stacks, flat, percent);
  }

  return { flat, percent };
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

function compileStat(sums: ModifierSums, key: string, base: number): number {
  const flatSum = sums.flat.get(key) ?? 0;
  const percentSum = sums.percent.get(key) ?? 0;

  return (base + flatSum) * (1 + percentSum);
}

function grantedReactionIds(build: HeroBuild, catalogue: Catalogue): ReactionDefinitionId[] {
  const ids: ReactionDefinitionId[] = [];

  for (const selection of build.upgrades) {
    if (selection.stacks <= 0) {
      continue;
    }

    const upgrade = catalogue.upgrades[selection.upgradeId];

    if (upgrade?.grantsReactionId === undefined) {
      continue;
    }

    if (!ids.includes(upgrade.grantsReactionId)) {
      ids.push(upgrade.grantsReactionId);
    }
  }

  return ids;
}

export function compileBuild(build: HeroBuild, catalogue: Catalogue): CompiledUnitStats {
  const hero = catalogue.heroes[build.heroId];

  if (hero === undefined) {
    throw new Error(`build "${build.buildId}" references unknown hero "${build.heroId}"`);
  }

  const sums = collectModifierSums(build, catalogue);

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

  const chainBounceBonus: Record<AbilityDefinitionId, number> = {};
  const chainBounceKeys = new Set([...sums.flat.keys(), ...sums.percent.keys()]);

  for (const key of chainBounceKeys) {
    if (key.startsWith("ability-chain-bounces:")) {
      const abilityId = key.slice("ability-chain-bounces:".length);
      chainBounceBonus[abilityId] = Math.round(compileStat(sums, key, 0));
    }
  }

  const slowedTargetBasicAttackDamageBonusFraction = Math.max(
    0,
    compileStat(sums, "slowed-target-basic-attack-damage-bonus", 0),
  );

  const reactions: CompiledReactionInstance[] = grantedReactionIds(build, catalogue).map(
    (reactionId) => {
      const reaction = catalogue.reactions[reactionId];

      if (reaction === undefined) {
        throw new Error(`build "${build.buildId}" grants unknown reaction "${reactionId}"`);
      }

      const shieldAmount = Math.max(
        0,
        Math.round(compileStat(sums, `reaction-shield-amount:${reactionId}`, 0)),
      );

      return {
        reactionId,
        trigger: reaction.trigger,
        shieldAmount,
        shieldDurationTicks: reaction.shieldDurationTicks,
      };
    },
  );

  return {
    heroId: hero.id,
    maxHp,
    moveSpeedUnitsPerSecond: hero.moveSpeedUnitsPerSecond,
    abilityCooldownDurations,
    chainBounceBonus,
    slowedTargetBasicAttackDamageBonusFraction,
    reactions,
  };
}
