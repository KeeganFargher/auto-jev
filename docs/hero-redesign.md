# Hero redesign: kits, gems, items and levels

Status: slices 1 and 2 are built (2026-09-24, §13 and §14): the engine
grammar, gems in place of runes, levels in place of talents, the new kits
for Vesper, Gorrak, Anvil and Cinder, 12 new gems and 10 new items. The
other six heroes, the rest of the items and the tuning pass are still to
come. When a slice lands (§10) it replaces the matching parts
of `docs/heroes-and-builds-design.md`:
the kits in §4 and §18, the runes in §5 and §19, the items in §6 and
§19, and the talent tiers. The combos (§2), the counter wheel (§3) and
the round track (§1) stay, with the changes in §8.

The goal: heroes that are fun to watch on their own, builds that differ
from run to run, and a late game where a few picks snap together into
something broken.

## 1 Why today's heroes feel flat

Measured and read from the code on 2026-09-24:

- **Abilities can't deliver attacks.** On-hit effects (cleave and the
  every-Nth-attack procs) only fire when `cast.isBasicAttack`
  (`packages/game/src/battle/combat.ts`, `applyOnHitPassives`). A
  Battle Fury build is impossible: Whirlwind never cleaves, and
  Shadowstep never procs anything.
- **Every repeat is neutered.** Echo, Twincast, Retaliate and the other
  triggered casts use `RUNE_TRIGGER_FLAGS` (Crown of Echoes lifts part of
  this). They can't crit, apply or detonate a condition, fire a passive,
  or trigger anything else, and a triggered cast can't even echo. A
  repeated cast is a weaker copy that can't start anything.
- **Loops would crash the fight.** Most triggered casts resolve inside
  the tick that caused them, capped at 16 (`MAX_TRIGGERED_CASTS_PER_TICK`
  in `timed.ts`). Going over is a simulation failure, and a failed battle
  aborts the whole online match.
- **Talents tweak numbers.** Of 60 talents, 18 only change numbers, 29
  add a passive and 13 modify an existing spell. The 13 mostly add a
  small extra effect to the spell rather than changing how it plays, and
  none adds a spell. The tier-3 capstones meant to "transform the hero"
  ended up as modifiers such as "Burn stacks up to 6".
- **Nothing ramps.** A hero at 25 s fights the same way it did at 2 s.
  What makes Slark fun is watching him get faster.
- **Every spell looks the same.** The battle view plays one generic
  `cast` animation and sound for every non-melee cast, and the model
  contract has a single `cast` clip.
- **Nothing is an ultimate.** Signatures fire 3–6 times a fight.

## 2 The references, and where they land

| Reference | What makes it fun | Where it lands here |
| --- | --- | --- |
| Slark (Underlords) | Every hit makes him faster; you watch him become a blur | Gorrak's **Blood Frenzy**, plus the **Essence Siphon** item |
| Ember Spirit + Battle Fury | Sleight of Fist hits everyone, and every hit cleaves | Vesper's **Thousand Cuts** and Gorrak's **Whirlwind** deliver attacks, so **Battle Axe** cleaves off every one |
| Flicker Strike (Path of Exile) | Teleport from enemy to enemy, faster and faster | Vesper's **Flicker Strike** and her **Frenzy** charges |
| Support gems (Path of Exile) | Multistrike, Multicast, Cast on Crit and Cast when Damaged create builds | **Gems** (§6), which replace runes |
| "Take X damage, then cast" loops | A build that feeds itself | **Cast when Damaged** + **Overcharge** or **Blood Pact**, under the loop rules in §5 |
| Whirlwind that pulls | An upgrade that changes the spell, not its numbers | Gorrak's level-3 **Maelstrom** |

## 3 Design rules

1. **Every hero has three parts, and each has a job:**
   - **Ability:** a cooldown spell, every 4–8 s. The hero's verb, what you
     see it do most.
   - **Passive:** the hero's ramp. Something visibly builds during the
     fight: stacks, charges, heat, souls.
   - **Ultimate:** the payoff. It charges from mana, lands about 10 s into
     the fight and fires once or twice a fight.
2. **Attacks and spells are different things, and skills say which they
   are.** A skill that "strikes" deals full attacks, so everything that
   works on attacks works on it. That one rule is what makes Battle Fury
   builds, Slark builds and Flicker builds possible.
3. **Everything speaks the same small set of tags** (§4). Gems fit by tag,
   and items key off tags, so one item can start a build on several
   heroes.
4. **Upgrades change what a spell does.** Level 2 may be a visible
   scaling pick (bigger, more hits). Levels 3 and 4 must change behaviour
   you can see.
5. **Loops are allowed, and they play out over time** (§5). A broken
   build should look broken on screen: a stream of casts, not one frozen
   frame.
6. **Every broken build has an answer** somewhere on the counter wheel or
   in an item. Before nerfing a build, add a counter.
7. **You can read it while watching.** Each hero shows three things above
   its head: health, the ultimate charging, and its passive's meter.

## 4 Tags and triggers: the shared vocabulary

**Hit types**

- **Attack:** a weapon hit. Basic attacks, and any skill that *strikes*.
  Attack damage, crits, on-hit effects, cleave, lifesteal and Multistrike
  apply.
- **Spell:** a cast effect. Spell damage, Multicast and Spellblade apply.
  On-hit effects don't apply, unless an item says spells count as
  attacks (Spellblade Hilt).

**Delivery tags** (what gems and items fit):

| Tag | Examples |
| --- | --- |
| Strike | Flicker Strike, Leap Slam, Thousand Cuts |
| Target | Hex, and other single-target spells |
| Projectile | Shield Toss, Fireball, Judgment, Frozen Orb's shards |
| Area | Leap Slam's landing, Fireball's blast, Meteor Shower, Plague Bloom |
| Dash | Flicker Strike, Leap Slam, Thousand Cuts |
| Channel | Whirlwind, Mech Suit |
| Zone | burning ground, Plague Bloom, Hallowed Path |
| Summon | turrets, thralls, the Army of the Dead |
| Link | Shared Fate |

**Trigger events:** hit, crit, kill, dash, damage taken, cast, combo
detonated, Nth attack, fight start, death.

**Rules that stay:** the schools (Might, Arcana, Cunning), their
conditions and the three combos (design doc §2), attunement, and armor
and crits. Every hero keeps a school and one condition it applies. The
combos are the team layer; gems and items are the build layer.

## 5 Loop rules

This replaces "rule 5" in design doc §2 (triggered casts can't trigger
anything). The user asked for recursive loops; these rules allow them
and still guarantee a fight ends and stays readable.

1. **Triggered casts are real casts.** They can crit, proc on-hit, apply
   and detonate conditions, and fire other triggers. Retire
   `RUNE_TRIGGER_FLAGS` for them.
2. **Every trigger has a recharge.** While it's recharging it can't fire.
   The recharge is shown as a sweep on the gem's icon in the tooltip.
3. **Triggered casts start later.** Never inside the tick that caused
   them: at least 3 ticks (0.1 s) later, the way Echo already schedules
   its recast (`state.echoes`). A loop becomes a visible sequence, and
   the work per tick stays bounded.
4. **One triggered cast per unit per tick.** Extra triggered casts for the
   same unit queue for the following ticks.
5. **A triggered cast doesn't touch the skill's own cooldown or mana.**
   The trigger's recharge is its only limit.
6. **The per-tick budget stays as an alarm.** No legal build should ever
   reach it. The survey's broken-build hunt must report zero
   `reaction-budget-exceeded` events. If one appears, it's a bug.
7. **Loops have answers:**
   - stuns, freezes and Hex interrupt a dash sequence or channel
     (Whirlwind is the named exception: it's unstoppable);
   - **Null Talisman** stops enemies near the holder from triggering;
   - **Cast when Damaged** ignores poison and burn ticks, so Blight
     starves retaliation builds.
8. **Chains are shown.** Triggered casts that trace back to the same
   original cast form a chain. A counter over the hero shows "×2… ×7…",
   and resets after 1.5 s without a new link. From ×5 it gets a flourish.

## 6 Gems

Gems replace runes. Every hero has **1 gem socket in its ability and 1 in
its ultimate**. **Train** (recruit-or-train rounds) adds a socket to
either skill, and **The Unbound** adds one to both. A gem only fits a
skill with a matching tag. Gems can be moved between heroes during prep,
as runes are today.

"New" marks gems with no rune today. §10 says which slice brings each.

**Repeat**

| Gem | Fits | Effect |
| --- | --- | --- |
| Multistrike (new) | Attack skills | The skill's strikes repeat twice more, 0.25 s apart, at 70% |
| Multicast (new) | Spell | The spell casts again 0.3 s later at 70% (replaces Echo and Twincast) |
| Barrage (new) | Projectile | +2 projectiles in a spread, each at 60% |

**Shape**

| Gem | Fits | Effect |
| --- | --- | --- |
| Chain | Projectile, Strike, Target, Link | +2 more targets at 60% (Link: +2 bound) |
| Fork | Projectile | Splits in two on the first hit, 60% each |
| Pierce (new) | Projectile | Passes through every enemy in its path |
| Widen | Area, Zone | +50% radius |
| Concentrate (new) | Area | −30% radius, +40% damage |
| Vortex (new) | Area, Channel | Pulls enemies 1 cell towards the centre before it hits |
| Linger | Area, Zone | The area stays 3 s longer, repeating 25% each second |

**Triggers**, the loop makers

| Gem | Fits | Recharge | Effect |
| --- | --- | --- | --- |
| Cast on Crit (new) | any | 1 s | Cast the skill whenever this hero crits |
| Cast on Kill (new) | any | none | Cast the skill whenever this hero kills |
| Cast when Damaged (new) | any | 1 s | Cast the skill each time this hero loses 15% of max HP to hits or HP payments, not DoT ticks (replaces Retaliate) |
| Cast on Dash (new) | Spell | 0.5 s | Cast the skill where this hero lands after any dash, blink or leap |
| Spellblade (new) | Spell | none | Every 4th attack casts the skill at 60% |
| Cast on Detonation (new) | any | 2 s | Cast the skill when any ally detonates a combo (replaces Tandem) |
| Opener | any | once | A free cast 2 s into the fight |
| Last Word | any | once | A free cast from the hero's corpse |

**Power**

| Gem | Fits | Effect |
| --- | --- | --- |
| Overcharge | any | +75% effect; each cast costs 8% of current HP (feeds Cast when Damaged) |
| Ruthless (new) | any | Every 3rd use deals +150% and stuns for 0.5 s |
| Culling Strike (new) | Attack skills | Hits kill enemies below 12% HP |
| Leech | damaging | Heals 25% of the damage dealt |
| Haste | any | −25% cooldown, or −25% mana for an ultimate |

**Team layer and summons** (kept from runes)

| Gem | Fits | Effect |
| --- | --- | --- |
| Primer: Staggered / Brittle / Disoriented | damaging | Also applies the condition |
| Resonance | damaging | Hits count as all three schools and can detonate your own conditions |
| Split | Summon | +1 summon, and one more allowed at once; each at 70% |
| Empower | Summon | Summons get +40% HP and damage |

Every rune not listed here is deleted.

## 7 Items

Items key off tags and triggers, so they cross heroes. Each rarity has a
job:

- **Common** makes a build stronger: one stat.
- **Rare** makes a build possible: a proc or an enabler.
- **Legendary** makes a build broken: it changes a rule.
- **Cursed** is a gamble: a big upside with a real cost.

Three slots per hero and a three-item stash, as today. "S1" marks items
in the first slice.

**Common**

| Item | Effect |
| --- | --- |
| Whetstone | +12% attack damage |
| Quickblade Gloves | +15% attack speed |
| Focus Crystal | +15% spell damage |
| Keen Edge | +8% crit chance |
| Mana Stone | The ultimate charges 15% faster |
| Hourglass Shard | Ability cooldown −12% |
| Vitality Charm | +15% max HP |
| Iron Plate | +8% armor |
| Swift Boots | +20% move speed; dashes reach 1 cell further |
| Sparkflint | Attacks apply Burn |

**Rare**

| Item | Effect | Starts |
| --- | --- | --- |
| Battle Axe (S1) | Attacks cleave 50% to enemies within 1 cell of the target | Blender Vesper, Whirlwind Gorrak |
| Daedalus Edge (S1) | +5% crit chance; crits deal ×2.25 instead of ×1.75 | Crit Flicker |
| Quicksilver Boots (S1) | After any dash, +60% attack speed for 2 s | Flicker and Leap builds |
| Storm Gauntlet | Attacks have a 25% chance to throw chain lightning (80 damage, 4 bounces, Arcana) | Storm Whirlwind |
| Essence Siphon | Each attack steals 3% attack speed from its target for 8 s | Slark Gorrak |
| Thorn Mail | When hit by an attack, deal back 20 + 3% of max HP | Retaliation tanks |
| Spell Siphon | Each enemy your spells hit restores 5 mana | Ultimate spam |
| Skull Basher | Every 4th attack stuns for 0.6 s | Control bruisers |
| Ember Brand | Dashes leave a fire trail for 2 s | Dash builds |
| Vampiric Fang | 15% lifesteal on attacks | Sustain |
| Frost Brand, Venom Vial | As today, but counting every attack, not just basic attacks | Condition and poison builds |
| Pocket Sand | As today: the first hit on each enemy Disorients it | Crush setups |
| Sentinel Ward | Stuns the first enemy to dash or blink near the holder | Counter: dive and Flicker |
| Null Talisman | Enemies within 2 cells of the holder can't trigger | Counter: loops |
| Brambleguard, Blight Ward | As today | Counter: taunt, poison |

**Legendary**

| Item | Effect | Breaks |
| --- | --- | --- |
| Spellblade Hilt | Your spells count as attacks: on-hit effects apply to every spell hit | Meteor Shower + Storm Gauntlet |
| Crown of Echoes | Repeats (Multistrike, Multicast) are at full strength | Every repeat build |
| Blood Pact | Your ability and ultimate cost 6% of current HP instead of cooldown or mana, while above 30% HP | Blood Engine |
| The Unbound | +1 gem socket in both skills | Carries |
| Voidheart | Enemies this hero kills explode for 25% of their max HP | Chain reactions |
| Infinity Band | Trigger gems on this hero recharge twice as fast | Every loop |
| Aegis, Heart of the Swarm, Worldbreaker, Kingmaker Banner, Prism of Three, Obsidian Mirror | As today | — |

**Cursed**

| Item | Upside | Cost |
| --- | --- | --- |
| Soulbound Blade | +60% damage | Loses 2% max HP a second (as today) |
| Glass Idol | +25% damage, +20% attack speed | −30% max HP (as today) |
| Berserker's Collar | +50% attack speed | Can't be healed |
| Unstable Core | Every skill casts twice | Each cast costs 5% of max HP |

Items not listed here are deleted when this lands.

## 8 Levels

Today's talent tiers become hero levels, on the same rounds. Every hero
levels at once, so the track stays in sync.

| Level | After round | Pick one of two | Rule |
| --- | --- | --- | --- |
| 1 | draft | — | Ability, passive and ultimate from the start |
| 2 | 2 | **Empower** | Visible scaling: bigger, more hits, longer |
| 3 | 5 | **Mutation** | The ability or passive changes behaviour |
| 4 | 7 | **Ascension** | The ultimate transforms |

- **You can see the level.** A level badge (I–IV) on the plate and the
  team rail. Each level makes the figure slightly bigger, and level 4
  adds an aura, the way stars do in Underlords. Levelling up gets a
  short moment on the reward board.
- **In code,** today's "signature" becomes the ultimate and today's
  "utility" becomes the ability.

**The round track** otherwise stays as in design doc §1:

- Gem picks replace rune picks (after rounds 1, 4 and 8, then every even
  round).
- Recruit-or-train stays after rounds 3 and 6, and train adds a gem
  socket.
- **New:** from round 4, one of the three cards in each round's item pick
  is a gem. That gives build-chasers more gems without adding a
  decision.

## 9 The ten heroes

The names and lore stay (`docs/lore.md`), and the kits are rebuilt.
Seven heroes also get new, non-human bodies (lore "Bodies"): Vesper is a
shadow panther, Morrow a shrine tortoise, Rime an ice dragon, Moira a
floating knot of threads around one eye, Nettle a walking tree, Sexton a
burying beetle and Brassjack a walking clock. Anvil, Gorrak and Cinder
keep their models. The seven show as placeholder figures until their
Blender models exist. Their portraits have been redrawn as the new
bodies (`docs/icons.md`).

Numbers for the first four are a first pass for the survey to correct.
The other six get numbers when their slice starts.

**Ultimate charge.** The ultimate bar is about twice today's signature
cost. Mana comes from basic attacks (21 each) and from HP lost, as
today. Strikes from skills don't give mana, otherwise Multistrike builds
would chain ultimates. The first ultimate lands around 10 s, then once
or twice more per fight.

### Vesper, the Duskblade: Cunning, Dive

She teleports from enemy to enemy, faster the more she crits.

- **Ability, Flicker Strike** `Attack · Strike · Dash` (6 s):
  - teleports to an enemy and strikes, then to a different enemy within 3
    cells, three times, 0.2 s apart;
  - each strike is a full attack (73–90, can crit, procs on-hit);
  - it picks heroes before summons, and new targets before repeats;
  - the last strike Disorients.
- **Passive, Frenzy:** each crit gives a Frenzy charge (max 5, +8%
  attack speed each). Flicker Strike spends all charges for +1 strike per
  charge.
- **Ultimate, Thousand Cuts** `Attack · Strike · Dash`:
  - she's untargetable while it lasts;
  - it makes 8 strikes over 1.6 s, spread across every enemy, each a full
    attack;
  - it ends behind the lowest-HP enemy hero.

| Level | Option A | Option B |
| --- | --- | --- |
| 2 | **Longer Chain:** Flicker Strike +2 strikes | **Rhythm:** each strike in a chain +10% crit chance, stacking |
| 3 | **Shadow Clone:** a shade repeats every Flicker Strike 0.5 s later at 50% | **Executioner:** a kill during Flicker Strike or Thousand Cuts resets Flicker Strike |
| 4 | **Death Blossom:** every Thousand Cuts strike also hits all enemies within 1 cell | **Mark for Death:** Thousand Cuts hits only the lowest-HP enemy hero, +10% damage taken per strike; when it dies, the rest move to the next |

**Builds:**

- **Crit Flicker:** Cast on Crit in Flicker Strike, with Daedalus Edge and
  Keen Edge.
- **Blender:** Multistrike and Battle Axe; nine cleaving strikes per
  Flicker Strike.
- **Execution chain:** Executioner and Culling Strike.
- **Poison Flicker:** Venom Vial, with Nettle on the team.

**Fun to watch:** a blur that grows with the Frenzy pips.

### Gorrak, the Ravager: Might, Dive

He gets faster with every hit until he's a spinning storm.

- **Ability, Leap Slam** `Attack · Strike · Dash · Area` (8 s, also at
  fight start):
  - leaps onto the most wounded enemy hero within 4 cells;
  - strikes every enemy within 1.2 cells (full attacks) and Staggers them.
- **Passive, Blood Frenzy:**
  - each attack hit gives 1 Fury (max 20, +5% attack speed each, so +100%
    at max);
  - after 3 s without a hit, he loses 1 Fury every 0.5 s;
  - at max Fury, his attacks cleave 40%.
- **Ultimate, Whirlwind** `Attack · Channel · Area`:
  - spins for 3 s, striking every enemy within 1.5 cells every 0.3 s at
    60% (each tick is an attack);
  - every enemy hit gives Fury;
  - he can't be stunned, slowed or taunted while spinning, and drifts
    towards the densest group.

| Level | Option A | Option B |
| --- | --- | --- |
| 2 | **Wide Swings:** Whirlwind +50% radius | **Momentum:** Whirlwind ticks 5% faster per 2 Fury |
| 3 | **Maelstrom:** Whirlwind pulls enemies within 3 cells 1 cell towards him each tick | **Blood Leap:** reaching max Fury resets Leap Slam |
| 4 | **Blade Vortex:** when Whirlwind ends, 4 spectral axes orbit him for 4 s, striking every 0.5 s | **Unending Rage:** Fury never decays, starts each fight at 10, and at max Fury he's immune to control |

**Builds:**

- **Slark:** Essence Siphon, Quickblade Gloves and Vampiric Fang.
- **Storm:** Maelstrom with Storm Gauntlet and Battle Axe; every spin
  tick throws lightning.
- **Leap chain:** Blood Leap, Cast on Kill on Leap Slam, and Quicksilver
  Boots.

**Fun to watch:** his attack animation visibly speeds up, the red glow
deepens, then the spin.

### Anvil, the Bulwark: Might, Wall

A shield that ricochets, and a wall that hits back.

- **Ability, Shield Toss** `Attack · Projectile` (6 s):
  - hits the nearest enemy within 4 cells, then ricochets to 2 more;
  - each hit is an attack for 60 + 5% of his max HP, and Staggers;
  - the shield comes back.
- **Passive, Vengeance:**
  - stores 25% of the hit damage he takes (cap: 30% of his max HP);
  - the next Shield Toss's first hit deals it all as bonus damage;
  - the shield glows as it fills.
- **Ultimate, Last Stand** `Area · Self`:
  - taunts every enemy within 3 cells for 3 s, and he takes 30% less
    damage;
  - each attack that hits him is answered by a free Shield Bash on the
    attacker (at most once per attacker every 0.5 s);
  - it ends in a shockwave for 40% of the damage he took, which Staggers.

| Level | Option A | Option B |
| --- | --- | --- |
| 2 | **Heavy Shield:** +2 ricochets | **Spiked Rim:** each ricochet knocks back 1 cell |
| 3 | **Captain's Return:** the shield hits every enemy on its way back, and each hit shields him for 5% max HP | **Oathbound:** the shield also bounces to allies, shielding each for 8% of his max HP |
| 4 | **Unbreakable:** during Last Stand he can't drop below 1 HP, and Vengeance fills twice as fast | **Reprisal:** during Last Stand, every 3rd hit he takes throws a free Shield Toss |

**Builds:**

- **The Wall That Hits Back:** Cast when Damaged in Shield Toss, with
  Thorn Mail and Vitality Charm.
- **Shield storm:** Barrage, Fork and Chain.
- **HP bruiser:** HP items scale Shield Toss.
- **Taunt anchor:** Last Stand with Worldbreaker, so Cinder's meteors
  land on a crowd.

**Fun to watch:** shields flying off him every time he's hit.

### Cinder, the Pyromancer: Arcana, Artillery

She heats up until she turns into a flamethrower.

- **Ability, Fireball** `Spell · Projectile · Area` (4 s): hits the
  densest group within 5 cells, exploding in 1 cell for 120 and applying
  Burn.
- **Passive, Heat:**
  - +20 Heat per spell cast (triggered casts included), +5 per basic
    attack;
  - at 100 Heat she goes **Inferno** for 4 s: her basic attacks become
    small Fireballs (50%, 0.6-cell blast) and come twice as fast, while
    Heat drains to 0.
- **Ultimate, Meteor Shower** `Spell · Area · Zone`:
  - 6 meteors over 2 s on the enemy heroes, crowds first;
  - each lands 0.6 s after its marker, for 140 in 1.2 cells, and leaves
    burning ground for 2 s.

| Level | Option A | Option B |
| --- | --- | --- |
| 2 | **Big Bang:** Fireball blast +60% | **Twin Fire:** Fireball splits into 2 at the target |
| 3 | **Living Bomb:** Fireball's target explodes 2 s later for 150 in 1.5 cells, or at once if it dies | **Phoenix:** the first time she'd die, she bursts into flames, heals 30% and goes Inferno |
| 4 | **Armageddon:** 12 meteors over 3 s | **Supernova:** one giant meteor pulls enemies within 3 cells to its centre for 1 s, then lands for 500 in 2 cells |

**Builds:**

- **Barrage caster:** Barrage and Multicast on Fireball (six fireballs
  per cast), with near-permanent Inferno.
- **Meteor storm:** Multicast on Meteor Shower, with Spellblade Hilt and
  Storm Gauntlet.
- **Inferno bruiser:** attack-speed items make Inferno deadly.

### Rime, the Frostweaver: Arcana, Artillery

Rime fills the board with ice shards, then locks it down.

- **Ability, Frozen Orb** `Spell · Projectile`:
  - a slow orb crosses 6 cells over 3 s, shooting an ice shard at a
    nearby enemy every 0.2 s;
  - each shard is a projectile hit that Chills, so Chain, Fork and
    Barrage multiply the shards.
- **Passive, Deep Freeze:** every frost hit adds a Chill stack. At 5, the
  target Freezes for 1 s and becomes Brittle.
- **Ultimate, Glacial Prison** `Spell · Area`: freezes every enemy within
  2 cells of the densest group for 2 s. Frozen enemies take 25% more
  damage.
- **Levels:**
  - **2:** Twin Orbs / Slow Orb (half speed, twice the shards);
  - **3:** Shatterpoint (her hits count as Cunning, so she Shatters her
    own Brittle) / Ice Mirror (the first lethal hit turns her into an ice
    statue, untargetable for 2 s, healing 25%);
  - **4:** Permafrost (the prison lasts 3 s and covers the enemy half) /
    Hailstorm (a 4 s hailstorm of 5 shards a second on every enemy;
    projectile gems apply).
- **Builds:** shard storm (Barrage, Chain), freeze lock, and Shatter
  partner for Vesper.

### Morrow, the Oathkeeper: Might, Wall, the healer

Morrow's hammer bounces between friend and foe, and she brings allies
back.

- **Ability, Judgment** `Spell · Projectile`:
  - a hammer that bounces 4 times, alternating enemy and ally;
  - it damages and Staggers enemies and heals allies;
  - Chain adds bounces.
- **Passive, Blessed Overflow:**
  - overhealing becomes a shield on that ally, up to 20% of their max HP;
  - a Blessed shield that breaks explodes around the ally.
- **Ultimate, Resurrection** `Spell · Area`:
  - revives the most recently fallen ally at 50% HP, in a burst that
    Staggers;
  - if nobody has fallen, the team is invulnerable for 1.5 s instead;
  - each ally can be revived once per fight.
- **Levels:**
  - **2:** Swift Judgment (+2 bounces) / Hallowed Path (bounces leave 2 s
    of healing ground);
  - **3:** Crusader (her attacks heal the most wounded ally for 50% of
    the damage) / Martyr (Judgment costs 5% of her HP and heals twice as
    much);
  - **4:** Mass Resurrection (all fallen allies at 25%) / Avatar (she
    grows huge and invulnerable for 6 s, and her attacks throw
    Judgments).
- **Builds:**
  - **Chain healer:** Chain and Multicast on Judgment.
  - **Crusader bruiser:** attack speed and lifesteal.
  - **Martyr engine:** Martyr, Cast when Damaged on Judgment, and Blood
    Pact.

### Moira, the Hexbinder: Arcana, Blight

Moira ties enemies together, then turns them on each other.

- **Ability, Hex** `Spell · Target`: turns the enemy with the most mana
  into a critter for 1.5 s, then Disorients it.
- **Passive, Weaver:** gains a Thread for every 100 damage a hexed or
  bound enemy takes. At 10 Threads, her next Hex hits 3 enemies.
- **Ultimate, Shared Fate** `Spell · Link`: binds up to 4 enemies for
  5 s. 40% of the damage any of them takes is dealt to the others.
- **Levels:**
  - **2:** Wider Net (binds 6) / Long Bond (+3 s);
  - **3:** Death Knell (a bound enemy's death deals 25% of its max HP to
    the others) / Hex Bolt (Hex jumps to a second enemy);
  - **4:** Ill Omen (a combo detonated on one bound enemy detonates on all
    of them) / Puppeteer (bound enemies attack each other for 2.5 s).
- **Builds:**
  - **Link amplifier:** with area-damage teammates.
  - **Control:** Puppeteer.
  - **Hex lock:** Haste and Cast on Detonation on Hex.

### Nettle, the Blightmother: Cunning, Blight

Poison piles up until enemies pop.

- **Ability, Plague Bloom** `Spell · Area · Zone`: plants a flower at the
  densest group that pulses every 0.5 s for 3 s, adding a poison stack to
  enemies within 1.5 cells.
- **Passive, Virulence:**
  - poison has no stack cap;
  - at 10 stacks, a target is Disoriented;
  - at 20 stacks, it **Bursts**: all its remaining poison damage lands at
    once, and half its stacks jump to enemies within 1.5 cells.
- **Ultimate, Pandemic** `Spell · Area`: doubles every enemy's poison
  stacks, and makes poison tick twice as fast for 4 s.
- **Levels:**
  - **2:** Big Bloom (+50%) / Twin Bloom (two flowers);
  - **3:** Contagion (a Burst spreads all its stacks to 3 enemies) / Toxic
    Tether (her poison damage heals her most wounded ally for 20%);
  - **4:** Epidemic (Pandemic keeps spreading stacks to enemies within 2
    cells for 4 s) / Black Death (Pandemic instantly Bursts every enemy
    at 10 or more stacks).
- **Builds:** stacker (attack speed, Venom Vial), Burst chains, support
  (Toxic Tether).

### Sexton, the Bonecaller: Arcana, Swarm

Every death, on either side, builds his army.

- **Ability, Corpse Explosion** `Spell · Area`: detonates the corpse (or
  his own thrall) nearest the most enemies, for 10% of the corpse's max
  HP within 1.5 cells. It Staggers.
- **Passive, Harvest:** every death on either side is a Soul. Every 2
  Souls raise a skeleton warrior (Might) beside him.
- **Ultimate, Army of the Dead** `Summon`: every hero corpse on the board,
  from both sides, rises on his side for 8 s at 40% strength, plus 3
  thralls.
- **Levels:**
  - **2:** Bigger Booms (+50%) / Brittle Bones (thralls' first hits apply
    Brittle);
  - **3:** Grave Chain (a Corpse Explosion that kills sets off another
    from the new corpse) / Bone Legion (each Soul raises a thrall at
    once);
  - **4:** Lich Form (he also becomes a Lich for 8 s: his bolts chain 3
    times and every kill raises a thrall) / Bone Colossus (the army merges
    into one giant golem carrying his items).
- **Builds:** army (Split, Empower, Heart of the Swarm), corpse chain
  (Grave Chain and Cast on Kill), Lich.

### Brassjack, the Clockwright: Cunning, Swarm

Turrets that carry his gems.

- **Ability, Deploy Turret** `Summon · Projectile` (up to 3):
  - builds a turret whose shots carry every gem socketed in Deploy
    Turret;
  - Chain, Fork and Barrage turrets are the broken build, as design doc
    §4 always wanted.
- **Passive, Overclock:** a turret within 2 cells of another gains +10%
  fire rate every second (up to +100%). It visibly spins up.
- **Ultimate, Mech Suit** `Channel`:
  - he climbs into a mech for 6 s, with a shield worth 50% of his max HP;
  - his attacks become rockets (projectile, area);
  - every turret fires at his target.
- **Levels:**
  - **2:** Twin Deploy (two turrets per cast) / Tesla Coils (turret shots
    chain once);
  - **3:** Gadgeteer (turrets carry his items too) / Self-Destruct
    (turrets explode when destroyed or replaced, and Stagger);
  - **4:** Walking Fortress (the Mech Suit lasts until its shield breaks,
    and turrets walk with him) / Doomsday (the Mech Suit ends in an
    explosion for 25% of his max HP within 2 cells).
- **Builds:** gem turrets, turret swarm (Split, Empower), mech bruiser.

### Counter wheel

The archetypes from design doc §3 stay:

| Archetype | Heroes |
| --- | --- |
| Wall | Anvil, Morrow |
| Dive | Gorrak, Vesper |
| Artillery | Cinder, Rime |
| Blight | Moira, Nettle |
| Swarm | Sexton, Brassjack |

### Flagship broken builds

These should be possible, and each should lose to its answer. The survey
checks both (§11).

| Build | Pieces | What you see | Answer |
| --- | --- | --- | --- |
| Endless Flicker | Vesper: Cast on Crit in Flicker Strike, Daedalus Edge, Keen Edge | A new Flicker Strike every second, Frenzy pips always full | Sentinel Ward, Null Talisman, Swarm |
| Blender | Vesper: Multistrike, Battle Axe, Death Blossom | Nine cleaving strikes per Flicker Strike | Anvil's Last Stand, Sentinel Ward |
| Slark | Gorrak: Essence Siphon, Quickblade Gloves, Unending Rage | Attack speed spirals past +150% | Rime's freezes, Skull Basher |
| The Storm | Gorrak: Maelstrom, Storm Gauntlet, Battle Axe | The whole enemy team pulled into a lightning spin | Artillery, Frozen Orb from range |
| The Wall That Hits Back | Anvil: Cast when Damaged in Shield Toss, Thorn Mail, Barrage | Three shields fly every time he's hit | Nettle (DoT doesn't trigger it) |
| Blood Engine | Morrow or Anvil: Blood Pact, Overcharge, Cast when Damaged | Every cast pays HP, and paying HP casts again | Withering, burst |
| Meteor Storm | Cinder: Multicast on Meteor Shower, Spellblade Hilt, Storm Gauntlet | 12 meteors, every one throwing lightning | Dive |
| Gem Fortress | Brassjack: Chain, Fork and Barrage in Deploy Turret, Overclock | Three turrets filling the board with bouncing bolts | Area damage, Gorrak's Whirlwind |

## 10 Rollout

Vertical slices, each playable end to end. Each slice rebuilds heroes in
place (same ids, models and portraits) and deletes what it replaces, so
the roster never shrinks and no old path is kept alongside the new one.

0. **Spell identity (client only, can start now).**
   - Split the `cast` clip into `ability` and `ultimate`.
   - Add name callouts, a passive meter on the plate, the level badge and
     the chain counter.
   - Add a short hit-stop and camera push when an ultimate fires; the
     simulation never waits for it.
1. **The grammar, and Vesper.** Built on 2026-09-24; §13 has what
   shipped and what was measured.
   - **Engine:**
     - skills can deliver full attacks through the on-hit pipeline;
     - dash sequences over ticks;
     - a generic stacks passive;
     - one trigger model with recharges, plus the loop rules in §5.
   - **Content:**
     - runes become gems, and the replacements land in the same step:
       Multicast, Cast when Damaged and Cast on Detonation;
     - new gems Multistrike, Cast on Crit and Cast on Kill;
     - Vesper is rebuilt;
     - Battle Axe, Daedalus Edge and Quicksilver Boots are added.
   - **Done when:**
     - Endless Flicker and Blender work in the lab and replay identically;
     - a stress run of random round-10 builds has zero budget events;
     - the chain counter shows.
2. **Gorrak, Anvil and Cinder.** Built on 2026-09-24; §14 has what
   shipped and what was measured.
   - **Engine:** pull, and moving area effects (Blade Vortex).
   - **Gems:** Barrage, Pierce, Concentrate, Vortex, Cast on Dash,
     Spellblade, Ruthless and Culling Strike.
   - **Items:** Storm Gauntlet, Essence Siphon, Thorn Mail, Spellblade
     Hilt, Blood Pact.
   - **Levels 2–4** replace the talent tiers on the track and in the UI.
     Until a hero is rebuilt, its current talents are its level picks.
3. **Tuning.** Extend the survey (§11), run the broken-build hunt and full
   runs, and tune.
4. **The other six, two at a time,** each with the new engine pieces it
   needs:
   - Rime and Nettle: a moving emitter for Frozen Orb, and uncapped
     stacks with Burst spread. Built on 2026-09-24; §15 has what shipped
     and what was measured;
   - Morrow and Moira: ally bounces and resurrection, and confusion for
     Puppeteer;
   - Sexton and Brassjack: corpse targeting and the Army of the Dead,
     turret gem inheritance and forms.

Art and audio requests (the `ability` and `ultimate` clips, callouts,
meters) go into `missing_assets.md` when each slice is scheduled, not
before.

## 11 How we'll know it worked

The balance survey (`pnpm survey`) gains these checks:

| Target | Number |
| --- | --- |
| Fight length | 25–40 s in early rounds; 20–35 s from round 7 (explosive builds may shorten fights) |
| Something big happens | An ultimate, a combo, a chain of 3 or more, or a kill at least every 5 s on average |
| First ultimate | 8–12 s into the fight |
| Ultimates per hero per fight | 1–2 |
| Flagship builds | 75–85% against a random round-7 field, at most 45% against their named answer |
| Hero win rates | Every hero 45–55% (one-swap) |
| Dead picks | Every gem and item moves win rate by at least 3 points on at least one hero it fits |
| Loops | Zero `reaction-budget-exceeded` events in 10,000 random round-10 fights |
| Determinism | Unchanged: the same seed gives the same fight |

The real test isn't in the table: whether someone watching Endless
Flicker or The Storm wants to build it themselves next run.

## 12 Decisions this needs

| Question | Recommendation |
| --- | --- |
| Keep the ten names, portraits and models and rebuild every kit, or start new characters? | Decided (2026-09-24): keep the ten names and kits' fantasies, but give seven of them non-human bodies. Only Anvil, Cinder and Gorrak stay human, and new heroes start from the body, not a person |
| Keep the condition combos (Staggered, Brittle, Disoriented)? | Keep them as the team layer |
| Allow loops (retire rule 5) under §5? | Yes. Loops are the heart of the build fantasy |
| Should ultimates fire once or twice a fight, instead of 3–6 signatures? | Yes. This reverses design doc §14's target |
| A gem card in the item pick from round 4? | Yes, and tune the count with full runs |
| An economy with rerolls, to chase builds? | A separate decision. These builds make rerolling for one key gem or item much more valuable |

## 13 Slice 1 as built (2026-09-24)

**What shipped**

- **Skills.** Every hero has an `abilityId` (cooldown) and an `ultimateId`
  (mana) in place of the old `abilityIds` list; "signature" is gone from
  the code, the events (`CastEvent.ultimate`) and the HUD. The other nine
  heroes moved over mechanically: their old signature is their ultimate,
  their utility is their ability, and their numbers didn't change.
- **Attacks and spells.** Every skill has a `hitType`. Attack hits can
  crit and run the on-hit pipeline (cleave, every-Nth-attack items,
  first-hit items, attack-hit stacks); spell hits can't crit. A `strike`
  effect deals the hero's basic-attack damage times a scale.
- **Dash sequences** (`battle/sequences.ts`): hops over ticks, heroes
  before summons and new targets before repeats, interrupted by any
  control, with untargetable, end-behind-the-weakest, splash, crit ramp
  and mark options. Processed in `resolutionPriority` order.
- **Triggers and loop rules** (`battle/triggers.ts`): gems cast their
  skill as real casts, at least 3 ticks later, one per hero per tick,
  with a recharge per trigger, never touching cooldown or mana. Chains
  are tracked (`CastEvent.chainRoot` and `chainLink`) and shown as ×N
  over the hero. The per-tick alarm is 32 triggered casts; nothing legal
  gets near it.
- **Gems** (21, `packages/content/src/pieces/gems.ts`): one socket in
  each skill, fitted by hit type and tags. New: Multistrike, Multicast
  (replaces Echo and Twincast), Cast on Crit, Cast on Kill, Cast when
  Damaged (replaces Retaliate), Cast on Detonation (replaces Tandem).
  Kept from the runes: Chain, Fork, Widen, Linger, Opener, Last Word,
  Overcharge, Leech, Haste, the three Primers, Resonance, Split and
  Empower. Train adds a socket to the skill the player picks.
- **Vesper** (§9): Flicker Strike, Frenzy and Thousand Cuts, with her six
  level picks as her three talent tiers until levels land in slice 2.
- **Items:** Battle Axe, Daedalus Edge, Quicksilver Boots, Null Talisman
  and Keen Edge (Keen Edge is common and completes Endless Flicker).
- **HUD:** gem sockets split by skill in the loadout, a skill choice on
  Train, ability, ultimate and passive on the hero card, Frenzy pips on
  the plate and the chain counter.

**Measured**

- Endless Flicker and Blender work in the lab and replay identically
  (recorded twice per seed, byte-identical event logs).
- 10,000 fights with random maxed builds (three talents, trained
  sockets, random fitting gems in both skills, three random items):
  zero budget events and zero failures. The longest chain was ×14, and
  no tick had more than 7 triggered casts. 15 fights (0.1%) ran to the
  time limit.
- Team survey (72,600 battles): Vesper 50.3% one-swap (was 47.5%), 1.05
  ultimates per fight, first at 8.7 s. Median fight 28.0 s (was 29.5 s),
  south 49.9%. The other nine heroes are unchanged within noise.
- 200 full runs with random bots, gems and trains: all finished.
- Combos on the lore trios keep their tiers (Anvil, Rime, Vesper: all
  three lit; Morrow, Moira, Nettle: Overload and Crush; Gorrak, Cinder,
  Brassjack: Crush). Detonations per fight moved with Vesper's new kit:
  Shatter 2.64 → 1.63 on Anvil, Rime and Vesper, since her Flicker
  spreads strikes instead of focusing Rime's Brittle target.

**Choices the proposal left open** (change any of these freely):

- **Spells can't crit.** Only attack hits crit (and a Shatter always
  does). Cast on Crit still fits any skill, fed by the hero's attack
  crits.
- **Trigger gems cast at full strength.** Their recharges are the only
  limit: 1 s for Cast on Crit and Cast when Damaged, 2 s for Cast on
  Detonation, none for Cast on Kill.
- **Multistrike repeats the whole hit,** conditions included, at 70%.
  Repeats and multicasts never repeat themselves.
- **Every extra cast is a link on the chain counter.** A trigger, a
  Multicast repeat and a Shadow Clone each add one, so Shadow Clone alone
  shows ×2 over Vesper.
- **A gem only fits where it does something.** A cast below full
  strength skips Poison, Burn, summons and zones, as echoes did, so
  Multicast doesn't fit Raise Dead, Deploy Turret or Plague Cloud.
  Trigger gems cast at full strength, so they fit Plague Cloud and drop
  a second cloud.
- **Cleave now splashes a share of the damage the hit dealt,** instead
  of a share of the hero's average basic attack. It runs on every attack
  hit, so Battle Axe cleaves off every Flicker Strike.
- **Sparkflint, Venom Vial and Frost Brand count every attack,** not just
  basic attacks.
- **Flicker Strike starts on a 3 s cooldown,** so Vesper doesn't dive
  alone on the first tick. Gorrak's Leap Slam will start ready, as §9
  says.
- **A stunned hero's queued triggered casts fizzle.** Stuns are the
  answer to loops.
- **Last Word on a self-centred skill now works** from the corpse (it
  silently did nothing before).
- **Vesper lost Smoke and her bonus crit against conditioned enemies.**
  Neither is in the new kit; her base crit went from 18% to 20%.
- **Team traits now see conditions granted to summons** (Sexton's Brittle
  Bones) and on dash finishers, so Shatter can light from them. The
  catalogue check fails any hero whose declared condition nothing in its
  kit applies.
- **Still open for later slices:** Blood Pact needs a recast floor or it
  casts every tick; Withering is the named answer to Blood Engine, so it
  should stay on Nettle's poison when she's rebuilt; the Blessed shield
  explosion needs a number; Brassjack needs a Disoriented source once
  Flashbang goes (suggested: each turret's first shot at an enemy
  Disorients it).

## 14 Slice 2 as built (2026-09-24)

**What shipped**

- **Levels replace talents.** A level pick has `level` 2, 3 or 4 and a
  left or right path, one per level, taken in order. The run offers
  them after rounds 2, 5 and 7, and a recruit makes its missed picks on
  arrival. From round 4, one card in every item pick is a gem. An I–IV
  badge sits on the plate, the ITEMS panel and the hero card, figures
  grow 6% per level, and level IV adds an aura. The protocol is v6.
- **Gorrak:**
  - **Leap Slam** (10 s, ready at the start): a one-hop dash that
    strikes every enemy within 1.2 cells and Staggers them.
  - **Blood Frenzy:** up to 20 Fury, +5% attack speed each. It decays
    after 3 s without a hit, and at 20 his attacks cleave 30%.
  - **Whirlwind** (200 mana): 3 s of 50% strikes every 0.3 s. It's
    unstoppable and drifts towards the densest group.
  - **Levels:** Wide Swings, Momentum, Maelstrom, Blood Leap, Blade
    Vortex (a zone that follows him, hitting with full attacks) and
    Unending Rage.
- **Anvil:**
  - **Shield Toss** (6 s): 20 + 2% of max HP per hit and Staggers.
    It ricochets twice.
  - **Vengeance:** stores 20% of hit damage taken (capped at 20% of
    max HP) and releases it on the next toss.
  - **Last Stand** (160 mana): taunts for 2.5 s with 10% damage
    reduction. Each attacker takes a 40% Shield Bash at most every
    1.5 s, and it ends in a Staggering shockwave for 15% of the damage
    he took.
  - **Levels:** Heavy Shield, Spiked Rim, Captain's Return, Oathbound,
    Unbreakable and Reprisal.
- **Cinder:**
  - **Fireball** (5 s): 60 in 1 cell, plus Burn.
  - **Heat:** 20 per spell and 5 per basic attack. At 100 she goes
    Inferno for 4 s: basic attacks become 45-damage fireballs at double
    speed, and Heat drains.
  - **Meteor Shower** (200 mana, still id `meteor`): 6 meteors of 60
    over 2 s, crowds first, each leaving burning ground.
  - **Levels:** Big Bang, Twin Fire, Living Bomb, Phoenix, Armageddon
    and Supernova (one 250 meteor that pulls for 1 s).
  - Flame Ward is gone. Its burst now marks the start of Inferno.
- **Gems:** Barrage, Pierce, Concentrate, Vortex, Cast on Dash,
  Spellblade, Ruthless and Culling Strike.
- **Items:** Storm Gauntlet, Essence Siphon, Thorn Mail, Spellblade
  Hilt and Blood Pact. Blood Pact replaces Blood Contract and has a
  1 s recast floor.

**Measured**

- **Mirrors:** Gorrak 52.3%, Anvil 48.3%, Cinder 48.4% (400 seeds each).
- **Survey** (quick, 74,500 battles), one-swap win rates:
  - rebuilt heroes: Gorrak 56.9%, Anvil 56.5%, Cinder 56.2%, Vesper
    44.5%;
  - the unrebuilt field: Morrow 80.7%, Nettle 70.8%, Rime 54.1%,
    Sexton 35.9%, Brassjack 31.1%, Moira 13.2%. Those six are still on
    their old kits; their numbers barely moved from before this slice.
- **Fight length:** median 25.9 s, 90th percentile 38.9 s, timeouts
  1.1%.
- **Ultimates:** 0.9–1.3 per fight for the rebuilt four. The first one
  lands at 8.6 s (Vesper), 9.0 s (Gorrak), 11.4 s (Anvil) and 14.7 s
  (Cinder).
- **Loops:** 10,000 random maxed fights had no budget events and no
  failures. The longest chain was ×12, and no tick had more than 8
  triggered casts.
- **Full runs:** 40 runs with 8 seats, all finished.
- **Flagships against a random field and their answers** (150 fights,
  `reports/probes/flagships.ts`):

  | Flagship | vs field | vs answer |
  | --- | --- | --- |
  | Endless Flicker | 71% | 69% |
  | Blender | 62% | 57% |
  | Slark | 63% | 56% |
  | The Storm | 57% | 61% |
  | The Wall That Hits Back | 88% | 88% |
  | Blood Engine | 63% | 60% |
  | Meteor Storm | 61% | 53% |

**Choices made while building** (change any of these freely):

- **First-pass numbers were cut hard.** Anvil started at 87% one-swap
  and Cinder at 93%. The damage and ultimate numbers above are the
  tuned ones. The cuts were found by removing kit parts in cloned
  catalogues (`reports/probes/oneswap.ts`).
- **Every trigger has a recharge,** Reprisal included (0.5 s). Without
  one, two Anvils ping-ponged free tosses into a ×208 chain.
- **Stacked shields cap at 30% of max HP.** Captain's Return grants 3%
  per swept enemy.
- **Barrage shots don't ricochet, split or sweep.** Only the main
  projectile does.
- **Channels other than Whirlwind can now be stunned.** Control breaks
  them, as §5 says.
- **Order-bias rule:** timed passes run in resolution-priority order,
  simultaneous endings resolve in two phases, and damage stored within
  a tick settles the next tick.

**Still open:**

- **Answers don't work yet.** The flagships' named answers barely move
  them, and The Wall That Hits Back is at 88% with an 88% answer. This
  is §11's tuning pass.
- **Cinder's first Meteor Shower is late** (14.7 s against the 8–12 s
  target).
- **Vesper sits at 44.5%.**
- **Oathbound's and Captain's Return's shields** are applied on the
  throw, not when the shield arrives.

## 15 Slice 4a as built (2026-09-24)

**What shipped**

- **Rime:**
  - **Frost Bolt:** 62–73, a 20% slow for 1.4 s and 1 Chill.
  - **Frozen Orb** (6 s): an orb that crosses 6 cells towards the nearest
    enemy over 3 s. Every 0.2 s it shoots a 20-damage shard that Chills
    at the nearest enemy within 2.5 cells. Barrage and Pierce on it
    shoot from the orb.
  - **Deep Freeze:** frost hits add a Chill stack for 3 s. At 5 Chill the
    enemy Freezes for 1 s and becomes Brittle. Frozen enemies don't gain
    Chill.
  - **Glacial Prison** (140 mana): Freezes every enemy within 2 cells of
    the densest group for 2 s, and they take 25% more damage for those
    2 s.
  - **Levels:** Twin Orbs, Slow Orb, Shatterpoint (Frost Bolts count as
    Cunning, so she Shatters her own Brittle), Ice Mirror (the first
    death becomes a 2 s ice statue at 25% HP), Permafrost and Hailstorm
    (a 4 s storm of Frozen Orb shards on every enemy, every 0.5 s).
  - Ice Block and Glacial Lance are gone.
- **Nettle:**
  - **Plague Bloom** (5 s): a flower at the densest group. It adds a
    Poison stack to every enemy within 1.5 cells, then again every 0.5 s
    for 3 s.
  - **Virulence:**
    - her Poison has no stack cap;
    - at 10 stacks an enemy is Disoriented;
    - at 20 it Bursts. All its remaining Poison damage lands at once,
      half its stacks are shared among enemies within 1.5 cells, and the
      other half stays.
    - An enemy Bursts at most once every 2 s.
  - **Withering stays** (§13 named it the answer to Blood Engine). It
    cuts healing by up to 40% and mana gain by up to 30%, and reaches
    full strength at 10 stacks.
  - **Pandemic** (140 mana): doubles every enemy's Poison stacks, and her
    Poison ticks twice as fast for 4 s. She waits until 2 enemies carry
    5 stacks.
  - **Poison:** 1.5 damage per stack per second for 5 s. Every new stack
    refreshes the pile.
  - **Levels:**
    - Big Bloom: 50% further.
    - Twin Bloom: a second flower at the densest group the first
      missed, both lasting 2 s.
    - Contagion: a Burst shares all its stacks among the 3 nearest
      enemies at any range.
    - Toxic Tether: 20% of her Poison damage heals her most wounded
      ally, as one heal a tick.
    - Epidemic: during Pandemic, each Poison tick raises enemies within
      3 cells to the carrier's stacks, up to 20.
    - Black Death: Pandemic pops every enemy at 10 or more stacks
      without spending them, and while it lasts enemies Burst at 10.
  - Caustic Spit and Plague Cloud are gone.
- **Engine:**
  - moving emitters (`emitter-started`, `emitter-fired`, in the
    snapshot);
  - Chill;
  - damage marks as an effect;
  - an ice-statue revive;
  - Fork now splits the projectile on its first hit;
  - Shatterpoint-style detonation limited to named abilities;
  - uncapped poison with Bursts and a Pandemic status;
  - a cast gate on poisoned enemies;
  - zones that plant more than one;
  - Withering that scales with stacks;
  - DoT ticks in resolution-priority order.
  - Deleted: `strip-shield`, `biggest-shield-enemy`,
    `dot-spread-on-death`, the `dot-damage` and `dot-max-stacks` stats,
    and `conditionAtStacks`.
  - The protocol is v8.

**Measured** (one-swap, 3 seeds, against the whole field)

- **Rime:** bare 44.5%.
  - Twin Orbs +7.0, Slow Orb +7.8.
  - Then Shatterpoint +4.1, Ice Mirror +4.8.
  - Then Permafrost +5.4, Hailstorm +6.9.
  - Mirror 47.5%. Her draws are mutual kills.
- **Nettle:** bare 53.0%.
  - Big Bloom +9.1, Twin Bloom +6.9.
  - Then Contagion +6.6, Toxic Tether +4.0.
  - Then Epidemic +3.4, Black Death +2.4 to +3.7.
  - Removing parts of the kit (1 seed): no Pandemic 26.4%, no Virulence
    33.6%, no Withering 39.2%.
  - Mirror 45.3% of decided fights, with 37% draws from mutual kills.
- **Bursts** (`reports/probes/nettle.ts`):
  - The first Burst lands at 11–12.5 s.
  - The most in one tick is 12 (Black Death's Pandemic).
  - The biggest single Burst is 611 (Venom Vial stacker), and the peak
    pile is about 120 stacks.
  - A Cast when Damaged and Cast on Kill Pandemic averaged 2.9 Pandemics
    a fight, a 176-stack peak and a 692 biggest Burst.
- **Loops:** 10,000 random maxed fights, no budget events, no failures.
  The longest chain was ×11 and no tick had more than 7 triggered casts.
- **Combos:** the three baseline trios keep their tiers. Nettle's
  Disorient still counts for Crush.
- Every build replays identically.

**Choices made while building** (change any of these freely):

- **Bursts share stacks and never copy them,** so a round of Bursts can't
  raise the enemy team's total stacks. "Each neighbour gets half" grows
  the total in any clump of three and never stops.
  - Bursts wait one tick and resolve in resolution-priority order.
  - An enemy has at most one pending Burst of each kind.
- **The unspread half stays on the target.** When a Burst spent every
  stack, it only moved damage earlier, and Virulence was worth nothing
  (75.8% without it, 75.6% with it).
- **Merged poison keeps the later expiry and blends the damage per stack
  by stacks.** The old rules let one Venom Vial stack (4 a second)
  upgrade her whole pile, giving 1,100-damage Bursts. They also let a
  shorter stack cut the pile's time.
- **Withering scales with stacks.** Flat Withering on uncapped poison was
  worth 22 points by itself, and it made picks that just poison more
  enemies (Twin Bloom +19.5) beat everything else.
- **Bursts, Epidemic and Toxic Tether need Nettle alive,** so Dive
  answers her. Her Poison keeps ticking after she dies.
- **Burst damage is Poison damage:**
  - Blight Ward halves it;
  - it ignores armour;
  - it can't crit or detonate.
  - It shows as `impact-landed` and `damage-dealt` with the label
    `plague-burst` (like `thorns`, not a catalogue ability), plus
    `passive-triggered "virulence"`.
- **Twin Bloom's second flower has no range limit,** and it is skipped
  when every enemy is already covered. Inside Plague Bloom's range, the
  second flower almost never found a target.
- **Scale gate:** repeats below full strength don't place zones, add
  Poison or Chill, or cast Pandemic.
  - Multicast doesn't fit Plague Bloom or Pandemic.
  - The full-strength trigger gems do. A free Pandemic doubles stacks
    again (see the measured build above).
- **Chill comes only from full-strength hits,** so gem copies of a shard
  don't multiply Freezes.
- **Shatterpoint works from Frost Bolts only.** Shards consumed Brittle
  for a tiny Shatter, and it was worth nothing.

**Still open:**

- **Slark's named answer can't work.** Unending Rage makes Gorrak immune
  to Freeze and Stun at 20 Fury, and the answer is Rime's freezes (and
  Skull Basher). Change the answer, or let Freeze through.
- **Nettle's level IV picks are modest** (+2.4 to +3.9). By then her
  builds win 66–72%, and Pandemic comes about 10.5 s into a 13–16 s
  fight.
- **Rime sits at 44.5%,** just under the 45% floor.
- **Nettle's five new level icons are in** (the art session,
  2026-09-25). Her sounds are in, but nobody has listened to them yet.
- **The client pass has had one browser check,** by the HUD session at
  1512×760. The hail cloud was lightened, and a Burst that both spread
  and popped on the same tick now shows as one double-strength number.
  The pass adds:
  - the Frozen Orb, which moves between ticks and fires shards from
    itself;
  - Hailstorm's cloud, with hail falling on each enemy;
  - Glacial Prison's ice spikes, and ice blocks on frozen units;
  - Plague Bloom's flower, the Burst splash and its number, and the
    globs Contagion throws;
  - Pandemic's wave, with a flash on each enemy it reaches;
  - Chill and Pandemic chips, and passive rows on the hero card.

  The tooltip copy for Deep Freeze, Virulence and Withering is built
  from their fields, so the passives no longer carry a description.

## 16 Slice 4b as built: Morrow and Moira (2026-09-25)

**What shipped**

- **Morrow:**
  - **Oath Hammer** is unchanged: 48–59 in melee.
  - **Judgment** (7 s):
    - a hammer thrown at the nearest enemy within 4 cells;
    - it bounces 4 more times, ally then enemy, 3.5 cells a hop;
    - enemies take 40 and are Staggered, and allies heal 100.
  - **Blessed Overflow:** overhealing from any of her heals becomes a
    Blessed shield on that ally, up to 20% of their max HP, for 5 s.
    When the shield breaks, it explodes for half its peak on enemies
    within 1.5 cells.
  - **Resurrection** (120 mana):
    - raises the ally who fell most recently at 50% HP and Staggers
      enemies within 2 cells of them;
    - if nobody has fallen, the team is invulnerable for 1 s instead;
    - each ally can be raised once per fight;
    - she casts it when an ally is down, or when she is under 10% HP
      herself.
  - **Chassis:** 1,800 HP (from 2,100) and 0.25 armour.
  - **Levels:**
    - **2:** Swift Judgment (+2 bounces) / Hallowed Path (every landing
      leaves 2 s of ground that heals allies 10 every 0.5 s).
    - **3:** Crusader (her attacks heal her most wounded ally for 50% of
      the damage) / Martyr (Judgment costs 5% of her current HP and
      heals twice as much).
    - **4:** Mass Resurrection (every fallen ally at 50%, Stagger within
      3 cells, a 2 s fallback) / Avatar (for 6 s after Resurrection she
      grows, takes 30% less damage, and her attacks throw a Judgment
      that bounces to an ally and on to another enemy).
  - Mend, Consecrate, Last Rites, Martyrdom and the old levels are gone.
- **Moira:**
  - **Spite Bolt** is unchanged: 48–59 from 3.5 cells.
  - **Hex** (9 s): turns the enemy with the most mana into a critter for
    2 s and leaves it Disoriented.
  - **Weaver:** she gains a Thread for every 75 damage a hexed or bound
    enemy takes, from anyone. Shared damage and damage over time count.
    At 10 Threads her next Hex also hits the 2 enemies nearest its
    target, and the meter empties.
  - **Shared Fate** (70 mana): binds up to 4 enemies within 4 cells of
    the densest group for 5 s. Half the damage any of them takes is
    dealt to the others.
  - **Chassis** is unchanged: 1,500 HP and 0.05 armour.
  - **Levels:**
    - **2:** Wider Net (up to 6 enemies within 6 cells) / Long Bond
      (+3 s).
    - **3:** Death Knell (a bound enemy's death deals 10% of its max HP
      to the others) / Hex Bolt (Hex jumps to a second enemy within 3
      cells).
    - **4:** Ill Omen (a combo detonated on one bound enemy detonates on
      every enemy bound with it) / Puppeteer (Shared Fate costs 50 more
      mana, and for its first 2.5 s the enemies it binds can only attack
      each other).
  - Siphon, Cruel Hex, Mass Hex and the old Ill Omen are gone.
- **Engine:**
  - Bounces can revisit. A hop goes to the nearest target this throw
    hasn't hit. Once every target has been hit, it goes to the nearest
    one it didn't just leave. The Chain Lightning item still never
    repeats a target.
  - Chain on a bouncing skill adds 2 bounces, which is one ally-and-enemy
    pair on an alternating skill.
  - Bounce trails: a zone ability dropped at every landing.
  - Blessed shields (`shield.blessed`) and Blessed bursts. The bursts
    wait one tick and resolve in resolution-priority order.
  - A `resurrect` effect, and `revived` events whose source is another
    unit.
  - Ability HP costs (`hpCostFraction`, `hp-paid` reason `martyr`), paid
    wherever Overcharge is, triggered casts included.
  - Crusader shares Toxic Tether's one-heal-a-tick settle.
  - `setHpCostFraction` and `setForm` ability changes.
  - Triggered casts can't resurrect.
  - **Stacks from damage:** a `bound-damage` gain with a `per` amount
    credits the unit's hexer and binder once each per hit. The remainder
    carries over (`memory.stackProgress`), and gains pause at max.
  - **Full-meter targets:** `atMax.extraTargets` lets the skill named in
    `spentBy` spend a full meter for extra targets near its target. The
    extras share the cast's hit list. Only the first cast of a multicast
    spends, and it spends even when nobody else is in reach.
  - **Binds:** `patchBind` changes bind effects in place, so Long Bond
    and Puppeteer stack. `puppetTicks` sets `link.puppetUntilTick`, with
    `puppeted` / `puppet` status events.
  - **Puppets:**
    - A puppet proposes only its basic attack. That attack, and its
      movement, go to the nearest unit on its link.
    - Skills keep their enemy targeting, triggered casts included.
    - Its hits on teammates use `PUPPET_FLAGS`: no conditions,
      detonations or passive triggers. Burn, chill and slow still land.
    - An area basic attack hits the puppet's own side around its partner,
      never the puppet itself, and a bouncing one doesn't bounce.
    - With no partner left, it acts normally.
  - **Ill Omen echoes:** each other enemy on the link gets a
    `combo-detonated` event with `echo: true`.
    - The echo deals the combo's bonus damage as a reaction hit that
      isn't shared again, and applies the combo's knockdown or mana
      drain.
    - It never needs or consumes a condition.
    - It doesn't shatter into shards, splash, rally the team or fire
      detonation triggers.
  - A `setBounces` ability change, for Hex Bolt.
  - The protocol is v9.

**Measured** (one-swap, 2 seeds, against the whole field)

- **Morrow:** bare 52.0%.
  - Swift Judgment +3.5, Hallowed Path +4.9.
  - After Swift: Crusader +2.1, Martyr +1.1.
  - After Swift and Crusader: Mass Resurrection +4.1, Avatar +6.0.
  - Chain healer (Swift, Chain and Multicast): 62.2%.
  - Crusader bruiser (Swift, Crusader, Quickblade Gloves, Vampiric Fang):
    60.9%.
  - Martyr engine (Swift, Martyr, Blood Pact, Cast when Damaged): 64.2%.
- **Moira:** bare 50.3% (from 15.0%).
  - Wider Net +4.3, Long Bond +4.7.
  - After Long Bond: Death Knell +6.8, Hex Bolt +4.4. After Wider Net:
    Death Knell +6.2, Hex Bolt +3.4.
  - After Long Bond and Death Knell: Ill Omen +3.1, Puppeteer +3.2. After
    Long Bond and Hex Bolt: Ill Omen +4.5, Puppeteer +4.2.
  - Hex lock (Long Bond, Hex Bolt, Haste and Cast on Detonation on Hex):
    65.7%.
  - Link amplifier (Wider Net, Death Knell, Ill Omen, Chain on Shared
    Fate): 64.9%.
  - Control (Long Bond, Hex Bolt, Puppeteer): 63.6%.
- **Moira's first build won 22.8%.** That was Hex every 10 s for 1.5 s,
  a 40% share within 2.5 cells, and a Thread per 100 damage. Removing
  parts from it: no Weaver 20.5%, no Shared Fate 5.5%, no Hex 8.4%. At
  the final numbers Weaver is worth 7 points (39.7% without its extra
  targets).
- **Moira in a fight** (a fixed team, 30 fights):
  - 3.2 Shared Fates bind 2.4 enemies each, and 1,480 damage is shared.
  - 2.8 Hexes land on 4.7 enemies, and 1.5 full meters are spent.
  - Ill Omen echoes 4.2 of 12.7 combos for 227 damage.
  - With Puppeteer, 1.3 Shared Fates make 3.6 puppets, who deal 359
    damage to their own side.
- **Puppets behave** (45 fights):
  - all 293 of their casts were basic attacks;
  - none cast a skill while a partner lived;
  - none of their attacks landed on Moira's side;
  - 777 of 782 hits on teammates stayed inside the bond. The other 5 were
    burn still ticking after a bond ended, and one share after a partner
    was bound again.
- **As first built she won 78.5%.** That was Judgment at 60 and 110
  every 5 s, 2,100 HP, and a 1.5 s fallback whenever any ally dropped
  under 30%. Removing parts (1 seed): no Judgment 52.8%, no Resurrection
  68.6%, no Blessed Overflow 75.8%.
- **Revives:**
  - Morrow usually falls before her allies. A fight has 0.86 of her
    deaths against 0.27 ally deaths while she lives.
  - With the final cast rule she lands 0.21 revives a fight out of those
    0.27 chances, and the fallback fires 0.6 times.
  - Revived allies act: about 5 casts each before the fight ends.
- **Loops:** 10,000 fights with the Martyr engine forced onto Morrow
  (Swift, Martyr, Avatar, Blood Pact, Cast when Damaged and Multicast):
  no budget events, no failures, and the longest chain was ×14. 10,000
  random maxed fights: none either.
- **Moira's loops:** 10,000 fights each with Hex lock, with Ill Omen plus
  Cast on Detonation and Multicast, and with Puppeteer plus Chain and
  Cast on Detonation on Shared Fate. No budget events, no failures, and
  the longest chains were ×10–11. 10,000 random maxed fights afterwards:
  none either, longest chain ×12.
- Every build replays identically.

**Choices made while building** (change any of these freely):

- **Resurrection waits for a revive.** Casting it whenever an ally
  dropped under 30% spent the mana before anyone fell: 0.04 revives a
  fight out of 0.24 possible, so the fallback was the whole ultimate.
  Summons never count.
- **Avatar isn't invulnerable.** Invulnerability on a low-HP cast was
  worth at least 6.5 points even at 2 s, and +11.9 at 6 s. A 30% damage
  cut for 6 s is worth +6.0. Forms no longer have an `invulnerable`
  field.
- **The fallback lasts 1 s,** not 1.5 s. The extra half second was worth
  5.6 points.
- **Mass Resurrection raises at 50%, not 25%.** Revives come one fallen
  ally at a time, so "every ally at 25%" was worse than one at 50%
  (−0.2). It also gets a wider Stagger and a 2 s fallback.
- **Bounces revisit.** Without it, Judgment's 4 bounces already reached
  every enemy and ally in a 3v3, so Swift Judgment and Chain did nothing.
  Anvil's Heavy Shield had the same dead spot.
- **Martyr's HP cost counts as damage taken,** so Cast when Damaged
  fires from it, and triggered Judgments pay it too.
- **Blessed shields:**
  - overflow tops the shield up to 20% of max HP, counting any shield
    already there;
  - another shield landing on top keeps the blessing;
  - the burst uses the shield's peak and ignores Morrow's damage bonus;
  - it fires even if she or the ally has died.
- **Hallowed Path is its own zone ability,** so the meter credits its
  heals as Hallowed Path and Martyr doesn't double them.
- **Moira's biggest levers were reach and share.** Shared Fate binds
  within 4 cells, not 2.5, and shares 50%, not 40%. The radius alone was
  worth 10 points.
- **Hex lasts 2 s, not 1.5 s,** and comes every 9 s.
- **Weaver:** a Thread every 75 damage, not 100. The extra targets must
  be within 4.5 cells of Hex's target.
- **Wider Net also widens the reach** to 6 cells. Binding 6 changed
  nothing in a 3v3: the fights came out identical. With the reach it is
  worth +4.3.
- **Death Knell deals 10%, not 25%.** At 25% it was worth 10.5 points,
  and even 5% was worth 3.9.
- **Puppeteer makes Shared Fate cost 50 more mana.**
  - Every bound enemy puppeted for 2.5 s on a 70-mana ultimate was worth
    13.4 points. It cut enemy damage by 35%.
  - A 1 s window was still worth 9, and a single puppet 9.9.
  - The mana cost keeps the full effect and makes it rarer: +3.2 to
    +4.2.
- **Puppets only use their basic attack,** so their skills wait, and
  they walk to reach a partner.
- **Ill Omen's echoes are a rule of their own:** bonus damage plus the
  combo's knockdown or mana drain, and nothing else. They don't need or
  use up a condition.

**Still open:**

- **Anvil moved with the bounce rule and the weaker field:** bare 68.8%
  (from 62.3%), Heavy Shield plus Oathbound 78.3% (from 67.2%). Heavy
  Shield now adds 2.2, and Oathbound can shield an ally twice a throw.
  This is for Slice 3's field pass.
- **Resurrection is mostly its fallback.** Morrow usually falls first.
  The sound session's headless run saw a raise on 25 of 103 casts with
  no upgrades, and on none of 64 with Anvil and Cinder alongside her.
- **Level icons:** Hallowed Path reuses the old Holy Ground art. The
  other five, and Moira's Long Bond, Puppeteer and clearer Ill Omen,
  are in (the art session, 2026-09-25).
- **Sounds:** Morrow's and Moira's are in. Moira's Hex now plays on
  landing, with new sounds for Weaver, the Ill Omen echo, Death Knell and
  Puppeteer. Nobody has heard them in a fight yet.
- **Morrow's client pass had one browser check,** by the HUD session at
  1512×760. The hammer didn't read, so it is bigger with a gold trail.
  The Resurrection and Avatar pillar hid the model, so it is narrower and
  dimmer. The pass adds:
  - the tumbling hammer and its hops to allies;
  - Hallowed ground that appears as the hammer lands;
  - gold Blessed shields and their burst;
  - the Resurrection pillar, with the ally standing back up;
  - a gold flash for the fallback;
  - Avatar growing to 1.45×.
- **Moira's client pass had one browser check,** by the HUD session at
  1512×760. Ill Omen popped the same Crush on both bound enemies, and the
  puppet chip and inspector row showed for exactly 2.5 s. The Hex puff
  was the loudest thing in her kit, so it is dimmer now, and the puppet
  strings, which read faint, are twice as thick. Nobody has yet seen the
  Hex Bolt hop or the Weaver flare on screen. The pass adds:
  - glowing threads between enemies bound together, closing into a net
    at three or more;
  - marionette strings over each puppet and brighter threads while the
    puppets turn on each other;
  - a violet puff on each hexed enemy, and a fate bolt from the first to
    the rest when Hex Bolt or a full meter spreads it;
  - a flare at Moira when a full meter is spent;
  - fate bolts carrying each Ill Omen echo to the enemies it pops on;
  - a curse ring where Shared Fate lands, and a puppet chip on the plate.

## 17 Slice 4c as built: Sexton (2026-09-25)

**What shipped**

- **Grave Bolt** is unchanged: 42–50 from 3 cells.
- **Corpse Explosion** (5 s):
  - blows up the corpse or thrall with the most enemies within 1.5 cells
    of it, anywhere on the board;
  - every enemy there takes 60 plus a quarter of the body's max HP and
    is Staggered;
  - any corpse counts, from either side, heroes and summons alike. A
    thrall must be his own, and his risen copies and Colossus never
    count;
  - a blown-up corpse is gone for good, even for Morrow.
- **Harvest:** every death on either side is a Soul, except his own
  summons and units that are dismissed. Every 2 Souls raise a thrall
  beside him, up to 4 at once.
- **Army of the Dead** (100 mana):
  - every hero corpse on the board, from either side, rises for him for
    8 s at 40% HP and damage, with its own build and items;
  - 2 thralls rise beside him for the same 8 s;
  - the corpses are used up, and the risen copies and thralls crumble
    when their time runs out;
  - he waits for a hero corpse before casting it.
- **Chassis** is unchanged: 1,650 HP and 0.1 armour.
- **Levels:**
  - **2:** Bigger Booms (Corpse Explosion reaches 50% further) / Brittle
    Bones (thralls' hits make enemies Brittle).
  - **3:** Grave Chain (when an enemy hit by Corpse Explosion dies
    within 5 s, its corpse explodes too) / Bone Legion (every Soul
    raises a thrall).
  - **4:** Lich Form (Army of the Dead also makes him a Lich for 8 s:
    his bolts jump to 3 more enemies, and every kill raises a thrall) /
    Bone Colossus (the army rises as one Bone Colossus for 12 s with its
    total HP, 50% more damage for each body in it and his items; its
    slams hit and taunt every enemy within 1.2 cells).
- Raise Dead, Soul Well, Horde, Golem Heart, the old Army of the Dead
  and the old Bone Colossus are gone.
- **Engine:**
  - **Corpses:** a unit is a corpse while it is dead, fell through a real
    death (`fellAtTick`) and isn't used up (`memory.corpseSpent`).
    Morrow's `isRevivable` needs a corpse too.
  - The `busiest-corpse` target policy replaces `own-summon`. The
    ability's `consumes.summonId` names the living summon it may also
    use. Every cast path accepts that target: a queued cast fizzles if
    the corpse is used up first, and multicasts pick a fresh corpse.
  - Consuming: `impact-landed` at the body, then a thrall leaves through
    `removeUnit` and a corpse through `corpse-spent`. Damage effects can
    add `consumedMaxHpFraction` of the body's max HP.
  - `removeUnit` clears statuses, links and channels like a death but
    raises no Soul, corpse or death trigger. Summon caps and expiry both
    use it. Caps now count only permanent summons.
  - Summons can expire (`expiresAtTick`). They are removed at the start
    of the tick they run out.
  - **Grave marks** (`graveMark`, `grave-marked` / `grave-mark` status
    events). A marked enemy that dies, or one Corpse Explosion kills,
    queues a blast from its corpse 0.3 s later (`corpseBlasts`). The
    blast is a `cast` with `trigger: "grave-chain"`, and it needs an
    enemy in reach.
  - `raise-army` effect: copies take the corpse's build and rise where
    it lies. `unit-spawned` carries `corpseUnitId` and `expiresAtTick`.
    Its merge variant builds one Colossus instead. Split, Empower and
    Overcharge scale it, and Heart of the Swarm arms only the thralls.
  - Forms can raise a summon on every kill (`raisesOnKill`).
  - Scaling a damage effect keeps its share of the caster's or the
    body's HP, and Overcharge keeps a shield's share of the caster's HP.
    Anvil's Shield Toss under Overcharge or Concentrate now keeps its 2%
    HP part, and an Overcharged Oathbound ally shield is no longer zero.
  - The protocol stays v9.

**Measured** (one-swap, 2 seeds, against the whole field)

- **Bare 52.8%** (the old kit was 48.0%).
- Bigger Booms +2.1, Brittle Bones +1.4.
- After Bigger Booms: Grave Chain +1.3, Bone Legion +4.9. After Brittle
  Bones: Grave Chain +0.9, Bone Legion +5.4.
- After Bigger Booms and Grave Chain: Lich Form +4.0, Bone Colossus +5.6.
  After Brittle Bones and Bone Legion: Lich Form +3.2, Bone Colossus
  +3.7.
- **Builds:**
  - army (Brittle Bones, Bone Legion, Heart of the Swarm, Split and
    Empower on the ultimate): 61.0%;
  - Lich with Multicast on Corpse Explosion: 62.8%;
  - corpse chain (Bigger Booms, Grave Chain, Cast on Kill on Corpse
    Explosion): 56.5%.
- Empower on the ultimate +4.1, Split −0.7. Heart of the Swarm alone does
  nothing: it shares his other items, and he had none.
- **As first built he won 72.2%,** with the Army cast as soon as it was
  affordable. Removing parts: no Army 13.3%, no Army thralls 23.4%, no
  risen copies 64.6%, no Corpse Explosion 64.9%, no Harvest 65.9%.
  Waiting for a hero corpse alone brought him to 48.6%.
- **In a fight** (a fixed team, 30 fights): the first Corpse Explosion
  lands about 11.5 s in. He casts 1.5 a fight, mostly on thralls, hitting
  1.2 enemies for about 190 each. The Army comes 1.3 times and raises 1.4
  hero copies. At most 15 units were ever on the board, and nothing timed
  out.
- **Morrow:** on a Morrow and Sexton team, revives drop from 0.31 to 0.13
  a fight, because the Army also raises allied corpses. That team still
  wins more (75% against 69% with a random third hero). Against Sexton,
  Morrow's revives drop to 0.22.
- **Loops:** 10,000 fights each with the army build, the Lich and chain
  build (Cast on Kill and Multicast on Corpse Explosion) and Bone Legion
  with the Lich forced onto Sexton. No budget events, no failures, one
  timeout each, and the longest chain was ×10. 10,000 random maxed
  fights afterwards: none either, longest chain ×12.
- Every build replays identically.

**Choices made while building** (change any of these freely):

- **The Army waits for a hero corpse.** Cast on cooldown it raised 3
  thralls and nobody else, and the thralls alone were worth about 50
  points. Waiting makes the corpses the point of the ultimate.
- **The Army raises 2 thralls, not 3.**
- **Corpse Explosion deals 60 plus 25% of the body's HP,** not 10%. At
  10% it killed 3 times in 27 fights, so Grave Chain almost never
  fired.
- **Grave Chain marks enemies for 5 s** instead of needing Corpse
  Explosion to land the kill. Even with the bigger blast, the kill-only
  rule chained 12 times in 27 fights and was worth 0.3 points. The mark
  chains about once a fight.
- **Brittle Bones works on every thrall hit,** not just the first on each
  enemy. The first-hit version was worth 0.2 points.
- **Harvest ignores his own summons.** Otherwise Bone Legion replaces
  every thrall that dies, and the army never shrinks.
- **Bone Colossus lasts 12 s** and its slams cleave and taunt. As a plain
  golem with the army's HP it lost 4–5 points: the separate bodies soak
  more hits, and the risen copies bring their skills. The golem hero is
  now named Bone Colossus.
- **The Army raises allied corpses too,** as the design says, so it
  competes with an allied Morrow.
- **Corpses stay on the ground** while a living Sexton could use them,
  and Morrow's side keeps its hero corpses on the ground while she could
  raise them. Everywhere else they sink as before.

**Still open:**

- **Weak spots:** Grave Chain is worth about a point, and the corpse
  chain build only 56.5%. Split on the Army is a slight loss.
- **Sexton starts slowly:** nothing dies in the first 10 s or so, so
  Corpse Explosion and the Army wait.
- **Icons:** Bigger Booms, Grave Chain and Lich Form are in (the art
  session, 2026-09-25). Bone Legion reuses the old Horde art, and the
  old Army of the Dead, Golem Heart and Soul Well icons are gone.
- **Sounds:** Sexton's are in, and `audio:check` passes.
- **Client pass, untested in a browser:**
  - corpses that stay down while they can be used;
  - a bone burst where Corpse Explosion goes off, and on each Grave
    Chain blast;
  - a teal pillar where each corpse rises, and see-through teal copies;
  - a soul wisp from each death to Sexton when Harvest raises a thrall;
  - the Army's ring, a pillar when the Lich form starts, teal bolts, and
    the Colossus at 1.6×.


## 18 Slice 4c as built: Brassjack (2026-09-25)

**What shipped**

- **Rivet Gun** is unchanged: 48–56 from 4 cells.
- **Deploy Turret** (every 7 s, no mana) is now his ability:
  - it builds a turret beside him, up to 3 at once, and a new one past
    the cap replaces the oldest;
  - turrets have 800 HP (was 640) and fire Turret Shot, 31–39 from 4
    cells;
  - a turret's first shot at each enemy Disorients it, which replaces
    Flashbang;
  - the shots carry the gems socketed in Deploy Turret (see Engine).
- **Overclock** (passive): a turret within 2 cells of another of his
  turrets gains +10% attack speed for every second it stays paired, up
  to +100%. A turret on its own drops back to nothing. The rotor spins
  faster and the brass glows hotter as it ramps.
- **Mech Suit** (110 mana) is his ultimate:
  - he climbs into a mech for 6 s, with a shield worth 50% of his max
    HP;
  - his attacks become rockets, 56–66 to everything within 1 cell of
    the target;
  - every turret that can reach his target fires at it, unless it is
    taunted;
  - he builds no mana until he climbs out.
- **Chassis** is unchanged: 1,600 HP, 0.1 armour.
- **Levels:**
  - **2:** Twin Deploy (two turrets per cast, but Deploy Turret
    recharges in 16 s instead of 7) / Tesla Coils (turret shots chain
    to one more enemy within 2.5 cells for 60%).
  - **3:** Gadgeteer (turrets carry copies of his items) / Self-Destruct
    (turrets explode 0.3 s after they are destroyed or replaced, for 90
    to every enemy within 1.5 cells, and Stagger them).
  - **4:** Walking Fortress (the Mech Suit lasts until its shield
    breaks, and his turrets walk with him) / Doomsday (the Mech Suit
    ends in an explosion for 25% of his max HP to every enemy within 2
    cells).
- Flashbang, Reinforced Plating, Quick Build, Barrier Turrets, Flash
  Powder, Fortress and Twin Barrels are gone.
- **Engine:**
  - **Gems on turret shots.** A summon effect can set `carriesGems`,
    on at most one summon per skill. Each gem socketed in that skill
    goes onto the summon's basic attack if it works there
    (`gemWorksOnShot`), and otherwise onto the skill (`gemWorksOn`).
    Basic attacks ignore triggers, Multistrike, Multicast and Ruthless,
    so those never go onto shots.
    - On the shots: Chain, Fork, Barrage, Pierce, Leech, the primers,
      Resonance, Culling Strike, Haste and Overcharge.
    - On Deploy Turret: Split, Empower and the trigger gems.
    - The fit check `gemFitsAbility` accepts a gem that works on
      either. The fit logic moved from `equipment.ts` into the new
      `builds/gem-fit.ts`, and Chain no longer fits a self-targeted
      skill.
  - `compileBuild(build, catalogue, arming)` compiles a summon with
    its summoner's `empower-summons` passives and carried gems. Haste
    therefore shortens the turret's shot cooldown (42 to 32 ticks).
    `empower-summons` can carry gems too: Tesla Coils is a Chain gem.
  - The `overclock` passive (`name`, `heroId`, `rangeUnits`,
    `bonusPerSecond`, `maxBonus`) sits on the summoner.
    `updateOverclock` ramps `memory.overclockTicks` every tick before
    actions, and `overclockBonus` adds to attack speed.
  - The `self-destruct` passive (`abilityId`, `delayTicks`) queues a
    detonation in `state.detonations` on death or cap replacement.
    `processDetonations` emits `impact-landed` and hits enemies in the
    ability's area as reactions. A corpse that blows up is used up.
  - Forms can set:
    - `commandsSummons`: summons take his target when it is a legal
      enemy in their range, checked after taunt;
    - `summonsFollow`: summons walk to within 1.2 cells of him at his
      speed;
    - `endsWhenShieldBreaks`;
    - `locksMana`: basic attacks build no mana while the form lasts.
  - **Summons spawn mirrored for the north team.** The spawn ring
    flipped only its y offset by side, and the board mirrors both, so a
    north summoner's turrets and thralls landed on the other flank. In
    a 3v3 mirror with Brassjack first, side A won 24%; with him last,
    71%.
  - `grantShield` never lowers a shield the unit already has. Before,
    a small ally shield cut an 800 shield down to the 30% stacking cap.
    It changed 0 of 318 fights without Brassjack.
  - A damage effect may have amount 0 when it has a
    `casterMaxHpFraction` (Doomsday).
  - Conditions a summoned hero applies, through its passives or basic
    attack, now count for its summoner's traits.
  - The protocol stays v9.

**Measured** (one-swap, 2 seeds, against the whole field)

- **Bare 51.5%** (the old kit was 22.0%).
- Twin Deploy +5.7, Tesla Coils +3.1.
- After Twin Deploy: Self-Destruct +1.6. After Tesla Coils:
  Self-Destruct +2.7. Gadgeteer is worth +0.5 with two items
  (Quickblade Gloves, Battle Axe) and +5.3 with three (below).
- **Level 4:**

  | After | Walking Fortress | Doomsday |
  | --- | --- | --- |
  | Tesla Coils, Self-Destruct | +1.7 | +2.1 |
  | Twin Deploy, Gadgeteer (no items) | +1.1 | +2.6 |
  | Twin Deploy, Self-Destruct | +1.4 | +1.9 |

- **One gem in Deploy Turret:** Chain +4.5, Fork +4.9, Barrage +5.1,
  Haste +2.8, Overcharge +4.9, Split +6.3, Empower +7.3, Cast on Crit
  +6.4. Gems on the Mech Suit are weak.
- **Builds:**
  - gem fortress (Tesla Coils, Gadgeteer, Walking Fortress; Chain, Fork
    and Barrage in Deploy Turret): 66.1%. That is three gems in one
    skill, which a run reaches only with a trained socket and The
    Unbound (§19);
  - swarm (Twin Deploy, Self-Destruct, Doomsday; Split, Empower):
    64.6%;
  - cast-on-crit bomb (Twin Deploy, Self-Destruct, Keen Edge; Cast on
    Crit): 66.7%;
  - mech (Tesla Coils, Self-Destruct, Walking Fortress; Overcharge and
    Multicast on the Mech Suit): 59.2%;
  - Twin Deploy, Self-Destruct, Doomsday with Overcharge and Haste:
    66.4%;
  - Tesla Coils, Gadgeteer, Doomsday with Quickblade Gloves, Storm
    Gauntlet and Keen Edge: 70.7%, and 74.2% with Chain and Barrage.
    With Self-Destruct in place of Gadgeteer the gem version is 68.9%.
- **Three items lift everyone about the same.** Three levels plus
  Quickblade Gloves, Storm Gauntlet and Keen Edge, measured against
  bare (Brassjack's row before the mana lock; after it he is 70.7% and
  74.2%):

  | Hero | Bare | With items | With items, Chain, Barrage |
  | --- | --- | --- | --- |
  | Brassjack | 51.4% | 71.0% (+19.6) | 74.2% |
  | Cinder | 39.6% | 58.4% (+18.8) | 60.9% |
  | Rime | 41.0% | 65.5% (+24.5) | 69.2% |
  | Vesper | 55.7% | 74.9% (+19.2) | 77.7% |
  | Morrow | 47.4% | 63.4% (+16.0) | 64.5% |

- **Removing parts:** no Mech Suit 29.5%, no turrets 8.1%, no Overclock
  ramp 46.4% (the old flat +20% gives 49.2%), no first-shot Disorient
  47.3%, no commanded focus 52.0%.
- **Gem Fortress flagship** (Tesla Coils, Gadgeteer, Storm Gauntlet,
  Quickblade Gloves; Fork and Barrage in Deploy Turret; 200 fights):
  79% against a random field (44% for a random Brassjack build) and
  79% with a Gorrak among the opponents. Tesla Coils supplies the
  Chain, because a skill held two gems at most until The Unbound
  (§19).
- **In a fight** (bare, a fixed team, 60 fights):
  - he builds 3.6 turrets a fight and keeps 1.6 up;
  - Overclock averages +17% on turret shots;
  - turrets fire 20 shots, 10 of them at his target during the mech,
    and apply Disoriented 5.8 times;
  - the Mech Suit comes 1.6 times, first at 8.7 s, and is up 9.2 s of
    the fight, while its shield absorbs about 790;
  - damage a fight: rivets about 370, rockets about 530, turrets about
    580;
  - Self-Destruct blasts 1.5 times a fight for about 80 in total, and
    Doomsday deals about 310;
  - with Walking Fortress the mech is up 9.9 s instead of 8.7 s;
  - at most 35 events in one tick (64 in the gem fortress), and nothing
    timed out.
- **Mirrors** (Brassjack on both sides):
  - 1v1, 300 fights: side A wins 48.2% of decided fights. The 47 draws
    are all mutual kills; Gorrak's 1v1 mirror has 49 and Anvil's 105;
  - 3v3 with Gorrak and Cinder, 200 fights: 54.0%, one timeout;
  - the same with the gem fortress on both sides: 53.3%, 3 draws.
- **Timeouts** (`reports/probes/timeouts.ts`, 3,000 random 3v3 fights
  with bare heroes): 18 (0.6%). 14 had Brassjack on both sides, which
  is 5.1% of those 273 battles. 3 had him on one side (0.2%) and 1 had
  him on neither. The rule is still that overtime is a draw with no
  escalating damage (decisions.md), set when bare timeouts were 2.8%.
- **Loops:** 2,000 fights each with Brassjack forced into three builds:
  - gem fortress with Storm Gauntlet, Crown of Echoes and Thunder Maul;
  - cast-on-crit bomb (Twin Deploy, Self-Destruct, Doomsday, Keen
    Edge, Daedalus Edge, Crown of Echoes; Cast on Crit and Barrage);
  - swarm (Twin Deploy, Gadgeteer, Walking Fortress, Heart of the
    Swarm, Thunder Maul, Storm Gauntlet; Split and Empower).

  None had budget events or failures, one fight timed out in all
  6,000, and the longest chain was ×11. 10,000 random maxed fights
  afterwards: no budget events or failures, 7 timeouts, and the
  longest chain was ×14.
- Every build replays identically. With Brassjack skipped, the event
  digest of 318 fights was unchanged before the spawn fix, which moves
  every north-side summon.

**Choices made while building** (change any of these freely):

- **The mech builds no mana, and costs 110.** With mana building
  inside it, he earned the next mech before the current one ended, so
  a fresh 800 shield followed every break. Two Brassjacks then couldn't
  kill each other: gem fortress mirrors timed out in 91% of 3v3 fights,
  and random fights timed out 18 times in 10,000 (it was 1 before his
  rebuild). At 160 mana with the lock he fell to 46.3%; 110 brings him
  back to 51.5%, and the first mech now comes at 8.7 s instead of
  11.5 s.
- **Turrets have 800 HP and Deploy Turret recharges every 7 s.** With
  640 HP turrets, they rarely lived long enough to pair (1.2 up and a
  6% ramp). Sturdier turrets on a slower deploy keep Overclock worth
  having.
- **Twin Deploy recharges in 16 s.** Two turrets every 7 s was worth
  10–12 points.
- **Gems go on the shot first.** Overcharge on both the skill and the
  shot was worth 15.1 points. On the shot alone it is worth 4.9.
- **Flashbang is replaced by the turret's first-shot Disorient,** so
  he keeps applying Disoriented. It is worth 4.2 points.
- **Overclock ramps as the design says,** replacing the flat +20%. The
  ramp is worth 5.1 points; the old flat bonus would be worth 2.8.
- **Commanded focus is kept although it measures at nothing** (52.0%
  without it). Turrets already shoot the nearest enemy, which is
  usually his target, and every turret swinging to his target reads
  well.
- **Gadgeteer copies every item he holds,** so a Heart of the Swarm he
  holds does nothing extra.
- **Self-Destruct goes off 0.3 s after the turret dies,** so the blast
  reads after the death.
- **A new shield never lowers the one a unit already has,** so an ally's
  small shield can't cut the mech's shield down.

**Still open:**

- **Two Brassjacks still grind to a timeout about 1 time in 20.** Once
  the melee heroes fall, each side's ranged heroes shoot the nearest
  enemy, which is nearly always a fresh 800 HP turret: one every 7 s,
  for free. Both sides lose HP, but too slowly to finish in 60 s. The
  lever is his turret supply (turret HP or the deploy rate), which
  costs Overclock and his win rate.
- **Walking Fortress is weak** (+1.1 to +1.7). The shield usually
  breaks after about 6 s, and with no mana building inside, a longer
  mech delays the next one. It adds about 1 s of mech a fight.
- **Gadgeteer needs items:** +0.5 with two, +5.3 with three.
- **Empower in Deploy Turret is worth +7.3** on its own, and Split
  +6.3, at or above the +1 to +6 band for a pick.
- **The Gem Fortress answer doesn't work,** like every other flagship's
  (§14). One Gorrak doesn't dent it.
- **Three strong items lift every hero 16–25 points,** Brassjack no
  more than the others. That belongs to the items overhaul.
- **Cinder and Rime sit at 39.6% and 41.0% bare** in today's field. The
  bare field survey will re-measure everyone.
- **Icons:** Twin Deploy, Tesla Coils, Gadgeteer, Self-Destruct and
  Doomsday are in (the art session, 2026-09-25; Doomsday is his cracked
  dial in a ring of fire, so it doesn't read as Self-Destruct). Walking
  Fortress reuses the old Fortress art, and the other old icons are
  gone. A Mech Suit shell and a turret walk cycle are still wished for
  in 3D (`missing_assets.md` §30).
- **Sounds:** Brassjack's are in, and `audio:check` passes. Every rocket
  plays one hit, however many enemies it splashes.
- **Client pass,** checked in a browser by the HUD session against a
  non-fire team, with nothing washing out:
  - turrets drop in with a brass ring; the steam and sparks were too
    quick to catch in stills;
  - paired turrets glow hotter as Overclock ramps; rotor speed can't be
    judged from stills;
  - rockets arc with an exhaust trail and burst into a small fire dome
    and ring;
  - Self-Destruct bursts 0.3 s after the death with debris flying out,
    and Doomsday's burst is clearly bigger and the brightest thing in
    his kit;
  - the mech is Brassjack at 1.3×. The plates snapping on didn't show
    at the pass's zoom;
  - rocket splash hits now wait for the rocket, and Sexton's Corpse
    Explosion hits land at once (both fixed after the sound session's
    reports).

## 19 Items overhaul as built (2026-09-25)

**What shipped**

The item list now matches §7. Ward Bell (and its shield ability), Soul
Lantern, Thunder Maul and Hourglass are gone.

- **Common** (each stacks up to 3 on one hero, as before):
  - Whetstone: +12% attack damage (was +12% of all damage);
  - Quickblade Gloves: +15% attack speed (was 12%);
  - Mana Stone: attacks build 15% more mana, so the ultimate charges
    15% faster (it gave 30 starting mana);
  - Swift Boots: +20% move speed, and dashes, leaps and blinks reach 1
    cell further (was +25% move speed and +8% attack speed);
  - new: Focus Crystal (+15% spell damage), Hourglass Shard (the
    ability's cooldown is 12% shorter; it has the old Hourglass art)
    and Iron Plate (+8% armor).
- **Rare:**
  - Vampiric Fang heals from attacks only, unless the hero holds
    Spellblade Hilt;
  - Spell Siphon: each enemy a spell hits restores 5 mana, at most once
    per enemy per second;
  - Skull Basher: every 4th attack stuns for 0.6 s;
  - Ember Brand: a dash or leap leaves up to 3 fire zones along its
    path for 2 s, which Burn enemies standing in them;
  - Berserker's Collar (cursed): +50% attack speed, and the holder
    can't be healed by anything, lifesteal included.
- **Legendary:**
  - The Unbound: +1 gem socket in the ability and the ultimate;
  - Voidheart: an enemy the holder kills, summons included, bursts 0.3
    s later for 25% of its max HP to every enemy within 1.5 cells. The
    body is used up;
  - Infinity Band: trigger gems on the holder recharge twice as fast;
  - Unstable Core (cursed): the hero's ability and ultimate cast a
    second time 0.3 s later at full strength, and each second cast
    costs 5% of max HP. The cost can't take the holder below 1 HP.
- **Engine:**
  - **Attack and spell damage.** New stats `attack-damage` and
    `spell-damage`. A hit from an attack (`isAttack`) is scaled by
    `attackDamageMultiplier` and every other hit, damage-over-time
    ticks included, by `spellDamageMultiplier`. The old `damage` stat
    still scales both.
  - **`dash-reach`** adds to the range of dash, leap and blink skills
    and to a dash's hop range.
  - **Every-Nth-attack counts strikes.** An attack counts once per
    `castSequence` and tick, so a cleave or chain doesn't count three
    times, while each Flicker hop counts. Barrage copies neither count
    nor proc. A proc lands on every hit of the strike that set it off.
  - **`gainMana(state, unit, amount)`** is the one place mana is
    gained. It applies a form's `locksMana` and the Withering
    multiplier.
  - New passives: `spell-siphon` (limited per enemy through
    `memory.siphonedAt`), `dash-trail` (placed by `applyDeferredMoves`
    along the path, count = min(maxZones, max(1, distance ÷ spacing))),
    `voidheart`, `infinity-band` (multiplies a trigger's recharge),
    `unhealable` (`heal()` returns 0) and `unstable-core` (see
    Choices).
  - **The detonation queue serves Voidheart too.** A detonation now
    has a body and a source: Self-Destruct's source is the turret's
    own body, Voidheart's is the killer. A detonation only fires on a
    dead body, and `consumedMaxHp` is the body's max HP.
  - **Item sockets.** Items have `extraGemSockets`, and
    `gemSocketsFor(hero, build, catalogue)` adds them. The run reads
    sockets from the equipped build, and moving or discarding an item
    sends any gem past a skill's new socket count back to the stash
    (`stashOverflowGems`, tested in `packages/run/test/inventory.test.ts`).
  - Gone: the `hp-threshold`, `refill-after-first-ultimate`,
    `soul-lantern`, `on-kill-mana` and `on-kill-heal` passives, the
    `starting-mana` stat, the `setSchool` ability change and the
    memory they used.
  - The protocol stays v9: no message or view changed shape.
- **Fixed: Ruthless now stuns on every kind of skill.** Dashes,
  channels, delayed impacts, meteor showers, bombs and emitters kept the
  cast's damage scale but dropped its stun, so every third Leap Slam,
  Flicker Strike, Whirlwind or Frozen Orb hit harder and stunned nothing.
  The sound session's stun probe caught it. The stun (`CastStun`: ticks
  and the proc's cast sequence) now travels with the scale, and each
  enemy is stunned once per Ruthless use (`memory.ruthlessStunned`), so
  Whirlwind's pulses or Frozen Orb's shots can't chain the 0.5 s stun
  into a lock. A fight now has 1.7 Ruthless stuns from Leap Slam, 2.1
  from Frozen Orb and 0.2 from Flicker Strike; ultimates rarely reach a
  third use. Of the event digest's 300 random fights, the 19 that
  changed all have a Ruthless holder, and the fixed fights are
  unchanged. One-swap with Ruthless in the ability: Rime +6.2, Vesper
  +2.0, Gorrak −0.1.

**Measured** (one-swap, 2 seeds, against the whole field)

Bare: Gorrak 64.0%, Anvil 62.0%, Vesper 56.8%, Brassjack 51.5%, Sexton
50.5%, Morrow 48.5%, Nettle 44.0%, Moira 44.0%, Rime 40.3%, Cinder
38.4%.

| Item | Best | Others |
| --- | --- | --- |
| Whetstone | Vesper +3.6 | Brassjack +1.6, Gorrak +0.9, Nettle +0.3 |
| Quickblade Gloves | Vesper +3.1, Nettle +3.1 | Brassjack +2.5, Gorrak +2.3 |
| Focus Crystal | Cinder +3.2 | Nettle +1.7, attackers 0 |
| Mana Stone | Vesper +3.3 | Nettle +2.5, Brassjack +1.4, Gorrak +1.0 |
| Hourglass Shard | Nettle +3.0 | Brassjack +2.9, Vesper −0.1, Gorrak −1.0 |
| Iron Plate | Morrow +3.2 | Anvil +2.4, Vesper +1.9, Sexton +1.9 |
| Swift Boots | Moira +0.2 | at most +0.4 anywhere |
| Vampiric Fang | Vesper +7.4 | Gorrak +3.0 |
| Spell Siphon | Rime +3.2 | Cinder +2.8, 0 on everyone else |
| Skull Basher | Vesper +1.7 | Gorrak +1.4, Anvil +1.0, Rime +0.9 |
| Ember Brand | Vesper +2.7 | 0 on everyone else |
| Berserker's Collar | Cinder +9.2 | Vesper +8.2, Nettle +6.3, Gorrak +5.7, Brassjack +5.4 |
| Voidheart | Cinder +4.8 | Gorrak +3.1, Vesper +2.7, Nettle +2.7, Brassjack +1.7 |
| Unstable Core | Nettle +16.2 | Cinder +11.2, Brassjack +8.1, Vesper +2.5, Gorrak −3.2 |
| Infinity Band | Vesper +1.7 | 0 without trigger gems |

- **The Unbound** is worth two more gems. Against Overcharge in each
  skill, adding Haste to both: Vesper +13.8, Cinder +8.9, Nettle +7.7,
  Rime +7.2, Brassjack +6.3, Gorrak +5.1.
- **Infinity Band** was tried on Vesper with Cast on Crit (+1.3) and
  with Cast on Crit, Daedalus Edge and Keen Edge (+1.7).
- **For scale,** the old legendaries and curses: Blood Pact is +27.7
  on Cinder, +20.8 on Vesper and +18.5 on Nettle; Glass Idol +10.2 on
  Cinder and −7.0 on Gorrak; Storm Gauntlet +10.5 on Vesper. Crown of
  Echoes and Spellblade Hilt are worth 0 until a build has repeats or
  on-hit pieces.
- **In a fight** (three fixed opposing teams, 36 fights each):
  - Skull Basher stuns 4.2 times a fight on Vesper and 11.7 on Gorrak.
    Brassjack with Gadgeteer and Barrage stuns 9.2 times, because his
    turrets carry it;
  - Ember Brand leaves 27 zones a fight behind Vesper (284 Burn
    damage) and 4.8 behind Gorrak;
  - Spell Siphon takes Rime from 1.3 to 1.5 ultimates a fight and
    Cinder from 1.0 to 1.3;
  - Voidheart bursts 0.4–1.6 times a fight for 310–350 damage;
  - Unstable Core repeats 3–5 casts a fight for 330–420 HP;
  - with Berserker's Collar Gorrak heals 0 a fight instead of 323.
- **Loops:**
  - 600 fights for each of the ten heroes forced to Unstable Core,
    Crown of Echoes and Infinity Band, with Multicast, Cast when
    Damaged, Cast on Crit and Cast on Kill: no budget events or
    failures, at most 2 timeouts per hero, longest chain ×15;
  - Voidheart chains, 1,500 fights each: Brassjack (Twin Deploy,
    Self-Destruct, Voidheart, Unstable Core, The Unbound) and Sexton
    (Voidheart, Unstable Core, Infinity Band). No budget events, 2
    timeouts;
  - 10,000 random maxed fights, whose builds now fill The Unbound's
    sockets: no budget events or failures, 3 timeouts, longest chain
    ×13.
- **Mirrors** (3v3, 200 fights): Cinder with Voidheart and Unstable
  Core first in the team 53.8%, last 46.2%; Vesper with Ember Brand,
  Skull Basher and Berserker's Collar 53.0%.
- The 20 fixed fights of the event digest replay identically. The 300
  random ones changed, because the item pool did.
- **Slark flagship:** 66% against the field. Against Rime it's 61%,
  and against a Skull Basher on the enemy team it's 69%.
- **Three gems in one skill are now legal** (a trained socket plus The
  Unbound). As flagships, 200 fights each:
  - Gem Fortress with Chain, Fork and Barrage in Deploy Turret and The
    Unbound as the third item: 81% against the field and 83% against
    a team with Gorrak;
  - Endless Flicker with Cast on Crit, Multistrike and Ruthless in
    Flicker Strike and The Unbound: 86% against the field (75% with
    one gem) and 76% against Sentinel Ward (63%).
- **Loops with Blood Pact,** 1,500 fights each: Anvil and Morrow with
  Blood Pact, Unstable Core and Infinity Band, Overcharge and Cast when
  Damaged. No budget events, one timeout each, longest chain ×10.
- **Revives still work with Berserker's Collar.** Aegis and
  Resurrection set HP directly instead of healing: 59 revives in 60
  fights, none at 0 HP.
- The offline Jev probe plays a full run with no rejected commands.

**Choices made while building** (change any of these freely):

- **Attack or spell is binary.** Only a hit from an attack is attack
  damage. Everything else, including Burn and poison ticks started by
  attacks (Sparkflint, Venom Vial), is spell damage, so Focus Crystal
  boosts DoT builds and Whetstone doesn't.
- **Every-Nth-attack counts strikes, not hits.** Otherwise Battle Axe
  or a chain would reach the 4th attack in one swing.
- **Spell Siphon counts each enemy once a second,** so a zone ticking
  on the same enemy can't fill the ultimate by itself.
- **Voidheart counts summon kills and uses up the body.** Turrets and
  thralls burst too, and a burst body can't be raised or exploded
  again.
- **Unstable Core repeats only the hero's own casts,** not triggered
  casts or turret shots, so it doesn't multiply with trigger gems. Its
  cost can't kill, matching Overcharge.
- **Cursed is a flag on a rare or legendary item,** not a rarity of its
  own, so the offer tables didn't change.
- **The Unbound's spare gems go to the stash,** the last one in each
  skill first. The gem stash has no limit, so moving the item never
  fails.

**Still open:**

- **Four items miss §11's dead-pick bar** (+3 on at least one hero):
  Swift Boots (+0.4 at best), Skull Basher (+1.7), Ember Brand (+2.7)
  and Infinity Band (+1.7 in the best build tried). Skull Basher is
  weak because cooldowns keep running during a stun: they are absolute
  ticks, so a 0.6 s stun delays an attacker's next swing by about 0.2 s
  on average. A longer stun, or pausing cooldowns while stunned (which
  changes every stun), would fix it. That's Slice 3.
- **The legendary ceiling:** Unstable Core's +16.2 on Nettle is below
  Blood Pact's +27.7 on Cinder. Whether either is too much is a Slice 3
  question.
- **Slark's answers still can't work.** Unending Rage makes Gorrak
  immune to stuns as well as Freeze, so Skull Basher fails like Rime
  (§15).
- **Endless Flicker with three gems is 86%,** just over the 75–85%
  band, and no flagship's answer works yet (§14).
- **Icons:** the ten new items, and the five from §14, are in (the art
  session, 2026-09-25). Hourglass Shard keeps the old Hourglass art.
- **Sounds** are in (the sound session): Voidheart has its own landing,
  Ember Trail a low whoosh that plays once per dash, every stun (Skull
  Basher, Ruthless, Sentinel Ward) a short crack with the hit that
  carries it, and Unstable Core a sizzle on its HP cost. Ward Bell's
  sound is gone.
