import * as THREE from "three";
import { createFighter } from "./campaign-models.js";
import { animateColonist } from "./colonist-activity.js";
import { dressHero, animateHero } from "./hero-models.js";

/**
 * An army on the campaign map is its Jev, and nothing else. The troops live on the battlefield; up
 * here the marker's whole job is to say at a glance whose host this is and where it is going, and a
 * clump of anonymous spearmen around the hero only made the silhouette harder to read. So the Jev
 * walks alone, large enough to recognise from the camera's usual height.
 */

/**
 * Builds the marker. `unitIds` and `strength` describe the army behind the Jev; neither is drawn any
 * more, but they stay in the signature because the view keys its rebuilds on the army's composition.
 */
export function createArmyHost(factionColor, hero, unitIds, strength) {
  const group = new THREE.Group();
  group.name = "army-host";

  const heroModel = createFighter("swordsmen", factionColor, 0.3);
  // Sized against the settlement models: at the map's army scale this puts the Jev a head above a
  // town's rooftops, which is the point — they should be the thing the eye lands on.
  if (hero !== undefined) { dressHero(heroModel, hero); heroModel.group.scale.multiplyScalar(1.75); }
  else heroModel.group.scale.setScalar(2.9);
  heroModel.role = "hero";
  heroModel.fighting = false;
  heroModel.paused = false;
  heroModel.activity = { working: false, tool: null };
  group.add(heroModel.group);

  // Measured rather than derived: dressHero rewrites the model in its own units, so the only
  // reliable answer for where the name bubble clears the crest is the assembled group's own box.
  const box = new THREE.Box3().setFromObject(group);

  return {
    group,
    /** How high the name bubble must float to clear the Jev, in the host's own units. */
    headroom: (Number.isFinite(box.max.y) ? box.max.y : 2) + 0.4,
    /** Walk cycle; `moved` is the distance the marker covered this frame. */
    animate(now, moved, reduced) {
      animateColonist(heroModel, now, moved * 0.55, moved > 0.0015, false, reduced);
      if (heroModel.heroId !== undefined) animateHero(heroModel, now, reduced);
    },
  };
}
