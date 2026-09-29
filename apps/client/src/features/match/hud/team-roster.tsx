import type { HeroDefinitionId } from "@jev-game/game";
import { HeroCard } from "../../../ui/hero/hero-card.js";
import { HeroIcon } from "../../../ui/icons/domain-icons.js";
import { TipCard, TipHint, TipSection, TipText } from "../../../ui/tooltip/tip-card.js";
import { useTip } from "../../../ui/tooltip/use-tip.js";

function RosterHelp({ slots }: { slots: number }) {
  return (
    <TipCard title="Your team" subtitle={`${slots} heroes fight each round`}>
      <TipSection>
        <TipText text="Click a hero on the board to draft them. Click again to send them back." />
      </TipSection>
      <TipHint text="Signatures want targets that are airborne, floating, burning or grouped. Draft heroes that set those up for each other." />
    </TipCard>
  );
}

function FilledPortrait({ heroId, slot }: { heroId: HeroDefinitionId; slot: number }) {
  const tip = useTip({
    side: "left",
    content: <HeroCard heroId={heroId} hint={`Pick ${slot + 1}`} />,
  });

  return (
    <span className="roster-portrait" data-role={heroId} tabIndex={0} {...tip}>
      <HeroIcon heroId={heroId} />
      <span className="roster-slot">{slot + 1}</span>
    </span>
  );
}

function EmptyPortrait({ slot }: { slot: number }) {
  return (
    <span className="roster-portrait is-empty">
      <span className="roster-slot">{slot + 1}</span>
    </span>
  );
}

export function TeamRoster({
  heroIds,
  slots,
}: {
  heroIds: readonly HeroDefinitionId[];
  slots: number;
}) {
  if (heroIds.length > slots) {
    throw new Error(`A team of ${slots} can't hold ${heroIds.length} heroes`);
  }

  const help = useTip({ side: "left", content: <RosterHelp slots={slots} /> });

  return (
    <div className="team-roster">
      <section className="hud-section">
        <header className="hud-section-head" tabIndex={0} {...help}>
          <span className="hud-section-title">Your team</span>
        </header>
        <div className="roster-picks">
          {Array.from({ length: slots }, (_unused, slot) => {
            const heroId = heroIds[slot];

            return heroId === undefined ? (
              <EmptyPortrait key={slot} slot={slot} />
            ) : (
              <FilledPortrait key={`${slot}:${heroId}`} heroId={heroId} slot={slot} />
            );
          })}
        </div>
      </section>
    </div>
  );
}
