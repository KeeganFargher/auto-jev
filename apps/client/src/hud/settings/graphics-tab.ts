import {
  RENDER_RESOLUTIONS,
  SHADOW_QUALITIES,
  type GraphicsSettings,
  type GraphicsSettingsStore,
  type RenderResolution,
  type ShadowQuality,
} from "../../graphics/settings.js";
import { button, el } from "../dom.js";
import { displayIcon, gaugeIcon, glowIcon, shadowIcon } from "../icons.js";
import type { SettingsTab } from "./settings-window.js";

interface Choice<T> {
  value: T;
  label: string;
}

interface ChoiceRow<T> {
  root: HTMLElement;
  render(current: T): void;
}

const RESOLUTION_LABELS: Readonly<Record<RenderResolution, string>> = {
  sharp: "Sharp",
  balanced: "Balanced",
  fast: "Fast",
};

const SHADOW_LABELS: Readonly<Record<ShadowQuality, string>> = {
  soft: "Soft",
  simple: "Simple",
};

const SWITCH_CHOICES: readonly Choice<boolean>[] = [
  { value: true, label: "On" },
  { value: false, label: "Off" },
];

function choiceRow<T>(icon: SVGSVGElement, name: string, choices: readonly Choice<T>[], pick: (value: T) => void): ChoiceRow<T> {
  const buttons = choices.map((choice) => {
    const option = button("settings-choice", () => pick(choice.value), choice.label);
    option.setAttribute("role", "radio");

    return { option, value: choice.value };
  });

  const group = el("div", "settings-choices", ...buttons.map((entry) => entry.option));
  group.setAttribute("role", "radiogroup");
  group.setAttribute("aria-label", name);

  return {
    root: el("div", "settings-row is-choice", el("span", "settings-channel-icon", icon), el("span", "settings-channel-name", name), group),

    render(current) {
      for (const { option, value } of buttons) {
        const checked = value === current;
        option.setAttribute("aria-checked", String(checked));
        option.tabIndex = checked ? 0 : -1;
      }
    },
  };
}

export function createGraphicsTab(store: GraphicsSettingsStore): SettingsTab {
  const resolution = choiceRow(
    displayIcon(),
    "Resolution",
    RENDER_RESOLUTIONS.map((value) => ({ value, label: RESOLUTION_LABELS[value] })),
    (value) => store.setResolution(value),
  );

  const shadows = choiceRow(
    shadowIcon(),
    "Shadows",
    SHADOW_QUALITIES.map((value) => ({ value, label: SHADOW_LABELS[value] })),
    (value) => store.setShadows(value),
  );

  const glow = choiceRow(glowIcon(), "Glow", SWITCH_CHOICES, (value) => store.setGlow(value));
  const monitor = choiceRow(gaugeIcon(), "Frame stats", SWITCH_CHOICES, (value) => store.setMonitor(value));

  const note = el(
    "p",
    "settings-note",
    "On a slower computer, try Balanced or Fast resolution, simple shadows and glow off. Frame stats shows the frame rate and draw calls in the corner.",
  );

  const content = el("div", "settings-graphics", resolution.root, shadows.root, glow.root, monitor.root, note);

  function render(settings: GraphicsSettings): void {
    resolution.render(settings.resolution);
    shadows.render(settings.shadows);
    glow.render(settings.glow);
    monitor.render(settings.monitor);
  }

  render(store.get());
  store.subscribe(render);

  return { id: "graphics", label: "Graphics", icon: displayIcon, content };
}
