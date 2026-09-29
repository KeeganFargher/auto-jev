import { useStore } from "../../../state/use-store.js";
import { UnitInspector } from "../../../ui/hero/unit-inspector.js";
import { DamageMeter } from "../damage/damage-meter.js";
import { BattleHeader } from "../hud/battle-header.js";
import { ConnectionBanner } from "../hud/connection-banner.js";
import { RoundPlate } from "../hud/round-plate.js";
import { SeatRail } from "../hud/seat-rail.js";
import { SkipButton } from "../hud/skip-button.js";
import { TeamRail } from "../hud/team-rail.js";
import { useLive, useMatch } from "../match-context.js";

export function WatchMode() {
  const controller = useMatch();
  const hud = controller.watchHud;
  const { connection } = useLive().snapshot;
  const plate = useStore(hud.plate);
  const header = useStore(hud.header);
  const rows = useStore(hud.rows);
  const selected = useStore(hud.selected);
  const canSkip = useStore(hud.canSkip);

  return (
    <>
      <SeatRail rows={rows} onWatch={hud.focus} />
      <TeamRail battle>
        <DamageMeter feed={hud.meter} />
      </TeamRail>
      {header === null ? null : <BattleHeader state={header} />}
      <UnitInspector readout={selected} className="battle-unit" />
      <RoundPlate {...plate} />
      {canSkip ? <SkipButton onSkip={hud.skip} /> : null}
      <ConnectionBanner connection={connection} onMenu={controller.leave} />
    </>
  );
}
