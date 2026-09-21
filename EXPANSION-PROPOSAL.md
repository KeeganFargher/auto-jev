# Settlement expansion proposal

Status: the first connected implementation now includes committed Jev plans, 30 building types with tiers, production and staffing, seeded incidents, broader raid loot, and a generated regional map. See README.md for implemented mechanics and current limits. The sections below retain the design direction; not every suggested specialization or transport system is implemented.

## What exists today

- Pumps, sawmills, and irrigation each have a visible 3D model, construction progress, and a hover description. Pump and irrigation models currently look almost identical.
- Every 60 simulation ticks, a pump can spend 1 coal for 6 water; a sawmill can spend 4 wood and 1 coal for 3 planks. Both stop when inputs or output storage are unavailable.
- Irrigation currently plants and harvests all eligible fields across the colony. It spends 1 food and 4 water to plant; it does not have local coverage or assigned operators.
- Machine animations use a simplified fuel/water check, not the complete production conditions. Hover descriptions show recipes, not actual operating status or recent output.
- Machines are colony-wide boolean flags at fixed stations. They are not individually placed, staffed, upgradeable buildings.
- Farms can expand from 3×3 to 5×5. Homes have a basic improvement action. Neither has a deep tier progression.

## Direction

Build a settlement whose industries compete for people, fuel, materials, and space. Research unlocks possibilities; constructing, staffing, and supplying buildings makes them useful. Higher tiers should change how a building works as well as increase output.

Borrow Anno's connection between resident needs, production chains, and workforce. Borrow Frostpunk's choice between staffing workplaces and investing in automation. Keep our named workers and their skills: Jev should care which person works where.

Avoid making every building mandatory. Colonies should be able to specialize, expand, and raid for resources without following one prescribed construction sequence.

## Building families

| Family | Early settlement | Established settlement | Advanced settlement | Meaningful constraint |
|---|---|---|---|---|
| Farming | Hand-worked plot | Irrigated farm | Mechanized farm | Land and water; machinery needs fuel and maintenance |
| Housing | Hut | Timber home | Masonry residence | Better rest and capacity require construction materials and sustained services |
| Water | Staffed well | Powered pump | Waterworks | Suitable location, fuel, and limited service capacity |
| Forestry | Logging camp | Managed forester | Mechanized logging camp | Local tree supply, replanting time, and tools |
| Mining | Surface quarry or mine | Supported mine | Powered mine | Deposits, trained workers, and fuel |
| Timber processing | Saw pit | Sawmill | Precision mill | Competes for wood and power inputs |
| Metal processing | Furnace | Foundry | Steelworks | Ore and coal, then advanced maintenance |
| Manufacturing | Workshop | Toolmaker / armory | Machine shop | Choose civilian equipment or military investment |
| Food processing | Cookhouse | Bakery / smokehouse | Preserving kitchen | Converts supplies into better or longer-lasting meals |
| Storage and logistics | Storehouse | Depot | Frontier supply station | Capacity and travel distance |
| Public services | Clinic / school | Infirmary / academy | Specialist services | Takes skilled people away from direct production |
| Security | Watchpost / palisade | Barracks / gatehouse | Fortified outpost | Equipment, garrison, and upkeep |

This is the target catalogue, not a requirement to build every family in the first release. Split buildings only where recipes, staffing, placement, or strategic roles differ.

## Upgrade example: a farm worth investing in

1. **Plot:** wood and stone construction; workers plant and harvest manually.
2. **Irrigated farm:** planks, metal fittings, and a water connection; automatic watering and improved yield, but planting and harvesting still need workers.
3. **Mechanized farm:** bricks, steel, and machine parts; fewer workers handle more land. Fuel and repairs become ongoing costs.
4. **Specialization:** choose a productive staple crop, a slower crop suited to preservation, or medicinal cultivation. These feed different industries rather than being another universal yield bonus.

Upgrade the existing building in place, reserve its materials once, show construction and temporary downtime, and keep the same identity and history. Enlarging a footprint requires clear land and a reachable work position. Never silently move workers inside the new structure.

Exact costs and yields need simulation balancing. Compare payback time, worker-hours, and days of supplies—not just larger resource numbers.

## New resources with a reason to exist

Introduce chains only when their consumers are playable:

- Clay + kiln fuel → bricks → masonry homes, waterworks, advanced workshops.
- Existing metal + coal → steel → durable tools, reinforced defenses, advanced machines.
- Steel + planks → machine parts → mechanization and maintenance.
- Raw food → prepared meals → better recovery; preservation reduces waste at a processing cost.

Begin with bricks in the first expansion. Add steel and machine parts with the advanced industry release. Avoid stockpiles full of resources that have no current use.

## People occupy real workplaces

- Each building has named occupants or staff slots. Residents belong to homes; workers hold workplace assignments.
- Workers walk to a valid exterior work position or entrance, work, take need breaks, and return. Interior work uses an explicit indoor state rather than clipping a visible character into geometry.
- A building's production comes from worker time and skill, available inputs, and output space. Assigning an absent worker does not create free production.
- Automation replaces some labor with fuel, machinery, and maintenance. It does not eliminate every cost.
- Stable assignments last until a meaningful change: shortage, depleted deposit, injury, danger, upgrade, or deliberate reassignment. No Jev request for every production cycle.
- Buildings pause when their stock target is reached. Workers can then be released or reassigned rather than endlessly filling storage.

## Expansion and conflict

Finite deposits and local service coverage make distant territory useful. Outposts provide nearby storage and services, but workers still need to reach them. Advance toward actual resources rather than painting arbitrary territory.

Later, allow raids against frontier stores carrying fuel, tools, metal, and parts. Taking a shipment can be cheaper than building the industry—but casualties and retaliation can make it a bad choice. Defenses protect real investments. Both independent Jev commanders receive the same rules and only their own observed intelligence.

Do not force attacks on a timer. Give the colonies objectives and competing opportunities, then measure whether fighting is rational. Full transport routes and tactical sieges are separate additions, not prerequisites for tiered buildings.

## Make the world explain itself

- Distinct silhouettes per building and visible additions per tier: water tank and pipes, greenhouse or irrigation channels, sawmill wheel, masonry walls.
- Compact hover: name, tier, status, staff count, and current production. Example: `Water pump · II / Stopped: no coal / 1 of 2 operators`.
- Click to open one small inspector: assigned people, input → output icons, recent output trend, and next upgrade. Expand for detailed costs and history.
- Research unlock and completed building are distinct states. Selecting either can locate its prerequisite or actual structure.
- Show service coverage only when selecting the relevant building. Outline the fields actually served by irrigation.
- Only persistent problems produce event-rail alerts. Deduplicate and clear them when resolved; avoid a new alert every tick.
- Preserve the unobtrusive HUD. Do not put a building spreadsheet on the main screen.

## Jev decisions and input-token budget

Present newly feasible investments, workforce gaps, supply forecasts, and significant problems. Keep routine production, commuting, need breaks, and resumption in the simulation.

Show near-term unlocks and meaningful alternatives, with costs and dependencies. Do not send the entire future building catalogue on every worker question. Summarize stable industries by staffed capacity, output trend, and bottleneck; include individual buildings when choosing placement, staffing, or upgrades.

Ask Jev to choose objectives and trade-offs, not to obey a hard-coded build order. Batch related decisions and keep every request self-contained.

## Random events and Jev responses

Events should create decisions and stories, with lasting effects on the simulation. Mix opportunities, social dilemmas, discoveries, and threats. Avoid a constant sequence of punishments or cosmetic messages.

| Event | Example choices for Jev | Visible consequences |
|---|---|---|
| Travellers request shelter | Admit them, offer supplies, or turn them away | New named residents if accepted; increased housing and food demand |
| Drought warning | Store water, reduce irrigation, or invest in water supply | Falling water production and slower crops for a stated duration |
| Rich deposit discovered | Establish an outpost, send a small expedition, or leave it | A reachable resource site and workers travelling to exploit it |
| Machine breakdown | Repair with parts, assign manual labor, or leave it stopped | A specific machine stops until its chosen repair is completed |
| Exceptional harvest | Preserve the surplus, share a feast, or keep raw supplies | Different storage, recovery, and spoilage outcomes |
| Worker proposes an invention | Fund the experiment, offer a smaller budget, or decline | Worker time and materials invested; disclosed chance of a useful production improvement |
| Rival requests emergency supplies | Give aid, propose an exchange, or refuse | Actual resource transfer and a recorded diplomatic consequence |
| Approaching raiders | Recall exposed workers, garrison defenses, or pay a demand | Preparation followed by a real encounter; no arbitrary stock subtraction labelled as combat |

Only enable an event when its supporting mechanic exists. For example, diplomacy requires persistent relationships and exchanges; an invention requires an implemented improvement. Start with travellers, weather, discoveries, and breakdowns as their respective systems become playable.

### Timing and fairness

- Use weighted random selection with eligibility conditions: no mine incident without a mine, no machinery failure before machinery exists.
- Give early colonies a grace period. Scale threats to development and recovery capacity, with cooldowns and a limit on simultaneous crises.
- Include quiet periods and positive events. Do not spawn a crisis simply because the last one ended.
- Telegraph severe dangers with simulation-time deadlines and actionable preparation. Small surprises can be immediate; major losses should give Jev a chance to respond.
- Use seeded randomness and persist event state and resolved outcomes. Reloading must not reroll an event, duplicate rewards, or erase a deadline.
- Regional weather can affect both colonies, with each Jev choosing independently. Private discoveries and requests stay private unless observed or shared.

### Decision and resolution contract

An event has an identity, affected location/people, stage, deadline, eligible choices, explicit costs, and implemented outcomes. Stages are announced, awaiting decision, carrying out response, and resolved or expired.

Send Jev the situation, relevant current capacity, feasible options, known consequences, and any uncertainty. Let it choose its own trade-off; do not label an option as the correct answer. Revalidate and reserve costs once when accepting a response. Responses that require work create actual jobs or projects rather than instantly completing construction or repairs.

Ask once when a decision becomes available. Ask again only if a material change invalidates the choice or opens a new event stage. Batch non-urgent event choices into the next colony decision; urgent ones can interrupt it. Include active consequences in normal state summaries without resending the full event story each time.

If Jev is temporarily unavailable, follow the game's existing pause behavior. Do not let an API outage silently choose an option or consume the response window. A deliberate choice to ignore an event can expire into its stated consequence.

### Spectator presentation

Show a small event card on the left rail: icon, short title, time remaining, and a location shortcut. Clicking opens the situation, Jev's chosen response and brief rationale, committed people/materials, and eventual outcome. Keep unresolved events visible, then move completed ones into a colony chronicle.

Use animations and scene changes where relevant: a broken pump stops, travellers arrive, crops dry, workers assemble for a repair. The interesting part is watching the response unfold, not reading a wall of generated narrative.

## Implementation shape

Replace fixed machine flags and aggregate home upgrades with individual building records: identity, kind, tier, position, construction progress, assigned workers/residents, and production state. Keep static costs and recipes in a typed catalogue; derive operating status in the authoritative simulation and send that same status to the UI.

Use straightforward data-driven recipes and explicit construction/workplace actions. No general plugin framework or parallel implementations. Navigation owns footprints and entrances; the economy owns material consumption and output; rendering consumes their state.

Use only the new save format when this is implemented. The user's stated preference is a fresh world without compatibility code or backups. Document the reset as part of implementation; this proposal has not reset anything.

## Delivery order

1. **Complete first layer:** individual buildings, construction/upgrade lifecycle, staffing and housing assignment; three farm/home tiers with the third gated behind later research; working well/pump and local irrigation; logging camp; clay pit and kiln; clear inspectors and authoritative operating status. Make the first two tiers fully playable and connect brick production to the third housing tier.
2. **Industrial depth:** foundry, steel, machine parts, toolmaker and mechanized production; finish third farm tier; stock targets, maintenance, and meaningful worker skill effects.
3. **Regional competition:** remote deposits, supply outposts, expanded loot, garrisons, and defenses with an economic purpose.

Each layer must run end to end before starting the next. Do not expose an upgrade as available until its production, costs, visuals, and navigation work.

Include the event lifecycle, compact event UI, and a small set of supported events in the first layer. Expand the event catalogue alongside industry and regional competition, rather than postponing all events until the end.

## Acceptance checks

- Observe both independent colonies build, staff, supply, and upgrade structures through actual Jev decisions.
- Confirm workers travel, break, return, and do not produce while absent or clip into buildings.
- Demonstrate no-input, no-staff, full-storage, construction, and active-production states; verify that visuals match the simulation.
- Verify costs are charged once, shared resources cannot be overspent, and inputs/outputs conserve the intended recipe quantities.
- Run multi-day scenarios: advanced buildings must create useful output without making food, water, and labor irrelevant. Compare population, idle time, shortages, construction, and stock trends.
- Compare input tokens per colony-day and per completed investment against the current assignment system.
- Verify event eligibility, cooldowns, save/reload continuity, one-time costs/outcomes, and independent Jev responses. Observe responses produce actual jobs and visible changes; measure event-related input tokens separately.

## References

- [Ubisoft: Anno 1800 overview](https://www.ubisoft.com/en-us/game/anno/1800) — workforce, resident needs, production chains, and trade.
- [Ubisoft: Anno getting-started guide](https://news.ubisoft.com/en-gb/article/6z7wAll2mXTdQtp79h2B2x/anno-1800-console-edition-4-tips-for-getting-started) — meeting needs before residence upgrades and planning future production.
- [Frostpunk community wiki: automatons](https://frostpunk.fandom.com/wiki/Automatons) — building staffing through automation and refuelling. Community reference, not developer documentation.

The specific buildings, tier effects, and delivery sequence above are proposals for this game, not claims about those reference games.
