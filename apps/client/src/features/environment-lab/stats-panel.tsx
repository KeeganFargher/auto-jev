import type { ReadableStore } from "../../state/store.js";
import { useStore } from "../../state/use-store.js";
import { formatStatsReading, type StatsReading } from "./stats-format.js";

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <span className="env-stat">
      <span className="env-stat-label">{label}</span>
      <span className="env-stat-value">{value}</span>
    </span>
  );
}

export function StatsPanel({
  readings,
  note,
  onLeakTest,
}: {
  readings: ReadableStore<StatsReading>;
  note: string;
  onLeakTest: () => void;
}) {
  const display = formatStatsReading(useStore(readings));

  return (
    <div className="env-stats">
      <div className="env-stats-row">
        <Stat label="FPS" value={display.fps} />
        <Stat label="Frame" value={display.frame} />
        <Stat label="Worst" value={display.worst} />
      </div>
      <div className="env-stats-row">
        <Stat label="Draw calls" value={display.drawCalls} />
        <Stat label="Triangles" value={display.triangles} />
      </div>
      <div className="env-stats-row">
        <Stat label="Geometries" value={display.geometries} />
        <Stat label="Textures" value={display.textures} />
        <Stat label="Shaders" value={display.shaders} />
      </div>
      <div className="env-stats-row">
        <button type="button" className="pill-button env-toggle" onClick={onLeakTest}>
          Leak test
        </button>
        <span className="env-stats-note">{note}</span>
      </div>
    </div>
  );
}
