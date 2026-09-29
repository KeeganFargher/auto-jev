import { strict as assert } from "node:assert";
import { test } from "node:test";
import type { Catalogue, HeroDefinition, SignatureDefinition, SignatureKind } from "@jev-game/game";
import {
  DRAFTABLE_HERO_IDS,
  bubbleCleric,
  firebrand,
  gameCatalogue,
  harpooner,
  paladin,
  trainingDummy,
  validateCatalogue,
} from "../src/index.js";

function withHero(hero: HeroDefinition): Catalogue {
  return { ...gameCatalogue, heroes: { ...gameCatalogue.heroes, [hero.id]: hero } };
}

function isKind<K extends SignatureKind>(
  signature: SignatureDefinition,
  kind: K,
): signature is Extract<SignatureDefinition, { kind: K }> {
  return signature.kind === kind;
}

function signatureOf<K extends SignatureKind>(
  hero: HeroDefinition,
  kind: K,
): Extract<SignatureDefinition, { kind: K }> {
  const signature = hero.signature;

  if (signature === null || !isKind(signature, kind)) {
    throw new Error(`${hero.id} has no ${kind} signature`);
  }

  return signature;
}

test("the shipped catalogue is valid", () => {
  validateCatalogue(gameCatalogue);
});

test("seven heroes are draftable, one of each signature, and the dummy is not", () => {
  assert.deepEqual(DRAFTABLE_HERO_IDS, [
    "paladin",
    "berserker",
    "firebrand",
    "bubble-cleric",
    "harpooner",
    "mags",
    "burr",
  ]);
  assert.deepEqual(
    DRAFTABLE_HERO_IDS.map((heroId) => gameCatalogue.heroes[heroId]?.signature?.kind),
    ["hammerfall", "rampage", "short-fuse", "big-bubble", "yank", "collection-day", "blizzard"],
  );
  assert.equal(trainingDummy.draftable, false);
  assert.equal(gameCatalogue.heroes[trainingDummy.id], trainingDummy);
});

test("broken heroes are rejected with the reason", () => {
  const cases: [HeroDefinition, RegExp][] = [
    [{ ...paladin, name: " " }, /Hero "paladin": name is empty/],
    [{ ...paladin, maxHp: 0.5 }, /max HP must be a positive integer/],
    [
      { ...paladin, attack: { ...paladin.attack, windupTicks: 43 } },
      /attack windup \(43\) must be below 43/,
    ],
    [{ ...paladin, startingMana: 90 }, /starting mana 90 is above max mana 85/],
    [
      { ...paladin, signature: null, maxMana: 0, startingMana: 0 },
      /a draftable hero needs a signature/,
    ],
    [{ ...trainingDummy, maxMana: 10 }, /a hero without a signature must have no mana/],
    [
      { ...paladin, signature: { ...signatureOf(paladin, "hammerfall"), wants: [] } },
      /wants no setups/,
    ],
    [
      {
        ...paladin,
        signature: { ...signatureOf(paladin, "hammerfall"), wants: ["floating", "floating"] },
      },
      /lists a wanted setup twice/,
    ],
    [
      { ...paladin, signature: { ...signatureOf(paladin, "hammerfall"), groupSize: 1 } },
      /wants a group but its group size is 1/,
    ],
    [
      { ...paladin, signature: { ...signatureOf(paladin, "hammerfall"), impactTick: 69 } },
      /impact tick \(69\) must not exceed 68/,
    ],
    [
      { ...firebrand, signature: { ...signatureOf(firebrand, "short-fuse"), hotPotatoScale: 1 } },
      /Hot Potato scale must be above 1/,
    ],
    [
      { ...harpooner, signature: { ...signatureOf(harpooner, "yank"), landingOffsetUnits: 12 } },
      /landing offset \(12\) must be below 12/,
    ],
  ];

  for (const [hero, reason] of cases) {
    assert.throws(() => validateCatalogue(withHero(hero)), reason);
  }

  assert.throws(
    () =>
      validateCatalogue({
        ...gameCatalogue,
        heroes: { ...gameCatalogue.heroes, paladin: { ...paladin, id: "impostor" } },
      }),
    /Hero "paladin": is stored under the wrong id "impostor"/,
  );
});

test("a broken safety bubble is rejected", () => {
  const passive = bubbleCleric.passive;
  assert.ok(passive !== null);

  assert.throws(
    () =>
      validateCatalogue(
        withHero({ ...bubbleCleric, passive: { ...passive, thresholdFraction: 1 } }),
      ),
    /threshold \(1\) must be below 1/,
  );
  assert.throws(
    () => validateCatalogue(withHero({ ...bubbleCleric, passive: { ...passive, riseTicks: 60 } })),
    /rise ticks \(60\) must be below 60/,
  );
});

test("a catalogue needs arenas that split in two and a draftable hero", () => {
  const board = gameCatalogue.arenas["board"];
  assert.ok(board !== undefined);

  assert.throws(() => validateCatalogue({ ...gameCatalogue, arenas: {} }), /no arenas/);
  assert.throws(
    () => validateCatalogue({ ...gameCatalogue, arenas: { board: { ...board, rows: 7 } } }),
    /must split evenly between the two sides/,
  );
  assert.throws(
    () => validateCatalogue({ ...gameCatalogue, arenas: { moon: board } }),
    /Arena "moon" is stored under the wrong id "board"/,
  );
  assert.throws(
    () => validateCatalogue({ ...gameCatalogue, heroes: { [trainingDummy.id]: trainingDummy } }),
    /no draftable heroes/,
  );
});
