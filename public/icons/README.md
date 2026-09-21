# Icon sprites

Drop a PNG in here named after a HUD icon and the whole game starts using it. Nothing else to
change: the server lists this folder at startup and sends the names with the catalog, and
`hudIcon()` hands back the sprite instead of its line drawing. Delete the file and the drawing
comes back. Restart the server after adding files — it reads the folder once, at boot.

## What a file should be

- **Transparent PNG.** No white background.
- **512×512**, square canvas, subject centred with roughly 8% padding.
- One light direction across the whole set (top-left, matching the world's own shading).
- Named exactly as below, lowercase, `.png`.

Sprites are full colour and ignore the HUD's tinting, so anything that takes a faction colour keeps
it in the ring around the icon rather than the icon itself.

## The names

### Resources and stores
| name | what it means | where it shows |
| --- | --- | --- |
| `supplies` | coins, gold | resource bar, the "bank it" choice card |
| `food` | provisions | resource bar |
| `iron` | ore | resource bar |
| `wood` | timber | resource bar |
| `essence` | magic, relics | battle mages, relic events |

### People and command
| name | what it means | where it shows |
| --- | --- | --- |
| `helm` | a Jev — the commander | resource bar, versus crest, faction panel, "raise a Jev" |
| `people` | soldiers, a crowd | militia, soldier count, the recruit card |
| `crown` | victory, a capital | victory events |
| `morale` | a heart | army morale |

### Weapons and units
| name | what it means | where it shows |
| --- | --- | --- |
| `weapons` | a single sword | swordsmen, engage stance |
| `battle` | crossed swords — a fight | battle events, the "fight" choice card |
| `spear` | a spear | spearmen |
| `bow` | bow and arrow | archers, crossbowmen |
| `mace` | a heavy weapon | great weapons |
| `shield` | a shield | shieldguard, hold order, the "hold" card |
| `horse` | a mount | light and heavy cavalry, flanking |
| `catapult` | a siege engine | catapults |
| `skull` | a human skull | a dead Jev, an eliminated faction |
| `beast` | a monster skull | ogres, routed units |

### Places and orders
| name | what it means | where it shows |
| --- | --- | --- |
| `flag` | a banner | provinces, march orders, the "march" card |
| `truce` | a white flag | withdrawing, falling back |
| `tower` | a keep, walls | sieges, fortification |
| `settlement` | a house | buildings, captures |
| `map` | the world | the World button |
| `move` | going somewhere | move orders, the "N moves" chips |
| `target` | an eye — watching | scouting, skirmishing, the camera badge |

### Moments and meta
| name | what it means | where it shows |
| --- | --- | --- |
| `star` | a level, a skill, a rising faction | level-ups, skill choices, the ascendant story |
| `fire` | a raid, burning | raid orders, the raid card |
| `warning` | danger | capital threatened, bankruptcy, a shattered host |
| `journal` | a book | the War journal |
| `scroll` | a decree | doctrine and building stories |
| `camera` | a lens | the Director button |
| `tools` | a gear | settings |

## Still to draw

Everything above has a line drawing today, so nothing is broken without it. These are the ones
where the drawing is weakest and a sprite would earn its place first:

`star`, `warning`, `helm`, `truce`, `tower`, `horse`, `spear`, `battle`, `skull`, `scroll`, `move`.
