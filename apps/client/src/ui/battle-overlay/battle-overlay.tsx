import type { BattleOverlay as BattleOverlayFeed } from "../../game/views/battle-overlay.js";
import { useStore } from "../../state/use-store.js";
import { FloatNumber } from "./float-number.js";
import { UnitPlate } from "./unit-plate.js";

export function BattleOverlay({ overlay }: { overlay: BattleOverlayFeed }) {
  const plates = useStore(overlay.plates);
  const numbers = useStore(overlay.numbers);

  return (
    <>
      {plates.map((plate) => (
        <UnitPlate key={plate.unitId} plate={plate} anchors={overlay.anchors} />
      ))}
      {numbers.map((number) => (
        <FloatNumber key={number.id} number={number} anchors={overlay.anchors} />
      ))}
    </>
  );
}
