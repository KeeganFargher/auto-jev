# Artwork

## Everything is painted

| set | folder | count |
| --- | --- | --- |
| HUD icons | `public/icons` | 32 of 34 — `iron` and `wood` are slots nothing uses |
| Unit portraits | `public/portraits` | 12 of 12 |
| Jev portraits | `public/jevs` | 6 of 6 |
| Faction crests | `public/faction` | 5 of 5 |
| Biome vignettes | `public/vignettes` | 5 of 5 |
| Doctrine scenes | `public/doctrine` | 6 of 6 |
| Building scenes | `public/buildings` | 10 of 10 |

Two cards still draw their own backdrop on purpose: **"bank the gold"** and **"build nothing"**.
Neither is about a thing, so there is nothing to show a picture of.

## Adding more later

Drop a file in the right folder, **restart the server** (the manifest is read once at boot), and the
game uses it. Anything without a file falls back to a drawing, so a half-finished set never looks
broken. Source masters live in `art-source/` and are not served; the files under `public/` are
resized WebP — run them through:

```bash
npx @squoosh/cli -d public/<folder> -s '' --resize '{"width":512}' --webp '{"quality":82}' public/<folder>/*.png
```

Widths: **128** for icons, **256** for crests, **512** for everything else.

### What a new name needs

| you added | file goes in | named for |
| --- | --- | --- |
| a unit | `public/portraits` | its unit id, e.g. `crossbowmen` |
| a Jev | `public/jevs` | its hero id, e.g. `veyra` — **not** the display name |
| a faction | `public/faction` | its faction id, e.g. `ashkeep` |
| a biome | `public/vignettes` | the biome, e.g. `marsh` |
| a building | `public/buildings` | its building id, e.g. `arcane_tower` |
| a doctrine | `public/doctrine` | `doctrine_<category>` for the whole category, or the doctrine's own id to give just that one its own picture |
| a HUD icon | `public/icons` | the slot name — see `/icon-sheet.html` for the full set |

Names are matched exactly against ids in the code. A misspelling does not error: it silently falls
back to the drawing, which is how `vayra.png` went unnoticed. Check `/icon-sheet.html`, which marks
anything still falling back in red.

## Where each shape is used

**Every card in the game is a 3:4 poster now.** The picture fills the card edge to edge and the
words are read off a black gradient across its bottom third. That means one shape covers almost
everything:

| shape | ratio | fills | keep clear |
| --- | --- | --- | --- |
| Unit portraits, Jev portraits, biome vignettes, scenes | **3:4** | the whole card — battle cards at 66×96, choice cards at ~150×200 | **bottom third**, which the gradient and text cover |
| Crests | 1:1 | drawn whole in the upper half of a choice card, and every faction marker | nothing — never cropped |
| Icons | 1:1 | 16–22px frames | nothing — fills the frame |

The five biome vignettes you made are 8:3 panoramas. They still work — the card takes a centre
crop — but only about a quarter of each painting is ever seen. **Make the 16 scenes at 3:4** (768×1024),
and regenerate the vignettes at 3:4 whenever you feel like it.

## Style, across everything

The look is set by what you have already made: flat low-polygon facets, soft light from the top
left, olive and rose and cream, hazy mountains and conifers behind. Two rules keep it coherent:

- **Faction-neutral** unless the thing belongs to one faction. All sides recruit the same Spearmen;
  the card supplies the faction colour as a frame. The Heavy Cavalry portrait's red heraldry is the
  one piece that breaks this and is worth a repaint.
- **Backgrounds match.** Four portraits (catapult, ogre, battle mage, heavy cavalry) have saturated
  blue skies while the other eight are pale and washed out. Side by side in the battle strip they
  read as two different sets.
