import type { HeroDefinitionId } from "@jev-game/game";
import { el } from "./dom.js";
import { heroIcon } from "./icons.js";
import { attachTip, tipCard, tipHint, tipSection, tipText } from "./tooltip.js";
import { heroTip } from "./hero-card.js";

function rosterHelp(slots: number): HTMLElement {
  return tipCard({
    icon: null,
    accent: null,
    title: "Your team",
    subtitle: `${slots} heroes fight each round`,
    tag: null,
    sections: [
      tipSection(
        null,
        tipText("Click a hero on the board to draft them. Click again to send them back."),
      ),
      tipHint(
        "Signatures want targets that are airborne, floating, burning or grouped. Draft heroes that set those up for each other.",
      ),
    ],
  });
}

function emptySlot(slot: number): HTMLElement {
  return el("span", "roster-portrait is-empty", el("span", "roster-slot", String(slot + 1)));
}

function filledSlot(heroId: HeroDefinitionId, slot: number): HTMLElement {
  const portrait = el(
    "span",
    "roster-portrait",
    heroIcon(heroId),
    el("span", "roster-slot", String(slot + 1)),
  );

  portrait.dataset.role = heroId;
  portrait.tabIndex = 0;

  attachTip(portrait, {
    key: `roster:${slot}:${heroId}`,
    side: "left",
    live: false,
    render: () => heroTip(heroId, `Pick ${slot + 1}`),
  });

  return portrait;
}

export function renderTeamRoster(
  root: HTMLElement,
  heroIds: readonly HeroDefinitionId[],
  slots: number,
): void {
  if (heroIds.length > slots) {
    throw new Error(`A team of ${slots} can't hold ${heroIds.length} heroes`);
  }

  const head = el("header", "hud-section-head", el("span", "hud-section-title", "Your team"));
  head.tabIndex = 0;

  attachTip(head, {
    key: "roster-help",
    side: "left",
    live: false,
    render: () => rosterHelp(slots),
  });

  const portraits = Array.from({ length: slots }, (_unused, slot) =>
    slot < heroIds.length ? filledSlot(heroIds[slot], slot) : emptySlot(slot),
  );

  root.replaceChildren(el("section", "hud-section", head, el("div", "roster-picks", ...portraits)));
}
