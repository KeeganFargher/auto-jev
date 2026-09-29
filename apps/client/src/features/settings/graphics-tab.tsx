import {
  RENDER_RESOLUTIONS,
  SHADOW_QUALITIES,
  type RenderResolution,
  type ShadowQuality,
} from "../../graphics/settings.js";
import { useGraphicsSettings, useGraphicsStore } from "../../hooks/use-graphics-settings.js";
import { CameraIcon, DisplayIcon, GaugeIcon, GlowIcon, ShadowIcon } from "../../ui/icons/icons.js";
import { ChoiceRow, type Choice } from "./choice-row.js";

const RESOLUTION_LABELS: Readonly<Record<RenderResolution, string>> = {
  sharp: "Sharp",
  balanced: "Balanced",
  fast: "Fast",
};

const SHADOW_LABELS: Readonly<Record<ShadowQuality, string>> = {
  soft: "Soft",
  simple: "Simple",
};

const RESOLUTION_CHOICES: readonly Choice<RenderResolution>[] = RENDER_RESOLUTIONS.map((value) => ({
  value,
  label: RESOLUTION_LABELS[value],
}));

const SHADOW_CHOICES: readonly Choice<ShadowQuality>[] = SHADOW_QUALITIES.map((value) => ({
  value,
  label: SHADOW_LABELS[value],
}));

const SWITCH_CHOICES: readonly Choice<boolean>[] = [
  { value: true, label: "On" },
  { value: false, label: "Off" },
];

export function GraphicsTab() {
  const settings = useGraphicsSettings();
  const store = useGraphicsStore();

  return (
    <div className="settings-graphics">
      <ChoiceRow
        icon={<DisplayIcon />}
        name="Resolution"
        choices={RESOLUTION_CHOICES}
        current={settings.resolution}
        onPick={(value) => store.setResolution(value)}
      />
      <ChoiceRow
        icon={<ShadowIcon />}
        name="Shadows"
        choices={SHADOW_CHOICES}
        current={settings.shadows}
        onPick={(value) => store.setShadows(value)}
      />
      <ChoiceRow
        icon={<GlowIcon />}
        name="Glow"
        choices={SWITCH_CHOICES}
        current={settings.glow}
        onPick={(value) => store.setGlow(value)}
      />
      <ChoiceRow
        icon={<CameraIcon />}
        name="Fight camera"
        choices={SWITCH_CHOICES}
        current={settings.fightCamera}
        onPick={(value) => store.setFightCamera(value)}
      />
      <ChoiceRow
        icon={<GaugeIcon />}
        name="Frame stats"
        choices={SWITCH_CHOICES}
        current={settings.monitor}
        onPick={(value) => store.setMonitor(value)}
      />
      <p className="settings-note">
        On a slower computer, try Balanced or Fast resolution, simple shadows and glow off. Frame
        stats shows the frame rate and draw calls in the corner. Fight camera moves in closer once
        the heroes meet.
      </p>
    </div>
  );
}
