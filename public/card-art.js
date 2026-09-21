/**
 * The look of the choice cards: a low-polygon backdrop behind an icon, tinted by what the option
 * would do. Drawn rather than painted so a new province or unit never needs a new asset, and seeded
 * from the option's id so the same choice keeps the same skyline every time it comes up.
 */

const seedOf = (text) => {
  let hash = 2166136261;
  for (let index = 0; index < text.length; index++) { hash ^= text.charCodeAt(index); hash = Math.imul(hash, 16777619); }
  return (hash >>> 0) || 1;
};

/**
 * A skyline: three bands of land, back to front, light to dark, with a small silhouette on the
 * middle one saying what kind of choice this is. Shapes only — every colour comes from CSS, so one
 * drawing serves any faction and any tint.
 */
export function lowPolyArt(seed, motif = "none", width = 120, height = 60) {
  let state = seedOf(String(seed));
  const random = () => { state = (Math.imul(state, 1664525) + 1013904223) >>> 0; return state / 4294967296; };
  const ridge = (base, amplitude, points) => {
    const peaks = [];
    for (let index = 0; index < points; index++) peaks.push(`${(index * width / (points - 1)).toFixed(1)},${(base - random() * amplitude).toFixed(1)}`);
    return `<polygon points="0,${height} ${peaks.join(" ")} ${width},${height}"/>`;
  };
  const far = ridge(height * 0.56, height * 0.34, 7);
  const mid = ridge(height * 0.78, height * 0.28, 5);
  const near = ridge(height * 1, height * 0.24, 4);
  // Motifs stand on the middle band, away from the icon in the centre.
  const at = 16 + random() * 14, line = height * 0.62;
  const MOTIF = {
    banners: `<path d="M${at} ${line} h1.6 v-16 h-1.6 Z M${at + 1.6} ${line - 16} l7 2.6 -7 2.6 Z M${at + 11} ${line} h1.4 v-12 h-1.4 Z M${at + 12.4} ${line - 12} l5.5 2.1 -5.5 2.1 Z" />`,
    tower: `<path d="M${at} ${line} v-13 h3 v-3 h3 v3 h3 v-3 h3 v3 h3 v13 Z" />`,
    tents: `<path d="M${at} ${line} l6-10 6 10 Z M${at + 13} ${line} l5-8 5 8 Z" />`,
    none: "",
  };
  return `<svg class="card-facets" viewBox="0 0 ${width} ${height}" preserveAspectRatio="none" aria-hidden="true">
    <g class="far">${far}</g>
    <g class="mid">${mid}</g>
    <g class="motif">${MOTIF[motif] ?? MOTIF.none}</g>
    <g class="near">${near}</g>
  </svg>`;
}

/** What the silhouette on a card shows; a march reads as banners, a muster as tents. */
export const FAMILY_MOTIF = {
  attack: "banners", raid: "tents", move: "banners", hold: "tower", recruit: "tents", save: "tents",
  fight: "banners", auto: "banners", withdraw: "tower", raise: "banners", skill: "tower",
  truce: "banners", war: "banners", doctrine: "tower", build: "tower",
};

/** Which of a handful of shapes an option belongs to; everything visual hangs off this one word. */
const FAMILY_BY_ID = {
  save: "save", wait: "save", fight: "fight", auto: "auto", withdraw: "withdraw", raise: "raise",
  offer: "truce", accept: "truce", refuse: "war", reject: "war",
};
export const familyOf = (id) =>
  FAMILY_BY_ID[id] ?? (
    id.startsWith("attack") ? "attack"
      : id.startsWith("raid") ? "raid"
        : id.startsWith("move") ? "move"
          : id.startsWith("hold") ? "hold"
            : id.startsWith("recruit") ? "recruit"
              : id.startsWith("doctrine") ? "doctrine"
                : id.startsWith("build") ? "build" : "skill");

export const FAMILY_ICON = {
  attack: "flag", raid: "fire", move: "move", hold: "shield", recruit: "people", save: "supplies",
  fight: "battle", auto: "fire", withdraw: "truce", raise: "helm", skill: "star",
  truce: "truce", war: "battle", doctrine: "scroll", build: "settlement",
};
export const FAMILY_TONE = {
  attack: "#e2925e", raid: "#d9a05b", move: "#8fc0d8", hold: "#84b8a6", recruit: "#a7c77e", save: "#e5cf93",
  fight: "#e0705a", auto: "#e2925e", withdraw: "#93a4b4", raise: "#e5cf93", skill: "#b9a0ff",
  truce: "#9fd3c0", war: "#e0705a", doctrine: "#b9a0ff", build: "#c9b07a",
};

/** Names and blurbs come from the campaign, so nothing goes into markup unescaped. */
export const esc = (value) => String(value ?? "").replace(/[&<>"]/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[character]);

/**
 * Painted unit portraits, the poster that says what a regiment is. They are the subject of the card
 * rather than decoration behind it, so a card with one shows the portrait and a card without keeps
 * its drawn skyline; nothing in between needs a second layout.
 */
let portraits = new Map();
export function useUnitPortraits(files) { portraits = index(files); }
export const portraitOf = (unitId) => { const file = portraits.get(unitId); return file === undefined ? null : `/portraits/${file}`; };

/** Subject name to the file that paints it; the server sends whole file names, extension and all. */
const index = (files) => new Map((files ?? []).map((file) => [file.replace(/\.[^.]+$/, ""), file]));

/** Painted country, one per biome: what a choice about a place looks like. */
let vignettes = new Map();
export function useVignettes(files) { vignettes = index(files); }
export const vignetteOf = (biome) => { const file = vignettes.get(biome); return file === undefined ? null : `/vignettes/${file}`; };

/** The Jevs themselves, and the arms their factions fight under. */
let jevs = new Map();
let crests = new Map();
export function useJevPortraits(files) { jevs = index(files); }
export function useCrests(files) { crests = index(files); }
export const jevPortraitOf = (heroId) => { const file = jevs.get(heroId); return file === undefined ? null : `/jevs/${file}`; };
export const crestOf = (factionId) => { const file = crests.get(factionId); return file === undefined ? null : `/faction/${file}`; };

/**
 * Doctrines and buildings: things a faction adopts or raises. The server sends each one as
 * `folder/file`, so the art can be grouped by what it depicts without the cards knowing where it
 * lives.
 */
let scenes = new Map();
export function useScenes(paths) {
  scenes = new Map((paths ?? []).map((path) => [path.split("/").pop().replace(/\.[^.]+$/, ""), path]));
}
export const sceneOf = (name) => { const path = scenes.get(name); return path === undefined ? null : `/${path}`; };

/**
 * The picture a choice card should carry. The server names the subject — a unit for a regiment, a
 * biome for a place — and whichever folder holds it decides how the card is laid out: a portrait
 * fills a tall frame, a vignette sits as country behind the icon. No artwork means the drawn
 * skyline, so a card is never waiting on a file.
 */
export function optionArtwork(option) {
  const named = option.art ?? (option.id.startsWith("recruit_") ? option.id.slice("recruit_".length) : null);
  // Candidates run most specific first, so a doctrine falls back to its category and a card is
  // never blank while only half the set is painted.
  for (const name of (named ?? "").split(" ").filter(Boolean)) {
    const portrait = portraitOf(name) ?? jevPortraitOf(name);
    if (portrait !== null) return { kind: "portrait", url: portrait };
    const crest = crestOf(name);
    if (crest !== null) return { kind: "crest", url: crest };
    const scene = vignetteOf(name) ?? sceneOf(name);
    if (scene !== null) return { kind: "vignette", url: scene };
  }
  return null;
}
