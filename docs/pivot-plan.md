# Pivot plan: little guys, big physics, hero combos

Status: being built since 2026-09-28. It replaced
`docs/hero-redesign.md` and `docs/heroes-and-builds-design.md`, which are
at the `pre-pivot` tag with everything else the pivot removed. Progress
is at the top of §9. §11 says which questions the build answered on the
plan's recommendation; the user hasn't confirmed those yet.

The reference is the user's prototype, "Bone & Banner — an autochess you
watch" (`C:\Users\User\Downloads\Bone & Banner.html`, three.js r170 +
cannon-es, KayKit characters). Phase 0 copies it into the repo so everyone
can compare against it.

## 1 What we are pivoting to

**What we keep from the prototype:**

- **Small chibi "little guys".** Free low-poly characters, not our own
  custom-modelled heroes.
- **Exaggerated effects with physics.** Hammers the size of a house.
  Bodies that fly, tumble, bounce and skid. Hitstop, slow motion,
  craters and debris.
- **Combos between heroes.** One hero casts, and another follows up on
  what that cast left behind. The chain is celebrated on screen.
- **Free third-party assets** for bodies, places and props. Spells and
  their effects stay in-house.

**What the user decided on 2026-09-28:**

- The whole current roster goes. Nothing from any existing hero carries
  over: kits, ability definitions, names, lore, figures, models, spell
  visuals, sounds, voice lines and icons.
- Gems and items are scrapped for now. Some kind of upgrades, spells and
  combos will come back later. Their shape is not decided.
- We start with five heroes: the hammer, the berserker (who "needs some
  work, but I think he's decent"), a Living Bomb mage, a physics-heavy
  support, and one open slot.

**Proposed here, not yet agreed:** dropping levels and recruit along
with gems and items, how far the Berserker changes, the renames in §3.7,
and the rest of §11.

**Pillars.** These are the tests every later decision has to pass:

1. **Every signature is a physical event.** Something gets launched,
   thrown, yanked, floated or blown up. The physics decides where bodies
   end up.
2. **Heroes set each other up.** A cast leaves behind states you can
   see: airborne, floating, downed, burning. Other heroes' casts pay those
   states off (§4).
3. **Readable chaos.** Every big move is telegraphed. Only one slow-motion
   moment plays at a time. Chains get a banner.
4. **Little guys, free assets.** One art family (KayKit first, §7). We
   only make what nobody gives away.
5. **The fight comes first.** The new meta (upgrades, economy, more heroes)
   waits until five heroes in the lab are fun to watch.

## 2 Decisions at a glance

| Topic                 | Decision                                                                                                                                                                                                                                                                                                                                                                        | Why                                                                                                                                                                                                                                               |
| --------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Roster                | Five new heroes designed from scratch (§3)                                                                                                                                                                                                                                                                                                                                      | The user's call. The current kits don't fit the direction.                                                                                                                                                                                        |
| Gems and items        | Deleted from every layer, not hidden                                                                                                                                                                                                                                                                                                                                            | The user's call. The repo already has a no-backwards-compatibility rule (decisions.md, 2026-09-23).                                                                                                                                               |
| Levels and recruit    | Proposed to go too (§11)                                                                                                                                                                                                                                                                                                                                                        | Levels are upgrade picks, and upgrades come back later in a new shape. Recruit only grows the team, and the team size has to be settled for five heroes anyway.                                                                                   |
| Combat engine         | Of the engine's 12,400 lines, keep about 1,200 as they are: RNG, the placement grid, targeting, areas, movement and recording. Rewrite about 2,500 around a new combat layer: definitions, state, setup, events, snapshot and the tick loop. Delete about 8,700: `combat.ts`, `timed.ts`, `triggers.ts`, `sequences.ts`, `conditions.ts` and `builds/`. §8.1 goes file by file. | The deleted files are tangled with gems, items, levels and about 45 passive kinds that exist for one old hero or item. There are no sim tests, so carving them out is riskier than rewriting. The old code stays readable at the `pre-pivot` tag. |
| Combos                | Physical states plus general rules ("chemistry"), not a table of pairs (§4)                                                                                                                                                                                                                                                                                                     | A sixth hero that launches things combos with the rest for free                                                                                                                                                                                   |
| Gameplay physics      | Kinematic physics in the engine: closed-form flights, landings and skids, and bubbles as objects (§5)                                                                                                                                                                                                                                                                           | Combos need the sim to know who is airborne. Closed-form maths keeps replays identical in every browser.                                                                                                                                          |
| Cosmetic physics      | Tumbling, debris and props in the client, with cannon-es like the prototype                                                                                                                                                                                                                                                                                                     | It looks like the prototype and never changes an outcome                                                                                                                                                                                          |
| Replays               | Keep "every client re-runs the battle from its setup". Add a sim hash checked on join, a per-battle event digest from the server, golden tests and a browser matrix (§5.3).                                                                                                                                                                                                     | Keeps the tiny network footprint (a `view` is about 3 KB). The checks catch cross-browser drift and version skew, and neither is checked today.                                                                                                   |
| Art                   | Free packs, KayKit first (§7). The repo is public, so only CC0, CC-BY and MIT files are committed. Every pack is listed in `CREDITS.md`.                                                                                                                                                                                                                                        | The user's call. Committing files whose licence forbids redistribution to a public repo would breach it.                                                                                                                                          |
| Match and Jev         | Keep the online loop running, with draft and formation only, until the new meta exists                                                                                                                                                                                                                                                                                          | Protects the multiplayer and Jev work while the fight is rebuilt                                                                                                                                                                                  |
| Custom model pipeline | Delete it: Blender generators, the hero figures built in code, and the `new-hero` skill                                                                                                                                                                                                                                                                                         | Free assets replace it                                                                                                                                                                                                                            |

## 3 The five heroes

Every hero has a basic attack and one **signature**, which casts when
mana fills. That matches the prototype. A passive is added only where it
earns its place; for now only the support has one. Distances are in cells
(10 units each; the board is still 8×8), and times are in seconds. Damage
and health numbers are for tuning and are left out here.

Each hero owns one physical verb, so the five never blur together:

| Hero                                       | Body (KayKit)                 | Verb                 | Role                        |
| ------------------------------------------ | ----------------------------- | -------------------- | --------------------------- |
| **Paladin**                                | Knight                        | Launch (up and out)  | Frontline                   |
| **Berserker**                              | Barbarian                     | Throw (into a crowd) | Frontline                   |
| **Firebrand**                              | Mage                          | Ignite, then explode | Backline                    |
| **Bubble Cleric** (recommended for slot 4) | Mage, tinted, or Druid (§7.2) | Float                | Backline healer and control |
| **Harpooner** (recommended for slot 5)     | Ranger                        | Yank                 | Midline                     |

The names are working titles. §3.7 lists where the kits came close to
the current roster, and what changed because of it.

### 3.1 Paladin: the hammer

- **Attack:** a slow, heavy two-handed chop.
- **Signature: Hammerfall.** This is the prototype's "Hammer of
  Judgement", renamed (§3.7).
  - A colossal hammer appears in his hands. He heaves it overhead for
    about a second. No ring marks the ground: the prototype has none.
  - Then he brings it down: a crater, two shockwave rings, and debris.
  - Everything within 1.6 cells is launched up and outward. The closer a
    unit is to the centre, the higher and further it goes.
  - The blow lands 18.5 units ahead of him, where the hammer's head hits.
    He turns to put the most enemies in the ring, with enemies in a
    setup state counting double.
- **Combos:**
  - He juggles: anything already airborne or floating in the ring goes
    twice as high and twice as far, and takes bonus damage.
  - A bubble in the ring pops and flings everything inside it.
  - A burning unit he launches comes down as a comet.
- **Kept from the prototype:**
  - Beat timings: summon at 0.05 s, hang at 0.95 s, impact at 1.12 s,
    total 2.25 s.
  - Slow motion from 0.8 s in: 0.25× speed for about 0.55 s, over the
    raise into the hang.
  - Impact effects: a 0.1 s hitstop, a field-of-view punch, screen shake,
    a flash, a crater, and 14 pieces of debris.
  - The giant hammer is built in code, and his body plays the
    prototype's `Hammer_Slam`, posed at load from two frames of
    `Melee_2H_Attack_Chop` (§7.2).

### 3.2 Berserker: reworked

The user said he "needs some work, but I think he's decent". The rework
below is a proposal; how far it should go is in §11.

- **Attack:** fast two-handed axe swings.
- **Signature: Rampage.**
  - He roars and swells to three times his size over 0.5 s, and stays
    big for 5 s.
  - Instead of swinging, he grabs whoever he is fighting and hurls it at
    the thickest group of its friends within 4 cells. That is about one
    throw a second.
  - The thrown body lands like a bowling ball. Everyone within 1 cell of
    the landing takes damage and is knocked down.
  - While big he can't be moved or stunned. He can still be hit, healed
    and bubbled.
  - It ends with a stomp and a puff of steam as he shrinks.
- **Combos:**
  - He prefers to grab burning, airborne or floating enemies, and catches
    them out of the air.
  - Whatever he throws keeps its state:
    - A burning body sets its landing group alight.
    - A Short Fuse carrier explodes where it lands (Hot Potato).
    - A bubble lands as a bouncing ball.
- **What changes from the prototype's Berserk, and why:**

  | Prototype                               | Now              | Why                                                                                                                      |
  | --------------------------------------- | ---------------- | ------------------------------------------------------------------------------------------------------------------------ |
  | Grew to 6×                              | Grows to 3×      | At 6× he hid the whole fight and forced the camera to pull back                                                          |
  | Lasted 6 s                              | Lasts 5 s        | Shorter                                                                                                                  |
  | Spell immune                            | Not spell immune | Immunity cut him out of every combo                                                                                      |
  | Radial knockback, ending in a whirlwind | Throws           | Radial launching is the Paladin's verb, so the Berserker gets one of his own. A whirlwind would also copy Gorrak (§3.7). |

### 3.3 Firebrand: Short Fuse

- **Attack:** tossed firecrackers that pop on impact.
- **Signature: Short Fuse.** This is the user's Living Bomb, renamed
  because Cinder already has one (§3.7).
  - It marks the enemy with the most of its friends around it.
  - The target bursts into flames, with a lit fuse and a 3-2-1 counter
    over its head. It panics for 3 s: it can't attack or cast, and it
    sprints in a zig-zag into the thickest group of its own team.
  - Anyone it touches catches fire. Burning units pass the fire on by
    touch too, with limits: only to their own team, only once per unit per
    fuse, and at most two hops from the carrier.
  - When the fuse runs out, or the carrier dies, it explodes. That deals
    damage within 2 cells and launches everything nearby.
- **Combos:**
  - **Hot Potato:** a carrier that is launched, thrown or yanked explodes
    when it lands, 50% bigger.
  - **Comet:** a burning unit that gets launched sets fire to whoever it
    lands near.
  - **Bubble:** a burning unit inside a bubble sets everyone in that
    bubble alight.

### 3.4 Slot 4, the support. Recommended: Bubble Cleric

- **Attack:** soap-bubble bolts. Each one also heals the most hurt ally in
  range a little.
- **Signature: Big Bubble.**
  - She blows a huge, wobbling bubble over the densest group of enemies,
    including any already in the air.
  - It lifts up to four of them 1.5 cells up for 2.5 s. They are
    helpless and bump into each other.
  - Then it pops, and they drop and are downed.
- **Passive: Safety Bubble.**
  - When an ally drops below 35% health, she wraps it in a small bubble.
    This happens once per ally per fight.
  - The ally floats out of melee reach, heals 30% over 2 s and can't be
    hit by attacks, then drops back into the fight.
  - It is the prototype's Ice Block (the Cryomancer's, below 30%) turned
    outward onto allies.
- **Combos:** the Big Bubble is the team's best setup, a floating clump:
  - the Paladin bats it;
  - the Berserker throws it;
  - one burning unit inside sets the rest alight;
  - the Harpooner drags the whole bubble.
- **Alternatives:**
  - **Bell Cleric.** She drops a giant bell over an endangered ally, and
    the landing flings enemies away. The ally heals inside. Hitting the
    bell makes it toll, sending out a stun wave.
  - **Mushroom Druid.** She grows springy mushrooms that bounce allies
    into the enemy backline and puff healing spores.

### 3.5 Slot 5, open. Recommended: Harpooner

- **Attack:** thrown knives with a 2-cell range.
- **Signature: Yank.**
  - She hurls a chain hook at the farthest enemy within 5 cells.
  - She yanks it over everyone's heads in a high arc, and it lands at her
    feet.
  - The landing deals damage and knocks down whoever is nearby. The
    target is stunned for 1 s.
  - The prototype's Death Knight does the same with a skeletal hand
    (Death Grip). Here it moves onto a hero, as a physical arc.
- **Combos:**
  - She prefers airborne or floating targets. Yanking a bubble drags the
    whole bubble.
  - A target yanked into the Paladin's ring gets juggled.
  - The Berserker catches yanked bodies in mid-air and throws them back.
  - She never yanks a Short Fuse carrier. Its blast only hurts its own
    team, so bringing it over would waste it.
- **Alternatives:**
  - **Skeet Ranger.** A crossbow shooter who fires at every enemy her
    allies launch while it is still in the air, knocking it further. The
    purest follow-up hero.
  - **Catapult Engineer.** Fires allies into the enemy backline: the
    Paladin lands mid-slam, and the Berserker lands giant.

### 3.6 Rules every hero shares

These come from the prototype:

- Basic attacks crit 12% of the time, for 1.75× damage. Signatures never
  crit. In the prototype only attacks roll crits, including the
  Barbarian's swings while he is huge.
- Melee crits knock the target back a short hop, so there is always a
  little physics on screen.
- Mana comes from attacking and from being hit.
- A team can field each hero only once. Whether two teams can field the
  same hero is in §11.

### 3.7 Clashes with the current roster

The user asked that nothing from the current ten heroes be reused.
Checking the five kits against them found these near-misses. Phase 1
deletes the old heroes, so none of this would break code. The changes
keep the new heroes from reading as old ones.

| New                                                    | Too close to                                                                                                      | Change                                                                                                                      |
| ------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------- |
| Paladin's "Hammer of Judgement" (the prototype's name) | Morrow (`oathkeeper`), a hammer healer whose `judgment` is a bouncing hammer throw                                | Renamed **Hammerfall**. The Paladin never throws or bounces his hammer, and never heals.                                    |
| Firebrand, a fire mage                                 | Cinder (`pyromancer`), the current fire mage                                                                      | The user asked for a Living Bomb mage. The body, kit, effects and sounds are all new.                                       |
| Firebrand's "Living Bomb" (the user's name)            | Cinder's `living-bomb` ability (80 damage within 1.5 cells of the marked target) and his "Living Bomb" upgrade    | Renamed **Short Fuse**, with the id `short-fuse` and a 2-cell blast. The panic run and the spreading fire are new.          |
| Firebrand's fire-bolt attack                           | Cinder's `firebolt`                                                                                               | Tossed firecrackers                                                                                                         |
| The "Meteor" combo rule                                | Cinder's `meteor` ("Meteor Shower"), which leaves burning ground                                                  | Renamed **Comet**. It lights units near the landing and leaves no burning ground.                                           |
| Berserker                                              | Gorrak (`ravager`), a two-axe berserker with Whirlwind, Leap Slam and Blood Frenzy                                | No whirlwind (the prototype's Berserk ends in one, and it is dropped), no leap and no frenzy stacks. His verb is the throw. |
| Big Bubble                                             | Rime's Glacial Prison, which freezes the densest group within 2 cells for 2 s and makes them take 25% more damage | The bubble is an object: it carries at most four, moves when hit, and pops into a fall. There is no damage bonus.           |
| Safety Bubble                                          | Rime's Ice Mirror: on a lethal hit she becomes an untouchable ice statue for 2 s                                  | It saves allies, not the caster, at 35% health. It heals over time and floats the ally out of the fight.                    |

## 4 Combos: chemistry, not recipes

The old system paired three conditions with three schools (Staggered by
Arcana makes Overload, and so on). It was a table of recipes, and it goes
with the builds. The new one is a handful of **physical states** plus
**rules** that apply to anyone. Any hero that launches, burns or floats
things combos with every other hero without extra code.

### 4.1 States

Every state is visible on the unit.

| State        | Made by                                                           | Rules                                                                                  |
| ------------ | ----------------------------------------------------------------- | -------------------------------------------------------------------------------------- |
| **Airborne** | Hammer, fuse blasts, throws, yanks, and melee crits (a short hop) | Can't act. Melee attacks can't reach it. It lands with an impact.                      |
| **Floating** | Big Bubble, Safety Bubble                                         | Can't act. Attacks can't reach it; spells can. The bubble pops when its time runs out. |
| **Downed**   | Hard landings, bubble pops                                        | Flat on the ground for about 0.5 s, then it gets up with a small hop                   |
| **Burning**  | Short Fuse and the fire it spreads                                | Damage over time. Spreads by touch to the unit's own team.                             |
| **Primed**   | The Short Fuse carrier                                            | Panics, then explodes                                                                  |

### 4.2 Rules

1. **Juggle.** Launching something already airborne or floating sends
   it twice as high and far, and deals bonus damage.
2. **Bowling.** A body that lands hard hits enemies of its launcher near
   where it lands, and shoves them a short way. Each hop is weaker. After
   two hops the chain stops.
3. **Fire travels with the body.** A burning unit that flies sets fire to
   whoever it lands near (Comet). Inside a bubble, fire spreads to
   everyone.
4. **Hot Potato.** A primed carrier that flies explodes on landing, 50%
   bigger.
5. **Bubbles are objects.** Whatever hits a bubble moves the whole bubble
   and everything in it: bat it, throw it, drag it. The engine models
   bubbles as entities of their own (§5.3).

### 4.3 Follow-ups: how chains actually happen

In an autobattler, casts fire whenever mana fills. So without help,
combos would only happen by coincidence. Two changes fix that:

- **Ready and waiting.**
  - A hero with full mana is ready, and it glows and hums.
  - Each signature lists the setups it wants:

    | Hero          | Wants                             |
    | ------------- | --------------------------------- |
    | Paladin       | Floating, airborne, or 3+ grouped |
    | Berserker     | Burning, airborne, floating       |
    | Harpooner     | Airborne, floating                |
    | Firebrand     | 3+ grouped                        |
    | Bubble Cleric | 3+ grouped, airborne included     |

  - A ready hero casts as soon as a setup it wants is in reach.
  - If none turns up within 1.5 s, it casts on its normal target.
- **Chains.**
  - Every state remembers who made it.
  - When a signature hits a unit whose state a _different_ ally made, it
    adds a link to that team's chain.
  - The engine emits `combo-link` events, and the client shows a chain
    banner with the hero portraits.
  - Each link turns the effects up a notch: longer hitstop, harder shake,
    higher-pitched sound. It also adds a small damage bonus; the numbers
    come in tuning.

### 4.4 Combo matrix

Each row is a setup, and each column is the hero who pays it off. The
matrix is filled in as each hero lands (Phases 5 and 6).

| Setup ↓ / Payoff →              | Paladin                         | Berserker                     | Firebrand                         | Bubble Cleric            | Harpooner                 |
| ------------------------------- | ------------------------------- | ----------------------------- | --------------------------------- | ------------------------ | ------------------------- |
| **Big Bubble** (floating clump) | Bats the bubble: pop and juggle | Throws the whole bubble       | A burning unit ignites the bubble | —                        | Drags the whole bubble    |
| **Short Fuse** (primed)         | Launch, then Hot Potato         | Throws it into their backline | —                                 | Blast inside the bubble  | Avoids it                 |
| **Burning** (spread)            | Comet on landing                | Throws the fire into a crowd  | —                                 | Fire fills the bubble    | —                         |
| **Hammer launch** (airborne)    | —                               | Catches and throws            | Burning units become comets       | Catches the flying clump | Yanks them out of the air |
| **Throw** (airborne, bowling)   | Lands in the ring: juggle       | —                             | Thrown carrier: Hot Potato        | Catches it               | Yanks it back             |
| **Yank** (airborne, pulled in)  | Pulled into the ring: juggle    | Catches and throws back       | —                                 | Catches it               | —                         |

### 4.5 The fight we are aiming for

1. Firebrand lights a short fuse on the enemy tank. He panics into his
   own backline and sets two friends on fire.
2. The Bubble Cleric's Big Bubble scoops up all three burning enemies.
3. The Paladin has been ready, waiting. He slams under the bubble: it
   pops, and three flaming bodies fly high and come down as comets.
4. The Berserker catches the fuse carrier out of the air and hurls it at
   the enemy healer. Hot Potato: the explosion launches the last two.
5. The banner reads "×4".

## 5 Physics

### 5.1 What we found

- **Where battles run.**
  - The server resolves every battle when the round locks.
  - Every client then re-runs the same battle locally from its
    `BattleSetup` (seed, heroes, spawn points) to draw it.
  - Nothing is streamed per tick, and nothing checks that the client's
    result matches the server's (`round-playback.ts`, `run.ts`).
- **How units move.** Units are points on a continuous 80×80 plane. The
  8×8 grid is only used for placement. Units have no velocity, height,
  mass or body size: separation keeps every pair 6 units apart
  (`MIN_GAP_UNITS`).
- **Displacement.** Knockback, pull, blink and dash are instant teleports.
  The 3D view ignores `unit-moved`, so a knockback shows as a short slide,
  or a snap if it is longer than 20 units.
- **Cross-browser determinism is already a latent risk.**
  - `distance` and `directionTo` (`math/vector.ts`) and the separation
    push (`movement.ts:233`) use `Math.hypot`.
  - `engageSlot` uses `atan2`, `cos` and `sin`, and its slot step uses
    `asin` (`movement.ts:34`).
  - The JavaScript spec lets each engine approximate these its own way,
    so Safari may already disagree with Node. Only `+ − × ÷` and
    `Math.sqrt` are exactly specified.
- **Version skew is unchecked.** The room lets a client in when its
  protocol version is missing or unparsable
  (`packages/server-runtime/src/rooms/match-room.ts:175–177`). Nothing
  compares the sim or the content either.
- **One clock per round.** `round-playback.ts` plays every battle in a
  round from a single `elapsedTicks`.
- **No tests.** The sim package has none, and there is no root
  `pnpm test`.

### 5.2 The options

| Option                                                                  | Verdict                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| ----------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| A. Physics only in the client, landing where the engine says            | Rejected. Combos need the sim to know who is airborne, floating or downed.                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| B. Kinematic physics in the engine, plus cosmetic physics in the client | **Chosen**                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| C. A full rigid-body engine that decides outcomes                       | Rejected for now. It is possible: Rapier's WASM builds (`@dimforge/rapier3d-deterministic`) promise identical results on every machine and browser, if the version, insertion order and step count match and no inputs come from `Math.sin`-style functions. But the sim would depend on a WASM module of about 2 MB (the size of the compat build already in `node_modules` as a dependency of `@types/three`), on the server as well, and turn every tuning question into a physics-tuning question. Revisit only if B can't express a hero we want. |

### 5.3 In the engine

- **New state.**
  - Every unit gets an elevation, a `motion` and a body radius. The
    radius is 3 units, half of today's gap, and scales with size, so the
    grown Berserker's is 9.
  - The battle gets a list of bubbles.
  - Snapshots and recordings carry all of it, so the client can draw it.
- **Motion kinds.** Each is a closed-form function of the tick, fixed when
  it starts:
  - `flight`:
    - It has a path of one or two straight segments (two when it
      bounces off a wall), a start height `h0`, a peak, and start and end
      ticks.
    - With `s` as the fraction of the flight done, the unit is `s` of the
      way along the path, at height `h0·(1−s) + 4·peak·s·(1−s)`.
    - So a flight can start in the air and still end on the ground.
  - `float`: the unit rides a bubble.
  - `skid`: it slides to a stop with constant deceleration.
  - `downed`: it lies still until a set tick.
- **Launching.** One entry point turns hammer launches, throws, yanks,
  blasts and crit hops into a flight.
  - A landing point outside the arena is cut at the wall and reflected
    there, which makes the second segment. So units bounce off walls.
  - A unit launched while it is already flying starts a new flight from
    where it is, at its current height (Juggle).
- **Bubbles are entities.**
  - A bubble has a position, a height, a radius, its members and an end
    tick. Members ride at fixed offsets and bump each other inside it.
  - A launch, throw or yank aimed at a bubble or any of its members moves
    the whole bubble as one flight.
  - When it pops, each member falls from its height (a flight from `h0`
    with no peak) and is downed.
- **Order within a tick:**
  1. States expire.
  2. Motions advance.
  3. Landings resolve in unit-id order: Bowling (capped at two hops),
     Comet and Hot Potato, then a skid, then downed.
  4. Grounded units steer, then separation runs.
  5. Touches resolve in unit-id order. Two units touch when their
     distance, measured after separation, is at most the sum of their
     radii. Fire spreads on touch, and so does the panic run's hit.
  6. Actions resolve in resolution-priority order, as they do today.
  7. The result is checked.
- **Maths.** Only `+ − × ÷` and `Math.sqrt`:
  - `distance`, `directionTo` and the separation push use `Math.sqrt`
    instead of `Math.hypot`.
  - `engageSlot` keeps its bearing as a unit vector instead of an `atan2`
    angle, and steps round the target by rotating it. The step angle is
    `2·asin(k)`, with `k = spacing / (2·range)`. So its cosine is
    `1 − 2k²` and its sine is `2k·√(1 − k²)`, and no trig is needed.
  - New code uses no trig. The panic zig-zag is a triangle wave built
    from the tick count.
  - **Lint enforces it.** A new rule in the repo's anti-slop oxlint
    plugin bans these in `packages/game`:
    - `Math.sin`, `cos`, `tan`, `asin`, `acos`, `atan`, `atan2`, `hypot`,
      `exp`, `log`, `pow`, `cbrt` and `random`;
    - the `**` operator.

    Today `oxlint.config.ts` only restricts imports there.
- **Events.** New events cover launches, landings, floats, pops,
  ignitions, explosions, `combo-link` and `beat` (§6). `unit-moved` is
  deleted.
- **Safety nets.** All of these are Phase 2 deliverables:
  - **Test harness.** `packages/game` gets `node:test` tests, as
    `packages/run` and `apps/client` already have. A root `pnpm test`
    runs every package's tests.
  - **Golden tests.**
    - Each lab scenario has a checked-in list of seeds.
    - A test replays each seed and compares the SHA-256 of its serialized
      events with a stored digest.
    - Digests are recorded as each hero lands.
  - **Browser matrix.** Playwright replays the same seeds in Chromium,
    Firefox and WebKit, and compares their digests with Node's.
  - **Version check on join.**
    - The client sends its `protocolVersion` and a `simHash`. The room
      refuses a missing or different one.
    - `simHash` is a SHA-256 over the catalogue and the `packages/game`
      sources, computed at build time.
    - The catalogue half reuses `contentHash`, which moves out of
      `scripts/survey/catalogues.ts` before the survey is deleted.
  - **Desync check.** The server sends each battle's event digest with
    the resolved round. The client compares its replay's digest with it
    and throws on a mismatch, in every build.
  - **Where the hashing runs.** The digests use Web Crypto, which Node and
    browsers share. They are computed outside `packages/game`, whose lint
    bans the `crypto` module.

### 5.4 In the client

- **Flights.** The client draws flights from `motion` at fractional
  ticks, so arcs are smooth and land exactly where the engine says.
  Bubbles are drawn from their entities.
- **Tumble.** A cosmetic spin is seeded from the unit and the tick, and
  scaled by launch strength. It eases back upright just before landing.
  Units squash on landing, kick up dust, and get up with a hop.
- **Debris and props.**
  - cannon-es handles only debris (rocks, splinters, bone bits), arena
    props knocked by shockwaves, and bodies tossed on death.
  - Bodies are capped and put to sleep, and they fade out.
  - Start from the prototype's feel: gravity −24, friction 0.45,
    restitution 0.25, fixed 1/60 s step with at most 5 substeps.
  - cannon-es becomes a direct dependency of `apps/client`. Nothing in
    the repo uses a physics library today.
- **Nothing flows back.** Nothing from cannon-es reaches the sim.

## 6 Juice

Everything below is in the prototype. It is ported deliberately, not
reinvented.

| Effect                                                             | When                                          | Lives in                         |
| ------------------------------------------------------------------ | --------------------------------------------- | -------------------------------- |
| Telegraph (a ground ring and charge-up)                            | Signature wind-ups                            | Client, from the cast event      |
| Slow motion                                                        | Into signature impacts and chain links        | Engine `beat` event, then client |
| Hitstop                                                            | Big impacts                                   | Engine `beat` event, then client |
| Field-of-view punch, screen shake, white flash                     | Impacts, scaled by size                       | Client                           |
| Cut-in banner (portrait, name and ability on a team-coloured band) | Signatures and chain links                    | Client                           |
| Crater decals, shockwave rings, dust, debris                       | Impacts and landings                          | Client (cannon-es for debris)    |
| Squash and stretch                                                 | Hits, launches and landings                   | Client                           |
| Status tints and icons over health bars                            | States in §4.1                                | Client                           |
| Damage numbers sized by damage                                     | Damage                                        | Client (DOM)                     |
| Drop-in from the sky                                               | Battle start. Replaces the 2 s teleport beat. | Client                           |
| Chain banner                                                       | `combo-link`                                  | Client                           |

**Slow motion has to fit in the round.**

- **Today:**
  - The server holds each round for 2 s + the longest battle + 3 s
    (`roundHoldSeconds` in `packages/run/src/pacing.ts`).
  - The client plays every battle of the round on one clock, at a fixed
    rate.
- **Beats.** A `beat` event says "play the next stretch at this rate" or
  "freeze for this long".
- **One timeline per battle.** A pure function in `packages/game` turns
  one battle's events into its presentation timeline: when each tick
  shows, and how long the battle plays.
  - It also applies the one-slow-motion-at-a-time rule: a beat that
    starts inside another is dropped.
  - The server and the client both use it, so they can't drift apart.
- **Server.** The round hold becomes the drop-in, plus the longest
  battle's presentation length, plus 3 s.
- **Client:**
  - `round-playback.ts` keeps one clock per battle, and maps it to ticks
    through that battle's timeline.
  - `match-scene.ts` has to follow presentation time too. Today it chases
    the server's round clock and jumps ahead once it falls more than 1 s
    behind (`CATCH_UP_SECONDS`). So a long slow motion would be skipped.
  - A spectator still watches the first battle (`match-scene.ts:1269`),
    on that battle's own clock.

## 7 Assets

Checked on 2026-09-28 against the itch.io pages and the prototype's own
files. The itch pages don't list clip or bone names. Those come from
copies of the pack files on GitHub, so confirm them on import.

### 7.1 Licence rules

- **The repo is public** (`KeeganFargher/auto-jev`). So only files whose
  licence allows redistribution go into git: CC0, CC-BY (credited) and
  MIT.
- **That rules out, for now:**
  - Shapeforms, Leohpaz and Sonniss sounds. Their licences forbid
    redistribution, and we read a public repo as redistribution.
    Shapeforms' author could confirm that reading.
  - LOWPO Fantasy Heroes;
  - AssetSmithy music;
  - Quaternius packs under the Quaternius Asset License. Newer
    Quaternius packs use it, and older ones are CC0, so check each page.
- **Paid tiers.** KayKit's paid tiers are CC0 too, but they are how the
  author earns. If we buy one, only the optimised files the game ships go
  into git, never the raw pack.
- **Where free packs live.** Raw free packs go in `art/vendor/<pack>/`
  (Git LFS), each with its licence file. The import script (§7.6) writes
  what the game loads.
- **`CREDITS.md`** lists each pack, its author, version, URL, licence
  and the date it was fetched.

### 7.2 Characters: KayKit

| Pack                     | Free tier                                                                                                                                                                                                                              | Paid tiers                                                                                                                 |
| ------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------- |
| Adventurers 2.0          | Knight, Barbarian, Mage, Ranger and Rogue, plus a hooded Rogue variant. They come with only the General and MovementBasic clips. 25+ weapons and accessories (swords, shields, axes, bows, crossbows, arrows, staff, wand, spellbooks) | EXTRA ($7.95): Engineer, Druid, Barbarian_Large, and 3 alternative textures per character. SOURCE ($11.95): `.blend` files |
| Character Animations 1.1 | 8 category files for Rig_Medium (about 131 clips) and 6 for Rig_Large (about 28)                                                                                                                                                       | SOURCE ($14.99): `.blend` files                                                                                            |
| Skeletons 1.1            | Skeleton Warrior, Rogue, Mage and Minion                                                                                                                                                                                               | EXTRA ($7.95): Golem, Necromancer                                                                                          |

- **Licence.** Everything above is CC0. Every KayKit page asks us not to
  resell unmodified copies or claim them as our own.
- **Rig.** Every free character uses **Rig_Medium**: 23 bones, with
  weapon slots `handslot.l` and `handslot.r`.
- **Clips come from Character Animations.** The Adventurers files carry
  only the General and MovementBasic clips. The attack, lie-down,
  cheering and tool clips (`Fishing_*`, `Holding_A`) are only in the
  Character Animations category files. The Phase 3 loader loads those
  once and binds them to every body by bone name.
- **Clip names changed.**
  - The prototype used Adventurers 1.0: a few clips inside each
    character (`1H_Melee_Attack_Chop`, `Spellcast_Shoot` and so on).
  - Its rig has 41 joints: the 23 Rig_Medium bones plus 18 IK and
    control bones.
  - The clip map below is written against 2.0.

**Bodies:**

| Hero           | Body                                                 | Props                                                                                                                |
| -------------- | ---------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------- |
| Paladin        | Knight                                               | A warhammer (`hammer_A` from Fantasy Weapons Bits). Hammerfall's giant hammer is built in code, as in the prototype. |
| Berserker      | Barbarian                                            | Two-handed axe. He grows by scaling, so the paid Barbarian_Large isn't needed.                                       |
| Firebrand      | Mage, tinted red, with an orange cape and staff orb  | The Mage's staff                                                                                                     |
| Bubble Cleric  | Mage, tinted pale blue, with a gold cape (Q5 in §11) | A crystal staff (`staff_B` from Fantasy Weapons Bits) and an open spellbook                                          |
| Harpooner      | Ranger                                               | A harpoon (`spear_A` from Fantasy Weapons Bits, §7.3). Chain drawn in code.                                          |
| Training Dummy | Skeleton Minion                                      | None                                                                                                                 |

Two Mages in a roster of five are hard to tell apart at chibi scale.
That is why the Druid is worth considering. For now the tints and props
tell them apart: a red robe and an orange orb against a pale blue robe,
a crystal staff and a spellbook.

**Clip map** (Rig_Medium, as built in `HERO_MODELS`,
`apps/client/src/game/models/catalogue.ts`):

| Our clip          | KayKit clip                                                                                                                                                                                                                |
| ----------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| idle              | Paladin and Berserker `Melee_2H_Idle`; Firebrand, Cleric and Harpooner `Idle_A`; the dummy `Skeletons_Idle`                                                                                                                |
| run               | `Running_A`                                                                                                                                                                                                                |
| attack            | Paladin `Melee_2H_Attack_Chop`, Berserker `Melee_2H_Attack_Slice`, Firebrand and Cleric `Ranged_Magic_Shoot`, Harpooner `Throw`, the dummy `Melee_Unarmed_Attack_Punch_A`                                                  |
| signature         | Paladin `Hammer_Slam` (posed at load from `Melee_2H_Attack_Chop`), Berserker `Skeletons_Taunt` (and `Throw` when he grabs someone), Firebrand `Ranged_Magic_Raise`, Cleric `Ranged_Magic_Summon`, Harpooner `Fishing_Cast` |
| hit               | `Hit_A`                                                                                                                                                                                                                    |
| airborne, landing | `Jump_Idle`, `Jump_Land`                                                                                                                                                                                                   |
| downed, get up    | `Death_A` played fast, then `Lie_StandUp`                                                                                                                                                                                  |
| death, victory    | `Death_A`, `Cheering`                                                                                                                                                                                                      |

Each attack, signature and throw is timed so its strike frame lands on
the tick the sim resolves it (`gestureTiming` in
`apps/client/src/game/views/hero-figures.ts`). Not used yet: `Fishing_Tug`,
`PickUp` and `Holding_A` for the grab, `Hit_B`, `Lie_Down`, `Lie_Idle`, and
`Spawn_Air` for the drop-in (§6).

**Missing clips, and how to cover them:**

- **The slam.**
  - The prototype's `Hammer_Slam` is not a clip of its own. It samples
    the 1.0 clip `2H_Melee_Attack_Chop` at 0.55 s and 0.9 s, and `Idle`
    at 0 s. Then it adds rotations to the chest, spine and head and a
    height shift to the hips, keyed to the beat timings (`py()` in the
    prototype).
  - Re-author it against 2.0: sample `Melee_2H_Attack_Chop` and `Idle_A`
    on Rig_Medium, and redo the offsets by eye. The four bones it touches
    all exist in Rig_Medium.
  - In Phase 3, also try Rig_Large's `Melee_2H_Slam` on the Knight. The
    bone names match, so it binds. But its position tracks are sized for
    the bigger body, so they need stripping or rescaling. This is
    untested.
- **Tumbling, falling, stunned, the panic run.**
  - No clips exist for these. We make the motion in code instead:
    - Tumbling is the cosmetic spin in §5.4, over `Jump_Idle`.
    - The panic run is `Running_A` played fast, with the zig-zag and
      flailing added in code.
    - Stunned is `Idle_B` with a wobble and stars.
  - If that falls short, request clips in `missing_assets.md`, or
    retarget Quaternius's Universal Animation Library 2. It is CC0 and
    has `Hit_Knockback`, `LayToIdle` and `OverhandThrow`. Its
    `IDLE_SHIELD_BREAK` might stand in for stunned, though its motion is
    unchecked.

### 7.3 Arena and props

| Pack                                                   | Free tier (all CC0)                                                               | Use                                                                                                                                         |
| ------------------------------------------------------ | --------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------- |
| KayKit Forest Nature                                   | 100+ trees, rocks, bushes and grass                                               | The forest glade arena (§11)                                                                                                                |
| KayKit Dungeon Pack 1.1                                | 200 pieces: walls, floors, stairs, doors, chests, barrels, crates, traps, banners | The dungeon arena. The prototype's arena is built from it: floor tiles, torches, blue and red banners, columns, barrels and stacked crates. |
| Fantasy Weapons Bits                                   | 25+ weapons, including hammers and a spear                                        | The harpoon. A hammer, if the code-built one looks wrong next to pack art.                                                                  |
| KayKit Medieval Hexagon, Halloween Bits, Resource Bits | Hex tiles and buildings, graveyard pieces, wood, stone and ore                    | Later arenas and debris                                                                                                                     |

- **Mixing packs.** Kenney's nature and graveyard kits (CC0,
  flat-coloured) mix in acceptably where KayKit has a gap.
- **Poorer fits.** Quaternius's Stylized Nature MegaKit is textured.
  Kenney's and styloo's characters look different. Keep all of these out
  of the character line-up.

### 7.4 Effects

- **We draw every spell ourselves,** with our own particles and effect
  materials. We don't add a particle library.
- **Textures, all CC0:**
  - Kenney Particle Pack: 80 sprites, including slashes, sparks, smoke,
    flames and stars.
  - Kenney Smoke Particles: 70 smoke sprites. They are single frames, not
    flipbooks.
  - Screaming Brain Studios' noise packs, for dissolves and flowing
    fire.
- **For reference only, never shipped:** the prototype, and Binbun's
  Hit, Explosion and Status FX (CC0 Godot shaders we can port ideas
  from).

### 7.5 Sound and music

- **Sound effects:**
  - All CC0: Kenney Impact Sounds (130), RPG Audio (50), Interface Sounds
    (100) and UI Audio (50), and OpenGameArt's "80 CC0 RPG SFX".
  - Freesound, filtered to CC0, or to CC-BY with a credit in
    `CREDITS.md`. Its CC-BY-NC and Sampling+ sounds are out.
- **What they don't cover** goes into `missing_assets.md` with each hero's
  slice. That means signature sounds such as the hammer charge and slam,
  the fuse hiss, the bubble's blow and pop, the chain rattle and the
  Berserker's roar. They are made with the existing ElevenLabs pipeline
  (`docs/audio.md`).
- **Music.**
  - Entry 7 in `missing_assets.md` stays.
  - Free options:
    - Tallbeard's Music Loop Bundle: CC0, mostly chiptune and ambient.
    - Farbeyond's Fantasy Music Loops: CC-BY 4.0, so it needs a credit.
- **Shapeforms has the best free magic sounds,** but its licence forbids
  redistribution. That is why it is excluded (§7.1).

### 7.6 Import pipeline

- **The import script** is `pnpm models:import`
  (`scripts/models/import.ts`). The plan was glTF-Transform, but that is
  a new dependency nobody approved, so the script reads and writes glTF
  itself (`scripts/models/gltf.ts`). It:
  - reads the raw packs from `art/vendor`;
  - keeps only the bodies, props and clips the catalogue names;
  - merges each body into one skinned mesh per material;
  - writes one shared clip file for Rig_Medium, built from the Character
    Animations category files, one file per body and per prop, and the
    pack textures as PNGs;
  - does not quantise yet. The output is 2.55 MB: bodies 1.7 MB, clips
    0.6 MB, props and textures 0.26 MB.
- **The model contract** is `pnpm models:check`
  (`scripts/models/check.ts`). It checks:
  - Rig_Medium bone names, and that every vertex is skinned;
  - that each file is painted with its pack texture, which stays out of
    the model file;
  - that the clip file holds exactly the mapped clips, and that every
    cue plays one;
  - that every hero has a model with an attack, and that every imported
    body and prop is used;
  - a size budget per file.
- **Portraits** for the cut-in and chain banners are rendered from the
  bodies when the game loads. So the five heroes need no painted portrait
  art. Not built yet.

## 8 What stays and what goes

### 8.1 The engine, file by file

Today the kept core imports the old layer. `state.ts` and
`create-battle.ts` import `builds/`. `step-battle.ts` imports `combat.ts`,
`timed.ts` and `triggers.ts`, and `abilities.ts` imports `builds/`. So
Phase 1 can't just delete: it rewrites these files around a minimal
combat layer in the same change.

| File (lines)                                                                                                                              | Phase 1                                                                                                                         | Later                                          |
| ----------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------- |
| `ids.ts` (11), `constants.ts` (9), `random/rng.ts` (30), `board/cells.ts` (105), `battle/result.ts` (21), `battle/recording.ts` (40)      | Stay as they are                                                                                                                | —                                              |
| `math/vector.ts` (33)                                                                                                                     | Stays                                                                                                                           | Phase 2: `Math.sqrt` instead of `Math.hypot`   |
| `battle/movement.ts` (316)                                                                                                                | Stays                                                                                                                           | Phase 2: no trig and no `Math.hypot` (§5.3)    |
| `battle/targeting.ts` (413)                                                                                                               | Stays, minus the corpse, revive, explode and puppet helpers                                                                     | Setup-aware targeting in Phases 4–6 (§4.3)     |
| `battle/areas.ts` (111)                                                                                                                   | Stays: the circle, ray and line queries                                                                                         | —                                              |
| `battle/damage.ts` (15)                                                                                                                   | Stays, minus shields and slows                                                                                                  | —                                              |
| `definitions.ts` (663)                                                                                                                    | Rewritten: hero stats, the basic attack and the signature. The upgrade, gem, item, passive, condition, combo and form types go. | Signatures grow with each hero                 |
| `battle/state.ts` (326)                                                                                                                   | Rewritten: no build, compiled abilities, forms, bombs or combo tiers                                                            | Phase 2: elevation, motion, radius and bubbles |
| `battle/create-battle.ts` (337)                                                                                                           | Rewritten: units come straight from hero definitions, not from `compileBuild`                                                   | —                                              |
| `battle/step-battle.ts` (444)                                                                                                             | Rewritten around the new layer. The tick order stays.                                                                           | Phase 2: the order in §5.3                     |
| `battle/abilities.ts` (198)                                                                                                               | Rewritten: basic attacks and engage range                                                                                       | Phase 2: signatures                            |
| `battle/statuses.ts` (213)                                                                                                                | Rewritten: shields, slows, conditions, chill, links, grave marks, channels, taunts, damage over time and pandemic go            | Phase 2: the states in §4.1                    |
| `battle/events.ts` (278)                                                                                                                  | Rewritten: attack, damage, death, mana and result events                                                                        | Phase 2: the events in §5.3                    |
| `battle/snapshot.ts` (86)                                                                                                                 | Rewritten to match the state. Zones, emitters and pending impacts go.                                                           | Phase 2: elevation, motion, radius and bubbles |
| `index.ts` (59)                                                                                                                           | Its exports follow the files                                                                                                    | —                                              |
| `battle/combat.ts` (4,858), `battle/timed.ts` (569), `battle/triggers.ts` (728), `battle/sequences.ts` (369), `battle/conditions.ts` (57) | Deleted                                                                                                                         | —                                              |
| `builds/*` (2,117)                                                                                                                        | Deleted                                                                                                                         | —                                              |

### 8.2 Stays

| Area             | Stays                                                                                                                                                                                                                                                                                                                                                                                                   | Changes                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| ---------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Engine           | The files in §8.1 that stay, and the lint-enforced purity                                                                                                                                                                                                                                                                                                                                               | `HeroBuild` becomes just a hero id                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| Run              | Seats, pairings, seed streams, phases, draft, formation, run health                                                                                                                                                                                                                                                                                                                                     | The reward phase goes, with the rules fields for items, gems, rarity and surprises. If §11 drops recruit too, `recruitOfferCount` and `maxTeamSize` go with it. Phase 1 runs with `heroOfferCount` 1 and `draftPicks` 1, and Phase 7 sets the real numbers.                                                                                                                                                                                                                                                                                                                                                                                                      |
| Server           | `packages/server-runtime` (the match room, deadlines, reconnection, solo "Fight!") and `apps/server`                                                                                                                                                                                                                                                                                                    | Reward deadlines and inventory commands go. The room requires `protocolVersion` and `simHash` on join, and sends each battle's event digest (§5.3).                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| Protocol         | Zod messages and per-seat views                                                                                                                                                                                                                                                                                                                                                                         | Four messages go (`choose-offer`, `move-item`, `socket-gem`, `discard-item`), with the `skill` enum and the rejection reasons only they use: `unknown-decision`, `unknown-piece`, `no-room`, `gem-does-not-fit`, `ineligible-upgrade` and `team-full`. If §11 keeps levels or recruit, `choose-offer` and its reasons stay for those. Join options gain `simHash`, and resolved battles gain a digest. Bump the version from 9 to 10.                                                                                                                                                                                                                            |
| Jev              | Driver, providers, timeouts, fallback to the baseline bot, drafting                                                                                                                                                                                                                                                                                                                                     | Reward questions go: `probe.ts` loses its reward phase and question, and `observations/describe.ts` loses the school combo rules, attunement and traits lines. Prompts are built from catalogue text, so the new heroes need good descriptions. `school`, `archetype` and `appliesCondition` are no longer shown.                                                                                                                                                                                                                                                                                                                                                |
| Client rendering | `BoardStage` (render loop, camera fit and chase, `focus`, `setExposure`), GPU particles, pooled and warmed effect materials, bloom, shadows, graphics settings, `merge-static`, stage monitor and frame sampler, DOM health bars and damage numbers, `round-playback`, and the generic helpers in `battle-effects.ts` (`projectile` with its delayed launch, `arc`, `marker`, `delay`, `step`, `clear`) | `BoardStage.frame()` gets a time scale for slow motion and hitstop. Particles only advance a time uniform, so they scale for free. It also gets a camera-punch offset. `battle-view` draws flights from `motion` (§5.4) instead of sliding moves and snapping ones over 20 units. `projectile` and `arc` take the visual or colour to draw instead of an ability id; today they look up the old spell visuals and hit kinds. There are no slow motion, hitstop, shake or screen flash today. The physics pass removed `impactFlash`, whose flat disc whited out the screen: nothing calls it now.                                                                |
| Figures, models  | The `HeroFigure` interface, the `createHeroFigure` choke point and `figure-base` (team ring, contact shadow)                                                                                                                                                                                                                                                                                            | The first build removed the old loader (`models/library.ts`, GLTFLoader with meshopt), `model-figure`, the placeholder upgrade and the crate and barrel GLBs: nothing used them. Phase 3 wrote the loader fresh (`apps/client/src/game/models/library.ts`); the old one is at `pre-pivot`. A clip-name map replaces exact clip names. KayKit ships clips separately, so the loader loads one shared clip file and binds it to each body by bone name. Weapons attach to the hand slots. Team colour comes from the ring, not a white `team` material; the two Mages also get a texture tint each. The contract in `scripts/models` is rewritten for pack models. |
| Environments     | `environment.ts` and `prop-kit.ts` (mounting, seeded placement, `mergeStatic`, animators) and the `#env` lab                                                                                                                                                                                                                                                                                            | Pack props load before `theme.build` runs, because it is synchronous. `preload("props")` exists, but nothing calls it yet. Repeated props are instanced: the cove theme alone costs about 574 draw calls today.                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| Client audio     | Engine, line and voice policies, settings, `battle-sounds` and `hero-voices`. The generic sounds stay until packs replace them: 11 UI and flow sounds, 8 battle sounds (two swings, blunt and blade hits, two crits, stun and death), and the 3 teleport sounds until the drop-in replaces the teleport beat.                                                                                           | Hero, ability and voice tables start empty. `audio:check` follows the new catalogue.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| Client HUD       | Shell, draft, formation, event log, battle controls                                                                                                                                                                                                                                                                                                                                                     | Reward, loadout, level and upgrade panels go. The Underlords restyle is revisited once the art direction settles.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| Labs             | The battle lab (the default route) and its scenario editor, `#env`                                                                                                                                                                                                                                                                                                                                      | New presets and the physics debug control. The scenario editor validates against the new roster. `#models` went with the old loader.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| Content          | `formations.ts`, `arenas/board-arena.ts`                                                                                                                                                                                                                                                                                                                                                                | New roster files                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| Docs             | `architecture.md`, `phase-status.md` and `audio.md`, plus `decisions.md` and `board-and-renderer-plan.md` kept as history                                                                                                                                                                                                                                                                               | Updated as each phase lands                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |

### 8.3 Goes

Measured on 2026-09-28. About 60 source and doc files mention the old
hero ids, and 66 mention their names. About 250 asset files are named
after heroes. About 27,000 client lines are hero figures, models and
spell visuals.

- **Roster**
  - `packages/content/src/roster/*` (10 files, 2,125 lines), which holds:
    - the 3 summons;
    - about 41 abilities;
    - 60 levels.
  - The duel and 3v3 scenario teams.
  - The roster sections of `validate-catalogue.ts`.
- **Builds and the old combat layer**
  - The engine files marked deleted in §8.1.
  - `pieces/gems.ts` (29 gems) and `pieces/items.ts` (43 items, 2 abilities).
  - Attunement, and the school conditions and combos.
  - About 45 passive kinds, 6 effect kinds and 9 ability shapes.
- **Run, protocol, server and Jev**
  - `rewards.ts`, `inventory.ts` and `test/inventory.test.ts` in
    `packages/run`, and the reward milestones.
  - The four protocol messages, their handlers, and the reward deadlines
    (§8.2 has the details).
  - Jev's `choose-reward.ts` and `option-keys.ts`.
  - The reward flow in `apps/server/test/match.test.ts`.
- **Client**
  - **Figures and models:**
    - `hero-figures.ts`, except the `HeroFigure` interface and
      `createHeroFigure`. `levelFigureScale` goes with levels.
    - `moira-figure.ts`, `morrow-figure.ts`, `nettle-figure.ts`,
      `rime-figure.ts`, `vesper-figure.ts` and `cyclone-effect.ts`.
      `figure-base.ts` stays.
    - `models/{moira,morrow,nettle,rime,vesper,sculpt}`.
    - All of `models/`, `model-figure.ts`, the `#models` lab and every
      GLB, the crate and barrel props included.
  - **Spell visuals:**
    - All of `spell-visuals.ts` (2,111 lines). Every builder in it was
      made for an old spell, even the general-looking ones such as
      `meteorBlast` and `groundShockwave`.
    - `dusk-`, `fate-`, `blight-`, `shrine-` and `frost-visuals`, plus
      `fate-threads`, `thread-tube`, `hex-critters`, `ice-kit` and
      `tick-clock`.
    - In `hit-effects.ts`: `ABILITY_HITS` and the hero hit kinds (fire,
      frost, dark, thorn, rivet, holy, fate). Strike, blunt and blade
      stay.
    - In `battle-effects.ts`: `comboBurst` and `CONDITION_COLORS` (old
      combos and conditions).
    - The hero branches in `battle-view.ts`:
      - inferno, harvest, omen and dusk dashes;
      - frozen, bone golem, overclock, fate threads and hex critters;
      - voidheart, hex, sanctuary, ember trail, shared fate and plague
        ring;
      - the condition ring under each unit.
  - **Benches:** `spell-bench`, `frost-bench` and `bench-rig`, plus the
    `#sculpt` and `#sandbox` scenes.
  - **HUD:**
    - the `rewards`, `loadout`, `levels` and `upgrade-picker` panels;
    - the hero and item parts of `hero-card`, `tips`, `icons` (including
      `heroGlyph`), `tooltip` and `unit-inspector`;
    - hero colours and `[data-role]` blocks in `style.css`;
    - the main menu's three heroes.
  - **Audio:**
    - every table keyed by hero, ability, form, passive or upgrade in
      `sound-map.ts`, and `HERO_LINES`;
    - 66 hero sounds (abilities, bolts, hero hit kinds, summon deaths), 3
      item sounds, the 3 `combo-*` sounds, `shield-up`, `recruit` and
      `reward-claim`;
    - the 50 voice lines.
  - **Icons:** 10 heroes, 10 faces, 29 gems, 43 items and 60 levels.
  - **Tests:**
    - Delete the 5 tracked hero tests and the 2 untracked ones.
    - Edit the 6 tests that use hero ids as test data.
- **Scripts**
  - `balance-survey.ts` and `survey/*`, once `contentHash` has moved out
    (§5.3).
  - The icon pipeline (`scripts/icons`).
  - The custom model build and check. The KayKit import and its own
    check replace them.
  - `simulate.ts` moves to the new scenarios.
- **Art**
  - `art/models/heroes`.
  - `art/explorations`.
  - The Blender generators and kits in `art/generators` and
    `art/pipeline`. Crates and barrels go too once pack props replace
    them in Phase 3.
  - Icon masters and `prompts.json`.
  - Hero voice lines and sound takes in `art/audio`.
- **Board themes** built from primitives (`cove`, `ruins`, `frost`,
  `bazaar`). They go in Phase 3, when the first pack arena lands. With
  them go `props.ts`, `forms.ts`, and the theme picker in
  `board-choice.ts`, which has nothing to pick between until there is a
  second arena.
- **Docs and skills**
  - `hero-redesign.md`, `heroes-and-builds-design.md`, and `lore.md` (a
    new setting comes with the meta).
  - `models.md` and `icons.md`, rewritten for the new pipeline.
  - The `new-hero` skill, rewritten for KayKit bodies in Phase 3.
  - The hero sections of `architecture.md`, `audio.md` and
    `phase-status.md`.
  - In `missing_assets.md`:
    - entries 8 (hero models), 9 (board tiles), 11 (school and condition
      icons), 13 (condition and combo textures) and 30 (Brassjack's mech)
      go;
    - entries 10 (effect textures) and 12 (status icons) are rewritten
      for the new signatures and the states in §4.1;
    - the style guide's art style, its hero portrait and glyph lines,
      and its 3D model rules are rewritten for chibi pack art in Phase 3.

The `decisions.md` entries about deleted systems stay as history. The
pivot entry lists the ones it supersedes.

## 9 Migration phases

Each phase ends with something you can run and look at. No phase starts
until the previous phase's gameplay question has been answered; that rule
comes from the implementation plan. The numbers in the exits are starting
targets, and can be tuned.

**Progress (2026-09-28).** The user said to "just start building" and
purge old code on the way, so the phases ran together on stand-in bodies
rather than one at a time. `docs/decisions.md` ("Bone & Banner, first
build") says what went and what stayed.

- **Phase 0:** tagged `pre-pivot`. Not done: the prototype copy in
  `art/reference`.
- **Phase 1:** done. The draft now offers all five heroes and a team
  picks three (Phase 7).
- **Phase 2:** the engine, physics, `pnpm test`, golden tests, the
  version and sim-hash check on join, and the digest desync check are
  built. Not done: the browser matrix, and the lab control that
  launches, floats or ignites a unit.
- **Phase 3:** the heroes are KayKit models.
  - The four free packs are in `art/vendor` with their licence files
    and listed in `CREDITS.md`. `pnpm models:import` and
    `pnpm models:check` are the pipeline (§7.6).
  - Every hero got its body at once, not only the Knight and the
    Skeleton Minion: the user asked why the heroes didn't look like
    KayKit. The Cleric is a tinted Mage (Q5).
  - The lab fight holds 60 fps at 190 to 220 draw calls and about 135k
    triangles, measured in Edge on the user's GPU.
  - The Paladin's slam is the prototype's swing (2026-09-29): a giant
    hammer built in code and the prototype's `Hammer_Slam` clip, posed
    at load from `Melee_2H_Attack_Chop`.
  - Not done: the first arena (Q3), a closer camera, the new style guide
    and a model lab. From the board camera the two Mages show mostly
    hat.
  - The old model loader, the `#models` lab and the crate and barrel
    GLBs were removed, though §8.2 first kept them: nothing used them,
    and the KayKit import needed a new loader anyway. The old one is at
    `pre-pivot`.
- **Phases 4 to 6:** all five signatures and the combo rules run in the
  engine, and the client plays them back on the KayKit bodies. Their sounds
  are requested in `missing_assets.md` entry 31. The Phase 4 sign-off is
  the user's.
  - The physics pass (2026-09-29) ported the prototype's tumbling,
    bouncing and squashing bodies, its meteor for Short Fuse's blast and
    its Berserk swell for Rampage. `docs/decisions.md` has the reasons.
  - Phase 5's exit passes: the `comet` preset links in 99 of 100 seeds.
  - Phase 6's exits have not been measured cell by cell. Big Bubble into
    Hammerfall (`bubble-and-bat`) links in 3 of 100. The Yank into
    Hammerfall (`reel-in`) links in 77, down from 89 before the slam's
    fixed reach: in 18 of the 23 misses the Paladin had slammed a group
    80 to 130 ticks before the Yank and hadn't the mana to slam again.
- **Phase 7:** built. The room tests run two humans and six bots to the
  end, and seven Jev seats through a draft. The exit's run, 2 humans and
  6 Jev seats watched in browsers for digest mismatches, hasn't been done.
- **Phase 8:** not started.

### Phase 0: snapshot and decide

- **Commit the current work.** This needs the user.
  - `git status` lists about 400 modified files. Only 230 of them have
    content changes (`git diff`); the rest differ only in line endings,
    because `core.autocrlf` is on.
  - 18 files are untracked: 17 from the Rime work, plus this plan.
    `hero-figures.ts` already imports the untracked `rime-figure.js`.
  - Commit it all, check that the commit holds the 230 real changes and
    no line-ending churn, then tag `pre-pivot`. The old game is then
    recoverable from git history rather than kept in the tree.
- **Answer §11.**
- **Record the decision.** Done for the user's own decisions: see the
  pivot entry in `docs/decisions.md`, which also lists the entries it
  supersedes. Once §11 is answered, add the answers there and mark this
  plan as agreed.
- **Copy the prototype into the repo** at
  `art/reference/bone-and-banner.html`, stored with Git LFS (it is 8 MB).

### Phase 1: tear down to a minimal fight

- **Delete everything in §8.3,** in one branch.
- **Rewrite the engine files in §8.1** around a minimal combat layer:
  basic attacks, damage, death and mana gain. There are no signatures,
  crits or states yet.
- **Add a Training Dummy.** It is a catalogue hero, not a summon, so the
  draft can offer it. It only has a basic attack.
- **Phase 1 run rules:** `heroOfferCount` 1 and `draftPicks` 1.
  - Today's 5 and 3 can't be met with one hero.
  - Offers are drawn without replacement (`packages/run/src/offers.ts`).
  - A draft must commit exactly `draftPicks` distinct offers
    (`packages/run/src/commands.ts`).
- **Rewrite the room tests.**
  - 8 of the 18 tests in `apps/server/test/match.test.ts` assume five
    offers and three picks, or expect a reward decision. They start at
    lines 156, 183, 203, 219, 270, 344, 433 and 572.
  - Rewrite them for one offer and one pick, and delete the reward
    timings.
- **Bump the protocol version** to 10, since the reward commands go.
- **Exit:**
  - `pnpm typecheck`, `pnpm lint` and `pnpm build` pass.
  - The server's room tests pass.
  - The lab runs dummy against dummy.
  - An online run of Training Dummies finishes, with drafting and
    formation only.

### Phase 2: engine core for physics

- **Write the new combat layer:** damage, crits, mana, signatures as small
  state machines, and the states in §4.1.
- **Add the physics** from §5.3: motions, launches, wall bounces,
  juggles, bubbles as entities, and the tick order.
- **Make the maths deterministic,** with the lint rule.
- **Add the safety nets from §5.3:**
  - the test harness and a root `pnpm test`;
  - golden tests;
  - the browser matrix;
  - the version check on join;
  - the desync check.
- **Add presentation time:** `beat` events, the per-battle timeline, the
  new round hold, and per-battle clocks in `round-playback.ts` and
  `match-scene.ts` (§6).
- **Add a debug control** in the lab that launches, floats or ignites
  the selected unit.
- **Exit:**
  - Golden tests pass, and the browser matrix agrees on 100 seeds.
  - In the lab, a dummy flies, bounces off the wall, lands, skids and
    gets up.
  - A dummy launched again mid-flight carries on from its height.
  - A floated group moves as one when it is hit.
  - The arc on screen matches the engine's position at every tick.

### Phase 3: assets and look

- **Import pipeline:** the import script and the rewritten model
  contract from §7.6.
- **Records:** vendored packs with their licence files, and `CREDITS.md`
  (§7.1).
- **The first arena,** built from the chosen pack.
- **Two bodies only: the Knight and the dummy's Skeleton Minion,** on a
  `HeroFigure` adapter:
  - a map from our clip names to KayKit clip names;
  - weapons attached to the hand slots;
  - team colour from rings and a tint.

  Every later hero slice imports its own body, so art never runs ahead of
  the fight (Pillar 5).

- **The slam:** re-author `Hammer_Slam` for Rig_Medium, and try Rig_Large's
  `Melee_2H_Slam` on the Knight (§7.2).
- **A closer camera** for chibi scale.
- **A new style guide** in `missing_assets.md`.
- **Exit:**
  - The Knight and the dummy idle, run, attack and die on the new arena
    in the lab.
  - A model lab, rebuilt with the loader, shows them.
  - The frame budget from the frame-drop work holds: about 200 draw calls
    mid-fight.

### Phase 4: tracer bullet, the Paladin

- **Engine:** Hammerfall with its wind-up, impact, launch and the
  Juggle rule, plus melee crit hops.
- **Client:**
  - a giant hammer drawn in code;
  - the telegraph;
  - slow motion, hitstop, the field-of-view punch, shake and flash;
  - the crater, shockwaves and debris;
  - tumbling flights, squash on landing and the get-up hop;
  - the cut-in banner and damage numbers.
- **Sounds:**
  - hits, landings and debris from Kenney's CC0 packs;
  - the charge and the slam requested in `missing_assets.md` (§7.5).
- **Exit:**
  - The slam's beats land on the prototype's ticks: impact at 1.12 s,
    and 2.25 s in total.
  - Every dummy within 1.6 cells is launched.
  - The frame budget holds through the slam.
  - The user signs off on one Paladin against five dummies, side by side
    with the prototype.
  - Its golden test is recorded.

### Phase 5: Firebrand and the first combos

- **Firebrand:** the Mage body, Short Fuse, the panic run, fire spreading,
  and the explosion.
- **Combo rules:** Comet and Hot Potato.
- **Follow-up system:** ready-and-waiting, chains, `combo-link` and the
  chain banner.
- **Exit:**
  - In at least 60 of 100 seeds of "Paladin and Firebrand against five
    dummies", a chain has at least one link.
  - `pnpm simulate` reports that combo rate.

### Phase 6: Berserker, Bubble Cleric, slot 5

- **One hero per slice.** Each slice lands with:
  - its body;
  - its combos with the heroes already built;
  - a lab scenario;
  - a golden test.
- **Exit:**
  - Every filled cell of §4.4 happens in at least 1 of 100 seeds of its
    lab scenario.
  - A chain of three or more links, like §4.5, happens in at least 10 of
    100 seeds of five heroes against five.

### Phase 7: back to the match

- **Run rules** (recommended; the user decides in §11):
  - every seat is offered all five heroes, and picks three;
  - both teams may field the same hero, but a team fields each hero once;
  - no recruit, so teams stay at three.

  With exactly five heroes, every seat gets the same offer anyway. The
  draft becomes a choice of which three combo best.

- **Round hold:** includes the presentation beats (§6).
- **Jev:** drafts three of five. Its prompts explain the states and
  rules in §4.
- **Exit:** a full online run with 2 humans and 6 Jev seats finishes with
  no digest mismatches.

### Phase 8: the new meta

- **Its own doc.** Upgrades, economy, more heroes, and perhaps neutral
  creep rounds.
- **Run as experiments.** It follows Phase 8 of the implementation plan,
  whose `docs/experiments.md` template gets created then.

## 10 Risks

| Risk                                                                  | Answer                                                                                                                                                                                                                          |
| --------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Browsers disagree and replays diverge                                 | Maths limited by lint, golden tests, the browser matrix, and a per-battle digest that the client checks. If it still happens, the server sends recordings instead of setups. That is a protocol change and a new playback path. |
| A client on an older build replays differently                        | The `simHash` check on join. The room refuses a mismatch.                                                                                                                                                                       |
| Big effects make the fight unreadable                                 | Telegraphs, one slow-motion moment at a time, an effect budget, and chain banners that say what happened                                                                                                                        |
| Combos too rare (random timing) or too common (always the same chain) | Ready-and-waiting with 1.5 s of patience, the combo rate from `pnpm simulate`, then tuning                                                                                                                                      |
| New heroes read as old ones                                           | The clashes in §3.7 are renamed or reshaped                                                                                                                                                                                     |
| Packs don't match each other                                          | One family (KayKit) for characters, arena and props. Others only where the palette fits.                                                                                                                                        |
| Licences                                                              | The repo is public, so only CC0, CC-BY and MIT files go in. Every pack is vendored with its licence file and listed in `CREDITS.md` (§7.1).                                                                                     |
| Rewriting the combat layer is big                                     | A minimal layer first (Phase 1), then the tracer bullet, one hero per slice, and golden tests from Phase 2                                                                                                                      |
| With no rewards, the match loop is thin                               | Accepted until Phase 8. The fun is found in the lab first.                                                                                                                                                                      |
| Frame rate with debris and particles                                  | Body and particle caps, instancing, merged statics, and the stage monitor's numbers                                                                                                                                             |

## 11 Open questions

The first build went with the recommendation for questions 1, 2, 4 and
7 to 10. The user hasn't confirmed those. The user answered question 5.
Questions 3 and 6 are open.

1. **Slot 4:** Bubble Cleric (recommended), Bell Cleric or Mushroom Druid?
   Built: Bubble Cleric.
2. **Slot 5:** Harpooner (recommended), Skeet Ranger or Catapult Engineer?
   Built: Harpooner.
3. **Arena:** a forest glade (KayKit Forest Nature), or the prototype's
   dungeon (KayKit Dungeon Pack)? Both are free and CC0.
4. **Match:** keep the online match and Jev running through the pivot
   with drafting and formation only (recommended), or park `#match` until
   the lab fight is fun? Built: the match and Jev stay.
5. **Spend $7.95 on KayKit Adventurers EXTRA?**
   - It adds the Druid, which gives the support its own body instead of a
     second Mage, and the Engineer, for the Catapult Engineer
     alternative.
   - It also adds 3 alternative textures per character.
   - Everything else in this plan is free.
   - Answered: not for now. The Cleric is a tinted Mage (the user,
     2026-09-28).
6. **Berserker:** how far should the rework go? §3.2 proposes growing 3×
   instead of 6×, lasting 5 s instead of 6 s, losing spell immunity, and
   throwing instead of knocking back and whirling. Or should he stay
   closer to the prototype's Berserk?
7. **Levels:** scrap hero levels along with gems and items (recommended),
   or keep level-ups? Built: no levels.
8. **Recruit:** today teams grow from three heroes to five through recruit
   rewards. Drop recruit and keep teams at three (recommended), or keep
   it as the one reward? Built: no recruit.
9. **Team rules for Phase 7:** each seat picks three of the five with
   mirrors allowed (recommended), or every team fields all five and only
   places them? Built: three of five, mirrors allowed.
10. **Names (§3.7):** "Hammerfall" or the prototype's "Hammer of
    Judgement", which is close to Morrow's "Judgment"? "Short Fuse", or
    keep "Living Bomb", which Cinder also has? Built: Hammerfall and
    Short Fuse.
