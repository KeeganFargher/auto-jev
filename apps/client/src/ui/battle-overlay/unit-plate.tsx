import { memo } from "react";
import type { Anchors } from "../../game/views/anchors.js";
import { plateKey, type PlateModel } from "../../game/views/battle-overlay.js";
import type { ScreenPoint } from "../../game/views/board-stage.js";
import { UNIT_STATUS_INFO, type UnitStatusKind } from "../../game/unit-status.js";
import { useAnchor } from "../../hooks/use-anchor.js";
import { classNames } from "../class-names.js";
import { StatusIcon } from "../icons/domain-icons.js";

function percent(fraction: number): string {
  return `${(fraction * 100).toFixed(1)}%`;
}

function placePlate(element: HTMLElement, point: ScreenPoint): void {
  element.style.transform = `translate(${point.x}px, ${point.y}px)`;
}

function StatusChip({ status }: { status: UnitStatusKind }) {
  return (
    <span
      className={classNames("status-chip", UNIT_STATUS_INFO[status].buff ? "is-buff" : "is-debuff")}
      data-status={status}
    >
      <StatusIcon status={status} />
    </span>
  );
}

function ChainBadge({ count, flourish }: { count: number; flourish: boolean }) {
  return (
    <span className={classNames("unit-plate-chain", flourish && "is-flourish")}>×{count}</span>
  );
}

export const UnitPlate = memo(function UnitPlate({
  plate,
  anchors,
}: {
  plate: PlateModel;
  anchors: Anchors<ScreenPoint>;
}) {
  const ref = useAnchor(anchors, plateKey(plate.unitId), placePlate);

  return (
    <div
      ref={ref}
      className={classNames("unit-plate", plate.friendly ? "is-friendly" : "is-enemy")}
      hidden={!plate.alive}
    >
      {plate.chain === null ? null : (
        <ChainBadge
          key={plate.chain.serial}
          count={plate.chain.count}
          flourish={plate.chain.flourish}
        />
      )}
      <div className="unit-plate-bar-row">
        <div className="unit-plate-bar" style={{ "--segment": plate.segment }}>
          <div className="unit-plate-trail" style={{ width: percent(plate.hp) }} />
          <div className="unit-plate-hp" style={{ width: percent(plate.hp) }} />
        </div>
        <div className="unit-plate-status">
          {plate.statuses.map((status) => (
            <StatusChip key={status} status={status} />
          ))}
        </div>
      </div>
      {plate.mana === null ? null : (
        <div className={classNames("unit-plate-mana", plate.manaFull && "is-full")}>
          <div className="unit-plate-mana-fill" style={{ width: percent(plate.mana) }} />
        </div>
      )}
      {plate.label === null ? null : <div className="unit-plate-label">{plate.label}</div>}
    </div>
  );
});
