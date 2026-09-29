import { useEffect, useState } from "react";
import type { BoardStage, StageReadout } from "../../game/views/board-stage.js";
import { createFrameSampler } from "../../game/views/frame-sampler.js";
import { useGraphicsSettings } from "../../hooks/use-graphics-settings.js";

interface MonitorReading extends StageReadout {
  averageMs: number;
  worstMs: number;
}

const SAMPLE_FRAMES = 90;

const REFRESH_MILLISECONDS = 250;

function count(value: number): string {
  return value >= 10_000 ? `${Math.round(value / 1000)}k` : String(value);
}

function Reading({ label, value }: { label: string; value: string }) {
  return (
    <span className="stage-monitor-reading">
      <span className="stage-monitor-value">{value}</span>
      <span className="stage-monitor-label">{label}</span>
    </span>
  );
}

function MonitorReadout({ stage }: { stage: BoardStage }) {
  const [reading, setReading] = useState<MonitorReading | null>(null);

  useEffect(() => {
    const sampler = createFrameSampler(SAMPLE_FRAMES, performance.now());
    let refreshed = 0;

    return stage.onFrame((_deltaSeconds, now) => {
      sampler.record(now);

      if (now - refreshed < REFRESH_MILLISECONDS) {
        return;
      }

      refreshed = now;
      setReading({
        ...stage.readout(),
        averageMs: sampler.averageMs(),
        worstMs: sampler.worstMs(),
      });
    });
  }, [stage]);

  return (
    <div className="stage-monitor" aria-hidden="true">
      <Reading
        label="fps"
        value={
          reading === null || reading.averageMs === 0
            ? "–"
            : String(Math.round(1000 / reading.averageMs))
        }
      />
      <Reading label="ms" value={reading === null ? "–" : reading.averageMs.toFixed(1)} />
      <Reading label="worst" value={reading === null ? "–" : String(Math.round(reading.worstMs))} />
      <Reading label="draws" value={reading === null ? "–" : count(reading.drawCalls)} />
      <Reading label="tris" value={reading === null ? "–" : count(reading.triangles)} />
      <Reading label="particles" value={reading === null ? "–" : count(reading.particles)} />
      <Reading label="px" value={reading === null ? "–" : `${reading.pixelRatio.toFixed(2)}×`} />
    </div>
  );
}

export function StageMonitor({ stage }: { stage: BoardStage | null }) {
  const { monitor } = useGraphicsSettings();

  if (stage === null || !monitor) {
    return null;
  }

  return <MonitorReadout stage={stage} />;
}
