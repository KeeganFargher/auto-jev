import {
  SKILL_SLOTS,
  createHeroBuild,
  gemFitsSkill,
  isUpgradeEligible,
  ITEM_SLOTS,
  skillIdFor,
  type EquippedGem,
  type HeroBuild,
  type HeroDefinitionId,
  type Rarity,
  type SkillSlot,
  type UpgradeDefinition,
  type UpgradeDefinitionId,
} from "@jev-game/game";
import { gameCatalogue, type LabHeroPicks, type LabPicksByHero } from "@jev-game/content";
import { abilityDefinition, heroName } from "../game/catalogues.js";

export interface UpgradePickerView {
  render(heroIds: readonly HeroDefinitionId[]): void;
  getSelection(): LabPicksByHero;
  dispose(): void;
}

interface HeroPicks {
  levels: UpgradeDefinitionId[];
  items: (UpgradeDefinitionId | null)[];
  gems: Record<SkillSlot, UpgradeDefinitionId[]>;
}

const LAB_GEM_SOCKETS = 3;

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

function heroLevelPicks(heroId: HeroDefinitionId): UpgradeDefinition[] {
  return upgradesOf((upgrade) => upgrade.category === "level" && upgrade.heroId === heroId).sort(
    (a, b) => (a.level ?? 0) - (b.level ?? 0) || (a.path ?? "").localeCompare(b.path ?? ""),
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

function fittingGems(heroId: HeroDefinitionId, slot: SkillSlot): UpgradeDefinition[] {
  return upgradesOf((upgrade) => upgrade.category === "gem" && gemFitsSkill(upgrade, heroId, slot, gameCatalogue)).sort((a, b) =>
    a.name.localeCompare(b.name),
  );
}

function skillLabel(heroId: HeroDefinitionId, slot: SkillSlot): string | null {
  const hero = gameCatalogue.heroes[heroId];
  const skillId = hero === undefined ? null : skillIdFor(hero, slot);

  return skillId === null ? null : (abilityDefinition(skillId)?.name ?? skillId);
}

function buildWith(heroId: HeroDefinitionId, upgradeIds: readonly UpgradeDefinitionId[]): HeroBuild {
  return createHeroBuild(`picker-${heroId}`, heroId, upgradeIds, gameCatalogue);
}

function settledLevelPicks(heroId: HeroDefinitionId, wanted: readonly UpgradeDefinitionId[]): UpgradeDefinitionId[] {
  const kept: UpgradeDefinitionId[] = [];
  let build = buildWith(heroId, kept);

  for (const pick of heroLevelPicks(heroId)) {
    if (wanted.includes(pick.id) && isUpgradeEligible(build, pick, gameCatalogue)) {
      kept.push(pick.id);
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

function settledGems(heroId: HeroDefinitionId, picks: HeroPicks): EquippedGem[] {
  const gems: EquippedGem[] = [];

  for (const slot of SKILL_SLOTS) {
    const fitting = new Set(fittingGems(heroId, slot).map((gem) => gem.id));

    for (const gemId of picks.gems[slot].filter((candidate) => fitting.has(candidate)).slice(0, LAB_GEM_SOCKETS)) {
      gems.push({ gemId, slot });
    }
  }

  return gems;
}

function emptyPicks(): HeroPicks {
  return { levels: [], items: Array.from({ length: ITEM_SLOTS }, () => null), gems: { ability: [], ultimate: [] } };
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

  function levelSection(heroId: HeroDefinitionId, picks: HeroPicks): HTMLElement[] {
    const build = buildWith(heroId, picks.levels);

    return heroLevelPicks(heroId).map((pick) => {
      const selected = picks.levels.includes(pick.id);

      return checkboxOption(`L${pick.level ?? 2} ${pick.name}`, pick.description, selected, selected || isUpgradeEligible(build, pick, gameCatalogue), (checked) => {
        const wanted = checked ? [...picks.levels, pick.id] : picks.levels.filter((id) => id !== pick.id);
        picks.levels = settledLevelPicks(heroId, wanted);
        changed();
      });
    });
  }

  function itemSection(picks: HeroPicks): HTMLElement {
    const row = document.createElement("div");
    row.className = "hud-upgrade-items";

    picks.items.forEach((itemId, slot) => {
      row.append(
        itemSelect(itemId, (picked) => {
          picks.items[slot] = picked;
          changed();
        }),
      );
    });

    return row;
  }

  function gemSection(heroId: HeroDefinitionId, picks: HeroPicks, slot: SkillSlot): HTMLElement[] {
    const label = skillLabel(heroId, slot);

    if (label === null) {
      return [];
    }

    const chosen = picks.gems[slot];

    const options = fittingGems(heroId, slot).map((gem) => {
      const selected = chosen.includes(gem.id);

      return checkboxOption(gem.name, gem.description, selected, selected || chosen.length < LAB_GEM_SOCKETS, (checked) => {
        picks.gems[slot] = checked ? [...chosen, gem.id] : chosen.filter((id) => id !== gem.id);
        changed();
      });
    });

    return [heading(`gems · ${label} · ${chosen.length}/${LAB_GEM_SOCKETS}`), ...options];
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

      section.append(
        title,
        heading("levels"),
        ...levelSection(heroId, picks),
        heading("items"),
        itemSection(picks),
        ...SKILL_SLOTS.flatMap((slot) => gemSection(heroId, picks, slot)),
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
      const selection = new Map<HeroDefinitionId, LabHeroPicks>();

      for (const heroId of currentHeroIds) {
        const picks = picksFor(heroId);
        selection.set(heroId, { upgradeIds: [...picks.levels, ...settledItems(picks.items)], gems: settledGems(heroId, picks) });
      }

      return selection;
    },

    dispose() {
      container.replaceChildren();
    },
  };
}
