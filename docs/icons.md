# Icons: where they live and how they reach the game

Painted icons (items, gems, level picks) and hero portraits have one
master PNG and one runtime WebP each. Every hero has two: a portrait
bust and a head crop ("face") for small spots. The master is what you
replace or regenerate. The WebP is what the game loads, always rebuilt
from the master with one command, never edited by hand. Every item,
gem, level pick and hero has art (43, 29, 60 and 10). The palette, art
style and readability rules they follow are in `missing_assets.md`'s
style guide; the prompts are below. `pnpm icons:check` enforces the
runtime side.

## Where things live

| Path | What | Git |
| --- | --- | --- |
| `art/icons/<kind>/<id>.png` | Master, one per icon: a square PNG with alpha, 512 px (faces 256 px). `kind` is `items`, `gems`, `levels`, `heroes` or `faces`; `id` is the content id (`frost-brand`, `pyro-heavy-meteor`, `bulwark`) | LFS |
| `art/icons/prompts.json` | The exact prompt, model and settings behind every master, and the crop box behind every face | plain |
| `apps/client/src/assets/icons/<kind>/<id>.webp` | Runtime icon, written by `pnpm icons:build` | plain |
| `apps/client/src/hud/icon-art.ts` | Finds the runtime icons and hands out `<img>` elements | plain |
| `scripts/icons/*.ts` | `icons:build`, `icons:check`, and the numbers in `contract.ts` | plain |

Masters go through Git LFS with the rest of `art/` (`.gitattributes`).
Runtime WebPs stay in plain git: icons are about 10 KB each, 1 MB for
the whole set, and the portraits and faces add about 390 KB.

## Commands

```bash
pnpm icons:build frost-brand
```

Converts that master (or every master, with no id) to a WebP at its
kind's size with cwebp, then checks the results. A hero id
(`pnpm icons:build bulwark`) builds both its portrait and its face. It
needs cwebp (`brew install webp`); set `CWEBP_PATH` if it isn't on the
`PATH`.

```bash
pnpm icons:check
```

Checks every runtime icon and prints how many ids have art. It doesn't
need cwebp. It reads ids from `@jev-game/content`'s built `dist`, so
after adding an item, gem, level pick or hero, run `pnpm build` first or
the check reports the new id as unknown.

## Adding or replacing an icon

1. Write a one-line description of the object (items), glyph (gems) or
   moment (level picks), and fill it into the matching template below.
2. Generate it through Cloudflare (the call is in `missing_assets.md`,
   "Generating the PNG entries") at medium quality, 1024×1024, with a
   transparent background.
3. Look at it at 64 px and 32 px on a dark navy disc before keeping it.
   The reward disc shows art at 62 px, and the full-size image hides
   problems. Common failures: a dark object that sinks into the disc, a
   thin diagonal shape, and effects or smoke filling the whole square.
   Also check neither team colour (`#4ea1ff`, `#ff6b6b`) dominates.
4. Save the master at 512 px under the content id:
   `sips -z 512 512 download.png --out art/icons/items/<id>.png`.
5. Add its prompt to `art/icons/prompts.json`.
6. Run `pnpm icons:build <id>`, then delete the id's glyph case in
   `apps/client/src/hud/icons.ts` if it has one (gems keep theirs; see
   "Gem sockets" below).

The game picks the new file up on the next build or dev reload.

## Adding or replacing a hero portrait

1. Write the hero's "who they are" line (see the portrait template
   below) and generate it the same way, at medium quality, 1024×1024,
   transparent.
2. Look at it on the role colour at 116 px, 84 px and, cropped to the
   head, 42 px and 28 px. Check its head doesn't share a silhouette with
   another hero's, and that neither team colour dominates. Also check it
   in the tooltip card's art band, which shows the top of a 180 px bust:
   the head (or eye, or dial) has to sit in the upper half.
3. Save the bust: `sips -z 512 512 download.png --out art/icons/heroes/<id>.png`.
4. Pick a square box around the head in the 512 px master that keeps
   the signature feature (Anvil's helm, Gorrak's horns, Rime's crystal
   spines, Moira's eye, Brassjack's dial and bell, Sexton's antennae)
   and leaves some margin. Crop it and save it at 256 px:
   `sips -c <size> <size> --cropOffset <y> <x> art/icons/heroes/<id>.png --out face.png`,
   then `sips -z 256 256 face.png --out art/icons/faces/<id>.png`.
5. In `art/icons/prompts.json`, add the prompt to `icons["heroes/<id>"]`
   and the box to `crops["faces/<id>"]` as
   `{ "from": "heroes/<id>", "x": …, "y": …, "size": … }`.
6. Run `pnpm icons:build <id>`.

## Prompts

The style is mature cartoon, like Dota Underlords and Dungeon Defenders:
chunky, hand-painted, weathered, restrained glow. The prompts describe
it in words; naming the games risks copying their own item art. Each
template ends with a readability clause. Keep it: the first icons made
without it were hard to read at 64 px.

**Items** (the Shows line names one object, chunky and worn: thick rims,
oversized rivets, fat blades):

```
Fantasy game item icon, a single object centred on a transparent
background. Mature stylised cartoon illustration with bold confident
brushwork, chunky exaggerated proportions, simple graphic shapes and a
subtle dark outline, hand-painted colour with soft shading, grounded and
slightly weathered rather than cute or glossy, restrained glow. Soft
top-left light, no frame, no text. The object: <SHOWS>. It must read
instantly when shrunk to 48 pixels on a dark navy background: one bold,
simple silhouette built from a few large shapes; the object mostly
bright and mid-toned with a strong light rim light so it never sinks
into a dark background; one saturated key colour on the identifying
feature, drawn oversized; very little fine texture or engraving; no thin
filigree; no small floating particles, sparks, debris or wisps; nothing
spreading to the edges of the canvas; any glow kept tight to the object.
The object fills 80% of the square canvas.
```

**Gems** (every gem is the same cut gemstone and the colour says its
kind: `<COLOUR>` is "warm amber topaz" for the 8 trigger gems and "rich
emerald green" for every other gem. Only the glyph changes, so keep it
one bold symbol, and check it at 32 px beside gems of the same colour):

```
Fantasy gem icon, one chunky cut gemstone centred on a transparent
background: a thick rounded hexagonal gem with a broad flat table facet
on top and a ring of a few large bevelled facets around it, no mount or
setting. The gem is <COLOUR>, translucent with a soft inner glow, and
one big bold glyph is inlaid in glowing white-gold light across its
flat table facet. Mature stylised cartoon illustration with bold
confident brushwork, chunky proportions, simple graphic shapes and a
subtle dark outline, hand-painted colour with soft shading, grounded
and slightly weathered rather than glossy, no text, no letters, no
real-world runic alphabet. The glyph shows: <SHOWS>. It must read
instantly when shrunk to 48 pixels on a dark navy background: the glyph
is thick, simple and fills most of the table facet; the gem is
mid-to-light toned with a strong light rim light; only a few large
facets; no fine sparkle, glints, particles or small details. The gem
fills 80% of the square canvas.
```

**Level picks** (describe the moment, not the pick's text: quoted numbers
like "25% more damage" get lettered into the image, and naming the hero
invites a portrait. When the moment is a creature silhouette, like
Vesper's panther, change "no characters" to "no people", and ask for
claw slashes thick and glowing. When it needs a person, like Gorrak's
leap or soldiers frozen in Rime's ice, change it to "the figure seen
whole, no close-up of a face" or "the figures seen whole, no close-ups
of faces". Put each hero's six picks side by side at 32 px before
keeping them: two whirlwind rings or two explosions read as the same
pick, and the fix is a new silhouette, like a funnel or a clock at
midnight, not a new detail):

```
Fantasy ability icon, a single bold emblem centred on a transparent
background, painted in a bold stylised hand-painted style with a subtle
dark outline. The moment: <SHOWS>. Strong silhouette, dramatic
lighting, no characters, no text, no frame. It must read instantly when
shrunk to 48 pixels on a dark navy background: one bold, simple shape
built from a few large forms; mostly bright and saturated with a strong
rim light so it never sinks into a dark background; the key element
oversized; very little fine texture; no small scattered particles,
sparks, debris or motes; no smoke, clouds or effects spreading to the
edges of the canvas; any glow kept tight to the emblem. The emblem fills
80% of the square canvas.
```

**Human hero portraits** (Anvil, Cinder, Gorrak. The Who line names the
character, one signature feature drawn oversized for small sizes, the
rim-light colour, and for a hero with a 3D model, what the model looks
like; the per-hero lines are in `prompts.json`):

```
Stylised fantasy game hero portrait, a close head-and-shoulders bust in
three-quarter view facing right, centred on a transparent background,
the shoulders cropped by the bottom edge of the canvas. Mature stylised
cartoon illustration with bold confident brushwork, chunky exaggerated
proportions, simple graphic shapes and a subtle dark outline,
hand-painted colour with soft shading, grounded and slightly weathered
rather than cute or glossy. The face is characterful and a little
exaggerated, never glamorous, doll-like or anime-style. The hero: <WHO>.
It must read instantly when shrunk to 48 pixels on a dark navy
background: the head is large, about half the height of the canvas; one
bold, oversized signature feature makes the hero recognisable from
silhouette alone; the figure is mostly bright and mid-toned with a
strong rim light in the hero's colour so it never sinks into a dark
background; very little fine texture; no background scenery, no
floating particles, no smoke, no weapons or effects spreading to the
edges of the canvas. No text, no frame, no border.
```

The "characterful face" sentence came after the first Rime, made
without it, looked glossy and pretty next to the chunky Anvil and
Vesper.

**Creature hero portraits** (the other seven: panther, tortoise, ice
dragon, eye, tree, beetle, clock. `<FOCUS>` is what stands in for the
head: "the head", "the eye" for Moira, "the clock face" for Brassjack):

```
Stylised fantasy game creature portrait, a close portrait of the head
and upper body in three-quarter view facing right, centred on a
transparent background, the body cropped by the bottom edge of the
canvas. Mature stylised cartoon illustration with bold confident
brushwork, chunky exaggerated proportions, simple graphic shapes and a
subtle dark outline, hand-painted colour with soft shading, grounded and
slightly weathered rather than cute or glossy. The face is characterful
and a little exaggerated, never glamorous, doll-like or anime-style, and
the creature is not cute, not a mascot and not a plush toy. The hero:
<WHO>. It must read instantly when shrunk to 48 pixels on a dark navy
background: <FOCUS> is large and sits in the upper half of the canvas,
about half the canvas height; one bold, oversized signature feature
makes the hero recognisable from silhouette alone; the figure is mostly
bright and mid-toned with a strong rim light in the hero's colour so it
never sinks into a dark background; very little fine texture; no
background scenery, no floating particles, no smoke, no weapons or
effects spreading to the edges of the canvas. No text, no numerals, no
frame, no border.
```

What the Who lines had to spell out:
- **Dark bodies.** Vesper's panther and Sexton's beetle are painted in
  mid-tone plum and slate with a strong rim light, never black on
  black, and Sexton's lantern lights his face from below.
- **No team red.** Sexton's orange-red wing bands are team pieces on
  his 3D model, so the portrait leaves them out.
- **A dial with no numerals.** Brassjack's clock face has plain tick
  marks only. His character comes from lamp eyes and hands swept up
  like a moustache.
- **Invented shrines.** Morrow's shrine is described as an invented
  fantasy shrine with no real-world religious architecture or symbols.

Colour conventions the existing set follows:
- **Condition primers.** The three Primer gems glow in their
  condition's colour instead of white-gold: Staggered orange, Brittle
  pale ice, Disoriented violet.
- **Schools.** Prism of Three and Resonance use the HUD's school colours
  (`#ff7d66` Might, `#7fb4ff` Arcana, `#7fe0a6` Cunning).
- **Heroes.** Level picks lean on their hero's colour (`--color-role-*` in
  `style.css`), and each portrait's rim light is that colour.
- **Frost.** Frost art is "pale icy white and aqua", never "blue", so it
  stays clear of the your-side `#4ea1ff`.
- **No real-world religious figures.** The first Glass Idol came out
  Buddha-like; it's now an invented imp.
- **Moira is magenta-pink.** Her thread knot came out a warmer
  magenta than her violet-magenta role colour; it still reads clear of
  the their-side red.

## The runtime contract

Rules the check enforces, from `scripts/icons/contract.ts`:

- **Size.** Icons are exactly 192×192. The biggest place an icon
  appears is the reward disc at 62 CSS px, so 192 covers a 3× phone
  screen. Portraits are 320×320; the biggest is the hero tooltip card's
  180 px bust. Faces are 128×128 for spots of 42 CSS px and less.
- **Alpha.** Transparent background; the HUD draws the discs, sockets
  and rarity rings.
- **Weight.** Icons at most 20 KB, portraits 48 KB, faces 12 KB. WebP
  at quality 85 (alpha at 90) lands at 7–14 KB for icons, 17–44 KB for
  portraits (Nettle's leaves are the heaviest) and 5–10 KB for faces.
  The 256 px PNG icons they replaced were 65–115 KB.
- **Ids.** Each file's id must be an item, gem or level pick in
  `packages/content`, in the matching folder. Portraits and faces take
  hero ids; summons (thralls, golems, turrets) have none.
- **Masters.** A runtime icon without a master can't be rebuilt, so the
  check warns about it; a master that isn't built yet gets a warning
  too.

## How the game loads icons

1. **Discovery.** `icon-art.ts` uses Vite's `import.meta.glob` over
   `src/assets/icons/*/*.webp` with `eager: true` and the `?no-inline`
   query. That imports only each file's URL, about 50 bytes per icon in
   the main bundle, never the image itself. `?no-inline` stops Vite from
   turning a small icon into base64 inside the JS (tested with a 216-byte
   probe, which still shipped as its own file).
2. **No catalogue.** Unlike models and audio, which list their files in
   a catalogue under `public/`, icons are found by the glob. Dropping a
   file in is the whole registration, and a missing file can't cause a
   404, because the game only knows about files that exist.
3. **Hashed URLs.** In a production build each icon is emitted as its
   own file with a content hash (`aegis-B4BValDb.webp`), so browsers can
   cache it forever and a changed icon gets a new URL.
4. **On demand.** Nothing preloads. An icon downloads the first time
   something draws it (a reward row, an item socket, a tooltip), about
   10 KB each, and is cached after that. The whole set is about 1 MB,
   spread across a run.
5. **Fallback.** `pieceArt(pieceId, kind)` and `levelArt(pickId)`
   return an `<img class="icon-art">` when the id has art and the
   hand-drawn SVG glyph from `icons.ts` otherwise, so a new item, gem
   or level pick without art yet still draws something.
6. **Gem sockets keep their glyphs.** `pieceSocketArt` (used by the
   ITEMS panel) draws item art in the round item sockets but the SVG
   glyph in the 16 px gem diamonds. Gems share one cut gemstone in two
   colours, so at 12 px painted gems of the same kind can't be told
   apart, while the glyphs can. That's why the gem glyph cases in `icons.ts` stay.
   Gem art shows in the reward disc and the gem tooltips.
7. **Sizes.** `.icon-art` is 62 px in the reward disc (50 px on short
   screens), 24 px in item sockets and 32 px in tooltip headers
   (`style.css`).
8. **Heroes.** `heroArt(heroId)` gives an `<img class="hero-art">`
   bust, and `heroFaceArt(heroId)` gives an `<img class="face-art">`
   head crop. Both fall back to the hero's SVG glyph (`roleIcon`), so a
   summon or a new hero still draws something.
   - The bust is used on the recruit reward disc (84 px) and the hero
     tooltip card and unit inspector. On those cards the bust is 180 px (144 px
     in the live inspector), centred in the wide art band, so the whole
     head shows for every hero, crests, horns and antennae included.
   - The face fills the ITEMS panel portrait (42 px), tooltip header
     icons (38 px), the reward role chips (24–34 px) and the damage
     meter rows (28 px).
   - The glyph stays in the 18 px hero name chips and the small corner
     badges on level and train rewards. Faces are unreadable at 18 px.
