# Missing assets

Art, icons and audio the code currently fakes. Each entry lists the exact
files to deliver, their dimensions and format, where they'll be used, and
a ready-to-paste generation prompt. None of these block play; the game
works with its current text and glyph placeholders.

**How to deliver:** drop files at the listed path (Vite serves
`apps/client/public/` at the site root, so
`apps/client/public/assets/icons/play.svg` loads as `/assets/icons/play.svg`)
and say so — wiring them into the UI is a code change, not part of the
asset. 3D models (entries 8–9) are different: their listed path is a
source under `art/`, and a build command writes what the game loads
(`docs/models.md`). Item, gem and level-pick icons and hero portraits
are all delivered, including slice 1 of the hero redesign; new ones go
through `docs/icons.md`. Sound effects and hero voice lines are all
delivered too; new ones go through `docs/audio.md`.

## Shared style guide

Applies to every entry below unless the entry says otherwise.

**Reference:** Dota Underlords (from a screenshot the user shared): the
board fills the screen, HUD panels float over it as compact, translucent,
icon-led chrome. Prompts below describe that look in words rather than
naming the game, because some generators refuse named-game styles.

**Art style:** mature cartoon, like Dota Underlords and Dungeon
Defenders: chunky exaggerated proportions, simple bold shapes,
hand-painted textures with soft painterly shading, grounded and slightly
weathered rather than cute or glossy, restrained glow. The first item
icons came out as glossy, glowing "premium mobile game" art, and the user
rejected that look. Naming the games in a prompt risks copying their own
item art (Dota has its own Aegis), so describe the style instead.

**Palette** (the exact tokens in `apps/client/src/style.css`'s `@theme`
block; art should sit inside this world):

| Role | Hex | Where it appears today |
| --- | --- | --- |
| Night (backdrop, deepest → lightest) | `#0c0b1d` `#15132e` `#1f1c42` `#2b2858` `#3a366f` | page, panels, cards |
| Board backdrop | `#0c0b1d` (fading from `#3a366f` under the board) | behind the 3D board |
| Board tiles | `#8f89a7` / `#7f7998`, tinted blue on your half and red on theirs | the 8×8 board |
| Banner blue (brush strokes, primary button) | `#5a6bd0` `#3f4fb0` `#313d8c` `#26306e` | banners, round action button |
| Gold (rings, "you", victory) | `#f7e3a3` `#e2bd5c` `#a97d2c` `#5e4214` | portrait rings, highlights |
| Stone (round-timer plate) | `#d9d4e3` `#9a94ad` `#5d5873` `#312e40` | top-right plate |
| Lavender text | `#d6d2f0` `#b3add8` `#8b84bd` | labels, descriptions |
| White text / icons | `#eef0f6` | titles, glyphs |
| Your side | `#4ea1ff` | your units, your name in battle |
| Enemy side | `#ff6b6b` | enemy units, opponent highlight |
| Heart (run health) | `#ff5d7a` | hearts |
| Damage / heal / shield cues | `#ffb454` / `#4ade80` / `#60a5fa` | battle effects |
| Seat identity (8 players) | `#a6d93b` `#4aa8f0` `#9b73e6` `#ef7aa8` `#f2a33a` `#36c6b0` `#e5584f` `#e2bd5c` | portrait backgrounds |

**Fonts:** Lilita One for display text (titles, names, numbers,
buttons) and Barlow Condensed 600/700 for labels and descriptions. Both
are open-licence (OFL) and self-hosted via `@fontsource`, so they
aren't missing. Any art with lettering-like elements should feel at home
next to them.

**Hero portraits and glyphs** (2D art should echo them): the HUD shows
each hero's painted portrait (`art/icons/heroes/`, head crops in
`art/icons/faces/`) and keeps a glyph (`roleIcon` in
`apps/client/src/hud/icons.ts`) for 18 px chips: Anvil a shield, Rime a
snowflake, Vesper a dagger, Cinder a flame, Morrow a sun, Gorrak crossed
axes, Moira an eye in a triangle, Nettle a leaf, Sexton a skull,
Brassjack a cog. In the 3D board the placeholder heroes are
tabletop-miniature figures (entry 8 replaces them).

**Rules for all image assets:**
- No text or numbers baked into any image — the game renders all text.
- sRGB. Transparent background unless the entry says otherwise.
- Don't make blue `#4ea1ff` or red `#ff6b6b` the dominant colour of
  anything that isn't team-specific; those two mean "your side" and
  "their side".
- Must read clearly at the listed display size on a dark background.
- No real-world religious figures or symbols. The first Glass Idol came
  out as a seated Buddha-like statue, so for idols, charms and relics,
  name an invented fantasy subject in the prompt.

**Readability at 64 px** (the user found some of the first icons hard
to read at that size; the reward disc shows art at 62 px):
- Bright or mid-toned objects with a strong light rim light. A dark
  object (indigo cloth, grey glass, black steel) sinks into the dark
  disc.
- One bold silhouette with the identifying feature drawn oversized.
- No smoke, clouds, particles or effects spreading to the canvas edges;
  they swallow the object (the first Vanishing Act).
- Avoid thin diagonal shapes where a broad one works (swords, mirrors).
- The icon prompts in `docs/icons.md` end with a readability clause that
  says this. Reuse it for any small art, and look at each result at the
  size it's shown before keeping it.

**Rules for all icons:**
- SVG, `viewBox="0 0 24 24"` (the grid every placeholder in
  `apps/client/src/hud/icons.ts` uses), solid filled shapes (no strokes
  thinner than 1.5 px), fill `currentColor` so CSS can recolour them.
- Pixel-snapped to the 24 px grid, 1 px corner rounding, consistent
  optical weight across the set, no gradients or shadows.
- Most image generators output raster, not SVG, including the one
  below. Either use a vector-capable generator or trace the output; the
  prompt describes the target either way.

**Generating the PNG entries** (used for every item, gem and level-pick
icon and every hero portrait; `art/icons/prompts.json` has the exact
prompts):
Cloudflare Workers AI, model `openai/gpt-image-2.5-sunburst`, with
`CLOUDFLARE_ACCOUNT_ID` and `CLOUDFLARE_API_TOKEN` taken from the
environment, never written into the repo:

```
curl https://api.cloudflare.com/client/v4/accounts/$CLOUDFLARE_ACCOUNT_ID/ai/run \
  --header "Authorization: Bearer $CLOUDFLARE_API_TOKEN" \
  --header "Content-Type: application/json" \
  --data '{"model":"openai/gpt-image-2.5-sunburst","input":{"prompt":"…","quality":"medium","size":"1024x1024","background":"transparent","output_format":"png"}}'
```

- Use `quality: "medium"`. The model also takes `low`, `high`, `xhigh`,
  `max` and `auto`; the higher settings cost more, and medium already
  holds up at the 84 px reward disc.
- `background: "transparent"` returns real alpha, so no grey-screen
  cutout is needed.
- Sizes are 1024×1024, 1024×1536 and 1536×1024 only. For an icon, save
  the master at 512 px (`sips -z 512 512 in.png --out
  art/icons/<kind>/<id>.png` keeps the alpha) and run
  `pnpm icons:build <id>`; `docs/icons.md` has the rest.
- The response carries no image bytes and no usage figures:
  `result.result.image` is a presigned R2 link that expires after a
  day, so download it straight away. Cost shows only in the Cloudflare
  dashboard.
- About 22 s per image; parallel requests work.

**Rules for 3D models** (entries 8 and 9; the renderer is Three.js):
- Every model goes through the pipeline in `docs/models.md`. Its source
  is `art/models/<kind>/<id>.blend`, and `pnpm models:build <id>`
  exports the `.glb` and checks it against these rules.
- glTF 2.0 binary (`.glb`), one file per asset, textures embedded.
- Y-up, metres, the model faces **+Z**, origin at the centre of its
  footprint on the ground (a hero's feet, a tile's top face).
- Stylised, not realistic: chunky exaggerated proportions (big hands,
  big weapons, readable silhouette from a camera looking down at about
  55°), hand-painted or flat-colour textures, soft baked ambient
  occlusion at most. No photoscanned or PBR-heavy materials: one
  base-colour texture, roughness around 0.8, no metal maps needed.
- Budgets: a hero at most 8,000 triangles and one 1024×1024 texture; a
  board tile at most 500 triangles; the whole environment at most
  60,000 triangles and two 2048×2048 textures.
- The camera looks down on everything, so tops of heads, shoulders and
  weapons matter more than faces.

**Rules for music** (entry 7):
- Master: WAV, 48 kHz, 24-bit, stereo, trimmed so the last sample flows
  straight back into the first (a seamless loop, no fade-in or fade-out).
- Web copies: `.ogg` (Vorbis, quality 6) **and** `.m4a` (AAC, 192 kbps),
  same base name; the game plays whichever the browser supports. Not
  MP3: the encoder pads the start and end with silence, which puts an
  audible gap at every loop point.
- Loudness about −20 LUFS integrated with peaks under −3 dBTP, so
  stingers and effects sit clearly on top.
- Instrumental only: no vocals, choirs singing words, or spoken samples.

---

## 1. HUD control icons

**Used in:** the battle lab's bottom transport bar
(`apps/client/src/hud/battle-controls.ts`, buttons are 38×38 CSS px
circles) and the battle-watch overlay's "Skip" pill button
(`apps/client/src/game/scenes/match-scene.ts`).

**Currently:** the lab uses unicode glyphs (`▶`, `‖`, `▶‖`, `↻`, `⏮`),
which render differently per platform, and `▶‖` for "step" isn't a
recognised symbol. The "Skip" pill uses a hand-written inline SVG
placeholder (`apps/client/src/hud/icons.ts`'s `skipIcon`).

**Files to deliver:**

| File | Size | Meaning |
| --- | --- | --- |
| `apps/client/public/assets/icons/play.svg` | 24×24 viewBox | start playback |
| `apps/client/public/assets/icons/pause.svg` | 24×24 viewBox | pause |
| `apps/client/public/assets/icons/step.svg` | 24×24 viewBox | advance one tick |
| `apps/client/public/assets/icons/reset.svg` | 24×24 viewBox | restart the battle |
| `apps/client/public/assets/icons/replay.svg` | 24×24 viewBox | replay last recording from the start |
| `apps/client/public/assets/icons/fast-forward.svg` | 24×24 viewBox | playback speed (for the 0.5x–4x chips) |
| `apps/client/public/assets/icons/skip-to-end.svg` | 24×24 viewBox | jump to the battle's final tick |

Displayed at 16×16 CSS px, `#eef0f6` on a night-blue button
(`#3a366f` → `#1f1c42` gradient).

**Prompt:**

```
Minimal flat UI icon set for a strategy game's playback controls, seven
separate icons on a 24x24 pixel grid, each centred on its own tile:
play (right-pointing triangle), pause (two vertical bars), step forward
(small right-pointing triangle followed by a vertical bar), restart
(circular arrow, open at the top right, with an arrowhead), replay from
start (vertical bar followed by a left-pointing triangle), fast forward
(two right-pointing triangles), skip to end (two right-pointing
triangles followed by a vertical bar). Solid white fills on a
transparent background, 1px rounded corners, identical optical weight
across all seven, pixel-snapped, crisp at 16px display size.
```

**Avoid:** outlines-only styles, gradients, drop shadows, 3D bevels,
circular button backgrounds (the HUD supplies the button), text labels.

---

## 3. Seat avatars and the run-health heart

**Used in:** every player portrait. That means the square portraits in
the left player rail (about 50 CSS px), the gold-ringed circles on the
versus screen (136 px), and the battle header (40 px). The art is always
a dark bust silhouette sitting on that seat's identity colour, cropped by
the bottom edge, the same treatment as the silhouettes in the reference
screenshot's player list. Hearts appear beside every health number.

**Currently:** hand-written inline SVG placeholders in
`apps/client/src/hud/icons.ts` — `humanSilhouette`, `botSilhouette`
(a boxy head with visor and antenna) and `heartIcon`. They work but are
geometric programmer art.

**Files to deliver:**

| File | Size | Meaning |
| --- | --- | --- |
| `apps/client/public/assets/icons/seat-bot.svg` | 24×24 viewBox | bust silhouette for a baseline bot seat |
| `apps/client/public/assets/icons/seat-human.svg` | 24×24 viewBox | bust silhouette for a human seat |
| `apps/client/public/assets/icons/heart-full.svg` | 24×24 viewBox | a remaining run-health point |

The busts are a single `currentColor` fill, and their shoulders must
run off the bottom edge
of the viewBox so the portrait frame crops them. They're shown at 40 to
136 CSS px, so they need to hold up large as well as small. The
heart follows entry 1's icon rules and is shown at 15–16 px. Seat
colours are done in code.

**Prompt:**

```
Two flat single-colour bust silhouettes for game player portraits, each
on its own square tile, head and shoulders only, shoulders running off
the bottom edge of the tile: one a stylised friendly automaton with a
boxy head, a horizontal visor slit and a short antenna; one a stylised
human with a simple rounded head and slightly squared shoulders.
Solid black fill on a transparent background, no interior detail other
than the visor slit, bold readable silhouettes that still read at 40px
and look intentional at 136px. Also a single solid filled heart icon on
a 24x24 pixel grid, pixel-snapped, 1px rounded corners.
```

**Avoid:** faces with detailed expressions, gradients, shadows, text.
The robot must read as "baseline bot", not as a named AI character: the
plan requires the UI to label these seats as baseline bots, not Jev.

---

## 5. Brush-stroke and stone textures (HUD surfaces)

**Used in:** every brush-stroke banner (the menu's title block, the
"FIGHT!" button, and the Victory / Defeat / Draw / Bye / Eliminated
result banners) and the stone round-timer plate top-right. All come from
`apps/client/src/style.css` (`.brush-banner`, `.round-plate-timer`).

**Currently:** CSS approximations. Banners are a gradient cut to a
jagged polygon (`clip-path`) with faint horizontal streaks, tinted blue,
gold, crimson or slate per mood. The stone plate is a grey gradient on
a slanted polygon. They read as the right idea, but not as real paint
or stone.

**Files to deliver:**

| File | Size | Format | Used as |
| --- | --- | --- | --- |
| `apps/client/public/assets/textures/brush-stroke.png` | 1600×400 px | PNG, transparent, white only | CSS `mask-image` for every banner, so one stroke serves all four colours |
| `apps/client/public/assets/textures/stone.png` | 512×512 px | PNG, greyscale, seamlessly tileable | overlay on the round plate, tinted in CSS |

The brush stroke is a **white shape on transparency**: the game tints
it, so any colour in it is ignored. Keep the stroke's solid body
covering the central 70% so text laid over it stays readable. Dry,
feathered bristle edges should be on the left and right ends only.

**Prompt — brush stroke:**

```
A single wide horizontal dry-brush paint stroke, 4:1 aspect ratio, pure
white on a transparent background, solid opaque body across the middle
70 percent, rough torn bristle texture and a few dry-brush streaks
breaking up at both left and right ends, slightly uneven top and bottom
edges, no colour, no shading, no text, no letters.
```

**Prompt — stone:**

```
Seamless tileable greyscale stone surface texture, smooth weathered
slate with faint chisel marks and a few hairline cracks, even flat
lighting with no directional shadows, medium contrast, square, no
colour, no text.
```

**Avoid:** coloured strokes, multiple strokes in one image, lettering
(generators love adding fake text, so reject those), strong directional
lighting on the stone (it's tiled and would show seams).

---

## 7. Background music (three seamless loops)

**Used in:** the main menu, the between-battle screens (draft,
preparing, upgrade, finished), and the full-screen battle view. The game
will crossfade between them over about 1 second as the screen changes
(`apps/client/src/game/scenes/match-scene.ts` switches between these
screens). All three share a key (D minor / D Dorian) so a crossfade
mid-phrase never clashes.

**Delivered so far:** `music-planning.mp3` only (ElevenLabs Music v2,
instrumental, 120 s, 48 kHz stereo, −18.7 LUFS, peaks −4.1 dBFS). It is
**not** loop-trimmed and is MP3, so there's a small gap where it loops;
that's accepted for now. Until the menu and combat loops exist,
`MUSIC_FOR_SCREEN` in `apps/client/src/audio/catalogue.ts` points all
three screens at this track. Swap an entry there when its file lands.

**Currently:** the planning track plays on every match screen.

**Style:** light fantasy orchestra with a mischievous streak: plucky
pizzicato strings, woodwinds (clarinet, bassoon, piccolo), mallets
(marimba, glockenspiel), hand percussion and frame drums, and a little
warm brass. Playful, confident and slightly sly rather than epic or
grim, like a board game played in a lamplit fantasy town at dusk. It
should sit under the UI without competing with it: no melody that
demands attention for more than a few bars, and a steady groove you can
think over.

**Files to deliver:**

| File | Tempo | Loop length | Feel |
| --- | --- | --- | --- |
| `apps/client/public/assets/audio/music-menu.ogg` / `.m4a` | 96 BPM | 32 bars (80 s) | warm, inviting, "come play" |
| `apps/client/public/assets/audio/music-planning.ogg` / `.m4a` | 104 BPM | 48 bars (≈111 s) | thoughtful, sly, relaxed tension |
| `apps/client/public/assets/audio/music-combat.ogg` / `.m4a` | 132 BPM | 48 bars (≈87 s) | driving, bouncy, still playful |

All in 4/4, and each ending exactly on the downbeat before bar 1. Most
music generators output 2–3 minute songs with an intro and outro; ask
for the prompt below, then cut the cleanest 32 or 48 bars on the bar
lines and loop-test it before exporting.

**Prompt — planning (the main one, heard the most):**

```
Instrumental loop for a strategy auto-battler's planning screen,
104 BPM, 4/4, D Dorian. Light fantasy orchestra with a mischievous,
sly character: plucky pizzicato strings carrying a steady walking
groove, a clarinet and bassoon trading short playful motifs, soft
marimba and glockenspiel sparkle, brushed frame drum and shaker, a warm
low brass pad underneath. Relaxed tension, like plotting your next move
in a lamplit fantasy town at dusk. Background music that sits under a
game UI: no big melody hooks, no crescendos, no drops, consistent
energy from start to finish so it loops seamlessly. No vocals.
```

**Prompt — combat:**

```
Instrumental loop for the battle phase of a strategy auto-battler,
132 BPM, 4/4, D minor. Same light fantasy orchestra as a sly planning
theme, now driving and bouncy: staccato string ostinato, punchy
pizzicato bass, tom and frame-drum groove with snare rolls, short
bright brass stabs, piccolo and xylophone runs answering each other.
Energetic and playful rather than epic or grim, a scrappy tavern brawl
not a war. Steady intensity throughout with no breakdown, build-up or
ending, so it loops seamlessly. No vocals.
```

**Prompt — menu:**

```
Instrumental loop for a strategy game's main menu, 96 BPM, 4/4,
D Dorian. Light fantasy orchestra, warm and inviting with a hint of
mischief: gentle pizzicato strings and harp, a clarinet melody that
curls playfully, soft marimba, light hand percussion, a mellow horn
answering phrases. A lamplit fantasy town square at dusk, the evening
before a friendly contest. Calm, consistent energy with no intro, no
ending and no big climax, so it loops seamlessly. No vocals.
```

**Avoid:** vocals or choirs, epic trailer drums and huge risers, dark
horror or grimdark tones, EDM drops, lo-fi hip-hop beats, anything with
a fade-in, fade-out or final cadence (it has to loop), and melodies so
busy they pull attention from the board.

---

## 8. Hero models (3D, rigged and animated)

**Used in:** the 3D board, in every battle and on the placement board
(`apps/client/src/game/views/`). Three models are delivered:
- Anvil: `bulwark.glb`, source `art/models/heroes/bulwark.blend`.
- Gorrak: `ravager.glb`, source `art/models/heroes/ravager.blend`, built
  by `art/generators/build_ravager.py`.
- Cinder: `pyromancer.glb`, source `art/models/heroes/pyromancer.blend`,
  built by `art/generators/build_pyromancer.py` from the high-detail
  `art/explorations/cinder-hq.blend` (`build_cinder.py`). Her look follows
  her portrait, not the placeholder's hat.

Every hero below is still a placeholder figure built from simple shapes.
Seven of them are no longer human (`docs/lore.md`, "Bodies"): their
placeholders already show the new bodies, and the looks below describe
them.

**Files to deliver:**

| File | Model |
| --- | --- |
| `apps/client/public/assets/models/heroes/oathkeeper.glb` | Morrow, the Oathkeeper |
| `apps/client/public/assets/models/heroes/duskblade.glb` | Vesper, the Duskblade |
| `apps/client/public/assets/models/heroes/frostweaver.glb` | Rime, the Frostweaver |
| `apps/client/public/assets/models/heroes/blightmother.glb` | Nettle, the Blightmother |
| `apps/client/public/assets/models/heroes/bonecaller.glb` | Sexton, the Bonecaller |
| `apps/client/public/assets/models/heroes/clockwright.glb` | Brassjack, the Clockwright |
| `apps/client/public/assets/models/heroes/thrall.glb` | Thrall (Sexton's summon) |
| `apps/client/public/assets/models/heroes/bone-golem.glb` | Bone Golem (Sexton's summon) |
| `apps/client/public/assets/models/heroes/turret.glb` | Turret (Brassjack's summon) |

**Contract the game relies on** (on top of the 3D rules above):
- Human scale, about 1.8 m tall; the game scales every hero to the same
  on-board height, so relative size between heroes comes from their
  build, not their file scale. Footprint inside a 1 m circle, measured on
  the model scaled to 1.8 m. A bulky hero can get a written allowance
  in `scripts/models/contract.ts`; Gorrak has one at 0.8 m.
- Standing in its idle pose facing +Z, feet on the origin.
- **Team colour:** exactly one material named `team`, coloured plain
  white, on a few accent pieces (sash, shoulder cloth, belt trim,
  plume). The game tints it blue for your side and red for theirs, so
  don't put team-agnostic detail on it. Every other material must avoid
  blue `#4ea1ff` and red `#ff6b6b` as a main colour.
- **Rig:** one skeleton, at most 60 bones, shaped to the body: two legs,
  four, six, a tripod, roots or none. The weapon is part of the mesh,
  skinned or parented to its bone. A body that isn't a person keeps the
  same clip names (a panther's `run` is a lope, a floating eye's `run`
  is a drift, a beetle's `death` rolls it onto its back).
- **Floating and wide bodies:** today `pnpm models:build` wants the
  lowest point on the ground and a 0.5 m reach at 1.8 m tall. Moira
  floats and Rime, Morrow and Sexton are wide, so each needs a written
  allowance in `scripts/models/contract.ts` (Gorrak's footprint
  allowance is the pattern) before its model can pass.
- **Read from above:** the board camera looks down at about 55°, from
  behind your own heroes. A long, narrow animal seen end-on reads as a
  standing person, so keep four-legged bodies low, splay the legs out
  past the body and sweep the tail to one side. The placeholder panther
  in `apps/client/src/game/views/hero-figures.ts` shows the pose.
- **Animation clips, named exactly** (lower case):

| Clip | Loops | Length | Notes |
| --- | --- | --- | --- |
| `idle` | yes | 2–4 s | weight shifts, weapon ready |
| `run` | yes | about 0.7 s per cycle | in place (no root motion) |
| `attack` | no | 0.5–0.8 s | the hit lands at 40% of the clip |
| `cast` | no | 0.6–1.0 s | the ability releases at 50% of the clip |
| `hit` | no | 0.2–0.4 s | small flinch, returns to idle pose |
| `death` | no | 0.8–1.5 s | ends lying still on the ground |
| `victory` | yes | 2–4 s | optional; a short cheer |
| `channel` | yes | 0.4–2 s | optional; held while a channelled ability runs (Gorrak's whirlwind). No root rotation: the game spins the figure itself |

**Getting there with AI tools:** generate the character with a
text-to-3D or image-to-3D tool in a T-pose or A-pose with empty hands
spread from the body if it struggles with weapons, auto-rig it (the
generator's own rigger, or Mixamo), and add the clips.
- Run `pnpm models:new heroes <id>` and import the model into the
  file's `<id>` collection.
- Rename the clips to the names above, assign the `team` material to
  the accent pieces, and check it faces −Y in Blender (+Z in the
  `.glb`).
- Run `pnpm models:build <id>`. It exports the `.glb` and lists
  anything that breaks this contract.

If a Blender MCP is connected to Claude, it can do those last steps.

**Style, shared by all:** stylised fantasy tabletop miniature come to
life, chunky proportions like a painted board-game figure, warm
hand-painted textures, a strong top-down silhouette. Each hero carries
its colour from `docs/lore.md` as a secondary accent; the white `team`
pieces carry the side colour. Summons follow the same contract, except
that the turret has no `run` clip.

**Prompt (fill in the look from the list below):**

```
Stylised low-poly fantasy game character, <LOOK>, chunky exaggerated
proportions like a painted tabletop miniature, warm hand-painted
texture, a plain white cloth sash or trim piece for the team colour,
neutral pose, full body, clean topology, game-ready, no base, no background.
```

**Looks:**

- `oathkeeper` (Morrow, the Oathkeeper): an ancient, gentle tortoise carrying her village's little wooden shrine on her shell, a gold sun-disc and a bell on the shrine, moss on the shell rim, warm gold (#f2d27a) accents; four stubby legs, a wide low silhouette.
- `duskblade` (Vesper, the Duskblade): a lean shadow panther, fur so dark it reads as a silhouette, violet (#b58cff) eyes and a ridge of violet shadow-flame along the spine, claws like curved daggers; four legs, pounce-ready.
- `frostweaver` (Rime, the Frostweaver): a small, calm ice dragon with pale frosted scales, crystal spines along her back, folded translucent wings and old, patient eyes, ice-blue (#9fe8ff) accents; four legs and wings, long tail.
- `blightmother` (Nettle, the Blightmother): a walking tree on splayed root legs, bark face with two glowing eyes, a leafy crown studded with sickly flowers, branch arms, sickly green (#8fd14f) accents.
- `bonecaller` (Sexton, the Bonecaller): a giant black burying beetle (a real "sexton beetle") with the two orange-red wing bands as the team pieces, clubbed antennae glowing pale teal (#9fe0d0), a grave-lantern hanging from his mandible and a spade strapped across his back; six legs.
- `clockwright` (Brassjack, the Clockwright): a walking clock tower on three brass legs, a big cream clock face for a face, a bell on top, a wrench and a hammer for hands, brass and copper (#e0a458) fittings.
- `thrall` (Thrall (Sexton's summon)): a small rattling skeleton warrior in rusted scraps of armour with a notched sword and a small round shield.
- `bone-golem` (Bone Golem (Sexton's summon)): a hulking heap of bones and skulls that stood up, massive arms, tiny skull head, twice the bulk of a hero.
- `turret` (Turret (Brassjack's summon)): a brass tripod turret with a round riveted body and a short rotating barrel; it never walks, so it needs only idle, attack, hit and death clips.

**Avoid:** realistic proportions, blue or red as a main colour (those are team colours), and weapons merged into the hand in a way that breaks the rig.

---

## 9. Board tiles and environment (3D)

**Used in:** the 3D board under every battle and the placement board.
Until these exist, the game draws plain bevelled tiles on a stone
plinth over a dark backdrop.

**Files to deliver:**

| File | What | Size in the model |
| --- | --- | --- |
| `apps/client/public/assets/models/board/tile.glb` | one board tile | 1 m × 1 m footprint, top face at y = 0, about 0.15 m thick |
| `apps/client/public/assets/models/board/tile-alt.glb` | the checkerboard partner tile | same |
| `apps/client/public/assets/models/board/frame.glb` | the raised border around the 8×8 board | inner edge exactly 8 m × 8 m, centred on the origin |
| `apps/client/public/assets/models/board/environment.glb` | optional scenery around the board | board area left empty, 8 m × 8 m at the origin, nothing taller than 0.5 m within 1 m of it |

The game scales 1 m to one board cell. Tiles must tile with no gaps:
bevels stay inside the 1 m footprint.

**Style:** a weathered stone game board in a small fantasy plaza at
dusk, like a tabletop diorama: pale warm flagstones for the tiles
(the game adds a subtle tint to your half and the enemy half, so keep
the tiles close to neutral), a darker carved stone frame with brass
corner caps, and scenery that frames the board without competing with
it (low walls, lanterns, a few trees, banners in the night palette
`#1f1c42` / `#3a366f` with gold `#e2bd5c` trim). Hand-painted, soft,
low contrast next to the heroes.

**Prompt — tile:**

```
Single square stone floor tile for a stylised fantasy board game, pale
warm grey flagstone with a slightly bevelled edge and a few shallow
chips, hand-painted texture, low-poly, top-down readable, game-ready,
isolated, no background.
```

**Prompt — environment:**

```
Stylised low-poly fantasy diorama, a small stone plaza at dusk around
an empty square game board, low crumbling walls, iron lanterns with
warm light, two leafy trees, hanging banners in deep indigo with gold
trim, hand-painted textures, tabletop miniature feel, soft and low
contrast, the centre of the plaza left completely empty and flat.
```

**Avoid:** anything tall near the board's edge (the camera looks over
the near side), bright saturated colours that compete with the heroes,
blue `#4ea1ff` or red `#ff6b6b` as a main colour, text or logos.

---

## 10. Combat effect textures

**Used in:** projectiles, hits, heals, shields and slows on the 3D
board. Until these exist, effects are drawn with plain glowing shapes.

**Files to deliver** (PNG, white shapes on a transparent background;
the game tints them and blends them additively):

| File | Size | What |
| --- | --- | --- |
| `apps/client/public/assets/fx/projectile.png` | 256×64 | a magic projectile streak, bright round core with a tapering tail, pointing right; tinted per ability (Frost Bolt, Firebolt, Grave Bolt, Spite Bolt, Thornshot) |
| `apps/client/public/assets/fx/spark.png` | 128×128 | a soft four-point hit star with a few specks |
| `apps/client/public/assets/fx/heal.png` | 128×128 | a small cluster of rising motes and a soft plus shape |
| `apps/client/public/assets/fx/shield-hex.png` | 512×512 | a hexagon lattice that tiles seamlessly in both directions |
| `apps/client/public/assets/fx/frost-ring.png` | 256×256 | a thin icy ring with small crystals, centred, for a slowed unit's feet |

**Prompt — shared style:**

```
Stylised game visual effect sprite, pure white glowing shape on a
transparent background, soft bloom falloff, hand-painted fantasy style,
clean readable silhouette at small size, no colour, no text.
```

Then describe the single effect from the table above.

**Avoid:** baked colour (the game tints), hard black backgrounds,
blurry noise that reads as dirt when small.

---

## 11. Combo trait icons (schools and conditions)

**Used in:** the combo system designed in
`docs/heroes-and-builds-design.md` §2: hero plates above each figure
(`apps/client/src/game/views/battle-view.ts`), the draft nameplates
(`apps/client/src/hud/draft.ts`), recruit offer cards
(`apps/client/src/hud/rewards.ts`), the COMBOS badge
grid in the right-hand panel and the combo tooltips
(`apps/client/src/hud/loadout.ts`, `apps/client/src/hud/tips.ts`), and
the condition badge above a unit's health bar in battle.

**Currently:** hand-drawn glyphs (`conditionIcon` and `schoolIcon` in
`apps/client/src/hud/icons.ts`) on tinted tiles.

**Files to deliver:**

| File | Size | Meaning |
| --- | --- | --- |
| `apps/client/public/assets/icons/traits/might.svg` | 24×24 viewBox | Might school (heavy physical) |
| `apps/client/public/assets/icons/traits/arcana.svg` | 24×24 viewBox | Arcana school (spells) |
| `apps/client/public/assets/icons/traits/cunning.svg` | 24×24 viewBox | Cunning school (precision, poison, tricks) |
| `apps/client/public/assets/icons/traits/staggered.svg` | 24×24 viewBox | the Staggered condition |
| `apps/client/public/assets/icons/traits/brittle.svg` | 24×24 viewBox | the Brittle condition |
| `apps/client/public/assets/icons/traits/disoriented.svg` | 24×24 viewBox | the Disoriented condition |

Displayed at 16 CSS px on plates, cards and the strip, and at about
22 CSS px in the battle condition badge. The game colours them through
`currentColor`: schools in `#eef0f6`, Staggered in `#ffa928`, Brittle in
`#9fe8ff`, Disoriented in `#b58cff`. The six silhouettes must be
recognisable with colour removed, since the combo strip has to read for
colour-blind players.

**Prompt:**

```
Minimal flat game icon set, six separate icons on a 24x24 pixel grid,
each centred on its own tile, solid white filled shapes on a transparent
background. 1) a chunky war hammer, head horizontal, short thick handle;
2) a four-pointed star with slightly concave sides; 3) a dagger pointing
straight up with a short crossguard; 4) a bold jagged zigzag crack, like
an impact fracture, three sharp teeth; 5) a six-spoked ice crystal with
short barbs on each spoke, chunky enough to read at 16px; 6) a bold
spiral of about one and a half turns. Identical optical weight across
all six, 1px rounded corners, pixel-snapped, no strokes thinner than
1.5px, crisp at 16px.
```

**Avoid:** outline-only icons, colour baked in (the game tints them),
gradients, circular or square backgrounds (the HUD draws the frames),
text, and a Disoriented spiral that looks like the stun stars in entry
12.

---

## 12. Status icons (buffs and debuffs above heads)

**Used in:** the status row on each unit plate above the health bar
(`apps/client/src/game/views/battle-view.ts`) and the unit inspector
card (`apps/client/src/hud/unit-inspector.ts`). Designed in
`docs/heroes-and-builds-design.md` §15.

**Currently:** hand-drawn glyphs (`statusIcon` in
`apps/client/src/hud/icons.ts`) on the status chips, one per status kind
the battle reports. Shields and slows aren't chips; they're drawn as
rings on the board.

**Files to deliver**, one per status kind the chips show today:

| File | Size | Meaning | Kind |
| --- | --- | --- | --- |
| `apps/client/public/assets/icons/status/invulnerable.svg` | 24×24 viewBox | takes no damage (Ice Block) | buff |
| `apps/client/public/assets/icons/status/untargetable.svg` | 24×24 viewBox | can't be targeted (Smoke) | buff |
| `apps/client/public/assets/icons/status/channeling.svg` | 24×24 viewBox | channelling a spin (Gorrak's Whirlwind) | buff |
| `apps/client/public/assets/icons/status/taunted.svg` | 24×24 viewBox | forced to attack one enemy | debuff |
| `apps/client/public/assets/icons/status/stunned.svg` | 24×24 viewBox | can't act | debuff |
| `apps/client/public/assets/icons/status/knocked-down.svg` | 24×24 viewBox | knocked off its feet, can't act | debuff |
| `apps/client/public/assets/icons/status/frozen.svg` | 24×24 viewBox | encased in ice, can't act | debuff |
| `apps/client/public/assets/icons/status/hexed.svg` | 24×24 viewBox | turned into a harmless critter (Moira's Hex) | debuff |
| `apps/client/public/assets/icons/status/linked.svg` | 24×24 viewBox | bound by Shared Fate, sharing damage with the other bound enemies | debuff |
| `apps/client/public/assets/icons/status/burn.svg` | 24×24 viewBox | burning, damage over time | debuff |
| `apps/client/public/assets/icons/status/poison.svg` | 24×24 viewBox | poisoned, damage over time | debuff |

**Later**, if they become chips: shield, guarded (an ally is taking part
of this unit's damage) and slowed.

Displayed at 14–16 CSS px in `#eef0f6`. The HUD draws the frame, round
for buffs and square for debuffs, plus the countdown wipe and stack
number, so the icons are glyphs only.

**Prompt:**

```
Minimal flat status-effect icon set for a fantasy auto-battler, eleven
separate icons on a 24x24 pixel grid, each centred on its own tile,
solid white filled shapes on a transparent background. 1) invulnerable:
a faceted diamond-shaped crystal shield; 2) untargetable: a hooded
figure silhouette dissolving into three wisps; 3) channeling: two axes
circling a centre point inside a curved motion arc; 4) taunted: a
crosshair with an exclamation mark at its centre; 5) stunned: three
small five-point stars in an arc; 6) knocked down: a heavy downward
arrow striking a flat ground line; 7) frozen: a chunky ice cube with
one crack; 8) hexed: a small sitting frog; 9) linked: two joined chain
links; 10) burn: a single bold flame; 11) poison: a single fat droplet
with a small bubble inside. Identical optical weight across the set,
pixel-snapped, 1px rounded corners, no strokes thinner than 1.5px,
crisp at 16px.
```

**Avoid:** frames or backgrounds (the HUD supplies them), colour baked
in, text, anything that repeats a silhouette from entry 11, especially
spirals.

---

## 13. Condition and combo effect textures

**Used in:** the 3D battle view. Conditions show as particles and rings
anchored at a unit's feet or head, combos as bursts, and crits get a
star behind the number. Designed in `docs/heroes-and-builds-design.md`
§15. These have to work on placeholder figures and future `.glb` models
alike, so none of them are mesh-specific. The Brittle frost tint and rim
on the figure is a shader, not a texture.

**Currently:** plain shapes in `apps/client/src/game/views/battle-view.ts`:
a coloured ring at the feet per condition, a ground ring and flash per
combo (`comboBurst`), and crits as a restyled damage number.

**Files to deliver** (PNG, white shapes on a transparent background; the
game tints them and blends them additively, like entry 10):

| File | Size | What |
| --- | --- | --- |
| `apps/client/public/assets/fx/brittle-shard.png` | 64×64 | one small angular ice shard, for particles clinging at chest height |
| `apps/client/public/assets/fx/stagger-ring.png` | 256×256 | a cracked ground-impact ring with small debris, centred, lies flat at the feet |
| `apps/client/public/assets/fx/disorient-wisp.png` | 256×256 | three curling wisps chasing each other around a centre, circling above the head |
| `apps/client/public/assets/fx/shatter-burst.png` | 256×256 | angular ice shards flying outward from the centre |
| `apps/client/public/assets/fx/overload-shock.png` | 256×256 | a crackling electric shockwave ring |
| `apps/client/public/assets/fx/crush-implode.png` | 256×256 | a ring collapsing inward, with streaks pointing to the centre |
| `apps/client/public/assets/fx/crit-star.png` | 128×128 | a sharp eight-point star-burst, behind big crit numbers |

**Prompt: shared style.** Use the same shared-style prompt as entry 10,
then describe the single effect from the table above.

**Avoid:** baked colour, anything that reads as blue team or red team
once tinted, soft blurry noise that turns to mud at small sizes, and any
lettering (combo names are rendered by the game).

---

## 21. Settings gear icon

**Used in:** the settings button pinned top-right on every screen and
the settings window it opens (`apps/client/src/hud/settings/`). The gear
is a 38×38 CSS px circle with the icon drawn at 20×20; tab and row icons
are drawn at 16–18 px.

**Currently:** a hand-written inline SVG placeholder (`gearIcon` in
`apps/client/src/hud/icons.ts`), plus hand-drawn speaker, music-note,
speech-bubble and close (×) glyphs for the window's tabs and volume
rows.

**Files to deliver:**

| File | Size | Meaning |
| --- | --- | --- |
| `apps/client/public/assets/icons/settings.svg` | 24×24 viewBox | open settings |
| `apps/client/public/assets/icons/volume.svg` | 24×24 viewBox | master volume |
| `apps/client/public/assets/icons/volume-muted.svg` | 24×24 viewBox | master muted |
| `apps/client/public/assets/icons/music.svg` | 24×24 viewBox | music volume |
| `apps/client/public/assets/icons/effects.svg` | 24×24 viewBox | sound-effects volume |
| `apps/client/public/assets/icons/voices.svg` | 24×24 viewBox | dialogue volume |
| `apps/client/public/assets/icons/close.svg` | 24×24 viewBox | close the settings window |

**Prompt:**

```
Minimal flat UI icon set for a strategy game's settings panel, six
separate icons on a 24x24 pixel grid: a gear with six chunky teeth and
a round hole, a speaker with two sound waves, the same speaker with a
small x instead of waves, a pair of beamed music notes, a crossed sword
and spark for sound effects, a speech bubble for voices. Solid white
fills on a transparent background, 1px rounded corners, identical
optical weight across the set, pixel-snapped, crisp at 16px.
```

**Avoid:** outlines-only styles, gradients, text labels, circular
button backgrounds (the HUD supplies the button).

---

## 22. Damage meter tab icons

**Used in:** the DAMAGE meter at the top right during fights
(`apps/client/src/hud/damage-meter.ts`). Four small tabs switch it
between damage dealt, damage taken, healing done and shields given.

**Currently:** inline glyphs in `meterIcon`
(`apps/client/src/hud/icons.ts`): a sword, a cracked heart, a plus and
a shield.

**Files to deliver:**

| File | Size | Meaning |
| --- | --- | --- |
| `apps/client/public/assets/icons/meter/dealt.svg` | 24×24 viewBox | damage dealt |
| `apps/client/public/assets/icons/meter/taken.svg` | 24×24 viewBox | damage taken |
| `apps/client/public/assets/icons/meter/healing.svg` | 24×24 viewBox | healing done |
| `apps/client/public/assets/icons/meter/shielding.svg` | 24×24 viewBox | shields given |

**Prompt:**

```
Minimal flat UI icon set for a strategy game's combat damage meter,
four separate icons on a 24x24 pixel grid: a short straight sword
pointing up-right for damage dealt, a heart split by a jagged crack for
damage taken, a chunky plus cross for healing, a rounded kite shield for
shields. Solid white fills on a transparent background, 1px rounded
corners, identical optical weight across the set, pixel-snapped, crisp
at 13px.
```

**Avoid:** outlines-only styles, gradients, text labels, circular
button backgrounds (the meter supplies the pill).

## 25. Hero redesign, slice 2: gem icons

**Used in:** the reward disc, the ITEMS panel, tooltips and the hero
cards. Until these exist each draws its SVG glyph, so nothing is broken.
Every icon follows `docs/icons.md`. The art session has the prompts;
they wait on the tablet-or-cut-gem decision in `docs/icons.md`.

**Gem icons** (`art/icons/gems/<id>.png`):

| Id | Glyph |
| --- | --- |
| `gem-barrage` | three arrows fanning out |
| `gem-pierce` | one arrow through three rings |
| `gem-concentrate` | a big circle squeezed into a small bright one |
| `gem-vortex` | a tight spiral with inward arrows |
| `gem-cast-on-dash` | a boot print with a spark burst |
| `gem-spellblade` | a sword with a small rune at its tip and four notches |
| `gem-ruthless` | a heavy fist with three stars |
| `gem-culling-strike` | a scythe over a nearly empty bar |

## 30. Brassjack's Mech Suit and turrets in 3D

**Nice to have** (3D model and animation work for the Blender side, not
the icon pipeline):

- **Mech Suit shell.** In the mech the client just scales Brassjack to
  1.3× and flashes brass plates around him. A brass war-frame model or
  overlay (rocket rack on one shoulder) would make the ultimate read at
  a glance.
- **Turret walk cycle.** With Walking Fortress the turrets follow him
  and currently slide; the tripod legs could step.
