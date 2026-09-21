# Jev Game Pivot Plan

## 1. New direction

The game pivots away from being primarily a civilisation and survival simulation towards **an autonomous roguelite RTS** where several Jev-controlled factions build, specialise, fight, adapt and occasionally create completely broken combinations. The player does not directly control anything. They watch the run unfold.

The core entertainment comes from: watching different Jevs respond differently to the same world; seeing factions develop distinct builds; watching strategies emerge rather than being assigned; seeing named characters become important through events; watching wars escalate naturally; discovering unusual or overpowered synergies; some runs becoming stomps and others long, close wars; understanding why factions made important decisions.

The simulation still matters, but it supports the conflict rather than dominating it.

## 2. Core product rule

**The simulation creates situations. Jev chooses the response. The simulation commits to and executes that response.**

Jev does not control every action and does not simulate pathfinding, hunger maths, weapon damage, construction speed or resource production. Those remain deterministic game systems. Jev makes bounded judgements at meaningful moments: which building to prioritise, which doctrine to choose, defend or counter-attack, which contested region to target, whether to retreat, whether to raid the enemy economy, another squad or stronger defences, which relic effect, whether to accept a truce. The game supplies the problem; Jev chooses from valid responses; the game follows through.

## 3. Target experience

A normal run takes 20–40 minutes. Some runs are much shorter; rare runs last much longer. Different match shapes are deliberate: quick collapse or stomp, normal competitive game, comeback, prolonged stalemate, huge endgame war, one faction obtaining an absurd build. Perfect balance is not the goal; interesting variation is.

## 4. Match structure

- **Foundation (0–4 min):** small group, a Founder, a town centre, basic resources, one faction modifier, one starting perk, nearby resources. Construction is quick; a recognisable base (town centre, resource collection, food, first defence, barracks or workshop) exists within a few minutes.
- **Specialisation (3–8 min):** barracks vs tower, economy vs military, ranged vs melee, expansion vs fortification, first doctrine, early relic, first specialist structure. Identities emerge.
- **Contact (5–10 min):** factions discover each other early via scouting, contested resources, central objectives, expanding claims, neutral structures, relic sites, chokepoints. Isolated development is actively prevented.
- **Conflict (8–20 min):** raids, border fights, contested mining, outpost attacks, squad battles, defensive preparation, relic fights, retaliation. War emerges from competition, not a random event.
- **Escalation (18 min+):** outer resources deplete, central objectives strengthen, rare relics spawn, stronger doctrines, victory projects, a more dangerous world, concentrated strategic resources.
- **Endgame:** forced resolution through one remaining faction, control of enough strategic regions, a victory project, destruction of command structures, or domination of objectives. Every route requires interaction with contested parts of the map.

## 5. Reduce survival micromanagement

Hunger, thirst, energy, eating, drinking, sleeping and berry gathering become background systems that rarely trigger Jev decisions. Prefer "the settlement has poor food security; Jev chooses expand agriculture / hunt / raid stores / reduce recruitment / trade / take a food upgrade" over per-person need loops.

## 6. Simplified economy

- **Supplies:** main construction and recruitment resource from wood, stone, mining, salvage and controlled sites. Physical materials can exist without being separate currencies.
- **Food:** population growth, army size, reinforcement, recovery. Settlement-level pressure, not individual hunger.
- **Strategic resource (iron):** advanced weapons, specialist units, stronger structures, late technology. Geographically contested.
- **Relics / Essence / Knowledge:** rare roguelike progression from powerful enemies, objectives, ruins, heroes, major events.

Fewer resources, more meaningful decisions.

## 7. Workers

Workers still exist visually (chop, mine, construct, farm, repair, carry) but their routine behaviour is automatic and committed for meaningful periods. Reconsideration happens when a project completes, danger appears, resource demand changes, strategic priority changes, a worker is injured or an objective becomes unavailable.

## 8. People and named characters

Keep individual people; demote mundane survival statistics; raise combat experience, leadership, injuries, traits, equipment, relationships, achievements and history. Ordinary units (worker, infantry, archer, scout) need limited simulation; named characters (Founder, commander, veteran, specialist, promoted unit) get deeper simulation. A soldier who survives several battles is promoted with a name ("Eli the Scarred").

## 9. Founder system

Each faction begins with a Founder with a few traits, one bonus, one weakness, combat or leadership ability and permanent mortality. The Founder biases decisions without forcing a strategy. (Superseded in detail by `heroes.md`: the Founder is the faction's Jev hero.)

## 10–15. Roguelike build system

Builds come from repeated Jev selections between randomised upgrades in categories (military, defence, economy, mobility, hero, weird/rule-breaking) with rarities (common building blocks; uncommon mechanics; rare build-defining; legendary rule-changing such as War Economy, Glass Empire, Old Guard). Some upgrades stack (War Drums). Upgrades deliberately interact: Conscription + War Drums + Blood Price + Red Standard makes a swarm; Masonry + Repair Crews + Retribution + Citadel makes a fortress. No explicit build classes exist; combinations create them. Do not balance every synergy out of existence. Acquisition is tied to actions (first barracks, first kill, first battle won, Founder level, region captured, outpost destroyed, hero defeated, ruin explored, relic captured, age progression), not only timers.

## 16. Physical relics

Some progression exists physically in the world (a relic at Three Crossings) and can be ignored, scouted, raced for, fortified, fought over, stolen or escorted home.

## 17. World modifiers

Each run has global modifiers: Age of War, Golden Valley, Heroic Age, Long Night, Scarcity, Broken Lands.

## 18–19. Map design and territorial claims

Maps create conflict intentionally: chokepoints, contested centre, strategic resources, hills, crossings, ruins, relic sites, rich regions, exposed expansions. Named places like Three Crossings must matter mechanically. Outposts and major structures create claims; building, mining and patrolling within claims creates tension and grievances; destroying an outpost changes borders.

## 20–23. Conflict, squads, battles

A conflict loop: contested territory → tension → grievance → retaliation → squad deployment → battle → retreat → casualties → territory loss → persistent consequences. Squads (several soldiers, equipment, morale, supplies, experience, optional named commander) receive high-level objectives (defend walls, intercept, raid, retreat, commit reserves, counter-attack, attack base, capture objective); the combat simulation handles targeting, movement, weapons, formations and damage. Armies stay small so individuals matter. Jev gets tactical decision points when circumstances materially change (commander injured, flank lost, reinforcements near): retreat, hold, push, commit reserves.

## 24–26. Persistent history, diplomacy, temporary peace

Track people and heroes killed, territory taken, outposts destroyed, treaties broken, raids, battles, assistance and betrayals as grievances, trust, fear and respect, keeping the historical event as context ("Varra killed Founder Eldon at Three Crossings"). Diplomacy is lightweight: tension, trust, grievance, fear, war exhaustion, provocations; warning, trade, temporary truce, demand withdrawal, surrender, alliance later. Peace is usually temporary and gives pacing: war → recovery → arms race → new conflict.

## 27–29. Snowballing, comebacks, escalation

Snowballing is desirable. Comebacks come from systemic opportunities (veterans drop relics, exposed objectives, expensive large armies, weak supply lines, larger attack surfaces, hero kills rewarded), not hidden bonuses. Long matches become progressively less stable: Foundation 0–5, Skirmish 5–12, War 12–22, Escalation 22–35, Cataclysm 35+.

## 30. World beats

Random events create choices rather than modify numbers: a drought that makes the southern river strategic; migrating herds, exposed iron veins, meteors, vaults, wildfire, refugees, collapsed mines, booms, neutral armies, rare creatures, plague zones.

## 31–35. Spectator UI

Top HUD shows faction status (Supplies, Food, strategic resource, population, army, income trend). The left feed shows only meaningful events. Each faction has a compact build display ("Thornwatch: War Drums III · Conscription II · Blood Price · Red Standard"). A bottom panel shows major Jev choices with scores and the selected card animating into the build. Surface doctrine and relic selection, major commitments, attack vs defend, war, retreats, truces, grievance responses, strategic objectives and succession. Director Mode prioritises interesting events (armies in enemy territory, battles, Founder danger, relics, drafts, sieges, captures, legendary upgrades, promotions) with pan, zoom, hero tracking and slow motion; manual control always remains.

## 36–38. Do not overuse Jev; event-driven calls; emergent strategy

Never ask what code already knows (is food low, which army is stronger). Ask judgement questions given the facts. Trigger decisions on meaningful state changes, not polling; committed jobs continue until completion or interruption. Do not assign static strategy labels; infer them from behaviour.

## 39–40. Preserve and demote

Preserve deterministic production, damage and storage, worker commitments, batching, the low-poly Three.js presentation, named locations, map generation, individual colonists, basic skill progression, the event architecture, animations and HUD concepts. Demote individual hunger and thirst, energy management, berry collection loops, routine survival choices, large tech trees, deep civilian skill trees, passive research as progression, and independent completion of all progression.

## 41–42. Vertical slice and milestones

Build one vertical slice where two or three factions establish bases quickly, compete for a strategic resource, build squads, draft doctrines, fight over an objective, suffer casualties, gain an upgrade from winning, retaliate or recover, and produce a winner. Milestones: accelerate the opening; simplified economy; real squads; strategic objective; conflict loop; roguelike draft; synergies; spectator presentation; director camera; escalation and endgame.

## 43–45. Initial pools and match rules

First upgrade pool: Drill, Masonry, Sharp Blades, Fletching, Efficient Training, Scouts (common); War Drums, Repair Crews, Blood Price, Veteran Command, Field Medicine, Defensive Formation (uncommon); Conscription, Retribution, Momentum, Salvagers, Last Stand (rare); Red Standard, Citadel, War Economy, Old Guard (legendary). World modifiers: Golden Valley, Heroic Age, Age of War, Scarcity, Long Night, Broken Lands. Initial match: 3 factions, 6–8 starting people, one Founder each, one town, one starting modifier each, one major contested region, small armies, 20–30 minute target, elimination as the first victory condition.

## 46–50. Philosophy

Optimise for understandable outcomes, varied builds, surprises, counters, visible snowballing, comebacks and memorable moments, not equal win rates. Randomise opportunities (offers, relics, traits, modifiers, seeds, objectives, distribution, major events), not facts (damage, movement, accounting). The design test for every system: does it create a situation where Jev must make an interesting choice, or does it merely add simulation? The loop: build quickly → draft → specialise → compete for objectives → fight → gain scars, veterans and relics → draft stronger → unusual builds → escalate → one faction wins. Success is a spectator saying "Red is going full military again", "Blue has somehow become impossible to siege", "Wait, their Founder is still alive?", "This build is completely broken."
