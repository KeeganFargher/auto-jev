import { useRef, useState } from "react";
import { heroName } from "../../../game/catalogues.js";
import { formatCount } from "../../../ui/hero/hero-facts.js";
import { HeroIcon, MeterIcon } from "../../../ui/icons/domain-icons.js";
import { useStore } from "../../../state/use-store.js";
import { RichText, TipCard, TipHint, TipSection, TipText } from "../../../ui/tooltip/tip-card.js";
import { useTip } from "../../../ui/tooltip/use-tip.js";
import {
  METRICS,
  rankEntries,
  teamTotal,
  topSources,
  type MeterEntry,
  type MeterMetric,
  type MeterSnapshot,
  type MeterSource,
} from "./damage-tally.js";
import { METRIC_HELP, METRIC_LABELS, METRIC_TITLES, percent, plural } from "./meter-copy.js";
import type { MeterFeed } from "./meter-feed.js";
import { saveMetric, savedMetric } from "./saved-metric.js";
import { useClipped } from "./use-clipped.js";

const ROW_HEIGHT = 34;

function SourceLine({ source, total }: { source: MeterSource; total: number }) {
  return (
    <div className="tip-source" style={{ "--share": total <= 0 ? 0 : source.amount / total }}>
      <span className="tip-source-name">{source.label}</span>
      <span className="tip-source-value">{formatCount(source.amount)}</span>
      <span className="tip-source-bar">
        <span className="tip-source-fill" />
      </span>
    </div>
  );
}

function MetricTip({ metric }: { metric: MeterMetric }) {
  return (
    <TipCard
      icon={<MeterIcon metric={metric} />}
      accent="var(--meter)"
      title={METRIC_TITLES[metric]}
      subtitle="Click to show this on the meter"
      dataMetric={metric}
    >
      <TipSection>
        <TipText text={METRIC_HELP[metric]} />
      </TipSection>
    </TipCard>
  );
}

function EntryTip({
  entry,
  metric,
  team,
}: {
  entry: MeterEntry;
  metric: MeterMetric;
  team: number;
}) {
  const total = entry.totals[metric];
  const sources = topSources(entry.sources[metric]);
  const showCombos = metric === "dealt" && entry.crits + entry.setups + entry.payoffs > 0;

  return (
    <TipCard
      icon={<HeroIcon heroId={entry.heroId} />}
      accent="var(--role)"
      title={heroName(entry.heroId)}
      subtitle={`${formatCount(total)} · ${percent(team <= 0 ? 0 : total / team)} of the team`}
      tag={METRIC_TITLES[metric]}
      dataRole={entry.heroId}
    >
      <TipSection label={metric === "taken" ? "Taken from" : "Sources"}>
        {sources.length === 0 ? (
          <p className="tip-empty">Nothing yet</p>
        ) : (
          sources.map((source) => <SourceLine key={source.label} source={source} total={total} />)
        )}
      </TipSection>
      {showCombos ? (
        <TipSection>
          <p className="tip-text">
            <RichText
              text={`${plural(entry.crits, "critical hit", "critical hits")} · set up ${plural(entry.setups, "combo", "combos")} · paid off ${entry.payoffs}`}
            />
          </p>
        </TipSection>
      ) : null}
      {entry.alive ? null : <TipHint text="Fell in this fight." />}
    </TipCard>
  );
}

function MeterTab({
  metric,
  active,
  onChoose,
}: {
  metric: MeterMetric;
  active: boolean;
  onChoose: (metric: MeterMetric) => void;
}) {
  const tip = useTip({ side: "left", content: <MetricTip metric={metric} /> });

  return (
    <button
      type="button"
      className={active ? "meter-tab is-active" : "meter-tab"}
      data-metric={metric}
      aria-label={METRIC_TITLES[metric]}
      aria-pressed={active}
      onClick={() => onChoose(metric)}
      {...tip}
    >
      <MeterIcon metric={metric} />
    </button>
  );
}

function MeterRow({
  entry,
  metric,
  rank,
  top,
  team,
}: {
  entry: MeterEntry;
  metric: MeterMetric;
  rank: number;
  top: number;
  team: number;
}) {
  const value = entry.totals[metric];

  const tip = useTip({
    side: "left",
    content: <EntryTip entry={entry} metric={metric} team={team} />,
  });

  return (
    <div
      className={entry.alive ? "meter-row" : "meter-row is-dead"}
      data-role={entry.heroId}
      style={{ transform: `translateY(${rank * ROW_HEIGHT}px)` }}
      {...tip}
    >
      <span className="meter-portrait">
        <HeroIcon heroId={entry.heroId} />
      </span>
      <span className="meter-name">{heroName(entry.heroId)}</span>
      <span className="meter-value">{formatCount(value)}</span>
      <span className="meter-bar">
        <span className="meter-fill" style={{ "--fill": top <= 0 ? 0 : value / top }} />
      </span>
    </div>
  );
}

function MeterPanel({ snapshot }: { snapshot: MeterSnapshot }) {
  const [metric, setMetric] = useState(savedMetric);
  const scrollerRef = useRef<HTMLDivElement>(null);
  const clipped = useClipped(scrollerRef);
  const ranked = rankEntries(snapshot, metric);
  const rankOf = new Map(ranked.map((entry, rank) => [entry.unitId, rank]));
  const top = ranked[0]?.totals[metric] ?? 0;
  const team = teamTotal(snapshot, metric);

  function choose(next: MeterMetric): void {
    saveMetric(next);
    setMetric(next);
  }

  return (
    <section className="hud-section meter" data-metric={metric}>
      <header className="hud-section-head">
        <span className="hud-section-title" aria-label={METRIC_TITLES[metric]}>
          {METRIC_LABELS[metric]}
        </span>
        <div className="meter-tabs">
          {METRICS.map((option) => (
            <MeterTab key={option} metric={option} active={option === metric} onChoose={choose} />
          ))}
        </div>
      </header>
      <div ref={scrollerRef} className={clipped ? "meter-scroll is-clipped" : "meter-scroll"}>
        <div className="meter-rows" style={{ height: Math.max(1, ranked.length) * ROW_HEIGHT }}>
          {snapshot.entries.map((entry) => {
            const rank = rankOf.get(entry.unitId);

            if (rank === undefined) {
              throw new Error(`Damage meter lost the rank of unit ${entry.unitId}`);
            }

            return (
              <MeterRow
                key={entry.unitId}
                entry={entry}
                metric={metric}
                rank={rank}
                top={top}
                team={team}
              />
            );
          })}
        </div>
      </div>
    </section>
  );
}

export function DamageMeter({ feed }: { feed: MeterFeed }) {
  const snapshot = useStore(feed.snapshot);

  if (snapshot === null) {
    return null;
  }

  return <MeterPanel snapshot={snapshot} />;
}
