import {
  COMBO_FOR_CONDITION,
  CONDITION_KINDS,
  createHeroBuild,
  DETONATED_BY,
  type Catalogue,
  type ComboTrait,
  type HeroBuild,
  type TeamTraits,
} from "@jev-game/game";
import { button, el } from "./dom.js";
import { checkIcon, conditionIcon, schoolIcon } from "./icons.js";
import { attachTip } from "./tooltip.js";
import { teamTraits } from "./loadout.js";
import { comboGainTip, comboName } from "./tips.js";
import { heroReach, heroTip } from "./hero-card.js";
import { heroDefinition, heroName } from "../game/catalogues.js";

export interface DraftOffer {
  offerId: string;
  heroId: string;
}

export interface DraftContext {
  picked: readonly string[];
  builds: readonly HeroBuild[];
  picks: number;
  locked: boolean;
}

export interface DraftPlate {
  readonly offer: DraftOffer;
  readonly build: HeroBuild;
  readonly slot: HTMLButtonElement;
  sync(context: DraftContext): void;
}

function capitalised(word: string): string {
  return word.charAt(0).toUpperCase() + word.slice(1);
}

function roleRow(label: string, icon: SVGSVGElement, text: string): HTMLElement {
  return el("span", "draft-role", el("span", "draft-role-label", label), el("span", "draft-role-value", icon, text));
}

function comboRows(heroId: string): HTMLElement[] {
  const hero = heroDefinition(heroId);
  const rows: HTMLElement[] = [];

  if (hero?.appliesCondition !== undefined) {
    const condition = hero.appliesCondition;
    const row = roleRow("Sets up", conditionIcon(condition), comboName(COMBO_FOR_CONDITION[condition]));
    row.dataset.condition = condition;
    rows.push(row);
  }

  if (hero?.school !== undefined) {
    const school = hero.school;
    const detonates: string[] = [];

    for (const condition of CONDITION_KINDS) {
      if (DETONATED_BY[condition] === school) {
        detonates.push(comboName(COMBO_FOR_CONDITION[condition]));
      }
    }

    if (detonates.length > 0) {
      const row = roleRow("Detonates", schoolIcon(school), detonates.join(" · "));
      row.dataset.school = school;
      rows.push(row);
    }
  }

  return rows;
}

function gainedCombos(before: TeamTraits, after: TeamTraits): ComboTrait[] {
  const gained: ComboTrait[] = [];

  for (const trait of after.combos) {
    const previous = before.combos.find((candidate) => candidate.condition === trait.condition);

    if (trait.tier > (previous?.tier ?? 0)) {
      gained.push(trait);
    }
  }

  return gained;
}

function gainChip(offerId: string, trait: ComboTrait): HTMLElement {
  const chip = el("span", "gain-chip", conditionIcon(trait.condition), `+ ${comboName(trait.combo)}${trait.tier >= 2 ? " II" : ""}`);
  chip.dataset.condition = trait.condition;
  attachTip(chip, { key: `draft-gain:${offerId}:${trait.combo}`, side: "top", live: false, render: () => comboGainTip(trait.combo, trait.tier) });

  return chip;
}

function slotHint(picked: boolean, context: DraftContext): string | null {
  if (context.locked) {
    return null;
  }

  if (picked) {
    return "Drafted · click to send back";
  }

  return context.picked.length >= context.picks ? "Team full · send a pick back first" : "Click to draft";
}

export function createDraftPlate(offer: DraftOffer, catalogue: Catalogue, onPick: () => void): DraftPlate {
  const hero = heroDefinition(offer.heroId);
  const build = createHeroBuild(`draft-${offer.offerId}`, offer.heroId, [], catalogue);
  const reach = heroReach(build);
  const sub = [hero?.archetype === undefined ? null : capitalised(hero.archetype), reach].filter((part) => part !== null).join(" · ");
  const order = el("span", "draft-order");
  const badge = el("span", "draft-badge", checkIcon(), order);
  const gains = el("span", "gain-chips draft-gains");
  const roles = comboRows(offer.heroId);

  const plate = el(
    "span",
    "draft-plate",
    badge,
    el("span", "draft-name", heroName(offer.heroId)),
    sub === "" ? null : el("span", "draft-sub", sub),
    roles.length === 0 ? null : el("span", "draft-roles", ...roles),
    gains,
  );

  const slot = button("draft-slot", onPick, el("span", "draft-model"), plate);
  slot.dataset.role = offer.heroId;
  slot.setAttribute("aria-label", heroName(offer.heroId));

  return {
    offer,
    build,
    slot,

    sync(context) {
      const index = context.picked.indexOf(offer.offerId);
      const picked = index !== -1;
      const full = context.picked.length >= context.picks;
      order.textContent = picked ? String(index + 1) : "";
      slot.classList.toggle("is-picked", picked);
      slot.classList.toggle("is-muted", !picked && (full || context.locked));
      slot.setAttribute("aria-pressed", String(picked));

      const before = teamTraits(context.builds, catalogue);
      const after = picked || full || context.locked ? before : teamTraits([...context.builds, build], catalogue);
      gains.replaceChildren(...gainedCombos(before, after).map((trait) => gainChip(offer.offerId, trait)));

      const hint = slotHint(picked, context);
      attachTip(slot, { key: `draft:${offer.offerId}`, side: "right", live: false, render: () => heroTip(build, null, hint) });
    },
  };
}
