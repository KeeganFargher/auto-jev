# Icons: where they live and how they reach the game

Painted icons (items, runes, talents) and hero portraits have one
master PNG and one runtime WebP each. Every hero has two: a portrait
bust and a head crop ("face") for small spots. The master is what you
replace or regenerate. The WebP is what the game loads, always rebuilt
from the master with one command, never edited by hand. Every item,
rune, talent and hero has art today (27, 19, 60 and 10). The palette,
art style and readability rules they follow are in `missing_assets.md`'s
style guide; the prompts are below. `pnpm icons:check` enforces the
runtime side.

## Where things live

| Path | What | Git |
| --- | --- | --- |
| `art/icons/<kind>/<id>.png` | Master, one per icon: a square PNG with alpha, 512 px (faces 256 px). `kind` is `items`, `runes`, `talents`, `heroes` or `faces`; `id` is the content id (`frost-brand`, `pyro-heavy-meteor`, `bulwark`) | LFS |
| `art/icons/prompts.json` | The exact prompt, model and settings behind every master, and the crop box behind every face | plain |
| `apps/client/src/assets/icons/<kind>/<id>.webp` | Runtime icon, written by `pnpm icons:build` | plain |
| `apps/client/src/hud/icon-art.ts` | Finds the runtime icons and hands out `<img>` elements | plain |
| `scripts/icons/*.ts` | `icons:build`, `icons:check`, and the numbers in `contract.ts` | plain |

Masters go through Git LFS with the rest of `art/` (`.gitattributes`).
Runtime WebPs stay in plain git: icons are about 10 KB each, 1 MB for
the whole set, and the portraits and faces add 330 KB.

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
after adding an item, rune, talent or hero, run `pnpm build` first or
the check reports the new id as unknown.

## Adding or replacing an icon

1. Write a one-line description of the object (items), glyph (runes) or
   moment (talents), and fill it into the matching template below.
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
   `apps/client/src/hud/icons.ts` if it has one (runes keep theirs; see
   "Rune sockets" below).

The game picks the new file up on the next build or dev reload.

## Adding or replacing a hero portrait

1. Write the hero's "who they are" line (see the portrait template
   below) and generate it the same way, at medium quality, 1024×1024,
   transparent.
2. Look at it on the role colour at 116 px, 84 px and, cropped to the
   head, 42 px and 28 px. Check it doesn't share a silhouette with
   another hero (only Vesper wears a hood) and that neither team colour
   dominates.
3. Save the bust: `sips -z 512 512 download.png --out art/icons/heroes/<id>.png`.
4. Pick a square box around the head in the 512 px master that keeps the
   signature headgear (helm, halo, horns, crown, hat, goggles) and
   leaves some margin. Crop it and save it at 256 px:
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

**Runes** (every rune is the same pale stone tablet; only the glyph
changes, so keep it one bold symbol):

```
Fantasy rune icon, a chunky hexagonal tablet of pale weathered grey
stone centred on a transparent background, with one big bold glyph
deeply carved into its face and filled with bright warm gold light.
Mature stylised cartoon illustration with bold confident brushwork,
simple graphic shapes and a subtle dark outline, hand-painted colour
with soft shading, no text, no letters, no real-world runic alphabet.
The glyph shows: <SHOWS>. It must read instantly when shrunk to 48
pixels on a dark navy background: the glyph is thick, simple and fills
most of the tablet face; the stone is light-toned with a strong rim
light; no fine engraving, cracks or small details. The tablet fills 80%
of the square canvas.
```

**Talents** (describe the moment, not the talent's text: quoted numbers
like "25% more damage" get lettered into the image, and naming the hero
invites a portrait):

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

**Hero portraits** (the Who line names the character, one signature
feature drawn oversized for small sizes, the rim-light colour, and for
a hero with a 3D model, what the model looks like; the per-hero lines
are in `prompts.json`):

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

Colour conventions the existing set follows:
- **Condition primers.** The three Primer runes glow in their
  condition's colour instead of gold: Staggered orange, Brittle pale
  ice, Disoriented violet.
- **Schools.** Prism of Three and Resonance use the HUD's school colours
  (`#ff7d66` Might, `#7fb4ff` Arcana, `#7fe0a6` Cunning).
- **Heroes.** Talents lean on their hero's colour (`--color-role-*` in
  `style.css`), and each portrait's rim light is that colour.
- **Frost.** Frost art is "pale icy white and aqua", never "blue", so it
  stays clear of the your-side `#4ea1ff`.
- **No real-world religious figures.** The first Glass Idol came out
  Buddha-like; it's now an invented imp.

## The runtime contract

Rules the check enforces, from `scripts/icons/contract.ts`:

- **Size.** Icons are exactly 192×192. The biggest place an icon
  appears is the reward disc at 62 CSS px, so 192 covers a 3× phone
  screen. Portraits are 320×320; the biggest is the hero tooltip card's
  180 px bust. Faces are 128×128 for spots of 42 CSS px and less.
- **Alpha.** Transparent background; the HUD draws the discs, sockets
  and rarity rings.
- **Weight.** Icons at most 20 KB, portraits 40 KB, faces 12 KB. WebP
  at quality 85 (alpha at 90) lands at 7–14 KB for icons, 17–38 KB for
  portraits and 5–9 KB for faces. The 256 px PNG icons they replaced
  were 65–115 KB.
- **Ids.** Each file's id must be an item, rune or talent in
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
5. **Fallback.** `pieceArt(pieceId, kind)` and `talentArt(talentId)`
   return an `<img class="icon-art">` when the id has art and the
   hand-drawn SVG glyph from `icons.ts` otherwise, so a new item, rune
   or talent without art yet still draws something.
6. **Rune sockets keep their glyphs.** `pieceSocketArt` (used by the
   ITEMS panel) draws item art in the round item sockets but the SVG
   glyph in the 16 px rune diamonds. Every rune shares the same pale
   stone tablet, so at 12 px painted runes can't be told apart, while
   the glyphs can. That's why the rune glyph cases in `icons.ts` stay.
   Rune art shows in the reward disc and the rune tooltips.
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
     head shows for every hero, even the ones with tall hats.
   - The face fills the ITEMS panel portrait (42 px), tooltip header
     icons (38 px), the reward role chips (24–34 px) and the damage
     meter rows (28 px).
   - The glyph stays in the 18 px hero name chips and the small corner
     badges on talent and train rewards. Faces are unreadable at 18 px.
