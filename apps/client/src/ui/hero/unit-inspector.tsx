import { HeroCard } from "./hero-card.js";
import type { UnitReadout } from "./unit-readout.js";

export function UnitInspector({
  readout,
  className,
}: {
  readout: UnitReadout | null;
  className?: string;
}) {
  return (
    <div
      className={className === undefined ? "hud-unit" : `hud-unit ${className}`}
      hidden={readout === null}
    >
      {readout === null ? null : (
        <HeroCard
          key={readout.unitId}
          heroId={readout.heroId}
          leads={[readout.team === "friendly" ? "Ally" : "Enemy"]}
          live={readout}
        />
      )}
    </div>
  );
}
