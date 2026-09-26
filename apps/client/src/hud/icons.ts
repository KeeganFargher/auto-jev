
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

const SHOULDERS = "M2.5 24C2.5 17.6 6.6 14.6 12 14.6S21.5 17.6 21.5 24Z";

const SHIELD = "M12 2 20.5 5v6.2c0 5.3-3.6 9.2-8.5 10.8C7.1 20.4 3.5 16.5 3.5 11.2V5Z";

const SNOWFLAKE =
  "M11 2h2v5.3l3.7-2.2 1 1.8-3.7 2.1 3.7 2.1-1 1.8-3.7-2.2V14l3.7 2.2-1 1.8L13 15.8V22h-2v-6.2l-3.7 2.2-1-1.8L10 14V10.7l-3.7 2.2-1-1.8L9 9 5.3 6.9l1-1.8L10 7.3V7.3Z";

const DAGGER = "M12 1.5 14.4 14h-4.8ZM7 14.5h10v2H7ZM11 16.5h2v6h-2Z";

const FLAME =
  "M12 22c-4.1 0-7-2.8-7-6.6 0-3.1 1.8-5.2 3.4-7 .9 1.6 2 2.4 2 2.4S10 6.5 13.6 2c.8 3 2.6 4.7 4 6.7 1 1.5 1.4 3 1.4 4.7C19 19.2 16.1 22 12 22Z";

const SUN =
  "M12 7.5a4.5 4.5 0 1 1 0 9a4.5 4.5 0 1 1 0-9ZM12 0.6 13.8 5.3 10.2 5.3ZM20.1 3.9 18 8.5 15.5 6ZM23.4 12 18.7 13.8 18.7 10.2ZM20.1 20.1 15.5 18 18 15.5ZM12 23.4 10.2 18.7 13.8 18.7ZM3.9 20.1 6 15.5 8.5 18ZM0.6 12 5.3 10.2 5.3 13.8ZM3.9 3.9 8.5 6 6 8.5Z";

const CROSSED_AXES =
  "M16.1 4.8 17.7 6 7 19.7 5.4 18.5ZM18.6 18.5 17 19.7 6.3 6 7.9 4.8ZM17.6 5.1 22.3 5.9 22.5 7.5 22.3 9 21.5 10.4 20.4 11.5 18.9 12.1 17.4 12.2 15.4 7.9ZM8.6 7.9 6.6 12.2 5.1 12.1 3.6 11.5 2.5 10.4 1.7 9 1.5 7.5 1.7 5.9 6.4 5.1ZM15.2 7 13.7 4.3 16.7 5.1ZM7.3 5.1 10.3 4.3 8.8 7Z";

const FATE_EYE =
  "M12 1.5 23 21H1ZM6.8 15A5.68 5.68 0 0 0 17.2 15 5.68 5.68 0 0 0 6.8 15ZM12 13.1A1.9 1.9 0 1 1 12 16.9 1.9 1.9 0 1 1 12 13.1Z";

const BLIGHT_LEAF =
  "M4 17.2 3.9 14.4 4.3 12.2 5 10.3 5.9 8.7 7.1 7.3 8.6 6.1 10.2 5.1 12.1 4.4 14.3 4 17.1 4.1 17.2 6.9 16.8 9.1 16.1 11 15.1 12.6 13.9 14.1 12.5 15.3 10.9 16.2 9 16.9 6.8 17.3ZM1.3 18.8 4.3 15.8 5.4 16.9 2.4 19.9ZM6 16.1 14.8 6.4 5.1 15.2ZM18.6 10.5 21.8 16.9 22.2 18 22.1 19.3 21.7 20.4 20.9 21.3 19.8 21.9 18.6 22.1 17.4 21.9 16.3 21.3 15.5 20.4 15.1 19.3 15 18 15.4 16.9Z";

const SKULL =
  "M7 17.6C4.3 16.1 3 13.3 3 10.6 3 5.7 7 2 12 2S21 5.7 21 10.6C21 13.3 19.7 16.1 17 17.6V21A1 1 0 0 1 16 22H8A1 1 0 0 1 7 21ZM8.3 8.8A2.5 2.5 0 1 0 8.3 13.8 2.5 2.5 0 1 0 8.3 8.8ZM15.7 8.8A2.5 2.5 0 1 0 15.7 13.8 2.5 2.5 0 1 0 15.7 8.8ZM12 14.2 10.7 16.6H13.3ZM9.8 18.4V21H11V18.4ZM13 18.4V21H14.2V18.4Z";

const COG =
  "M9.9 4.2 10.2 0.8 13.8 0.8 14.1 4.2 16.1 5 18.6 2.9 21.1 5.4 19 8 19.8 9.9 23.2 10.2 23.2 13.8 19.8 14.1 19 16.1 21.1 18.6 18.6 21.1 16.1 19 14.1 19.8 13.8 23.2 10.2 23.2 9.9 19.8 8 19 5.4 21.1 2.9 18.6 5 16 4.2 14.1 0.8 13.8 0.8 10.2 4.2 9.9 5 8 2.9 5.4 5.4 2.9 7.9 5ZM12 8.6a3.4 3.4 0 1 0 0 6.8a3.4 3.4 0 1 0 0-6.8Z";

const HAMMER = "M3 4.5h11v6H3ZM14 6h5.5l1.5 1.5-1.5 1.5H14ZM6.5 10.5h4V22h-4Z";

const STAR = "M12 1.5 14.6 9.4 22.5 12 14.6 14.6 12 22.5 9.4 14.6 1.5 12 9.4 9.4Z";

const ZIGZAG = "M2.5 16.5 7 7l3.5 7L14 5l3.5 8 4-6 1 1.4-5.2 7.8L14 10l-3.4 8.2L7 11l-2.9 6.4Z";

const SPIRAL =
  "M12 3.5a8.5 8.5 0 1 0 8.5 8.5h-2.4a6.1 6.1 0 1 1-6.1-6.1 4 4 0 0 1 4 4 2.4 2.4 0 0 1-2.4 2.4 1.2 1.2 0 0 1-1.2-1.2h-2.3A3.5 3.5 0 0 0 13.6 14.6 4.7 4.7 0 0 0 18.3 9.9 6.3 6.3 0 0 0 12 3.5Z";

const GEM = "M6.5 3h11L22 9l-10 12.5L2 9Zm1.2 2L5 9h14l-2.7-4Z";

const POUCH = "M8 2.5h8l-1.6 3.6H9.6ZM7.2 7.6h9.6l3.7 6v5.9a2 2 0 0 1-2 2h-13a2 2 0 0 1-2-2v-5.9Zm3.5 5.4v3.4h2.6V13Z";

const LEVEL = "M12 2.5 15 9l7 .6-5.3 4.6 1.6 6.8L12 17.4 5.7 21l1.6-6.8L2 9.6 9 9Z";

const PLUS = "M10.5 3.5h3v7h7v3h-7v7h-3v-7h-7v-3h7Z";

function heroGlyph(heroId: string): string | null {
  switch (heroId) {
    case "bulwark":
      return SHIELD;

    case "frostweaver":
      return SNOWFLAKE;

    case "duskblade":
      return DAGGER;

    case "pyromancer":
      return FLAME;

    case "oathkeeper":
      return SUN;

    case "ravager":
      return CROSSED_AXES;

    case "hexbinder":
      return FATE_EYE;

    case "blightmother":
      return BLIGHT_LEAF;

    case "bonecaller":
      return SKULL;

    case "clockwright":
      return COG;

    default:
      return null;
  }
}

export function roleIcon(heroId: string): SVGSVGElement {
  const glyph = heroGlyph(heroId);

  return glyph === null ? svg("0 0 24 24", circle(12, 12, 9.5)) : svg("0 0 24 24", path(glyph));
}

export function schoolIcon(school: string): SVGSVGElement {
  if (school === "might") {
    return svg("0 0 24 24", path(HAMMER));
  }

  return svg("0 0 24 24", path(school === "arcana" ? STAR : DAGGER));
}

export function conditionIcon(condition: string): SVGSVGElement {
  if (condition === "staggered") {
    return svg("0 0 24 24", path(ZIGZAG));
  }

  return svg("0 0 24 24", path(condition === "brittle" ? SNOWFLAKE : SPIRAL, "evenodd"));
}

const STUNNED_GLYPH = "M5 9 6 6.5 7 9 9.5 9.2 7.6 10.8 8.2 13.3 6 12 3.8 13.3 4.4 10.8 2.5 9.2ZM12 5 13 2.5 14 5 16.5 5.2 14.6 6.8 15.2 9.3 13 8 10.8 9.3 11.4 6.8 9.5 5.2ZM19 9 20 6.5 21 9 23.5 9.2 21.6 10.8 22.2 13.3 20 12 17.8 13.3 18.4 10.8 16.5 9.2Z";

const FROZEN_GLYPH = "M4 7 12 3l8 4v10l-8 4-8-4Zm8 1-5-2.4v8.8L12 17l5-2.6V5.6Z";

const KNOCKED_DOWN_GLYPH = "M12 22 4 13h5V2h6v11h5Z";

const TAUNTED_GLYPH = "M10.5 3h3v11h-3ZM10.5 16.5h3v3h-3ZM3 12a9 9 0 0 1 3-6.7l1.5 1.5A7 7 0 0 0 5 12Zm18 0h-2a7 7 0 0 0-2.5-5.2L18 5.3A9 9 0 0 1 21 12Z";

const INVULNERABLE_GLYPH = "M12 2 20.5 5v6.2c0 5.3-3.6 9.2-8.5 10.8C7.1 20.4 3.5 16.5 3.5 11.2V5Zm0 4.2-3.8 4.2L12 17l3.8-6.6Z";

const UNTARGETABLE_GLYPH = "M3.3 2 22 20.7 20.7 22l-3.5-3.5A10.7 10.7 0 0 1 12 20C6.6 20 2.9 15.8 1.5 12a13.4 13.4 0 0 1 3.9-5.2L2 3.3ZM12 4c5.4 0 9.1 4.2 10.5 8a13 13 0 0 1-2.4 3.9L16 11.8A4 4 0 0 0 12.2 8L9.4 5.2A11 11 0 0 1 12 4Z";

const POISON_GLYPH = "M12 2.5c3.3 4.4 6.5 8.2 6.5 11.9A6.5 6.5 0 0 1 12 21a6.5 6.5 0 0 1-6.5-6.6C5.5 10.7 8.7 6.9 12 2.5Z";

const CHILL_GLYPH = "M3 3h18v3.2H3ZM4.2 6.2h4L6.2 15ZM9.4 6.2h5.2L12 21ZM15.8 6.2h4L17.8 13Z";

const GRAVE_GLYPH = "M6 21V9a6 6 0 0 1 12 0v12ZM11 7.5h2V10h2.2v2H13v5.5h-2V12H8.8v-2H11ZM4 21h16v1.8H4Z";

const PUPPETED_GLYPH =
  "M3 4h18v2.4H3ZM10.8 1.2h2.4V4h-2.4ZM10.8 6.4h2.4v2.2h-2.4ZM4.2 6.4h1.4v9H4.2ZM18.4 6.4h1.4v9h-1.4ZM11.3 8.6h1.4v6.8h-1.4ZM4.9 15.4a1.9 1.9 0 1 1 0 3.8 1.9 1.9 0 0 1 0-3.8ZM12 15.4a1.9 1.9 0 1 1 0 3.8 1.9 1.9 0 0 1 0-3.8ZM19.1 15.4a1.9 1.9 0 1 1 0 3.8 1.9 1.9 0 0 1 0-3.8Z";

const PANDEMIC_GLYPH =
  "M12 7a5 5 0 1 1 0 10 5 5 0 0 1 0-10ZM10.2 9.4a1.3 1.3 0 1 1 0 2.6 1.3 1.3 0 0 1 0-2.6ZM13.9 12.4a1.1 1.1 0 1 1 0 2.2 1.1 1.1 0 0 1 0-2.2ZM16.5 2.2a2 2 0 1 1 0 4 2 2 0 0 1 0-4ZM21 10a2 2 0 1 1 0 4 2 2 0 0 1 0-4ZM16.5 17.8a2 2 0 1 1 0 4 2 2 0 0 1 0-4ZM7.5 17.8a2 2 0 1 1 0 4 2 2 0 0 1 0-4ZM3 10a2 2 0 1 1 0 4 2 2 0 0 1 0-4ZM7.5 2.2a2 2 0 1 1 0 4 2 2 0 0 1 0-4ZM15.3 8.1 16.3 6.4 14.7 5.5 13.7 7.2ZM17 12.9 19 12.9 19 11.1 17 11.1ZM13.7 16.8 14.7 18.5 16.3 17.6 15.3 15.9ZM8.7 15.9 7.7 17.6 9.3 18.5 10.3 16.8ZM7 11.1 5 11.1 5 12.9 7 12.9ZM10.3 7.2 9.3 5.5 7.7 6.4 8.7 8.1Z";

function statusGlyph(status: string): string {
  switch (status) {
    case "frozen":
      return FROZEN_GLYPH;

    case "knocked-down":
      return KNOCKED_DOWN_GLYPH;

    case "taunted":
      return TAUNTED_GLYPH;

    case "invulnerable":
      return INVULNERABLE_GLYPH;

    case "untargetable":
      return UNTARGETABLE_GLYPH;

    case "burn":
      return FLAME;

    case "poison":
      return POISON_GLYPH;

    case "chill":
      return CHILL_GLYPH;

    case "pandemic":
      return PANDEMIC_GLYPH;

    case "puppeted":
      return PUPPETED_GLYPH;

    case "grave-marked":
      return GRAVE_GLYPH;

    case "form:lich":
      return SKULL;

    case "form:mech":
    case "overclock":
      return COG;

    case "hexed":
      return FATE_EYE;

    case "linked":
      return CHAIN_GLYPH;

    case "channeling":
      return CROSSED_AXES;

    default:
      return status.startsWith("form:") ? SUN : STUNNED_GLYPH;
  }
}

export function statusIcon(status: string): SVGSVGElement {
  return svg("0 0 24 24", path(statusGlyph(status), "evenodd"));
}

const SWORD_GLYPH = "M21 3 20.4 6.6 10.6 16.4 7.6 13.4 17.4 3.6ZM5.2 13.9 6.6 12.5 11.5 17.4 10.1 18.8ZM7.3 17.3 8.7 18.7 5.4 22 4 20.6Z";

const HEART_GLYPH = "M12 21.2 4.1 13.6C1.6 11.2 1.8 7.2 4.5 5.2c2.4-1.8 5.6-1.2 7.5 1.1 1.9-2.3 5.1-2.9 7.5-1.1 2.7 2 2.9 6 .4 8.4Z";

const BOOT_GLYPH = "M6 2.5h6.5v9.8l5.8 2.3c1.6.6 2.7 2.2 2.7 3.9V21H3.5v-3.6L6 16ZM1 6.5h3.5V8H1ZM.5 9.8h4v1.5h-4ZM1.5 13.1h3v1.5h-3Z";

const BOLT_GLYPH = "M14 1.5 4.5 13.5h6.2L9 22.5l10.5-12.8h-6.3Z";

const HOURGLASS_GLYPH = "M5.5 2h13v2.2h-1.3v2.4c0 2.3-1.6 4.1-3.4 5.4 1.8 1.3 3.4 3.1 3.4 5.4v2.4h1.3V22h-13v-2.2h1.3v-2.4c0-2.3 1.6-4.1 3.4-5.4C8.4 10.7 6.8 8.9 6.8 6.6V4.2H5.5Z";

const CRACKED_ORB_GLYPH = "M12 2a10 10 0 1 1 0 20 10 10 0 0 1 0-20Zm-1.2 3.3-1.4 5.1 3.3 1.6-2.4 6.7 5-7.6-3.1-1.6 2.6-4.2Z";

const CHAIN_GLYPH = "M6.5 7h2a5 5 0 0 1 0 10h-2a5 5 0 0 1 0-10Zm0 2.6a2.4 2.4 0 0 0 0 4.8h2a2.4 2.4 0 0 0 0-4.8ZM15.5 7h2a5 5 0 0 1 0 10h-2a5 5 0 0 1 0-10Zm0 2.6a2.4 2.4 0 0 0 0 4.8h2a2.4 2.4 0 0 0 0-4.8Z";

const RIPPLE_GLYPH = "M12 9.2a2.8 2.8 0 1 1 0 5.6 2.8 2.8 0 0 1 0-5.6ZM5.2 5.2 7 7a7 7 0 0 0 0 10l-1.8 1.8a9.6 9.6 0 0 1 0-13.6ZM18.8 5.2a9.6 9.6 0 0 1 0 13.6L17 17a7 7 0 0 0 0-10Z";

const WIDEN_GLYPH = "M2.5 2.5h7v2.6H6.9l3.4 3.4-1.8 1.8-3.4-3.4v2.6H2.5ZM21.5 2.5v7h-2.6V6.9l-3.4 3.4-1.8-1.8 3.4-3.4h-2.6V2.5ZM2.5 21.5v-7h2.6v2.6l3.4-3.4 1.8 1.8-3.4 3.4h2.6v2.6ZM21.5 21.5h-7v-2.6h2.6l-3.4-3.4 1.8-1.8 3.4 3.4v-2.6h2.6Z";

const LEECH_GLYPH = "M12 2c3.4 4.5 6.7 8.4 6.7 12.2A6.7 6.7 0 0 1 12 21a6.7 6.7 0 0 1-6.7-6.8C5.3 10.4 8.6 6.5 12 2Zm-1.1 9.3v2.2H8.7v2.2h2.2v2.2h2.2v-2.2h2.2v-2.2h-2.2v-2.2Z";

const TRIPLE_SLASH_GLYPH = "M2.5 13.5 12.5 3.5l2 2-10 10ZM6 19 17.5 7.5l2 2L8 21ZM11.5 21.5l9-9 2 2-9 9Z";

const CROSSHAIR_GLYPH =
  "M12 2a10 10 0 1 1 0 20 10 10 0 0 1 0-20Zm0 2.8a7.2 7.2 0 1 0 0 14.4 7.2 7.2 0 0 0 0-14.4Zm-1.3 1.9h2.6v4h4v2.6h-4v4h-2.6v-4h-4v-2.6h4Z";

const SPIKES_GLYPH = "M12 1.5 14.1 7.1 19.4 4.5 16.8 9.8 22.5 12 16.8 14.2 19.4 19.5 14.1 16.9 12 22.5 9.9 16.9 4.6 19.5 7.2 14.2 1.5 12 7.2 9.8 4.6 4.5 9.9 7.1Z";

function pieceGlyph(pieceId: string): string | null {
  switch (pieceId) {
    case "gem-chain":
      return CHAIN_GLYPH;

    case "gem-multicast":
      return RIPPLE_GLYPH;

    case "gem-multistrike":
      return TRIPLE_SLASH_GLYPH;

    case "gem-widen":
      return WIDEN_GLYPH;

    case "gem-primer-staggered":
      return ZIGZAG;

    case "gem-leech":
      return LEECH_GLYPH;

    case "gem-cast-when-damaged":
      return SPIKES_GLYPH;

    case "gem-overcharge":
      return FLAME;

    case "gem-primer-disoriented":
      return SPIRAL;

    case "gem-cast-on-crit":
      return STAR;

    case "gem-cast-on-kill":
      return CROSSHAIR_GLYPH;

    case "gem-last-word":
      return SKULL;

    case "gem-primer-brittle":
      return SNOWFLAKE;

    case "gem-fork":
      return CROSSED_AXES;

    case "gem-split":
      return PLUS;

    case "gem-empower":
      return HAMMER;

    case "gem-linger":
      return HOURGLASS_GLYPH;

    case "gem-opener":
      return BOLT_GLYPH;

    case "gem-cast-on-detonation":
      return SUN;

    case "gem-resonance":
      return CRACKED_ORB_GLYPH;

    case "gem-haste":
      return BOOT_GLYPH;

    default:
      return null;
  }
}

export function pieceIcon(pieceId: string, kind: "item" | "gem"): SVGSVGElement {
  const glyph = pieceGlyph(pieceId);

  if (glyph === null) {
    return kind === "item" ? itemIcon() : gemIcon();
  }

  return svg("0 0 24 24", path(glyph, "evenodd"));
}

export function itemIcon(): SVGSVGElement {
  return svg("0 0 24 24", path(POUCH, "evenodd"));
}

export function gemIcon(): SVGSVGElement {
  return svg("0 0 24 24", path(GEM, "evenodd"));
}

export function levelIcon(): SVGSVGElement {
  return svg("0 0 24 24", path(LEVEL));
}

export function plusIcon(): SVGSVGElement {
  return svg("0 0 24 24", path(PLUS));
}

export function humanSilhouette(): SVGSVGElement {
  return svg("0 0 24 24", circle(12, 8.4, 4.9), path(SHOULDERS));
}

export function botSilhouette(): SVGSVGElement {
  return svg(
    "0 0 24 24",
    path("M9 4h6a2.6 2.6 0 0 1 2.6 2.6v4.6a2.6 2.6 0 0 1-2.6 2.6H9a2.6 2.6 0 0 1-2.6-2.6V6.6A2.6 2.6 0 0 1 9 4Zm-.4 3.6v2.4h6.8V7.6Z", "evenodd"),
    path("M11.3 1.6h1.4V4h-1.4Z"),
    circle(12, 1.4, 1.2),
    path(SHOULDERS),
  );
}

export function heartIcon(): SVGSVGElement {
  return svg("0 0 24 24", path("M12 21.4 10.6 20.1C5.4 15.4 2 12.3 2 8.5 2 5.4 4.4 3 7.5 3c1.7 0 3.4.8 4.5 2.1C13.1 3.8 14.8 3 16.5 3 19.6 3 22 5.4 22 8.5c0 3.8-3.4 6.9-8.6 11.6Z"));
}

export function checkIcon(): SVGSVGElement {
  return svg("0 0 24 24", path("M9.2 17.6 3.8 12.2l2.1-2.1 3.3 3.3 8.9-8.9 2.1 2.1Z"));
}

export function skipIcon(): SVGSVGElement {
  return svg("0 0 24 24", path("M3 4.5 12 12 3 19.5ZM11.5 4.5 20.5 12l-9 7.5ZM19.5 4.5h2.5v15h-2.5Z"));
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

const SPEAKER = "M3 9h4l5.5-4.5v15L7 15H3Z";

export function speakerIcon(muted: boolean): SVGSVGElement {
  return muted
    ? svg("0 0 24 24", path(SPEAKER), path("m15.2 8.6 1.4-1.4 2.4 2.4 2.4-2.4 1.4 1.4-2.4 2.4 2.4 2.4-1.4 1.4-2.4-2.4-2.4 2.4-1.4-1.4 2.4-2.4Z"))
    : svg("0 0 24 24", path(SPEAKER), path("M15 8.2a5 5 0 0 1 0 7.6l-1.3-1.5a3 3 0 0 0 0-4.6ZM17.6 5.2a9 9 0 0 1 0 13.6l-1.3-1.5a7 7 0 0 0 0-10.6Z"));
}

export function musicIcon(): SVGSVGElement {
  return svg("0 0 24 24", path("M9 4.5 20 2v13.6a3.4 3.4 0 1 1-2-3.1V6.6l-7 1.6v9.4a3.4 3.4 0 1 1-2-3.1Z"));
}

export function effectsIcon(): SVGSVGElement {
  return svg("0 0 24 24", path(SWORD_GLYPH));
}

export function dialogueIcon(): SVGSVGElement {
  return svg("0 0 24 24", path("M4 3.5h16A1.5 1.5 0 0 1 21.5 5v10.5A1.5 1.5 0 0 1 20 17h-9.5L5.5 21v-4H4a1.5 1.5 0 0 1-1.5-1.5V5A1.5 1.5 0 0 1 4 3.5Z"));
}

export function displayIcon(): SVGSVGElement {
  return svg(
    "0 0 24 24",
    path("M3.5 4h17A1.5 1.5 0 0 1 22 5.5v10a1.5 1.5 0 0 1-1.5 1.5H3.5A1.5 1.5 0 0 1 2 15.5v-10A1.5 1.5 0 0 1 3.5 4Zm.5 2v9h16V6Z", "evenodd"),
    path("M9.5 18h5l.8 2H18v1.5H6V20h2.7Z"),
  );
}

export function shadowIcon(): SVGSVGElement {
  return svg("0 0 24 24", circle(12, 8.5, 5.5), path("M3.5 19.5c0-1.5 3.8-2.7 8.5-2.7s8.5 1.2 8.5 2.7-3.8 2.7-8.5 2.7-8.5-1.2-8.5-2.7Z"));
}

export function glowIcon(): SVGSVGElement {
  return svg("0 0 24 24", path(SUN));
}

export function cameraIcon(): SVGSVGElement {
  return svg(
    "0 0 24 24",
    path("M4 7h3.2l1.6-2.2h6.4L16.8 7H20a1.5 1.5 0 0 1 1.5 1.5v9A1.5 1.5 0 0 1 20 19H4a1.5 1.5 0 0 1-1.5-1.5v-9A1.5 1.5 0 0 1 4 7Zm8 2.4a3.6 3.6 0 1 0 0 7.2 3.6 3.6 0 1 0 0-7.2Z", "evenodd"),
    circle(12, 13, 1.8),
  );
}

export function gaugeIcon(): SVGSVGElement {
  return svg(
    "0 0 24 24",
    path("M12 4.5A10 10 0 0 0 3.3 19.4l1.7-1A8 8 0 0 1 4 14.5a8 8 0 0 1 16 0 8 8 0 0 1-1 3.9l1.7 1A10 10 0 0 0 12 4.5Z"),
    path("M16.9 9.2 13.5 14a1.9 1.9 0 1 1-1.4-1.4Z"),
  );
}

export function closeIcon(): SVGSVGElement {
  return svg("0 0 24 24", path("M5.6 3.5 12 9.9l6.4-6.4 2.1 2.1-6.4 6.4 6.4 6.4-2.1 2.1-6.4-6.4-6.4 6.4-2.1-2.1 6.4-6.4-6.4-6.4Z"));
}

const BROKEN_HEART_GLYPH = `${HEART_GLYPH}M12 6.3 9.8 11 12.6 13 10.2 18.2 11.8 18.8 14.6 12.5 11.8 10.5 13.6 7.2Z`;

export function meterIcon(metric: "dealt" | "taken" | "healing" | "shielding"): SVGSVGElement {
  switch (metric) {
    case "dealt":
      return svg("0 0 24 24", path(SWORD_GLYPH));

    case "taken":
      return svg("0 0 24 24", path(BROKEN_HEART_GLYPH, "evenodd"));

    case "healing":
      return svg("0 0 24 24", path(PLUS));

    case "shielding":
      return svg("0 0 24 24", path(SHIELD));

    default: {
      const exhaustive: never = metric;

      return exhaustive;
    }
  }
}
