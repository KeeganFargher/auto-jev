import { memo } from "react";
import type { Anchors } from "../../game/views/anchors.js";
import { floatKey, type FloatModel } from "../../game/views/battle-overlay.js";
import type { ScreenPoint } from "../../game/views/board-stage.js";
import { useAnchor } from "../../hooks/use-anchor.js";

function placeNumber(element: HTMLElement, point: ScreenPoint): void {
  element.style.transform = `translate(${point.x}px, ${point.y}px)`;
}

export const FloatNumber = memo(function FloatNumber({
  number,
  anchors,
}: {
  number: FloatModel;
  anchors: Anchors<ScreenPoint>;
}) {
  const ref = useAnchor(anchors, floatKey(number.id), placeNumber);

  return (
    <div ref={ref} className="float-anchor">
      <div className={`float-number is-${number.kind}`} style={{ "--side": number.side }}>
        {number.text}
      </div>
    </div>
  );
});
