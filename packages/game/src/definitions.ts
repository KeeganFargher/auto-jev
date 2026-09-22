import type { AbilityDefinitionId, ArenaDefinitionId, HeroDefinitionId } from "./ids.js";

export type TargetPolicy = "nearest-enemy" | "lowest-hp-fraction-ally";

export type EffectDefinition =
  | { kind: "damage"; amount: number }
  | { kind: "heal"; amount: number }
  | { kind: "shield"; amount: number; durationTicks: number };

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

export interface Catalogue {
  heroes: Record<HeroDefinitionId, HeroDefinition>;
  abilities: Record<AbilityDefinitionId, AbilityDefinition>;
  arenas: Record<ArenaDefinitionId, ArenaDefinition>;
}
