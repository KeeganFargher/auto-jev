import {
  compileBuild,
  createHeroBuild,
  isUpgradeEligible,
  ITEM_SLOTS,
  runeFitsHero,
  withEquipment,
  type HeroBuild,
  type HeroDefinitionId,
  type Rarity,
  type UpgradeDefinition,
  type UpgradeDefinitionId,
} from "@jev-game/game";
import { gameCatalogue } from "@jev-game/content";
import { heroName } from "../game/catalogues.js";

export type UpgradeSelection = Map<HeroDefinitionId, UpgradeDefinitionId[]>;

export interface UpgradePickerView {
  render(heroIds: readonly HeroDefinitionId[]): void;
  getSelection(): UpgradeSelection;
  dispose(): void;
}

interface HeroPicks {
  talents: UpgradeDefinitionId[];
  items: (UpgradeDefinitionId | null)[];
  runes: UpgradeDefinitionId[];
}

const RARITY_ORDER: readonly Rarity[] = ["common", "rare", "legendary"];

function upgradesOf(predicate: (upgrade: UpgradeDefinition) => boolean): UpgradeDefinition[] {
  const found: UpgradeDefinition[] = [];

  for (const upgrade of Object.values(gameCatalogue.upgrades)) {
    if (predicate(upgrade)) {
      found.push(upgrade);
    }
  }

  return found;
}

function heroTalents(heroId: HeroDefinitionId): UpgradeDefinition[] {
  return upgradesOf((upgrade) => upgrade.category === "talent" && upgrade.heroId === heroId).sort(
    (a, b) => (a.tier ?? 0) - (b.tier ?? 0) || (a.path ?? "").localeCompare(b.path ?? ""),
  );
}

function allItems(): UpgradeDefinition[] {
  return upgradesOf((upgrade) => upgrade.category === "item").sort(
    (a, b) =>
      RARITY_ORDER.indexOf(a.rarity ?? "common") - RARITY_ORDER.indexOf(b.rarity ?? "common") ||
      Number(a.cursed === true) - Number(b.cursed === true) ||
      a.name.localeCompare(b.name),
  );
}

function fittingRunes(heroId: HeroDefinitionId): UpgradeDefinition[] {
  return upgradesOf((upgrade) => upgrade.category === "rune" && runeFitsHero(upgrade, heroId, gameCatalogue)).sort((a, b) =>
    a.name.localeCompare(b.name),
  );
}

function buildWith(heroId: HeroDefinitionId, upgradeIds: readonly UpgradeDefinitionId[]): HeroBuild {
  return createHeroBuild(`picker-${heroId}`, heroId, upgradeIds, gameCatalogue);
}

function settledTalents(heroId: HeroDefinitionId, wanted: readonly UpgradeDefinitionId[]): UpgradeDefinitionId[] {
  const kept: UpgradeDefinitionId[] = [];
  let build = buildWith(heroId, kept);

  for (const talent of heroTalents(heroId)) {
    if (wanted.includes(talent.id) && isUpgradeEligible(build, talent)) {
      kept.push(talent.id);
      build = buildWith(heroId, kept);
    }
  }

  return kept;
}

function settledItems(items: readonly (UpgradeDefinitionId | null)[]): UpgradeDefinitionId[] {
  const kept: UpgradeDefinitionId[] = [];

  for (const itemId of items) {
    const item = itemId === null ? undefined : gameCatalogue.upgrades[itemId];

    if (item !== undefined && kept.filter((keptId) => keptId === item.id).length < item.maxStacks) {
      kept.push(item.id);
    }
  }

  return kept;
}

function runeSockets(heroId: HeroDefinitionId, picks: HeroPicks): number {
  return compileBuild(withEquipment(buildWith(heroId, picks.talents), settledItems(picks.items), []), gameCatalogue).runeSockets;
}

function settledRunes(heroId: HeroDefinitionId, picks: HeroPicks): UpgradeDefinitionId[] {
  const fitting = new Set(fittingRunes(heroId).map((rune) => rune.id));

  return picks.runes.filter((runeId) => fitting.has(runeId)).slice(0, runeSockets(heroId, picks));
}

function emptyPicks(): HeroPicks {
  return { talents: [], items: Array.from({ length: ITEM_SLOTS }, () => null), runes: [] };
}

function heading(text: string): HTMLElement {
  const element = document.createElement("div");
  element.className = "hud-upgrade-heading";
  element.textContent = text;

  return element;
}

function checkboxOption(label: string, title: string, checked: boolean, enabled: boolean, onToggle: (checked: boolean) => void): HTMLLabelElement {
  const option = document.createElement("label");
  option.className = enabled ? "hud-upgrade-option" : "hud-upgrade-option is-disabled";
  option.title = title;

  const checkbox = document.createElement("input");
  checkbox.type = "checkbox";
  checkbox.checked = checked;
  checkbox.disabled = !enabled;
  checkbox.addEventListener("change", () => onToggle(checkbox.checked));

  option.append(checkbox, ` ${label}`);

  return option;
}

function itemLabel(item: UpgradeDefinition): string {
  return `${item.name} · ${item.cursed === true ? "cursed" : (item.rarity ?? "common")}`;
}

function itemSelect(selected: UpgradeDefinitionId | null, onPick: (itemId: UpgradeDefinitionId | null) => void): HTMLSelectElement {
  const select = document.createElement("select");
  select.className = "hud-upgrade-item";

  const none = document.createElement("option");
  none.value = "";
  none.textContent = "no item";
  select.append(none);

  for (const item of allItems()) {
    const option = document.createElement("option");
    option.value = item.id;
    option.textContent = itemLabel(item);
    option.title = item.description;
    option.selected = item.id === selected;
    select.append(option);
  }

  select.addEventListener("change", () => onPick(select.value === "" ? null : select.value));

  return select;
}

export function createUpgradePickerView(container: HTMLElement, onChange: () => void): UpgradePickerView {
  const picksByHero = new Map<HeroDefinitionId, HeroPicks>();
  let currentHeroIds: readonly HeroDefinitionId[] = [];

  function picksFor(heroId: HeroDefinitionId): HeroPicks {
    let picks = picksByHero.get(heroId);

    if (picks === undefined) {
      picks = emptyPicks();
      picksByHero.set(heroId, picks);
    }

    return picks;
  }

  function changed(): void {
    renderInternal();
    onChange();
  }

  function talentSection(heroId: HeroDefinitionId, picks: HeroPicks): HTMLElement[] {
    const build = buildWith(heroId, picks.talents);

    return heroTalents(heroId).map((talent) => {
      const selected = picks.talents.includes(talent.id);

      return checkboxOption(`T${talent.tier ?? 1} ${talent.name}`, talent.description, selected, selected || isUpgradeEligible(build, talent), (checked) => {
        const wanted = checked ? [...picks.talents, talent.id] : picks.talents.filter((id) => id !== talent.id);
        picks.talents = settledTalents(heroId, wanted);
        picks.runes = settledRunes(heroId, picks);
        changed();
      });
    });
  }

  function itemSection(heroId: HeroDefinitionId, picks: HeroPicks): HTMLElement {
    const row = document.createElement("div");
    row.className = "hud-upgrade-items";

    picks.items.forEach((itemId, slot) => {
      row.append(
        itemSelect(itemId, (picked) => {
          picks.items[slot] = picked;
          picks.runes = settledRunes(heroId, picks);
          changed();
        }),
      );
    });

    return row;
  }

  function runeSection(heroId: HeroDefinitionId, picks: HeroPicks): HTMLElement[] {
    const capacity = runeSockets(heroId, picks);

    return fittingRunes(heroId).map((rune) => {
      const selected = picks.runes.includes(rune.id);

      return checkboxOption(rune.name, rune.description, selected, selected || picks.runes.length < capacity, (checked) => {
        picks.runes = checked ? [...picks.runes, rune.id] : picks.runes.filter((id) => id !== rune.id);
        picks.runes = settledRunes(heroId, picks);
        changed();
      });
    });
  }

  function renderInternal(): void {
    container.replaceChildren();

    for (const heroId of currentHeroIds) {
      const picks = picksFor(heroId);
      const section = document.createElement("div");
      section.className = "hud-upgrade-hero";

      const title = document.createElement("div");
      title.className = "hud-upgrade-hero-title";
      title.textContent = heroName(heroId);

      const capacity = runeSockets(heroId, picks);

      section.append(
        title,
        heading("talents"),
        ...talentSection(heroId, picks),
        heading("items"),
        itemSection(heroId, picks),
        heading(`runes · ${picks.runes.length}/${capacity} sockets`),
        ...runeSection(heroId, picks),
      );

      container.appendChild(section);
    }
  }

  return {
    render(heroIds) {
      currentHeroIds = heroIds;
      renderInternal();
    },

    getSelection() {
      const selection: UpgradeSelection = new Map();

      for (const heroId of currentHeroIds) {
        const picks = picksFor(heroId);
        selection.set(heroId, [...picks.talents, ...settledItems(picks.items), ...settledRunes(heroId, picks)]);
      }

      return selection;
    },

    dispose() {
      container.replaceChildren();
    },
  };
}
