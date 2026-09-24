import {
  ATTUNEMENT_ARCANA_MANA_GAIN,
  ATTUNEMENT_CUNNING_CRIT_CHANCE,
  ATTUNEMENT_MIGHT_MAX_HP,
  ATTUNEMENT_THRESHOLD,
  cellSize,
  COMBO_FOR_CONDITION,
  CONDITION_DURATION_TICKS,
  CONDITION_KINDS,
  CRUSH_BONUS_FRACTION,
  CRUSH_MANA_DRAIN_FRACTION,
  DETONATED_BY,
  findSignatureAbilityId,
  OVERLOAD_BONUS_FRACTION,
  OVERLOAD_KNOCKDOWN_TICKS,
  OVERLOAD_SPLASH_RANGE_UNITS,
  runeFitsHero,
  SCHOOLS,
  SHATTER_CRIT_MULTIPLIER,
  SHATTER_SHARD_FRACTION,
  SHATTER_SHARD_RANGE_UNITS,
  TICK_RATE,
  TIER_TWO_BRITTLE_DURATION_TICKS,
  TIER_TWO_CRUSH_SLOW_FRACTION,
  TIER_TWO_CRUSH_SLOW_TICKS,
  TIER_TWO_OVERLOAD_KNOCKDOWN_TICKS,
  TIER_TWO_OVERLOAD_SPLASH_FRACTION,
  TIER_TWO_SHATTER_SHARD_FRACTION,
  type AttunementTrait,
  type ComboKind,
  type ComboTrait,
  type ConditionKind,
  type EffectDefinition,
  type HeroBuild,
  type School,
  type TeamTraits,
  type UpgradeDefinition,
} from "@jev-game/game";
import { boardArena } from "@jev-game/content";
import { el } from "./dom.js";
import { conditionIcon, roleIcon, schoolIcon, talentIcon } from "./icons.js";
import { heroFaceArt, pieceArt } from "./icon-art.js";
import { richText, tipCard, tipHint, tipSection, tipText } from "./tooltip.js";
import { abilityDefinition, gameCatalogue, heroDefinition, heroName, upgradeDefinition } from "../game/catalogues.js";

export type PieceKind = "item" | "rune";

export type PiecePlace = { kind: "hero"; heroId: string } | { kind: "stash" } | { kind: "offer" };

interface ComboLinks {
  applies: ConditionKind[];
  detonates: School[];
  ownMarks: boolean;
}

interface ComboRules {
  tierOne: string;
  tierTwo: string;
}

const COMBO_NAMES: Readonly<Record<ComboKind, string>> = {
  overload: "Overload",
  shatter: "Shatter",
  crush: "Crush",
};

const CONDITION_NAMES: Readonly<Record<ConditionKind, string>> = {
  staggered: "Staggered",
  brittle: "Brittle",
  disoriented: "Disoriented",
};

const CONDITION_VERBS: Readonly<Record<ConditionKind, string>> = {
  staggered: "Staggers",
  brittle: "applies Brittle",
  disoriented: "Disorients",
};

const SCHOOL_NAMES: Readonly<Record<School, string>> = {
  might: "Might",
  arcana: "Arcana",
  cunning: "Cunning",
};

export function comboName(combo: ComboKind): string {
  return COMBO_NAMES[combo];
}

export function conditionName(condition: ConditionKind): string {
  return CONDITION_NAMES[condition];
}

export function schoolName(school: School): string {
  return SCHOOL_NAMES[school];
}

function trimmed(value: number): string {
  return String(Math.round(value * 10) / 10);
}

function seconds(ticks: number): string {
  return `${trimmed(ticks / TICK_RATE)} s`;
}

function cells(units: number): string {
  const count = units / cellSize(boardArena);

  return `${trimmed(count)} ${count === 1 ? "cell" : "cells"}`;
}

function percent(fraction: number): string {
  return `${Math.round(fraction * 100)}%`;
}

function capitalised(word: string): string {
  return word.charAt(0).toUpperCase() + word.slice(1);
}

function comboRules(combo: ComboKind): ComboRules {
  switch (combo) {
    case "overload":
      return {
        tierOne: `+${percent(OVERLOAD_BONUS_FRACTION)} damage · ${seconds(OVERLOAD_KNOCKDOWN_TICKS)} knockdown`,
        tierTwo: `${seconds(TIER_TWO_OVERLOAD_KNOCKDOWN_TICKS)} knockdown · ${percent(TIER_TWO_OVERLOAD_SPLASH_FRACTION)} splash in ${cells(OVERLOAD_SPLASH_RANGE_UNITS)}`,
      };

    case "shatter":
      return {
        tierOne: `×${trimmed(SHATTER_CRIT_MULTIPLIER)} crit · ${percent(SHATTER_SHARD_FRACTION)} shards in ${cells(SHATTER_SHARD_RANGE_UNITS)}`,
        tierTwo: `${percent(TIER_TWO_SHATTER_SHARD_FRACTION)} shards · Brittle lasts ${seconds(TIER_TWO_BRITTLE_DURATION_TICKS)}`,
      };

    case "crush":
      return {
        tierOne: `+${percent(CRUSH_BONUS_FRACTION)} damage · drains ${percent(CRUSH_MANA_DRAIN_FRACTION)} mana`,
        tierTwo: `Drains all mana · ${percent(TIER_TWO_CRUSH_SLOW_FRACTION)} slow for ${seconds(TIER_TWO_CRUSH_SLOW_TICKS)}`,
      };

    default: {
      const exhaustive: never = combo;

      return exhaustive;
    }
  }
}

function attunementEffect(school: School): string {
  switch (school) {
    case "might":
      return `+${percent(ATTUNEMENT_MIGHT_MAX_HP)} max HP`;

    case "arcana":
      return `+${percent(ATTUNEMENT_ARCANA_MANA_GAIN)} mana per attack`;

    case "cunning":
      return `+${percent(ATTUNEMENT_CUNNING_CRIT_CHANCE)} crit chance`;

    default: {
      const exhaustive: never = school;

      return exhaustive;
    }
  }
}

function tierLabel(tier: number): string {
  return tier >= 2 ? "Tier II" : tier === 1 ? "Tier I" : "Off";
}

export function tipPips(filled: number, total: number): HTMLElement {
  return el(
    "span",
    "tip-pips",
    ...Array.from({ length: total }, (_unused, index) => el("span", index < filled ? "tip-pip is-on" : "tip-pip")),
  );
}

export function heroChip(heroId: string): HTMLElement {
  const chip = el("span", "tip-hero", roleIcon(heroId), heroName(heroId));
  chip.dataset.role = heroId;

  return chip;
}

function heroChips(heroIds: readonly string[], empty: string): HTMLElement {
  return heroIds.length === 0 ? el("span", "tip-empty", empty) : el("span", "tip-heroes", ...heroIds.map(heroChip));
}

function pipsOf(filled: number, total: number, tone: string): HTMLElement {
  const pips = tipPips(Math.min(filled, total), total);
  pips.classList.add(tone);

  return pips;
}

function keyChip(icon: SVGSVGElement, text: string): HTMLElement {
  return el("span", "tip-keychip", icon, text);
}

function comboRecipe(condition: ConditionKind): HTMLElement {
  const mark = keyChip(conditionIcon(condition), `${conditionName(condition)} ${seconds(CONDITION_DURATION_TICKS)}`);
  mark.dataset.condition = condition;
  const hit = keyChip(schoolIcon(DETONATED_BY[condition]), `${schoolName(DETONATED_BY[condition])} hit`);
  hit.dataset.school = DETONATED_BY[condition];

  return el("div", "tip-recipe", mark, el("span", "tip-recipe-arrow", "→"), hit);
}

function tierLine(tier: number, text: string, current: number): HTMLElement {
  const row = el("div", "tip-tier", el("span", "tip-tier-mark", tier === 1 ? "I" : "II"), el("p", "tip-text", ...richText(text)));
  row.classList.toggle("is-on", current >= tier);
  row.classList.toggle("is-current", current === tier);

  return row;
}

function crewRow(label: string, heroIds: readonly string[], need: number, tone: string): HTMLElement {
  return el(
    "div",
    "tip-crew-row",
    el("span", "tip-crew-label", label),
    pipsOf(heroIds.length, need, tone),
    heroIds.length === 0 ? el("span", "tip-empty", "none yet") : el("span", "tip-heroes", ...heroIds.map(heroChip)),
  );
}

function hitterPhrase(school: School): string {
  return `${school === "arcana" ? "an" : "a"} ${schoolName(school)} hitter`;
}

function comboNext(trait: ComboTrait): string {
  const setter = `a hero that ${CONDITION_VERBS[trait.condition]}`;
  const hitter = hitterPhrase(trait.detonatingSchool);
  const setters = trait.appliers.length;
  const hitters = trait.detonators.length;

  if (trait.tier >= 2) {
    return "Maxed out";
  }

  if (setters === 0 && hitters === 0) {
    return `Needs ${setter} and ${hitter}`;
  }

  if (setters === 0) {
    return `Needs ${setter}`;
  }

  if (hitters === 0) {
    return `Needs ${hitter}`;
  }

  if (trait.tier === 0) {
    return `Needs a second hero: nobody detonates their own mark`;
  }

  const missing: string[] = [];

  if (setters < 2) {
    missing.push(`+1 hero that ${CONDITION_VERBS[trait.condition]}`);
  }

  if (hitters < 2) {
    missing.push(`+1 ${schoolName(trait.detonatingSchool)} hitter`);
  }

  return `Tier II: ${missing.join(", ")}`;
}

function effectConditions(effects: readonly EffectDefinition[] | undefined, into: Set<ConditionKind>): void {
  for (const effect of effects ?? []) {
    if (effect.kind === "apply-condition") {
      into.add(effect.condition);
    }

    if (effect.kind === "dot" && effect.conditionAtStacks !== undefined) {
      into.add(effect.conditionAtStacks.condition);
    }
  }
}

function pieceComboLinks(definition: UpgradeDefinition): ComboLinks {
  const applies = new Set<ConditionKind>();
  const detonates = new Set<School>();

  for (const passive of definition.grantsPassives ?? []) {
    if (passive.kind === "every-nth-basic-attack" || passive.kind === "first-hit-per-enemy") {
      effectConditions(passive.effects, applies);
    }

    if (passive.kind === "extra-detonation") {
      detonates.add(passive.school);
    }

    if (passive.kind === "prism") {
      for (const school of SCHOOLS) {
        detonates.add(school);
      }
    }
  }

  for (const change of definition.abilityChanges ?? []) {
    effectConditions(change.addEffects, applies);
    effectConditions(change.setEffects, applies);

    if (change.setSchool !== undefined) {
      detonates.add(change.setSchool);
    }
  }

  if (definition.rune?.kind === "primer") {
    applies.add(definition.rune.condition);
  }

  const resonance = definition.rune?.kind === "resonance";

  if (resonance) {
    for (const school of SCHOOLS) {
      detonates.add(school);
    }
  }

  return { applies: [...applies], detonates: [...detonates], ownMarks: resonance };
}

function comboLine(icon: SVGSVGElement, condition: ConditionKind, text: string): HTMLElement {
  const line = el("div", "tip-combo-line", el("span", "tip-combo-icon", icon), el("span", "tip-text", ...richText(text)));
  line.dataset.condition = condition;

  return line;
}

function comboLinkSection(definition: UpgradeDefinition): HTMLElement | null {
  const links = pieceComboLinks(definition);
  const lines: HTMLElement[] = [];

  for (const condition of links.applies) {
    lines.push(comboLine(conditionIcon(condition), condition, `Sets up ${comboName(COMBO_FOR_CONDITION[condition])}: marks enemies ${conditionName(condition)}.`));
  }

  for (const school of links.detonates) {
    for (const condition of CONDITION_KINDS) {
      if (DETONATED_BY[condition] === school) {
        lines.push(comboLine(schoolIcon(school), condition, `Detonates ${comboName(COMBO_FOR_CONDITION[condition])}: hits ${conditionName(condition)} enemies with ${schoolName(school)}.`));
      }
    }
  }

  if (links.ownMarks) {
    lines.push(el("p", "tip-text", "Its hero can detonate marks it applied itself."));
  }

  return lines.length === 0 ? null : tipSection("Combos", ...lines);
}

function runeFitSection(definition: UpgradeDefinition, place: PiecePlace, teamHeroIds: readonly string[]): HTMLElement | null {
  if (place.kind === "hero") {
    const hero = heroDefinition(place.heroId);
    const signatureId = hero === undefined ? null : findSignatureAbilityId(hero, gameCatalogue);
    const signature = signatureId === null ? undefined : abilityDefinition(signatureId);

    return tipSection("Socketed", el("p", "tip-text", heroChip(place.heroId), signature === undefined ? "" : ` · ${signature.name}`));
  }

  const fits: string[] = [];

  for (const heroId of new Set(teamHeroIds)) {
    if (runeFitsHero(definition, heroId, gameCatalogue)) {
      fits.push(heroId);
    }
  }

  return tipSection("Fits", heroChips(fits, "No hero on your team can use it yet."));
}

export function pieceTip(pieceId: string, kind: PieceKind, place: PiecePlace, teamHeroIds: readonly string[], hint: string | null): HTMLElement {
  const definition = upgradeDefinition(pieceId);

  if (definition === undefined) {
    return tipCard({ icon: pieceArt(pieceId, kind), accent: null, title: pieceId, subtitle: null, tag: null, sections: [] });
  }

  const cursed = definition.cursed === true;
  const rarity = cursed ? "cursed" : (definition.rarity ?? "common");
  const stacking = kind === "rune" ? "Changes its hero's signature ability" : definition.maxStacks > 1 ? `Up to ${definition.maxStacks} on one hero` : "1 per hero";
  const sections: HTMLElement[] = [tipSection(null, tipText(definition.description))];
  const combos = comboLinkSection(definition);

  if (combos !== null) {
    sections.push(combos);
  }

  if (kind === "rune") {
    const fit = runeFitSection(definition, place, teamHeroIds);

    if (fit !== null) {
      sections.push(fit);
    }
  } else if (place.kind === "hero") {
    sections.push(tipSection("Equipped on", heroChip(place.heroId)));
  }

  if (hint !== null) {
    sections.push(tipHint(hint));
  }

  const card = tipCard({
    icon: pieceArt(pieceId, kind),
    accent: `var(--color-rarity-${rarity})`,
    title: definition.name,
    subtitle: `${capitalised(rarity)} ${kind} · ${stacking}`,
    tag: cursed ? "Cursed" : place.kind === "stash" ? "In stash" : null,
    sections,
  });

  card.dataset.rarity = rarity;

  return card;
}

export function emptySocketTip(kind: PieceKind, heroId: string, interactive: boolean): HTMLElement {
  const hero = heroName(heroId);

  const text = kind === "item" ? "Items come from round rewards." : `A rune upgrades ${hero}'s signature ability.`;
  const sections = [tipSection(null, tipText(text))];

  if (interactive) {
    sections.push(tipHint(`Pick up an ${kind}, then click here`));
  }

  return tipCard({
    icon: null,
    accent: null,
    title: kind === "item" ? "Empty item slot" : "Empty rune socket",
    subtitle: hero,
    tag: null,
    sections,
  });
}

export function comboTip(trait: ComboTrait): HTMLElement {
  const rules = comboRules(trait.combo);

  const card = tipCard({
    icon: conditionIcon(trait.condition),
    accent: "var(--condition)",
    title: comboName(trait.combo),
    subtitle: null,
    tag: tierLabel(trait.tier),
    sections: [
      comboRecipe(trait.condition),
      tipSection(null, el("div", "tip-tiers", tierLine(1, rules.tierOne, trait.tier), tierLine(2, rules.tierTwo, trait.tier))),
      tipSection(null, crewRow("Setup", trait.appliers, 2, "is-setters"), crewRow("Detonate", trait.detonators, 2, "is-hitters")),
      tipHint(comboNext(trait)),
    ],
  });

  card.classList.add("is-combo");
  card.classList.toggle("is-lit", trait.tier > 0);
  card.dataset.condition = trait.condition;
  card.dataset.school = trait.detonatingSchool;

  return card;
}

export function comboGainTip(combo: ComboKind, tier: number): HTMLElement {
  const rules = comboRules(combo);
  let condition: ConditionKind = "staggered";

  for (const candidate of CONDITION_KINDS) {
    if (COMBO_FOR_CONDITION[candidate] === combo) {
      condition = candidate;
    }
  }

  const card = tipCard({
    icon: conditionIcon(condition),
    accent: "var(--condition)",
    title: comboName(combo),
    subtitle: null,
    tag: tierLabel(tier),
    sections: [
      comboRecipe(condition),
      tipSection(null, el("div", "tip-tiers", tierLine(tier >= 2 ? 2 : 1, tier >= 2 ? rules.tierTwo : rules.tierOne, tier))),
      tipHint(tier >= 2 ? `Taking this powers ${comboName(combo)} to Tier II` : `Taking this switches ${comboName(combo)} on`),
    ],
  });

  card.classList.add("is-combo", "is-lit");
  card.dataset.condition = condition;
  card.dataset.school = DETONATED_BY[condition];

  return card;
}

export function runeFitTip(heroId: string, runeName: string): HTMLElement {
  const hero = heroDefinition(heroId);
  const signatureId = hero === undefined ? null : findSignatureAbilityId(hero, gameCatalogue);
  const signature = signatureId === null ? undefined : abilityDefinition(signatureId);

  const card = tipCard({
    icon: heroFaceArt(heroId),
    accent: "var(--role)",
    title: heroName(heroId),
    subtitle: signature === undefined ? null : `Signature · ${signature.name}`,
    tag: null,
    sections: [tipSection(null, tipText(`${runeName} works on ${heroName(heroId)}'s ${signature?.name ?? "signature ability"}.`))],
  });

  card.dataset.role = heroId;

  return card;
}

export function attunementTip(trait: AttunementTrait): HTMLElement {
  const school = schoolName(trait.school);
  const missing = Math.max(0, ATTUNEMENT_THRESHOLD - trait.heroes.length);

  const card = tipCard({
    icon: schoolIcon(trait.school),
    accent: "var(--school)",
    title: school,
    subtitle: `Attunement · ${ATTUNEMENT_THRESHOLD} ${school} heroes`,
    tag: trait.active ? "Active" : `${trait.heroes.length}/${ATTUNEMENT_THRESHOLD}`,
    sections: [
      tipSection(null, el("div", "tip-bonus", ...richText(attunementEffect(trait.school))), el("p", "tip-empty", "for every hero on your team")),
      tipSection(null, crewRow(school, trait.heroes, ATTUNEMENT_THRESHOLD, "is-school")),
      tipHint(trait.active ? "Active" : `+${missing} ${school} ${missing === 1 ? "hero" : "heroes"} to switch it on`),
    ],
  });

  card.dataset.school = trait.school;
  card.classList.toggle("is-lit", trait.active);

  return card;
}

function overviewRow(icon: SVGSVGElement, pips: HTMLElement, name: string, text: string, lit: boolean): HTMLElement {
  const row = el(
    "div",
    "tip-overview-row",
    el("span", "tip-overview-icon", icon),
    pips,
    el("div", "tip-overview-body", el("div", "tip-overview-name", name), el("p", "tip-text", ...richText(text))),
  );

  row.classList.toggle("is-lit", lit);

  return row;
}

export function combosOverviewTip(traits: TeamTraits): HTMLElement {
  const combos = traits.combos.map((trait) => {
    const rules = comboRules(trait.combo);

    const row = overviewRow(
      conditionIcon(trait.condition),
      el("span", "tip-pip-pair", pipsOf(trait.appliers.length, 2, "is-setters"), pipsOf(trait.detonators.length, 2, "is-hitters")),
      `${comboName(trait.combo)} · ${tierLabel(trait.tier)}`,
      trait.tier >= 2 ? rules.tierTwo : rules.tierOne,
      trait.tier > 0,
    );

    row.dataset.condition = trait.condition;
    row.dataset.school = trait.detonatingSchool;

    return row;
  });

  const attunements = traits.attunements.map((trait) => {
    const row = overviewRow(
      schoolIcon(trait.school),
      pipsOf(trait.heroes.length, ATTUNEMENT_THRESHOLD, "is-school"),
      `${schoolName(trait.school)} · ${trait.active ? "Active" : `${trait.heroes.length}/${ATTUNEMENT_THRESHOLD}`}`,
      `${attunementEffect(trait.school)} for the team`,
      trait.active,
    );

    row.dataset.school = trait.school;

    return row;
  });

  return tipCard({
    icon: null,
    accent: null,
    title: "Combos",
    subtitle: "Bars: setup heroes | detonate heroes",
    tag: null,
    sections: [tipSection(null, ...combos), tipSection("Attunements", ...attunements)],
  });
}

function talentLines(build: HeroBuild): HTMLElement[] {
  const lines: HTMLElement[] = [];

  for (const selection of build.upgrades) {
    const talent = upgradeDefinition(selection.upgradeId);

    if (talent?.category === "talent") {
      lines.push(el("p", "tip-text", el("b", "tip-name", talent.name), " ", ...richText(talent.description)));
    }
  }

  return lines;
}

export function talentsTip(build: HeroBuild, max: number): HTMLElement {
  const lines = talentLines(build);

  const card = tipCard({
    icon: talentIcon(),
    accent: "var(--role)",
    title: "Talents",
    subtitle: `${heroName(build.heroId)} · ${lines.length} of ${max}`,
    tag: null,
    sections: [tipSection(null, ...(lines.length === 0 ? [el("p", "tip-empty", "No talents yet. Talent picks come from round rewards.")] : lines))],
  });

  card.dataset.role = build.heroId;

  return card;
}
