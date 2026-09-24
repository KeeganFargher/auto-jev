import type {
  AbilityDefinitionId,
  ArenaDefinitionId,
  HeroDefinitionId,
  UpgradeDefinitionId,
} from "./ids.js";

export type School = "might" | "arcana" | "cunning";

export type ConditionKind = "staggered" | "brittle" | "disoriented";

export type ComboKind = "overload" | "shatter" | "crush";

export type Archetype = "wall" | "dive" | "artillery" | "blight" | "swarm";

export type DotKind = "burn" | "poison";

export type ControlKind = "stunned" | "frozen" | "knocked-down" | "hexed";

export type AbilityTag =
  | "area"
  | "self"
  | "target"
  | "projectile"
  | "line"
  | "dash"
  | "delayed"
  | "zone"
  | "heal"
  | "summon"
  | "link"
  | "channel";

export type Rarity = "common" | "rare" | "legendary";

export type UpgradeCategory = "talent" | "item" | "rune";

export type TargetPolicy =
  | "nearest-enemy"
  | "lowest-hp-fraction-ally"
  | "lowest-hp-enemy"
  | "densest-enemy-cluster"
  | "highest-mana-enemy"
  | "biggest-shield-enemy"
  | "own-summon"
  | "self";

export type AreaDefinition =
  | { kind: "circle"; center: "self" | "target"; radiusUnits: number }
  | { kind: "line"; lengthUnits: number; widthUnits: number };

export type EffectDefinition =
  | { kind: "damage"; amount: number; maxAmount?: number }
  | { kind: "heal"; amount: number; maxHpFraction?: number }
  | { kind: "shield"; amount: number; durationTicks: number; maxHpFraction?: number }
  | { kind: "slow"; slowFraction: number; durationTicks: number }
  | { kind: "apply-condition"; condition: ConditionKind }
  | { kind: "control"; control: ControlKind; durationTicks: number }
  | { kind: "taunt"; durationTicks: number }
  | {
      kind: "dot";
      dot: DotKind;
      stacks: number;
      damagePerStackPerSecond: number;
      durationTicks: number;
      maxStacks: number;
      conditionAtStacks?: { stacks: number; condition: ConditionKind };
    }
  | { kind: "knockback"; distanceUnits: number }
  | { kind: "invulnerable"; durationTicks: number }
  | { kind: "untargetable"; durationTicks: number }
  | {
      kind: "summon";
      heroId: HeroDefinitionId;
      count: number;
      maxActive?: number;
      hpScale?: number;
      damageScale?: number;
      shieldFraction?: number;
      passives?: PassiveDefinition[];
    }
  | { kind: "bind"; fraction: number; durationTicks: number }
  | { kind: "strip-shield" };

export interface ZoneDefinition {
  radiusUnits: number;
  durationTicks: number;
  periodTicks: number;
  effects: EffectDefinition[];
  allyEffects?: EffectDefinition[];
}

export interface ChannelDefinition {
  durationTicks: number;
  periodTicks: number;
  radiusUnits: number;
  effects: EffectDefinition[];
}

export interface SecondaryEffectDefinition {
  area: AreaDefinition;
  effects: EffectDefinition[];
}

export interface CasterShieldPerTarget {
  maxHpFraction: number;
  durationTicks: number;
}

export interface AbilityDefinition {
  id: AbilityDefinitionId;
  name: string;
  cooldownTicks: number;
  targetPolicy: TargetPolicy;
  range: number;
  effects: EffectDefinition[];
  school?: School;
  manaCost?: number;
  area?: AreaDefinition;
  minTargets?: number;
  delayTicks?: number;
  zone?: ZoneDefinition;
  secondary?: SecondaryEffectDefinition;
  blinkBehindTarget?: boolean;
  casterShieldPerTarget?: CasterShieldPerTarget;
  allyEffects?: EffectDefinition[];
  maxTargets?: number;
  channel?: ChannelDefinition;
  consumesTarget?: boolean;
  canCrit?: boolean;
  tags?: AbilityTag[];
  description?: string;
}

export type PassiveDefinition =
  | { kind: "interpose"; fraction: number; rangeUnits: number }
  | { kind: "deep-freeze"; slowsNeeded: number; windowTicks: number; freezeTicks: number; radiusUnits: number }
  | { kind: "crit-vs-condition"; bonusChance: number }
  | { kind: "hp-threshold"; key: string; fraction: number; abilityId: AbilityDefinitionId }
  | { kind: "thorns"; amount: number }
  | { kind: "grudge"; perHit: number; max: number }
  | { kind: "unbreakable-while-taunting" }
  | { kind: "retribution"; radiusUnits: number; fraction: number }
  | { kind: "extra-detonation"; school: School; allowSelf: boolean }
  | { kind: "brittle-burst"; maxHpFraction: number; radiusUnits: number }
  | { kind: "evasion"; chance: number }
  | { kind: "on-kill-mana"; amount: number }
  | { kind: "on-kill-heal"; maxHpFraction: number }
  | { kind: "dot-spread-on-death"; dot: DotKind }
  | { kind: "every-nth-basic-attack"; key: string; n: number; effects: EffectDefinition[] }
  | { kind: "first-hit-per-enemy"; key: string; effects: EffectDefinition[] }
  | { kind: "taunt-immune" }
  | { kind: "revive"; hpFraction: number }
  | { kind: "refill-after-first-signature" }
  | { kind: "combo-rally"; attackSpeedPerCombo: number }
  | { kind: "combo-splash"; radiusUnits: number }
  | { kind: "last-rites"; charges: number; untargetableTicks: number }
  | { kind: "bloodlust"; attackSpeedPerMissingHp: number }
  | { kind: "siphon"; manaPerDamage: number }
  | { kind: "withering"; healingReduction: number; manaReduction: number }
  | { kind: "harvest"; soulsPerGolem: number; golemHeroId: HeroDefinitionId }
  | { kind: "soul-well"; souls: number }
  | { kind: "golem-heart"; soulsPerGolem: number; shieldFraction: number }
  | { kind: "bone-colossus"; hpScale: number; inheritsItems: boolean }
  | { kind: "overclock"; rangeUnits: number; attackSpeedBonus: number }
  | { kind: "cleave"; fraction: number; radiusUnits: number }
  | { kind: "death-knell"; maxHpFraction: number }
  | { kind: "martyrdom"; healFraction: number }
  | { kind: "summon-on-death"; heroId: HeroDefinitionId; count: number }
  | { kind: "cruel-hex"; damageTakenBonus: number }
  | {
      kind: "empower-summons";
      key: string;
      heroId: HeroDefinitionId;
      hpScale?: number;
      shieldFraction?: number;
      passives?: PassiveDefinition[];
    }
  | { kind: "sentinel-ward"; radiusUnits: number; stunTicks: number }
  | { kind: "blight-ward"; poisonReduction: number }
  | { kind: "soul-lantern" }
  | { kind: "prism" }
  | { kind: "crown-of-echoes" }
  | { kind: "blood-contract"; hpFraction: number; minHpFraction: number; cooldownTicks: number }
  | { kind: "heart-of-the-swarm" }
  | { kind: "obsidian-mirror" }
  | { kind: "soulbound"; maxHpFractionPerSecond: number };

export type PassiveKind = PassiveDefinition["kind"];

export interface HeroDefinition {
  id: HeroDefinitionId;
  name: string;
  maxHp: number;
  moveSpeedUnitsPerSecond: number;
  basicAttackId: AbilityDefinitionId;
  abilityIds: AbilityDefinitionId[];
  title?: string;
  school?: School;
  archetype?: Archetype;
  appliesCondition?: ConditionKind;
  armor?: number;
  critChance?: number;
  critMultiplier?: number;
  manaPerAttack?: number;
  passives?: PassiveDefinition[];
  summon?: boolean;
}

export interface ArenaDefinition {
  id: ArenaDefinitionId;
  name: string;
  width: number;
  height: number;
  columns: number;
  rows: number;
}

export type StatModifierKind = "flat" | "percent";

export const SIGNATURE_ABILITY = "@signature";

export const BASIC_ATTACK_ABILITY = "@basic";

export type StatModifierTarget =
  | { kind: "max-hp" }
  | { kind: "basic-attack-cooldown" }
  | { kind: "armor" }
  | { kind: "crit-chance" }
  | { kind: "crit-multiplier" }
  | { kind: "damage" }
  | { kind: "move-speed" }
  | { kind: "starting-mana" }
  | { kind: "mana-per-attack" }
  | { kind: "ability-mana-cost"; abilityId: AbilityDefinitionId }
  | { kind: "ability-damage"; abilityId: AbilityDefinitionId }
  | { kind: "ability-healing"; abilityId: AbilityDefinitionId }
  | { kind: "ability-area"; abilityId: AbilityDefinitionId }
  | { kind: "zone-duration"; abilityId: AbilityDefinitionId }
  | { kind: "slow-strength" }
  | { kind: "condition-duration" }
  | { kind: "dot-damage" }
  | { kind: "dot-max-stacks" }
  | { kind: "lifesteal" }
  | { kind: "rune-sockets" };

export interface StatModifier {
  target: StatModifierTarget;
  kind: StatModifierKind;
  value: number;
}

export interface AbilityChange {
  abilityId: AbilityDefinitionId;
  addEffects?: EffectDefinition[];
  setArea?: AreaDefinition;
  setSecondary?: SecondaryEffectDefinition;
  setZone?: ZoneDefinition;
  setSchool?: School;
  setEffects?: EffectDefinition[];
  setMaxTargets?: number;
  setChannel?: ChannelDefinition;
}

export type RuneDefinition =
  | { kind: "chain"; extraTargets: number; fraction: number; rangeUnits: number }
  | { kind: "echo"; fraction: number; delayTicks: number }
  | { kind: "widen"; radiusMultiplier: number }
  | { kind: "primer"; condition: ConditionKind }
  | { kind: "leech"; fraction: number }
  | { kind: "retaliate"; fraction: number; hpLossFraction: number }
  | { kind: "fork"; branches: number; fraction: number; angleDegrees: number; lengthUnits: number }
  | { kind: "twincast"; chance: number }
  | { kind: "split"; extraSummons: number; strength: number }
  | { kind: "empower"; strength: number }
  | { kind: "linger"; durationTicks: number; periodTicks: number; fraction: number; channelTicks: number }
  | { kind: "opener"; atTick: number }
  | { kind: "last-word" }
  | { kind: "tandem"; fraction: number; cooldownTicks: number }
  | { kind: "resonance" }
  | { kind: "haste"; manaCostMultiplier: number }
  | { kind: "overcharge"; effectMultiplier: number; hpCostFraction: number };

export type RuneKind = RuneDefinition["kind"];

export interface UpgradeDefinition {
  id: UpgradeDefinitionId;
  name: string;
  description: string;
  heroId?: HeroDefinitionId;
  maxStacks: number;
  statModifiers: StatModifier[];
  category: UpgradeCategory;
  tier?: number;
  path?: "left" | "right";
  rarity?: Rarity;
  cursed?: boolean;
  requiresAnyOfUpgradeIds?: UpgradeDefinitionId[];
  excludesUpgradeIds?: UpgradeDefinitionId[];
  grantsPassives?: PassiveDefinition[];
  abilityChanges?: AbilityChange[];
  rune?: RuneDefinition;
  runeFits?: AbilityTag[];
  unlocksRuneSocket?: boolean;
}

export interface Catalogue {
  heroes: Record<HeroDefinitionId, HeroDefinition>;
  abilities: Record<AbilityDefinitionId, AbilityDefinition>;
  arenas: Record<ArenaDefinitionId, ArenaDefinition>;
  upgrades: Record<UpgradeDefinitionId, UpgradeDefinition>;
}
