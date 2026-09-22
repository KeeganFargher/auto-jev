# Missing assets

Requests for art, icons, audio and other assets the code currently fakes.

## HUD control icons (battle lab)

**What:** play, pause, step-one-tick, and reset icons for the bottom-centre
control bar.

**Currently:** unicode glyphs (`▶`, `‖`, `▶‖`, `↻`) rendered as button text in
`apps/client/src/hud/battle-controls.ts`. They read acceptably but they are
font-dependent, inconsistent in weight between platforms, and `▶‖` for "step"
is a made-up pairing rather than a recognised symbol.

**Wanted:** a small monochrome icon set (SVG preferred, single colour so it can
inherit `currentColor`), roughly 16×16 at 1x, in the flat RTS-HUD style of the
Dota Underlords reference — play, pause, step-forward, reset/restart. A speed
or fast-forward icon would also let the speed chips (`0.5x/1x/2x/4x`) become
icon-led rather than text.

**Blocking:** no. The glyphs work; this is a polish upgrade.
