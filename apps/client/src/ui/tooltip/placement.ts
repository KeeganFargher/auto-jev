export type TipSide = "left" | "right" | "top" | "bottom";

export interface Box {
  left: number;
  top: number;
  right: number;
  bottom: number;
  width: number;
  height: number;
}

export interface Size {
  width: number;
  height: number;
}

export interface Placement {
  x: number;
  y: number;
  side: TipSide;
}

interface Spot {
  x: number;
  y: number;
}

export const TIP_GAP = 10;

export const TIP_MARGIN = 8;

const SIDE_ORDER: Readonly<Record<TipSide, readonly TipSide[]>> = {
  left: ["left", "right", "bottom", "top"],
  right: ["right", "left", "bottom", "top"],
  top: ["top", "bottom", "left", "right"],
  bottom: ["bottom", "top", "left", "right"],
};

function spotFor(side: TipSide, anchor: Box, edge: Box, tip: Size): Spot {
  switch (side) {
    case "left":
      return { x: edge.left - TIP_GAP - tip.width, y: anchor.top };

    case "right":
      return { x: edge.right + TIP_GAP, y: anchor.top };

    case "top":
      return {
        x: anchor.left + anchor.width / 2 - tip.width / 2,
        y: anchor.top - TIP_GAP - tip.height,
      };

    case "bottom":
      return { x: anchor.left + anchor.width / 2 - tip.width / 2, y: anchor.bottom + TIP_GAP };
  }
}

function clampInto(value: number, low: number, high: number): number {
  return Math.min(Math.max(value, low), Math.max(low, high));
}

function fits(side: TipSide, spot: Spot, tip: Size, viewport: Size): boolean {
  if (side === "left" || side === "right") {
    return spot.x >= TIP_MARGIN && spot.x + tip.width <= viewport.width - TIP_MARGIN;
  }

  return spot.y >= TIP_MARGIN && spot.y + tip.height <= viewport.height - TIP_MARGIN;
}

export function placeTip(
  preferred: TipSide,
  anchor: Box,
  edge: Box,
  tip: Size,
  viewport: Size,
): Placement {
  let chosen: TipSide = preferred;
  let spot = spotFor(preferred, anchor, edge, tip);

  for (const side of SIDE_ORDER[preferred]) {
    const candidate = spotFor(side, anchor, edge, tip);

    if (fits(side, candidate, tip, viewport)) {
      chosen = side;
      spot = candidate;
      break;
    }
  }

  return {
    x: clampInto(spot.x, TIP_MARGIN, viewport.width - TIP_MARGIN - tip.width),
    y: clampInto(spot.y, TIP_MARGIN, viewport.height - TIP_MARGIN - tip.height),
    side: chosen,
  };
}
