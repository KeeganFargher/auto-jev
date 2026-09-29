import type { ReactNode } from "react";
import { classNames } from "../../../ui/class-names.js";

export function StagePanel({
  draft = false,
  entering = false,
  children,
}: {
  draft?: boolean;
  entering?: boolean;
  children: ReactNode;
}) {
  return (
    <div className={classNames("match-stage", draft && "is-draft", entering && "is-entering")}>
      {children}
    </div>
  );
}
