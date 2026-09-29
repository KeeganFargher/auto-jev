import type { ViewportInsets } from "../../game/views/board-stage.js";

export type Framing = "game" | "wide";

export const FRAMINGS: readonly Framing[] = ["game", "wide"];

export const FRAMING_LABELS: Record<Framing, string> = {
  game: "Game view",
  wide: "Wide",
};

export const FRAMING_INSETS: Record<Framing, ViewportInsets> = {
  game: { left: 208, right: 244, top: 76, bottom: 24 },
  wide: { left: 320, right: 320, top: 200, bottom: 170 },
};
