import type {
  BattleEvent,
  BattleSnapshot,
  ComboLinkEvent,
  DamageCause,
  DamageEvent,
  HealCause,
  HealEvent,
} from "@jev-game/game";
import { button, el, setText } from "./dom.js";
import { heroIcon, meterIcon, type MeterMetric } from "./icons.js";
import { attachTip, richText, tipCard, tipHint, tipSection, tipText } from "./tooltip.js";
import { heroDefinition, heroName } from "../game/catalogues.js";

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
  setups: number;
  payoffs: number;
  row: HTMLElement;
  fill: HTMLElement;
  value: HTMLElement;
}

type SignatureCause = Exclude<DamageCause, "attack" | "splash">;

const METRICS: readonly MeterMetric[] = ["dealt", "taken", "healing"];

const METRIC_TITLES: Readonly<Record<MeterMetric, string>> = {
  dealt: "Damage dealt",
  taken: "Damage taken",
  healing: "Healing done",
};

const METRIC_LABELS: Readonly<Record<MeterMetric, string>> = {
  dealt: "Damage",
  taken: "Taken",
  healing: "Healing",
};

const METRIC_HELP: Readonly<Record<MeterMetric, string>> = {
  dealt: "Damage each hero dealt to enemies this fight, fire and knock-on hits included.",
  taken: "Damage each hero took this fight, from enemies and from friendly blasts.",
  healing: "HP each hero restored to its allies this fight.",
};

const CAUSE_LABELS: Readonly<Record<SignatureCause, string>> = {
  hammer: "Hammerfall",
  throw: "Throws",
  bowling: "Bowling",
  blast: "Fuse blasts",
  burn: "Burning",
  yank: "Yank",
};

const HEAL_LABELS: Readonly<Record<Exclude<HealCause, "attack">, string>> = {
  "safety-bubble": "Safety Bubble",
};

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

function plural(count: number, one: string, many: string): string {
  return `${count} ${count === 1 ? one : many}`;
}

function emptyTotals(): Record<MeterMetric, number> {
  return { dealt: 0, taken: 0, healing: 0 };
}

function emptySources(): Record<MeterMetric, Map<string, number>> {
  return { dealt: new Map(), taken: new Map(), healing: new Map() };
}

function damageLabel(heroId: string, cause: DamageCause): string {
  const attack = heroDefinition(heroId).attack;

  if (cause === "attack") {
    return attack.name;
  }

  return cause === "splash" ? `${attack.name} splash` : CAUSE_LABELS[cause];
}

function healLabel(heroId: string, cause: HealCause): string {
  return cause === "attack" ? heroDefinition(heroId).attack.name : HEAL_LABELS[cause];
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
  const heroOfUnit = new Map<string, string>();
  let dirty = false;
  let renderedAt = Number.NEGATIVE_INFINITY;
  let trailing = 0;
  let shownRows = -1;

  for (const option of METRICS) {
    const tab = button("meter-tab", () => choose(option), meterIcon(option));
    tab.dataset.metric = option;
    tab.setAttribute("aria-label", METRIC_TITLES[option]);

    attachTip(tab, {
      key: `meter-tab:${option}`,
      side: "left",
      live: false,
      render: () => metricTip(option),
    });

    tabs.set(option, tab);
  }

  const root = el(
    "section",
    "hud-section meter",
    el("header", "hud-section-head", title, el("div", "meter-tabs", ...tabs.values())),
    scroller,
  );

  function syncClip(): void {
    scroller.classList.toggle(
      "is-clipped",
      scroller.scrollTop + scroller.clientHeight < scroller.scrollHeight - 1,
    );
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

  function heroOf(unitId: string): string {
    const heroId = heroOfUnit.get(unitId);

    if (heroId === undefined) {
      throw new Error(`Damage meter has never seen unit ${unitId}`);
    }

    return heroId;
  }

  function entryTip(entry: MeterEntry): HTMLElement {
    const total = entry.totals[metric];
    let teamTotal = 0;

    for (const other of entries.values()) {
      teamTotal += other.totals[metric];
    }

    const sorted = [...entry.sources[metric].entries()].sort(
      (first, second) => second[1] - first[1],
    );

    const lines = sorted
      .slice(0, TOP_SOURCES)
      .map(([label, amount]) => sourceLine(label, amount, total));

    const rest = sorted.slice(TOP_SOURCES).reduce((sum, [, amount]) => sum + amount, 0);

    if (rest > 0) {
      lines.push(sourceLine("Other", rest, total));
    }

    const sections = [
      tipSection(
        metric === "taken" ? "Taken from" : "Sources",
        ...(lines.length === 0 ? [el("p", "tip-empty", "Nothing yet")] : lines),
      ),
    ];

    if (metric === "dealt" && entry.crits + entry.setups + entry.payoffs > 0) {
      sections.push(
        tipSection(
          null,
          el(
            "p",
            "tip-text",
            ...richText(
              `${plural(entry.crits, "critical hit", "critical hits")} · set up ${plural(entry.setups, "combo", "combos")} · paid off ${entry.payoffs}`,
            ),
          ),
        ),
      );
    }

    if (!entry.alive) {
      sections.push(tipHint("Fell in this fight."));
    }

    const card = tipCard({
      icon: heroIcon(entry.heroId),
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
      el("span", "meter-portrait", heroIcon(heroId)),
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
      setups: 0,
      payoffs: 0,
      row,
      fill,
      value,
    };

    attachTip(row, {
      key: `meter:${unitId}`,
      side: "left",
      live: true,
      render: () => entryTip(entry),
    });

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

  function add(entry: MeterEntry, which: MeterMetric, label: string, amount: number): void {
    if (amount <= 0) {
      return;
    }

    entry.totals[which] += amount;
    entry.sources[which].set(label, (entry.sources[which].get(label) ?? 0) + amount);
    dirty = true;
  }

  function ingestDamage(event: DamageEvent): void {
    const attacker = entries.get(event.sourceUnitId);
    const victim = entries.get(event.targetUnitId);

    if (attacker !== undefined && victim === undefined) {
      add(attacker, "dealt", damageLabel(attacker.heroId, event.cause), event.amount);

      if (event.crit) {
        attacker.crits += 1;
      }
    }

    if (victim !== undefined) {
      const label =
        event.sourceUnitId === event.targetUnitId ? "Self" : heroName(heroOf(event.sourceUnitId));

      add(victim, "taken", label, event.amount);
    }
  }

  function ingestHeal(event: HealEvent): void {
    const healer = entries.get(event.sourceUnitId);

    if (healer !== undefined) {
      add(healer, "healing", healLabel(healer.heroId, event.cause), event.amount);
    }
  }

  function ingestCombo(event: ComboLinkEvent): void {
    const setup = entries.get(event.setupUnitId);
    const payoff = entries.get(event.payoffUnitId);

    if (setup !== undefined) {
      setup.setups += 1;
      dirty = true;
    }

    if (payoff !== undefined) {
      payoff.payoffs += 1;
      dirty = true;
    }
  }

  function ingest(event: BattleEvent): void {
    switch (event.kind) {
      case "damage": {
        ingestDamage(event);

        return;
      }

      case "heal": {
        ingestHeal(event);

        return;
      }

      case "combo-link": {
        ingestCombo(event);

        return;
      }

      case "death": {
        const entry = entries.get(event.unitId);

        if (entry !== undefined) {
          entry.alive = false;
          dirty = true;
        }

        return;
      }

      default: {
        return;
      }
    }
  }

  function reset(): void {
    window.clearTimeout(trailing);
    trailing = 0;
    dirty = false;
    entries.clear();
    heroOfUnit.clear();
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

        if (unit.teamId === friendlyTeamId) {
          const entry = makeEntry(unit.unitId, unit.heroId, order);
          order += 1;
          entries.set(unit.unitId, entry);
          rows.append(entry.row);
        }
      }

      if (entries.size === 0) {
        throw new Error(`Damage meter found no units on team ${friendlyTeamId}`);
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
