# Unit portraits

The poster for a regiment — the picture that says what it is. Drop `<unit_id>.png` in here and the
game uses it everywhere that unit appears: the card strip along the bottom of a battle, the
"Recruit X" choice card, and the unit list in the faction panel. No file means the unit falls back
to its line icon and the card keeps its drawn backdrop. Restart the server after adding files.

## What a file should be

- **3:4 portrait, 512×683.** The battle card is 66×96 and the portrait fills all of it, so almost
  the whole image survives — but a dark gradient covers the bottom third, where the name sits. Keep
  the head and weapon in the **upper two thirds** and let the boots fade into the gradient.
- **Silhouette first.** The battle card renders the art at **66×96 px**. Shrink a draft to that and
  see whether you can still name it — spear-line vs sword vs bow vs horse vs one-huge-monster is
  what has to survive. Detail below that threshold is free, not load-bearing.
- **Faction-neutral.** All factions recruit the same Spearmen; the card draws the faction colour as
  a band under the portrait and a frame around it. Keep leather, steel and cloth in the art, not
  team colour. The exception is anything that only one side ever fields.
- PNG, opaque is fine here (unlike `public/icons`, these fill a frame rather than float on the HUD).

## The twelve

| file | unit | what it is |
| --- | --- | --- |
| `militia.png` | Militia | farmers with spears, no armour |
| `spearmen.png` | Spearmen | braced points, kettle helm and a wooden shield |
| `swordsmen.png` | Swordsmen | line breakers, sword and shield |
| `archers.png` | Archers | hooded, drawing a longbow |
| `crossbowmen.png` | Crossbowmen | levelled crossbow, punches through plate |
| `light_cavalry.png` | Light Cavalry | hooded rider, spear, fast |
| `heavy_cavalry.png` | Heavy Cavalry | armoured knight, couched lance, the hammer |
| `shieldguard.png` | Shieldguard | an immovable wall behind a great shield |
| `great_weapons.png` | Great Weapons | two-handed axe, armour is a suggestion |
| `battle_mage.png` | Battle Mage | robed, staff and a gathering spell |
| `ogre.png` | Ogre | one enormous problem with a club |
| `catapult.png` | Catapult | the siege engine itself, no crew needed |
