/**
 * Turns the campaign state into the handful of things actually worth watching right now, scored so
 * the director can follow the best one. This is the spectator's thread through the match: who is in
 * danger, who is about to win, which Jev is hunting whom.
 */

const label = (value) => String(value ?? "").replaceAll("_", " ");

export function developingStories(world, catalog = { heroes: [] }) {
  if (world === null || world === undefined) return [];
  const stories = [];
  const name = (lord) => catalog.heroes?.find((hero) => hero.id === lord.heroId)?.name ?? label(lord.heroId);
  const provinceOf = (id) => world.provinces.find((entry) => entry.id === id);
  const factionOf = (id) => world.factions.find((entry) => entry.id === id);
  const settled = world.provinces.filter((province) => province.settlement !== null);

  for (const faction of world.factions) {
    if (faction.eliminated) continue;
    const held = world.provinces.filter((province) => province.ownerId === faction.id);
    const armies = world.armies.filter((army) => army.factionId === faction.id);
    const base = { factionId: faction.id, colour: faction.color, tone: "notice", score: 0 };

    // --- a faction on the brink of winning the whole run
    const share = held.filter((province) => province.settlement !== null).length / Math.max(1, settled.length);
    if (share >= 0.42) {
      stories.push({ ...base, id: `${faction.id}-ascendant`, icon: "star", position: held[0],
        title: `${faction.name} is running away with it`,
        detail: `${held.length} provinces and ${Math.round(share * 100)}% of every settlement on the map. The others are running out of time to stop them.`,
        context: "Approaching domination", tone: "good", score: 72 + share * 20 });
    }
    // --- a capital in danger is the most dramatic thing on the map
    const capital = provinceOf(`cap_${faction.id}`);
    if (capital !== undefined && capital.ownerId === faction.id) {
      const threat = world.armies.find((army) => army.factionId !== faction.id && army.order.targetProvinceId === capital.id);
      if (threat !== undefined) {
        const enemy = factionOf(threat.factionId);
        stories.push({ ...base, id: `${faction.id}-capital-threat`, icon: "warning", position: capital,
          title: `${capital.name} is under threat`,
          detail: `${enemy?.name ?? "A rival"} has ordered ${threat.name} against ${faction.name}'s capital. Losing it would be catastrophic.`,
          context: `${threat.units.length} units marching`, tone: "danger", score: 96 });
      }
    }
    if (capital !== undefined && capital.ownerId !== faction.id) {
      stories.push({ ...base, id: `${faction.id}-capital-lost`, icon: "skull", position: capital,
        title: `${faction.name} has lost its capital`,
        detail: `${capital.name} flies ${factionOf(capital.ownerId)?.name ?? "another"} colours. They are fighting on with ${held.length} province${held.length === 1 ? "" : "s"} and ${armies.length} arm${armies.length === 1 ? "y" : "ies"}.`,
        context: "Fighting for survival", tone: "danger", score: 88 });
    }
    // --- money trouble reads as a story long before the faction collapses
    if (faction.gold < 40 && faction.income - faction.upkeep < 0 && armies.length > 0) {
      stories.push({ ...base, id: `${faction.id}-broke`, icon: "warning", position: capital ?? held[0],
        title: `${faction.name} cannot pay its army`,
        detail: `${Math.round(faction.gold)} gold left and losing ${Math.abs(faction.income - faction.upkeep)} a turn. Units will start disbanding.`,
        context: "Bankruptcy", tone: "danger", score: 64 });
    }

    for (const lord of faction.lords) {
      const army = world.armies.find((entry) => entry.lordId === lord.id);
      const where = army === undefined ? capital : provinceOf(army.provinceId);
      const subject = { ...base, lordId: lord.id, armyId: army?.id ?? null, position: army ?? where };
      if (lord.condition === "dead") continue;
      if (lord.condition === "wounded" || lord.condition === "captured") {
        stories.push({ ...subject, id: `${lord.id}-${lord.condition}`, icon: "skull", position: where, armyId: null,
          title: `${name(lord)} is ${lord.condition}`,
          detail: lord.condition === "captured"
            ? `Taken after a defeat. ${faction.name} fights without them until turn ${lord.unavailableUntil}.`
            : `Recovering from a beating and unavailable until turn ${lord.unavailableUntil}.`,
          context: `Level ${lord.level} · ${lord.battlesWon}W/${lord.battlesLost}L`, tone: "danger", score: 78 });
        continue;
      }
      // --- a Jev marching on a target is the campaign's main narrative engine
      if (army !== undefined && army.order.kind === "attack" && army.order.targetProvinceId !== null) {
        const target = provinceOf(army.order.targetProvinceId);
        const defender = world.armies.find((entry) => entry.provinceId === army.order.targetProvinceId && entry.factionId !== faction.id);
        const rival = defender === undefined ? undefined : faction0Lord(world, defender);
        stories.push({ ...subject, id: `${lord.id}-march`, icon: rival === undefined ? "flag" : "battle",
          title: rival === undefined
            ? `${name(lord)} marches on ${target?.name ?? "the enemy"}`
            : `${name(lord)} is hunting ${name(rival)}`,
          detail: rival === undefined
            ? `${army.units.length} units moving against ${target?.kind ?? "territory"} held by ${factionOf(target?.ownerId)?.name ?? "nobody"}.`
            : `Two Jevs are converging on ${target?.name ?? "the same ground"}. Whoever loses may not walk away.`,
          context: army.shattered ? "Shattered and withdrawing" : `${army.units.length} units · morale ${Math.round(army.morale)}`,
          tone: rival === undefined ? "notice" : "danger", score: rival === undefined ? 52 : 92 });
      }
      // --- a build going somewhere strange is worth pointing at
      if (lord.skills.length + lord.relics.length >= 3) {
        stories.push({ ...subject, id: `${lord.id}-build`, icon: "scroll", position: army ?? where,
          title: `${name(lord)} is becoming something`,
          detail: `${lord.skills.length} skills and ${lord.relics.filter((relic) => relic !== "__looted").length} relics. This is not the Jev they started as.`,
          context: `Level ${lord.level} · ${lord.kills} kills`, tone: "good", score: 46 + lord.skills.length * 4 });
      }
      if (army !== undefined && army.shattered) {
        stories.push({ ...subject, id: `${lord.id}-broken`, icon: "warning",
          title: `${name(lord)}'s host is broken`,
          detail: `Morale ${Math.round(army.morale)}. They are falling back to friendly ground to rebuild, and are helpless until they get there.`,
          context: `${army.units.length} units left`, tone: "danger", score: 68 });
      }
    }
  }
  return stories.sort((left, right) => right.score - left.score);
}
/** The Jev leading a given army, if it has one. */
function faction0Lord(world, army) {
  for (const faction of world.factions) {
    const lord = faction.lords.find((entry) => entry.id === army.lordId && entry.condition === "ready");
    if (lord !== undefined) return lord;
  }
  return undefined;
}
