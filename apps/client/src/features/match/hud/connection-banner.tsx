import type { ConnectionState } from "../../../session/match-session.js";

export function ConnectionBanner({
  connection,
  onMenu,
}: {
  connection: ConnectionState;
  onMenu: () => void;
}) {
  if (connection === "connected") {
    return null;
  }

  const lost = connection === "lost";

  return (
    <div className="connection-banner">
      <span className="connection-banner-text">
        {lost ? "Connection to the match was lost" : "Reconnecting…"}
      </span>
      {lost ? (
        <button type="button" className="pill-button" onClick={onMenu}>
          Menu
        </button>
      ) : null}
    </div>
  );
}
