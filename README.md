# Jev Rivals

Two independent Jev commanders run rival colonies on one 192 × 128 low-poly island. The server owns movement, resources, crafting, research and raid outcomes. The browser is a spectator: switch between **Ember** and **Tide**, inspect workers, and watch the consequences of each commander's choices.

## Run

```sh
npm install
node --env-file=.env --import tsx src/server.ts
```

Set `CLOUDFLARE_ACCOUNT_ID` and `CLOUDFLARE_API_TOKEN` in `.env`. Credentials stay on the server. Both commanders use `typesafe/jev`, with separate identities, requests, stocks, workers, priorities and reports. They are independent instances of the same model, not different trained models.

```sh
npm run typecheck
npm run build
node --env-file=.env dist/server.js
```

Run one server process. The server atomically saves the current match to `data/world.json` every five seconds and on graceful shutdown. Only the current schema is supported. To reset, stop the server, delete `data/world.json`, then restart. No archives are created. Invalid data stops startup instead of silently replacing a match.

## Worker progression

Workers can reach level 30. Each level grants one skill point; advancing from level L costs `100 + 50L + 8L²` XP. Productive work earns XP, with research, construction and raids worth more than basic gathering. Apprenticeships increase XP earned by 20%.

Twenty skill nodes span gathering, crafting, farming, movement, survival, warriors and care. Nodes have level requirements, prerequisites and limited ranks. There are more available ranks than lifetime points, so Jev must specialise workers. Skills affect actual yields, work speed, travel, hunger, thirst, fatigue, healing and raid outcomes. Veteran retreat can save a developed fighter from a lethal raid once every two colony days, at the cost of all loot.

Select a worker, then **Skill tree & history** to inspect requirements, investments, equipment and milestone history. The viewer inspects; Jev chooses upgrades when points and prerequisites permit them.

## Settlement progression

A workshop and 20 completed jobs unlock research planning. Fourteen technologies form prerequisite branches across civic development, agriculture, industry and frontier security. Planning names a goal before its materials are available. Starting research reserves its materials once; up to two workers contribute work. Interrupted research retains its progress.

- **Camp → Village → Town → Regional capital** raises the population ceiling from 8 to 12, 24 and 48.
- Housing supplies four beds per hut. Recruitment requires room under both limits, food, water and planks, with a one-day cooldown between arrivals.
- Crop rotation supports six fields. Terraced fields expand individual farms from 3×3 to 5×5 and double base harvests.
- Metalworking unlocks distant iron and coal, smelting and durable tools. Militia unlocks spears. Equipment must be crafted and equipped; tools last 24 productive jobs and spears 12 encounters.
- Thirty individually placed building types cover food, water, forestry, extraction, industry, civic services and the frontier. Each has three tiers. Tier II needs Town Charter, bricks and metal; tier III needs Regional Capital, steel and machine parts.
- Operators walk to workplaces, spend inputs, perform work, then produce outputs. Need breaks preserve their assignment. Tier II sawmills and pump houses can run unattended but consume coal. Advanced production wears machinery and periodically consumes parts.
- Irrigation stations serve fields within 16 tiles. Homes add beds, granaries and warehouses add storage, clinics heal, schools grant experience, and staffed military buildings add defense.
- Clay pits feed brick kilns. Foundries produce metal, and tier II foundries also produce steel. Machine shops turn steel and planks into parts. Trading posts exchange timber for coal and metal.
- Storage, preservation, education and medicine improve capacity and efficiency. Capital colonies can spend surplus resources on increasingly expensive civic monuments.

Jev also chooses one settlement identity: agriculture improves harvests, industry improves manual plank output, and frontier improves raiding. Research in the matching branch takes 25% less work. Other branches remain accessible.

Open **Settlement → Settlement tree** to inspect prerequisites, resource costs, current research and the colony's milestone history. The catalogue in `src/catalog.ts` is shared with the browser, so displayed skill and technology definitions come from the simulation.

## Economy and decisions

Stocks have visible capacities and active production reserves room before another job starts. Food spoils every quarter day; granaries reduce spoilage. Houses consume wood for fuel. Machines stop when inputs run out or output storage is full. Equipment, research, buildings, recruitment and monuments consume stocks. Water and fishing remain renewable, but collection takes worker time and travel.

Farms cost 24 wood and 8 stone. Crops grow for 360 ticks and yield 14 food before bonuses; expanded fields yield 28. Trees regrow after 4,800 ticks, or half that with managed forestry. Berries regrow after 960 ticks. Iron and coal are finite deposits near the central frontier. A day is 480 active simulation ticks.

Idle workers are batched per colony. Jev selects among legal actions and weighs the trade-offs; there is no prescribed build order. Gathering and crafting assignments cover up to eight jobs. Workers take meal, drink and rest breaks and resume their assignment without a model call. Assignments end for storage limits, unavailable resources, earned upgrades or changes in colony priority, supply shortages, population, research, projects or rival intelligence. Each request shares repeated action descriptions, omits unlearned talent ranks and includes the current workforce assignments. Queued decisions refresh their state before dispatch. `/api/decision-usage` reports process-session request counts, question counts, input tokens per colony-day, applied/discarded answers, autonomous jobs, need breaks and decision reasons. Missing provider usage is not included in the existing token counters; treat those totals as reported usage, not an invoice. Priority decisions respond to supply, population, research, development and rival events, with a cooldown. Worker skill choices enter the action menu when earned. Research and industrial investment belong to a separate Jev council decision; the next dependencies and their benefits are included. Future trees remain visible to the spectator.

Long journeys can reserve food and water to consume en route. Movement uses A* paths around props, with skill-dependent walking speed and bounded visual interpolation. The renderer uses movement credit along the next planned tile so walking stays continuous between tile commits; Jev assigns complete routes, not individual steps. Natural resources use instanced rendering to keep the larger map affordable.

## Rivalry

Starting supplies, traits, skills and needs are equal. Seeded terrain contains coastlines, clustered forests, mineral districts and a winding river with three crossings. Each camp has a protected clearing, a local stream and equal starting resource caches; the surrounding terrain is not mirrored. Stocks and histories are separate. Natural resources are shared and contested, with resource targets reserved across both colonies.

Scouting unlocks at Village and records the rival's food, defenses and population at the time of the visit. Jev receives that dated report, not the opponent's current private state. Raiding becomes available after scouting. The spectator can see both colonies.

Raiders travel to the rival store, survive defenses, and carry loot home. Strategic raids can target metal, coal, tools or food. Palisades and guards increase damage and reduce loot; equipped spears and warrior skills change those outcomes. Loot enters the raider's stockpile only after delivery. Combat resolves statistically at the camp: this is an ongoing rivalry, without tactical unit combat, wall placement or a victory screen.

If one commander's API request fails, that colony pauses and retries after ten seconds. No local AI substitutes for Jev. The other colony continues on its own clock.

## Viewing

**WASD** pans the camera; hold **Shift** to pan faster. Drag to orbit, scroll to zoom, or right-drag to pan. Choose a colony to centre the camera and show its HUD. **Both camps** frames the full map; **Reset view** returns to the selected colony. Keyboard panning stops while inspecting progression trees.

The compact resource bar uses icons and amounts with green upward, red downward and neutral flat trends. Hover for names and storage limits; click any counter for history. Charts show capacity and net trends; graphs offer 1 day, 5 days or all retained samples. History records every ten active ticks, retaining up to 20 colony days. These are sampled stock levels, not gross production counters.

The bottom-left minimap shows both camps, workers and the camera footprint. Click it to move the camera; when focused, arrow keys pan and Enter returns home. Important shortages, danger and milestones appear on the left event rail; click for details and a location shortcut. The Settlement button opens icon counters and the active investment; hover or focus a counter for details, expand More details for rival and workshop information, or open the settlement tree. Resource icons show immediate tooltips with storage and trends. Hover world objects (or tap them) to identify their purpose and current state.

Select a worker for needs, XP, standing orders and decision probabilities. The Journal labels events by colony. Press **H** to hide the HUD or **Escape** to close panels. WebGL is required; Three.js is served locally.

## API

- `GET /api/world`: current match, progression catalogue and recent events.
- `GET /api/events`: catalogue, snapshots, initial per-colony history, incremental samples and events.
- `GET /api/health`: each commander's status, error and tick, plus viewer count.

### Watching the colonies

The spectator rail shows both Jev commanders' chosen priorities or active investments, with progress where work is measurable. Up to three stories highlight worker danger, raids, scouting, shortages, construction, recent outcomes, or experienced workers. These summaries use actual simulation state and recorded milestones; they do not invent motives or make additional Jev requests.

Click an intention or story to inspect its context and recent history, locate it, or follow its worker or colony. The worker inspector also has a Follow button. Director mode in the bottom toolbar follows live stories automatically, holding a shot for at least 14 seconds while it remains relevant. Dragging, zooming, WASD, the minimap, Home, or World takes camera control back. Stop following also leaves the camera where it is. Reduced-motion preferences remove camera easing.

Collapse Stories to an icon rail to keep more of the world visible; this is the initial layout on small screens. Hover or focus icons for tooltips, or tap to open details. Spectator controls never change game speed, AI choices, or resources. World events and settlement commitments appear in the same story rail. Open Settlement → Buildings & production, or click a workplace, for its operator, condition, production and upgrade requirements.

## Committed plans and world events

Each commander chooses a settlement objective separately from worker survival actions. Two assigned workers pursue its prerequisites, missing materials and construction. Planned construction materials are protected from ordinary discretionary crafting; survival supplies remain available. Essential resupply and personal needs interrupt work. Completed objectives trigger a new council choice; a plan without execution progress for two days becomes eligible for reconsideration. Colony priorities are also reviewed at least daily.

The simulation does not choose a research order for Jev. It resolves the dependencies of the goal Jev selected. New workplaces receive an available operator while keeping workers free for general needs and construction. Operators can gather missing basic inputs. Exhausted extraction sites can be relocated by a council decision. Residential halls have named residents and can be built more than once.

After a three-day grace period, seeded incidents recur at variable three-to-six-day intervals: travellers seeking housing, merchant offers, drought, machinery breakdowns and approaching raiders. Only supported incidents are eligible. Jev chooses from feasible responses; costs and outcomes are stored once. Drought changes water needs and crop growth. Merchants transfer real supplies. Travellers join the population only when housing and food/water allow it. Broken machinery stops. Raider encounters resolve against actual nearby defenders and staffed military buildings. These remain statistical encounters, not tactical combat units.

Event state and random-generator state are saved. A pending response is not silently chosen on Jev's behalf. Model failures pause the affected colony using the same retry policy as worker decisions. The catalogue, plans, events and new terrain use only the current save format.
