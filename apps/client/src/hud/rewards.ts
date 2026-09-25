import {
  SKILL_SLOTS,
  applyUpgrade,
  createHeroBuild,
  fittingSlots,
  skillIdFor,
  withEquipment,
  type Catalogue,
  type ComboKind,
  type HeroBuild,
  type SkillSlot,
} from "@jev-game/game";
import type { PendingDecision, PlayerView, RewardOffer } from "@jev-game/run";
import { button, el } from "./dom.js";
import { conditionIcon, gemIcon, itemIcon, plusIcon, roleIcon, schoolIcon } from "./icons.js";
import { heroArt, heroFaceArt, levelArt, pieceArt } from "./icon-art.js";
import { levelBadge, levelStepName, romanLevel } from "./levels.js";
import { comboGains, loadoutBuilds, teamTraits } from "./loadout.js";
import { attachTip, tipCard, tipSection, tipText } from "./tooltip.js";
import { comboGainTip, comboName, gemFitTip, skillName } from "./tips.js";
import { heroTip } from "./hero-card.js";
import { abilityDefinition, heroDefinition, heroName, upgradeDefinition } from "../game/catalogues.js";

const CONDITION_FOR_COMBO: Readonly<Record<ComboKind, string>> = {
  overload: "staggered",
  shatter: "brittle",
  crush: "disoriented",
};

function withItem(build: HeroBuild, pieceId: string): HeroBuild {
  return withEquipment(build, [...(build.itemIds ?? []), pieceId], build.gems ?? []);
}

function withGem(build: HeroBuild, gemId: string, slot: SkillSlot): HeroBuild {
  return withEquipment(build, build.itemIds ?? [], [...(build.gems ?? []), { gemId, slot }]);
}

function candidateTeams(offer: RewardOffer, builds: readonly HeroBuild[], catalogue: Catalogue): HeroBuild[][] {
  const teams: HeroBuild[][] = [];

  if (offer.kind === "item" && offer.pieceId !== null) {
    const pieceId = offer.pieceId;

    builds.forEach((_build, slot) => {
      teams.push(builds.map((candidate, index) => (index === slot ? withItem(candidate, pieceId) : candidate)));
    });
  }

  if (offer.kind === "gem" && offer.pieceId !== null) {
    const pieceId = offer.pieceId;
    const piece = catalogue.upgrades[pieceId];

    builds.forEach((build, slot) => {
      for (const skill of piece === undefined ? [] : fittingSlots(piece, build.heroId, catalogue)) {
        teams.push(builds.map((candidate, index) => (index === slot ? withGem(candidate, pieceId, skill) : candidate)));
      }
    });
  }

  if (offer.kind === "level" && offer.pieceId !== null && offer.heroSlot !== null) {
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

  if (offer.kind !== "gem" || piece === undefined) {
    return null;
  }

  const chips: HTMLElement[] = [];

  for (const build of builds) {
    const skills = fittingSlots(piece, build.heroId, catalogue);

    if (skills.length > 0) {
      const chip = el("span", "role-chip", heroFaceArt(build.heroId));
      const heroId = build.heroId;
      chip.dataset.role = heroId;
      attachTip(chip, { key: `fit:${offer.offerId}:${heroId}`, side: "top", live: false, render: () => gemFitTip(heroId, piece.name, skills) });
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

function prizeParts(offer: RewardOffer, decision: PendingDecision, view: PlayerView): PrizeParts {
  switch (offer.kind) {
    case "item":
    case "gem": {
      const definition = offer.pieceId === null ? undefined : upgradeDefinition(offer.pieceId);
      const rarity = offer.rarity ?? definition?.rarity ?? "common";
      const cursed = definition?.cursed === true;

      return {
        glyph: pieceArt(offer.pieceId ?? "", offer.kind),
        badge: offer.kind === "item" ? itemIcon() : gemIcon(),
        tag: cursed ? "Cursed" : offer.kind === "gem" ? "Gem" : capitalised(rarity),
        name: definition?.name ?? offer.pieceId ?? "",
        description: definition?.description ?? "",
        rarity,
        role: null,
        cursed,
      };
    }

    case "level": {
      const definition = offer.pieceId === null ? undefined : upgradeDefinition(offer.pieceId);
      const slot = offer.heroSlot ?? decision.heroSlot;
      const heroId = slot === null ? null : (view.you.heroBuilds[slot]?.heroId ?? null);
      const level = decision.level ?? definition?.level ?? 2;

      return {
        glyph: levelArt(offer.pieceId ?? ""),
        badge: heroId === null ? null : roleIcon(heroId),
        tag: `${levelStepName(level)} · ${definition?.path === "right" ? "B" : "A"}`,
        name: definition?.name ?? offer.pieceId ?? "",
        description: definition?.description ?? "",
        rarity: null,
        role: heroId,
      };
    }

    case "recruit": {
      const hero = offer.heroId === null ? undefined : heroDefinition(offer.heroId);
      const ultimateId = hero === undefined ? null : skillIdFor(hero, "ultimate");
      const ultimate = ultimateId === null ? "" : (abilityDefinition(ultimateId)?.name ?? "");

      return {
        glyph: heroArt(offer.heroId ?? ""),
        badge: hero?.school === undefined ? null : schoolIcon(hero.school),
        tag: hero?.archetype === undefined ? "Hero" : capitalised(hero.archetype),
        name: heroName(offer.heroId ?? ""),
        description: [hero?.title ?? "", ultimate].filter((part) => part !== "").join(" · "),
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
        description: "+1 gem socket in the skill you pick.",
        rarity: null,
        role: offer.heroId,
      };

    default: {
      const exhaustive: never = offer.kind;

      return exhaustive;
    }
  }
}

function trainSkills(offer: RewardOffer, catalogue: Catalogue): SkillSlot[] {
  const hero = offer.heroId === null ? undefined : catalogue.heroes[offer.heroId];

  return hero === undefined ? [] : SKILL_SLOTS.filter((skill) => skillIdFor(hero, skill) !== null);
}

function trainButtons(offer: RewardOffer, catalogue: Catalogue, onChoose: (skill: SkillSlot | null) => void): HTMLElement {
  const heroId = offer.heroId ?? "";

  return el(
    "span",
    "prize-skills",
    ...trainSkills(offer, catalogue).map((skill) => button("prize-skill", () => onChoose(skill), `+ ${skillName(heroId, skill) ?? skill}`)),
  );
}

function prizeRow(
  offer: RewardOffer,
  decision: PendingDecision,
  view: PlayerView,
  catalogue: Catalogue,
  onChoose: (skill: SkillSlot | null) => void,
): HTMLElement {
  const builds = loadoutBuilds(view.you);
  const parts = prizeParts(offer, decision, view);

  const icon = el(
    "span",
    "prize-icon",
    el("span", "prize-glyph", parts.glyph),
    parts.badge === null ? null : el("span", "prize-badge", parts.badge),
    el("span", "prize-tag", parts.tag),
  );

  const gains = gainChips(offer, builds, catalogue);
  const fits = fitsRow(offer, builds, catalogue);
  const skills = offer.kind === "train" && trainSkills(offer, catalogue).length > 1 ? trainButtons(offer, catalogue, onChoose) : null;
  const extras = gains === null && fits === null && skills === null ? null : el("span", "prize-extras", fits, gains, skills);
  const text = el("span", "prize-text", el("span", "prize-name", parts.name), el("span", "prize-desc", parts.description), extras);

  const row =
    skills === null
      ? button(`prize-row is-${offer.kind}`, () => onChoose(offer.kind === "train" ? (trainSkills(offer, catalogue)[0] ?? null) : null), icon, text)
      : el("div", `prize-row is-${offer.kind}`, icon, text);

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
      return el("div", "reward-head", decision.offers.some((offer) => offer.kind === "gem") ? "Choose an item or a gem" : "Choose an item");

    case "gem":
      return el("div", "reward-head", "Choose a gem");

    case "recruit":
      return el("div", "reward-head", "Recruit a hero, or train one");

    case "level": {
      const slot = decision.heroSlot;
      const build = slot === null ? undefined : view.you.heroBuilds[slot];
      const level = decision.level ?? 2;

      if (build === undefined) {
        return el("div", "reward-head", `Level ${romanLevel(level)} · ${levelStepName(level)}`);
      }

      const chip = el("span", "role-chip", heroFaceArt(build.heroId));
      chip.dataset.role = build.heroId;
      attachTip(chip, { key: `reward-hero:${slot}`, side: "bottom", live: false, render: () => heroTip(build, slot, null) });

      const head = el(
        "div",
        "reward-head is-level-up",
        chip,
        `${heroName(build.heroId)} reaches level`,
        levelBadge(level, "reward-level"),
        el("span", "reward-level-step", levelStepName(level)),
      );

      head.dataset.level = String(level);

      return head;
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
  onChoose: (decisionId: string, offerId: string, skill: SkillSlot | null) => void,
): HTMLElement | null {
  const decision = view.pendingDecisions[0];

  if (decision === undefined) {
    return null;
  }

  const rows = decision.offers.map((offer) =>
    prizeRow(offer, decision, view, catalogue, (skill) => onChoose(decision.decisionId, offer.offerId, skill)),
  );

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
