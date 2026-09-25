import {
  SKILL_SLOTS,
  cellSize,
  compileBuild,
  skillIdFor,
  TICK_RATE,
  type CompiledUnitStats,
  type HeroBuild,
  type HeroDefinition,
  type SkillSlot,
} from "@jev-game/game";
import { boardArena } from "@jev-game/content";
import { el } from "./dom.js";
import { conditionIcon, levelIcon, schoolIcon } from "./icons.js";
import { buildLevel, levelBadge, levelPicks, romanLevel } from "./levels.js";
import { heroArt, pieceArt } from "./icon-art.js";
import { attachTip, richText, tipHint } from "./tooltip.js";
import { cardPassive, passiveName, passiveSummary, passiveTip, pieceTip, type PieceKind } from "./tips.js";
import { abilityDefinition, gameCatalogue, heroDefinition, heroName, upgradeDefinition } from "../game/catalogues.js";

export type StatSource = Pick<
  CompiledUnitStats,
  "abilities" | "abilityCooldownDurations" | "damageMultiplier" | "attackDamageMultiplier" | "armor" | "critChance" | "maxHp" | "ultimateId"
>;

export interface CardStats {
  maxHp: number;
  damageLow: number;
  damageHigh: number;
  attackRate: number;
  armor: number;
  crit: number;
  rangeCells: number;
  manaCost: number | null;
  abilityCooldownTicks: number | null;
}

export type StatKey = "damage" | "rate" | "dps" | "armor" | "crit" | "dealt";

interface StatRow {
  row: HTMLElement;
  value: HTMLElement;
}

export interface CardOptions {
  lead: string | null;
  slot: number | null;
  hint: string | null;
  live: boolean;
}

export interface CardParts {
  root: HTMLElement;
  hpFill: HTMLElement;
  hpShield: HTMLElement;
  hpValue: HTMLElement;
  mana: HTMLElement;
  manaFill: HTMLElement;
  manaValue: HTMLElement;
  statuses: HTMLElement;
  rows: Map<StatKey, HTMLElement>;
  values: Map<StatKey, HTMLElement>;
}

const STAT_LABELS: Readonly<Record<StatKey, string>> = {
  damage: "Damage",
  rate: "Attack rate",
  dps: "DPS",
  armor: "Armor",
  crit: "Crit chance",
  dealt: "Damage dealt",
};

const STATIC_STATS: readonly StatKey[] = ["damage", "rate", "dps", "armor", "crit"];

const LIVE_STATS: readonly StatKey[] = ["damage", "rate", "dps", "armor", "crit", "dealt"];

const MELEE_CELLS = 1.5;

function trimmed(value: number): string {
  return String(Math.round(value * 10) / 10);
}

function percent(fraction: number): string {
  return `${Math.round(fraction * 100)}%`;
}

function capitalised(word: string): string {
  return word.charAt(0).toUpperCase() + word.slice(1);
}

export function formatCount(value: number): string {
  return Math.round(value).toLocaleString("en-US");
}

export function cardStats(source: StatSource, heroId: string, speedBonus: number): CardStats | null {
  const hero = heroDefinition(heroId);

  if (hero === undefined) {
    return null;
  }

  const basic = source.abilities[hero.basicAttackId];
  let low = 0;
  let high = 0;

  for (const effect of basic?.effects ?? []) {
    if (effect.kind === "damage") {
      low += effect.amount;
      high += effect.maxAmount ?? effect.amount;
    }
  }

  const cooldown = source.abilityCooldownDurations[hero.basicAttackId] ?? basic?.cooldownTicks ?? 0;
  const effective = speedBonus > 0 ? Math.max(1, Math.round(cooldown / (1 + speedBonus))) : cooldown;
  const ultimate = source.ultimateId === null ? undefined : source.abilities[source.ultimateId];

  return {
    maxHp: source.maxHp,
    damageLow: low * source.damageMultiplier * source.attackDamageMultiplier,
    damageHigh: high * source.damageMultiplier * source.attackDamageMultiplier,
    attackRate: effective > 0 ? TICK_RATE / effective : 0,
    armor: source.armor,
    crit: source.critChance,
    rangeCells: (basic?.range ?? 0) / cellSize(boardArena),
    manaCost: ultimate?.manaCost ?? null,
    abilityCooldownTicks: hero.abilityId === undefined ? null : (source.abilityCooldownDurations[hero.abilityId] ?? null),
  };
}

function buildStats(build: HeroBuild): CardStats | null {
  let compiled: CompiledUnitStats;

  try {
    compiled = compileBuild(build, gameCatalogue);
  } catch {
    return null;
  }

  return cardStats(compiled, build.heroId, 0);
}

export function fillStats(parts: CardParts, stats: CardStats, dealt: number | null): void {
  const low = Math.round(stats.damageLow);
  const high = Math.round(stats.damageHigh);

  const text: Record<StatKey, string> = {
    damage: low === high ? String(low) : `${low}–${high}`,
    rate: `${stats.attackRate.toFixed(2)}/s`,
    dps: String(Math.round(((stats.damageLow + stats.damageHigh) / 2) * stats.attackRate)),
    armor: percent(stats.armor),
    crit: percent(stats.crit),
    dealt: dealt === null ? "" : formatCount(dealt),
  };

  for (const [key, value] of parts.values) {
    if (value.textContent !== text[key]) {
      value.textContent = text[key];
    }
  }

  parts.rows.get("crit")?.toggleAttribute("hidden", stats.crit <= 0);
}

function statRow(key: StatKey): StatRow {
  const value = el("b", "unit-card-stat-value");
  const row = el("div", "unit-card-stat", value, el("span", "unit-card-stat-label", STAT_LABELS[key]));

  return { row, value };
}

function cardBadge(icon: SVGSVGElement): HTMLElement {
  return el("span", "unit-card-badge", icon);
}

function kitChip(pieceId: string, kind: PieceKind, heroId: string, skill: SkillSlot | null, tips: boolean, key: string): HTMLElement {
  const chip = el("span", `piece-chip is-${kind}`, pieceArt(pieceId, kind));
  const definition = upgradeDefinition(pieceId);
  chip.dataset.rarity = definition?.rarity ?? "common";
  chip.classList.toggle("is-cursed", definition?.cursed === true);
  chip.setAttribute("aria-label", definition?.name ?? pieceId);

  if (tips) {
    attachTip(chip, { key, side: "right", live: false, render: () => pieceTip(pieceId, kind, { kind: "hero", heroId, skill }, [heroId], null) });
  }

  return chip;
}

const SKILL_LABELS: Readonly<Record<SkillSlot, string>> = { ability: "Ability", ultimate: "Ultimate" };

function skillCost(slot: SkillSlot, cooldownTicks: number, manaCost: number | null): string {
  return slot === "ultimate" && manaCost !== null ? `${manaCost} mana` : `every ${trimmed(cooldownTicks / TICK_RATE)} s`;
}

function skillBlock(hero: HeroDefinition, slot: SkillSlot, stats: CardStats | null): HTMLElement | null {
  const skillId = skillIdFor(hero, slot);
  const skill = skillId === null ? undefined : abilityDefinition(skillId);

  if (skill === undefined) {
    return null;
  }

  return el(
    "div",
    "unit-card-ability",
    el(
      "div",
      "unit-card-ability-head",
      el("span", "unit-card-skill-kind", SKILL_LABELS[slot]),
      el("span", "unit-card-ability-name", skill.name),
      el("span", "unit-card-mana", skillCost(slot, (slot === "ability" ? stats?.abilityCooldownTicks : null) ?? skill.cooldownTicks, stats?.manaCost ?? null)),
    ),
    skill.description === undefined ? null : el("p", "tip-text", ...richText(skill.description)),
  );
}

function passiveBlocks(hero: HeroDefinition, tips: boolean): HTMLElement[] {
  const blocks: HTMLElement[] = [];

  for (const passive of hero.passives ?? []) {
    if (passive.kind === "stacks" || passive.kind === "damage-store") {
      blocks.push(
        el(
          "div",
          "unit-card-ability",
          el("div", "unit-card-ability-head", el("span", "unit-card-skill-kind", "Passive"), el("span", "unit-card-ability-name", passive.name)),
          el("p", "tip-text", ...richText(passive.description)),
        ),
      );
    }

    const shown = cardPassive(passive);

    if (shown === null) {
      continue;
    }

    const block = el(
      "div",
      "unit-card-ability",
      el("div", "unit-card-ability-head", el("span", "unit-card-skill-kind", "Passive"), el("span", "unit-card-ability-name", passiveName(shown))),
      el("p", "tip-text", ...richText(passiveSummary(shown))),
    );

    if (tips) {
      attachTip(block, { key: `card:${hero.id}:passive:${shown.kind}`, side: "right", live: false, render: () => passiveTip(shown) });
    }

    blocks.push(block);
  }

  return blocks;
}

function reachText(stats: CardStats | null): string | null {
  if (stats === null) {
    return null;
  }

  return stats.rangeCells <= MELEE_CELLS ? "Melee" : `${trimmed(stats.rangeCells)}-cell range`;
}

export function heroReach(build: HeroBuild): string | null {
  return reachText(buildStats(build));
}

export function buildCard(heroId: string, build: HeroBuild, stats: CardStats | null, options: CardOptions): CardParts {
  const hero = heroDefinition(heroId);
  const badges: HTMLElement[] = [];

  if (hero?.school !== undefined) {
    const badge = cardBadge(schoolIcon(hero.school));
    badge.dataset.school = hero.school;
    badges.push(badge);
  }

  if (hero?.appliesCondition !== undefined) {
    const badge = cardBadge(conditionIcon(hero.appliesCondition));
    badge.dataset.condition = hero.appliesCondition;
    badges.push(badge);
  }

  const sub = [
    options.lead,
    options.slot === null ? null : `Slot ${options.slot + 1}`,
    hero?.archetype === undefined ? null : capitalised(hero.archetype),
    reachText(stats),
  ]
    .filter((part) => part !== null)
    .join(" · ");

  const hpFill = el("span", "unit-card-hp-fill");
  const hpShield = el("span", "unit-card-hp-shield");
  const hpValue = el("span", "unit-card-hp-value");
  const manaFill = el("span", "unit-card-mana-fill");
  const manaValue = el("span", "unit-card-mana-value");
  const mana = el("div", "unit-card-manabar", manaFill, manaValue);
  mana.hidden = !options.live;
  const statuses = el("div", "unit-card-statuses");
  statuses.hidden = true;
  const rows = new Map<StatKey, HTMLElement>();
  const values = new Map<StatKey, HTMLElement>();

  for (const key of options.live ? LIVE_STATS : STATIC_STATS) {
    const stat = statRow(key);
    rows.set(key, stat.row);
    values.set(key, stat.value);
  }

  const parts: HTMLElement[] = [
    el(
      "div",
      "unit-card-head",
      el("div", "unit-card-name", heroName(heroId), hero?.summon === true ? null : levelBadge(buildLevel(build), "unit-card-level")),
      sub === "" ? null : el("div", "unit-card-sub", sub),
    ),
    el(
      "div",
      "unit-card-art",
      el("span", "unit-card-glyph", heroArt(heroId)),
      badges.length === 0 ? null : el("div", "unit-card-badges", ...badges),
      el("span", "unit-card-fallen", "Fallen"),
    ),
    el("div", "unit-card-hp", hpFill, hpShield, hpValue),
    mana,
    statuses,
  ];

  if (stats !== null) {
    parts.push(el("div", "unit-card-stats", ...rows.values()));
  }

  if (hero !== undefined) {
    for (const slot of SKILL_SLOTS) {
      const block = skillBlock(hero, slot, stats);

      if (block !== null) {
        parts.push(block);
      }
    }

    parts.push(...passiveBlocks(hero, options.live));
  }

  const kit: HTMLElement[] = [];

  (build.itemIds ?? []).forEach((itemId, index) => {
    kit.push(kitChip(itemId, "item", heroId, null, options.live, `card:${heroId}:item:${index}`));
  });

  (build.gems ?? []).forEach((gem, index) => {
    kit.push(kitChip(gem.gemId, "gem", heroId, gem.slot, options.live, `card:${heroId}:gem:${index}`));
  });

  for (const pick of levelPicks(build)) {
    kit.push(el("span", "unit-card-pick", levelIcon(), `${romanLevel(pick.level ?? 2)} ${pick.name}`));
  }

  if (kit.length > 0) {
    parts.push(el("div", "unit-card-kit", ...kit));
  }

  if (options.hint !== null) {
    parts.push(tipHint(options.hint));
  }

  const root = el("div", "tip-card unit-card", ...parts);
  root.dataset.role = heroId;

  if (hero?.school !== undefined) {
    root.dataset.school = hero.school;
  }

  return { root, hpFill, hpShield, hpValue, mana, manaFill, manaValue, statuses, rows, values };
}

export function heroTip(build: HeroBuild, slot: number | null, hint: string | null): HTMLElement {
  const stats = buildStats(build);
  const parts = buildCard(build.heroId, build, stats, { lead: null, slot, hint, live: false });

  if (stats !== null) {
    parts.hpValue.textContent = formatCount(stats.maxHp);
    fillStats(parts, stats, null);
  }

  return parts.root;
}
