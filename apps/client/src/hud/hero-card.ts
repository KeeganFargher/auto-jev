import {
  TICK_RATE,
  cellSize,
  type HeroDefinition,
  type HeroRole,
  type PassiveDefinition,
  type SetupWant,
  type SignatureDefinition,
} from "@jev-game/game";
import { boardArena } from "@jev-game/content";
import { el } from "./dom.js";
import { heroIcon, wantIcon } from "./icons.js";
import { richText, tipHint } from "./tooltip.js";
import { heroDefinition } from "../game/catalogues.js";

export interface CardParts {
  root: HTMLElement;
  hpFill: HTMLElement;
  hpValue: HTMLElement;
  mana: HTMLElement;
  manaFill: HTMLElement;
  manaValue: HTMLElement;
  statuses: HTMLElement;
  dealt: HTMLElement;
}

const ROLE_LABELS: Readonly<Record<HeroRole, string>> = {
  frontline: "Frontline",
  midline: "Midline",
  backline: "Backline",
};

const WANT_LABELS: Readonly<Record<SetupWant, string>> = {
  airborne: "Airborne",
  floating: "Floating",
  burning: "Burning",
  grouped: "Grouped",
};

function trimmed(value: number): string {
  return String(Math.round(value * 10) / 10);
}

export function formatCount(value: number): string {
  return Math.round(value).toLocaleString("en-US");
}

export function heroReach(hero: HeroDefinition): string {
  return hero.attack.kind === "melee"
    ? "Melee"
    : `${trimmed(hero.attack.rangeUnits / cellSize(boardArena))}-cell range`;
}

export function heroSub(hero: HeroDefinition): string {
  return `${ROLE_LABELS[hero.role]} · ${heroReach(hero)}`;
}

function wantLabel(signature: SignatureDefinition, want: SetupWant): string {
  return want === "grouped" ? `${signature.groupSize}+ grouped` : WANT_LABELS[want];
}

export function wantChips(signature: SignatureDefinition): HTMLElement[] {
  return signature.wants.map((want) => {
    const chip = el("span", "want-chip", wantIcon(want), wantLabel(signature, want));
    chip.dataset.want = want;

    return chip;
  });
}

function statRow(label: string, value: HTMLElement): HTMLElement {
  return el("div", "unit-card-stat", value, el("span", "unit-card-stat-label", label));
}

function statValue(text: string): HTMLElement {
  return el("b", "unit-card-stat-value", text);
}

function abilityHead(kind: string, name: string, ...tags: HTMLElement[]): HTMLElement {
  return el(
    "div",
    "unit-card-ability-head",
    el("span", "unit-card-skill-kind", kind),
    el("span", "unit-card-ability-name", name),
    ...tags,
  );
}

function abilityBlock(
  head: HTMLElement,
  description: string,
  ...extras: HTMLElement[]
): HTMLElement {
  return el(
    "div",
    "unit-card-ability",
    head,
    el("p", "tip-text", ...richText(description)),
    ...extras,
  );
}

function signatureBlock(hero: HeroDefinition, signature: SignatureDefinition): HTMLElement {
  return abilityBlock(
    abilityHead("Signature", signature.name, el("span", "unit-card-mana", `${hero.maxMana} mana`)),
    signature.description,
    el(
      "div",
      "unit-card-wants",
      el("span", "unit-card-wants-label", "Wants"),
      ...wantChips(signature),
    ),
  );
}

function passiveBlock(passive: PassiveDefinition): HTMLElement {
  return abilityBlock(abilityHead("Passive", passive.name), passive.description);
}

export function buildCard(
  hero: HeroDefinition,
  leads: readonly string[],
  live: boolean,
): CardParts {
  const attack = hero.attack;
  const attacksPerSecond = TICK_RATE / attack.intervalTicks;
  const hpFill = el("span", "unit-card-hp-fill");
  const hpValue = el("span", "unit-card-hp-value");
  const manaFill = el("span", "unit-card-mana-fill");
  const manaValue = el("span", "unit-card-mana-value");
  const mana = el("div", "unit-card-manabar", manaFill, manaValue);
  mana.hidden = !live || hero.signature === null;
  const statuses = el("div", "unit-card-statuses");
  statuses.hidden = true;
  const dealt = statValue("0");
  const dealtRow = statRow("Damage dealt", dealt);
  dealtRow.hidden = !live;

  const stats = el(
    "div",
    "unit-card-stats",
    statRow("Damage", statValue(String(attack.damage))),
    statRow("Attack rate", statValue(`${attacksPerSecond.toFixed(2)}/s`)),
    statRow("DPS", statValue(String(Math.round(attack.damage * attacksPerSecond)))),
    attack.kind === "projectile" && attack.allyHeal > 0
      ? statRow("Ally heal", statValue(String(attack.allyHeal)))
      : null,
    dealtRow,
  );

  const root = el(
    "div",
    "tip-card unit-card",
    el(
      "div",
      "unit-card-head",
      el("div", "unit-card-name", hero.name),
      el("div", "unit-card-sub", [...leads, hero.title, heroSub(hero)].join(" · ")),
    ),
    el(
      "div",
      "unit-card-art",
      el("span", "unit-card-glyph", heroIcon(hero.id)),
      el("span", "unit-card-fallen", "Fallen"),
    ),
    el("div", "unit-card-hp", hpFill, hpValue),
    mana,
    statuses,
    stats,
    hero.signature === null ? null : signatureBlock(hero, hero.signature),
    hero.passive === null ? null : passiveBlock(hero.passive),
  );

  root.dataset.role = hero.id;

  return { root, hpFill, hpValue, mana, manaFill, manaValue, statuses, dealt };
}

export function heroTip(heroId: string, hint: string): HTMLElement {
  const hero = heroDefinition(heroId);
  const parts = buildCard(hero, [], false);
  parts.hpFill.style.setProperty("--fill", "1");
  parts.hpValue.textContent = formatCount(hero.maxHp);
  parts.root.append(tipHint(hint));

  return parts.root;
}
