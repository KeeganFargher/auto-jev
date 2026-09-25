import { BASIC_ATTACK_ABILITY, type BattleEvent, type BattleSnapshot, type DamageDealtEvent } from "@jev-game/game";
import { button, el, setText } from "./dom.js";
import { meterIcon } from "./icons.js";
import { heroFaceArt } from "./icon-art.js";
import { titleCase } from "./tips.js";
import { attachTip, richText, tipCard, tipHint, tipSection, tipText } from "./tooltip.js";
import { abilityDefinition, heroDefinition, heroName, upgradeDefinition } from "../game/catalogues.js";

export type MeterMetric = "dealt" | "taken" | "healing" | "shielding";

export interface DamageMeter {
  readonly root: HTMLElement;
  start(opening: BattleSnapshot, friendlyTeamId: string, history: readonly BattleEvent[]): void;
  push(events: readonly BattleEvent[]): void;
  clear(): void;
  dispose(): void;
}

interface MeterEntry {
  heroId: string;
  order: number;
  alive: boolean;
  totals: Record<MeterMetric, number>;
  sources: Record<MeterMetric, Map<string, number>>;
  crits: number;
  combos: number;
  comboBonus: number;
  row: HTMLElement;
  fill: HTMLElement;
  value: HTMLElement;
}

const METRICS: readonly MeterMetric[] = ["dealt", "taken", "healing", "shielding"];

const METRIC_TITLES: Readonly<Record<MeterMetric, string>> = {
  dealt: "Damage dealt",
  taken: "Damage taken",
  healing: "Healing done",
  shielding: "Shields given",
};

const METRIC_LABELS: Readonly<Record<MeterMetric, string>> = {
  dealt: "Damage",
  taken: "Taken",
  healing: "Healing",
  shielding: "Shields",
};

const METRIC_HELP: Readonly<Record<MeterMetric, string>> = {
  dealt: "Damage each hero dealt this fight, counting what enemy shields soaked up. A summon's damage counts for the hero that raised it.",
  taken: "Damage each hero took this fight, counting what its own shields soaked up.",
  healing: "HP each hero restored to itself and its allies this fight, lifesteal included. A summon's healing counts for the hero that raised it.",
  shielding: "Shield points each hero put on itself and its allies this fight.",
};

const SOURCE_LABELS = new Map<string, string>([
  ["lifesteal", "Lifesteal"],
  ["leech", "Leech"],
  ["combo-splash", "Combo splash"],
  ["overload", "Overload splash"],
  ["shatter", "Shatter shards"],
  ["crush", "Crush"],
]);

const STORAGE_KEY = "jev-game.meter-metric";

const ROW_HEIGHT = 34;

const RENDER_EVERY_MS = 120;

const TOP_SOURCES = 5;

function savedMetric(): MeterMetric {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);

    return METRICS.find((metric) => metric === stored) ?? "dealt";
  } catch {
    return "dealt";
  }
}

function saveMetric(metric: MeterMetric): void {
  try {
    localStorage.setItem(STORAGE_KEY, metric);
  } catch {
    return;
  }
}

function formatAmount(value: number): string {
  return Math.round(value).toLocaleString("en-US");
}

function percent(fraction: number): string {
  return `${Math.round(fraction * 100)}%`;
}

function emptyTotals(): Record<MeterMetric, number> {
  return { dealt: 0, taken: 0, healing: 0, shielding: 0 };
}

function emptySources(): Record<MeterMetric, Map<string, number>> {
  return { dealt: new Map(), taken: new Map(), healing: new Map(), shielding: new Map() };
}

function sourceLine(label: string, amount: number, total: number): HTMLElement {
  const line = el(
    "div",
    "tip-source",
    el("span", "tip-source-name", label),
    el("span", "tip-source-value", formatAmount(amount)),
    el("span", "tip-source-bar", el("span", "tip-source-fill")),
  );

  line.style.setProperty("--share", String(total <= 0 ? 0 : amount / total));

  return line;
}

function metricTip(metric: MeterMetric): HTMLElement {
  const card = tipCard({
    icon: meterIcon(metric),
    accent: "var(--meter)",
    title: METRIC_TITLES[metric],
    subtitle: "Click to show this on the meter",
    tag: null,
    sections: [tipSection(null, tipText(METRIC_HELP[metric]))],
  });

  card.dataset.metric = metric;

  return card;
}

export function createDamageMeter(): DamageMeter {
  let metric = savedMetric();
  const title = el("span", "hud-section-title", METRIC_LABELS[metric]);
  const tabs = new Map<MeterMetric, HTMLButtonElement>();
  const rows = el("div", "meter-rows");
  const scroller = el("div", "meter-scroll", rows);
  const entries = new Map<string, MeterEntry>();
  const owners = new Map<string, string>();
  const heroOfUnit = new Map<string, string>();
  const summons = new Set<string>();
  let dirty = false;
  let renderedAt = Number.NEGATIVE_INFINITY;
  let trailing = 0;
  let shownRows = -1;

  for (const option of METRICS) {
    const tab = button("meter-tab", () => choose(option), meterIcon(option));
    tab.dataset.metric = option;
    tab.setAttribute("aria-label", METRIC_TITLES[option]);
    attachTip(tab, { key: `meter-tab:${option}`, side: "left", live: false, render: () => metricTip(option) });
    tabs.set(option, tab);
  }

  const root = el("section", "hud-section meter", el("header", "hud-section-head", title, el("div", "meter-tabs", ...tabs.values())), scroller);

  function syncClip(): void {
    scroller.classList.toggle("is-clipped", scroller.scrollTop + scroller.clientHeight < scroller.scrollHeight - 1);
  }

  scroller.addEventListener("scroll", syncClip, { passive: true });
  const clipWatcher = new ResizeObserver(syncClip);
  clipWatcher.observe(scroller);
  clipWatcher.observe(rows);

  function syncTabs(): void {
    title.textContent = METRIC_LABELS[metric];
    title.setAttribute("aria-label", METRIC_TITLES[metric]);
    root.dataset.metric = metric;

    for (const [option, tab] of tabs) {
      tab.setAttribute("aria-pressed", String(option === metric));
      tab.classList.toggle("is-active", option === metric);
    }
  }

  function entryTip(entry: MeterEntry): HTMLElement {
    const total = entry.totals[metric];
    let teamTotal = 0;

    for (const other of entries.values()) {
      teamTotal += other.totals[metric];
    }

    const sorted = [...entry.sources[metric].entries()].sort((first, second) => second[1] - first[1]);
    const lines: HTMLElement[] = [];
    let rest = 0;

    sorted.forEach(([label, amount], index) => {
      if (index < TOP_SOURCES) {
        lines.push(sourceLine(label, amount, total));
      } else {
        rest += amount;
      }
    });

    if (rest > 0) {
      lines.push(sourceLine("Other", rest, total));
    }

    const sections = [tipSection(metric === "taken" ? "Taken from" : "Sources", ...(lines.length === 0 ? [el("p", "tip-empty", "Nothing yet")] : lines))];

    if (metric === "dealt" && (entry.crits > 0 || entry.combos > 0)) {
      const combos = entry.combos === 1 ? "1 combo" : `${entry.combos} combos`;

      sections.push(
        tipSection(
          null,
          el("p", "tip-text", ...richText(`${entry.crits} critical hits · ${combos} detonated for +${formatAmount(entry.comboBonus)} bonus damage`)),
        ),
      );
    }

    if (!entry.alive) {
      sections.push(tipHint("Fell in this fight."));
    }

    const card = tipCard({
      icon: heroFaceArt(entry.heroId),
      accent: "var(--role)",
      title: heroName(entry.heroId),
      subtitle: `${formatAmount(total)} · ${percent(teamTotal <= 0 ? 0 : total / teamTotal)} of the team`,
      tag: METRIC_TITLES[metric],
      sections,
    });

    card.dataset.role = entry.heroId;

    return card;
  }

  function makeEntry(unitId: string, heroId: string, order: number): MeterEntry {
    const fill = el("span", "meter-fill");
    const value = el("span", "meter-value", "0");

    const row = el(
      "div",
      "meter-row",
      el("span", "meter-portrait", heroFaceArt(heroId)),
      el("span", "meter-name", heroName(heroId)),
      value,
      el("span", "meter-bar", fill),
    );

    row.dataset.role = heroId;

    const entry: MeterEntry = {
      heroId,
      order,
      alive: true,
      totals: emptyTotals(),
      sources: emptySources(),
      crits: 0,
      combos: 0,
      comboBonus: 0,
      row,
      fill,
      value,
    };

    attachTip(row, { key: `meter:${unitId}`, side: "left", live: true, render: () => entryTip(entry) });

    return entry;
  }

  function render(): void {
    dirty = false;
    renderedAt = performance.now();
    window.clearTimeout(trailing);
    trailing = 0;

    const ranked = [...entries.values()].sort(
      (first, second) => second.totals[metric] - first.totals[metric] || first.order - second.order,
    );

    const top = ranked[0]?.totals[metric] ?? 0;

    ranked.forEach((entry, rank) => {
      const value = entry.totals[metric];
      entry.row.style.transform = `translateY(${rank * ROW_HEIGHT}px)`;
      setText(entry.value, formatAmount(value));
      entry.fill.style.setProperty("--fill", String(top <= 0 ? 0 : value / top));
      entry.row.classList.toggle("is-dead", !entry.alive);
    });

    if (ranked.length !== shownRows) {
      shownRows = ranked.length;
      rows.style.height = `${Math.max(1, ranked.length) * ROW_HEIGHT}px`;
    }
  }

  function schedule(): void {
    if (!dirty) {
      return;
    }

    if (performance.now() - renderedAt >= RENDER_EVERY_MS) {
      render();

      return;
    }

    if (trailing === 0) {
      trailing = window.setTimeout(() => {
        trailing = 0;

        if (dirty) {
          render();
        }
      }, RENDER_EVERY_MS);
    }
  }

  function choose(next: MeterMetric): void {
    metric = next;
    saveMetric(next);
    syncTabs();
    render();
  }

  function ownerEntry(unitId: string): MeterEntry | undefined {
    const owner = owners.get(unitId);

    return owner === undefined ? undefined : entries.get(owner);
  }

  function add(entry: MeterEntry, which: MeterMetric, label: string, amount: number): void {
    if (amount <= 0) {
      return;
    }

    entry.totals[which] += amount;
    entry.sources[which].set(label, (entry.sources[which].get(label) ?? 0) + amount);
    dirty = true;
  }

  function summonLabel(heroId: string): string {
    return heroDefinition(heroId)?.summon === true ? heroName(heroId) : `Risen ${heroName(heroId)}`;
  }

  function sourceLabel(unitId: string, abilityId: string): string {
    const heroId = heroOfUnit.get(unitId);

    if (heroId !== undefined && summons.has(unitId)) {
      const hero = heroDefinition(heroId);
      const named = hero?.summon === true && hero.basicAttackId !== abilityId ? abilityDefinition(abilityId)?.name : undefined;

      return named ?? summonLabel(heroId);
    }

    if (abilityId === BASIC_ATTACK_ABILITY || (heroId !== undefined && heroDefinition(heroId)?.basicAttackId === abilityId)) {
      return "Basic attack";
    }

    return abilityDefinition(abilityId)?.name ?? upgradeDefinition(abilityId)?.name ?? SOURCE_LABELS.get(abilityId) ?? titleCase(abilityId);
  }

  function attackerLabel(event: DamageDealtEvent): string {
    if (event.sourceUnitId === event.targetUnitId) {
      return "Self";
    }

    const heroId = heroOfUnit.get(event.sourceUnitId);

    if (heroId === undefined) {
      return titleCase(event.sourceUnitId);
    }

    return summons.has(event.sourceUnitId) ? summonLabel(heroId) : heroName(heroId);
  }

  function ingestDamage(event: DamageDealtEvent): void {
    const amount = event.amount + event.shieldAbsorbed;
    const attacker = ownerEntry(event.sourceUnitId);
    const victim = entries.get(event.targetUnitId);

    if (attacker !== undefined && !owners.has(event.targetUnitId)) {
      add(attacker, "dealt", event.dot === undefined ? sourceLabel(event.sourceUnitId, event.abilityId) : titleCase(event.dot), amount);

      if (event.crit === true) {
        attacker.crits += 1;
      }
    }

    if (victim !== undefined) {
      add(victim, "taken", attackerLabel(event), amount);
    }
  }

  function ingest(event: BattleEvent): void {
    if (event.kind === "damage-dealt") {
      ingestDamage(event);

      return;
    }

    if (event.kind === "healing-done" || event.kind === "shield-applied") {
      const entry = ownerEntry(event.sourceUnitId);

      if (entry !== undefined) {
        add(entry, event.kind === "healing-done" ? "healing" : "shielding", sourceLabel(event.sourceUnitId, event.abilityId), event.amount);
      }

      return;
    }

    if (event.kind === "unit-spawned") {
      heroOfUnit.set(event.unitId, event.heroId);
      summons.add(event.unitId);
      const owner = owners.get(event.summonerUnitId);

      if (owner !== undefined) {
        owners.set(event.unitId, owner);
      }

      return;
    }

    if (event.kind === "combo-detonated") {
      const entry = ownerEntry(event.sourceUnitId);

      if (entry !== undefined) {
        entry.combos += 1;
        entry.comboBonus += event.bonusDamage;
        dirty = true;
      }

      return;
    }

    if (event.kind === "death" || event.kind === "revived") {
      const entry = entries.get(event.unitId);

      if (entry !== undefined) {
        entry.alive = event.kind === "revived";
        dirty = true;
      }
    }
  }

  function reset(): void {
    window.clearTimeout(trailing);
    trailing = 0;
    dirty = false;
    entries.clear();
    owners.clear();
    heroOfUnit.clear();
    summons.clear();
    rows.replaceChildren();
    shownRows = -1;
    rows.style.height = "";
    scroller.scrollTop = 0;
    scroller.classList.remove("is-clipped");
  }

  syncTabs();

  return {
    root,

    start(opening, friendlyTeamId, history) {
      reset();
      let order = 0;

      for (const unit of opening.units) {
        heroOfUnit.set(unit.unitId, unit.heroId);

        if (unit.teamId === friendlyTeamId && unit.summonerUnitId === null) {
          const entry = makeEntry(unit.unitId, unit.heroId, order);
          order += 1;
          entries.set(unit.unitId, entry);
          owners.set(unit.unitId, unit.unitId);
          rows.append(entry.row);
        }
      }

      for (const unit of opening.units) {
        if (unit.summonerUnitId !== null) {
          summons.add(unit.unitId);
          const owner = owners.get(unit.summonerUnitId);

          if (owner !== undefined) {
            owners.set(unit.unitId, owner);
          }
        }
      }

      for (const event of history) {
        ingest(event);
      }

      render();
    },

    push(events) {
      for (const event of events) {
        ingest(event);
      }

      schedule();
    },

    clear() {
      reset();
    },

    dispose() {
      reset();
      clipWatcher.disconnect();
      root.remove();
    },
  };
}
