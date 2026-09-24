import { TICK_RATE, type ConditionKind, type ControlKind, type DotKind, type UnitState } from "@jev-game/game";
import { el } from "./dom.js";
import { conditionIcon, meterIcon, statusIcon } from "./icons.js";
import { buildCard, cardStats, fillStats, formatCount, type CardParts } from "./hero-card.js";
import { conditionName } from "./tips.js";

export interface UnitInspectorView {
  update(unit: UnitState | null, tick: number): void;
  dispose(): void;
}

type StatusTone = "buff" | "debuff" | "mark";

interface UnitStatus {
  key: string;
  label: string;
  tone: StatusTone;
  condition: ConditionKind | null;
  icon(): SVGSVGElement;
}

interface Inspected {
  unitId: string;
  parts: CardParts;
  statusKey: string;
  statusLabels: HTMLElement[];
}

const CONTROL_NAMES: Readonly<Record<ControlKind, string>> = {
  stunned: "Stunned",
  frozen: "Frozen",
  "knocked-down": "Knocked down",
  hexed: "Hexed",
};

const DOT_NAMES: Readonly<Record<DotKind, string>> = {
  burn: "Burn",
  poison: "Poison",
};

function secondsLeft(expiresAtTick: number, tick: number): string {
  return `${Math.max(0, (expiresAtTick - tick) / TICK_RATE).toFixed(1)}s`;
}

function unitStatuses(unit: UnitState, tick: number): UnitStatus[] {
  const statuses: UnitStatus[] = [];

  if (!unit.alive) {
    return statuses;
  }

  const { condition, control, taunt, slow, shield } = unit;

  if (condition !== null) {
    statuses.push({
      key: `condition:${condition.condition}`,
      label: `${conditionName(condition.condition)} ${secondsLeft(condition.expiresAtTick, tick)}`,
      tone: "mark",
      condition: condition.condition,
      icon: () => conditionIcon(condition.condition),
    });
  }

  if (control !== null) {
    statuses.push({
      key: `control:${control.control}`,
      label: `${CONTROL_NAMES[control.control]} ${secondsLeft(control.expiresAtTick, tick)}`,
      tone: "debuff",
      condition: null,
      icon: () => statusIcon(control.control),
    });
  }

  if (taunt !== null) {
    statuses.push({
      key: "taunted",
      label: `Taunted ${secondsLeft(taunt.expiresAtTick, tick)}`,
      tone: "debuff",
      condition: null,
      icon: () => statusIcon("taunted"),
    });
  }

  if (slow !== null) {
    statuses.push({
      key: "slowed",
      label: `Slowed ${Math.round((1 - slow.speedMultiplier) * 100)}%`,
      tone: "debuff",
      condition: null,
      icon: () => statusIcon("frozen"),
    });
  }

  for (const dot of unit.dots) {
    statuses.push({
      key: `dot:${dot.dot}`,
      label: `${DOT_NAMES[dot.dot]} ×${dot.stacks}`,
      tone: "debuff",
      condition: null,
      icon: () => statusIcon(dot.dot),
    });
  }

  if (unit.link !== null) {
    statuses.push({ key: "linked", label: "Linked", tone: "debuff", condition: null, icon: () => statusIcon("linked") });
  }

  if (shield !== null && shield.amount > 0) {
    statuses.push({
      key: "shield",
      label: `Shield ${formatCount(shield.amount)}`,
      tone: "buff",
      condition: null,
      icon: () => meterIcon("shielding"),
    });
  }

  if (unit.invulnerableUntilTick !== 0) {
    statuses.push({ key: "invulnerable", label: "Invulnerable", tone: "buff", condition: null, icon: () => statusIcon("invulnerable") });
  }

  if (unit.untargetableUntilTick !== 0) {
    statuses.push({ key: "untargetable", label: "Untargetable", tone: "buff", condition: null, icon: () => statusIcon("untargetable") });
  }

  if (unit.channel !== null) {
    statuses.push({ key: "channeling", label: "Channeling", tone: "buff", condition: null, icon: () => statusIcon("channeling") });
  }

  return statuses;
}

function syncStatuses(inspected: Inspected, statuses: readonly UnitStatus[]): void {
  const key = statuses.map((status) => status.key).join("|");

  if (key !== inspected.statusKey) {
    inspected.statusKey = key;
    inspected.statusLabels = [];

    const chips = statuses.map((status) => {
      const label = el("span", "unit-status-label", status.label);
      inspected.statusLabels.push(label);
      const chip = el("span", `unit-status is-${status.tone}`, status.icon(), label);

      if (status.condition !== null) {
        chip.dataset.condition = status.condition;
      }

      return chip;
    });

    inspected.parts.statuses.replaceChildren(...chips);
    inspected.parts.statuses.hidden = chips.length === 0;

    return;
  }

  statuses.forEach((status, index) => {
    const label = inspected.statusLabels[index];

    if (label !== undefined && label.textContent !== status.label) {
      label.textContent = status.label;
    }
  });
}

function leadFor(unit: UnitState, friendlyTeamId: string): string {
  const side = unit.teamId === friendlyTeamId ? "Ally" : "Enemy";

  return unit.summonerUnitId === null ? side : `${side} summon`;
}

export function createUnitInspectorView(container: HTMLElement, friendlyTeamId: string): UnitInspectorView {
  let inspected: Inspected | null = null;

  function clear(): void {
    inspected = null;
    container.replaceChildren();
    container.hidden = true;
  }

  return {
    update(unit, tick) {
      if (unit === null) {
        if (inspected !== null || !container.hidden) {
          clear();
        }

        return;
      }

      const stats = cardStats(unit, unit.heroId, unit.attackSpeedBonus);

      if (inspected?.unitId !== unit.unitId) {
        const parts = buildCard(unit.heroId, unit.build, stats, { lead: leadFor(unit, friendlyTeamId), slot: null, hint: null, live: true });
        parts.root.classList.add("is-live");
        parts.root.dataset.team = unit.teamId === friendlyTeamId ? "friendly" : "enemy";
        inspected = { unitId: unit.unitId, parts, statusKey: "", statusLabels: [] };
        container.replaceChildren(parts.root);
        container.hidden = false;
      }

      const { parts } = inspected;
      const hpRatio = unit.maxHp > 0 ? Math.max(0, Math.min(1, unit.hp / unit.maxHp)) : 0;
      const shieldRatio = unit.shield === null || unit.maxHp <= 0 ? 0 : Math.min(1 - hpRatio, unit.shield.amount / unit.maxHp);
      parts.hpFill.style.setProperty("--fill", String(hpRatio));
      parts.hpShield.style.setProperty("--from", String(hpRatio));
      parts.hpShield.style.setProperty("--fill", String(shieldRatio));
      parts.hpValue.textContent = `${formatCount(Math.max(0, unit.hp))} / ${formatCount(unit.maxHp)}`;
      parts.mana.hidden = unit.maxMana <= 0;

      if (unit.maxMana > 0) {
        parts.manaFill.style.setProperty("--fill", String(Math.max(0, Math.min(1, unit.mana / unit.maxMana))));
        parts.manaValue.textContent = `${Math.floor(unit.mana)} / ${unit.maxMana}`;
      }

      if (stats !== null) {
        fillStats(parts, stats, unit.damageDealt);
      }

      parts.root.classList.toggle("is-dead", !unit.alive);
      syncStatuses(inspected, unitStatuses(unit, tick));
    },

    dispose() {
      clear();
    },
  };
}
