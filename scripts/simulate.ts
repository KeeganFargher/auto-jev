import { createBattle, stepBattle, type BattleSetup } from "@jev-game/game";
import { catalogue, createDuelSetup, validateCatalogue } from "@jev-game/content";

function parseArgs(argv: string[]) {
  const scenario = argv[0] ?? "duel";
  const seedArg = argv[1];
  const seed = seedArg === undefined ? 1 : Number(seedArg);

  if (!Number.isFinite(seed)) {
    throw new Error(`invalid seed "${seedArg}"`);
  }

  return { scenario, seed };
}

function buildSetup(scenario: string, seed: number): BattleSetup {
  if (scenario === "duel") {
    return createDuelSetup(seed);
  }

  throw new Error(`unknown scenario "${scenario}"`);
}

function fnv1aHex(values: readonly string[]): string {
  let hash = 0x811c9dc5;

  for (const value of values) {
    for (let i = 0; i < value.length; i++) {
      hash ^= value.charCodeAt(i);
      hash = Math.imul(hash, 0x01000193);
    }
  }

  return (hash >>> 0).toString(16).padStart(8, "0");
}

function main(): void {
  validateCatalogue(catalogue);

  const { scenario, seed } = parseArgs(process.argv.slice(2));
  const setup = buildSetup(scenario, seed);
  const state = createBattle(setup, catalogue);

  const eventLog: string[] = [];

  for (let iterations = 0; iterations <= state.tickLimit && state.result === null; iterations++) {
    const step = stepBattle(state, catalogue);

    for (const event of step.events) {
      eventLog.push(JSON.stringify(event));
    }
  }

  if (state.result === null) {
    throw new Error("battle did not terminate within its own tick limit");
  }

  console.log(`scenario: ${scenario}`);
  console.log(`seed: ${seed}`);
  console.log(`ticks: ${state.tick}`);
  console.log(`result: ${JSON.stringify(state.result)}`);
  console.log(`events: ${eventLog.length}`);
  console.log(`event digest: ${fnv1aHex(eventLog)}`);
  console.log("damage dealt:");

  for (const [unitId, amount] of Object.entries(state.result.damageDealt)) {
    console.log(`  ${unitId}: ${amount}`);
  }
}

main();
