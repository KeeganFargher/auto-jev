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

export type HitType = "attack" | "spell";

export type SkillTag =
  | "strike"
  | "target"
  | "projectile"
  | "area"
  | "line"
  | "dash"
  | "delayed"
  | "channel"
  | "zone"
  | "summon"
  | "link"
  | "self"
  | "heal";

export type SkillSlot = "ability" | "ultimate";

export const SKILL_SLOTS: readonly SkillSlot[] = ["ability", "ultimate"];

export type GemFit = SkillTag | HitType | "any" | "damaging";

export type Rarity = "common" | "rare" | "legendary";

export type UpgradeCategory = "level" | "item" | "gem";

export const PICK_LEVELS = [2, 3, 4] as const;

export type PickLevel = (typeof PICK_LEVELS)[number];

export const MAX_HERO_LEVEL = 4;

export type TargetPolicy =
  | "nearest-enemy"
  | "lowest-hp-fraction-ally"
  | "lowest-hp-enemy"
  | "densest-enemy-cluster"
  | "highest-mana-enemy"
  | "busiest-corpse"
  | "self";

export type AreaDefinition =
  | { kind: "circle"; center: "self" | "target"; radiusUnits: number }
  | { kind: "line"; lengthUnits: number; widthUnits: number };

export interface ConsumeDefinition {
  summonId: HeroDefinitionId;
}

export interface ArmyMerge {
  heroId: HeroDefinitionId;
  damagePerBody: number;
}

export interface RaiseArmyEffect {
  kind: "raise-army";
  strength: number;
  lifetimeTicks: number;
  thrallHeroId: HeroDefinitionId;
  thralls: number;
  thrallScale: number;
  merge?: ArmyMerge;
}

export interface BindEffect {
  kind: "bind";
  fraction: number;
  durationTicks: number;
  puppetTicks?: number;
}

export type EffectDefinition =
  | { kind: "damage"; amount: number; maxAmount?: number; casterMaxHpFraction?: number; consumedMaxHpFraction?: number }
  | { kind: "strike"; scale: number }
  | { kind: "heal"; amount: number; maxHpFraction?: number }
  | { kind: "shield"; amount: number; durationTicks: number; maxHpFraction?: number; casterMaxHpFraction?: number }
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
      maxStacks?: number;
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
      carriesGems?: boolean;
    }
  | RaiseArmyEffect
  | BindEffect
  | { kind: "chill"; stacks: number }
  | { kind: "mark"; bonus: number; durationTicks: number }
  | {
      kind: "resurrect";
      hpFraction: number;
      all: boolean;
      staggerRadiusUnits: number;
      fallbackInvulnerableTicks: number;
      dangerHpFraction: number;
    }
  | {
      kind: "pandemic";
      stackMultiplier: number;
      durationTicks: number;
      tickRateMultiplier: number;
      spread?: PandemicSpread;
      burstAtStacks?: number;
    };

export interface PandemicSpread {
  radiusUnits: number;
  fraction: number;
}

export interface ZoneDefinition {
  radiusUnits: number;
  durationTicks: number;
  periodTicks: number;
  effects: EffectDefinition[];
  allyEffects?: EffectDefinition[];
  followsSource?: boolean;
  fullHits?: boolean;
  count?: number;
}

export interface PullDefinition {
  radiusUnits: number;
  distanceUnits: number;
}

export interface ChannelDefinition {
  durationTicks: number;
  periodTicks: number;
  radiusUnits: number;
  effects: EffectDefinition[];
  unstoppable?: boolean;
  drifts?: boolean;
  pull?: PullDefinition;
  endZone?: ZoneDefinition;
}

export interface DashDefinition {
  hops: number;
  periodTicks: number;
  hopRangeUnits: number;
  finalEffects?: EffectDefinition[];
  untargetable?: boolean;
  endBehindLowestHero?: boolean;
  splashRadiusUnits?: number;
  critBonusPerHop?: number;
  markPerStrike?: number;
}

export interface ReturnSweep {
  widthUnits: number;
  fraction: number;
  casterShieldMaxHpFraction: number;
  shieldDurationTicks: number;
}

export interface BounceDefinition {
  count: number;
  rangeUnits: number;
  knockbackUnits?: number;
  allyEffects?: EffectDefinition[];
  returnSweep?: ReturnSweep;
  trail?: AbilityDefinitionId;
}

export interface FormRetaliation {
  abilityId: AbilityDefinitionId;
  perAttackerTicks: number;
}

export interface FormBurst {
  damageTakenFraction: number;
  radiusUnits: number;
  effects: EffectDefinition[];
}

export interface FormEveryNthHit {
  n: number;
  abilityId: AbilityDefinitionId;
  rechargeTicks: number;
}

export interface FormDefinition {
  key: string;
  durationTicks: number;
  damageTakenMultiplier?: number;
  minHp?: number;
  retaliate?: FormRetaliation;
  endBurst?: FormBurst;
  castEveryNthHitTaken?: FormEveryNthHit;
  storeMultiplier?: number;
  attackSpeedBonus?: number;
  basicAttackId?: AbilityDefinitionId;
  drainsStacksKey?: string;
  raisesOnKill?: HeroDefinitionId;
  commandsSummons?: boolean;
  summonsFollow?: boolean;
  endsWhenShieldBreaks?: boolean;
  locksMana?: boolean;
}

export interface ShowerDefinition {
  count: number;
  intervalTicks: number;
  landDelayTicks: number;
  pull?: PullDefinition;
}

export interface SplitDefinition {
  count: number;
  rangeUnits: number;
  fraction: number;
}

export interface BombDefinition {
  delayTicks: number;
  abilityId: AbilityDefinitionId;
}

export type EmitterTargets = "nearest" | "all";

export interface EmitterDefinition {
  count: number;
  spreadDegrees: number;
  travelUnits: number;
  durationTicks: number;
  periodTicks: number;
  radiusUnits: number;
  targets: EmitterTargets;
  shotsAs?: AbilityDefinitionId;
}

export interface PoisonGate {
  targets: number;
  stacks: number;
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
  hitType: HitType;
  tags: SkillTag[];
  cooldownTicks: number;
  initialCooldownTicks?: number;
  targetPolicy: TargetPolicy;
  range: number;
  effects: EffectDefinition[];
  school?: School;
  manaCost?: number;
  hpCostFraction?: number;
  area?: AreaDefinition;
  minTargets?: number;
  requiresPoisoned?: PoisonGate;
  delayTicks?: number;
  zone?: ZoneDefinition;
  secondary?: SecondaryEffectDefinition;
  blinkBehindTarget?: boolean;
  dash?: DashDefinition;
  casterShieldPerTarget?: CasterShieldPerTarget;
  allyEffects?: EffectDefinition[];
  maxTargets?: number;
  channel?: ChannelDefinition;
  bounces?: BounceDefinition;
  form?: FormDefinition;
  shower?: ShowerDefinition;
  splits?: SplitDefinition;
  bomb?: BombDefinition;
  emitter?: EmitterDefinition;
  consumes?: ConsumeDefinition;
  canCrit?: boolean;
  description?: string;
}

export type StackGain = "crit" | "attack-hit" | "spell-cast" | "basic-attack";

export type StackGainRule = { on: StackGain; amount: number } | { on: "bound-damage"; amount: number; per: number };

export interface StackDecay {
  idleTicks: number;
  everyTicks: number;
  amount: number;
}

export interface ExtraTargets {
  count: number;
  rangeUnits: number;
}

export interface StackMaxEffects {
  cleaveFraction?: number;
  cleaveRadiusUnits?: number;
  controlImmune?: boolean;
  resetsAbilityId?: AbilityDefinitionId;
  form?: FormDefinition;
  extraTargets?: ExtraTargets;
}

export interface StacksPatch {
  startsAt?: number;
  removeDecay?: boolean;
  atMax?: StackMaxEffects;
  channelHastePerStack?: number;
}

export interface PassiveChange {
  key: string;
  stacks: StacksPatch;
}

export type PassiveDefinition =
  | { kind: "deep-freeze"; name: string; chillsToFreeze: number; chillTicks: number; freezeTicks: number; condition: ConditionKind }
  | { kind: "crit-vs-condition"; bonusChance: number }
  | { kind: "thorns"; amount: number; maxHpFraction?: number; attacksOnly?: boolean }
  | { kind: "extra-detonation"; school: School; allowSelf: boolean; abilityIds?: AbilityDefinitionId[] }
  | { kind: "evasion"; chance: number }
  | { kind: "every-nth-attack"; key: string; n: number; effects: EffectDefinition[] }
  | { kind: "first-hit-per-enemy"; key: string; effects: EffectDefinition[] }
  | { kind: "taunt-immune" }
  | { kind: "revive"; hpFraction: number; form?: FormDefinition; statueTicks?: number }
  | { kind: "combo-rally"; attackSpeedPerCombo: number }
  | { kind: "combo-splash"; radiusUnits: number }
  | { kind: "withering"; healingReduction: number; manaReduction: number; fullAtStacks?: number }
  | {
      kind: "virulence";
      name: string;
      condition: ConditionKind;
      conditionAtStacks: number;
      burstAtStacks: number;
      spreadFraction: number;
      spreadRadiusUnits: number;
      windowTicks: number;
    }
  | { kind: "contagion"; targets: number; fraction: number }
  | { kind: "toxic-tether"; fraction: number }
  | { kind: "crusader"; fraction: number }
  | {
      kind: "blessed-overflow";
      name: string;
      capMaxHpFraction: number;
      durationTicks: number;
      burstFraction: number;
      burstRadiusUnits: number;
    }
  | { kind: "harvest"; name: string; soulsPer: number; heroId: HeroDefinitionId; maxActive: number }
  | { kind: "grave-chain"; delayTicks: number; markTicks: number }
  | { kind: "overclock"; name: string; heroId: HeroDefinitionId; rangeUnits: number; bonusPerSecond: number; maxBonus: number }
  | { kind: "self-destruct"; abilityId: AbilityDefinitionId; delayTicks: number }
  | { kind: "cleave"; fraction: number; radiusUnits: number }
  | { kind: "death-knell"; maxHpFraction: number }
  | { kind: "ill-omen" }
  | {
      kind: "empower-summons";
      key: string;
      heroId: HeroDefinitionId;
      hpScale?: number;
      shieldFraction?: number;
      passives?: PassiveDefinition[];
      gems?: GemDefinition[];
    }
  | { kind: "sentinel-ward"; radiusUnits: number; stunTicks: number }
  | { kind: "blight-ward"; poisonReduction: number }
  | { kind: "prism" }
  | { kind: "crown-of-echoes" }
  | { kind: "blood-pact"; hpFraction: number; minHpFraction: number; floorTicks: number }
  | { kind: "chain-lightning"; chance: number; damage: number; bounces: number; rangeUnits: number; school: School }
  | { kind: "essence-siphon"; steal: number; durationTicks: number }
  | { kind: "spellblade-hilt" }
  | { kind: "heart-of-the-swarm" }
  | { kind: "obsidian-mirror" }
  | { kind: "soulbound"; maxHpFractionPerSecond: number }
  | {
      kind: "stacks";
      key: string;
      name: string;
      description: string;
      gains: StackGainRule[];
      max: number;
      attackSpeedPerStack: number;
      spentBy?: AbilityDefinitionId;
      extraHopsPerStack?: number;
      startsAt?: number;
      decay?: StackDecay;
      atMax?: StackMaxEffects;
      channelHastePerStack?: number;
    }
  | {
      kind: "damage-store";
      key: string;
      name: string;
      description: string;
      fraction: number;
      capMaxHpFraction: number;
      releasedBy: AbilityDefinitionId;
    }
  | { kind: "quicksilver"; attackSpeedBonus: number; durationTicks: number }
  | { kind: "null-talisman"; radiusUnits: number }
  | { kind: "spell-siphon"; mana: number; perTargetTicks: number }
  | { kind: "voidheart"; abilityId: AbilityDefinitionId; delayTicks: number }
  | { kind: "infinity-band"; rechargeMultiplier: number }
  | { kind: "unhealable" }
  | { kind: "unstable-core"; hpFraction: number; delayTicks: number }
  | { kind: "dash-trail"; abilityId: AbilityDefinitionId; spacingUnits: number; maxZones: number }
  | { kind: "executioner"; fromAbilityIds: AbilityDefinitionId[]; resetsAbilityId: AbilityDefinitionId }
  | { kind: "shadow-clone"; abilityId: AbilityDefinitionId; delayTicks: number; fraction: number };

export type PassiveKind = PassiveDefinition["kind"];

export interface HeroDefinition {
  id: HeroDefinitionId;
  name: string;
  maxHp: number;
  moveSpeedUnitsPerSecond: number;
  basicAttackId: AbilityDefinitionId;
  abilityId?: AbilityDefinitionId;
  ultimateId?: AbilityDefinitionId;
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

export const ULTIMATE_SKILL = "@ultimate";

export const ABILITY_SKILL = "@ability";

export const BASIC_ATTACK_ABILITY = "@basic";

export type StatModifierTarget =
  | { kind: "max-hp" }
  | { kind: "basic-attack-cooldown" }
  | { kind: "armor" }
  | { kind: "crit-chance" }
  | { kind: "crit-multiplier" }
  | { kind: "damage" }
  | { kind: "attack-damage" }
  | { kind: "spell-damage" }
  | { kind: "dash-reach" }
  | { kind: "move-speed" }
  | { kind: "mana-per-attack" }
  | { kind: "ability-mana-cost"; abilityId: AbilityDefinitionId }
  | { kind: "ability-damage"; abilityId: AbilityDefinitionId }
  | { kind: "ability-healing"; abilityId: AbilityDefinitionId }
  | { kind: "ability-area"; abilityId: AbilityDefinitionId }
  | { kind: "ability-cooldown"; abilityId: AbilityDefinitionId }
  | { kind: "zone-duration"; abilityId: AbilityDefinitionId }
  | { kind: "slow-strength" }
  | { kind: "condition-duration" }
  | { kind: "lifesteal" };

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
  setEffects?: EffectDefinition[];
  setMaxTargets?: number;
  patchChannel?: Partial<ChannelDefinition>;
  addHops?: number;
  patchDash?: Partial<DashDefinition>;
  setBounces?: BounceDefinition;
  addBounces?: number;
  patchBounces?: Partial<BounceDefinition>;
  patchForm?: Partial<FormDefinition>;
  patchShower?: Partial<ShowerDefinition>;
  setSplits?: SplitDefinition;
  setBomb?: BombDefinition;
  setEmitter?: EmitterDefinition;
  patchEmitter?: Partial<EmitterDefinition>;
  setHpCostFraction?: number;
  setForm?: FormDefinition;
  patchBind?: Partial<Omit<BindEffect, "kind">>;
}

export type TriggerEvent = "crit" | "kill" | "damaged" | "detonation" | "opener" | "last-word" | "dash" | "nth-attack";

export type GemDefinition =
  | { kind: "chain"; extraTargets: number; fraction: number; rangeUnits: number }
  | { kind: "fork"; branches: number; fraction: number; rangeUnits: number }
  | { kind: "widen"; radiusMultiplier: number }
  | { kind: "linger"; durationTicks: number; periodTicks: number; fraction: number; channelTicks: number }
  | { kind: "multistrike"; repeats: number; delayTicks: number; fraction: number }
  | { kind: "multicast"; delayTicks: number; fraction: number }
  | { kind: "trigger"; on: TriggerEvent; rechargeTicks: number; fraction: number; hpLossFraction?: number; atTick?: number; every?: number }
  | { kind: "barrage"; extraProjectiles: number; fraction: number }
  | { kind: "pierce"; widthUnits: number }
  | { kind: "concentrate"; radiusMultiplier: number; damageMultiplier: number }
  | { kind: "vortex"; pullUnits: number; reachMultiplier: number }
  | { kind: "ruthless"; every: number; damageMultiplier: number; stunTicks: number }
  | { kind: "culling"; threshold: number }
  | { kind: "primer"; condition: ConditionKind }
  | { kind: "leech"; fraction: number }
  | { kind: "resonance" }
  | { kind: "split"; extraSummons: number; strength: number }
  | { kind: "empower"; strength: number }
  | { kind: "haste"; multiplier: number }
  | { kind: "overcharge"; effectMultiplier: number; hpCostFraction: number };

export type GemKind = GemDefinition["kind"];

export interface UpgradeDefinition {
  id: UpgradeDefinitionId;
  name: string;
  description: string;
  heroId?: HeroDefinitionId;
  maxStacks: number;
  statModifiers: StatModifier[];
  category: UpgradeCategory;
  level?: PickLevel;
  path?: "left" | "right";
  rarity?: Rarity;
  cursed?: boolean;
  extraGemSockets?: number;
  grantsPassives?: PassiveDefinition[];
  passiveChanges?: PassiveChange[];
  abilityChanges?: AbilityChange[];
  gem?: GemDefinition;
  gemFits?: GemFit[];
}

export interface Catalogue {
  heroes: Record<HeroDefinitionId, HeroDefinition>;
  abilities: Record<AbilityDefinitionId, AbilityDefinition>;
  arenas: Record<ArenaDefinitionId, ArenaDefinition>;
  upgrades: Record<UpgradeDefinitionId, UpgradeDefinition>;
}
