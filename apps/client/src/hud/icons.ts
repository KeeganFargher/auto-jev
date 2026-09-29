import {
  berserker,
  bubbleCleric,
  firebrand,
  harpooner,
  paladin,
  trainingDummy,
} from "@jev-game/content";
import type { HeroDefinitionId, SetupWant } from "@jev-game/game";
import type { UnitStatusKind } from "./unit-status.js";

const SVG_NS = "http://www.w3.org/2000/svg";

function svg(viewBox: string, ...glyphParts: SVGElement[]): SVGSVGElement {
  const root = document.createElementNS(SVG_NS, "svg");
  root.setAttribute("viewBox", viewBox);
  root.setAttribute("fill", "currentColor");
  root.setAttribute("aria-hidden", "true");
  root.append(...glyphParts);

  return root;
}

function path(d: string, fillRule?: "evenodd"): SVGPathElement {
  const node = document.createElementNS(SVG_NS, "path");
  node.setAttribute("d", d);

  if (fillRule !== undefined) {
    node.setAttribute("fill-rule", fillRule);
  }

  return node;
}

function circle(cx: number, cy: number, r: number): SVGCircleElement {
  const node = document.createElementNS(SVG_NS, "circle");
  node.setAttribute("cx", String(cx));
  node.setAttribute("cy", String(cy));
  node.setAttribute("r", String(r));

  return node;
}

function glyph(d: string): SVGSVGElement {
  return svg("0 0 24 24", path(d, "evenodd"));
}

const SHOULDERS = "M2.5 24C2.5 17.6 6.6 14.6 12 14.6S21.5 17.6 21.5 24Z";

const HAMMER = "M3 4.5h11v6H3ZM14 6h5.5l1.5 1.5-1.5 1.5H14ZM6.5 10.5h4V22h-4Z";

const CROSSED_AXES =
  "M16.1 4.8 17.7 6 7 19.7 5.4 18.5ZM18.6 18.5 17 19.7 6.3 6 7.9 4.8ZM17.6 5.1 22.3 5.9 22.5 7.5 22.3 9 21.5 10.4 20.4 11.5 18.9 12.1 17.4 12.2 15.4 7.9ZM8.6 7.9 6.6 12.2 5.1 12.1 3.6 11.5 2.5 10.4 1.7 9 1.5 7.5 1.7 5.9 6.4 5.1ZM15.2 7 13.7 4.3 16.7 5.1ZM7.3 5.1 10.3 4.3 8.8 7Z";

const FLAME =
  "M12 22c-4.1 0-7-2.8-7-6.6 0-3.1 1.8-5.2 3.4-7 .9 1.6 2 2.4 2 2.4S10 6.5 13.6 2c.8 3 2.6 4.7 4 6.7 1 1.5 1.4 3 1.4 4.7C19 19.2 16.1 22 12 22Z";

const BUBBLE =
  "M12 2a10 10 0 1 1 0 20 10 10 0 0 1 0-20Zm0 2.2a7.8 7.8 0 1 0 0 15.6 7.8 7.8 0 0 0 0-15.6ZM7.2 10.2A5.2 5.2 0 0 1 10.6 6.6l.5 1.7a3.5 3.5 0 0 0-2.2 2.4Z";

const HARPOON =
  "M21.8 2.2 20.2 9.7 18.1 7.6 6.2 19.5 4.5 17.8 16.4 5.9 14.3 3.8ZM12.6 8.2 14.3 9.9 10.4 11.4ZM15.8 11.4 14.1 9.7 12.6 13.6ZM4.9 21.9A2.2 2.2 0 1 1 2.1 19.1 2.2 2.2 0 0 1 4.9 21.9Z";

const TARGET =
  "M12 2a10 10 0 1 1 0 20 10 10 0 0 1 0-20Zm0 2.8a7.2 7.2 0 1 0 0 14.4 7.2 7.2 0 0 0 0-14.4ZM12 8a4 4 0 1 1 0 8 4 4 0 0 1 0-8Zm0 2.4a1.6 1.6 0 1 0 0 3.2 1.6 1.6 0 0 0 0-3.2Z";

const STARS =
  "M5 9 6 6.5 7 9 9.5 9.2 7.6 10.8 8.2 13.3 6 12 3.8 13.3 4.4 10.8 2.5 9.2ZM12 5 13 2.5 14 5 16.5 5.2 14.6 6.8 15.2 9.3 13 8 10.8 9.3 11.4 6.8 9.5 5.2ZM19 9 20 6.5 21 9 23.5 9.2 21.6 10.8 22.2 13.3 20 12 17.8 13.3 18.4 10.8 16.5 9.2Z";

const BOMB =
  "M10.5 7.5a7 7 0 1 1 0 14 7 7 0 0 1 0-14ZM7.4 11.8a3.4 3.4 0 0 1 2.4-1.9l.3 1.5a1.9 1.9 0 0 0-1.3 1Z M14.6 6.6l1.7-1.7 2 2-1.7 1.7ZM19.6 1.2l.9 2 2 .9-2 .9-.9 2-.9-2-2-.9 2-.9Z";

const DOWN_ARROW = "M12 22 4 13h5V2h6v11h5Z";

const UP_ARROW = "M12 2 20 11h-5v11H9V11H4Z";

const SURGE = "M2.5 16.5 7 7l3.5 7L14 5l3.5 8 4-6 1 1.4-5.2 7.8L14 10l-3.4 8.2L7 11l-2.9 6.4Z";

const MENDING_BUBBLE =
  "M12 2a10 10 0 1 1 0 20 10 10 0 0 1 0-20Zm0 2.2a7.8 7.8 0 1 0 0 15.6 7.8 7.8 0 0 0 0-15.6ZM10.6 7.5h2.8v3.1h3.1v2.8h-3.1v3.1h-2.8v-3.1H7.5v-2.8h3.1Z";

const PLUS = "M10.5 3.5h3v7h7v3h-7v7h-3v-7h-7v-3h7Z";

const HUDDLE =
  "M12 2.8a3.2 3.2 0 1 1 0 6.4 3.2 3.2 0 0 1 0-6.4ZM6 12.8a3.2 3.2 0 1 1 0 6.4 3.2 3.2 0 0 1 0-6.4ZM18 12.8a3.2 3.2 0 1 1 0 6.4 3.2 3.2 0 0 1 0-6.4Z";

const SWORD =
  "M21 3 20.4 6.6 10.6 16.4 7.6 13.4 17.4 3.6ZM5.2 13.9 6.6 12.5 11.5 17.4 10.1 18.8ZM7.3 17.3 8.7 18.7 5.4 22 4 20.6Z";

const HEART =
  "M12 21.2 4.1 13.6C1.6 11.2 1.8 7.2 4.5 5.2c2.4-1.8 5.6-1.2 7.5 1.1 1.9-2.3 5.1-2.9 7.5-1.1 2.7 2 2.9 6 .4 8.4Z";

const BROKEN_HEART = `${HEART}M12 6.3 9.8 11 12.6 13 10.2 18.2 11.8 18.8 14.6 12.5 11.8 10.5 13.6 7.2Z`;

const SUN =
  "M12 7.5a4.5 4.5 0 1 1 0 9a4.5 4.5 0 1 1 0-9ZM12 0.6 13.8 5.3 10.2 5.3ZM20.1 3.9 18 8.5 15.5 6ZM23.4 12 18.7 13.8 18.7 10.2ZM20.1 20.1 15.5 18 18 15.5ZM12 23.4 10.2 18.7 13.8 18.7ZM3.9 20.1 6 15.5 8.5 18ZM0.6 12 5.3 10.2 5.3 13.8ZM3.9 3.9 8.5 6 6 8.5Z";

const SPEAKER = "M3 9h4l5.5-4.5v15L7 15H3Z";

const HERO_GLYPHS: ReadonlyMap<HeroDefinitionId, string> = new Map([
  [paladin.id, HAMMER],
  [berserker.id, CROSSED_AXES],
  [firebrand.id, FLAME],
  [bubbleCleric.id, BUBBLE],
  [harpooner.id, HARPOON],
  [trainingDummy.id, TARGET],
]);

const STATUS_GLYPHS: Readonly<Record<UnitStatusKind, string>> = {
  primed: BOMB,
  burning: FLAME,
  floating: BUBBLE,
  airborne: UP_ARROW,
  downed: DOWN_ARROW,
  stunned: STARS,
  rampage: SURGE,
  "safety-bubble": MENDING_BUBBLE,
};

const WANT_GLYPHS: Readonly<Record<SetupWant, string>> = {
  airborne: UP_ARROW,
  floating: BUBBLE,
  burning: FLAME,
  grouped: HUDDLE,
};

export type MeterMetric = "dealt" | "taken" | "healing";

const METER_GLYPHS: Readonly<Record<MeterMetric, string>> = {
  dealt: SWORD,
  taken: BROKEN_HEART,
  healing: PLUS,
};

export function heroIcon(heroId: HeroDefinitionId): SVGSVGElement {
  const path = HERO_GLYPHS.get(heroId);

  if (path === undefined) {
    throw new Error(`Hero "${heroId}" has no icon`);
  }

  return glyph(path);
}

export function statusIcon(status: UnitStatusKind): SVGSVGElement {
  return glyph(STATUS_GLYPHS[status]);
}

export function wantIcon(want: SetupWant): SVGSVGElement {
  return glyph(WANT_GLYPHS[want]);
}

export function meterIcon(metric: MeterMetric): SVGSVGElement {
  return glyph(METER_GLYPHS[metric]);
}

export function humanSilhouette(): SVGSVGElement {
  return svg("0 0 24 24", circle(12, 8.4, 4.9), path(SHOULDERS));
}

export function botSilhouette(): SVGSVGElement {
  return svg(
    "0 0 24 24",
    path(
      "M9 4h6a2.6 2.6 0 0 1 2.6 2.6v4.6a2.6 2.6 0 0 1-2.6 2.6H9a2.6 2.6 0 0 1-2.6-2.6V6.6A2.6 2.6 0 0 1 9 4Zm-.4 3.6v2.4h6.8V7.6Z",
      "evenodd",
    ),
    path("M11.3 1.6h1.4V4h-1.4Z"),
    circle(12, 1.4, 1.2),
    path(SHOULDERS),
  );
}

export function heartIcon(): SVGSVGElement {
  return svg(
    "0 0 24 24",
    path(
      "M12 21.4 10.6 20.1C5.4 15.4 2 12.3 2 8.5 2 5.4 4.4 3 7.5 3c1.7 0 3.4.8 4.5 2.1C13.1 3.8 14.8 3 16.5 3 19.6 3 22 5.4 22 8.5c0 3.8-3.4 6.9-8.6 11.6Z",
    ),
  );
}

export function checkIcon(): SVGSVGElement {
  return svg("0 0 24 24", path("M9.2 17.6 3.8 12.2l2.1-2.1 3.3 3.3 8.9-8.9 2.1 2.1Z"));
}

export function skipIcon(): SVGSVGElement {
  return svg(
    "0 0 24 24",
    path("M3 4.5 12 12 3 19.5ZM11.5 4.5 20.5 12l-9 7.5ZM19.5 4.5h2.5v15h-2.5Z"),
  );
}

export function gearIcon(): SVGSVGElement {
  return svg(
    "0 0 24 24",
    path(
      "M10.3 1.5h3.4l.6 2.9c.8.3 1.5.7 2.2 1.2l2.8-.9 1.7 2.9-2.2 2c.1.8.1 1.6 0 2.4l2.2 2-1.7 2.9-2.8-.9c-.7.5-1.4.9-2.2 1.2l-.6 2.9h-3.4l-.6-2.9c-.8-.3-1.5-.7-2.2-1.2l-2.8.9-1.7-2.9 2.2-2a9 9 0 0 1 0-2.4l-2.2-2 1.7-2.9 2.8.9c.7-.5 1.4-.9 2.2-1.2ZM12 8.3a3.7 3.7 0 1 0 0 7.4 3.7 3.7 0 0 0 0-7.4Z",
      "evenodd",
    ),
  );
}

export function speakerIcon(muted: boolean): SVGSVGElement {
  return muted
    ? svg(
        "0 0 24 24",
        path(SPEAKER),
        path(
          "m15.2 8.6 1.4-1.4 2.4 2.4 2.4-2.4 1.4 1.4-2.4 2.4 2.4 2.4-1.4 1.4-2.4-2.4-2.4 2.4-1.4-1.4 2.4-2.4Z",
        ),
      )
    : svg(
        "0 0 24 24",
        path(SPEAKER),
        path(
          "M15 8.2a5 5 0 0 1 0 7.6l-1.3-1.5a3 3 0 0 0 0-4.6ZM17.6 5.2a9 9 0 0 1 0 13.6l-1.3-1.5a7 7 0 0 0 0-10.6Z",
        ),
      );
}

export function musicIcon(): SVGSVGElement {
  return svg(
    "0 0 24 24",
    path("M9 4.5 20 2v13.6a3.4 3.4 0 1 1-2-3.1V6.6l-7 1.6v9.4a3.4 3.4 0 1 1-2-3.1Z"),
  );
}

export function effectsIcon(): SVGSVGElement {
  return svg("0 0 24 24", path(SWORD));
}

export function displayIcon(): SVGSVGElement {
  return svg(
    "0 0 24 24",
    path(
      "M3.5 4h17A1.5 1.5 0 0 1 22 5.5v10a1.5 1.5 0 0 1-1.5 1.5H3.5A1.5 1.5 0 0 1 2 15.5v-10A1.5 1.5 0 0 1 3.5 4Zm.5 2v9h16V6Z",
      "evenodd",
    ),
    path("M9.5 18h5l.8 2H18v1.5H6V20h2.7Z"),
  );
}

export function shadowIcon(): SVGSVGElement {
  return svg(
    "0 0 24 24",
    circle(12, 8.5, 5.5),
    path("M3.5 19.5c0-1.5 3.8-2.7 8.5-2.7s8.5 1.2 8.5 2.7-3.8 2.7-8.5 2.7-8.5-1.2-8.5-2.7Z"),
  );
}

export function glowIcon(): SVGSVGElement {
  return svg("0 0 24 24", path(SUN));
}

export function cameraIcon(): SVGSVGElement {
  return svg(
    "0 0 24 24",
    path(
      "M4 7h3.2l1.6-2.2h6.4L16.8 7H20a1.5 1.5 0 0 1 1.5 1.5v9A1.5 1.5 0 0 1 20 19H4a1.5 1.5 0 0 1-1.5-1.5v-9A1.5 1.5 0 0 1 4 7Zm8 2.4a3.6 3.6 0 1 0 0 7.2 3.6 3.6 0 1 0 0-7.2Z",
      "evenodd",
    ),
    circle(12, 13, 1.8),
  );
}

export function gaugeIcon(): SVGSVGElement {
  return svg(
    "0 0 24 24",
    path(
      "M12 4.5A10 10 0 0 0 3.3 19.4l1.7-1A8 8 0 0 1 4 14.5a8 8 0 0 1 16 0 8 8 0 0 1-1 3.9l1.7 1A10 10 0 0 0 12 4.5Z",
    ),
    path("M16.9 9.2 13.5 14a1.9 1.9 0 1 1-1.4-1.4Z"),
  );
}

export function closeIcon(): SVGSVGElement {
  return svg(
    "0 0 24 24",
    path(
      "M5.6 3.5 12 9.9l6.4-6.4 2.1 2.1-6.4 6.4 6.4 6.4-2.1 2.1-6.4-6.4-6.4 6.4-2.1-2.1 6.4-6.4-6.4-6.4Z",
    ),
  );
}
