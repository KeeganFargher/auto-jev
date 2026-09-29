import type { HeroDefinitionId } from "@jev-game/game";
import { button, el } from "./dom.js";
import { checkIcon } from "./icons.js";
import { attachTip } from "./tooltip.js";
import { heroSub, heroTip, wantChips } from "./hero-card.js";
import { heroDefinition } from "../game/catalogues.js";

export interface DraftContext {
  picked: readonly HeroDefinitionId[];
  picks: number;
  locked: boolean;
}

export interface DraftPlate {
  readonly heroId: HeroDefinitionId;
  readonly slot: HTMLButtonElement;
  sync(context: DraftContext): void;
}

function roleRow(label: string, ...values: (HTMLElement | string)[]): HTMLElement {
  return el(
    "span",
    "draft-role",
    el("span", "draft-role-label", label),
    el("span", "draft-role-value", ...values),
  );
}

function slotHint(picked: boolean, context: DraftContext): string {
  if (context.locked) {
    return picked ? "Drafted" : "Draft locked";
  }

  if (picked) {
    return "Drafted · click to send back";
  }

  return context.picked.length >= context.picks
    ? "Team full · send a pick back first"
    : "Click to draft";
}

export function createDraftPlate(heroId: HeroDefinitionId, onPick: () => void): DraftPlate {
  const hero = heroDefinition(heroId);
  const signature = hero.signature;

  if (signature === null) {
    throw new Error(`Hero "${heroId}" has no signature, so it can't be drafted`);
  }

  const order = el("span", "draft-order");

  const plate = el(
    "span",
    "draft-plate",
    el("span", "draft-badge", checkIcon(), order),
    el("span", "draft-name", hero.name),
    el("span", "draft-sub", heroSub(hero)),
    el(
      "span",
      "draft-roles",
      roleRow("Signature", signature.name),
      roleRow("Wants", ...wantChips(signature)),
    ),
  );

  const slot = button("draft-slot", onPick, el("span", "draft-model"), plate);
  slot.dataset.role = heroId;
  slot.setAttribute("aria-label", hero.name);

  return {
    heroId,
    slot,

    sync(context) {
      const index = context.picked.indexOf(heroId);
      const picked = index !== -1;
      const full = context.picked.length >= context.picks;
      order.textContent = picked ? String(index + 1) : "";
      slot.classList.toggle("is-picked", picked);
      slot.classList.toggle("is-muted", !picked && (full || context.locked));
      slot.setAttribute("aria-pressed", String(picked));

      const hint = slotHint(picked, context);

      attachTip(slot, {
        key: `draft:${heroId}`,
        side: "right",
        live: false,
        render: () => heroTip(heroId, hint),
      });
    },
  };
}
