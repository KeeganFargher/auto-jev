import { el } from "../../hud/dom.js";
import { createFrameSampler } from "./frame-sampler.js";

export interface MonitorReading {
  drawCalls: number;
  triangles: number;
  particles: number;
  pixelRatio: number;
}

export interface StageMonitor {
  readonly root: HTMLElement;
  record(now: number): void;
  setVisible(visible: boolean): void;
}

const SAMPLE_FRAMES = 90;

const REFRESH_MILLISECONDS = 250;

function count(value: number): string {
  return value >= 10_000 ? `${Math.round(value / 1000)}k` : String(value);
}

function reading(label: string, value: HTMLElement): HTMLElement {
  return el("span", "stage-monitor-reading", value, el("span", "stage-monitor-label", label));
}

export function createStageMonitor(read: () => MonitorReading): StageMonitor {
  const fps = el("span", "stage-monitor-value");
  const frame = el("span", "stage-monitor-value");
  const worst = el("span", "stage-monitor-value");
  const calls = el("span", "stage-monitor-value");
  const triangles = el("span", "stage-monitor-value");
  const particles = el("span", "stage-monitor-value");
  const scale = el("span", "stage-monitor-value");

  const root = el(
    "div",
    "stage-monitor",
    reading("fps", fps),
    reading("ms", frame),
    reading("worst", worst),
    reading("draws", calls),
    reading("tris", triangles),
    reading("particles", particles),
    reading("px", scale),
  );

  root.hidden = true;
  root.setAttribute("aria-hidden", "true");
  const sampler = createFrameSampler(SAMPLE_FRAMES, performance.now());
  let refreshed = 0;

  function paint(): void {
    const average = sampler.averageMs();
    const latest = read();
    fps.textContent = average === 0 ? "–" : String(Math.round(1000 / average));
    frame.textContent = average.toFixed(1);
    worst.textContent = String(Math.round(sampler.worstMs()));
    calls.textContent = count(latest.drawCalls);
    triangles.textContent = count(latest.triangles);
    particles.textContent = count(latest.particles);
    scale.textContent = `${latest.pixelRatio.toFixed(2)}×`;
  }

  return {
    root,

    record(now) {
      sampler.record(now);

      if (!root.hidden && now - refreshed >= REFRESH_MILLISECONDS) {
        refreshed = now;
        paint();
      }
    },

    setVisible(visible) {
      root.hidden = !visible;

      if (visible) {
        paint();
      }
    },
  };
}
