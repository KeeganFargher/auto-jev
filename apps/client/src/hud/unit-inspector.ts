import type { UnitState } from "@jev-game/game";

export interface UnitInspectorView {
  update(unit: UnitState | null): void;
  dispose(): void;
}

export function createUnitInspectorView(container: HTMLElement): UnitInspectorView {
  const root = document.createElement("dl");
  root.className = "lab-inspector";
  container.appendChild(root);

  function row(label: string, value: string): [HTMLElement, HTMLElement] {
    const dt = document.createElement("dt");
    dt.textContent = label;
    const dd = document.createElement("dd");
    dd.textContent = value;
    root.append(dt, dd);

    return [dt, dd];
  }

  return {
    update(unit) {
      root.replaceChildren();

      if (unit === null) {
        row("Selected", "none — click a unit");

        return;
      }

      row("Unit", unit.unitId);
      row("Team", unit.teamId);
      row("HP", `${unit.hp} / ${unit.maxHp}`);
      row("Alive", String(unit.alive));
      row("Attack damage", String(unit.attackDamage));
      row("Attack range", String(unit.attackRangeUnits));
      row("Attack interval (ticks)", String(unit.attackIntervalTicks));
      row("Move speed", String(unit.moveSpeedUnitsPerSecond));
      row("Target", unit.targetUnitId ?? "none");
      row("Next attack tick", String(unit.nextAttackTick));
    },

    dispose() {
      root.remove();
    },
  };
}
