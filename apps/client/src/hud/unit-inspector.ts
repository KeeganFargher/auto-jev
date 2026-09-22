import type { UnitState } from "@jev-game/game";

export interface UnitInspectorView {
  update(unit: UnitState | null): void;
  dispose(): void;
}

function statChip(parent: HTMLElement, label: string, value: string): void {
  const chip = document.createElement("span");
  chip.textContent = `${label} `;

  const strong = document.createElement("b");
  strong.textContent = value;
  chip.appendChild(strong);
  parent.appendChild(chip);
}

export function createUnitInspectorView(container: HTMLElement): UnitInspectorView {
  return {
    update(unit) {
      container.replaceChildren();

      if (unit === null) {
        container.hidden = true;

        return;
      }

      container.hidden = false;

      const isTeamB = unit.teamId === "B";

      const name = document.createElement("div");
      name.className = "hud-unit-name";

      const dot = document.createElement("i");
      dot.className = isTeamB ? "hud-dot is-team-b" : "hud-dot";
      name.appendChild(dot);
      name.append(unit.alive ? unit.unitId : `${unit.unitId} (dead)`);
      container.appendChild(name);

      const hp = document.createElement("div");
      hp.className = isTeamB ? "hud-hp is-team-b" : "hud-hp";
      const hpFill = document.createElement("span");
      hpFill.style.width = `${Math.max(0, (unit.hp / unit.maxHp) * 100)}%`;
      hp.appendChild(hpFill);
      container.appendChild(hp);

      const stats = document.createElement("div");
      stats.className = "hud-stats";
      statChip(stats, "hp", `${unit.hp}/${unit.maxHp}`);
      statChip(stats, "dmg", String(unit.attackDamage));
      statChip(stats, "rng", String(unit.attackRangeUnits));
      statChip(stats, "spd", String(unit.moveSpeedUnitsPerSecond));
      statChip(stats, "target", unit.targetUnitId ?? "none");
      container.appendChild(stats);
    },

    dispose() {
      container.replaceChildren();
      container.hidden = true;
    },
  };
}
