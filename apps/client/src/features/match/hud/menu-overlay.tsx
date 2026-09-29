import { ENVIRONMENT_HASH, LAB_HASH } from "../../../app/routes.js";
import { useMatch, useMatchState } from "../match-context.js";
import { SEAT_COUNT } from "../model/match-model.js";
import type { MatchState } from "../model/match-state.js";

function isConnecting(state: MatchState): boolean {
  return state.connecting;
}

function noticeOf(state: MatchState): string | null {
  return state.notice;
}

export function MenuOverlay() {
  const controller = useMatch();
  const connecting = useMatchState(isConnecting);
  const notice = useMatchState(noticeOf);

  return (
    <div className="menu-screen">
      <div className="brush-banner menu-brand">
        <div className="menu-brand-title">Jev Game</div>
        <div className="menu-brand-sub">{`Local match · you + ${SEAT_COUNT - 1} bots`}</div>
      </div>
      <nav className="menu-nav">
        <button
          type="button"
          className="menu-link"
          disabled={connecting}
          onClick={controller.startQuick}
        >
          {connecting ? "Connecting…" : "Play online"}
        </button>
        <a className="menu-link" href={LAB_HASH}>
          Battle lab
        </a>
        <a className="menu-link" href={ENVIRONMENT_HASH}>
          Board themes
        </a>
        {notice === null ? null : <div className="menu-notice">{notice}</div>}
      </nav>
      <button
        type="button"
        className="menu-fight-button"
        disabled={connecting}
        onClick={controller.startSolo}
      >
        <span className="brush-banner menu-fight">Fight!</span>
      </button>
    </div>
  );
}
