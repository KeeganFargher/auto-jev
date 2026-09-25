import type { AbilityDefinition, Catalogue, EffectDefinition, GemDefinition, GemFit, UpgradeDefinition } from "../definitions.js";

type GemKind = GemDefinition["kind"];

const INERT_ON_SHOTS: ReadonlySet<GemKind> = new Set<GemKind>(["trigger", "multistrike", "multicast", "ruthless"]);

function directEffects(skill: AbilityDefinition): EffectDefinition[] {
  return [
    ...skill.effects,
    ...(skill.allyEffects ?? []),
    ...(skill.secondary?.effects ?? []),
    ...(skill.dash?.finalEffects ?? []),
  ];
}

function dealsDamage(skill: AbilityDefinition): boolean {
  return [...directEffects(skill), ...(skill.channel?.effects ?? []), ...(skill.zone?.effects ?? [])].some(
    (effect) => effect.kind === "damage" || effect.kind === "strike",
  );
}

function appliesCondition(skill: AbilityDefinition): boolean {
  return [...skill.effects, ...(skill.secondary?.effects ?? []), ...(skill.dash?.finalEffects ?? [])].some(
    (effect) => effect.kind === "apply-condition",
  );
}

function recastDoesSomething(skill: AbilityDefinition, scale: number): boolean {
  if (skill.dash !== undefined || skill.channel !== undefined) {
    return true;
  }

  const effects = directEffects(skill).filter((effect) => effect.kind !== "resurrect");

  if (scale >= 1) {
    return skill.zone !== undefined || effects.length > 0;
  }

  return effects.some((effect) => effect.kind !== "dot" && effect.kind !== "summon" && effect.kind !== "pandemic" && effect.kind !== "chill");
}

function lingerDoesSomething(skill: AbilityDefinition): boolean {
  if (skill.zone !== undefined || skill.channel !== undefined) {
    return true;
  }

  return skill.area?.kind === "circle" && directEffects(skill).some((effect) => effect.kind === "damage" || effect.kind === "strike" || effect.kind === "heal");
}

function lastWordDoesSomething(skill: AbilityDefinition, scale: number): boolean {
  const effects = directEffects(skill);

  return (
    skill.channel === undefined &&
    skill.dash === undefined &&
    !effects.some((effect) => effect.kind === "taunt" || effect.kind === "summon") &&
    recastDoesSomething(skill, scale)
  );
}

function gemDoesSomething(gem: GemDefinition | undefined, skill: AbilityDefinition): boolean {
  switch (gem?.kind) {
    case "multicast":
      return recastDoesSomething(skill, gem.fraction);

    case "trigger":
      return gem.on === "last-word" ? lastWordDoesSomething(skill, gem.fraction) : recastDoesSomething(skill, gem.fraction);

    case "multistrike":
      return skill.hitType === "attack" && dealsDamage(skill);

    case "primer":
      return dealsDamage(skill) && !appliesCondition(skill);

    case "leech":
    case "resonance":
      return dealsDamage(skill);

    case "linger":
      return lingerDoesSomething(skill);

    case "chain":
      return skill.targetPolicy !== "self";

    case "fork":
      return skill.tags.includes("projectile") && skill.targetPolicy !== "self" && skill.dash === undefined && skill.shower === undefined && dealsDamage(skill);

    case "split":
    case "empower":
      return skill.effects.some((effect) => effect.kind === "summon");

    case "barrage":
    case "pierce":
      return skill.targetPolicy !== "self" && skill.dash === undefined && skill.shower === undefined && dealsDamage(skill);

    case "concentrate":
      return skill.area?.kind === "circle" && dealsDamage(skill);

    case "vortex":
      return skill.area?.kind === "circle" || skill.channel !== undefined;

    case "ruthless":
      return dealsDamage(skill);

    case "culling":
      return skill.hitType === "attack" && dealsDamage(skill);

    default:
      return true;
  }
}

function fitMatches(fit: GemFit, skill: AbilityDefinition): boolean {
  switch (fit) {
    case "any":
      return true;

    case "attack":
    case "spell":
      return skill.hitType === fit;

    case "damaging":
      return dealsDamage(skill);

    default:
      return skill.tags.includes(fit);
  }
}

export function gemWorksOn(gem: UpgradeDefinition, skill: AbilityDefinition): boolean {
  return gem.category === "gem" && (gem.gemFits ?? []).some((fit) => fitMatches(fit, skill)) && gemDoesSomething(gem.gem, skill);
}

export function gemWorksOnShot(gem: UpgradeDefinition, shot: AbilityDefinition): boolean {
  return gem.gem !== undefined && !INERT_ON_SHOTS.has(gem.gem.kind) && gemWorksOn(gem, shot);
}

export function carriedShot(skill: AbilityDefinition, catalogue: Catalogue): AbilityDefinition | null {
  const carrier = skill.effects.find((effect) => effect.kind === "summon" && effect.carriesGems === true);
  const hero = carrier?.kind === "summon" ? catalogue.heroes[carrier.heroId] : undefined;

  return hero === undefined ? null : (catalogue.abilities[hero.basicAttackId] ?? null);
}

export function gemFitsAbility(gem: UpgradeDefinition, skill: AbilityDefinition, catalogue: Catalogue): boolean {
  const shot = carriedShot(skill, catalogue);

  return gemWorksOn(gem, skill) || (shot !== null && gemWorksOnShot(gem, shot));
}
