import type { HeroDefinitionId } from "@jev-game/game";
import type { ReactNode } from "react";
import { heroDefinition } from "../../../game/catalogues.js";
import { classNames } from "../../../ui/class-names.js";
import { heroSub } from "../../../ui/hero/hero-facts.js";
import { HeroCard, WantChips } from "../../../ui/hero/hero-card.js";
import { CheckIcon } from "../../../ui/icons/icons.js";
import { useTip } from "../../../ui/tooltip/use-tip.js";

function draftHint(picked: boolean, full: boolean, locked: boolean): string {
  if (locked) {
    return picked ? "Drafted" : "Draft locked";
  }

  if (picked) {
    return "Drafted · click to send back";
  }

  return full ? "Team full · send a pick back first" : "Click to draft";
}

function DraftRole({ label, children }: { label: string; children: ReactNode }) {
  return (
    <span className="draft-role">
      <span className="draft-role-label">{label}</span>
      <span className="draft-role-value">{children}</span>
    </span>
  );
}

export function DraftSlot({
  heroId,
  order,
  full,
  locked,
  onPick,
}: {
  heroId: HeroDefinitionId;
  order: number | null;
  full: boolean;
  locked: boolean;
  onPick: (heroId: HeroDefinitionId) => void;
}) {
  const hero = heroDefinition(heroId);
  const signature = hero.signature;

  if (signature === null) {
    throw new Error(`Hero "${heroId}" has no signature, so it can't be drafted`);
  }

  const picked = order !== null;

  const tip = useTip({
    side: "right",
    content: <HeroCard heroId={heroId} hint={draftHint(picked, full, locked)} />,
  });

  return (
    <button
      type="button"
      className={classNames(
        "draft-slot",
        picked && "is-picked",
        !picked && (full || locked) && "is-muted",
      )}
      data-role={heroId}
      aria-label={hero.name}
      aria-pressed={picked}
      onClick={() => onPick(heroId)}
      {...tip}
    >
      <span className="draft-model" />
      <span className="draft-plate">
        <span className="draft-badge">
          <CheckIcon />
          <span className="draft-order">{order === null ? "" : order + 1}</span>
        </span>
        <span className="draft-name">{hero.name}</span>
        <span className="draft-sub">{heroSub(hero)}</span>
        <span className="draft-roles">
          <DraftRole label="Signature">{signature.name}</DraftRole>
          <DraftRole label="Wants">
            <WantChips signature={signature} />
          </DraftRole>
        </span>
      </span>
    </button>
  );
}
