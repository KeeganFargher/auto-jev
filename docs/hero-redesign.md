# Hero redesign: kits, gems, items and levels

Status: proposal, 2026-09-24. Nothing here is built. When a slice lands
(§10) it replaces the matching parts of `docs/heroes-and-builds-design.md`:
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

The names, portraits, models and lore stay (`docs/lore.md`). The kits
are rebuilt. Anvil and Gorrak already have models, and the fantasies all
support exciting kits.

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
1. **The grammar, and Vesper.**
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
2. **Gorrak, Anvil and Cinder.**
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
     stacks with Burst spread;
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
| Keep the ten names, portraits and models and rebuild every kit, or start new characters? | Keep them. The fantasies support exciting kits and the art is already paid for |
| Keep the condition combos (Staggered, Brittle, Disoriented)? | Keep them as the team layer |
| Allow loops (retire rule 5) under §5? | Yes. Loops are the heart of the build fantasy |
| Should ultimates fire once or twice a fight, instead of 3–6 signatures? | Yes. This reverses design doc §14's target |
| A gem card in the item pick from round 4? | Yes, and tune the count with full runs |
| An economy with rerolls, to chase builds? | A separate decision. These builds make rerolling for one key gem or item much more valuable |
