import type { AbilityDefinition, AbilityTag, Catalogue, EffectDefinition, RuneKind, UpgradeDefinition } from "../definitions.js";
import type { HeroBuild } from "./state.js";
import { compileBuild, findSignatureAbilityId } from "./compile-build.js";

export const ITEM_SLOTS = 3;

export type EquipmentProblem =
  | "unknown-piece"
  | "not-an-item"
  | "not-a-rune"
  | "too-many-items"
  | "too-many-runes"
  | "no-signature"
  | "rune-does-not-fit"
  | "duplicate-rune"
  | "item-over-stack-limit";

export function signatureTags(heroId: string, catalogue: Catalogue): AbilityTag[] {
  const hero = catalogue.heroes[heroId];

  if (hero === undefined) {
    return [];
  }

  const signatureId = findSignatureAbilityId(hero, catalogue);

  return signatureId === null ? [] : (catalogue.abilities[signatureId]?.tags ?? []);
}

function signatureOf(heroId: string, catalogue: Catalogue): AbilityDefinition | null {
  const hero = catalogue.heroes[heroId];
  const signatureId = hero === undefined ? null : findSignatureAbilityId(hero, catalogue);

  return signatureId === null ? null : (catalogue.abilities[signatureId] ?? null);
}

function directEffects(signature: AbilityDefinition): EffectDefinition[] {
  return [...signature.effects, ...(signature.allyEffects ?? []), ...(signature.secondary?.effects ?? [])];
}

function signatureAppliesCondition(signature: AbilityDefinition): boolean {
  const effects = [...signature.effects, ...(signature.secondary?.effects ?? [])];

  return effects.some((effect) => effect.kind === "apply-condition" || (effect.kind === "dot" && effect.conditionAtStacks !== undefined));
}

function signatureRecastDoesSomething(signature: AbilityDefinition): boolean {
  return directEffects(signature).some((effect) => effect.kind !== "dot" && effect.kind !== "summon");
}

function signatureHitsCanDetonate(signature: AbilityDefinition): boolean {
  return [...directEffects(signature), ...(signature.channel?.effects ?? [])].some((effect) => effect.kind === "damage");
}

function lingerDoesSomething(signature: AbilityDefinition): boolean {
  if (signature.zone !== undefined || signature.channel !== undefined) {
    return true;
  }

  return signature.area?.kind === "circle" && directEffects(signature).some((effect) => effect.kind === "damage" || effect.kind === "heal");
}

function lastWordDoesSomething(signature: AbilityDefinition): boolean {
  const effects = directEffects(signature);

  return (
    signature.channel === undefined &&
    !effects.some((effect) => effect.kind === "taunt" || effect.kind === "summon") &&
    signatureRecastDoesSomething(signature)
  );
}

function runeDoesSomething(kind: RuneKind | undefined, signature: AbilityDefinition): boolean {
  switch (kind) {
    case "echo":
    case "retaliate":
    case "tandem":
      return signatureRecastDoesSomething(signature);

    case "primer":
      return !signatureAppliesCondition(signature);

    case "linger":
      return lingerDoesSomething(signature);

    case "last-word":
      return lastWordDoesSomething(signature);

    case "resonance":
      return signatureHitsCanDetonate(signature);

    case "fork":
      return signature.area?.kind === "line";

    case "split":
    case "empower":
      return signature.effects.some((effect) => effect.kind === "summon");

    default:
      return true;
  }
}

export function runeFitsHero(rune: UpgradeDefinition, heroId: string, catalogue: Catalogue): boolean {
  const tags = signatureTags(heroId, catalogue);
  const signature = signatureOf(heroId, catalogue);

  if (signature === null || tags.length === 0 || !(rune.runeFits ?? []).some((tag) => tags.includes(tag))) {
    return false;
  }

  return runeDoesSomething(rune.rune?.kind, signature);
}

export function checkEquipment(build: HeroBuild, catalogue: Catalogue): EquipmentProblem | null {
  const itemIds = build.itemIds ?? [];
  const runeIds = build.runeIds ?? [];

  if (itemIds.length > ITEM_SLOTS) {
    return "too-many-items";
  }

  for (const itemId of itemIds) {
    const item = catalogue.upgrades[itemId];

    if (item === undefined) {
      return "unknown-piece";
    }

    if (item.category !== "item") {
      return "not-an-item";
    }

    if (itemIds.filter((candidate) => candidate === itemId).length > item.maxStacks) {
      return "item-over-stack-limit";
    }
  }

  if (runeIds.length === 0) {
    return null;
  }

  const hero = catalogue.heroes[build.heroId];

  if (hero === undefined || findSignatureAbilityId(hero, catalogue) === null) {
    return "no-signature";
  }

  if (new Set(runeIds).size !== runeIds.length) {
    return "duplicate-rune";
  }

  for (const runeId of runeIds) {
    const rune = catalogue.upgrades[runeId];

    if (rune === undefined) {
      return "unknown-piece";
    }

    if (rune.category !== "rune") {
      return "not-a-rune";
    }

    if (!runeFitsHero(rune, build.heroId, catalogue)) {
      return "rune-does-not-fit";
    }
  }

  if (runeIds.length > compileBuild(build, catalogue).runeSockets) {
    return "too-many-runes";
  }

  return null;
}
