import { useStore } from "../../state/use-store.js";
import { UnitInspector } from "../../ui/hero/unit-inspector.js";
import type { LabHud } from "./lab-hud.js";

export function LabStatusLine({ hud }: { hud: LabHud }) {
  const status = useStore(hud.status);

  return <div className="hud-status">{status}</div>;
}

export function LabFeed({ hud }: { hud: LabHud }) {
  const feed = useStore(hud.feed);

  return (
    <div className="hud-feed">
      {feed.map((entry) => (
        <div key={entry.id}>{entry.text}</div>
      ))}
    </div>
  );
}

export function LabInspector({ hud }: { hud: LabHud }) {
  return <UnitInspector readout={useStore(hud.readout)} />;
}
