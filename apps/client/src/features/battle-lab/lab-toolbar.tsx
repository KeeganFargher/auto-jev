import { useSyncExternalStore, type ReactNode } from "react";
import type { BattleLabSession } from "../../session/types.js";
import { SPEED_OPTIONS } from "./lab-fights.js";

function IconButton({
  label,
  active = false,
  disabled = false,
  onClick,
  children,
}: {
  label: string;
  active?: boolean;
  disabled?: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      className={active ? "hud-icon-button is-active" : "hud-icon-button"}
      title={label}
      aria-label={label}
      disabled={disabled}
      onClick={onClick}
    >
      {children}
    </button>
  );
}

export function LabToolbar({
  session,
  onFightAgain,
  onReplay,
}: {
  session: BattleLabSession;
  onFightAgain: () => void;
  onReplay: () => void;
}) {
  const controls = useSyncExternalStore(session.subscribe, session.controls);

  return (
    <div className="hud-bar">
      <IconButton
        label="Play"
        active={controls.isRunning}
        disabled={controls.isDone}
        onClick={() => session.play()}
      >
        ▶
      </IconButton>
      <IconButton
        label="Pause"
        active={!controls.isRunning && !controls.isDone}
        onClick={() => session.pause()}
      >
        ‖
      </IconButton>
      <IconButton
        label="Step one tick"
        disabled={controls.isDone}
        onClick={() => session.stepOnce()}
      >
        ▶‖
      </IconButton>
      <IconButton label="Fight again with these teams and seed" onClick={onFightAgain}>
        ↻
      </IconButton>
      <IconButton label="Replay this fight" onClick={onReplay}>
        ⏮
      </IconButton>
      <div className="hud-speed">
        {SPEED_OPTIONS.map((speed) => (
          <button
            key={speed}
            type="button"
            className={speed === controls.speedMultiplier ? "hud-chip is-active" : "hud-chip"}
            onClick={() => session.setSpeed(speed)}
          >
            {speed}x
          </button>
        ))}
      </div>
    </div>
  );
}
