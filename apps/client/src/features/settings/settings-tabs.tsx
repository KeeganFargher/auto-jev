import type { ReactNode } from "react";
import { DisplayIcon, SpeakerIcon } from "../../ui/icons/icons.js";
import { AudioTab } from "./audio-tab.js";
import { GraphicsTab } from "./graphics-tab.js";

export interface SettingsTab {
  id: string;
  label: string;
  icon: ReactNode;
  content: ReactNode;
}

export const SETTINGS_TABS: readonly SettingsTab[] = [
  { id: "audio", label: "Audio", icon: <SpeakerIcon muted={false} />, content: <AudioTab /> },
  { id: "graphics", label: "Graphics", icon: <DisplayIcon />, content: <GraphicsTab /> },
];
