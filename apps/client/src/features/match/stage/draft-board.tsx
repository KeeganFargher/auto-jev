import { boardArena } from "@jev-game/content";
import type { HeroDefinitionId } from "@jev-game/game";
import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { createDraftView } from "../../../game/views/draft-view.js";
import { useAudio } from "../../../hooks/use-audio.js";
import type { MountedBoard } from "../../../hooks/use-board-stage.js";
import { useStageView } from "../../../hooks/use-stage-view.js";
import { DraftSlot } from "../hud/draft-slot.js";
import { useLive, useMatch } from "../match-context.js";
import { draftLocked } from "../model/match-state.js";
import { describeRoster } from "../model/play-screen.js";
import { requireView } from "../model/session-snapshot.js";
import { DraftAnchor } from "./draft-anchor.js";
import { DRAFT_HUD_INSETS } from "./insets.js";

interface Hover {
  epoch: number;
  heroId: HeroDefinitionId;
}

function orderOf(picked: readonly HeroDefinitionId[], heroId: HeroDefinitionId): number | null {
  const index = picked.indexOf(heroId);

  return index === -1 ? null : index;
}

export function DraftBoard({ board }: { board: MountedBoard }) {
  const controller = useMatch();
  const audio = useAudio();
  const live = useLive();
  const view = requireView(live.snapshot);
  const picked = describeRoster(view, live.draft).heroIds;
  const locked = draftLocked(view, live.draft);
  const full = picked.length >= view.rules.draftPicks;
  const pool = view.draftPool;
  const [hover, setHover] = useState<Hover | null>(null);

  const hovered =
    !locked && hover !== null && hover.epoch === view.phaseEpoch ? hover.heroId : null;

  const draftView = useStageView(
    board.stage,
    (mounted) =>
      createDraftView(mounted, {
        grid: boardArena,
        insets: DRAFT_HUD_INSETS,
        heroIds: pool,
        onRise: () => audio.play("draft-rise"),
      }),
    [audio, view.phaseEpoch, pool.join(",")],
  );

  useEffect(() => {
    draftView?.setState({ picked, full, locked, hovered });
  }, [draftView, picked, full, locked, hovered]);

  if (draftView === null) {
    return null;
  }

  function enter(heroId: HeroDefinitionId): void {
    setHover({ epoch: view.phaseEpoch, heroId });
  }

  function leave(heroId: HeroDefinitionId): void {
    setHover((current) => (current !== null && current.heroId === heroId ? null : current));
  }

  return createPortal(
    pool.map((heroId) => {
      const order = orderOf(picked, heroId);

      return (
        <DraftAnchor
          key={heroId}
          anchors={draftView.anchors}
          heroId={heroId}
          hovered={hovered === heroId}
          out={locked && order === null}
          onEnter={enter}
          onLeave={leave}
        >
          <DraftSlot
            heroId={heroId}
            order={order}
            full={full}
            locked={locked}
            onPick={controller.toggleDraftPick}
          />
        </DraftAnchor>
      );
    }),
    board.layer,
  );
}
