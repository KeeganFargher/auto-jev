# Jev Rivals

An autonomous roguelite RTS you watch rather than play. Three factions, each led by a Jev commander (the `typesafe/jev` model on Cloudflare) and a named Jev hero, build bases on one 192 × 128 low-poly island, draft doctrines, compete for iron at Three Crossings, go to war, and eventually produce a winner. The simulation creates situations; Jev chooses the response; the simulation executes it.

## Run

```sh
npm install
node --env-file=.env --import tsx src/server.ts
```

Set `CLOUDFLARE_ACCOUNT_ID` and `CLOUDFLARE_API_TOKEN` in `.env`. Each faction has its own stateless commander instance; they share the model, not memory. For development without any model calls:

```sh
npm run dev:offline        # server with the offline stub (deterministic heuristic, clearly labelled in the HUD)
npm run headless -- 7 9000 60   # fast-forward seed 7 for 9000 ticks, printing events with importance ≥ 60
```

The offline stub is a development aid only. It scores options with fixed hints plus seeded noise; it is not an AI and the HUD says "Offline stub" whenever it is running.

`npm run typecheck` and `npm run build` as before. The server saves `data/world.json` (override with `WORLD_PATH`) every five seconds; only the current schema loads. Delete the file to start a fresh match. When a match finishes, a new one starts automatically after 90 seconds (`MATCH_RESTART_MS`), or immediately via `POST /api/restart`.

## The loop

1. **Foundation (0–4:30).** Each faction starts with a town centre, seven workers, 130 Supplies and 70 Food. The first decision is which of three offered Jevs will lead. Workers gather automatically; the commander chooses only projects (farm, barracks, range, tower, forge, or a training batch).
2. **Skirmish (4:30–12:00).** Everyone knows everyone. Iron exists only at four strategic regions; Three Crossings is the richest. Mining in another faction's claim raises tension. The first military building opens the first doctrine draft.
3. **War (12:00–22:00).** Squads capture regions by raising outposts, raid economies, burn outposts and assault towns. Wars start from tension decisions or from provocative objectives.
4. **Escalation (22:00–35:00).** Gathering yields fall. Holding Three Crossings uncontested for six minutes wins.
5. **Cataclysm (35:00+).** Every faction drafts a legendary doctrine; gathering collapses to 45%. The match times out at 70 minutes on score.

Victory: last faction standing (town centre razed or nobody left), domination, or timeout.

## What Jev decides

Seven decision kinds, asked only when the state calls for them and answered with a scored choice:

| Kind | Trigger | Options |
|---|---|---|
| hero | match start | three Jevs, no duplicates across factions |
| build | the previous project completed | affordable buildings, training batches, or hold Supplies |
| doctrine | first military building, battle won (≥3 kills), region captured, outpost burned, Jev slain, Jev level 3/5/7/10, every phase | three doctrines weighted by rarity and phase |
| objective | idle soldiers at home, on a cooldown | stay, claim/take a region, raid, burn an outpost, assault a town, intercept, reinforce, seek a truce, recall |
| tension | tension ≥ 60 with a known rival | warn, fortify, propose a truce, declare war |
| truce | a rival proposed one | accept, reject |
| battle | a fighting squad drops below 60% or its commander is badly wounded | hold, push, retreat, commit reserves |

Every answer is recorded with its options and probabilities, shown in the draft panel and kept in the faction's decision log. Workers, movement, targeting, damage, morale and construction are deterministic and never ask Jev.

## Economy

Four stocks: **Supplies** (wood and stone, for everything), **Food** (settlement upkeep and growth; starvation weakens people), **Iron** (only at strategic regions; forges arm recruits), **Essence** (from kills, battles and captures; a progression score). Workers commit to a job for several trips and re-plan when a project completes, food security changes or enemies approach. Population grows from the town centre while food lasts, capped by farms; armies are capped by barracks, ranges and farms so battles stay readable (about 6–12 a side).

## Military and conflict

Squads move as a group along A* routes, fight deterministically (infantry 2 tiles, archers 5, towers 6), break at low morale, and retreat home. Battles are named after the nearest region or town, resolve when the fighting stops, and give the winner Essence and a draft. Claims come from town centres (20 tiles), outposts (12) and towers (7); trespass and disputed mining accrue tension; grievances are remembered as text and shown to Jev. Soldiers who survive three battles with two kills earn a name and a title; named deaths are grievances and, with Old Guard, inheritances.

## Jevs

Six heroes in `src/heroes.ts` (Veyra, Thorn, Kael, Elowen, Nyx, Orun) with a passive that hooks into combat or the economy, a personality that biases the commander's choices, real mortality and levels from battles and faction milestones. Level 3/5/7/10 currently trigger doctrine drafts; the branching ability choices from `heroes.md` are the next step.

## Doctrines

Twenty-one in `src/doctrines.ts` (6 common, 6 uncommon, 5 rare, 4 legendary); several stack. Effects apply through `src/modifiers.ts` and the combat code in `src/military.ts`, so War Drums + Conscription + Blood Price + Red Standard genuinely snowballs and Masonry + Repair Crews + Retribution + Citadel genuinely fortifies.

## Viewing

**WASD** pans, drag orbits, scroll zooms, right-drag pans. The top strip shows every faction's Jev, stocks, income arrows, people, army and last doctrines; click a card to focus it. The left rail shows each faction's current project or army objective and the developing stories (battles, Jevs in danger, marching squads, domination). **Director** follows the highest-scoring story automatically and holds each shot for about twelve seconds unless something far more important erupts. The bottom-centre draft panel shows consequential decisions with their scored options. **Builds** opens every faction's Jev, build, relations and recent decisions. Click people, buildings or region markers to inspect them; **H** hides the HUD.

## API

- `GET /api/world`: full match state, catalogue and recent events.
- `GET /api/events`: server-sent catalogue, snapshots and events.
- `GET /api/health`: commander status per faction.
- `GET /api/decision-usage`: request counts by kind and tokens since process start.
- `POST /api/restart`: start a new match once the current one has finished.

## Design documents

`PIVOT-PLAN.md` is the direction for this version; `heroes.md` is the Jev roster; `EXPANSION-PROPOSAL.md` describes the earlier settlement simulation this game grew out of.
