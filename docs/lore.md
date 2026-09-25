# Lore

The world, the ten heroes, and how they fit together. This is a working
draft to keep the heroes' voices and roles consistent as we build. The
mechanics live in `docs/heroes-and-builds-design.md`; this doc is the
story those mechanics tell.

## The world in one paragraph

The Sundered Reach was one kingdom until its crown broke into shards.
Each shard still hums with the power of the old throne, and whoever holds
enough of them can call champions out of any age of the Reach. Eight
commanders do exactly that. They meet in the **Crucible**, a floating
arena of worn stone, and pit their champions against each other until
only one commander still has fire left in the hearth. The champions don't
serve willingly. Each has their own reason to fight, and most of them
have fought each other before.

## The three currents

All power in the Reach flows as one of three currents. Every hero is
steeped in one:

| Current | What it is | Who carries it |
| --- | --- | --- |
| **Might** | The body: weight, iron, the will to stand | Anvil, Morrow, Gorrak |
| **Arcana** | The mind: fire, frost, the threads of fate | Cinder, Rime, Moira, Sexton |
| **Cunning** | The edge: shadow, poison, clockwork | Vesper, Nettle, Brassjack |

The currents break against each other in a circle, and that's why
combos exist:

- **Might staggers, Arcana overloads.** A body knocked off balance can't
  hold a spell. Arcana lands on a Staggered target and overloads it,
  knocking it flat.
- **Arcana makes brittle, Cunning shatters.** Frost and hexes leave a
  body brittle. The right blade finds the crack.
- **Cunning disorients, Might crushes.** Smoke, poison and flashing
  gears leave a target reeling. A hammer finishes it.

Old soldiers of the Reach say "no current stands alone". A team that
brings all three can break anything.

## The Crucible and the Reckoning

How the game's rules read in the fiction:

| Game | Fiction |
| --- | --- |
| A run | A **Reckoning**: one contest between eight commanders |
| Run health | The **hearth**: a commander's fire. Each defeat burns some of it away, more when enemy champions are left standing |
| Round | A **bout** in the Crucible |
| Items | **Relics**: pieces of the old throne room, from simple charms to legendaries |
| Runes | **Glyphs** cut into a champion's signature move |
| Talents | **Paths**: each champion can walk one of two paths, and the third step transforms them |
| Recruits | Champions answering a commander's call mid-Reckoning |
| One of each hero per team | A champion can only be bound to one commander's banner at a time in a bout |

## Bodies

The shards call champions out of any age of the Reach, and most of them
were never people. Only three of the ten are human (Anvil, Cinder and
Gorrak, who is a tusked steppe man). The rest:

| Hero | Body |
| --- | --- |
| Vesper | a shadow panther, the queen's shadow given teeth |
| Morrow | an ancient tortoise carrying her village's shrine on her shell |
| Rime | a small ice dragon |
| Moira | a floating knot of fate-threads around one huge eye |
| Nettle | a walking tree on root legs, flowering on top |
| Sexton | a giant burying beetle with a grave-lantern |
| Brassjack | the palace clock, walking on three brass legs |

New heroes start from the body, not from a person: pick what the
champion is before its kit or its look. Until the Blender models exist,
the placeholder figures in `hero-figures.ts` show these bodies.

## The heroes

Each entry gives the display name, the in-code id, current and archetype,
what they do in a fight, what they're good at, a short story, and voice
notes for the later voice-line work (design doc §12).

### Anvil, the Bulwark (`bulwark`)

- **Might, Wall.** Taunts everyone nearby (Challenge) and gets a bigger
  shield the more he pulls in. He takes a share of the hits aimed at the
  allies beside him. Shield Bash Staggers.
- **Good at:** holding the line so Cinder's Meteor lands on a crowd, and
  setting up Overloads for any Arcana hero.
- **Struggles against:** poison and burns, which ignore armor. Nettle
  wears him down.
- **Story:** Hald Varrow held the gate of Greywater for nine days after
  its walls fell. He was the last shieldman standing when the river took
  the fort. He doesn't talk about the tenth day. The shards brought him
  back with his shield still raised.
- **Voice:** few words, very low. Dry humour. Counts things: hits,
  days, friends.

### Morrow, the Oathkeeper (`oathkeeper`)

- **Might, Wall, the healer.** Judgment throws her hammer from foe to
  friend and back again. It Staggers the enemies it hits and heals the
  allies it passes. Healing past full turns into a Blessed shield that
  bursts when it breaks. Resurrection raises the last ally to fall, and
  if nobody has fallen it makes her team invulnerable for a moment.
- **Good at:** long fights, and keeping Vesper or Gorrak alive
  deep in the enemy line.
- **Struggles against:** Nettle's Withering, which cuts her healing,
  and anything that kills in one burst.
- **Story:** Morrow is an old tortoise who carried her village's shrine
  on her back, and she swore an oath to keep that village alive through
  the winter the crown broke. She kept it, and the oath kept her. The
  villagers called her Sister. She still hasn't died, and she isn't sure
  she can.
- **Voice:** warm but iron-edged. Quotes vows. Scolds allies who take
  stupid hits.

### Gorrak, the Ravager (`ravager`)

- **Might, Dive.** Leaps onto the weakest enemy at the start of the
  fight, then spins through the backline (Whirlwind). He can't be
  stunned or slowed while spinning, and he attacks faster the more hurt
  he is.
- **Good at:** crushing Disoriented targets (Vesper and Nettle set them
  up), and punishing backlines with no bodyguard.
- **Struggles against:** Anvil's taunt, Rime's slows between spins, and
  being focused before he gets rolling.
- **Story:** Gorrak's tribe hunted the tusked beasts of the Ashen
  Steppe until he became one. He fights because the shards promised him
  his herd back. He has started to suspect they lied.
- **Voice:** loud, laughing, short sentences. Talks to his axes.

### Vesper, the Duskblade (`duskblade`)

- **Cunning, Dive.** Flicker Strike pounces from enemy to enemy, weakest
  first, and the last pounce Disorients. Every crit builds Frenzy, which
  speeds her up and buys extra pounces. Thousand Cuts makes her
  untargetable while she cuts across the whole enemy team.
- **Good at:** finishing targets, shattering Rime's Brittle enemies,
  and making anyone Disoriented for Anvil or Gorrak to crush.
- **Struggles against:** stuns that break a pounce chain, Sentinel Ward,
  and Anvil's taunt.
- **Story:** Vesper was the queen's shadow, a panther of living dark that
  walked one step behind the throne and settled the debts the crown
  couldn't be seen to settle. When the crown broke, so did her leash.
  Now she chooses her own targets and still hasn't found the one who
  broke it.
- **Voice:** soft, amused, mostly whispers. Gives targets nicknames.

### Cinder, the Pyromancer (`pyromancer`)

- **Arcana, Artillery.** Marks the densest group and drops a Meteor
  1.5 s later, leaving burning ground. Every spell sets things on fire,
  and Flame Ward throws back anyone who gets too close.
- **Good at:** punishing clumps. With Anvil's taunt, Rime's freezes or
  a Crush holding enemies still, the Meteor always lands.
- **Struggles against:** divers. Vesper and Gorrak reach her fast.
- **Story:** Cinder was an apprentice who set the Academy on fire the
  day the crown broke. It may have been an accident. She has been
  setting things on fire ever since, and none of those were accidents.
- **Voice:** fast, bright, easily bored. Counts down her meteors out
  loud.

### Rime, the Frostweaver (`frostweaver`)

- **Arcana, Artillery.** Glacial Lance pierces a line, slows everything
  in it and makes it Brittle. Three slows in a few seconds freeze a
  target solid. Once, at low health, she seals herself in ice.
- **Good at:** setting up Shatters for Vesper, Nettle and Brassjack, and
  slowing divers to a crawl.
- **Struggles against:** burst from range, and fights that end before
  her slows stack.
- **Story:** Rime is a frost dragon who kept the northern pass shut for
  a hundred years by curling around it and freezing it, and herself,
  solid. The shards thawed her. She's polite, patient, and very tired of
  everyone being in such a hurry.
- **Voice:** calm, precise, slightly old-fashioned. Never raises her
  voice.

### Moira, the Hexbinder (`hexbinder`)

- **Arcana, Blight.** Shared Fate binds up to four enemies, so half of
  any harm to one lands on the others. Hex turns the enemy with the most
  mana into a harmless critter, then leaves it Disoriented. Every wound
  a bound or hexed enemy takes spins her a Thread (Weaver), and a full
  spool makes her next Hex catch three.
- **Good at:** multiplying area damage (Meteor, Whirlwind) across a
  whole enemy team, and shutting down the enemy's key caster.
- **Struggles against:** teams that spread out, and divers.
- **Story:** Moira is what's left of the Reach's oldest fate-weaving: a
  floating knot of threads around one eye. She read the threads of every
  life in the Reach until she found the one that ended the throne, and
  pulled it. Whether she
  broke the crown is the Reach's worst-kept secret. She fights to keep
  anyone from finding the thread that ends her.
- **Voice:** sing-song, cryptic, always knows your name before you say
  it.

### Nettle, the Blightmother (`blightmother`)

- **Cunning, Blight.** Plague Cloud poisons everything inside it, one
  stack a second, and four stacks leave a target Disoriented. Poisoned
  enemies heal less and gain less mana (Withering). Caustic Spit strips
  the biggest shield and poisons its owner.
- **Good at:** grinding down tanks and healers, and setting up Crushes
  for Anvil, Morrow and Gorrak.
- **Struggles against:** fights that end fast, before the poison
  stacks.
- **Story:** Nettle was the oldest tree in the marsh-gardens that fed
  the capital. When the crown broke, the marsh broke too, and she pulled
  up her roots and walked. She calls every plant her child and every
  poison a gift.
- **Voice:** motherly, sweet, horrifying. Offers everyone tea.

### Sexton, the Bonecaller (`bonecaller`)

- **Arcana, Swarm.** Every death on either side feeds him a Soul, and
  every two Souls raise a skeleton thrall, which hits with Might and so
  can crush Disoriented enemies. Corpse Explosion blows up the corpse or
  thrall with the most enemies around it and Staggers them. Army of the
  Dead raises every fallen hero, friend or foe, to fight for him for a
  few seconds.
- **Good at:** long, messy fights with lots of dying, and giving an
  Arcana team a Might hitter.
- **Struggles against:** fights where nobody dies early, and area damage
  that clears his thralls (Meteor, Whirlwind).
- **Story:** The Sexton is a burying beetle the size of a cart. He dug
  the graves at the royal crypt, and he is the only one who knows who's
  missing from it. He treats the dead
  kindly, which is more than the living ever did for him.
- **Voice:** gravelly, patient, gallows humour. Greets the dead
  politely.

### Brassjack, the Clockwright (`clockwright`)

- **Cunning, Swarm.** Deploy Turret builds a turret beside him every
  7 s, up to three at once, and every gem socketed in it rides on the
  turrets' shots. A turret's first shot at each enemy Disorients it, and
  turrets standing together spin up to twice their fire rate (Overclock).
  His ultimate, Mech Suit, bolts him into a brass war-frame for 6 s: a
  shield worth half his HP, rockets that burst where they land, and
  every turret firing at whatever he's aiming at.
- **Good at:** holding ground, shattering Brittle targets with turret
  fire (Cunning), and turning a small area into a fortress.
- **Struggles against:** divers who reach him past the turrets, and
  area damage.
- **Story:** Brassjack was the palace's great clock. He heard the crown
  crack before anyone else did, got up on three legs and walked out of
  the tower. He's been building better clocks ever since, and bigger
  guns, because a clock should be prepared.
- **Voice:** fast-talking tinkerer. Names every turret. Swears in
  engineering terms.

## Summons

- **Thralls (Sexton):** clattering skeletons in rusted kit. They hit
  with Might.
- **Risen heroes (Sexton):** fallen heroes, stood back up as see-through
  ghosts for a few seconds. They fight with everything they had.
- **Bone Colossus (Sexton):** the whole risen army, fused into one heap
  of bones that stood up. Slow, huge, and it drags every enemy's eyes
  onto itself.
- **Turrets (Brassjack):** brass tripods with a spinning barrel that
  spins faster the longer they stand together. Each one is named, and
  each one is his favourite. With Walking Fortress they get up and follow
  him; with Self-Destruct they go out with a bang.

Summons fight but don't keep a team in the bout. When the last hero
falls, the bout is lost.

## How they fit together

- **Old grudges:**
  - Vesper and Moira: Vesper hunts whoever broke the crown, and Moira
    is the obvious suspect.
  - Cinder and Rime: fire and the frozen pass. Rime thinks Cinder is a
    child with matches.
  - Gorrak and Anvil: the Steppe tribes raided Greywater for a
    generation.
- **Old friends:**
  - Morrow and Anvil: she nursed the few who survived Greywater.
  - The Sexton and Moira: he tends the graves she causes, and they have
    an understanding.
  - Brassjack and Cinder: he builds her fire-proof things, which she
    keeps setting on fire.
- **Natural teams** (all three currents):
  - Anvil, Rime and Vesper: taunt, freeze, shatter.
  - Morrow, Moira and Nettle: sustain, bind, poison.
  - Gorrak, Cinder and Brassjack: dive, burn and a turret wall.

These are only for flavour and voice lines. The game never forces
pairings.

## Names

| Id (code) | Display name | Class | Title on cards |
| --- | --- | --- | --- |
| `bulwark` | Anvil | Bulwark | The shield that doesn't move |
| `oathkeeper` | Morrow | Oathkeeper | Keeps the promise nobody else would |
| `ravager` | Gorrak | Ravager | Spins until nothing stands |
| `duskblade` | Vesper | Duskblade | Finds the weakest and finishes it |
| `pyromancer` | Cinder | Pyromancer | Wants you to stand still |
| `frostweaver` | Rime | Frostweaver | Everything slows down near her |
| `hexbinder` | Moira | Hexbinder | Ties your fates together |
| `blightmother` | Nettle | Blightmother | Makes the air itself hurt |
| `bonecaller` | Sexton | Bonecaller | Every death is a recruit |
| `clockwright` | Brassjack | Clockwright | Builds a fortress mid-fight |

The ids stay as they are, like Dota's internal names.

## Open questions

- **What does "Jev" mean now?** In the previous game (archived), the
  heroes were called "Jevs". Here, "Jev" names the AI commander seats
  (design doc §12). Do the heroes get called Jevs again, or are the Jevs
  the commanders who bind them? This doc keeps the commanders unnamed
  until that's settled.
- All names, stories and the world are a first draft, and easy to change.
