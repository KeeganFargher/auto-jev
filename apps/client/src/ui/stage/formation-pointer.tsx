import { useState } from "react";
import type { FormationCursor, FormationView } from "../../game/views/formation-view.js";

export function FormationPointer({ view, locked }: { view: FormationView; locked: boolean }) {
  const [cursor, setCursor] = useState<FormationCursor>("auto");

  return (
    <div
      className="board-pick"
      style={{ cursor: locked ? "auto" : cursor }}
      onPointerDown={(event) => {
        const next = view.press(event.clientX, event.clientY);

        if (next === "grabbing") {
          event.currentTarget.setPointerCapture(event.pointerId);
          event.preventDefault();
        }

        setCursor(next);
      }}
      onPointerMove={(event) => setCursor(view.move(event.clientX, event.clientY))}
      onPointerUp={(event) => {
        view.release(event.clientX, event.clientY, true);
        setCursor("auto");
      }}
      onPointerCancel={(event) => {
        view.release(event.clientX, event.clientY, false);
        setCursor("auto");
      }}
    />
  );
}
