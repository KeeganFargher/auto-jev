import type { ReactNode } from "react";
import { classNames } from "../../../ui/class-names.js";

export function TeamRail({ battle = false, children }: { battle?: boolean; children: ReactNode }) {
  return (
    <div
      className={classNames("team-rail", battle && "is-battle")}
      aria-label="Your team"
      data-tip-edge=""
    >
      {children}
    </div>
  );
}
