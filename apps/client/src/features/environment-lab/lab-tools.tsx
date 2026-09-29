import type { ReactNode } from "react";
import { classNames } from "../../ui/class-names.js";
import { FRAMING_LABELS, FRAMINGS, type Framing } from "./framing.js";

function ToolButton({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      className={classNames("pill-button", "env-toggle", active && "is-active")}
      onClick={onClick}
    >
      {children}
    </button>
  );
}

export function LabTools({
  framing,
  showGuides,
  showStats,
  onFrame,
  onToggleGuides,
  onToggleStats,
}: {
  framing: Framing;
  showGuides: boolean;
  showStats: boolean;
  onFrame: (framing: Framing) => void;
  onToggleGuides: () => void;
  onToggleStats: () => void;
}) {
  return (
    <div className="env-tools">
      {FRAMINGS.map((option) => (
        <ToolButton key={option} active={option === framing} onClick={() => onFrame(option)}>
          {FRAMING_LABELS[option]}
        </ToolButton>
      ))}
      <ToolButton active={showGuides} onClick={onToggleGuides}>
        HUD
      </ToolButton>
      <ToolButton active={showStats} onClick={onToggleStats}>
        Stats
      </ToolButton>
    </div>
  );
}
