import * as THREE from "three";
import { hudIcon } from "./hud-icons.js";
import { portraitOf, jevPortraitOf } from "./card-art.js";

const UNIT_ICON = {
  militia: "people", spearmen: "spear", swordsmen: "weapons", archers: "bow", crossbowmen: "bow",
  light_cavalry: "horse", heavy_cavalry: "horse", shieldguard: "shield", great_weapons: "mace",
  ogre: "beast", battle_mage: "essence", catapult: "catapult",
};
/**
 * What a block is doing, as one glyph on its banner. A spectator should be able to tell at a glance
 * that the spears are holding, the horse are swinging round and the archers are backing off —
 * without reading anything.
 */
const MODE_ICON = { hold: "shield", engage: "battle", skirmish: "target", flank: "horse" };
const modeOf = (unit) => (unit.routed ? "skull" : unit.state === "withdrawing" ? "truce" : MODE_ICON[unit.stance] ?? "weapons");
const SHORT = {
  militia: "Militia", spearmen: "Spears", swordsmen: "Swords", archers: "Archers", crossbowmen: "Crossbows",
  light_cavalry: "Lt Horse", heavy_cavalry: "Knights", shieldguard: "Shieldguard", great_weapons: "Greatweapons",
  ogre: "Ogre", battle_mage: "Mage", catapult: "Catapult",
};

/**
 * The battle's readable layer: a banner floating over every unit block, and a card strip for each
 * army. Without these a battle is just models on grass — the banners are what let a spectator follow
 * who is winning from a distance, which is the whole point of watching.
 */
export function createBattleHud(container, camera, toWorld, heroes = [], abilities = {}) {
  const layer = document.createElement("div");
  layer.className = "battle-layer";
  const cards = document.createElement("div");
  cards.className = "battle-cards";
  // One row per side, each led by that side's Jev. Stacking the Jevs above the unit strips put a
  // block the better part of a third of the screen tall right over the fighting.
  const strips = document.createElement("div");
  strips.className = "strips";
  const sideRow = (side) => {
    const row = document.createElement("div");
    row.className = `strip ${side}`;
    row.innerHTML = `<div class="hero-slot"></div><div class="unit-row"></div>`;
    return row;
  };
  const rows = { attacker: sideRow("attacker"), defender: sideRow("defender") };
  strips.append(rows.attacker, rows.defender);
  cards.append(strips);
  container.append(layer, cards);
  const banners = new Map();
  const cardNodes = new Map();
  const heroPanels = new Map();
  const point = new THREE.Vector3();

  /** A Jev's portrait, health and kit with live cooldown sweeps, Warhammer style. */
  const makeHeroPanel = (lord, colour) => {
    const hero = heroes.find((entry) => entry.id === lord.heroId);
    const kit = abilities[lord.heroId] ?? [];
    const node = document.createElement("div");
    node.className = `hero-panel ${lord.side}`;
    node.style.setProperty("--crest", colour);
    node.style.setProperty("--hero", hero?.color ?? colour);
    // Compact: portrait, name, health, and three cooldown pips. Each pip shows its ability's initial
    // while it is ready and its countdown while it is not, with the full text on hover — enough to
    // follow "the ultimate is nearly up" without a panel the size of a playing card.
    node.innerHTML = `
      <span class="hero-crest">${jevPortraitOf(lord.heroId) === null ? hudIcon("helm") : `<img src="${jevPortraitOf(lord.heroId)}" alt="" draggable="false">`}</span>
      <div class="hero-meta">
        <strong class="hero-name">${hero?.name ?? "The Jev"}</strong>
        <div class="hero-hp"><i></i></div>
      </div>
      <div class="hero-kit">${kit.map((ability, index) => `
        <div class="slot${index === kit.length - 1 ? " ultimate" : ""}" data-slot="${index}" title="${ability.name} · ${ability.cooldown}s — ${ability.text}">
          <span class="sweep"></span><span class="count"></span>
        </div>`).join("")}</div>`;
    return {
      node, hp: node.querySelector(".hero-hp i"), kit,
      slots: [...node.querySelectorAll(".slot")].map((slot) => ({ node: slot, sweep: slot.querySelector(".sweep"), count: slot.querySelector(".count") })),
    };
  };

  const makeBanner = (unit, colour) => {
    const node = document.createElement("div");
    node.className = "banner";
    node.innerHTML = `
      <div class="flag" style="--crest:${colour}">${hudIcon(UNIT_ICON[unit.unitId] ?? "people")}<i class="mode"></i></div>
      <div class="bars"><div class="hp"><i></i></div><div class="mo"><i></i></div></div>
      <div class="count"></div>`;
    layer.append(node);
    return {
      node,
      hp: node.querySelector(".hp i"),
      mo: node.querySelector(".mo i"),
      mode: node.querySelector(".mode"),
      count: node.querySelector(".count"),
    };
  };
  const makeCard = (unit, colour) => {
    const node = document.createElement("div");
    const art = portraitOf(unit.unitId);
    node.className = `ucard${art === null ? " no-art" : ""}`;
    node.style.setProperty("--crest", colour);
    // A square chip rather than a named portrait card. The art still says what the unit is, the pip
    // says what it is doing and the number says how many are left; the name lives on hover.
    node.title = SHORT[unit.unitId] ?? unit.unitId;
    node.innerHTML = `
      <div class="art">${art === null ? hudIcon(UNIT_ICON[unit.unitId] ?? "people") : `<img src="${art}" alt="" draggable="false">`}<i class="mode"></i></div>
      <div class="hp"><i></i></div>
      <div class="num"></div>`;
    return { node, hp: node.querySelector(".hp i"), num: node.querySelector(".num"), mode: node.querySelector(".mode"), side: unit.side };
  };

  return {
    /** Re-places every banner and refreshes both card strips from one server frame. */
    update(frame, factions, width, height) {
      const colourOf = (side) => factions.find((faction) => faction.id === (side === "attacker" ? frame.attackerFactionId : frame.defenderFactionId))?.color ?? "#cccccc";
      // Aggregate the loose fighters back into the blocks they belong to.
      const blocks = new Map();
      for (const fighter of frame.fighters) {
        if (fighter.st === "routing") continue;
        const block = blocks.get(fighter.c) ?? { x: 0, y: 0, n: 0, hp: 0, max: 0, lord: false };
        block.x += fighter.x; block.y += fighter.y; block.n += 1;
        block.hp += fighter.h; block.max += fighter.m;
        if (fighter.l !== null) block.lord = true;
        blocks.set(fighter.c, block);
      }
      const seen = new Set();
      for (const unit of frame.units) {
        const block = blocks.get(unit.id);
        if (block === undefined || block.n === 0) continue;
        seen.add(unit.id);
        let banner = banners.get(unit.id);
        if (banner === undefined) { banner = makeBanner(unit, colourOf(unit.side)); banners.set(unit.id, banner); }
        point.copy(toWorld(block.x / block.n, block.y / block.n));
        point.y += block.lord ? 5 : 3.4;
        point.project(camera);
        const visible = point.z < 1;
        banner.node.style.display = visible ? "" : "none";
        if (!visible) continue;
        banner.node.style.transform = `translate(${(point.x * 0.5 + 0.5) * width}px, ${(-point.y * 0.5 + 0.5) * height}px) translate(-50%, -100%)`;
        banner.node.classList.toggle("lord", block.lord);
        banner.node.classList.toggle("breaking", unit.morale < 45);
        banner.node.classList.toggle("charging", unit.stance === "flank" && unit.state === "engaged");
        const mode = modeOf(unit);
        if (banner.mode !== null && banner.shownMode !== mode) { banner.shownMode = mode; banner.mode.innerHTML = hudIcon(mode); }
        banner.hp.style.width = `${Math.max(0, Math.min(100, block.hp / Math.max(1, block.max) * 100))}%`;
        banner.mo.style.width = `${Math.max(0, Math.min(100, unit.morale))}%`;
        banner.count.textContent = String(block.n);
      }
      for (const [id, banner] of banners) if (!seen.has(id)) { banner.node.remove(); banners.delete(id); }

      // --- the card strips
      for (const unit of frame.units) {
        let card = cardNodes.get(unit.id);
        if (card === undefined) {
          card = makeCard(unit, colourOf(unit.side));
          cardNodes.set(unit.id, card);
          (rows[unit.side] ?? rows.attacker).querySelector(".unit-row").append(card.node);
        }
        const block = blocks.get(unit.id);
        const alive = block?.n ?? 0;
        card.node.classList.toggle("dead", alive === 0);
        card.node.classList.toggle("breaking", unit.morale < 45 && alive > 0);
        card.hp.style.width = `${Math.max(0, Math.min(100, (block?.hp ?? 0) / Math.max(1, block?.max ?? 1) * 100))}%`;
        card.num.textContent = alive === 0 ? "—" : String(alive);
      }

      // --- the Jevs: health and cooldowns, sweeping down against the interpolated tick clock.
      const clock = frame.clock ?? frame.tick;
      for (const lord of frame.lords ?? []) {
        let panel = heroPanels.get(lord.id);
        if (panel === undefined) {
          panel = makeHeroPanel(lord, colourOf(lord.side));
          heroPanels.set(lord.id, panel);
          (rows[lord.side] ?? rows.attacker).querySelector(".hero-slot").append(panel.node);
        }
        const fighter = frame.fighters.find((entry) => entry.i === lord.fighterId);
        const fallen = fighter === undefined || fighter.st === "routing";
        panel.node.classList.toggle("fallen", fallen);
        panel.hp.style.width = `${fighter === undefined ? 0 : Math.max(0, Math.min(100, fighter.h / Math.max(1, fighter.m) * 100))}%`;
        panel.slots.forEach((slot, index) => {
          const ability = panel.kit[index];
          const total = ability === undefined ? 1 : ability.cooldown * 10;
          const left = Math.max(0, (lord.cooldowns?.[index] ?? 0) - clock);
          const casting = lord.casting !== null && lord.casting !== undefined && lord.casting.slot === index;
          slot.node.classList.toggle("cooling", left > 0 && !casting);
          slot.node.classList.toggle("casting", casting);
          slot.sweep.style.background = left > 0 && !casting
            ? `conic-gradient(from 0deg, rgba(8, 11, 12, 0.74) ${Math.min(1, left / total) * 360}deg, transparent 0)` : "none";
          // Counting down while it cools, the ability's initial once it is up again.
          slot.count.textContent = left > 0 && !casting ? String(Math.ceil(left / 10)) : (ability?.name ?? "?").slice(0, 1);
        });
      }
    },
    dispose() { layer.remove(); cards.remove(); },
  };
}
