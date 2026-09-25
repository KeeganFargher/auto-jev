import {
  ABILITY_SKILL,
  BASIC_ATTACK_ABILITY,
  PICK_LEVELS,
  ULTIMATE_SKILL,
  appliedConditions,
  compileBuild,
  createHeroBuild,
  type AreaDefinition,
  type BombDefinition,
  type BounceDefinition,
  type Catalogue,
  type EmitterDefinition,
  type EffectDefinition,
  type FormDefinition,
  type GemDefinition,
  type PassiveDefinition,
  type UpgradeDefinition,
  type ZoneDefinition,
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
    case "strike": {
      if (!isPositiveFinite(effect.scale)) {
        throw new Error(`ability "${abilityId}" has a non-positive strike scale`);
      }

      requireSide(abilityId, "strike", side, ["enemy"]);
      break;
    }

    case "damage": {
      if (!isNonNegativeInteger(effect.amount) || (effect.amount === 0 && (effect.casterMaxHpFraction ?? 0) <= 0 && (effect.consumedMaxHpFraction ?? 0) <= 0)) {
        throw new Error(`ability "${abilityId}" has a non-integer damage amount`);
      }

      if (effect.maxAmount !== undefined && (!Number.isInteger(effect.maxAmount) || effect.maxAmount < effect.amount)) {
        throw new Error(`ability "${abilityId}" has a damage range whose maximum is not a whole number at or above its minimum`);
      }

      if (effect.consumedMaxHpFraction !== undefined && !isUnitFraction(effect.consumedMaxHpFraction)) {
        throw new Error(`ability "${abilityId}" has an invalid consumed-HP damage fraction`);
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

      if (
        effect.kind === "dot" &&
        (!isPositiveInteger(effect.stacks) || (effect.maxStacks !== undefined && !isPositiveInteger(effect.maxStacks)) || !isPositiveFinite(effect.damagePerStackPerSecond))
      ) {
        throw new Error(`ability "${abilityId}" has an invalid damage-over-time definition`);
      }

      break;
    }

    case "bind": {
      requireSide(abilityId, "bind", side, ["enemy"]);

      if (!(effect.fraction > 0 && effect.fraction <= 1) || !isPositiveInteger(effect.durationTicks) || (effect.puppetTicks !== undefined && !isPositiveInteger(effect.puppetTicks))) {
        throw new Error(`ability "${abilityId}" has an invalid bind`);
      }

      break;
    }

    case "pandemic": {
      requireSide(abilityId, "pandemic", side, ["enemy"]);

      const spread = effect.spread;

      if (
        !(effect.stackMultiplier >= 1) ||
        !Number.isFinite(effect.stackMultiplier) ||
        !isPositiveInteger(effect.durationTicks) ||
        !(effect.tickRateMultiplier >= 1) ||
        !Number.isFinite(effect.tickRateMultiplier) ||
        (spread !== undefined && (!isPositiveFinite(spread.radiusUnits) || !isUnitFraction(spread.fraction))) ||
        (effect.burstAtStacks !== undefined && !isPositiveInteger(effect.burstAtStacks))
      ) {
        throw new Error(`ability "${abilityId}" has an invalid pandemic`);
      }

      break;
    }

    case "chill": {
      requireSide(abilityId, "chill", side, ["enemy"]);

      if (!isPositiveInteger(effect.stacks)) {
        throw new Error(`ability "${abilityId}" has a non-integer chill`);
      }

      break;
    }

    case "mark": {
      requireSide(abilityId, "mark", side, ["enemy"]);

      if (!isUnitFraction(effect.bonus) || !isPositiveInteger(effect.durationTicks)) {
        throw new Error(`ability "${abilityId}" has an invalid damage mark`);
      }

      break;
    }

    case "summon": {
      requireSide(abilityId, "summon", side, ["self"]);

      if (!isPositiveInteger(effect.count) || (effect.maxActive !== undefined && !isPositiveInteger(effect.maxActive))) {
        throw new Error(`ability "${abilityId}" has an invalid summon count`);
      }

      break;
    }

    case "raise-army": {
      requireSide(abilityId, "raise-army", side, ["self"]);

      if (
        !isPositiveFinite(effect.strength) ||
        !isPositiveInteger(effect.lifetimeTicks) ||
        !isNonNegativeInteger(effect.thralls) ||
        !isPositiveFinite(effect.thrallScale) ||
        (effect.merge !== undefined && !(Number.isFinite(effect.merge.damagePerBody) && effect.merge.damagePerBody >= 0))
      ) {
        throw new Error(`ability "${abilityId}" has an invalid raise-army`);
      }

      break;
    }

    case "resurrect": {
      requireSide(abilityId, "resurrect", side, ["self"]);

      if (
        !isUnitFraction(effect.hpFraction) ||
        !isPositiveFinite(effect.staggerRadiusUnits) ||
        !isPositiveInteger(effect.fallbackInvulnerableTicks) ||
        !(effect.dangerHpFraction > 0 && effect.dangerHpFraction < 1)
      ) {
        throw new Error(`ability "${abilityId}" has an invalid resurrect`);
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

function bodyBlastIds(catalogue: Catalogue): Set<string> {
  const passives = [...Object.values(catalogue.heroes).flatMap((hero) => hero.passives ?? []), ...Object.values(catalogue.upgrades).flatMap((upgrade) => upgrade.grantsPassives ?? [])];

  return new Set(passives.flatMap((passive) => (passive.kind === "voidheart" ? [passive.abilityId] : [])));
}

function validateAbilities(catalogue: Catalogue): void {
  const bodyBlasts = bodyBlastIds(catalogue);

  for (const [key, ability] of Object.entries(catalogue.abilities)) {
    if (ability.id !== key) {
      throw new Error(`ability catalogue key "${key}" does not match its id "${ability.id}"`);
    }

    if (!isPositiveInteger(ability.cooldownTicks)) {
      throw new Error(`ability "${ability.id}" has a non-integer cooldown`);
    }

    if (ability.initialCooldownTicks !== undefined && !isNonNegativeInteger(ability.initialCooldownTicks)) {
      throw new Error(`ability "${ability.id}" has a non-integer starting cooldown`);
    }

    if (ability.tags.length === 0) {
      throw new Error(`ability "${ability.id}" has no tags`);
    }

    if (ability.dash !== undefined) {
      const dash = ability.dash;

      if (!isPositiveInteger(dash.hops) || !isPositiveInteger(dash.periodTicks) || !(dash.hopRangeUnits >= 0)) {
        throw new Error(`ability "${ability.id}" has an invalid dash`);
      }

      for (const effect of dash.finalEffects ?? []) {
        validateEffect(ability.id, "enemy", effect);
      }
    }

    if (ability.targetPolicy === "self" ? !(ability.range >= 0) : !isPositiveFinite(ability.range)) {
      throw new Error(`ability "${ability.id}" has a non-positive or non-finite range`);
    }

    if (ability.effects.length === 0 && ability.channel === undefined && ability.zone === undefined) {
      throw new Error(`ability "${ability.id}" has no effects`);
    }

    if (ability.maxTargets !== undefined && !isPositiveInteger(ability.maxTargets)) {
      throw new Error(`ability "${ability.id}" has a non-integer target cap`);
    }

    if (ability.requiresPoisoned !== undefined && (!isPositiveInteger(ability.requiresPoisoned.targets) || !isPositiveInteger(ability.requiresPoisoned.stacks))) {
      throw new Error(`ability "${ability.id}" has an invalid poison gate`);
    }

    if ((ability.consumes !== undefined) !== (ability.targetPolicy === "busiest-corpse")) {
      throw new Error(`ability "${ability.id}" must both aim at corpses and consume them, or do neither`);
    }

    if (ability.consumes !== undefined && catalogue.heroes[ability.consumes.summonId]?.summon !== true) {
      throw new Error(`ability "${ability.id}" consumes "${ability.consumes.summonId}", which isn't a summon hero`);
    }

    if (ability.targetPolicy === "busiest-corpse" && ability.area?.kind !== "circle") {
      throw new Error(`ability "${ability.id}" aims at a corpse but has no circle area`);
    }

    if (ability.consumes === undefined && !bodyBlasts.has(ability.id) && ability.effects.some((effect) => effect.kind === "damage" && effect.consumedMaxHpFraction !== undefined)) {
      throw new Error(`ability "${ability.id}" deals damage from a body but neither consumes one nor bursts one`);
    }

    for (const effect of [...ability.effects, ...(ability.allyEffects ?? [])]) {
      if (effect.kind === "summon" && catalogue.heroes[effect.heroId]?.summon !== true) {
        throw new Error(`ability "${ability.id}" summons "${effect.heroId}", which isn't a summon hero`);
      }

      for (const raised of effect.kind === "raise-army" ? [effect.thrallHeroId, ...(effect.merge === undefined ? [] : [effect.merge.heroId])] : []) {
        if (catalogue.heroes[raised]?.summon !== true) {
          throw new Error(`ability "${ability.id}" raises "${raised}", which isn't a summon hero`);
        }
      }

      if (effect.kind === "summon") {
        validatePassives(catalogue, `ability "${ability.id}" summon`, effect.passives ?? []);
      }
    }

    validateCarriers(`ability "${ability.id}"`, ability.effects);

    if (ability.form !== undefined) {
      validateForm(`ability "${ability.id}"`, ability.form, ability.effects);
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

      if (channel.pull !== undefined && (!isPositiveFinite(channel.pull.radiusUnits) || !isPositiveFinite(channel.pull.distanceUnits))) {
        throw new Error(`ability "${ability.id}" has an invalid channel pull`);
      }

      for (const effect of channel.effects) {
        validateEffect(ability.id, "enemy", effect);
      }

      if (channel.endZone !== undefined) {
        validateZone(ability.id, channel.endZone);
      }
    }

    if (ability.secondary !== undefined) {
      validateArea(ability.id, ability.secondary.area);

      for (const effect of ability.secondary.effects) {
        validateEffect(ability.id, "enemy", effect);
      }
    }

    if (ability.zone !== undefined) {
      validateZone(ability.id, ability.zone);
    }

    if (ability.bounces !== undefined) {
      validateBounces(catalogue, ability.id, ability.bounces);
    }

    if (ability.hpCostFraction !== undefined) {
      validateHpCost(ability.id, ability.hpCostFraction);
    }

    if (ability.bomb !== undefined) {
      validateBomb(catalogue, `ability "${ability.id}"`, ability.bomb);
    }

    if (ability.emitter !== undefined) {
      validateEmitter(catalogue, `ability "${ability.id}"`, ability.emitter);
    }
  }
}

function validateCarriers(owner: string, effects: readonly EffectDefinition[]): void {
  if (effects.filter((effect) => effect.kind === "summon" && effect.carriesGems === true).length > 1) {
    throw new Error(`${owner} hands its gems to more than one summon`);
  }
}

function validateForm(owner: string, form: Partial<FormDefinition>, effects: readonly EffectDefinition[]): void {
  if (form.endsWhenShieldBreaks === true && !effects.some((effect) => effect.kind === "shield")) {
    throw new Error(`${owner} has a form that ends when its shield breaks, but grants no shield`);
  }

  for (const effect of form.endBurst?.effects ?? []) {
    validateEffect(owner, "enemy", effect);
  }
}

function validateEmitter(catalogue: Catalogue, owner: string, emitter: EmitterDefinition): void {
  const emitterIsValid =
    isPositiveInteger(emitter.count) &&
    emitter.spreadDegrees >= 0 &&
    emitter.travelUnits >= 0 &&
    isPositiveInteger(emitter.durationTicks) &&
    isPositiveInteger(emitter.periodTicks) &&
    emitter.periodTicks <= emitter.durationTicks &&
    isPositiveFinite(emitter.radiusUnits);

  if (!emitterIsValid) {
    throw new Error(`${owner} has an invalid emitter`);
  }

  if (emitter.shotsAs !== undefined && !abilityReferenceExists(catalogue, emitter.shotsAs)) {
    throw new Error(`${owner} shoots as unknown ability "${emitter.shotsAs}"`);
  }
}

function validateBomb(catalogue: Catalogue, owner: string, bomb: BombDefinition): void {
  if (!isPositiveInteger(bomb.delayTicks) || catalogue.abilities[bomb.abilityId]?.area?.kind !== "circle") {
    throw new Error(`${owner} plants a bomb with a bad delay or a blast "${bomb.abilityId}" that isn't a circle ability`);
  }
}

function validateBounces(catalogue: Catalogue, abilityId: string, bounces: BounceDefinition): void {
  if (!isPositiveInteger(bounces.count) || !isPositiveFinite(bounces.rangeUnits)) {
    throw new Error(`ability "${abilityId}" has invalid bounces`);
  }

  for (const effect of bounces.allyEffects ?? []) {
    validateEffect(abilityId, "ally", effect);
  }

  if (bounces.trail !== undefined) {
    validateTrail(catalogue, abilityId, bounces.trail);
  }
}

function validateTrail(catalogue: Catalogue, abilityId: string, trail: string): void {
  if (catalogue.abilities[trail]?.zone === undefined) {
    throw new Error(`ability "${abilityId}" leaves a trail of "${trail}", which isn't a zone ability`);
  }
}

function validateHpCost(owner: string, fraction: number): void {
  if (!(fraction > 0 && fraction < 1)) {
    throw new Error(`${owner} costs a fraction of HP outside (0, 1)`);
  }
}

function validateZone(abilityId: string, zone: ZoneDefinition): void {
  if (!isPositiveFinite(zone.radiusUnits) || !isPositiveInteger(zone.durationTicks) || !isPositiveInteger(zone.periodTicks) || (zone.count !== undefined && !isPositiveInteger(zone.count))) {
    throw new Error(`ability "${abilityId}" has an invalid zone`);
  }

  for (const effect of zone.effects) {
    validateEffect(abilityId, "enemy", effect);
  }

  for (const effect of zone.allyEffects ?? []) {
    validateEffect(abilityId, "ally", effect);
  }
}

function stackReferences(passive: Extract<PassiveDefinition, { kind: "stacks" }>): string[] {
  const references: string[] = [];

  if (passive.spentBy !== undefined) {
    references.push(passive.spentBy);
  }

  if (passive.atMax?.resetsAbilityId !== undefined) {
    references.push(passive.atMax.resetsAbilityId);
  }

  return references;
}

function stacksAreValid(passive: Extract<PassiveDefinition, { kind: "stacks" }>): boolean {
  const decay = passive.decay;

  return (
    isPositiveInteger(passive.max) &&
    passive.gains.length > 0 &&
    passive.gains.every((rule) => isPositiveInteger(rule.amount) && (rule.on !== "bound-damage" || isPositiveFinite(rule.per))) &&
    passive.attackSpeedPerStack >= 0 &&
    (passive.startsAt === undefined || (Number.isInteger(passive.startsAt) && passive.startsAt >= 0 && passive.startsAt <= passive.max)) &&
    (decay === undefined || (Number.isInteger(decay.idleTicks) && decay.idleTicks >= 0 && isPositiveInteger(decay.everyTicks) && isPositiveInteger(decay.amount))) &&
    (passive.channelHastePerStack === undefined || passive.channelHastePerStack >= 0) &&
    (passive.atMax?.cleaveFraction === undefined || isUnitFraction(passive.atMax.cleaveFraction)) &&
    (passive.atMax?.extraTargets === undefined ||
      (passive.spentBy !== undefined && isPositiveInteger(passive.atMax.extraTargets.count) && isPositiveFinite(passive.atMax.extraTargets.rangeUnits)))
  );
}

function abilityReferenceExists(catalogue: Catalogue, abilityId: string): boolean {
  return (
    abilityId === ULTIMATE_SKILL ||
    abilityId === ABILITY_SKILL ||
    abilityId === BASIC_ATTACK_ABILITY ||
    catalogue.abilities[abilityId] !== undefined
  );
}

function validatePassives(catalogue: Catalogue, owner: string, passives: readonly PassiveDefinition[]): void {
  for (const passive of passives) {
    if (passive.kind === "every-nth-attack" && !isPositiveInteger(passive.n)) {
      throw new Error(`${owner} has a non-integer attack count`);
    }

    if (passive.kind === "spell-siphon" && !(passive.mana > 0 && isPositiveInteger(passive.perTargetTicks))) {
      throw new Error(`${owner} has a spell siphon without positive mana and a whole-tick limit`);
    }

    if (passive.kind === "dash-trail") {
      if (catalogue.abilities[passive.abilityId]?.zone === undefined) {
        throw new Error(`${owner} leaves a trail with "${passive.abilityId}", which is not a zone ability`);
      }

      if (!(passive.spacingUnits > 0 && isPositiveInteger(passive.maxZones))) {
        throw new Error(`${owner} has a dash trail without positive spacing and a whole zone count`);
      }
    }

    if (passive.kind === "stacks" && !stacksAreValid(passive)) {
      throw new Error(`${owner} has invalid ${passive.name} stacks`);
    }

    const referenced =
      passive.kind === "stacks"
        ? stackReferences(passive)
        : passive.kind === "shadow-clone"
          ? [passive.abilityId]
          : passive.kind === "executioner"
            ? [...passive.fromAbilityIds, passive.resetsAbilityId]
            : passive.kind === "extra-detonation"
              ? (passive.abilityIds ?? [])
              : [];

    for (const abilityId of referenced) {
      if (catalogue.abilities[abilityId] === undefined) {
        throw new Error(`${owner} references unknown ability "${abilityId}"`);
      }
    }

    if (passive.kind === "every-nth-attack" || passive.kind === "first-hit-per-enemy") {
      for (const effect of passive.effects) {
        validateEffect(owner, "enemy", effect);
      }
    }

    if (passive.kind === "harvest" && catalogue.heroes[passive.heroId]?.summon !== true) {
      throw new Error(`${owner} harvests "${passive.heroId}", which isn't a summon hero`);
    }

    if (passive.kind === "harvest" && (!isPositiveInteger(passive.soulsPer) || !isPositiveInteger(passive.maxActive))) {
      throw new Error(`${owner} has an invalid Harvest`);
    }

    if (passive.kind === "grave-chain" && (!isPositiveInteger(passive.delayTicks) || !isPositiveInteger(passive.markTicks))) {
      throw new Error(`${owner} has an invalid Grave Chain`);
    }

    if (
      passive.kind === "overclock" &&
      (passive.name.length === 0 ||
        catalogue.heroes[passive.heroId]?.summon !== true ||
        !isPositiveFinite(passive.rangeUnits) ||
        !isUnitFraction(passive.bonusPerSecond) ||
        !isPositiveFinite(passive.maxBonus))
    ) {
      throw new Error(`${owner} has an invalid Overclock`);
    }

    if (passive.kind === "self-destruct" || passive.kind === "voidheart") {
      const blast = catalogue.abilities[passive.abilityId];

      if (blast?.area?.kind !== "circle" || blast.area.center !== "self" || !isPositiveInteger(passive.delayTicks)) {
        throw new Error(`${owner} has an invalid ${passive.kind} blast`);
      }
    }

    if (passive.kind === "infinity-band" && !(passive.rechargeMultiplier > 0 && passive.rechargeMultiplier <= 1)) {
      throw new Error(`${owner} has an Infinity Band that doesn't shorten recharges`);
    }

    if (passive.kind === "unstable-core" && !(passive.hpFraction > 0 && passive.hpFraction < 1 && isPositiveInteger(passive.delayTicks))) {
      throw new Error(`${owner} has an invalid Unstable Core`);
    }

    if (passive.kind === "empower-summons") {
      if (catalogue.heroes[passive.heroId]?.summon !== true) {
        throw new Error(`${owner} empowers "${passive.heroId}", which isn't a summon hero`);
      }

      validatePassives(catalogue, owner, passive.passives ?? []);

      for (const gem of passive.gems ?? []) {
        validateGem(owner, gem);
      }
    }

    if (
      passive.kind === "deep-freeze" &&
      (!isPositiveInteger(passive.chillsToFreeze) || !isPositiveInteger(passive.chillTicks) || !isPositiveInteger(passive.freezeTicks))
    ) {
      throw new Error(`${owner} has an invalid Deep Freeze`);
    }

    if (
      passive.kind === "virulence" &&
      (!isPositiveInteger(passive.conditionAtStacks) ||
        !isPositiveInteger(passive.burstAtStacks) ||
        !isUnitFraction(passive.spreadFraction) ||
        !isPositiveFinite(passive.spreadRadiusUnits) ||
        !isPositiveInteger(passive.windowTicks))
    ) {
      throw new Error(`${owner} has an invalid Virulence`);
    }

    if (passive.kind === "withering" && (!isUnitFraction(passive.healingReduction) || !isUnitFraction(passive.manaReduction) || (passive.fullAtStacks !== undefined && !isPositiveInteger(passive.fullAtStacks)))) {
      throw new Error(`${owner} has an invalid Withering`);
    }

    if (passive.kind === "contagion" && (!isPositiveInteger(passive.targets) || !isUnitFraction(passive.fraction))) {
      throw new Error(`${owner} has an invalid Contagion`);
    }

    if (passive.kind === "toxic-tether" && !isUnitFraction(passive.fraction)) {
      throw new Error(`${owner} has an invalid Toxic Tether`);
    }

    if (passive.kind === "revive" && (!isUnitFraction(passive.hpFraction) || (passive.statueTicks !== undefined && !isPositiveInteger(passive.statueTicks)))) {
      throw new Error(`${owner} has an invalid revive`);
    }

    if (passive.kind === "crusader" && !isUnitFraction(passive.fraction)) {
      throw new Error(`${owner} has an invalid Crusader`);
    }

    if (
      passive.kind === "blessed-overflow" &&
      (passive.name.length === 0 ||
        !isUnitFraction(passive.capMaxHpFraction) ||
        !isPositiveInteger(passive.durationTicks) ||
        !isPositiveFinite(passive.burstFraction) ||
        !isPositiveFinite(passive.burstRadiusUnits))
    ) {
      throw new Error(`${owner} has an invalid Blessed Overflow`);
    }

    if (passive.kind === "sentinel-ward" && (!isPositiveFinite(passive.radiusUnits) || !isPositiveInteger(passive.stunTicks))) {
      throw new Error(`${owner} has an invalid Sentinel Ward`);
    }

    if (passive.kind === "blight-ward" && !isUnitFraction(passive.poisonReduction)) {
      throw new Error(`${owner} has a poison reduction outside (0, 1]`);
    }

    if (
      passive.kind === "blood-pact" &&
      (!isUnitFraction(passive.hpFraction) || !(passive.minHpFraction >= 0 && passive.minHpFraction < 1) || !isPositiveInteger(passive.floorTicks))
    ) {
      throw new Error(`${owner} has an invalid Blood Pact`);
    }

    if (passive.kind === "chain-lightning" && (!isUnitFraction(passive.chance) || !isPositiveFinite(passive.damage) || !isPositiveInteger(passive.bounces) || !isPositiveFinite(passive.rangeUnits))) {
      throw new Error(`${owner} has invalid chain lightning`);
    }

    if (passive.kind === "essence-siphon" && (!isUnitFraction(passive.steal) || !isPositiveInteger(passive.durationTicks))) {
      throw new Error(`${owner} has an invalid Essence Siphon`);
    }

    if (passive.kind === "soulbound" && !(passive.maxHpFractionPerSecond > 0 && passive.maxHpFractionPerSecond < 1)) {
      throw new Error(`${owner} drains a fraction of HP outside (0, 1)`);
    }
  }
}

function isUnitFraction(value: number): boolean {
  return value > 0 && value <= 1;
}

function validateGem(owner: string, gem: GemDefinition): void {
  if (!gemNumbersAreValid(gem)) {
    throw new Error(`${owner} has invalid ${gem.kind} numbers`);
  }
}

function gemNumbersAreValid(gem: GemDefinition): boolean {
  switch (gem.kind) {
    case "chain":
      return isPositiveInteger(gem.extraTargets) && isUnitFraction(gem.fraction) && isPositiveFinite(gem.rangeUnits);

    case "fork":
      return isPositiveInteger(gem.branches) && isUnitFraction(gem.fraction) && isPositiveFinite(gem.rangeUnits);

    case "widen":
      return gem.radiusMultiplier > 1;

    case "linger":
      return isPositiveInteger(gem.durationTicks) && isPositiveInteger(gem.periodTicks) && isUnitFraction(gem.fraction) && isPositiveInteger(gem.channelTicks);

    case "multistrike":
      return isPositiveInteger(gem.repeats) && isPositiveInteger(gem.delayTicks) && isUnitFraction(gem.fraction);

    case "multicast":
      return isPositiveInteger(gem.delayTicks) && isUnitFraction(gem.fraction);

    case "trigger":
      return (
        isNonNegativeInteger(gem.rechargeTicks) &&
        isUnitFraction(gem.fraction) &&
        (gem.on !== "damaged" || ((gem.hpLossFraction ?? 0) > 0 && (gem.hpLossFraction ?? 0) < 1)) &&
        (gem.on !== "opener" || isPositiveInteger(gem.atTick ?? 0)) &&
        (gem.on !== "nth-attack" || isPositiveInteger(gem.every ?? 0))
      );

    case "barrage":
      return isPositiveInteger(gem.extraProjectiles) && isUnitFraction(gem.fraction);

    case "pierce":
      return isPositiveFinite(gem.widthUnits);

    case "concentrate":
      return gem.radiusMultiplier > 0 && gem.radiusMultiplier < 1 && gem.damageMultiplier > 1;

    case "vortex":
      return isPositiveFinite(gem.pullUnits) && gem.reachMultiplier >= 1;

    case "ruthless":
      return isPositiveInteger(gem.every) && gem.damageMultiplier > 1 && isPositiveInteger(gem.stunTicks);

    case "culling":
      return gem.threshold > 0 && gem.threshold < 1;

    case "primer":
    case "resonance":
      return true;

    case "leech":
      return isUnitFraction(gem.fraction);

    case "split":
      return isPositiveInteger(gem.extraSummons) && isUnitFraction(gem.strength);

    case "empower":
      return gem.strength > 1;

    case "haste":
      return gem.multiplier > 0 && gem.multiplier < 1;

    case "overcharge":
      return gem.effectMultiplier > 1 && gem.hpCostFraction > 0 && gem.hpCostFraction < 1;

    default: {
      const exhaustive: never = gem;

      return exhaustive;
    }
  }
}

function validateAppliedCondition(catalogue: Catalogue, heroId: string): void {
  const hero = catalogue.heroes[heroId];

  if (hero?.appliesCondition === undefined) {
    return;
  }

  const applied = appliedConditions(compileBuild(createHeroBuild(`validate-${heroId}`, heroId, [], catalogue), catalogue), catalogue);

  if (!applied.has(hero.appliesCondition)) {
    throw new Error(`hero "${heroId}" says it applies ${hero.appliesCondition}, but nothing in its kit does`);
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

    for (const skillId of [hero.abilityId, hero.ultimateId]) {
      if (skillId !== undefined && catalogue.abilities[skillId] === undefined) {
        throw new Error(`hero "${hero.id}" references unknown skill "${skillId}"`);
      }
    }

    if (hero.ultimateId !== undefined && catalogue.abilities[hero.ultimateId]?.manaCost === undefined) {
      throw new Error(`hero "${hero.id}" has an ultimate with no mana cost`);
    }

    if (hero.abilityId !== undefined && catalogue.abilities[hero.abilityId]?.manaCost !== undefined) {
      throw new Error(`hero "${hero.id}" has an ability that costs mana`);
    }

    if (hero.armor !== undefined && !(hero.armor >= 0 && hero.armor < 1)) {
      throw new Error(`hero "${hero.id}" has armor outside [0, 1)`);
    }

    if (hero.critChance !== undefined && !(hero.critChance >= 0 && hero.critChance <= 1)) {
      throw new Error(`hero "${hero.id}" has a crit chance outside [0, 1]`);
    }

    validatePassives(catalogue, `hero "${hero.id}"`, hero.passives ?? []);
    validateAppliedCondition(catalogue, hero.id);
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
      (upgrade.passiveChanges?.length ?? 0) > 0 ||
      (upgrade.abilityChanges?.length ?? 0) > 0 ||
      upgrade.extraGemSockets !== undefined ||
      upgrade.gem !== undefined;

    if (!grantsSomething) {
      throw new Error(`upgrade "${upgrade.id}" has no statModifiers and grants nothing`);
    }

    if (upgrade.category === "gem" && (upgrade.gem === undefined || (upgrade.gemFits?.length ?? 0) === 0)) {
      throw new Error(`gem "${upgrade.id}" needs a gem definition and the skills it fits`);
    }

    if (upgrade.gem !== undefined) {
      validateGem(`gem "${upgrade.id}"`, upgrade.gem);
    }

    if (upgrade.category === "item" && upgrade.rarity === undefined) {
      throw new Error(`item "${upgrade.id}" has no rarity`);
    }

    if (upgrade.extraGemSockets !== undefined && (upgrade.category !== "item" || !isPositiveInteger(upgrade.extraGemSockets))) {
      throw new Error(`upgrade "${upgrade.id}" adds gem sockets, which only an item can, and only a whole number of them`);
    }

    if (upgrade.cursed === true && (upgrade.category !== "item" || !upgrade.description.includes("Downside"))) {
      throw new Error(`cursed piece "${upgrade.id}" must be an item whose description states its downside`);
    }

    if (upgrade.category === "level" && (upgrade.heroId === undefined || upgrade.level === undefined || upgrade.path === undefined)) {
      throw new Error(`level pick "${upgrade.id}" needs a hero, a level and a path`);
    }

    if (upgrade.category !== "level" && (upgrade.level !== undefined || upgrade.path !== undefined)) {
      throw new Error(`upgrade "${upgrade.id}" has a level or path but isn't a level pick`);
    }

    for (const change of upgrade.abilityChanges ?? []) {
      if (!abilityReferenceExists(catalogue, change.abilityId)) {
        throw new Error(`upgrade "${upgrade.id}" changes unknown ability "${change.abilityId}"`);
      }

      if (change.setBomb !== undefined) {
        validateBomb(catalogue, `upgrade "${upgrade.id}"`, change.setBomb);
      }

      if (change.setEmitter !== undefined) {
        validateEmitter(catalogue, `upgrade "${upgrade.id}"`, change.setEmitter);
      }

      if (change.setBounces !== undefined) {
        validateBounces(catalogue, change.abilityId, change.setBounces);
      }

      if (change.patchBounces?.trail !== undefined) {
        validateTrail(catalogue, change.abilityId, change.patchBounces.trail);
      }

      if (change.setHpCostFraction !== undefined) {
        validateHpCost(`upgrade "${upgrade.id}"`, change.setHpCostFraction);
      }

      const bindPatch = change.patchBind;

      if (
        bindPatch !== undefined &&
        (!(catalogue.abilities[change.abilityId]?.effects.some((effect) => effect.kind === "bind") ?? false) ||
          (bindPatch.fraction !== undefined && !isUnitFraction(bindPatch.fraction)) ||
          (bindPatch.durationTicks !== undefined && !isPositiveInteger(bindPatch.durationTicks)) ||
          (bindPatch.puppetTicks !== undefined && !isPositiveInteger(bindPatch.puppetTicks)))
      ) {
        throw new Error(`upgrade "${upgrade.id}" patches a bind that isn't there or sets invalid bind numbers`);
      }

      const changed = catalogue.abilities[change.abilityId];

      validateCarriers(`upgrade "${upgrade.id}"`, change.setEffects ?? []);

      if (change.patchForm !== undefined || change.setForm !== undefined) {
        validateForm(`upgrade "${upgrade.id}"`, { ...changed?.form, ...change.setForm, ...change.patchForm }, change.setEffects ?? changed?.effects ?? []);
      }

      const raised = change.setForm?.raisesOnKill;

      if (
        change.setForm !== undefined &&
        (!isPositiveInteger(change.setForm.durationTicks) ||
          (change.setForm.basicAttackId !== undefined && !abilityReferenceExists(catalogue, change.setForm.basicAttackId)) ||
          (raised !== undefined && catalogue.heroes[raised]?.summon !== true))
      ) {
        throw new Error(`upgrade "${upgrade.id}" sets an invalid form`);
      }
    }

    validatePassives(catalogue, `upgrade "${upgrade.id}"`, upgrade.grantsPassives ?? []);
    validatePassiveChanges(catalogue, upgrade);

    for (const modifier of upgrade.statModifiers) {
      if (!Number.isFinite(modifier.value) || modifier.value === 0) {
        throw new Error(`upgrade "${upgrade.id}" has a zero or non-finite modifier value`);
      }

      if (
        (modifier.target.kind === "ability-mana-cost" ||
          modifier.target.kind === "ability-damage" ||
          modifier.target.kind === "ability-area" ||
          modifier.target.kind === "ability-cooldown" ||
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

function validatePassiveChanges(catalogue: Catalogue, upgrade: UpgradeDefinition): void {
  for (const change of upgrade.passiveChanges ?? []) {
    const hero = upgrade.heroId === undefined ? undefined : catalogue.heroes[upgrade.heroId];
    const target = (hero?.passives ?? []).some((passive) => passive.kind === "stacks" && passive.key === change.key);

    if (!target) {
      throw new Error(`upgrade "${upgrade.id}" patches "${change.key}", which its hero has no stacks passive for`);
    }

    const resets = change.stacks.atMax?.resetsAbilityId;

    if (resets !== undefined && !abilityReferenceExists(catalogue, resets)) {
      throw new Error(`upgrade "${upgrade.id}" resets unknown ability "${resets}"`);
    }
  }
}

function validateLevelPicks(catalogue: Catalogue): void {
  for (const hero of Object.values(catalogue.heroes)) {
    if (hero.summon === true) {
      continue;
    }

    for (const level of PICK_LEVELS) {
      const paths = Object.values(catalogue.upgrades).flatMap((upgrade) =>
        upgrade.category === "level" && upgrade.heroId === hero.id && upgrade.level === level ? [upgrade.path] : [],
      );

      if (paths.length !== 2 || !paths.includes("left") || !paths.includes("right")) {
        throw new Error(`hero "${hero.id}" needs one left and one right pick at level ${level}`);
      }
    }
  }
}

export function validateCatalogue(catalogue: Catalogue): void {
  validateAbilities(catalogue);
  validateHeroes(catalogue);
  validateArenas(catalogue);
  validateUpgrades(catalogue);
  validateLevelPicks(catalogue);
}
