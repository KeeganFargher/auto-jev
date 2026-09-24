# 3D models: where they live and how they reach the game

Every 3D asset has one Blender source file and one runtime `.glb`. The
source is what you edit. The `.glb` is what the game loads, and it is
always rebuilt from the source with one command, never edited by hand.
The asset contract (sizes, facing, clip names, budgets) is
`missing_assets.md` entries 8–10. `pnpm models:check` enforces it.

## Where things live

| Path | What | Git |
| --- | --- | --- |
| `art/models/<kind>/<id>.blend` | Source file, one per asset. `kind` is `heroes`, `props` or `board`; `id` is the game's id (`bulwark`, not "Anvil") | LFS |
| `art/explorations/*.blend` | Experiments and style tests that don't ship: the high-detail Anvil and Gorrak, and the matte gate-shield Anvil (flat, and painted with baked textures) | LFS |
| `art/generators/*.py` | The Blender scripts that first built each asset. They are recipes, not the source of truth | plain |
| `art/pipeline/*.py` | Blender-side tooling: the export, the new-asset scaffold, shared conventions | plain |
| `apps/client/public/assets/models/<kind>/<id>.glb` | Runtime model, written by `pnpm models:build` | plain |
| `apps/client/src/models/catalogue.ts` | Which models the game knows about | plain |
| `apps/client/src/models/library.ts` | Loads, caches and copies models | plain |
| `scripts/models/*.ts` | `models:new`, `models:build`, `models:check` | plain |

`.blend` files and source textures under `art/` go through Git LFS
(`.gitattributes`), so a hundred saves of a 2 MB file don't bloat the
repo. Runtime `.glb` files stay in plain git: they're small (Anvil is
280 KB), and the build and deploy need them without LFS. There's no git
remote yet. When one is added, `git push` uploads the LFS objects, so
check the host's LFS storage quota first. The repo's LFS hooks are
already installed. Blender backups (`*.blend1`) and Python caches are
ignored.

## Commands

```bash
pnpm models:new heroes oathkeeper
```

Creates `art/models/heroes/oathkeeper.blend` with the standard layout
below.

```bash
pnpm models:build bulwark
```

Exports that asset (or every asset, with no id) through Blender, then
checks the results. It needs Blender 5.2; set `BLENDER_PATH` if it isn't
in `/Applications`.

```bash
pnpm models:check
```

Checks every runtime `.glb` against the contract and the catalogue. It
doesn't need Blender.

## Inside a source file

Open any file under `art/models/` and the Outliner shows the same
layout:

| Collection | Exported | Holds |
| --- | --- | --- |
| `<id>` (e.g. `bulwark`) | yes | Exactly what ships: for a hero, one armature and its skinned mesh |
| `stage` | never | A camera at the game's 56° angle, a light, a 1 m footprint ring, a front arrow and a 1.8 m height ring |

- The scene is named after the asset and runs at 30 fps.
- Any other collection is ignored by the export. Use one for
  high-detail sources or reference.
- Hero files keep a "Showreel" track and timeline markers, so pressing
  Space plays every clip in turn.
- The `<id>` collection carries a glTF collection exporter with the same
  settings as the pipeline. Collection Properties → Exporters → Export
  from inside Blender gives the same result as `pnpm models:build`.

Rules the check enforces, from `scripts/models/contract.ts`:

- **Orientation.** Metres, feet on the origin, the model faces −Y in
  Blender (the export turns that into +Z, the contract's forward).
- **Materials.** Exactly one material named `team`, plain white. The
  game tints it blue or red, and no other material may be close to
  `#4ea1ff` or `#ff6b6b`. Emissive materials become the glow that
  pulses when the hero casts.
- **Clips.** One action per clip, named exactly `idle`, `run`, `attack`,
  `cast`, `hit`, `death`, and optionally `victory` and `channel`. Each
  must fall within the contract's length range.
  - `channel` loops while a channelled ability runs. The game already
    spins the whole figure, so the clip must not rotate the root.
  - The turret has no `run`.
  - Extra clips are reported but no game logic plays them.
- **Budgets.** Heroes stay within 8,000 triangles, 60 bones, and one
  texture up to 1024 px. Props stay within 2,000 triangles. Board pieces
  follow entry 9.
- **Footprint.** A hero fits a 1 m circle, measured on the model scaled to
  1.8 m tall; the game rescales every hero to its board height anyway.
  - A bulky hero can get an allowance in `FOOTPRINT_ALLOWANCES`, with its
    reason written next to it.
  - Gorrak's is 0.8 m: he holds two axes out and measures 0.77 m.

Only glTF-compatible materials survive the export: Principled BSDF with
plain values or image textures. Procedural node detail (the noise bumps
on the high-detail models) has to be baked into a texture first;
`art/generators/paint_bake.py` is the recipe that did that for the
painted style test.

## Export settings

The pipeline exports with Blender's own glTF exporter (settings in
`art/pipeline/conventions.py`):

- **Compression.** Meshopt compression (`EXT_meshopt_compression`),
  which Blender 5.2 ships natively.
- **Animations.** One animation per action; the showreel track is muted
  during export.
- **Keyframes.** Duplicate keyframes are removed, but every bone keeps a
  channel in every clip, so blending between clips never leaves a bone
  behind.
- **Modifiers.** Applied, except the armature.

Anvil went from 966 KB to 280 KB, the crate from 87 KB to 37 KB and the
barrel from 55 KB to 28 KB. Gorrak is 737 KB. Most of that is his
1024 px JPEG texture, which meshopt doesn't compress; WebP would roughly
halve it.

## How the game loads models

1. **Catalogue.** `apps/client/src/models/catalogue.ts` lists each model's
   URL and kind, in the same pattern as the audio catalogue. A `.glb`
   the catalogue doesn't list is never loaded. `models:check` flags it,
   and flags catalogue entries with no file.
2. **Loading never blocks.**
   - The first screen mounts straight away. `main.ts` then starts loading
     the hero models in the background.
   - It uses one `GLTFLoader` with three.js's bundled meshopt decoder,
     and each model loads once per page.
   - A model that fails to load logs a warning and the hero keeps its
     placeholder.
3. **Figures.** `createHeroFigure(heroId)` in
   `game/views/hero-figures.ts` returns a model figure
   (`model-figure.ts`) when that hero's model is loaded.
   - If the model is still loading, it returns the placeholder, requests
     the model, and swaps the model in once it arrives. The swap keeps
     the figure's root, height, team colour and movement state.
   - A hero that dies before its model arrives stays a placeholder until
     it's revived.
   - Only heroes that actually appear force a load.
   - Both figure types implement the same `HeroFigure` interface, so the
     battle, placement, teleport and environment views didn't change.
4. **Model figures.**
   - **Scale and base.** Each model stands on the same team-coloured base
     as the placeholder and is scaled to that hero's placeholder height.
     Health bars and on-board sizes stay where they were.
   - **Board height.** When a placeholder's height is wrong for its model,
     the catalogue entry sets `boardHeight` (on-board units, without the
     base). Cinder's placeholder wears a tall hat, so `pyromancer` sets
     8.3: her head sits a little under Gorrak's and Anvil's, her hair tips
     level with their crests. Her health plate follows the model.
   - **Clips.** `idle` and `run` loop and crossfade. `attack`, `cast` and
     `hit` play over them, starting part-way in so the impact lands as
     soon as the engine's hit does. Every basic attack plays `attack`,
     ranged ones included (Cinder's Firebolt throw); abilities play
     `cast`. `death` holds its last frame, then
     the figure sinks.
   - **Channelling.** `setChanneling` on `HeroFigure` switches the loop to
     `channel` while the battle view reports a channel. Placeholders
     ignore it.
   - **Channel effects.** A catalogue entry can name a code-drawn effect
     that shows while the figure channels. Only `cyclone` exists so far,
     used by `ravager`.
     - Its source is `game/views/cyclone-effect.ts`: spiral wind streaks
       and a dust ring.
     - glTF can't carry the Blender version's per-object alpha or
       additive blending, so effects like this live in code.
   - **Spell visuals.** Signature abilities get code-drawn visuals in
     `game/views/spell-visuals.ts`, looked up by ability id. See
     `docs/architecture.md` for where the battle view calls it. Cinder's
     are the first: Meteor, Flame Ward and Firebolt.
   - **Effects kept from the placeholders.** The attack lunge, the hit
     flash and the cast glow.
5. **Instances.** Each figure is a `SkeletonUtils` copy.
   - **Shared.** Geometry, clips and the file stay shared.
   - **Per figure.** Only the materials (for team colour and the flash)
     and one skeleton.
   - **Skeleton sharing.** three.js gives each part of a multi-material
     mesh its own skeleton copy, so the library re-links the parts to
     one skeleton per figure. It also frees that skeleton's bone texture
     when the figure is disposed.

## The model lab: `#models`

Open `http://localhost:5173/#models` while the client dev server is
running. It shows the selected model on the current board theme, with:

- **Clip buttons.** Play idle, run, attack, cast, hit, channel or death
  on demand. `channel` also spins the figure the way the battle view
  does, so the cyclone can be inspected.
- **Crowd.** Cycles Single → ×16 → ×32: two teams attacking and
  casting on a loop, the stress case.
- **Placeholder.** Swaps in the placeholder figures to compare cost.
- **Turn.** Flips the figures between front and back.
- **Stats.** FPS, frame time, draw calls, triangles, geometries,
  textures and shaders, plus a leak test that rebuilds the ×32 crowd
  twelve times.

Measured on the cove board, 2026-09-23:

| Figures | Draw calls (model / placeholder) | Triangles (model / placeholder) | Textures (model / placeholder) |
| --- | --- | --- | --- |
| 1 | 592 / 592 | 44k / 30k | 4 / 3 |
| 16 | 863 / 863 | 257k / 45k | 19 / 3 |
| 32 | 1,150 / 1,151 | 484k / 60k | 35 / 3 |

- **Draw calls.** Anvil costs the same as his placeholder: 9 meshes, 18
  draw calls with shadows.
- **Triangles.** His 7,014 triangles are drawn twice (colour and
  shadow).
- **The board.** The cove theme alone is about 574 draw calls, more
  than 30 heroes. Instancing the theme's props is the bigger win.
- **Leaks.** The leak test reports none: geometries 213 → 213, textures
  35 → 35.

Gorrak on the same board, measured in the desktop app's browser pane:

| Figures | Draw calls (model / placeholder) | Triangles (model / placeholder) |
| --- | --- | --- |
| 1 | 750 / 780 | 51k / 38k |
| 16 | 870 / 1,350 | 280k / 73k |
| 32 | 998 / 1,958 | 524k / 110k |

- **Draw calls.** His model has three materials (painted body, `team`
  and glowing eyes): 8 draw calls with shadows. His placeholder takes
  about 40, so 32 Gorraks cost half the draw calls of 32 placeholders.
- **Board baseline.** The narrower pane showed more of the island, so the
  board costs more here than in the Anvil table.

Real frame rates only mean something in a visible browser tab on the
slowest machine you care about. The Browser pane in the desktop app
pauses animation when it's hidden.

## Adding a hero model

The `new-hero` skill (`.claude/skills/new-hero/SKILL.md`) is the order of
work that Gorrak and Cinder went through. The minimal steps are:

1. Run `pnpm models:new heroes <id>` and open the new file.
2. Model it, or import an AI-generated model, inside the `<id>`
   collection.
   - Face −Y, feet on the origin, about 1.8 m tall.
   - Rig it with one armature, and name the accent material `team`.
   - Make one action per contract clip.
3. Run `pnpm models:build <id>` and fix anything it reports.
4. Add the id to `apps/client/src/models/catalogue.ts`.
5. Check it in `#models`: clips, team colour, and ×32 stats against the
   placeholder.
6. Commit the `.blend` (LFS), the `.glb` and the catalogue line together.

## Generators and explorations

- **Generators.** The scripts in `art/generators/` are how the first
  models were built. Renders and scratch files go to a temp folder
  (override it with `ART_OUT`). Only two steps write into `art/`: a
  high-detail builder run with `-- save`, and a bake recipe's final save
  (redirect it with `ART_TARGET`).
  - They show how things were made: posing with leg IK, the whirlwind,
    the hero kit's materials and the painted bake.
  - They are not a second source of truth. Once a `.blend` is edited by
    hand, the `.blend` wins.
  - **Shared kits.** `hero_kit.py` builds high-detail parts and their
    materials. `bake_kit.py` turns a high-detail file into a game model:
    low-poly parts, the painted bake, the final three materials and a
    painted-look preview. `clip_kit.py` poses the rig, keys and checks
    the clips, and writes the finished file. A hero's bake recipe is only
    its settings and its poses.
  - The style-test and paint scripts target the original single-file
    "Jev Props" layout.
- **Explorations.** Files in `art/explorations/` are never exported. The
  high-detail Gorrak and Cinder there are the sources their game models
  were baked from.

## How Gorrak's game model was made

Rebuild it with:

```bash
/Applications/Blender.app/Contents/MacOS/Blender --background --factory-startup art/explorations/gorrak-hq.blend --python art/generators/build_ravager.py
```

It reads the high-detail file and never saves over it. It writes
`art/models/heroes/ravager.blend`, which `pnpm models:build ravager`
then exports. Set `ART_TARGET` to write somewhere else instead. The
recipe holds Gorrak's settings and poses; the steps below run in
`bake_kit.py` and `clip_kit.py`. Moving the steps there changed nothing:
the rebuilt model has the same triangles, clips and checks, and its texture
differs only by the GPU bake's run-to-run noise.

1. **Rest pose.** It mutes the showreel, clears the actions and zeroes
   every bone before reading any geometry, so the mesh matches the rig.
2. **One low-poly part per high-detail part.** Each part is unwrapped
   while it's still a clean quad mesh, then simplified to a
   per-part triangle target.
   - Thin sheets are simplified first and thickened afterwards, so
     simplification doesn't merge the two faces.
   - Decals and small details are dropped from the geometry and kept in
     the texture instead: studs, straps, wraps, war paint and beard
     rings.
   - The result is 7,758 triangles in Blender and 7,524 in the `.glb`.
3. **Rigid skin.** Each part is weighted fully to the bone it was
   parented to, then all parts are joined into one skinned mesh on the
   original 18-bone rig.
4. **UVs.** The islands are rescaled to even texel density and packed
   into one 1024 px texture, covering 74% of it.
5. **Painted bake.** Every material gets the painted shader from the
   style test: top light, local ambient occlusion, bevel-edge
   highlights, warm lit sides and cool shadows, and brush noise.
   - That look is baked from the high-detail surface onto the low-poly
     UVs. The war paint and straps survive this way.
   - Where a projected ray misses (mostly the crushed fur tufts), the
     texel comes from a second bake painted directly on the low-poly
     surface.
   - The first bake on this Mac took 8 minutes to compile the Metal GPU
     shaders; later runs take about 24 s.
6. **Three materials.** `ravager_body` (the baked JPEG, roughness 0.8,
   not metallic), `team` (plain white: sash and axe tassels) and `glow`
   (the eyes).
7. **Clips.** They're re-keyed with the high-detail posing code:
   direction-aimed arms, two-vector axe grips and 2D leg IK.
   - `idle` 3.0 s, `run` 0.7 s, `attack` 0.67 s (the chop lands on
     frame 8), `cast` 0.9 s (arms flung wide at 50%), `hit` 0.3 s,
     `death` 1.2 s (ends flat), `victory` 2.5 s and `channel` 0.67 s.
   - No clip goes below the floor, and every loop closes exactly.
8. **Standard layout.** Scene and collection `ravager`, the `stage`, the
   exporter, and a showreel with markers.

## How Cinder's game model was made

Cinder is the second hero through the same recipe, and the first built
from scratch for it.

```bash
/Applications/Blender.app/Contents/MacOS/Blender --background --factory-startup --python art/generators/build_cinder.py -- save
```

```bash
/Applications/Blender.app/Contents/MacOS/Blender --background --factory-startup art/explorations/cinder-hq.blend --python art/generators/build_pyromancer.py
```

The first writes the high-detail `art/explorations/cinder-hq.blend`
(53 parts, 111k triangles, an 18-bone rig). The second bakes it into
`art/models/heroes/pyromancer.blend`, which `pnpm models:build
pyromancer` exports: 7,791 triangles, 3 draw calls, one 1024 px texture,
7 clips, 697 KB.

1. **Look.** She follows her portrait (`art/icons/heroes/pyromancer.png`)
   rather than the placeholder's wizard hat: copper hair swept up like a
   flame, orange eyes, freckles, a grin, a warm charcoal coat with brass
   buttons and a burnt, glowing hem, and the flame in her left hand.
2. **Sign-off preview.** `-- preview` renders the painted look the bake
   will produce, next to the shipped Anvil and Gorrak from the game
   camera. The user approved the look from that before any clips were
   keyed.
3. **Team colour.** The scarf, its tail and the sleeve cuffs. The
   contract keeps `team` plain white, so a large team area would lose
   the painted shading.
4. **Face.** A face baked from everything around it picks up the hair
   locks that hang in front of it. The recipe's `isolate` option bakes
   the face parts (skull, eyes, brows, mouth, freckles) only from each
   other. Three more settings keep it clean:
   - The scalp under the hair is deleted, since it's never seen.
   - `uv_boost` gives her skin three times the texture space.
   - The `skin_soft` paint kind drops the weathered noise that suits
     Gorrak.
5. **Coat.** The skirt and its ember hem are smooth-weighted: hips at the
   waist, blending to the thigh of the same side and a `coat` bone toward
   the hem, at most four influences. The front opening and the back vent
   give the stride room.
6. **Glow.** The `glow` material uses the painted texture as its emission,
   so the flame keeps its yellow-to-red gradient. The strength is 2.0, the
   same value the preview renders.
7. **Clips.** `idle` 3.0 s with a flickering flame (a `flame` bone's
   scale), `run` 0.67 s, `attack` 0.7 s (a Firebolt throw released at
   40%), `cast` 0.9 s (both arms up with a big flame at 50%), `hit`
   0.3 s, `death` 1.2 s (the flame goes out, and she ends on her back),
   `victory` 2.5 s. No clip goes below the floor, and every loop closes
   exactly.

