import { createHeroBuild, isUpgradeEligible, type HeroDefinitionId, type UpgradeDefinitionId } from "@jev-game/game";
import { catalogue } from "@jev-game/content";

export type UpgradeSelection = Map<HeroDefinitionId, UpgradeDefinitionId[]>;

export interface UpgradePickerView {
  render(heroIds: readonly HeroDefinitionId[]): void;
  getSelection(): UpgradeSelection;
  dispose(): void;
}

export function createUpgradePickerView(
  container: HTMLElement,
  onChange: () => void,
): UpgradePickerView {
  const selection: UpgradeSelection = new Map();
  let currentHeroIds: readonly HeroDefinitionId[] = [];

  function heroUpgradeIds(heroId: HeroDefinitionId): UpgradeDefinitionId[] {
    return selection.get(heroId) ?? [];
  }

  function deselectCascade(heroId: HeroDefinitionId, upgradeId: UpgradeDefinitionId, visited: Set<UpgradeDefinitionId>): void {
    if (visited.has(upgradeId)) {
      return;
    }

    visited.add(upgradeId);

    selection.set(
      heroId,
      heroUpgradeIds(heroId).filter((id) => id !== upgradeId),
    );

    for (const upgrade of Object.values(catalogue.upgrades)) {
      if (upgrade.prerequisiteUpgradeIds?.includes(upgradeId) === true) {
        deselectCascade(heroId, upgrade.id, visited);
      }
    }
  }

  function setSelected(heroId: HeroDefinitionId, upgradeId: UpgradeDefinitionId, checked: boolean): void {
    const current = heroUpgradeIds(heroId);

    if (checked) {
      if (!current.includes(upgradeId)) {
        selection.set(heroId, [...current, upgradeId]);
      }

      return;
    }

    deselectCascade(heroId, upgradeId, new Set());
  }

  function buildOrEmpty(heroId: HeroDefinitionId, selectedIds: readonly UpgradeDefinitionId[]) {
    try {
      return createHeroBuild(`picker-${heroId}`, heroId, selectedIds, catalogue);
    } catch {
      return createHeroBuild(`picker-${heroId}`, heroId, [], catalogue);
    }
  }

  function renderInternal(): void {
    container.replaceChildren();

    for (const heroId of currentHeroIds) {
      const section = document.createElement("div");
      section.className = "hud-upgrade-hero";

      const title = document.createElement("div");
      title.className = "hud-upgrade-hero-title";
      title.textContent = heroId;
      section.appendChild(title);

      const selectedIds = heroUpgradeIds(heroId);
      const build = buildOrEmpty(heroId, selectedIds);

      for (const upgrade of Object.values(catalogue.upgrades)) {
        if (upgrade.heroId !== undefined && upgrade.heroId !== heroId) {
          continue;
        }

        const selected = selectedIds.includes(upgrade.id);
        const eligible = selected || isUpgradeEligible(build, upgrade);

        const label = document.createElement("label");
        label.className = eligible ? "hud-upgrade-option" : "hud-upgrade-option is-disabled";
        label.title = upgrade.description;

        const checkbox = document.createElement("input");
        checkbox.type = "checkbox";
        checkbox.checked = selected;
        checkbox.disabled = !eligible;

        checkbox.addEventListener("change", () => {
          setSelected(heroId, upgrade.id, checkbox.checked);
          renderInternal();
          onChange();
        });

        label.appendChild(checkbox);
        label.append(` ${upgrade.name}`);
        section.appendChild(label);
      }

      container.appendChild(section);
    }
  }

  return {
    render(heroIds) {
      currentHeroIds = heroIds;
      renderInternal();
    },

    getSelection() {
      return new Map(selection);
    },

    dispose() {
      container.replaceChildren();
    },
  };
}
