import { TICK_RATE, type BattleSnapshot, type UnitState } from "@jev-game/game";
import { el, setText } from "./dom.js";
import { statusIcon } from "./icons.js";
import { buildCard, formatCount, type CardParts } from "./hero-card.js";
import { attachTip, tipCard, tipSection, tipText } from "./tooltip.js";
import {
  UNIT_STATUS_INFO,
  statusEndTick,
  unitStatuses,
  type UnitStatusKind,
} from "./unit-status.js";
import { heroDefinition } from "../game/catalogues.js";

export interface UnitInspectorView {
  show(snapshot: BattleSnapshot, unit: UnitState): void;
  hide(): void;
  dispose(): void;
}

interface StatusTimer {
  status: UnitStatusKind;
  label: HTMLElement;
}

interface Inspected {
  unitId: string;
  heroId: string;
  parts: CardParts;
  statusKey: string;
  timers: StatusTimer[];
}

function fraction(value: number, max: number): string {
  return String(Math.max(0, Math.min(1, value / max)));
}

function secondsLeft(endTick: number, tick: number): string {
  return `${Math.max(0, (endTick - tick) / TICK_RATE).toFixed(1)}s`;
}

function statusTip(status: UnitStatusKind): HTMLElement {
  const info = UNIT_STATUS_INFO[status];

  return tipCard({
    icon: statusIcon(status),
    accent: null,
    title: info.label,
    subtitle: null,
    tag: info.buff ? "Buff" : "Debuff",
    sections: [tipSection(null, tipText(info.description))],
  });
}

function statusChip(unitId: string, status: UnitStatusKind, timer: HTMLElement): HTMLElement {
  const info = UNIT_STATUS_INFO[status];

  const chip = el(
    "span",
    `unit-status ${info.buff ? "is-buff" : "is-debuff"}`,
    statusIcon(status),
    el("span", "unit-status-label", info.label),
    timer,
  );

  chip.dataset.status = status;
  attachTip(chip, {
    key: `inspector:${unitId}:${status}`,
    side: "left",
    live: false,
    render: () => statusTip(status),
  });

  return chip;
}

function syncStatuses(inspected: Inspected, snapshot: BattleSnapshot, unit: UnitState): void {
  const statuses = unitStatuses(snapshot, unit);
  const key = statuses.join("|");

  if (key !== inspected.statusKey) {
    inspected.statusKey = key;
    inspected.timers = statuses.map((status) => ({
      status,
      label: el("span", "unit-status-timer"),
    }));

    inspected.parts.statuses.replaceChildren(
      ...inspected.timers.map((timer) => statusChip(unit.unitId, timer.status, timer.label)),
    );

    inspected.parts.statuses.hidden = statuses.length === 0;
  }

  for (const timer of inspected.timers) {
    setText(timer.label, secondsLeft(statusEndTick(snapshot, unit, timer.status), snapshot.tick));
  }
}

export function createUnitInspectorView(
  container: HTMLElement,
  friendlyTeamId: string,
): UnitInspectorView {
  let inspected: Inspected | null = null;

  function hide(): void {
    if (inspected === null && container.hidden) {
      return;
    }

    inspected = null;
    container.replaceChildren();
    container.hidden = true;
  }

  function inspect(unit: UnitState): Inspected {
    if (inspected !== null && inspected.unitId === unit.unitId) {
      if (inspected.heroId !== unit.heroId) {
        throw new Error(
          `Unit ${unit.unitId} changed hero from ${inspected.heroId} to ${unit.heroId}`,
        );
      }

      return inspected;
    }

    const friendly = unit.teamId === friendlyTeamId;
    const parts = buildCard(heroDefinition(unit.heroId), [friendly ? "Ally" : "Enemy"], true);
    parts.root.classList.add("is-live");
    parts.root.dataset.team = friendly ? "friendly" : "enemy";
    container.replaceChildren(parts.root);
    container.hidden = false;
    inspected = { unitId: unit.unitId, heroId: unit.heroId, parts, statusKey: "", timers: [] };

    return inspected;
  }

  return {
    show(snapshot, unit) {
      const shown = inspect(unit);
      const parts = shown.parts;
      parts.hpFill.style.setProperty("--fill", fraction(unit.hp, unit.maxHp));
      setText(parts.hpValue, `${formatCount(unit.hp)} / ${formatCount(unit.maxHp)}`);

      if (unit.signature !== null) {
        parts.manaFill.style.setProperty("--fill", fraction(unit.mana, unit.maxMana));
        setText(parts.manaValue, `${Math.floor(unit.mana)} / ${unit.maxMana}`);
      }

      setText(parts.dealt, formatCount(unit.damageDealt));
      parts.root.classList.toggle("is-dead", !unit.alive);
      syncStatuses(shown, snapshot, unit);
    },

    hide,

    dispose() {
      hide();
    },
  };
}
