import type { BoardStage } from "../views/board-stage.js";
import { button, el } from "../../hud/dom.js";

export interface StatsPanel {
  readonly root: HTMLElement;
  setVisible(visible: boolean): void;
  note(text: string): void;
  dispose(): void;
}

const SAMPLE_FRAMES = 90;

const REFRESH_MILLISECONDS = 250;

function stat(label: string, value: HTMLElement): HTMLElement {
  return el("span", "env-stat", el("span", "env-stat-label", label), value);
}

function count(value: number): string {
  return value >= 10_000 ? `${Math.round(value / 1000)}k` : String(value);
}

export function createStatsPanel(stage: BoardStage, onLeakTest: () => void): StatsPanel {
  const fps = el("span", "env-stat-value");
  const frameTime = el("span", "env-stat-value");
  const worst = el("span", "env-stat-value");
  const calls = el("span", "env-stat-value");
  const triangles = el("span", "env-stat-value");
  const geometries = el("span", "env-stat-value");
  const textures = el("span", "env-stat-value");
  const shaders = el("span", "env-stat-value");
  const result = el("span", "env-stats-note");

  const root = el(
    "div",
    "env-stats",
    el("div", "env-stats-row", stat("FPS", fps), stat("Frame", frameTime), stat("Worst", worst)),
    el("div", "env-stats-row", stat("Draw calls", calls), stat("Triangles", triangles)),
    el("div", "env-stats-row", stat("Geometries", geometries), stat("Textures", textures), stat("Shaders", shaders)),
    el("div", "env-stats-row", button("pill-button env-toggle", onLeakTest, "Leak test"), result),
  );

  root.hidden = true;

  const intervals: number[] = [];
  let last = performance.now();
  let refreshed = 0;

  function paint(): void {
    const total = intervals.reduce((sum, interval) => sum + interval, 0);
    const average = intervals.length === 0 ? 0 : total / intervals.length;
    const reading = stage.stats();

    fps.textContent = average === 0 ? "–" : String(Math.round(1000 / average));
    frameTime.textContent = `${average.toFixed(1)} ms`;
    worst.textContent = `${Math.round(Math.max(0, ...intervals))} ms`;
    calls.textContent = count(reading.drawCalls);
    triangles.textContent = count(reading.triangles);
    geometries.textContent = String(reading.geometries);
    textures.textContent = String(reading.textures);
    shaders.textContent = String(reading.shaders);
  }

  const stopFrames = stage.onFrame(() => {
    const now = performance.now();
    intervals.push(now - last);
    last = now;

    if (intervals.length > SAMPLE_FRAMES) {
      intervals.shift();
    }

    if (!root.hidden && now - refreshed >= REFRESH_MILLISECONDS) {
      refreshed = now;
      paint();
    }
  });

  return {
    root,

    setVisible(visible) {
      root.hidden = !visible;

      if (visible) {
        paint();
      }
    },

    note(text) {
      result.textContent = text;
    },

    dispose() {
      stopFrames();
    },
  };
}
