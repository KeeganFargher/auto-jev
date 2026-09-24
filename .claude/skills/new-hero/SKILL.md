---
name: new-hero
description: Build a hero's 3D game model the way Gorrak was built and Cinder is being built, from a high-detail Blender model through a look sign-off, a painted bake, clips, export and in-game checks. Use when the user asks to model, make, start or add a hero (for example "start on frostweaver" or "get Moira into the game").
---

# New hero model

A hero model is two Blender scripts and two user sign-offs. The reference is `docs/models.md` ("Adding a hero model", "How Gorrak's game model was made"); read it first. This skill is the order of work, not a second copy of those facts.

## Before modelling

- Read the hero's kit in `packages/content/src/roster/<id>.ts`. A channelled ability needs a `channel` clip; the basic attack decides what `attack` looks like.
- Match the painted portrait in `art/icons/heroes/<id>.png` and the look line in `missing_assets.md` entry 8. If they disagree, follow the portrait and say so.
- Keep the house style: chunky proportions, big head and hands, mid-tone colours that read on a dark board, restrained glow. Put Gorrak (`art/models/heroes/ravager.blend`) and Anvil (`bulwark.blend`) in every comparison.

## 1. High-detail model

- Write `art/generators/build_<name>.py` on `hero_kit.py`, following `build_cinder.py`: one object per part in a `<name>_hq` collection, each parented to a bone of an always-built rig.
- The rest pose is the idle pose. Model props where they are held.
- The rig follows Gorrak's and Cinder's: root, hips, spine, head, arms and legs, plus at most a couple of extra bones for cloth or a prop.
- Make hair, fur and tassels chunky clumps. Thin shapes miss the bake and vanish at board size.
- Keep the `team` material to small parts (a scarf, cuffs, a sash). The contract makes it plain white in game, so large team areas lose the painted look.
- Glow only on the eyes, one signature effect and at most a thin trim line. Casting multiplies every emissive surface by up to 4.
- Run it with `-- save` to write `art/explorations/<name>-hq.blend`.

## 2. Look sign-off

- Write the bake recipe `art/generators/build_<id>.py`: a `bake_kit.Recipe` with paint kinds, gradients, glow colours, the team material, dropped decals and per-part triangle targets. `build_pyromancer.py` is the model.
- Run it with `-- preview` on the high-detail file. It renders the painted look the bake will produce, plus a lineup with the shipped heroes from the game camera.
- Send the sheet with SendUserFile and wait for the user's approval before keying clips.

## 3. Bake and clips

- `-- lp` reports triangles per part. Stay under 8,000 in Blender and tune the targets.
- `-- bake` bakes the 1024 px texture. The first Metal bake compiles kernels for about 8 minutes.
- Key the clips with `clip_kit.Poser`, as `build_ravager.py` does. The game starts `attack` at 40% of its length minus 0.13 s and `cast` at 50% minus 0.22 s, so the release frame belongs at those points.
- `-- clips sheet` prints per-clip checks and renders a clip sheet. Nothing below the floor, loops close exactly, and death ends flat.
- A run with no flags writes `art/models/heroes/<id>.blend`. `ART_TARGET` redirects it for experiments.

## 4. Ship

- `pnpm models:build <id>` exports and checks it. Fix every finding.
- Add the catalogue line in `apps/client/src/models/catalogue.ts`.
- Check `#models/<id>`: every clip, team colour, ×32 stats against the placeholder and the leak test. Then run a battle-lab fight with the hero in it.
- Update `docs/models.md` and the hero's rows in `missing_assets.md`.

## 5. Final sign-off

Show the user the hero in game (screenshots from `#models` and a battle) and let them approve it.
