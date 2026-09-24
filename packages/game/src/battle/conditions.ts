import type { ComboKind, ConditionKind, School } from "../definitions.js";

export const CONDITION_KINDS: readonly ConditionKind[] = ["staggered", "brittle", "disoriented"];

export const SCHOOLS: readonly School[] = ["might", "arcana", "cunning"];

export const CONDITION_DURATION_TICKS = 90;

export const TIER_TWO_BRITTLE_DURATION_TICKS = 150;

export const OVERLOAD_BONUS_FRACTION = 1;

export const OVERLOAD_KNOCKDOWN_TICKS = 30;

export const TIER_TWO_OVERLOAD_KNOCKDOWN_TICKS = 45;

export const TIER_TWO_OVERLOAD_SPLASH_FRACTION = 0.5;

export const OVERLOAD_SPLASH_RANGE_UNITS = 12;

export const SHATTER_CRIT_MULTIPLIER = 2.5;

export const SHATTER_SHARD_FRACTION = 0.3;

export const TIER_TWO_SHATTER_SHARD_FRACTION = 0.6;

export const SHATTER_SHARD_RANGE_UNITS = 12;

export const CRUSH_BONUS_FRACTION = 1;

export const CRUSH_MANA_DRAIN_FRACTION = 0.5;

export const TIER_TWO_CRUSH_SLOW_FRACTION = 0.4;

export const TIER_TWO_CRUSH_SLOW_TICKS = 60;

export const APPLIED_BY_SCHOOL: Readonly<Record<School, ConditionKind>> = {
  might: "staggered",
  arcana: "brittle",
  cunning: "disoriented",
};

export const DETONATED_BY: Readonly<Record<ConditionKind, School>> = {
  staggered: "arcana",
  brittle: "cunning",
  disoriented: "might",
};

export const COMBO_FOR_CONDITION: Readonly<Record<ConditionKind, ComboKind>> = {
  staggered: "overload",
  brittle: "shatter",
  disoriented: "crush",
};

export function detonatesCondition(school: School, condition: ConditionKind): boolean {
  return DETONATED_BY[condition] === school;
}
