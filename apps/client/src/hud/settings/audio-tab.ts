import type { AudioSettings, AudioSettingsStore, VolumeChannel } from "../../audio/settings.js";
import { VOLUME_CHANNELS } from "../../audio/settings.js";
import { button, el } from "../dom.js";
import { dialogueIcon, effectsIcon, musicIcon, speakerIcon } from "../icons.js";
import type { SettingsTab } from "./settings-window.js";

const CHANNEL_LABELS: Readonly<Record<VolumeChannel, string>> = {
  master: "Master",
  music: "Music",
  sfx: "Effects",
  dialogue: "Voices",
};

interface ChannelRow {
  root: HTMLElement;
  slider: HTMLInputElement;
  readout: HTMLElement;
}

function channelIcon(channel: Exclude<VolumeChannel, "master">): SVGSVGElement {
  switch (channel) {
    case "music":
      return musicIcon();

    case "sfx":
      return effectsIcon();

    case "dialogue":
      return dialogueIcon();
  }
}

export function createAudioTab(store: AudioSettingsStore): SettingsTab {
  const muteButton = button("settings-mute", () => store.setMuted(!store.get().muted));
  const rows = new Map<VolumeChannel, ChannelRow>();

  for (const channel of VOLUME_CHANNELS) {
    const slider = el("input", "settings-slider");
    slider.type = "range";
    slider.min = "0";
    slider.max = "100";
    slider.step = "1";
    slider.setAttribute("aria-label", `${CHANNEL_LABELS[channel]} volume`);
    slider.addEventListener("input", () => store.setVolume(channel, Number(slider.value) / 100));

    const readout = el("span", "settings-readout");
    const icon = channel === "master" ? muteButton : el("span", "settings-channel-icon", channelIcon(channel));

    rows.set(channel, {
      root: el("div", "settings-row", icon, el("span", "settings-channel-name", CHANNEL_LABELS[channel]), slider, readout),
      slider,
      readout,
    });
  }

  const content = el("div", "settings-audio", ...[...rows.values()].map((row) => row.root));

  function render(settings: AudioSettings): void {
    muteButton.replaceChildren(speakerIcon(settings.muted));
    muteButton.setAttribute("aria-label", settings.muted ? "Unmute" : "Mute");
    muteButton.setAttribute("aria-pressed", String(settings.muted));
    content.classList.toggle("is-muted", settings.muted);

    for (const [channel, row] of rows) {
      const percent = Math.round(settings.volumes[channel] * 100);

      if (Number(row.slider.value) !== percent) {
        row.slider.value = String(percent);
      }

      row.slider.style.setProperty("--fill", `${percent}%`);
      row.readout.textContent = String(percent);
    }
  }

  render(store.get());
  store.subscribe(render);

  return { id: "audio", label: "Audio", icon: () => speakerIcon(false), content };
}
