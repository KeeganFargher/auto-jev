import { ActionButton } from "../hud/action-button.js";
import { Banner } from "../hud/banner.js";
import { ConnectionBanner } from "../hud/connection-banner.js";
import { LobbyPanel } from "../hud/lobby-panel.js";
import { RoundPlate } from "../hud/round-plate.js";
import { SeatRail } from "../hud/seat-rail.js";
import { StagePanel } from "../hud/stage-panel.js";
import { useLive, useMatch } from "../match-context.js";
import type { BannerSpec } from "../model/play-screen.js";
import type { SeatRow } from "../model/seat-rows.js";

const CONNECTING: BannerSpec = { tone: "slate", title: "Connecting", sub: "Finding a lobby" };

const NO_ROWS: readonly SeatRow[] = [];

export function LobbyMode() {
  const controller = useMatch();
  const { lobby, playerId, connection } = useLive().snapshot;
  const isHost = lobby !== null && playerId !== null && playerId === lobby.hostPlayerId;

  return (
    <>
      <SeatRail rows={NO_ROWS} onWatch={null} />
      <StagePanel>
        {lobby === null ? (
          <Banner spec={CONNECTING} />
        ) : (
          <LobbyPanel lobby={lobby} playerId={playerId} onLeave={controller.leave} />
        )}
      </StagePanel>
      <RoundPlate
        roundText="Lobby"
        phaseText={lobby === null ? "Connecting" : "Waiting"}
        timer=""
        urgent={false}
      />
      {lobby === null ? null : (
        <ActionButton
          label={isHost ? "Start" : "Waiting"}
          disabled={!isHost}
          onClick={controller.startMatch}
        />
      )}
      <ConnectionBanner connection={connection} onMenu={controller.leave} />
    </>
  );
}
