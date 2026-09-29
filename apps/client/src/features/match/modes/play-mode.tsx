import { useMemo } from "react";
import { ActionButton } from "../hud/action-button.js";
import { Banner } from "../hud/banner.js";
import { BattleHeader } from "../hud/battle-header.js";
import { ConnectionBanner } from "../hud/connection-banner.js";
import { RoundPlate } from "../hud/round-plate.js";
import { SeatRail } from "../hud/seat-rail.js";
import { StagePanel } from "../hud/stage-panel.js";
import { TeamRail } from "../hud/team-rail.js";
import { TeamRoster } from "../hud/team-roster.js";
import { useCountdown } from "../hooks/use-countdown.js";
import { useLive, useMatch, useView } from "../match-context.js";
import { placementHeader } from "../model/battle-header.js";
import {
  describePlay,
  describeRoster,
  type ActionKind,
  type PlayScreen,
} from "../model/play-screen.js";
import { planningRows } from "../model/seat-rows.js";
import { requireDeadline } from "../model/session-snapshot.js";
import type { MatchController } from "../state/match-controller.js";

function runAction(controller: MatchController, kind: ActionKind): void {
  switch (kind) {
    case "confirm":
      controller.submitDraft();
      break;

    case "ready":
      controller.confirmReady();
      break;

    case "menu":
    case "leave":
      controller.leave();
      break;
  }
}

function requireOpponent(play: PlayScreen): string {
  if (play.opponentId === null) {
    throw new Error("The placement board has no opponent");
  }

  return play.opponentId;
}

export function PlayMode() {
  const controller = useMatch();
  const { snapshot, draft } = useLive();
  const view = useView();
  const play = useMemo(() => describePlay(view, draft), [view, draft]);
  const roster = useMemo(() => describeRoster(view, draft), [view, draft]);

  const rows = useMemo(
    () => planningRows(view, snapshot.lobby, play.opponentId),
    [view, snapshot.lobby, play.opponentId],
  );

  const deadline = play.countdownEpoch === null ? null : requireDeadline(snapshot, view);
  const { timer, urgent } = useCountdown(play.countdownEpoch, deadline);
  const action = play.action;

  return (
    <>
      <SeatRail rows={rows} onWatch={null} />
      {roster.visible ? (
        <TeamRail>
          <TeamRoster heroIds={roster.heroIds} slots={roster.slots} />
        </TeamRail>
      ) : null}
      {play.board === "placement" ? null : (
        <StagePanel key={view.phaseEpoch} draft={play.board === "draft"} entering>
          {play.banner === null ? null : <Banner spec={play.banner} />}
          {play.subtitle === null ? null : <div className="stage-subtitle">{play.subtitle}</div>}
        </StagePanel>
      )}
      {play.board === "placement" ? (
        <BattleHeader state={placementHeader(view, requireOpponent(play))} />
      ) : null}
      <RoundPlate
        roundText={play.roundText}
        phaseText={play.phaseText}
        timer={timer}
        urgent={urgent}
      />
      {action === null ? null : (
        <ActionButton
          label={action.label}
          disabled={action.disabled}
          onClick={() => runAction(controller, action.kind)}
        />
      )}
      <ConnectionBanner connection={snapshot.connection} onMenu={controller.leave} />
    </>
  );
}
