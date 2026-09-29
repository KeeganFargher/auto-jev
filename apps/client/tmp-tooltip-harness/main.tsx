import "../src/style.css";
import { StrictMode, useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import { TipCard, TipText } from "../src/ui/tooltip/tip-card.js";
import { TooltipProvider } from "../src/ui/tooltip/tooltip-provider.js";
import { useTip } from "../src/ui/tooltip/use-tip.js";
import type { TipSide } from "../src/ui/tooltip/placement.js";

function Trigger({ name, side, style }: { name: string; side: TipSide; style?: React.CSSProperties }) {
  const tip = useTip({
    side,
    content: (
      <TipCard title={`Tip ${name}`}>
        <TipText text={`Deals 12 damage to burning targets for 3 s`} />
      </TipCard>
    ),
  });
  return (
    <button id={`t-${name}`} type="button" style={{ position: "absolute", width: 90, height: 40, ...style }} {...tip}>
      {name}
    </button>
  );
}

function Live({ style }: { style: React.CSSProperties }) {
  const [count, setCount] = useState(0);
  useEffect(() => {
    const id = window.setInterval(() => setCount((c) => c + 1), 200);
    return () => window.clearInterval(id);
  }, []);
  const tip = useTip({
    side: "right",
    content: (
      <TipCard title={`Live ${count}`}>
        <TipText text={`Tick number ${count}`} />
      </TipCard>
    ),
  });
  return (
    <button id="t-live" type="button" style={{ position: "absolute", width: 90, height: 40, ...style }} {...tip}>
      live {count}
    </button>
  );
}

function Toggleable({ style }: { style: React.CSSProperties }) {
  const [shown, setShown] = useState(true);
  const [hiddenCss, setHiddenCss] = useState(false);
  const tip = useTip({ side: "right", content: <TipCard title="Toggle" /> });
  Object.assign(window, { toggleMount: () => setShown((s) => !s), toggleCss: () => setHiddenCss((s) => !s) });
  return shown ? (
    <button id="t-toggle" type="button" style={{ position: "absolute", width: 90, height: 40, display: hiddenCss ? "none" : "block", ...style }} {...tip}>
      toggle
    </button>
  ) : null;
}

function Nullable({ style }: { style: React.CSSProperties }) {
  const [on, setOn] = useState(true);
  const tip = useTip(on ? { side: "right", content: <TipCard title="Nullable" /> } : null);
  Object.assign(window, { toggleSpec: () => setOn((s) => !s) });
  return (
    <button id="t-null" type="button" style={{ position: "absolute", width: 90, height: 40, ...style }} {...tip}>
      nullable
    </button>
  );
}

function Mover({ style }: { style: React.CSSProperties }) {
  const [moved, setMoved] = useState(false);
  const tip = useTip({ side: "right", content: <TipCard title="Mover" /> });
  Object.assign(window, { moveAway: () => setMoved((s) => !s) });
  return (
    <button id="t-mover" type="button" style={{ position: "absolute", width: 90, height: 40, transform: moved ? "translateX(400px)" : "none", ...style }} {...tip}>
      mover
    </button>
  );
}

function Harness() {
  return (
    <TooltipProvider>
      <Trigger name="A" side="right" style={{ left: 200, top: 100 }} />
      <Trigger name="B" side="right" style={{ left: 200, top: 160 }} />
      <Trigger name="C" side="left" style={{ left: 200, top: 220 }} />
      <Trigger name="D" side="top" style={{ left: 200, top: 300 }} />
      <Trigger name="E" side="bottom" style={{ left: 200, top: 360 }} />
      <Trigger name="EdgeLeft" side="left" style={{ left: 4, top: 420 }} />
      <Trigger name="EdgeRight" side="right" style={{ right: 4, top: 420 }} />
      <Live style={{ left: 500, top: 100 }} />
      <Toggleable style={{ left: 500, top: 160 }} />
      <Nullable style={{ left: 500, top: 220 }} />
      <Mover style={{ left: 500, top: 280 }} />
      <div data-tip-edge="" style={{ position: "absolute", left: 700, top: 100, width: 200, height: 200, border: "1px solid #888" }}>
        <Trigger name="Edge" side="left" style={{ left: 60, top: 60 }} />
      </div>
    </TooltipProvider>
  );
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <Harness />
  </StrictMode>,
);
