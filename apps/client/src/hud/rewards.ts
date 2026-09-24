import {
  applyUpgrade,
  createHeroBuild,
  findSignatureAbilityId,
  runeFitsHero,
  withEquipment,
  type Catalogue,
  type ComboKind,
  type HeroBuild,
} from "@jev-game/game";
import type { PendingDecision, PlayerView, RewardOffer } from "@jev-game/run";
import { button, el } from "./dom.js";
import { conditionIcon, itemIcon, plusIcon, roleIcon, runeIcon, schoolIcon } from "./icons.js";
import { heroArt, heroFaceArt, pieceArt, talentArt } from "./icon-art.js";
import { comboGains, loadoutBuilds, teamTraits } from "./loadout.js";
import { attachTip, tipCard, tipSection, tipText } from "./tooltip.js";
import { comboGainTip, comboName, runeFitTip } from "./tips.js";
import { heroTip } from "./hero-card.js";
import { abilityDefinition, heroDefinition, heroName, upgradeDefinition } from "../game/catalogues.js";

const CONDITION_FOR_COMBO: Readonly<Record<ComboKind, string>> = {
  overload: "staggered",
  shatter: "brittle",
  crush: "disoriented",
};

function withItem(build: HeroBuild, pieceId: string, runes: boolean): HeroBuild {
  const itemIds = runes ? (build.itemIds ?? []) : [...(build.itemIds ?? []), pieceId];
  const runeIds = runes ? [...(build.runeIds ?? []), pieceId] : (build.runeIds ?? []);

  return withEquipment(build, itemIds, runeIds);
}

function candidateTeams(offer: RewardOffer, builds: readonly HeroBuild[], catalogue: Catalogue): HeroBuild[][] {
  const teams: HeroBuild[][] = [];

  if ((offer.kind === "item" || offer.kind === "rune") && offer.pieceId !== null) {
    const pieceId = offer.pieceId;
    const piece = catalogue.upgrades[pieceId];

    builds.forEach((build, slot) => {
      if (offer.kind === "rune" && (piece === undefined || !runeFitsHero(piece, build.heroId, catalogue))) {
        return;
      }

      teams.push(builds.map((candidate, index) => (index === slot ? withItem(candidate, pieceId, offer.kind === "rune") : candidate)));
    });
  }

  if (offer.kind === "talent" && offer.pieceId !== null && offer.heroSlot !== null) {
    const slot = offer.heroSlot;
    const pieceId = offer.pieceId;

    try {
      teams.push(builds.map((candidate, index) => (index === slot ? applyUpgrade(candidate, pieceId, catalogue) : candidate)));
    } catch {
      return teams;
    }
  }

  if (offer.kind === "recruit" && offer.heroId !== null) {
    teams.push([...builds, createHeroBuild("preview", offer.heroId, [], catalogue)]);
  }

  return teams;
}

function gainChips(offer: RewardOffer, builds: readonly HeroBuild[], catalogue: Catalogue): HTMLElement | null {
  const before = teamTraits(builds, catalogue);
  const best = new Map<ComboKind, number>();

  for (const team of candidateTeams(offer, builds, catalogue)) {
    for (const gain of comboGains(before, teamTraits(team, catalogue))) {
      best.set(gain.combo, Math.max(best.get(gain.combo) ?? 0, gain.tier));
    }
  }

  if (best.size === 0) {
    return null;
  }

  const chips = [...best.entries()].map(([combo, tier]) => {
    const chip = el("span", "gain-chip", conditionIcon(CONDITION_FOR_COMBO[combo] ?? ""), `+ ${comboName(combo)}${tier >= 2 ? " II" : ""}`);
    chip.dataset.condition = CONDITION_FOR_COMBO[combo] ?? "";
    attachTip(chip, { key: `gain:${offer.offerId}:${combo}`, side: "top", live: false, render: () => comboGainTip(combo, tier) });

    return chip;
  });

  return el("span", "gain-chips", ...chips);
}

function fitsRow(offer: RewardOffer, builds: readonly HeroBuild[], catalogue: Catalogue): HTMLElement | null {
  const piece = offer.pieceId === null ? undefined : catalogue.upgrades[offer.pieceId];

  if (offer.kind !== "rune" || piece === undefined) {
    return null;
  }

  const chips: HTMLElement[] = [];

  for (const build of builds) {
    if (runeFitsHero(piece, build.heroId, catalogue)) {
      const chip = el("span", "role-chip", heroFaceArt(build.heroId));
      const heroId = build.heroId;
      chip.dataset.role = heroId;
      attachTip(chip, { key: `fit:${offer.offerId}:${heroId}`, side: "top", live: false, render: () => runeFitTip(heroId, piece.name) });
      chips.push(chip);
    }
  }

  return chips.length === 0 ? null : el("span", "prize-fits", ...chips);
}

function capitalised(word: string): string {
  return word.charAt(0).toUpperCase() + word.slice(1);
}

interface PrizeParts {
  glyph: HTMLImageElement | SVGSVGElement;
  badge: SVGSVGElement | null;
  tag: string;
  name: string;
  description: string;
  rarity: string | null;
  role: string | null;
  cursed?: boolean;
}

function prizeParts(offer: RewardOffer, decision: PendingDecision, view: PlayerView, catalogue: Catalogue): PrizeParts {
  switch (offer.kind) {
    case "item":
    case "rune": {
      const definition = offer.pieceId === null ? undefined : upgradeDefinition(offer.pieceId);
      const rarity = offer.rarity ?? definition?.rarity ?? "common";
      const cursed = definition?.cursed === true;

      return {
        glyph: pieceArt(offer.pieceId ?? "", offer.kind),
        badge: offer.kind === "item" ? itemIcon() : runeIcon(),
        tag: cursed ? "Cursed" : capitalised(rarity),
        name: definition?.name ?? offer.pieceId ?? "",
        description: definition?.description ?? "",
        rarity,
        role: null,
        cursed,
      };
    }

    case "talent": {
      const definition = offer.pieceId === null ? undefined : upgradeDefinition(offer.pieceId);
      const slot = offer.heroSlot ?? decision.heroSlot;
      const heroId = slot === null ? null : (view.you.heroBuilds[slot]?.heroId ?? null);

      return {
        glyph: talentArt(offer.pieceId ?? ""),
        badge: heroId === null ? null : roleIcon(heroId),
        tag: `Tier ${decision.tier ?? definition?.tier ?? 1}`,
        name: definition?.name ?? offer.pieceId ?? "",
        description: definition?.description ?? "",
        rarity: null,
        role: heroId,
      };
    }

    case "recruit": {
      const hero = offer.heroId === null ? undefined : heroDefinition(offer.heroId);
      const signatureId = hero === undefined ? null : findSignatureAbilityId(hero, catalogue);
      const signature = signatureId === null ? "" : (abilityDefinition(signatureId)?.name ?? "");

      return {
        glyph: heroArt(offer.heroId ?? ""),
        badge: hero?.school === undefined ? null : schoolIcon(hero.school),
        tag: hero?.archetype === undefined ? "Hero" : capitalised(hero.archetype),
        name: heroName(offer.heroId ?? ""),
        description: [hero?.title ?? "", signature].filter((part) => part !== "").join(" · "),
        rarity: null,
        role: offer.heroId,
      };
    }

    case "train":
      return {
        glyph: plusIcon(),
        badge: offer.heroId === null ? null : roleIcon(offer.heroId),
        tag: "Train",
        name: `Train ${heroName(offer.heroId ?? "")}`,
        description: "+1 rune socket on this hero.",
        rarity: null,
        role: offer.heroId,
      };

    default: {
      const exhaustive: never = offer.kind;

      return exhaustive;
    }
  }
}

function prizeRow(
  offer: RewardOffer,
  decision: PendingDecision,
  view: PlayerView,
  catalogue: Catalogue,
  onChoose: () => void,
): HTMLButtonElement {
  const builds = loadoutBuilds(view.you);
  const parts = prizeParts(offer, decision, view, catalogue);

  const icon = el(
    "span",
    "prize-icon",
    el("span", "prize-glyph", parts.glyph),
    parts.badge === null ? null : el("span", "prize-badge", parts.badge),
    el("span", "prize-tag", parts.tag),
  );

  const gains = gainChips(offer, builds, catalogue);
  const fits = fitsRow(offer, builds, catalogue);
  const extras = gains === null && fits === null ? null : el("span", "prize-extras", fits, gains);

  const row = button(
    `prize-row is-${offer.kind}`,
    onChoose,
    icon,
    el("span", "prize-text", el("span", "prize-name", parts.name), el("span", "prize-desc", parts.description), extras),
  );

  if (parts.rarity !== null) {
    row.dataset.rarity = parts.rarity;
  }

  row.classList.toggle("is-cursed", parts.cursed === true);

  if (parts.role !== null) {
    row.dataset.role = parts.role;
  }

  if (offer.kind === "recruit" && offer.heroId !== null) {
    const heroId = offer.heroId;
    attachTip(row, { key: `offer:${offer.offerId}`, side: "right", live: false, render: () => heroTip(createHeroBuild("preview", heroId, [], catalogue), null, null) });
  }

  return row;
}

function decisionHeadline(decision: PendingDecision, view: PlayerView): HTMLElement {
  switch (decision.kind) {
    case "item":
      return el("div", "reward-head", "Choose an item");

    case "rune":
      return el("div", "reward-head", "Choose a rune");

    case "recruit":
      return el("div", "reward-head", "Recruit a hero, or train one");

    case "talent": {
      const slot = decision.heroSlot;
      const build = slot === null ? undefined : view.you.heroBuilds[slot];

      if (build === undefined) {
        return el("div", "reward-head", `Talent · tier ${decision.tier ?? 1}`);
      }

      const chip = el("span", "role-chip", heroFaceArt(build.heroId));
      chip.dataset.role = build.heroId;
      attachTip(chip, { key: `reward-hero:${slot}`, side: "bottom", live: false, render: () => heroTip(build, slot, null) });

      return el("div", "reward-head", chip, `${heroName(build.heroId)} · talent tier ${decision.tier ?? 1}`);
    }

    default: {
      const exhaustive: never = decision.kind;

      return exhaustive;
    }
  }
}

function stepDots(count: number): HTMLElement | null {
  if (count <= 1) {
    return null;
  }

  const dots = el(
    "div",
    "reward-steps",
    ...Array.from({ length: count }, (_unused, index) => el("span", index === 0 ? "reward-step is-current" : "reward-step")),
  );

  attachTip(dots, {
    key: "reward-steps",
    side: "bottom",
    live: false,
    render: () =>
      tipCard({
        icon: null,
        accent: null,
        title: `${count} picks left`,
        subtitle: null,
        tag: null,
        sections: [tipSection(null, tipText("Each dot is a reward you still get to choose this round. Choosing one moves you to the next."))],
      }),
  });

  return dots;
}

export function renderRewardPanel(
  root: HTMLElement,
  view: PlayerView,
  catalogue: Catalogue,
  onChoose: (decisionId: string, offerId: string) => void,
): HTMLElement | null {
  const decision = view.pendingDecisions[0];

  if (decision === undefined) {
    return null;
  }

  const rows = decision.offers.map((offer) => prizeRow(offer, decision, view, catalogue, () => onChoose(decision.decisionId, offer.offerId)));

  const panel = el(
    "div",
    `reward-panel is-${decision.kind}`,
    decisionHeadline(decision, view),
    stepDots(view.pendingDecisions.length),
    el("div", "prize-list", ...rows),
  );

  root.append(panel);

  return panel;
}
