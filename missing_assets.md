# Missing assets

Art, icons and audio the code currently fakes. Each entry lists the exact
files to deliver, their dimensions and format, where they'll be used, and
a ready-to-paste generation prompt. None of these block play; the game
works with its current glyphs, shapes and stand-in figures.

**How to deliver:** drop files at the listed path (Vite serves
`apps/client/public/` at the site root, so
`apps/client/public/assets/icons/play.svg` loads as `/assets/icons/play.svg`)
and say so — wiring them into the UI is a code change, not part of the
asset. The repo is public, so only CC0, CC-BY (credited) and MIT files
go into git (`docs/pivot-plan.md` §7.1). Sounds go through
`docs/audio.md`.

The Bone & Banner pivot (2026-09-28) retired the old heroes, items, gems,
levels and combo traits. Entries 11, 13 and 30 only served them and are
gone; all of it is at the `pre-pivot` tag. Entry 8 (hero bodies and
animations) is done: the heroes are KayKit models (`CREDITS.md`).

## Shared style guide

Applies to every entry below unless the entry says otherwise.

**Reference:** Dota Underlords (from a screenshot the user shared): the
board fills the screen, HUD panels float over it as compact, translucent,
icon-led chrome. Prompts below describe that look in words rather than
naming the game, because some generators refuse named-game styles.

**Art style:** chibi low-poly, matching the free KayKit packs the
heroes and arena come from (`docs/pivot-plan.md` §7): big heads on short
bodies, simple bold shapes, flat colours with soft shading, readable from
the board camera. 2D art sits beside that: bold and simple, flat or
softly painted, restrained glow. The first item icons came out as
glossy, glowing "premium mobile game" art, and the user rejected that
look. Describe the style rather than naming games; a named game's own art
leaks into the result.

**Palette** (the exact tokens in `apps/client/src/style.css`'s `@theme`
block; art should sit inside this world):

| Role                                        | Hex                                                                             | Where it appears today                    |
| ------------------------------------------- | ------------------------------------------------------------------------------- | ----------------------------------------- |
| Night (backdrop, deepest → lightest)        | `#0c0b1d` `#15132e` `#1f1c42` `#2b2858` `#3a366f`                               | page, panels, cards                       |
| Board backdrop                              | `#0c0b1d` (fading from `#3a366f` under the board)                               | behind the 3D board                       |
| Board tiles                                 | `#8f89a7` / `#7f7998`, tinted blue on your half and red on theirs               | the 8×8 board                             |
| Banner blue (brush strokes, primary button) | `#5a6bd0` `#3f4fb0` `#313d8c` `#26306e`                                         | banners, round action button              |
| Gold (rings, "you", victory)                | `#f7e3a3` `#e2bd5c` `#a97d2c` `#5e4214`                                         | portrait rings, highlights                |
| Stone (round-timer plate)                   | `#9a94ad` `#5d5873` `#312e40`                                                   | top-right plate                           |
| Lavender text                               | `#d6d2f0` `#b3add8` `#8b84bd`                                                   | labels, descriptions                      |
| White text / icons                          | `#eef0f6`                                                                       | titles, glyphs                            |
| Your side                                   | `#4ea1ff`                                                                       | your units, your name in battle           |
| Enemy side                                  | `#ff6b6b`                                                                       | enemy units, opponent highlight           |
| Heart (run health)                          | `#ff5d7a`                                                                       | hearts                                    |
| Heal / buff cues                            | `#4ade80` / `#60a5fa`                                                           | heal numbers and motes, buff status chips |
| Seat identity (8 players)                   | `#a6d93b` `#4aa8f0` `#9b73e6` `#ef7aa8` `#f2a33a` `#36c6b0` `#e5584f` `#e2bd5c` | portrait backgrounds                      |

**Fonts:** Lilita One for display text (titles, names, numbers,
buttons) and Barlow Condensed 600/700 for labels and descriptions. Both
are open-licence (OFL) and self-hosted via `@fontsource`, so they
aren't missing. Any art with lettering-like elements should feel at home
next to them.

**Hero glyphs** (2D art should echo them): the HUD marks each hero with
a glyph (`heroIcon` in `apps/client/src/hud/icons.ts`): the Paladin a
hammer, the Berserker crossed axes, the Firebrand a flame, the Bubble
Cleric a bubble, the Harpooner a harpoon and the Training Dummy a target.
No painted portraits are needed: the plan renders them from the KayKit
hero models (`docs/pivot-plan.md` §7.6).

**Rules for all image assets:**

- No text or numbers baked into any image — the game renders all text.
- sRGB. Transparent background unless the entry says otherwise.
- Don't make blue `#4ea1ff` or red `#ff6b6b` the dominant colour of
  anything that isn't team-specific; those two mean "your side" and
  "their side".
- Must read clearly at the listed display size on a dark background.
- No real-world religious figures or symbols. An early idol icon came
  out as a seated Buddha-like statue, so name an invented fantasy subject
  in the prompt.

**Readability at small sizes** (the user found some of the first icons
hard to read at 64 px):

- Bright or mid-toned objects with a strong light rim light. A dark
  object (indigo cloth, grey glass, black steel) sinks into a dark
  background.
- One bold silhouette with the identifying feature drawn oversized.
- No smoke, clouds, particles or effects spreading to the canvas edges;
  they swallow the object.
- Avoid thin diagonal shapes where a broad one works (swords, mirrors).

End every prompt for small art with this clause, then look at each result
at the size it's shown before keeping it:

```
It must read instantly when shrunk to 48 pixels on a dark navy
background: one bold, simple silhouette built from a few large shapes;
the object mostly bright and mid-toned with a strong light rim light so
it never sinks into a dark background; one saturated key colour on the
identifying feature, drawn oversized; very little fine texture or
engraving; no thin filigree; no small floating particles, sparks, debris
or wisps; nothing spreading to the edges of the canvas; any glow kept
tight to the object.
```

**Rules for all icons:**

- SVG, `viewBox="0 0 24 24"` (the grid every placeholder in
  `apps/client/src/hud/icons.ts` uses), solid filled shapes (no strokes
  thinner than 1.5 px), fill `currentColor` so CSS can recolour them.
- Pixel-snapped to the 24 px grid, 1 px corner rounding, consistent
  optical weight across the set, no gradients or shadows.
- Most image generators output raster, not SVG, including the one
  below. Either use a vector-capable generator or trace the output; the
  prompt describes the target either way.

**Generating the PNG entries** (entries 5 and 10, where no pack fits;
the old item icons and hero portraits were made this way):
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
  `max` and `auto`; the higher settings cost more, and medium held up for
  the old 84 px item icons.
- `background: "transparent"` returns real alpha, so no grey-screen
  cutout is needed.
- Sizes are 1024×1024, 1024×1536 and 1536×1024 only. Keep the master
  under `art/` (LFS) and resize a copy to the entry's size, keeping the
  alpha.
- The response carries no image bytes and no usage figures:
  `result.result.image` is a presigned R2 link that expires after a
  day, so download it straight away. Cost shows only in the Cloudflare
  dashboard.
- About 22 s per image; parallel requests work.

**Rules for 3D models** (entry 9; the renderer is Three.js):

- Heroes come from the KayKit packs through `pnpm models:import`
  (`scripts/models/import.ts`, `docs/pivot-plan.md` §7.6), and arena
  pieces should too. It replaces the old Blender build and check
  (`pnpm models:build`), which the pivot removed and which is at the
  `pre-pivot` tag. Its Blender sources for the crate and barrel props
  are still in `art/models/props/`; their GLBs went with the old loader.
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

| File                                               | Size          | Meaning                                |
| -------------------------------------------------- | ------------- | -------------------------------------- |
| `apps/client/public/assets/icons/play.svg`         | 24×24 viewBox | start playback                         |
| `apps/client/public/assets/icons/pause.svg`        | 24×24 viewBox | pause                                  |
| `apps/client/public/assets/icons/step.svg`         | 24×24 viewBox | advance one tick                       |
| `apps/client/public/assets/icons/reset.svg`        | 24×24 viewBox | restart the battle                     |
| `apps/client/public/assets/icons/replay.svg`       | 24×24 viewBox | replay last recording from the start   |
| `apps/client/public/assets/icons/fast-forward.svg` | 24×24 viewBox | playback speed (for the 0.5x–4x chips) |
| `apps/client/public/assets/icons/skip-to-end.svg`  | 24×24 viewBox | jump to the battle's final tick        |

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

| File                                             | Size          | Meaning                                 |
| ------------------------------------------------ | ------------- | --------------------------------------- |
| `apps/client/public/assets/icons/seat-bot.svg`   | 24×24 viewBox | bust silhouette for a baseline bot seat |
| `apps/client/public/assets/icons/seat-human.svg` | 24×24 viewBox | bust silhouette for a human seat        |
| `apps/client/public/assets/icons/heart-full.svg` | 24×24 viewBox | a remaining run-health point            |

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

**Used in:** every brush-stroke banner (the Victory / Defeat / Draw /
Bye / Eliminated result banners) and the stone round-timer plate
top-right. Both come from `apps/client/src/style.css` (`.brush-banner`,
`.round-plate-timer`).

**Currently:** CSS approximations. Banners are a gradient cut to a
jagged polygon (`clip-path`) with faint horizontal streaks, tinted blue,
gold, crimson or slate per mood. The stone plate is a grey gradient on
a slanted polygon. They read as the right idea, but not as real paint
or stone.

**Files to deliver:**

| File                                                  | Size        | Format                              | Used as                                                                  |
| ----------------------------------------------------- | ----------- | ----------------------------------- | ------------------------------------------------------------------------ |
| `apps/client/public/assets/textures/brush-stroke.png` | 1600×400 px | PNG, transparent, white only        | CSS `mask-image` for every banner, so one stroke serves all four colours |
| `apps/client/public/assets/textures/stone.png`        | 512×512 px  | PNG, greyscale, seamlessly tileable | overlay on the round plate, tinted in CSS                                |

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
preparing, round result, finished), and the full-screen battle view. The game
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

| File                                                          | Tempo   | Loop length      | Feel                             |
| ------------------------------------------------------------- | ------- | ---------------- | -------------------------------- |
| `apps/client/public/assets/audio/music-menu.ogg` / `.m4a`     | 96 BPM  | 32 bars (80 s)   | warm, inviting, "come play"      |
| `apps/client/public/assets/audio/music-planning.ogg` / `.m4a` | 104 BPM | 48 bars (≈111 s) | thoughtful, sly, relaxed tension |
| `apps/client/public/assets/audio/music-combat.ogg` / `.m4a`   | 132 BPM | 48 bars (≈87 s)  | driving, bouncy, still playful   |

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

## 9. Board tiles and environment (3D)

**Used in:** the 3D board under every battle and the placement board.
Until these exist, the game draws plain bevelled tiles on a stone
plinth over a dark backdrop.

**Files to deliver:**

| File                                                     | What                                   | Size in the model                                                                          |
| -------------------------------------------------------- | -------------------------------------- | ------------------------------------------------------------------------------------------ |
| `apps/client/public/assets/models/board/tile.glb`        | one board tile                         | 1 m × 1 m footprint, top face at y = 0, about 0.15 m thick                                 |
| `apps/client/public/assets/models/board/tile-alt.glb`    | the checkerboard partner tile          | same                                                                                       |
| `apps/client/public/assets/models/board/frame.glb`       | the raised border around the 8×8 board | inner edge exactly 8 m × 8 m, centred on the origin                                        |
| `apps/client/public/assets/models/board/environment.glb` | optional scenery around the board      | board area left empty, 8 m × 8 m at the origin, nothing taller than 0.5 m within 1 m of it |

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

**Used in:** hits, shots, fire, fuses, explosions, dust and heals on the
3D board (`apps/client/src/game/views/battle-effects.ts`,
`hit-effects.ts` and `particles.ts`).

**Currently:** particles drawn from procedural sprites, plus flashes and
rings built from plain shapes.

**Source first:** Kenney Particle Pack (CC0, `docs/pivot-plan.md` §7.4)
has slashes, sparks, smoke, flames and stars, and Kenney Smoke Particles
has single-frame smoke. Both need the user's go-ahead to download.
Generate only what they lack.

**Files to deliver** (PNG, white shapes on a transparent background;
the game tints them and blends them additively):

| File                                     | Size    | What                                                                           |
| ---------------------------------------- | ------- | ------------------------------------------------------------------------------ |
| `apps/client/public/assets/fx/spark.png` | 128×128 | a soft four-point hit star with a few specks, for every hit                    |
| `apps/client/public/assets/fx/slash.png` | 256×128 | a curved blade arc, for blade hits (the Berserker's axe, the Harpooner's hook) |
| `apps/client/public/assets/fx/flame.png` | 128×128 | one licking flame tongue, for burning heroes and embers                        |
| `apps/client/public/assets/fx/smoke.png` | 128×128 | a soft round puff, for explosions, dust and landings                           |
| `apps/client/public/assets/fx/ring.png`  | 256×256 | a cracked ground ring with debris, for the hammer slam and big landings        |
| `apps/client/public/assets/fx/heal.png`  | 128×128 | a small cluster of rising motes and a soft plus shape, for Safety Bubble heals |
| `apps/client/public/assets/fx/star.png`  | 64×64   | a small five-point star, for stun stars and crits                              |

**Prompt — shared style:**

```
Stylised game visual effect sprite, pure white glowing shape on a
transparent background, soft bloom falloff, hand-painted fantasy style,
clean readable silhouette at small size, no colour, no text.
```

Then describe the single effect from the table above.

**Avoid:** baked colour (the game tints), hard black backgrounds,
blurry noise that reads as dirt when small, anything that reads as blue
team or red team once tinted.

---

## 12. Status icons (above heads)

**Used in:** the status row on each unit plate above the health bar
(`apps/client/src/game/views/battle-view.ts`), the unit inspector card
(`apps/client/src/hud/unit-inspector.ts`) and the hero tooltips, which
show what each signature wants (`apps/client/src/hud/hero-card.ts`).

**Currently:** hand-drawn glyphs (`statusIcon` and `wantIcon` in
`apps/client/src/hud/icons.ts`), one per status in
`apps/client/src/hud/unit-status.ts`. Three wants (airborne, floating,
burning) share their status's glyph; only "grouped" has its own.

**Files to deliver:**

| File                                                       | Size          | Meaning                                                | Kind   |
| ---------------------------------------------------------- | ------------- | ------------------------------------------------------ | ------ |
| `apps/client/public/assets/icons/status/primed.svg`        | 24×24 viewBox | carries a lit Short Fuse and panics toward its friends | debuff |
| `apps/client/public/assets/icons/status/burning.svg`       | 24×24 viewBox | on fire, damage over time, spreads by touch            | debuff |
| `apps/client/public/assets/icons/status/floating.svg`      | 24×24 viewBox | trapped in a Big Bubble                                | debuff |
| `apps/client/public/assets/icons/status/airborne.svg`      | 24×24 viewBox | flying through the air                                 | debuff |
| `apps/client/public/assets/icons/status/downed.svg`        | 24×24 viewBox | knocked flat until it gets up                          | debuff |
| `apps/client/public/assets/icons/status/stunned.svg`       | 24×24 viewBox | seeing stars, can't act                                | debuff |
| `apps/client/public/assets/icons/status/rampage.svg`       | 24×24 viewBox | the Berserker's Rampage: giant and unstoppable         | buff   |
| `apps/client/public/assets/icons/status/safety-bubble.svg` | 24×24 viewBox | floating out of reach in a healing bubble              | buff   |
| `apps/client/public/assets/icons/status/grouped.svg`       | 24×24 viewBox | the "grouped" want: enemies bunched together           | want   |

Displayed at 14–16 CSS px in `#eef0f6`. The HUD draws the chip frame,
styled apart for buffs, so the icons are glyphs only.

**Prompt:**

```
Minimal flat status-effect icon set for a fantasy auto-battler, nine
separate icons on a 24x24 pixel grid, each centred on its own tile,
solid white filled shapes on a transparent background. 1) primed: a
round cartoon bomb with a short lit fuse; 2) burning: a single bold
flame; 3) floating: a round bubble with a curved highlight; 4) airborne:
a bold upward arrow lifting off a short ground line; 5) downed: a heavy
downward arrow striking a flat ground line; 6) stunned: three small
five-point stars in an arc; 7) rampage: a clenched fist with three short
growth lines around it; 8) safety bubble: a bubble with a small plus
inside; 9) grouped: three small round heads huddled together. Identical
optical weight across the set, pixel-snapped, 1px rounded corners, no
strokes thinner than 1.5px, crisp at 16px.
```

**Avoid:** frames or backgrounds (the HUD supplies them), colour baked
in, text, and a floating bubble that could pass for the safety bubble.

---

## 21. Settings gear icon

**Used in:** the settings button pinned top-right on every screen and
the settings window it opens (`apps/client/src/hud/settings/`). The gear
is a 38×38 CSS px circle with the icon drawn at 20×20; tab and row icons
are drawn at 16–18 px.

**Currently:** a hand-written inline SVG placeholder (`gearIcon` in
`apps/client/src/hud/icons.ts`), plus hand-drawn speaker, music-note and
close (×) glyphs for the window's tabs and volume
rows.

**Files to deliver:**

| File                                               | Size          | Meaning                   |
| -------------------------------------------------- | ------------- | ------------------------- |
| `apps/client/public/assets/icons/settings.svg`     | 24×24 viewBox | open settings             |
| `apps/client/public/assets/icons/volume.svg`       | 24×24 viewBox | master volume             |
| `apps/client/public/assets/icons/volume-muted.svg` | 24×24 viewBox | master muted              |
| `apps/client/public/assets/icons/music.svg`        | 24×24 viewBox | music volume              |
| `apps/client/public/assets/icons/effects.svg`      | 24×24 viewBox | sound-effects volume      |
| `apps/client/public/assets/icons/close.svg`        | 24×24 viewBox | close the settings window |

**Prompt:**

```
Minimal flat UI icon set for a strategy game's settings panel, five
separate icons on a 24x24 pixel grid: a gear with six chunky teeth and
a round hole, a speaker with two sound waves, the same speaker with a
small x instead of waves, a pair of beamed music notes, and a crossed
sword and spark for sound effects. Solid white
fills on a transparent background, 1px rounded corners, identical
optical weight across the set, pixel-snapped, crisp at 16px.
```

**Avoid:** outlines-only styles, gradients, text labels, circular
button backgrounds (the HUD supplies the button).

---

## 22. Damage meter tab icons

**Used in:** the damage meter in the team rail during fights
(`apps/client/src/hud/damage-meter.ts`). Three small tabs switch it
between damage dealt, damage taken and healing done.

**Currently:** inline glyphs in `meterIcon`
(`apps/client/src/hud/icons.ts`): a sword, a cracked heart and a plus.

**Files to deliver:**

| File                                                | Size          | Meaning      |
| --------------------------------------------------- | ------------- | ------------ |
| `apps/client/public/assets/icons/meter/dealt.svg`   | 24×24 viewBox | damage dealt |
| `apps/client/public/assets/icons/meter/taken.svg`   | 24×24 viewBox | damage taken |
| `apps/client/public/assets/icons/meter/healing.svg` | 24×24 viewBox | healing done |

**Prompt:**

```
Minimal flat UI icon set for a strategy game's combat damage meter,
three separate icons on a 24x24 pixel grid: a short straight sword
pointing up-right for damage dealt, a heart split by a jagged crack for
damage taken, and a chunky plus cross for healing. Solid white fills on a transparent background, 1px rounded
corners, identical optical weight across the set, pixel-snapped, crisp
at 13px.
```

**Avoid:** outlines-only styles, gradients, text labels, circular
button backgrounds (the meter supplies the pill).

---

## 31. Signature and physics sounds

**Used in:** the battle view, through `sound-map.ts` and
`battle-sounds.ts` (`docs/audio.md`, "Adding a sound for a hero or
signature").

**Currently:** these beats are silent, or borrow a sound: the hammer
slam, the fuse blast and the Rampage's last heave play `crit-heavy`,
and the yank plays `hit-blade`. The Rampage's stomps and deflate are
silent. His five heaves come within half a second, under
`rampage-roar`, so they don't need their own sound.

**Files to deliver:** takes in `art/audio/sfx/<id>-<n>.mp3`, processed
to mono `apps/client/public/assets/audio/<id>.mp3` as `docs/audio.md`
describes. Every prompt ends with that doc's stone-arena clause.

| Id                | Plays on (engine event)                                        | Length | Prompt (before the clause)                                                                  |
| ----------------- | -------------------------------------------------------------- | ------ | ------------------------------------------------------------------------------------------- |
| `hammer-rise`     | the Paladin winding up Hammerfall (`signature`)                | 1 s    | a giant iron hammer dragged up off a stone floor and hoisted overhead, a rising metal groan |
| `hammer-slam`     | the hammer landing (`hammer-impact`)                           | 1 s    | a giant iron hammer slamming into a stone floor, a deep crack and crumbling debris          |
| `launch-whoosh`   | a hero thrown into the air (`launch`)                          | 0.6 s  | a heavy armoured body flung upward, a short rising whoosh of cloth and metal                |
| `grab`            | the Berserker grabbing a hero to throw (`grab`)                | 0.5 s  | a huge hand clamping onto leather armour, a rough grab and a creak                          |
| `rampage-roar`    | the Berserker growing huge (`rampage`, `grow`)                 | 1.2 s  | a huge barbarian's deep, furious, wordless battle roar                                      |
| `rampage-stomp`   | the grown Berserker's stride (the view's, not an engine event) | 0.4 s  | a giant's bare foot stamping on a stone floor, a deep thud and a rattle of grit             |
| `rampage-deflate` | the Berserker shrinking back (`rampage`, `shrink`)             | 0.8 s  | a huge balloon deflating, a long comic rubbery squeal ending in a puff of air               |
| `bubble-blow`     | a Big Bubble or Safety Bubble forming (`bubble`)               | 0.8 s  | a huge soap bubble being blown up, a wet stretching wobble swelling outward                 |
| `bubble-pop`      | a bubble popping (`pop`)                                       | 0.5 s  | a huge soap bubble bursting with a wet splash and a spray of droplets                       |
| `fuse-hiss`       | Short Fuse lit on a hero (`prime`)                             | 1.5 s  | a thick black-powder fuse lit and fizzing, crackling sparks                                 |
| `fuse-blast`      | the fuse going off (`explode`)                                 | 1 s    | a black-powder bomb exploding, a sharp boom and pattering debris                            |
| `ignite`          | a hero catching fire (`ignite`)                                | 0.6 s  | cloth catching fire with a sudden whoomph of flame                                          |
| `chain-rattle`    | the Harpooner reeling a hero in (`yank`)                       | 0.8 s  | a heavy iron chain whipping out and rattling taut as it is hauled back                      |
| `combo-sting`     | a combo link landing (`combo-link`)                            | 1 s    | a heavy war drum hit under a bright brass stab, one short triumphant accent                 |

`rampage-roar` is the one sound with a voice: drop `no voice` from its
clause and keep it wordless. `combo-sting` is a stinger, so encode it
stereo.

## Mags and Burr

Mags reuses the KayKit mage body with the staff and a recolour, and Burr
reuses the knight body with the staff. Neither has its own prop or sound
yet.

**Props to model:** `magnet` (a chunky horseshoe magnet, Mags's right
hand) and `snow-broom` (a wide bristled broom, Burr's right hand). Same
low-poly KayKit style, textured from the `weaponsBits` atlas.

**Sounds** (same delivery and stone-arena clause as the table above):

| Id            | Plays on (engine event)                       | Length | Prompt (before the clause)                                                            |
| ------------- | --------------------------------------------- | ------ | ------------------------------------------------------------------------------------- |
| `magnet-pull` | Collection Day dragging enemies in (`pull`)   | 0.8 s  | a huge magnet snapping on, scrap metal scraping across stone toward it in a rush      |
| `freeze-over` | Everybody Settle Down freezing units (`freeze`) | 0.8 s  | a sudden gust of wind and ice crystallising over a body with a crackling glassy sheen |
| `ice-shatter` | a frozen unit shattering (`shatter`)          | 0.6 s  | a block of ice smashed by a hammer, a sharp crack and a spray of tinkling shards      |

**Effect art:** an ice-block shell drawn over frozen units (a translucent
pale-blue chunky mesh, scaled to the body radius) and a short magnet-line
particle streak for each `pull` event.
