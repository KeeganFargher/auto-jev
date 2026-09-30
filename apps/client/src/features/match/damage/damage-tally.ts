import type {
  BattleEvent,
  BattleSnapshot,
  ComboLinkEvent,
  DamageCause,
  DamageEvent,
  HealCause,
  HealEvent,
} from "@jev-game/game";
import { heroDefinition, heroName } from "../../../game/catalogues.js";
import type { MeterMetric } from "../../../ui/icons/glyph-maps.js";

export type { MeterMetric };

export const METRICS: readonly MeterMetric[] = ["dealt", "taken", "healing"];

export const TOP_SOURCES = 5;

export interface MeterSource {
  label: string;
  amount: number;
}

export interface MeterEntry {
  unitId: string;
  heroId: string;
  order: number;
  alive: boolean;
  totals: Readonly<Record<MeterMetric, number>>;
  sources: Readonly<Record<MeterMetric, readonly MeterSource[]>>;
  crits: number;
  setups: number;
  payoffs: number;
}

export interface MeterSnapshot {
  entries: readonly MeterEntry[];
}

export interface DamageTally {
  ingest(events: readonly BattleEvent[]): boolean;
  read(): MeterSnapshot;
}

interface Draft {
  unitId: string;
  heroId: string;
  order: number;
  alive: boolean;
  totals: Record<MeterMetric, number>;
  sources: Record<MeterMetric, Map<string, number>>;
  crits: number;
  setups: number;
  payoffs: number;
}

type SignatureCause = Exclude<DamageCause, "attack" | "splash">;

const CAUSE_LABELS: Readonly<Record<SignatureCause, string>> = {
  hammer: "Hammerfall",
  throw: "Throws",
  bowling: "Bowling",
  blast: "Fuse blasts",
  burn: "Burning",
  yank: "Yank",
  pull: "Collection Day",
  frost: "Everybody Settle Down",
};

const HEAL_LABELS: Readonly<Record<Exclude<HealCause, "attack">, string>> = {
  "safety-bubble": "Safety Bubble",
};

export function damageLabel(heroId: string, cause: DamageCause): string {
  const attack = heroDefinition(heroId).attack;

  if (cause === "attack") {
    return attack.name;
  }

  return cause === "splash" ? `${attack.name} splash` : CAUSE_LABELS[cause];
}

export function healLabel(heroId: string, cause: HealCause): string {
  return cause === "attack" ? heroDefinition(heroId).attack.name : HEAL_LABELS[cause];
}

export function topSources(
  sources: readonly MeterSource[],
  limit: number = TOP_SOURCES,
): readonly MeterSource[] {
  const shown = sources.slice(0, limit);
  const rest = sources.slice(limit).reduce((sum, source) => sum + source.amount, 0);

  return rest > 0 ? [...shown, { label: "Other", amount: rest }] : shown;
}

export function teamTotal(snapshot: MeterSnapshot, metric: MeterMetric): number {
  return snapshot.entries.reduce((sum, entry) => sum + entry.totals[metric], 0);
}

export function rankEntries(snapshot: MeterSnapshot, metric: MeterMetric): readonly MeterEntry[] {
  return [...snapshot.entries].sort(
    (first, second) => second.totals[metric] - first.totals[metric] || first.order - second.order,
  );
}

function emptyDraft(unitId: string, heroId: string, order: number): Draft {
  return {
    unitId,
    heroId,
    order,
    alive: true,
    totals: { dealt: 0, taken: 0, healing: 0 },
    sources: { dealt: new Map(), taken: new Map(), healing: new Map() },
    crits: 0,
    setups: 0,
    payoffs: 0,
  };
}

function frozenSources(sources: ReadonlyMap<string, number>): readonly MeterSource[] {
  return [...sources.entries()]
    .map(([label, amount]) => ({ label, amount }))
    .sort((first, second) => second.amount - first.amount);
}

function frozen(draft: Draft): MeterEntry {
  return {
    unitId: draft.unitId,
    heroId: draft.heroId,
    order: draft.order,
    alive: draft.alive,
    totals: { ...draft.totals },
    sources: {
      dealt: frozenSources(draft.sources.dealt),
      taken: frozenSources(draft.sources.taken),
      healing: frozenSources(draft.sources.healing),
    },
    crits: draft.crits,
    setups: draft.setups,
    payoffs: draft.payoffs,
  };
}

export function createDamageTally(opening: BattleSnapshot, friendlyTeamId: string): DamageTally {
  const drafts = new Map<string, Draft>();
  const heroOfUnit = new Map<string, string>();

  for (const unit of opening.units) {
    heroOfUnit.set(unit.unitId, unit.heroId);

    if (unit.teamId === friendlyTeamId) {
      drafts.set(unit.unitId, emptyDraft(unit.unitId, unit.heroId, drafts.size));
    }
  }

  if (drafts.size === 0) {
    throw new Error(`Damage meter found no units on team ${friendlyTeamId}`);
  }

  function heroOf(unitId: string): string {
    const heroId = heroOfUnit.get(unitId);

    if (heroId === undefined) {
      throw new Error(`Damage meter has never seen unit ${unitId}`);
    }

    return heroId;
  }

  function add(draft: Draft, metric: MeterMetric, label: string, amount: number): boolean {
    if (amount <= 0) {
      return false;
    }

    draft.totals[metric] += amount;
    draft.sources[metric].set(label, (draft.sources[metric].get(label) ?? 0) + amount);

    return true;
  }

  function ingestDamage(event: DamageEvent): boolean {
    const attacker = drafts.get(event.sourceUnitId);
    const victim = drafts.get(event.targetUnitId);
    let changed = false;

    if (attacker !== undefined && victim === undefined) {
      changed = add(attacker, "dealt", damageLabel(attacker.heroId, event.cause), event.amount);

      if (event.crit) {
        attacker.crits += 1;
        changed = true;
      }
    }

    if (victim !== undefined) {
      const label =
        event.sourceUnitId === event.targetUnitId ? "Self" : heroName(heroOf(event.sourceUnitId));

      changed = add(victim, "taken", label, event.amount) || changed;
    }

    return changed;
  }

  function ingestHeal(event: HealEvent): boolean {
    const healer = drafts.get(event.sourceUnitId);

    if (healer === undefined) {
      return false;
    }

    return add(healer, "healing", healLabel(healer.heroId, event.cause), event.amount);
  }

  function ingestCombo(event: ComboLinkEvent): boolean {
    const setup = drafts.get(event.setupUnitId);
    const payoff = drafts.get(event.payoffUnitId);

    if (setup !== undefined) {
      setup.setups += 1;
    }

    if (payoff !== undefined) {
      payoff.payoffs += 1;
    }

    return setup !== undefined || payoff !== undefined;
  }

  function ingestOne(event: BattleEvent): boolean {
    switch (event.kind) {
      case "damage":
        return ingestDamage(event);

      case "heal":
        return ingestHeal(event);

      case "combo-link":
        return ingestCombo(event);

      case "death": {
        const draft = drafts.get(event.unitId);

        if (draft === undefined) {
          return false;
        }

        draft.alive = false;

        return true;
      }

      default:
        return false;
    }
  }

  return {
    ingest(events) {
      let changed = false;

      for (const event of events) {
        changed = ingestOne(event) || changed;
      }

      return changed;
    },

    read() {
      return { entries: [...drafts.values()].map(frozen) };
    },
  };
}
