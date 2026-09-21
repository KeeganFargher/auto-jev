const paths = {
  clay:'<path d="m3 18 4-11 9-2 5 13H3Z"/>',
  bricks:'<path d="M2 5h20v14H2ZM2 12h20M9 5v7m7 0v7"/>',
  steel:'<path d="M4 4h16v4h-5v8h5v4H4v-4h5V8H4Z"/>',
  parts:'<circle cx="12" cy="12" r="6"/><circle cx="12" cy="12" r="2"/><path d="M12 2v4m0 12v4M2 12h4m12 0h4M5 5l3 3m8 8 3 3M19 5l-3 3M8 16l-3 3"/>',
  camera: '<rect x="3" y="6" width="12" height="12" rx="2"/><path d="m15 10 6-4v12l-6-4Z"/>',
  food: '<path d="M12 20V5m0 8C4 13 4 7 4 7s8 0 8 6Zm0 4c8 0 8-6 8-6s-8 0-8 6Zm0-8c6 0 6-5 6-5s-6 0-6 5Z"/>',
  water: '<path d="M12 3S5 11 5 15a7 7 0 0 0 14 0c0-4-7-12-7-12Z"/>',
  wood: '<path d="m5 8 10-4 5 4v9l-10 4-5-4Zm0 0 5 4 10-4M10 12v9M15 4v9"/>',
  stone: '<path d="m3 16 3-9 10-3 5 9-5 7H7Zm3-9 5 6 10 0M11 13l-4 7m4-7 5-9"/>',
  planks: '<path d="m3 9 13-5 5 3-13 5Zm0 0v4l5 3 13-5V7M3 13v4l5 3 13-5v-4M8 12v8"/>',
  ore: '<path d="m4 16 4-9 7-3 5 8-5 8H8Zm4-9 4 5 8 0m-8 0 3 8M9 5l2-3"/>',
  coal: '<path d="m3 15 4-9 9-2 5 12-7 5-8-2Zm4-9 7 5 7 5M14 11v10"/><path d="m7 10 3 3-3 3Z" fill="currentColor"/>',
  metal: '<path d="m3 15 4-8 10-2 4 8-5 6-13 0Zm4-8 4 8 10-2M3 15h8l5 4"/>',
  tools: '<path d="m4 20 9-9m-5-6c5-3 9 0 12 4l-3 3-4-4-2 2-4-4Z"/>',
  weapons: '<path d="m4 20 13-13m-7 10-3-3M16 3l5-1-1 5-6 5-2-2Z"/>',
  people: '<circle cx="9" cy="7" r="3"/><path d="M3 21v-4a6 6 0 0 1 12 0v4M16 4a3 3 0 0 1 0 6m2 3a5 5 0 0 1 3 4v4"/>',
  settlement: '<path d="m3 12 9-9 9 9M5 10v11h14V10M9 21v-7h6v7"/>',
  research: '<path d="M3 4h7l2 2 2-2h7v15h-7l-2 2-2-2H3Zm9 2v15"/>',
  journal: '<path d="M5 3h14v18H5ZM8 7h8M8 11h8M8 15h5"/>',
  target: '<circle cx="12" cy="12" r="7"/><path d="M12 1v6m0 10v6M1 12h6m10 0h6"/>',
  map: '<path d="m3 5 6-2 6 2 6-2v16l-6 2-6-2-6 2Zm6-2v16m6-14v16"/>',
  warning: '<path d="m12 3 10 18H2ZM12 9v5m0 3v1"/>',
  star: '<path d="m12 2 3 7 7 1-5 5 1 7-6-4-6 4 1-7-5-5 7-1Z"/>',
};
/** Returns a consistent decorative icon; its control supplies the accessible name. */
export function hudIcon(name) {
  return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${paths[name]}</svg>`;
}
