import {
  HAMMER_SLOW_LEAD_TICKS,
  type ArenaDefinition,
  type AttackDefinition,
  type Catalogue,
  type HeroDefinition,
  type PassiveDefinition,
  type RadialLaunch,
  type SignatureDefinition,
} from "@jev-game/game";

function fail(owner: string, message: string): never {
  throw new Error(`${owner}: ${message}`);
}

function requireText(owner: string, label: string, value: string): void {
  if (value.trim().length === 0) {
    fail(owner, `${label} is empty`);
  }
}

function requirePositive(owner: string, label: string, value: number): void {
  if (!Number.isFinite(value) || value <= 0) {
    fail(owner, `${label} must be positive, got ${value}`);
  }
}

function requireNonNegative(owner: string, label: string, value: number): void {
  if (!Number.isFinite(value) || value < 0) {
    fail(owner, `${label} must not be negative, got ${value}`);
  }
}

function requirePositiveInteger(owner: string, label: string, value: number): void {
  if (!Number.isInteger(value) || value <= 0) {
    fail(owner, `${label} must be a positive integer, got ${value}`);
  }
}

function requireNonNegativeInteger(owner: string, label: string, value: number): void {
  if (!Number.isInteger(value) || value < 0) {
    fail(owner, `${label} must be a non-negative integer, got ${value}`);
  }
}

function requireFraction(owner: string, label: string, value: number): void {
  if (!Number.isFinite(value) || value < 0 || value > 1) {
    fail(owner, `${label} must be between 0 and 1, got ${value}`);
  }
}

function requireBelow(owner: string, label: string, value: number, limit: number): void {
  if (value >= limit) {
    fail(owner, `${label} (${value}) must be below ${limit}`);
  }
}

function requireAtMost(owner: string, label: string, value: number, limit: number): void {
  if (value > limit) {
    fail(owner, `${label} (${value}) must not exceed ${limit}`);
  }
}

function validateArena(arena: ArenaDefinition): void {
  const owner = `Arena "${arena.id}"`;
  requireText(owner, "name", arena.name);
  requirePositive(owner, "width", arena.width);
  requirePositive(owner, "height", arena.height);
  requirePositiveInteger(owner, "columns", arena.columns);
  requirePositiveInteger(owner, "rows", arena.rows);

  if (arena.rows % 2 !== 0) {
    fail(owner, `rows (${arena.rows}) must split evenly between the two sides`);
  }
}

function validateAttack(owner: string, attack: AttackDefinition): void {
  requireText(owner, "attack name", attack.name);
  requireNonNegative(owner, "attack damage", attack.damage);
  requirePositive(owner, "attack range", attack.rangeUnits);
  requirePositiveInteger(owner, "attack interval", attack.intervalTicks);
  requirePositiveInteger(owner, "attack windup", attack.windupTicks);
  requireBelow(owner, "attack windup", attack.windupTicks, attack.intervalTicks);

  if (attack.kind === "melee") {
    return;
  }

  requirePositive(owner, "projectile speed", attack.unitsPerSecond);
  requireNonNegative(owner, "splash radius", attack.splashRadiusUnits);
  requireFraction(owner, "splash fraction", attack.splashFraction);
  requireNonNegative(owner, "ally heal", attack.allyHeal);
}

function validateLaunch(owner: string, launch: RadialLaunch): void {
  requirePositive(owner, "centre rise", launch.centerRiseUnits);
  requirePositive(owner, "edge rise", launch.edgeRiseUnits);
  requireNonNegative(owner, "centre distance", launch.centerDistanceUnits);
  requireNonNegative(owner, "edge distance", launch.edgeDistanceUnits);
  requireNonNegative(owner, "launch bowling damage", launch.bowlingDamage);
}

function validateSignatureKind(owner: string, signature: SignatureDefinition): void {
  switch (signature.kind) {
    case "hammerfall":
      requirePositive(owner, "reach", signature.reachUnits);
      requirePositive(owner, "radius", signature.radiusUnits);
      requireNonNegative(owner, "damage", signature.damage);
      requirePositiveInteger(owner, "impact tick", signature.impactTick);
      requireBelow(owner, "slow lead", HAMMER_SLOW_LEAD_TICKS, signature.impactTick);
      requirePositiveInteger(owner, "duration", signature.durationTicks);
      requireAtMost(owner, "impact tick", signature.impactTick, signature.durationTicks);
      validateLaunch(owner, signature.launch);

      return;
    case "rampage":
      requireNonNegative(owner, "trigger range", signature.triggerRangeUnits);
      requirePositive(owner, "size", signature.size);
      requirePositiveInteger(owner, "grow ticks", signature.growTicks);
      requirePositiveInteger(owner, "big ticks", signature.bigTicks);
      requirePositiveInteger(owner, "shrink ticks", signature.shrinkTicks);
      requirePositive(owner, "move multiplier", signature.moveMultiplier);
      requireNonNegative(owner, "grab reach", signature.grabReachUnits);
      requirePositiveInteger(owner, "grab windup", signature.grabWindupTicks);
      requirePositiveInteger(owner, "throw interval", signature.throwIntervalTicks);
      requireBelow(owner, "grab windup", signature.grabWindupTicks, signature.throwIntervalTicks);
      requirePositive(owner, "throw search", signature.throwSearchUnits);
      requirePositive(owner, "throw rise", signature.throwRiseUnits);
      requireNonNegative(owner, "thrown damage", signature.thrownDamage);
      requireNonNegative(owner, "bowling damage", signature.bowlingDamage);

      return;
    case "short-fuse":
      requirePositive(owner, "range", signature.rangeUnits);
      requirePositiveInteger(owner, "cast ticks", signature.castTicks);
      requirePositive(owner, "bolt speed", signature.boltUnitsPerSecond);
      requirePositiveInteger(owner, "fuse ticks", signature.fuseTicks);
      requirePositive(owner, "panic move multiplier", signature.panicMoveMultiplier);
      requireNonNegative(owner, "burn damage", signature.burnDamagePerSecond);
      requirePositiveInteger(owner, "burn ticks", signature.burnTicks);
      requireNonNegativeInteger(owner, "touch hops", signature.maxTouchHops);
      requirePositive(owner, "blast radius", signature.blastRadiusUnits);
      requireNonNegative(owner, "blast damage", signature.blastDamage);
      validateLaunch(owner, signature.blastLaunch);

      if (!Number.isFinite(signature.hotPotatoScale) || signature.hotPotatoScale <= 1) {
        fail(owner, `Hot Potato scale must be above 1, got ${signature.hotPotatoScale}`);
      }

      return;
    case "big-bubble":
      requirePositive(owner, "range", signature.rangeUnits);
      requirePositiveInteger(owner, "cast ticks", signature.castTicks);
      requirePositive(owner, "radius", signature.radiusUnits);
      requirePositiveInteger(owner, "max members", signature.maxMembers);
      requirePositive(owner, "float height", signature.floatHeightUnits);
      requirePositiveInteger(owner, "rise ticks", signature.riseTicks);
      requirePositiveInteger(owner, "duration", signature.durationTicks);
      requireBelow(owner, "rise ticks", signature.riseTicks, signature.durationTicks);

      return;
    case "yank":
      requirePositive(owner, "range", signature.rangeUnits);
      requireNonNegative(owner, "minimum range", signature.minRangeUnits);
      requireBelow(owner, "minimum range", signature.minRangeUnits, signature.rangeUnits);
      requirePositiveInteger(owner, "cast ticks", signature.castTicks);
      requirePositive(owner, "hook speed", signature.hookUnitsPerSecond);
      requireNonNegative(owner, "landing offset", signature.landingOffsetUnits);
      requireBelow(owner, "landing offset", signature.landingOffsetUnits, signature.minRangeUnits);
      requirePositive(owner, "rise", signature.riseUnits);
      requireNonNegative(owner, "damage", signature.damage);
      requireNonNegative(owner, "bowling damage", signature.bowlingDamage);
      requireNonNegativeInteger(owner, "stun ticks", signature.stunTicks);
      requireNonNegativeInteger(owner, "recover ticks", signature.recoverTicks);
  }
}

function validateSignature(owner: string, signature: SignatureDefinition): void {
  requireText(owner, "signature name", signature.name);
  requireText(owner, "signature description", signature.description);

  if (signature.wants.length === 0) {
    fail(owner, `${signature.name} wants no setups, so it can never wait for a combo`);
  }

  if (new Set(signature.wants).size !== signature.wants.length) {
    fail(owner, `${signature.name} lists a wanted setup twice`);
  }

  requirePositiveInteger(owner, "group size", signature.groupSize);

  if (signature.wants.includes("grouped") && signature.groupSize < 2) {
    fail(owner, `${signature.name} wants a group but its group size is ${signature.groupSize}`);
  }

  validateSignatureKind(owner, signature);
}

function validatePassive(owner: string, passive: PassiveDefinition): void {
  requireText(owner, "passive name", passive.name);
  requireText(owner, "passive description", passive.description);

  switch (passive.kind) {
    case "safety-bubble":
      requirePositive(owner, "threshold", passive.thresholdFraction);
      requireBelow(owner, "threshold", passive.thresholdFraction, 1);
      requirePositive(owner, "heal fraction", passive.healFraction);
      requireFraction(owner, "heal fraction", passive.healFraction);
      requirePositiveInteger(owner, "duration", passive.durationTicks);
      requirePositiveInteger(owner, "rise ticks", passive.riseTicks);
      requireBelow(owner, "rise ticks", passive.riseTicks, passive.durationTicks);
      requirePositive(owner, "float height", passive.floatHeightUnits);
      requirePositive(owner, "radius", passive.radiusUnits);
  }
}

function validateMana(owner: string, hero: HeroDefinition): void {
  if (hero.signature === null) {
    if (hero.maxMana !== 0 || hero.startingMana !== 0) {
      fail(owner, "a hero without a signature must have no mana");
    }

    return;
  }

  requirePositive(owner, "max mana", hero.maxMana);
  requireNonNegative(owner, "starting mana", hero.startingMana);

  if (hero.startingMana > hero.maxMana) {
    fail(owner, `starting mana ${hero.startingMana} is above max mana ${hero.maxMana}`);
  }
}

function validateHero(heroId: string, hero: HeroDefinition): void {
  const owner = `Hero "${heroId}"`;

  if (hero.id !== heroId) {
    fail(owner, `is stored under the wrong id "${hero.id}"`);
  }

  requireText(owner, "name", hero.name);
  requireText(owner, "title", hero.title);
  requireText(owner, "description", hero.description);
  requirePositiveInteger(owner, "max HP", hero.maxHp);
  requirePositive(owner, "move speed", hero.moveUnitsPerSecond);
  requirePositive(owner, "body radius", hero.bodyRadiusUnits);
  validateMana(owner, hero);
  validateAttack(owner, hero.attack);

  if (hero.draftable && hero.signature === null) {
    fail(owner, "a draftable hero needs a signature");
  }

  if (hero.signature !== null) {
    validateSignature(owner, hero.signature);
  }

  if (hero.passive !== null) {
    validatePassive(owner, hero.passive);
  }
}

export function validateCatalogue(catalogue: Catalogue): void {
  const arenas = Object.entries(catalogue.arenas);
  const heroes = Object.entries(catalogue.heroes);

  if (arenas.length === 0) {
    throw new Error("The catalogue has no arenas");
  }

  for (const [arenaId, arena] of arenas) {
    if (arena.id !== arenaId) {
      throw new Error(`Arena "${arenaId}" is stored under the wrong id "${arena.id}"`);
    }

    validateArena(arena);
  }

  if (!heroes.some(([, hero]) => hero.draftable)) {
    throw new Error("The catalogue has no draftable heroes");
  }

  for (const [heroId, hero] of heroes) {
    validateHero(heroId, hero);
  }
}
