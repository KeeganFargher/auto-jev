import { classNames } from "../../../ui/class-names.js";
import { SeatSilhouette } from "../../../ui/icons/domain-icons.js";
import { HeartIcon } from "../../../ui/icons/icons.js";
import type { SeatRow } from "../model/seat-rows.js";

function SeatCard({
  row,
  onWatch,
}: {
  row: SeatRow;
  onWatch: ((playerId: string) => void) | null;
}) {
  const label = `${row.displayName}, ${row.health} health${row.eliminated ? ", eliminated" : ""}`;

  const className = classNames(
    "seat-card",
    row.isYou && "is-you",
    row.isOpponent && "is-opponent",
    row.isFocused && "is-focused",
    row.eliminated && "is-eliminated",
  );

  const content = (
    <>
      <div className="seat-portrait" style={{ "--seat": row.color }}>
        <SeatSilhouette human={row.human} />
      </div>
      <div className="seat-info">
        <div className="seat-name">{row.displayName}</div>
        <div className="seat-health">
          {row.health}
          <HeartIcon />
        </div>
      </div>
      {row.tag === null ? null : (
        <span className="seat-tag" data-tone={row.tone}>
          {row.tag}
        </span>
      )}
    </>
  );

  if (!row.watchable) {
    return (
      <div className={className} aria-label={label}>
        {content}
      </div>
    );
  }

  if (onWatch === null) {
    throw new Error(`${row.displayName} is watchable but nothing can watch them`);
  }

  return (
    <button
      type="button"
      className={className}
      aria-label={`Watch ${row.displayName}'s battle. ${label}`}
      onClick={() => onWatch(row.playerId)}
    >
      {content}
    </button>
  );
}

export function SeatRail({
  rows,
  onWatch,
}: {
  rows: readonly SeatRow[];
  onWatch: ((playerId: string) => void) | null;
}) {
  return (
    <div className="seat-rail" aria-label="Players">
      {rows.map((row) => (
        <SeatCard key={row.playerId} row={row} onWatch={onWatch} />
      ))}
    </div>
  );
}
