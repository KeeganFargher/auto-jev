/**
 * Every HUD glyph comes from here. A name resolves to a painted sprite when `public/icons/<name>.png`
 * exists, and to the line drawing below when it does not, so the set can be replaced one file at a
 * time without a single call site changing. Sprites are full colour and ignore `currentColor`; the
 * line drawings take the colour of whatever contains them.
 */
const paths = {
  // --- resources and stores
  supplies: '<path d="M6 9h12l1 11H5Zm3 0V6a3 3 0 0 1 6 0v3"/><circle cx="12" cy="14" r="2"/>',
  food: '<path d="M12 20V5m0 8C4 13 4 7 4 7s8 0 8 6Zm0 4c8 0 8-6 8-6s-8 0-8 6Zm0-8c6 0 6-5 6-5s-6 0-6 5Z"/>',
  iron: '<path d="m4 16 4-9 7-3 5 8-5 8H8Zm4-9 4 5 8 0m-8 0 3 8M9 5l2-3"/>',
  wood: '<path d="m5 8 10-4 5 4v9l-10 4-5-4Zm0 0 5 4 10-4M10 12v9M15 4v9"/>',
  essence: '<path d="M13 2 4 14h6l-1 8 9-12h-6Z"/>',
  // --- people and command
  people: '<circle cx="9" cy="7" r="3"/><path d="M3 21v-4a6 6 0 0 1 12 0v4M16 4a3 3 0 0 1 0 6m2 3a5 5 0 0 1 3 4v4"/>',
  helm: '<path d="M6 11a6 6 0 0 1 12 0v5.5a3.5 3.5 0 0 1-3.5 3.5h-5A3.5 3.5 0 0 1 6 16.5Z"/><path d="M6.2 12.8h11.6M9.5 15.6h5"/>',
  crown: '<path d="m4 8 3 4 5-7 5 7 3-4v11H4Z"/><path d="M4 19h16"/>',
  faction: '<path d="M12 3 5 5.4v6.2c0 4.4 3 7.5 7 8.4 4-.9 7-4 7-8.4V5.4Z"/><path d="M5 11h14M12 11v8.8"/>',
  morale: '<path d="M12 20S4 15 4 9.5A4 4 0 0 1 12 7a4 4 0 0 1 8 2.5C20 15 12 20 12 20Z"/>',
  // --- weapons and units
  weapons: '<path d="M12 21V8m0 0 4-5H8l4 5Z"/><path d="M8 11h8"/>',
  battle: '<path d="m4 20 13-13m-7 10-3-3M16 3l5-1-1 5-6 5-2-2Z"/><path d="m20 20-6-6"/>',
  spear: '<path d="M12 22V7m0 0 3-5-3 1-3-1 3 5Z"/><path d="M9 10h6"/>',
  bow: '<path d="M6 3a13 13 0 0 1 0 18M6 3l14 9L6 21"/><path d="M4 12h16m-4-3 4 3-4 3"/>',
  mace: '<path d="m5 20 6-6"/><circle cx="15" cy="9" r="5"/><path d="M15 2v2m0 10v2m-7-7h2m10 0h2m-9.5-4.5 1.5 1.5m6 6 1.5 1.5m0-9L18 6m-6 6-1.5 1.5"/>',
  shield: '<path d="M12 3 4 6v6c0 5 3.5 8 8 9 4.5-1 8-4 8-9V6Z"/>',
  horse: '<path d="M4 20c0-6 3-9 7-9V7l4-4 2 3 4 1-3 3v4c0 5-3 6-3 6"/><path d="M11 11 7 8"/>',
  catapult: '<path d="M3 18h16M5 18 9 6m10 3-8 4"/><circle cx="20" cy="8" r="2"/><circle cx="7" cy="18" r="2"/><circle cx="17" cy="18" r="2"/>',
  skull: '<path d="M12 3a7 7 0 0 0-7 7c0 3 2 4 3 5v3h8v-3c1-1 3-2 3-5a7 7 0 0 0-7-7Z"/><circle cx="9.5" cy="10" r="1.2"/><circle cx="14.5" cy="10" r="1.2"/><path d="M10 21v-3m4 3v-3"/>',
  beast: '<path d="m4 8 3-4 2 3h6l2-3 3 4-2 3c0 5-3 8-6 8s-6-3-6-8Z"/><path d="M9 11h.01M15 11h.01M9 16l1.5-1.5L12 16l1.5-1.5L15 16"/>',
  // --- places and orders
  flag: '<path d="M5 21V4m0 0h13l-3 4 3 4H5"/>',
  truce: '<path d="M6 21V4m0 0h11l-2.5 3.5L17 11H6"/><path d="M6 4h11"/>',
  tower: '<path d="M8 21V9h8v12M6 9V5l2 1 2-1 2 1 2-1 2 1 2-1v4M10 21v-5h4v5"/>',
  settlement: '<path d="m3 12 9-9 9 9M5 10v11h14V10M9 21v-7h6v7"/>',
  map: '<path d="m3 5 6-2 6 2 6-2v16l-6 2-6-2-6 2Zm6-2v16m6-14v16"/>',
  move: '<path d="M8 21c-2-2-3-5-3-8 0-4 3-7 7-7"/><path d="m12 6 4-3-1 3 1 3Z"/><path d="M5 17h6m-5 3h4"/>',
  target: '<path d="M2 12s4-6 10-6 10 6 10 6-4 6-10 6S2 12 2 12Z"/><circle cx="12" cy="12" r="3"/>',
  // --- moments and meta
  star: '<path d="m12 2 3 7 7 1-5 5 1 7-6-4-6 4 1-7-5-5 7-1Z"/>',
  fire: '<path d="M12 22c4 0 7-3 7-7 0-3-2-5-3-7-1 2-2 3-3 3 0-3-1-6-4-8 0 4-4 6-4 12 0 4 3 7 7 7Z"/>',
  warning: '<path d="m12 2.6 10.4 18.4H1.6Z"/><path d="M12 9.6v4.4" stroke-width="2.4"/><circle cx="12" cy="17.4" r="1.15" fill="currentColor" stroke="none"/>',
  journal: '<path d="M5 3h14v18H5ZM8 7h8M8 11h8M8 15h5"/>',
  scroll: '<path d="M7 4h11v13a3 3 0 0 0 3 3H7a3 3 0 0 1-3-3V7a3 3 0 0 1 3-3Z"/><path d="M10 8h5m-5 4h5"/>',
  camera: '<rect x="3" y="6" width="12" height="12" rx="2"/><path d="m15 10 6-4v12l-6-4Z"/>',
  tools: '<circle cx="12" cy="12" r="3"/><path d="M12 2v3m0 14v3M2 12h3m14 0h3M4.9 4.9 7 7m10 10 2.1 2.1M19.1 4.9 17 7M7 17l-2.1 2.1"/>',
};

/** Names that mean the same picture, so one file covers every name that asks for it. */
const ALIAS = { hero: "helm", doctrine: "scroll", research: "scroll" };

/** Icon name to the sprite file serving it, filled once the catalog arrives. */
let sprites = new Map();
export function useIconSprites(files) {
  sprites = new Map((files ?? []).map((file) => [file.replace(/\.[^.]+$/, ""), file]));
}
export const hasSprite = (name) => sprites.has(name);

/**
 * Returns a consistent decorative icon; its control supplies the accessible name. A sprite is
 * handed back inside the same 24-unit box as the drawings, so every rule that already sizes an
 * `svg` sizes a sprite too and no call site or stylesheet has to know which it got.
 */
export function hudIcon(alias) {
  const name = ALIAS[alias] ?? alias;
  const sprite = sprites.get(name);
  if (sprite !== undefined) {
    return `<svg viewBox="0 0 24 24" class="is-sprite" aria-hidden="true"><image href="/icons/${sprite}" x="0" y="0" width="24" height="24" preserveAspectRatio="xMidYMid meet"/></svg>`;
  }
  return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${paths[name] ?? paths.star}</svg>`;
}

/** Every name the HUD can ask for, so a sprite sheet can be checked against the real set. */
export const iconNames = Object.keys(paths);
export const iconAliases = ALIAS;
