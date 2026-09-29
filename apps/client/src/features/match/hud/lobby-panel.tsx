import { useRef } from "react";
import { joinHash } from "../../../app/routes.js";
import { classNames } from "../../../ui/class-names.js";
import { SeatSilhouette } from "../../../ui/icons/domain-icons.js";
import type { LobbyInfo, LobbySeatInfo } from "../../../session/match-session.js";
import { SEAT_COUNT, seatColorAt } from "../model/match-model.js";

function seatTags(seat: LobbySeatInfo, playerId: string | null, hostPlayerId: string): string {
  const tags: string[] = [];

  if (seat.playerId === playerId) {
    tags.push("You");
  }

  if (seat.playerId === hostPlayerId) {
    tags.push("Host");
  }

  if (seat.controller === "human" && !seat.connected) {
    tags.push("Away");
  }

  return tags.join(" · ");
}

function LobbySeat({
  seat,
  index,
  playerId,
  hostPlayerId,
}: {
  seat: LobbySeatInfo;
  index: number;
  playerId: string | null;
  hostPlayerId: string;
}) {
  return (
    <div
      className={classNames(
        "lobby-seat",
        seat.playerId === playerId && "is-you",
        seat.controller === "bot" && "is-bot",
      )}
    >
      <div className="seat-portrait" style={{ "--seat": seatColorAt(index) }}>
        <SeatSilhouette human={seat.controller === "human"} />
      </div>
      <div className="lobby-seat-name">{seat.displayName}</div>
      <div className="lobby-seat-tags">{seatTags(seat, playerId, hostPlayerId)}</div>
    </div>
  );
}

export function LobbyPanel({
  lobby,
  playerId,
  onLeave,
}: {
  lobby: LobbyInfo;
  playerId: string | null;
  onLeave: () => void;
}) {
  const field = useRef<HTMLInputElement>(null);
  const humans = lobby.seats.filter((seat) => seat.controller === "human").length;
  const link = `${location.origin}${location.pathname}${joinHash(lobby.roomId)}`;

  function copyLink(): void {
    void navigator.clipboard.writeText(link);
    field.current?.select();
  }

  return (
    <>
      <div className="stage-title">Online lobby</div>
      <div className="stage-subtitle">
        {`${humans} of ${SEAT_COUNT} seats taken by players · the rest play when the host starts`}
      </div>
      <div className="lobby-link">
        <input
          ref={field}
          className="lobby-link-field"
          value={link}
          readOnly
          aria-label="Invite link"
        />
        <button type="button" className="pill-button" onClick={copyLink}>
          Copy
        </button>
      </div>
      <div className="lobby-grid">
        {lobby.seats.map((seat, index) => (
          <LobbySeat
            key={seat.playerId}
            seat={seat}
            index={index}
            playerId={playerId}
            hostPlayerId={lobby.hostPlayerId}
          />
        ))}
      </div>
      <button type="button" className="pill-button lobby-leave" onClick={onLeave}>
        Leave
      </button>
    </>
  );
}
