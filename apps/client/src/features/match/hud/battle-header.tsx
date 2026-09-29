import { classNames } from "../../../ui/class-names.js";
import { SeatSilhouette } from "../../../ui/icons/domain-icons.js";
import type { BattleHeaderState, Contestant } from "../model/battle-header.js";

const PORTRAIT_SIZE = 40;

function Side({ contestant, side }: { contestant: Contestant; side: "friendly" | "enemy" }) {
  return (
    <div className={classNames("battle-side", side === "friendly" ? "is-friendly" : "is-enemy")}>
      <div className="portrait-ring" style={{ "--ring-size": `${PORTRAIT_SIZE}px` }}>
        <div className="portrait-ring-inner" style={{ "--seat": contestant.color }}>
          <SeatSilhouette human={contestant.human} />
        </div>
      </div>
      <span className="battle-side-name">{contestant.name}</span>
    </div>
  );
}

export function BattleHeader({ state }: { state: BattleHeaderState }) {
  return (
    <div className="battle-header">
      <Side contestant={state.friendly} side="friendly" />
      <span className="battle-vs">vs</span>
      <Side contestant={state.enemy} side="enemy" />
      <span className="battle-status">{state.status}</span>
    </div>
  );
}
