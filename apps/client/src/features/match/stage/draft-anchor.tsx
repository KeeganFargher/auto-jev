import type { HeroDefinitionId } from "@jev-game/game";
import type { ReactNode } from "react";
import type { Anchors } from "../../../game/views/anchors.js";
import type { DraftPlacement } from "../../../game/views/draft-view.js";
import { useAnchor } from "../../../hooks/use-anchor.js";
import { classNames } from "../../../ui/class-names.js";

function placeDraftSlot(element: HTMLElement, placement: DraftPlacement): void {
  element.style.transform = `translate(${placement.left}px, ${placement.top}px)`;
  element.style.width = `${placement.width}px`;
  element.style.setProperty("--model-height", `${placement.model}px`);
  element.style.setProperty("--appear", String(placement.appear));
}

export function DraftAnchor({
  anchors,
  heroId,
  hovered,
  out,
  onEnter,
  onLeave,
  children,
}: {
  anchors: Anchors<DraftPlacement>;
  heroId: HeroDefinitionId;
  hovered: boolean;
  out: boolean;
  onEnter: (heroId: HeroDefinitionId) => void;
  onLeave: (heroId: HeroDefinitionId) => void;
  children: ReactNode;
}) {
  const ref = useAnchor(anchors, heroId, placeDraftSlot);

  return (
    <div
      ref={ref}
      className={classNames("draft-anchor", hovered && "is-hovered")}
      inert={out}
      onPointerEnter={() => onEnter(heroId)}
      onPointerLeave={() => onLeave(heroId)}
      onFocus={() => onEnter(heroId)}
      onBlur={() => onLeave(heroId)}
    >
      {children}
    </div>
  );
}
