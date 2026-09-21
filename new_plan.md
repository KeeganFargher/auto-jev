# Jev Game: New Direction

## 1. The Game We Are Making

The game is pivoting away from being primarily a survival/civilisation simulator.

The new game is:

> **An autonomous fantasy roguelite strategy game where several Jev-controlled factions expand across a campaign map, recruit armies led by powerful Jevs, develop unpredictable builds, fight short real-time battles and compete to dominate the world while the player watches.**

The closest structural reference is **Total War: Warhammer**, but the game's identity comes from four major differences:

1. **The player controls nothing.** Every faction is controlled by Jev.
2. **Every run is roguelike.** Factions draft different upgrades, relics, military doctrines and Jev abilities.
3. **Builds can become broken.** Occasionally a faction gets an absurd combination and steamrolls.
4. **The AI's decisions are part of the entertainment.** The spectator can see what Jev considered, chose and acted upon.

The intended reaction is not:

> "That is a detailed civilisation simulator."

It is:

> "What the hell is Red doing?"

> "Blue's army is completely broken."

> "Why are they attacking that?"

> "Oh shit, Kael is going to die."

> "They've somehow come back."

---

# 2. Core Design Pillars

## 2.1 Spectator first

This is not primarily a game the user plays.

The user watches.

Every major design decision should therefore answer:

> **Is this interesting to watch?**

Systems that are realistic but create long periods where nothing meaningful happens should be simplified.

---

## 2.2 Jev makes meaningful decisions

Jev should not micromanage.

The core rule is:

> **The game creates situations. Jev chooses the response. The game executes the response.**

Jev decides things such as:

- where an army should move
- whether to fight or retreat
- which region to capture
- which units to recruit
- which building to construct
- which doctrine to take
- which Jev ability to unlock
- whether to reinforce or abandon a battle
- whether to pursue a defeated army
- whether to accept a truce

Normal code handles:

- pathfinding
- damage
- targeting
- formations
- income
- movement
- projectiles
- routine ability execution
- obvious combat reactions
- bookkeeping

---

## 2.3 Runs should produce stories quickly

The game should not need 45 minutes before something interesting happens.

Target:

- first meaningful strategic choice within 1 minute
- first expansion within several turns
- first army encounter within roughly 5 to 8 minutes
- first substantial battle relatively early
- increasingly large conflicts afterwards

A normal run should probably last around:

**20 to 40 minutes**

But variation is good.

Some runs:

**10 to 15 minute stomp**

Others:

**30 minute standard war**

Occasionally:

**45 to 60 minute absurd back-and-forth match**

---

## 2.4 Variation beats perfect balance

This is a roguelike.

Not every match should be evenly balanced.

Sometimes one faction:

- captures an excellent region
- rolls a great doctrine
- finds a legendary relic
- gets the perfect Jev skill
- wins an important battle

and becomes terrifying.

That is desirable.

The game should still provide systemic comeback opportunities, but should not secretly force every match towards 50:50.

---

# 3. Overall Game Structure

The game has two primary layers.

## Campaign Layer

A strategic map where factions:

- control territory
- receive income
- build settlements
- recruit armies
- recruit additional Jevs
- explore
- capture special locations
- discover enemy armies
- collect relics
- make diplomatic decisions

This layer is **turn-based**.

---

## Battle Layer

When armies decide to fight, the game transitions into a dedicated battlefield.

Battles are:

- real-time
- autonomous
- visually dramatic
- relatively short
- affected by army composition, terrain, Jevs, abilities, relics and doctrine

A typical battle should take roughly:

**1 to 3 minutes**

Large late-game battles can last longer.

The spectator can speed them up.

---

# 4. Campaign Turns

The campaign should use **simultaneous planning** rather than traditional Red-moves-then-Blue-moves turns.

Every faction receives the world state as it currently understands it.

Then each faction secretly chooses its actions.

Example:

## Thornwatch

- Veyra's army: capture Three Crossings
- second army: defend Black Ridge
- settlement: construct Arcane Tower
- recruitment: 1 Spearman, 1 Storm Mage
- doctrine: choose Overcharge

## Greyhaven

- Kael's army: raid Thornwatch
- settlement: upgrade walls
- recruitment: 2 Axemen
- second Jev: recruit Nyx

Then:

> **ORDERS LOCKED**

The turn resolves.

This allows both factions to make decisions without unfairly seeing the other's move first.

It also creates excellent emergent situations.

Two armies might:

- walk past each other
- arrive at the same location
- race for the same relic
- independently attack one another's settlements

---

# 5. Campaign Map

The map should be smaller and more meaningful than a giant civilisation map.

Initial target:

**12 to 20 strategic locations**

connected by traversable terrain/routes.

Example:

```text
                    DRAGON PEAKS
                     [Wyverns]
                         |
                         |
 BLACK RIDGE ---- THREE CROSSINGS ---- ANCIENT FOREST
 [Iron Mine]        [Shrine]             [Treants]
      |                 |                    |
      |                 |                    |
 THORNWATCH -------- EMERALD VALE ------- GREYHAVEN
  [Capital]            [Food]              [Capital]
```

The visual world can still be continuous low-poly terrain.

But strategically, these locations provide structure.

---

# 6. Territory Types

Not every location should be another generic town.

## Capital

Main faction settlement.

Provides:

- strong income
- recruitment
- building slots
- garrison
- Jev recruitment

Losing the capital should be catastrophic but not necessarily instant game-over.

---

## Town

Smaller settlement.

Provides:

- income
- recruitment
- building slots
- local garrison

---

## Fort

Military location.

Provides:

- strong defence
- zone control
- replenishment
- possibly increased vision

---

## Mine

Provides:

- Gold
- strategic resource
- access to particular equipment or units

---

## Farm / Fertile Region

Provides:

- army replenishment
- population/recruitment bonuses
- possibly cheaper basic infantry

Food does not need to be a detailed individual survival system anymore.

---

## Shrine / Ancient Site

Provides roguelike progression.

Examples:

- relic
- Jev upgrade
- doctrine choice
- magical unit unlock
- world event

---

## Chokepoint

Bridge, mountain pass, crossing or gate.

Strategically valuable because armies cannot easily avoid it.

Three Crossings fits this role well.

---

## Unique Region

Examples:

- Dragon Peaks
- Ancient Forest
- Old Foundry
- Blood Pits
- Sunken Temple

These unlock unusual units or powerful mechanics.

Territory therefore changes what your faction can become.

---

# 7. Economy

The economy should be dramatically simpler than the current survival simulation.

## Primary Resource: Gold

Gold pays for:

- units
- Jevs
- settlement upgrades
- buildings
- army upkeep

Gold comes from:

- territory
- settlements
- mines
- events
- some combat-based roguelike effects

---

## Strategic Resources

Keep a very small number.

Possible examples:

- Iron
- Arcane Essence

They unlock certain:

- elite units
- equipment
- advanced buildings
- magical recruitment

Do not recreate a ten-resource crafting game.

---

## Upkeep

Armies cost Gold every turn.

This creates an important trade-off:

> More territory allows more armies.

But:

> A giant army can bankrupt a small empire.

That naturally limits snowballing somewhat.

---

# 8. Settlements and Buildings

Move away from free-placement RTS base building.

A settlement has a limited number of building slots.

Example:

## Thornwatch, Tier II

- Barracks
- Farm
- Watchtower
- Empty slot

When a slot becomes available, Jev chooses:

### Arcane Tower

Unlock mages.

### Forge

Heavy units and armour.

### Market

More Gold.

### Watchtower

Better defence and vision.

### Stable

Cavalry.

The building appears physically in the low-poly town, so the world visibly grows.

But the strategic decision is simple and meaningful.

---

# 9. Jevs

**Jevs** are the game's hero characters.

Every army must be led by a Jev.

A faction begins with one and can recruit additional Jevs as it grows.

Jevs are:

- powerful combat units
- army commanders
- persistent characters
- levelling characters
- relic users
- important strategic pieces
- potentially mortal

They should feel closer to simplified MOBA heroes than normal RTS commanders.

---

# 10. Initial Jev Roster

Start with six.

## Veyra, the Stormborn

Role:

**Damage / battlefield control**

Theme:

Lightning, storms and chain damage.

Identity:

Punishes tightly packed armies.

Possible abilities:

- Static
- Chain Bolt
- Thunderstrike
- Storm Field
- Tempest

---

## Thorn, the Ancient

Role:

**Tank / defence / nature**

Theme:

Roots, forests, regeneration and terrain control.

Identity:

Makes territory extremely difficult to attack.

Possible abilities:

- Living Bark
- Rootwall
- Entangle
- Seed Bastion
- Awaken the Earth

---

## Kael, the Bloodhound

Role:

**Melee damage / snowball**

Theme:

Kills, aggression and momentum.

Identity:

Gets increasingly dangerous as battles become bloodier.

Possible abilities:

- Bloodlust
- Hunt
- Cleave
- Execution
- Red Mist

---

## Elowen, the Lifebinder

Role:

**Healing / support**

Theme:

Healing, survival and resurrection.

Identity:

Keeps valuable armies alive through fights they should lose.

Possible abilities:

- Lifeline
- Renewal
- Rescue
- Rebirth Seed
- Second Breath

---

## Nyx, the Wayfinder

Role:

**Mobility / utility / deception**

Theme:

Shadows, teleportation and information warfare.

Identity:

Breaks normal movement and fog-of-war rules.

Possible abilities:

- Veil
- Shadowstep
- Blackout
- Waygate
- Fold the World

---

## Orun, the Forgefather

Role:

**Army support / siege**

Theme:

Weapons, armour and magical forging.

Identity:

Turns ordinary soldiers into increasingly powerful veterans.

Possible abilities:

- Masterwork
- Temper
- Warforge
- Shatter
- Living Arsenal

---

# 11. Jev Levelling

Jevs gain XP from:

- fighting
- winning battles
- taking settlements
- killing enemy Jevs
- capturing major objectives
- discovering ancient sites

Progression should use branching choices.

Example:

## Level 3

Choose one of two upgrades.

## Level 5

Unlock a major ability.

## Level 7

Choose specialisation.

## Level 10

Upgrade the ultimate.

Jev chooses the branch.

This lets the same Jev develop differently every run.

---

# 12. Jev Death

Jevs should be able to die.

But losing a battle does not automatically kill the Jev.

Possible outcomes:

- survives
- wounded
- captured
- killed

A wounded Jev may be unavailable for several turns.

A captured Jev could later create ransom/execution/rescue systems.

A dead Jev is permanently gone for the run.

---

# 13. Jev Relic Drops

Killing a Jev should sometimes produce a powerful relic based on that Jev.

Example:

## Eye of the Storm

Dropped by Veyra.

> Every fifth attack triggers chain lightning.

Now Kael might equip it.

That allows bizarre cross-builds.

This should create memorable late-game combinations.

---

# 14. Army Structure

Armies are made of **unit cards**, not individually commanded soldiers.

A unit card represents several visible characters.

Example:

## Spearmen

6 models.

## Archers

6 models.

## Heavy Cavalry

3 models.

## Ogre

1 model.

## Jev

1 model.

A mid-game army might contain:

- 3 Spearmen
- 2 Archers
- 1 Cavalry
- 1 Mage
- 1 Ogre
- 1 Jev

Maybe around 35 to 45 actual visible combatants.

Late-game armies may reach:

**60 to 100 visible models**

without needing Total War's thousand-unit scale.

---

# 15. Core Combat Categories

The game's combat language should be easy to understand.

## Frontline

Holds enemies in place.

## Damage infantry

Kills frontline units.

## Ranged

Deals damage from safety.

## Cavalry / Mobile

Flanks, chases and attacks vulnerable backlines.

## Mages

Powerful specialised battlefield effects.

## Support

Buffs, healing, morale and utility.

## Monsters

Expensive powerful units.

## Siege

Attacks formations and settlements.

## Jevs

Unique hero-level units.

---

# 16. Initial Unit Roster

Do not begin with a Warhammer-sized roster.

Build one excellent shared combat sandbox first.

## V1 units

1. Swordsmen
2. Spearmen
3. Archers
4. Light Cavalry
5. Shieldguard
6. Crossbowmen
7. Ogre
8. Catapult
9. Battle Mage

Plus the six Jevs.

This already creates meaningful counters.

---

# 17. Expanded Unit Pool

Eventually, the overall pool can grow to roughly 35 to 40 units.

## Levy

- Militia
- Levy Spears
- Hunters

## Core Infantry

- Swordsmen
- Spearmen
- Axemen

## Heavy Infantry

- Shieldguard
- Great Weapons
- Pikemen

## Ranged

- Archers
- Crossbowmen
- Skirmishers

## Mobile

- Scouts
- Light Cavalry
- Heavy Cavalry
- Mounted Archers

## Support

- Standard Bearers
- Field Medics
- Engineers

## Siege

- Battering Ram
- Ballista
- Catapult
- Great Cannon

## Monsters

- Ogre
- War Beast
- Stone Golem
- Treant
- Giant Eagle
- Wyvern

## Elite

- Royal Guard
- Berserkers
- Rangers
- Ironbreakers
- Paladins
- Reavers
- Stormguard
- Beast Riders

---

# 18. Mages

Magic should be an important part of the game's fantasy identity.

Mages are powerful specialists but weaker than Jevs.

A mage card might represent:

**2 to 3 models**

They should be vulnerable if cavalry or melee reaches them.

Possible mage types:

## Battle Mage

General ranged magic.

## Pyromancer

Area damage and burning.

Excellent against infantry formations.

## Storm Mage

Chain lightning and disruption.

## Druid

Healing, regeneration and roots.

## Cryomancer

Slows enemies and controls movement.

## Necromancer

Uses recent casualties to create temporary units.

## Illusionist

Creates decoys and interferes with enemy intelligence.

## Warlock

Curses armour, morale or attack.

## Geomancer

Creates temporary walls and battlefield obstacles.

Not every faction has access to every mage in every run.

---

# 19. Military Doctrine Tree

Rather than fixed Warhammer-style faction rosters, factions develop their military identity during the run.

All factions begin with a small shared core roster.

Then Jev chooses military doctrine branches.

Example:

## Heavy Warfare

Unlock:

- Shieldguard
- Great Weapons
- Heavy Cavalry

Later branch:

### Iron Legion

- Ironbreakers
- Paladins
- Great Cannon

or:

### Conquest

- Berserkers
- War Mammoth / equivalent
- advanced siege

---

## Rangers

Unlock:

- Rangers
- Skirmishers
- Mounted Archers

---

## Beastmastery

Unlock:

- War Beasts
- Ogres
- Giant Eagles

Later:

### Ancient Wild

- Treants
- Great Eagles
- Forest Giant

or:

### Monstrous Host

- Ogres
- Beast Riders
- Wyvern

---

## Arcane

Unlock:

- mages

Then branches:

### Elementalism

- Pyromancer
- Storm Mage
- Cryomancer

### Life Magic

- Druid
- Geomancer

### Dark Arts

- Necromancer
- Warlock
- Illusionist

This creates procedural faction identity.

---

# 20. Roguelike Progression

This should be one of the central systems.

During each run, factions repeatedly receive random upgrade drafts.

Jev chooses from the offered cards.

Examples:

## Common

Small improvements.

- attack speed
- movement
- armour
- cheaper recruitment
- faster replenishment

## Uncommon

Mechanics.

- kills restore morale
- workers repair towers
- cavalry gains charge damage after travelling
- archers pierce targets

## Rare

Build-defining.

- kills refund Gold
- units heal after winning battles
- damaged towers attack faster
- armies move faster after victory

## Legendary

Rule-breaking.

- dead veterans empower surviving veterans
- passive income is replaced by huge combat rewards
- army damage doubles but maximum health is halved
- every kill increases nearby attack speed

---

# 21. Stacking

Some roguelike upgrades should stack.

This is important.

Example:

## War Drums

Nearby allies increase attack speed.

If Jev takes it multiple times:

- War Drums I
- War Drums II
- War Drums III

the effect becomes increasingly ridiculous.

Occasionally, a faction should accidentally create a broken build.

That is not a balancing failure.

It is part of the game's appeal.

---

# 22. Build Synergies

The best upgrades should interact.

Example:

## Conscription

Infantry cheaper but weaker.

-

## War Drums III

Large armies attack faster.

-

## Blood Price

Kills generate Gold.

-

## Red Standard

Kills increase attack speed.

Result:

**snowballing swarm army**

Another:

## Masonry

Strong buildings.

-

## Repair Crews

Automatic structure repairs.

-

## Retribution

Damaged towers fire faster.

-

## Citadel

Low-health structures become harder to destroy.

Result:

**horrific fortress build**

---

# 23. Territory-Specific Unlocks

Some units and effects should require ownership of specific regions.

Examples:

## Dragon Peaks

Unlocks:

- Wyverns

## Ancient Forest

Unlocks:

- Treants
- Giant Eagles

## Black Ridge

Unlocks:

- Ironbreakers
- improved armour

## Old Foundry

Unlocks:

- Stone Golem
- Great Cannon

## Blood Pits

Unlocks:

- Berserkers
- Ogres

This means strategic expansion also changes army composition.

---

# 24. Relics

Relics can come from:

- ancient ruins
- Jev deaths
- major battles
- world events
- special regions

Relics should be physical campaign objects where possible.

An army may need to claim or carry them.

Examples:

## Storm Core

Lightning effects chain further.

## Blood Crown

Kills improve morale and movement.

## Stone Heart

Massively increases Jev armour.

## Mirror Shard

Creates false army intelligence.

## Ancient Hammer

Improves siege damage.

Relics are equipped to Jevs or armies.

---

# 25. World Modifiers

Every run begins with a random world modifier.

Examples:

## Age of War

Military recruitment is cheaper.

## Golden Valley

Central territories produce much more Gold.

## Long Night

Visibility is reduced.

## Heroic Age

Jevs gain XP faster.

## Scarcity

Resources and income are lower.

## Broken Lands

More chokepoints and difficult terrain.

The modifier should materially alter strategy.

---

# 26. Fog of War

Factions should **not** have omniscient information.

The spectator does.

Each faction has vision from:

- armies
- scouts
- settlements
- watchtowers
- Jevs
- owned locations

The game determines what they can see.

Jev does not process raw vision.

---

# 27. Intelligence System

Visible units are summarised into useful information.

Instead of:

> 23 enemy entity objects

Jev sees:

## Enemy Army

- approximately 18 units
- mostly infantry
- 4 ranged
- Jev present: Kael
- moving towards Three Crossings
- confidence: high

When the enemy disappears:

## Last Known Army

- 18 units
- last seen two turns ago
- heading south
- confidence: low

This allows Jev to make mistakes for legitimate reasons.

---

# 28. Scouts

Scouting should be strategically important.

Scouts:

- reveal territory
- find armies
- inspect settlements
- locate relics
- improve intelligence confidence

Jev might decide:

> We do not know enough about Greyhaven.

and send scouts rather than an army.

Nyx should have especially strong interactions with this system.

---

# 29. Deception

Eventually add information warfare.

Examples:

- false army contacts
- hidden armies
- temporary vision denial
- decoy settlements
- concealed movement

This creates situations where Jev can make rational but incorrect decisions.

That is much more interesting than making the AI randomly stupid.

---

# 30. Army Encounters

When two hostile armies enter conflict range, the game pauses strategic resolution.

Jev receives:

- known enemy composition
- own composition
- Jev information
- terrain
- current health
- reinforcement information
- approximate battle strength

Then chooses:

## Fight

Enter battle.

## Retreat

Attempt to withdraw.

Potential later options:

- negotiate
- ambush
- delay
- reinforce

Keep V1 simple.

---

# 31. Battle Prediction

Show an approximate evaluation:

- overwhelming advantage
- favourable
- even
- risky
- disastrous

But this is only an estimate.

Actual battle results depend on:

- positioning
- abilities
- terrain
- morale
- targeting
- Jev tactical decisions
- RNG
- relic procs
- composition

The estimated favourite should sometimes lose.

---

# 32. Battle Scene

When Jev chooses to fight, transition into a generated battlefield.

Terrain reflects the campaign location.

Examples:

## Forest

- reduced vision
- ambush opportunities
- slower cavalry

## Open Plain

- excellent cavalry
- long ranged sightlines

## Mountain Pass

- narrow chokepoints
- strong defensive positions

## Settlement

- buildings
- watchtowers
- defensive terrain

---

# 33. Battle Speed

Battles should be faster than Total War.

Default:

**2× simulation speed**

Return to slower presentation for important moments:

- Jev ultimate
- Jev critical health
- army morale break
- major spell
- large charge
- Jev death

Spectator controls:

- pause
- 1×
- 2×
- 4×

---

# 34. Battle AI

Jev does not control individual units continuously.

Normal battle AI handles:

- target selection
- formations
- local movement
- attacking
- retreat animations
- obvious ability usage

Jev makes higher-level tactical choices.

---

# 35. Pre-Battle Jev Choices

Examples:

## Formation

- aggressive
- balanced
- defensive
- wide
- concentrated

## Priority

- kill enemy Jev
- break ranged units
- protect own Jev
- hold terrain
- overwhelm centre

These affect normal battle AI.

---

# 36. Mid-Battle Decisions

Trigger Jev only when something important happens.

Example:

> Our frontline has collapsed.

> Veyra has 42% HP.

> Enemy Jev has 18% HP.

Options:

- push aggressively
- regroup
- commit reserves
- retreat

Then combat resumes.

---

# 37. Retreat

Retreat should matter.

A defeated army may survive.

Example:

## Defeat

Started with:

18 units

Survived:

7 units

Jev:

wounded

Army:

shattered

The survivors retreat towards friendly territory.

The enemy may choose to pursue.

This creates another strategic decision.

---

# 38. Settlement Battles

Do not initially build huge Warhammer-style sieges.

Start smaller.

Settlement defences can include:

- garrison
- watchtowers
- palisades
- defensive buildings
- Jev if present

The battlefield contains actual town structures.

Attackers must break through and capture an objective.

Later, add:

- gates
- stronger walls
- siege towers
- magical defences

Only if the simpler system is already fun.

---

# 39. Diplomacy

Keep diplomacy lightweight at first.

Possible relationships:

- neutral
- tense
- hostile
- war
- temporary truce
- alliance later

Track:

- grievances
- trust
- fear
- recent battles
- territorial disputes
- betrayals

Jev decides things such as:

- demand withdrawal
- offer peace
- break truce
- cooperate against stronger faction
- declare war

Do not let diplomacy remove competition permanently.

---

# 40. Historical Memory

The game stores significant events.

Examples:

- Kael killed Veyra
- Thornwatch captured Black Ridge
- Greyhaven broke a truce
- Mossvale saved Thornwatch from destruction
- an army was annihilated at Three Crossings

These events influence later decisions.

Do not send complete transcripts to Jev.

The game retrieves only relevant memories.

---

# 41. Jev Decision Architecture

This should remain extremely efficient.

The rule:

> **Jev sees situations, not the entire world database.**

Maintain a faction blackboard.

Example:

- controlled territory
- current armies
- current commitments
- known enemies
- current build
- relics
- important memories
- known strategic objectives

Then compile small decision packets.

Typical decision context:

**200 to 800 tokens**

Complex decision:

perhaps around **1,000 to 2,000**

There should be almost no reason to approach the full context window.

---

# 42. Decision Layers

Use three layers.

## Reflex

Code only.

Examples:

- attack nearby enemy
- flee fire
- maintain formation
- shoot visible target

---

## Event Decisions

Jev.

Examples:

- enemy discovered
- army attacked
- region captured
- relic found
- doctrine available
- settlement threatened

---

## Strategic Turn

Jev.

Every campaign turn, each faction chooses:

- army objectives
- recruitment
- construction
- upgrade choices
- diplomatic responses

This creates proactive behaviour.

---

# 43. Commitments

Jev should make commitments rather than constantly reconsidering.

Example:

## Army I

Objective:

> Capture Three Crossings.

The army continues until:

- objective completed
- impossible
- army threatened
- new high-priority event
- next strategic turn

This makes factions look purposeful.

---

# 44. Jev Choice Probabilities

Where useful, keep the full choice distribution.

Example:

- attack: 52%
- fortify: 33%
- retreat: 10%
- ignore: 5%

Rather than always selecting the highest score, some decisions can use seeded sampling.

That creates variation while remaining context-sensitive.

The same situation may therefore produce slightly different histories in different seeds.

---

# 45. Spectator HUD

The interface should explain the match without overwhelming the user.

## Top HUD

Per faction:

- Gold
- income
- territory count
- army count
- military strength
- current Jev portrait

---

## Left Event Feed

Only important events:

- army created
- region captured
- Jev levelled
- doctrine selected
- major battle
- Jev wounded
- Jev killed
- legendary relic found
- truce
- settlement lost

Do not show routine activity.

---

# 46. Roguelike Build UI

Each faction should have a compact build display.

Example:

## Thornwatch

Kael

- Conscription II
- War Drums III
- Blood Price
- Red Standard
- Eye of the Storm

Immediately understandable:

> Red has developed some horrifying swarm build.

---

# 47. Jev Decision UI

Important decisions should appear at the bottom of the screen.

Example:

## Veyra encounters Kael

**Fight**
67%

**Retreat**
33%

> Veyra chooses FIGHT.

Or:

## New Doctrine

**Elementalism**
74%

**Heavy Warfare**
42%

**Beastmastery**
28%

> ELEMENTALISM

The audience is literally watching the AI think.

---

# 48. Director Mode

Director Mode should automatically follow important events.

Priority examples:

1. Jev death
2. major battle
3. settlement attack
4. Jev versus Jev encounter
5. legendary relic
6. doctrine choice
7. army movement towards conflict
8. important capture

The camera can:

- pan across campaign map
- zoom into armies
- transition to battle
- track Jevs
- briefly slow major moments

Manual camera remains available.

---

# 49. Endgame

The game needs increasing pressure to finish.

Possible initial victory condition:

> **Last faction with a functioning capital wins.**

Later add:

- territorial domination
- relic victory
- magical ascension
- economic domination

But V1 should be straightforward.

---

# 50. Anti-Stalemate Systems

Later in the match:

- army upkeep rises
- high-value regions become more important
- legendary relics appear
- neutral areas disappear
- world events increase
- faction income concentrates around contested locations

If a game reaches very late stages, trigger a final age.

Example:

## THE LAST AGE

- central sites generate huge rewards
- Jev XP increased
- legendary relic chance dramatically increased
- settlements become harder to replenish indefinitely

The match becomes increasingly unstable.

---

# 51. World Events

Keep events, but make them strategically meaningful.

Examples:

## Meteor

Creates temporary relic site.

## Ancient Vault Opens

Offers powerful upgrade to whoever reaches it first.

## Great Migration

Temporary recruitment or food opportunity.

## Magical Storm

Changes mage power and visibility.

## Dragon Awakens

Neutral monster occupies valuable territory.

## Gold Rush

One mine temporarily becomes extremely valuable.

World events should create **new decisions**, not simply apply -20% to a number.

---

# 52. What Happens to the Old Survival Game

Most of the existing work does not need to be deleted.

But its importance changes.

## Keep

- individual people
- low-poly visual activity
- deterministic world systems
- health
- combat skills
- named characters
- world generation
- event infrastructure
- Three.js rendering
- existing simulation concepts that remain useful

## Demote heavily

- thirst
- hunger micromanagement
- energy loops
- berry collection
- every person choosing jobs constantly
- civilian skill-tree complexity
- watching people gather for ten minutes
- large crafting chains

Workers can still visually:

- mine
- farm
- build
- carry supplies

But much of this becomes ambience around the strategic game.

---

# 53. Technology

Do not build another huge traditional tech tree.

Progression comes mostly from:

- settlement level
- military doctrines
- roguelike upgrades
- Jev skill trees
- territory unlocks
- relics

This produces substantially more run-to-run variation.

---

# 54. Game Architecture

Stay with TypeScript + Three.js for now.

Do not migrate engines yet.

But separate:

## Simulation

- campaign
- armies
- factions
- combat
- territory
- progression
- Jev decisions

from:

## Presentation

- Three.js
- animations
- spells
- particles
- HUD
- battle presentation
- camera

The simulation should ideally be able to run headlessly.

That allows automated balance testing.

---

# 55. Headless Simulation

Eventually you should be able to run:

> 1,000 games without rendering them.

Then inspect:

- win rates
- average match length
- battle frequency
- Jev survival
- doctrine selection
- unit usage
- overpowered combinations
- comeback rate
- stomp frequency

This is particularly valuable because the game is autonomous.

---

# 56. Development Sequence

## Phase 1: Strategic prototype

Ignore most roguelike complexity.

Build:

- 3 factions
- campaign map
- capitals
- Gold
- territory
- one Jev each
- one army each
- simultaneous turns
- movement
- fight/retreat decision

Goal:

**Can autonomous factions produce an interesting campaign?**

---

## Phase 2: Battle prototype

Build only:

- Swordsmen
- Spearmen
- Archers
- Light Cavalry
- Ogre
- one basic mage
- six Jevs

Add:

- formations
- morale
- retreat
- basic abilities
- 1 to 3 minute battles

Goal:

**Are the battles interesting to watch?**

---

## Phase 3: Campaign economy

Add:

- Gold
- income
- upkeep
- settlement levels
- building slots
- recruitment
- second Jev / second army

Goal:

**Does expansion create meaningful military power?**

---

## Phase 4: Strategic locations

Add:

- Three Crossings
- Black Ridge
- Ancient Forest
- shrine
- mine
- fort

Add territory-specific effects.

Goal:

**Do factions have meaningful reasons to move and fight?**

---

## Phase 5: Fog of war

Add:

- vision
- scouts
- last-known positions
- confidence
- stale intelligence

Goal:

**Can Jevs make understandable mistakes?**

---

## Phase 6: Roguelike doctrines

Start with approximately:

- 15 common upgrades
- 10 uncommon
- 5 rare
- 3 legendary

Add stacking.

Goal:

**Do faction builds visibly diverge?**

---

## Phase 7: Military doctrine branches

Add:

- Heavy Warfare
- Rangers
- Beastmastery
- Arcane

Then branch them further.

Goal:

**Does the army roster become different each run?**

---

## Phase 8: Mages and advanced units

Expand:

- Pyromancer
- Storm Mage
- Druid
- Necromancer
- Illusionist

Add:

- monsters
- siege
- elites

Goal:

**Increase composition variety without losing readability.**

---

## Phase 9: Relics

Add:

- ruins
- Jev drops
- physical relic objects
- relic equipment
- cross-build synergies

Goal:

**Create rare absurd combinations.**

---

## Phase 10: Spectator experience

Add:

- improved HUD
- build cards
- Jev decision panel
- major event presentation
- Director Mode
- camera transitions

Goal:

**Make the game enjoyable even when the player never touches anything.**

---

## Phase 11: Diplomacy and history

Add:

- grudges
- truces
- fear
- trust
- historical memory
- alliances if useful

Goal:

**Make campaign relationships tell stories.**

---

## Phase 12: Endgame and balance

Add:

- final age
- late-game pressure
- alternate victory options
- automated simulation testing
- balance adjustment

Goal:

**Produce consistently satisfying complete runs.**

---

# 57. V1 Scope

The first genuinely playable new-direction prototype should contain only:

## World

- 3 factions
- 7 to 10 regions
- 3 capitals
- 2 special locations
- 1 central contested location

## Economy

- Gold
- income
- upkeep

## Settlements

- 3 building choices
- basic recruitment

## Jevs

All six, even if abilities are simplified.

## Units

- Swordsmen
- Spearmen
- Archers
- Light Cavalry
- Ogre
- Battle Mage

## Campaign

- simultaneous turns
- army movement
- fog of war
- fight/retreat
- territory capture

## Battle

- real-time
- formation
- morale
- retreat
- one tactical Jev decision

## Roguelike

- approximately 12 upgrades
- 2 rarity tiers initially
- several stackable effects

## Victory

Last capital standing.

That is enough to prove the game.

Do not build 40 units first.

---

# 58. The Core Loop

The final loop should feel like:

```text
NEW PROCEDURAL RUN
        ↓
3 factions receive starting Jevs
        ↓
Campaign turn
        ↓
Build / recruit / move / explore
        ↓
Capture territory
        ↓
Gain Gold + unlocks
        ↓
Draft roguelike upgrades
        ↓
Armies specialise
        ↓
Armies encounter each other
        ↓
Jev decides FIGHT / RETREAT
        ↓
REAL-TIME BATTLE
        ↓
Victory / retreat / Jev injury / death
        ↓
XP + relics + territory
        ↓
More armies / stronger builds
        ↓
Bigger wars
        ↓
Broken combinations emerge
        ↓
One faction wins
        ↓
RUN SUMMARY
        ↓
NEW SEED
```

---

# 59. Run Summary

The end screen should celebrate the history that emerged.

Example:

## THE FALL OF GREYHAVEN

Winner:

**Thornwatch**

Turns:

24

### Strongest Jev

Kael the Bloodhound

### Largest battle

Battle of Three Crossings

73 combatants

### Deadliest unit

Thornwatch Berserkers

### Most influential relic

Eye of the Storm

### Turning point

Greyhaven lost Veyra at Black Ridge.

### Final Thornwatch build

- Conscription III
- War Drums II
- Blood Price
- Red Standard
- Eye of the Storm

A timeline could show the run's major events.

This gives the simulation a satisfying conclusion.

---

# 60. Final Product Principle

Whenever we consider adding a new system, ask:

> **Does this create a new strategic situation, a new build possibility, a better battle, or a better story to watch?**

If not, it is probably unnecessary.

The old design was at risk of becoming:

> increasingly detailed people surviving.

The new design should become:

> **increasingly dangerous armies developing strange identities and colliding in unpredictable ways.**

That is the direction.
