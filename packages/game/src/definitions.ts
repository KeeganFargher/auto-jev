import type {
  AbilityDefinitionId,
  ArenaDefinitionId,
  HeroDefinitionId,
  ReactionDefinitionId,
  UpgradeDefinitionId,
} from "./ids.js";

export type TargetPolicy = "nearest-enemy" | "lowest-hp-fraction-ally";

export type SingleTargetEffectDefinition =
  | { kind: "damage"; amount: number }
  | { kind: "heal"; amount: number }
  | { kind: "shield"; amount: number; durationTicks: number }
  | { kind: "slow"; slowFraction: number; durationTicks: number };

export interface ChainDamageEffectDefinition {
  kind: "chain-damage";
  amount: number;
  maxBounces: number;
  bounceRangeUnits: number;
}

export type EffectDefinition = SingleTargetEffectDefinition | ChainDamageEffectDefinition;

export interface AbilityDefinition {
  id: AbilityDefinitionId;
  name: string;
  cooldownTicks: number;
  targetPolicy: TargetPolicy;
  range: number;
  effects: EffectDefinition[];
}

export interface HeroDefinition {
  id: HeroDefinitionId;
  name: string;
  maxHp: number;
  moveSpeedUnitsPerSecond: number;
  basicAttackId: AbilityDefinitionId;
  abilityIds: AbilityDefinitionId[];
}

export interface ArenaDefinition {
  id: ArenaDefinitionId;
  name: string;
  width: number;
  height: number;
}

export type StatModifierKind = "flat" | "percent";

export type StatModifierTarget =
  | { kind: "max-hp" }
  | { kind: "basic-attack-cooldown" }
  | { kind: "ability-chain-bounces"; abilityId: AbilityDefinitionId }
  | { kind: "reaction-shield-amount"; reactionId: ReactionDefinitionId }
  | { kind: "slowed-target-basic-attack-damage-bonus" };

export interface StatModifier {
  target: StatModifierTarget;
  kind: StatModifierKind;
  value: number;
}

export interface UpgradeDefinition {
  id: UpgradeDefinitionId;
  name: string;
  description: string;
  heroId?: HeroDefinitionId;
  maxStacks: number;
  prerequisiteUpgradeIds?: UpgradeDefinitionId[];
  statModifiers: StatModifier[];
  grantsReactionId?: ReactionDefinitionId;
}

export type ReactionTrigger = "after-heal-effect";

export interface ReactionDefinition {
  id: ReactionDefinitionId;
  trigger: ReactionTrigger;
  shieldDurationTicks: number;
}

export interface Catalogue {
  heroes: Record<HeroDefinitionId, HeroDefinition>;
  abilities: Record<AbilityDefinitionId, AbilityDefinition>;
  arenas: Record<ArenaDefinitionId, ArenaDefinition>;
  upgrades: Record<UpgradeDefinitionId, UpgradeDefinition>;
  reactions: Record<ReactionDefinitionId, ReactionDefinition>;
}
