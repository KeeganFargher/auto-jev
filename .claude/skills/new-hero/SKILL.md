---
name: new-hero
description: Build a hero's 3D game model and signature spell visuals the way Gorrak and Cinder were built, from a high-detail Blender model through a look sign-off, a painted bake, clips, export, spell effects and in-game checks. Use when the user asks to model, make, start or add a hero (for example "start on frostweaver" or "get Moira into the game").
---

# New hero model

A hero is two Blender scripts, a spell-visuals entry and two user sign-offs. The reference is `docs/models.md` ("Adding a hero model", "How Gorrak's game model was made", "How Cinder's game model was made"); read it first. This skill is the order of work, not a second copy of those facts.

## Before modelling

- Read the hero's kit in `packages/content/src/roster/<id>.ts`. A channelled ability needs a `channel` clip; the basic attack decides what `attack` looks like; the signature abilities need their own visuals (step 5).
- Match the painted portrait in `art/icons/heroes/<id>.png` and the look line in `missing_assets.md` entry 8. If they disagree, follow the portrait and say so.
- Keep the house style: chunky proportions, big head and hands, mid-tone colours that read on a dark board, restrained glow. Put Gorrak (`art/models/heroes/ravager.blend`) and Anvil (`bulwark.blend`) in every comparison.

## 1. High-detail model

- Write `art/generators/build_<name>.py` on `hero_kit.py`, following `build_cinder.py`: one object per part in a `<name>_hq` collection, each parented to a bone of an always-built rig.
- The rest pose is the idle pose. Model props where they are held.
- The rig follows Gorrak's and Cinder's: root, hips, spine, head, arms and legs, plus at most a couple of extra bones for cloth or a prop.
- Make hair, fur and tassels chunky clumps. Thin shapes miss the bake and vanish at board size.
- A visible face needs whites, irises, pupils, a lash line and flat decals (brows, mouth, freckles). Delete any skull hidden under hair.
- Keep the `team` material to small parts (a scarf, cuffs, a sash). The contract makes it plain white in game, so large team areas lose the painted look.
- Glow only on the eyes, one signature effect and at most a thin trim line. Casting multiplies every emissive surface by up to 4.
- Run it with `-- save` to write `art/explorations/<name>-hq.blend`.

## 2. Look sign-off

- Write the bake recipe `art/generators/build_<id>.py`: a `bake_kit.Recipe` with paint kinds, gradients, glow colours, the team material, dropped decals and per-part triangle targets. `build_pyromancer.py` is the model.
- Run it with `-- preview` on the high-detail file. It renders the painted look the bake will produce, plus a lineup with the shipped heroes from the game camera.
- Also run `-- render` once and compare its face close-up with the preview's. If hair or props smear onto the skin, add an `isolate` group; if it's blurry, raise `uv_boost` for the skin. The user checks faces up close.
- Send the sheet with SendUserFile and wait for the user's approval before keying clips.

## 3. Bake and clips

- `-- lp` reports triangles per part. Stay under 8,000 in Blender and tune the targets.
- `-- bake` bakes the 1024 px texture. The first Metal bake compiles kernels for about 8 minutes.
- Cloth that spans the legs needs `weights` (smooth skin); rigid parts use their parent bone.
- Key the clips with `clip_kit.Poser`, as `build_ravager.py` and `build_pyromancer.py` do. The game starts `attack` at 40% of its length minus 0.13 s and `cast` at 50% minus 0.22 s, so the release frame belongs at those points.
- `-- clips sheet` prints per-clip checks and renders a clip sheet. Nothing below the floor, loops close exactly, and death ends flat.
- A run with no flags writes `art/models/heroes/<id>.blend`. `ART_TARGET` redirects it for experiments.

## 4. Ship the model

- `pnpm models:build <id>` exports and checks it. Fix every finding.
- Add the catalogue line in `apps/client/src/models/catalogue.ts`. If the placeholder's height is wrong for the model (a hat, a hood), set `boardHeight` against Gorrak (8.9) and Anvil (8.4).
- Check `#models/<id>`: every clip, team colour, ×32 stats against the placeholder and the leak test.

## 5. Signature spell visuals

- Give the hero's signature abilities code-drawn visuals in `apps/client/src/game/views/spell-visuals.ts`, keyed by ability id: impact (a pending delayed hit), landing, zone, cast or projectile. Cinder's Meteor, Flame Ward and Firebolt are the model.
- Make every effect readable on light boards: something opaque or dark (a rock, a scorch mark, flame cores with normal blending), not only additive glow.
- Time anything that waits for a hit from ticks, not seconds, so it stays in sync at every playback speed.

## 6. Check in battle and final sign-off

- Run a battle-lab fight that triggers every visual (import a custom scenario, step with a virtual clock, grab canvas frames). Confirm no console errors, and that a reset mid-effect leaves nothing behind.
- Update `docs/models.md`, `docs/architecture.md` if the client changed, `docs/decisions.md`, and the hero's rows in `missing_assets.md`.
- Show the user the hero in game (screenshots from `#models` and a battle) and let them approve it.
