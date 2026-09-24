import {
  ATTUNEMENT_THRESHOLD,
  compileBuild,
  computeTeamTraits,
  withEquipment,
  type AttunementTrait,
  type Catalogue,
  type ComboKind,
  type ComboTrait,
  type HeroBuild,
  type TeamTraits,
} from "@jev-game/game";
import { hasStashRoom, itemCanGoOn, piecesOnHero, runeCanGoOn, stashedPieces, type OwnedPiece, type OwnSeat, type RunRules } from "@jev-game/run";
import { button, el } from "./dom.js";
import { conditionIcon, schoolIcon } from "./icons.js";
import { heroFaceArt, pieceSocketArt } from "./icon-art.js";
import { attachTip, tipCard, tipHint, tipSection, tipText } from "./tooltip.js";
import {
  attunementTip,
  comboName,
  combosOverviewTip,
  comboTip,
  emptySocketTip,
  pieceTip,
  schoolName,
  talentsTip,
  type PieceKind,
  type PiecePlace,
} from "./tips.js";
import { heroTip } from "./hero-card.js";
import { upgradeDefinition } from "../game/catalogues.js";

export interface SelectedPiece {
  kind: PieceKind;
  instanceId: string;
}

export interface LoadoutActions {
  selected: SelectedPiece | null;
  interactive: boolean;
  select(piece: SelectedPiece | null): void;
  moveItem(instanceId: string, heroSlot: number | null): void;
  socketRune(instanceId: string, heroSlot: number | null): void;
  discardItem(instanceId: string): void;
}

interface PieceView {
  pieceId: string;
  instanceId: string | null;
}

interface HeroView {
  slot: number;
  build: HeroBuild;
  items: PieceView[];
  runes: PieceView[];
  itemSlots: number;
  runeSockets: number;
}

interface OwnLoadout {
  you: OwnSeat;
  rules: RunRules;
  catalogue: Catalogue;
  actions: LoadoutActions;
}

const MAX_TALENTS = 3;

export function loadoutBuilds(you: Pick<OwnSeat, "heroBuilds" | "items" | "runes">): HeroBuild[] {
  return you.heroBuilds.map((build, slot) =>
    withEquipment(
      build,
      piecesOnHero(you.items, slot).map((piece) => piece.pieceId),
      piecesOnHero(you.runes, slot).map((piece) => piece.pieceId),
    ),
  );
}

export function teamTraits(builds: readonly HeroBuild[], catalogue: Catalogue): TeamTraits {
  return computeTeamTraits(builds, catalogue);
}

export function comboGains(before: TeamTraits, after: TeamTraits): { combo: ComboKind; tier: number }[] {
  const gains: { combo: ComboKind; tier: number }[] = [];

  for (const trait of after.combos) {
    const previous = before.combos.find((candidate) => candidate.condition === trait.condition);

    if (trait.tier > (previous?.tier ?? 0)) {
      gains.push({ combo: trait.combo, tier: trait.tier });
    }
  }

  return gains;
}

function badgePips(filled: number, total: number, className: string): HTMLElement {
  return el(
    "span",
    `badge-pips ${className}`,
    ...Array.from({ length: total }, (_unused, index) => el("span", index < filled ? "badge-pip is-on" : "badge-pip")),
  );
}

function sectionHead(title: string, key: string, render: () => HTMLElement): HTMLElement {
  const head = el("header", "hud-section-head", el("span", "hud-section-title", title));
  head.tabIndex = 0;
  attachTip(head, { key, side: "left", live: false, render });

  return head;
}

function comboBadge(trait: ComboTrait): HTMLElement {
  const badge = el(
    "div",
    "trait-badge",
    el("span", "trait-badge-icon", conditionIcon(trait.condition), trait.tier >= 2 ? el("span", "trait-badge-tier", "II") : null),
    el(
      "span",
      "trait-badge-body",
      el("span", "trait-badge-name", comboName(trait.combo)),
      el("span", "trait-badge-pips", badgePips(trait.appliers.length, 2, "is-setters"), badgePips(trait.detonators.length, 2, "is-hitters")),
    ),
  );

  badge.dataset.condition = trait.condition;
  badge.dataset.school = trait.detonatingSchool;
  badge.classList.toggle("is-lit", trait.tier > 0);
  badge.classList.toggle("is-max", trait.tier >= 2);
  badge.tabIndex = 0;
  badge.setAttribute("aria-label", `${comboName(trait.combo)}, tier ${trait.tier}`);
  attachTip(badge, { key: `combo:${trait.condition}`, side: "left", live: false, render: () => comboTip(trait) });

  return badge;
}

function attunementBadge(trait: AttunementTrait): HTMLElement {
  const badge = el(
    "div",
    "trait-badge is-attunement",
    el("span", "trait-badge-icon", schoolIcon(trait.school)),
    el(
      "span",
      "trait-badge-body",
      el("span", "trait-badge-name", schoolName(trait.school)),
      el("span", "trait-badge-pips", badgePips(trait.heroes.length, ATTUNEMENT_THRESHOLD, "is-school")),
    ),
  );

  badge.dataset.school = trait.school;
  badge.classList.toggle("is-lit", trait.active);
  badge.tabIndex = 0;
  badge.setAttribute("aria-label", `${schoolName(trait.school)} attunement, ${trait.heroes.length} of ${ATTUNEMENT_THRESHOLD}`);
  attachTip(badge, { key: `attunement:${trait.school}`, side: "left", live: false, render: () => attunementTip(trait) });

  return badge;
}

function combosSection(traits: TeamTraits): HTMLElement {
  const attunements: HTMLElement[] = [];

  for (const trait of traits.attunements) {
    if (trait.heroes.length > 0) {
      attunements.push(attunementBadge(trait));
    }
  }

  return el(
    "section",
    "hud-section combos",
    sectionHead("Combos", "combos", () => combosOverviewTip(traits)),
    el("div", "trait-grid", ...traits.combos.map(comboBadge), ...attunements),
  );
}

function itemsHelp(itemSlots: number, interactive: boolean): HTMLElement {
  const sections = [
    tipSection(
      null,
      tipText(`Up to ${itemSlots} items per hero, and 1 rune per socket. Runes upgrade the hero's signature.`),
    ),
  ];

  if (interactive) {
    sections.push(tipHint("Click an item or rune, then click a hero to move it there."));
  }

  return tipCard({ icon: null, accent: null, title: "Items", subtitle: "Round sockets hold items, diamonds hold runes", tag: null, sections });
}

function acceptsPiece(own: OwnLoadout, selected: SelectedPiece, slot: number): boolean {
  const { you, rules, catalogue } = own;

  if (selected.kind === "item") {
    const piece = you.items.find((candidate) => candidate.instanceId === selected.instanceId);

    return piece !== undefined && piece.heroSlot !== slot && itemCanGoOn(you, piece.pieceId, slot, rules, catalogue, piece.instanceId);
  }

  const piece = you.runes.find((candidate) => candidate.instanceId === selected.instanceId);

  return piece !== undefined && piece.heroSlot !== slot && runeCanGoOn(you, piece.pieceId, slot, catalogue, piece.instanceId);
}

function placeSelected(own: OwnLoadout, slot: number): void {
  const target = own.actions.selected;

  if (target === null) {
    return;
  }

  if (target.kind === "item") {
    own.actions.moveItem(target.instanceId, slot);
  } else {
    own.actions.socketRune(target.instanceId, slot);
  }

  own.actions.select(null);
}

function pieceNode(piece: PieceView, kind: PieceKind, place: PiecePlace, teamHeroIds: readonly string[], own: OwnLoadout | null, tipKey: string): HTMLElement {
  const definition = upgradeDefinition(piece.pieceId);
  const icon = pieceSocketArt(piece.pieceId, kind);
  const instanceId = piece.instanceId;
  const selected = own !== null && instanceId !== null && own.actions.selected?.instanceId === instanceId;
  const clickable = own !== null && own.actions.interactive && instanceId !== null;

  const node =
    own !== null && clickable && instanceId !== null
      ? button(`piece-chip is-${kind}`, () => own.actions.select(selected ? null : { kind, instanceId }), icon)
      : el("span", `piece-chip is-${kind}`, icon);

  node.dataset.rarity = definition?.rarity ?? "common";
  node.classList.toggle("is-selected", selected);
  node.classList.toggle("is-cursed", definition?.cursed === true);
  node.setAttribute("aria-label", definition?.name ?? piece.pieceId);

  const hint = !clickable
    ? null
    : selected
      ? "Click a glowing slot to place it · click again to drop"
      : "Click to pick up";

  attachTip(node, { key: tipKey, side: "left", live: false, render: () => pieceTip(piece.pieceId, kind, place, teamHeroIds, hint) });

  return node;
}

function emptySocket(kind: PieceKind, hero: HeroView, own: OwnLoadout | null, accepts: boolean, index: number): HTMLElement {
  const target = own !== null && accepts && own.actions.selected?.kind === kind;
  const node = target && own !== null ? button(`piece-chip is-${kind} is-empty is-target`, () => placeSelected(own, hero.slot)) : el("span", `piece-chip is-${kind} is-empty`);
  node.setAttribute("aria-label", kind === "item" ? "Empty item slot" : "Empty rune socket");

  attachTip(node, {
    key: `empty:${hero.slot}:${kind}:${index}`,
    side: "left",
    live: false,
    render: () => emptySocketTip(kind, hero.build.heroId, own !== null && own.actions.interactive),
  });

  return node;
}

function heroRow(hero: HeroView, teamHeroIds: readonly string[], own: OwnLoadout | null): HTMLElement {
  const { build, slot } = hero;
  const selected = own?.actions.selected ?? null;
  const accepts = own !== null && own.actions.interactive && selected !== null && acceptsPiece(own, selected, slot);
  const place: PiecePlace = { kind: "hero", heroId: build.heroId };
  const tipPrefix = own === null ? `team:${slot}` : "piece";

  const items = el(
    "div",
    "loadout-items",
    ...hero.items.map((piece, index) => pieceNode(piece, "item", place, teamHeroIds, own, piece.instanceId === null ? `${tipPrefix}:item:${index}` : `${tipPrefix}:${piece.instanceId}`)),
    ...Array.from({ length: Math.max(0, hero.itemSlots - hero.items.length) }, (_unused, index) => emptySocket("item", hero, own, accepts, index)),
  );

  let talentCount = 0;

  for (const selection of build.upgrades) {
    if (upgradeDefinition(selection.upgradeId)?.category === "talent") {
      talentCount += 1;
    }
  }

  const talents = badgePips(Math.min(MAX_TALENTS, talentCount), MAX_TALENTS, "is-talents");
  attachTip(talents, { key: `talents:${own === null ? "team" : "own"}:${slot}`, side: "left", live: false, render: () => talentsTip(build, MAX_TALENTS) });

  const runes = el(
    "div",
    "loadout-runes",
    ...hero.runes.map((piece, index) => pieceNode(piece, "rune", place, teamHeroIds, own, piece.instanceId === null ? `${tipPrefix}:rune:${index}` : `${tipPrefix}:${piece.instanceId}`)),
    ...Array.from({ length: Math.max(0, hero.runeSockets - hero.runes.length) }, (_unused, index) => emptySocket("rune", hero, own, accepts, index)),
    talents,
  );

  const portrait = el("span", "loadout-portrait", heroFaceArt(build.heroId), el("span", "loadout-slot", String(slot + 1)));
  const heroNode = accepts && own !== null ? button("loadout-hero is-target", () => placeSelected(own, slot), portrait) : el("div", "loadout-hero", portrait);
  const heroHint = accepts ? "Click to place it here" : null;
  heroNode.tabIndex = 0;
  attachTip(heroNode, { key: `hero:${own === null ? "team" : "own"}:${slot}`, side: "left", live: false, render: () => heroTip(build, slot, heroHint) });

  const row = el("div", "loadout-row", heroNode, el("div", "loadout-gear", items, runes));
  row.dataset.role = build.heroId;
  row.classList.toggle("is-target", accepts);
  row.classList.toggle("is-blocked", own !== null && own.actions.interactive && selected !== null && !accepts);

  return row;
}

function stashControls(own: OwnLoadout): HTMLElement | null {
  const { you, rules, actions } = own;
  const selected = actions.selected;

  if (!actions.interactive || selected === null) {
    return null;
  }

  const controls: HTMLElement[] = [];

  const pieceOnHero =
    selected.kind === "item"
      ? you.items.some((piece) => piece.instanceId === selected.instanceId && piece.heroSlot !== null)
      : you.runes.some((piece) => piece.instanceId === selected.instanceId && piece.heroSlot !== null);

  const stashTakesIt = selected.kind === "rune" || hasStashRoom(you, rules, selected.instanceId);

  if (pieceOnHero && stashTakesIt) {
    controls.push(
      button("pill-button stash-action", () => {
        if (selected.kind === "item") {
          actions.moveItem(selected.instanceId, null);
        } else {
          actions.socketRune(selected.instanceId, null);
        }

        actions.select(null);
      }, "Unequip"),
    );
  }

  if (selected.kind === "item") {
    controls.push(
      button("pill-button stash-action", () => {
        actions.discardItem(selected.instanceId);
        actions.select(null);
      }, "Discard"),
    );
  }

  return controls.length === 0 ? null : el("div", "stash-controls", ...controls);
}

function stashBlock(own: OwnLoadout, teamHeroIds: readonly string[]): HTMLElement | null {
  const { you, rules } = own;
  const items = stashedPieces(you.items);
  const runes = stashedPieces(you.runes);
  const controls = stashControls(own);

  if (items.length === 0 && runes.length === 0 && controls === null) {
    return null;
  }

  const count = el("span", "stash-count", `${items.length}/${rules.stashCapacity}`);

  const label = el("div", "stash-head", el("span", "stash-label", "Stash"), count);
  label.tabIndex = 0;

  attachTip(label, {
    key: "stash",
    side: "left",
    live: false,
    render: () =>
      tipCard({
        icon: null,
        accent: null,
        title: "Stash",
        subtitle: `${items.length} of ${rules.stashCapacity} item spaces used`,
        tag: null,
        sections: [
          tipSection(null, tipText("Pieces you own but haven't equipped. They do nothing until you move them onto a hero. Runes don't take stash space.")),
        ],
      }),
  });

  const stash: PiecePlace = { kind: "stash" };

  const pieces = el(
    "div",
    "stash-pieces",
    ...items.map((piece: OwnedPiece) => pieceNode(piece, "item", stash, teamHeroIds, own, `piece:${piece.instanceId}`)),
    ...runes.map((piece: OwnedPiece) => pieceNode(piece, "rune", stash, teamHeroIds, own, `piece:${piece.instanceId}`)),
  );

  const block = el("div", "stash-block", label, pieces, controls);
  block.classList.toggle("is-full", items.length >= rules.stashCapacity);

  return block;
}

function itemsSection(heroes: readonly HeroView[], own: OwnLoadout | null, itemSlots: number): HTMLElement {
  const teamHeroIds = heroes.map((hero) => hero.build.heroId);
  const rows = heroes.map((hero) => heroRow(hero, teamHeroIds, own));
  const stash = own === null ? null : stashBlock(own, teamHeroIds);
  const interactive = own !== null && own.actions.interactive;

  return el("section", "hud-section items", sectionHead("Items", "items", () => itemsHelp(itemSlots, interactive)), ...rows, stash);
}

export function renderLoadout(
  root: HTMLElement,
  you: OwnSeat,
  rules: RunRules,
  catalogue: Catalogue,
  actions: LoadoutActions,
): void {
  const builds = loadoutBuilds(you);
  const own: OwnLoadout = { you, rules, catalogue, actions };

  const heroes = you.heroBuilds.map(
    (build, slot): HeroView => ({
      slot,
      build: builds[slot] ?? build,
      items: piecesOnHero(you.items, slot),
      runes: piecesOnHero(you.runes, slot),
      itemSlots: rules.itemSlots,
      runeSockets: compileBuild(build, catalogue).runeSockets,
    }),
  );

  root.replaceChildren(combosSection(teamTraits(builds, catalogue)), itemsSection(heroes, own, rules.itemSlots));
}

export function renderTeamLoadout(root: HTMLElement, builds: readonly HeroBuild[], itemSlots: number, catalogue: Catalogue): void {
  const heroes = builds.map(
    (build, slot): HeroView => ({
      slot,
      build,
      items: (build.itemIds ?? []).map((pieceId) => ({ pieceId, instanceId: null })),
      runes: (build.runeIds ?? []).map((pieceId) => ({ pieceId, instanceId: null })),
      itemSlots,
      runeSockets: compileBuild(build, catalogue).runeSockets,
    }),
  );

  root.replaceChildren(combosSection(teamTraits(builds, catalogue)), itemsSection(heroes, null, itemSlots));
}

function draftTeamHelp(picks: number): HTMLElement {
  return tipCard({
    icon: null,
    accent: null,
    title: "Your team",
    subtitle: `Draft ${picks} heroes to start the run`,
    tag: null,
    sections: [
      tipSection(null, tipText("Click a hero on the board to draft them. Click again to send them back.")),
      tipHint("Combos light up once your picks cover both the setup and the detonation."),
    ],
  });
}

export function renderDraftLoadout(root: HTMLElement, builds: readonly HeroBuild[], picks: number, catalogue: Catalogue): void {
  const slots = Array.from({ length: picks }, (_unused, slot) => {
    const build = builds[slot];

    if (build === undefined) {
      return el("span", "loadout-portrait is-empty", el("span", "loadout-slot", String(slot + 1)));
    }

    const portrait = el("span", "loadout-portrait", heroFaceArt(build.heroId), el("span", "loadout-slot", String(slot + 1)));
    portrait.dataset.role = build.heroId;
    portrait.tabIndex = 0;
    attachTip(portrait, { key: `draft-pick:${slot}`, side: "left", live: false, render: () => heroTip(build, slot, null) });

    return portrait;
  });

  root.replaceChildren(
    el("section", "hud-section draft-team", sectionHead("Your team", "draft-team", () => draftTeamHelp(picks)), el("div", "draft-picks", ...slots)),
    combosSection(teamTraits(builds, catalogue)),
  );
}
