import { classNames } from "../../../ui/class-names.js";
import type { PlateState } from "../state/watch-hud.js";

export function RoundPlate({ roundText, phaseText, timer, urgent }: PlateState) {
  return (
    <div className="round-plate">
      <div className={classNames("round-plate-timer", urgent && "is-urgent")} aria-live="off">
        {timer}
      </div>
      <div className="round-plate-label">
        <div className="round-plate-round">{roundText}</div>
        <div className="round-plate-phase">{phaseText}</div>
      </div>
    </div>
  );
}
