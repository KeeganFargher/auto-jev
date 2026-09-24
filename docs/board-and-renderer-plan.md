# Board, placement and 3D renderer

A detour between Phase 5 and Phase 6, on user instruction (2026-09-22):
"it kind of looks terrible right now". The user wants an angled
Underlords-style 3D view, an Underlords-style grid where players place
their own heroes, and a path to a larger roster later. Rationale for
each choice lives in `docs/decisions.md` ("Board grid, placement and a
Three.js renderer").

## Settled by the user

| Question | Answer |
| --- | --- |
| Renderer | Three.js, not Godot |
| Board | An Underlords-style grid; each player places their own heroes on their half |
| Team size | Three heroes for now; must be easy to grow later (more heroes as the run goes on) |
| Art source | Undecided. Probably AI-generated, maybe built through a Blender MCP. The renderer uses placeholder figures until models arrive |

## Stages

### 1. Grid board (done)

- The arena is an 8×8 board of 10-unit cells (80×80 world units).
  `ArenaDefinition` gained `columns` and `rows`; catalogue validation
  requires whole columns, an even number of rows and square cells.
- Each player owns an 8×4 half. Cells are given in *own-half*
  coordinates: `row 0` is the front line at the centre of the board,
  `row 3` the back. Team A plays the south half; team B's formation is
  rotated 180° onto the north half, as in Underlords, so both players
  see their own side from the same angle (`packages/game/src/board/cells.ts`).
- The grid is for **placement only**. Movement stays continuous; heroes
  leave their cells as soon as the fight starts.
- Seats have a `formation` (one cell per hero slot). The draft assigns
  a default: heroes whose basic attack reaches at most 1.5 cells go on
  the front row, others on the back row, filled centre-out.
- New command `place-heroes` (whole formation at once) during
  `preparing`. Battle setups are now built when the battle starts, not
  when preparing starts, so they pick up the final formation.
- Bots place a seeded formation (default rows, shuffled columns) and
  then ready up.

### 2. Three.js board and battle view (done)

- One persistent WebGL renderer in the battle layer, reused for the
  preparing board and every battle (no new context per battle switch).
- Perspective camera pitched like Underlords, fixed yaw, your side
  nearest the camera (the camera turns 180° when you are team B). The
  board is framed inside the area the HUD leaves clear (the existing
  `ViewportInsets`).
- A tiled 8×8 board on a plinth, lighting with soft shadows, a dark
  backdrop that matches the HUD's night palette.
- Placeholder hero figures built from primitives, distinct per hero,
  with a team-coloured base ring. Health and shield bars float above
  heads as DOM elements.
- Combat readability: facing, attack lunges, bolt projectiles, heal and
  shield effects, a ring under slowed heroes, hit flash, damage numbers, death
  animation, selection and range ring, click to inspect.
- The lab keeps its debug overlays (target lines for every unit).
- Dead heroes tip over and sink into the board.

### 3. Placement UI (done)

- During `preparing`, your heroes stand on your half of the 3D board;
  drag one onto another cell of your half to move it (dropping on an
  occupied cell swaps). Each drop sends the whole formation.
- Ready (or the timer running out) locks the formation.
- A seat with a bye has no battle and already counts as ready, so it
  can't rearrange that round. Recorded, not special-cased.
- The preparing timer stays at 15 seconds for now. It is tighter now
  that placement happens in that window; easy to raise.

### 4. Model pipeline (done, 2026-09-23)

- Heroes load from `.glb` files when present, fall back to the
  placeholder figure when not. The loader expects exactly the contract
  in `missing_assets.md` entries 8–10 (Y-up, metres, facing +Z, origin
  at the feet, a `team` material slot, fixed clip names), so a model
  that follows it works without code changes.
- Built: per-asset Blender sources under `art/models/` (Git LFS),
  `pnpm models:build` / `models:check` / `models:new`, the model
  catalogue and loader, model-backed hero figures, and the `#models`
  lab with crowd stress stats. Anvil (`bulwark`) is the first model in
  the game. Full guide: `docs/models.md`.

### 5. Later, not scheduled

- **Growing the team:** a bench and a per-round active-hero cap
  (Underlords-style), with new hero offers as the run goes on.
  Formation, validation and the default formation already work for any
  hero count; only `TEAM_SIZE` and the draft are fixed at three.
- **Roster, items and combos:** a design doc first (heroes, signature
  abilities, items as a build layer, synergy tags with thresholds),
  then the engine primitives it needs (stuns, area damage, dashes,
  damage over time, a mana/ultimate bar).
