import { createRng, nextInt, sameFormation, type BoardCell, type Catalogue, type HeroBuild } from "@jev-game/game";
import { boardArena, centreOutColumns, defaultFormation } from "@jev-game/content";
import type { PendingDecision, RunState } from "./types.js";
import type { PlayerId } from "./ids.js";
import { deriveControllerSeed, deriveDecisionSeed } from "./seed.js";
import { itemCanGoOn, piecesOnHero, runeCanGoOn, stashedPieces } from "./inventory.js";
import { applyCommand, type RunCommand } from "./commands.js";
import { isSeatReady } from "./readiness.js";
import { getPlayerView, type PlayerView } from "./player-view.js";

const MAX_BOT_COMMANDS_PER_PASS = 32;

function pickRandomOffers(offerIds: readonly string[], seed: number, count: number): string[] {
  const rng = createRng(seed);
  const pool = [...offerIds];
  const chosen: string[] = [];

  for (let index = 0; index < count && pool.length > 0; index += 1) {
    const pickIndex = nextInt(rng, pool.length);
    chosen.push(pool[pickIndex]!);
    pool.splice(pickIndex, 1);
  }

  return chosen;
}

function botFormation(heroBuilds: readonly HeroBuild[], seed: number): BoardCell[] {
  const rng = createRng(seed);
  const columns = centreOutColumns(boardArena.columns);

  for (let index = columns.length - 1; index > 0; index -= 1) {
    const swapIndex = nextInt(rng, index + 1);
    [columns[index], columns[swapIndex]] = [columns[swapIndex]!, columns[index]!];
  }

  return defaultFormation(heroBuilds.map((build) => build.heroId), columns);
}

function itemSlotFor(view: PlayerView, pieceId: string, catalogue: Catalogue): number | null {
  let best: number | null = null;
  let fewest = Number.POSITIVE_INFINITY;

  for (let heroSlot = 0; heroSlot < view.you.heroBuilds.length; heroSlot += 1) {
    const held = piecesOnHero(view.you.items, heroSlot).length;

    if (held < fewest && itemCanGoOn(view.you, pieceId, heroSlot, view.rules, catalogue, null)) {
      best = heroSlot;
      fewest = held;
    }
  }

  return best;
}

function runeSlotFor(view: PlayerView, runeId: string, catalogue: Catalogue): number | null {
  for (let heroSlot = 0; heroSlot < view.you.heroBuilds.length; heroSlot += 1) {
    if (runeCanGoOn(view.you, runeId, heroSlot, catalogue, null)) {
      return heroSlot;
    }
  }

  return null;
}

function chooseOffer(view: PlayerView, decision: PendingDecision, offerIndex: number, catalogue: Catalogue): RunCommand | null {
  const offer = decision.offers[offerIndex];

  if (offer === undefined) {
    return null;
  }

  let heroSlot: number | null = null;

  if (offer.kind === "item" && offer.pieceId !== null) {
    heroSlot = itemSlotFor(view, offer.pieceId, catalogue);
  } else if (offer.kind === "rune" && offer.pieceId !== null) {
    heroSlot = runeSlotFor(view, offer.pieceId, catalogue);
  }

  return {
    kind: "choose-offer",
    playerId: view.you.playerId,
    decisionId: decision.decisionId,
    offerId: offer.offerId,
    heroSlot,
    expectedRevision: view.you.decisionRevision,
  };
}

function equipStash(view: PlayerView, catalogue: Catalogue): RunCommand | null {
  const { playerId, decisionRevision } = view.you;

  for (const item of stashedPieces(view.you.items)) {
    const heroSlot = itemSlotFor(view, item.pieceId, catalogue);

    if (heroSlot !== null) {
      return { kind: "move-item", playerId, instanceId: item.instanceId, heroSlot, expectedRevision: decisionRevision };
    }
  }

  for (const rune of stashedPieces(view.you.runes)) {
    const heroSlot = runeSlotFor(view, rune.pieceId, catalogue);

    if (heroSlot !== null) {
      return { kind: "socket-rune", playerId, instanceId: rune.instanceId, heroSlot, expectedRevision: decisionRevision };
    }
  }

  return null;
}

export function decideBotCommand(view: PlayerView, controllerSeed: number, catalogue: Catalogue): RunCommand | null {
  const { playerId, decisionRevision, eliminated } = view.you;

  if (eliminated) {
    return null;
  }

  if (view.phase === "draft") {
    const picks = view.rules.draftPicks;

    const chosen = pickRandomOffers(
      view.heroOffers.map((offer) => offer.offerId),
      controllerSeed,
      picks,
    );

    if (chosen.length !== picks) {
      return null;
    }

    return { kind: "commit-draft", playerId, offerIds: chosen, expectedRevision: decisionRevision };
  }

  if (view.phase === "reward") {
    const decision = view.pendingDecisions[0];

    if (decision === undefined || decision.offers.length === 0) {
      return null;
    }

    const rng = createRng(deriveDecisionSeed(controllerSeed, decision.decisionId));

    return chooseOffer(view, decision, nextInt(rng, decision.offers.length), catalogue);
  }

  if (view.phase === "preparing") {
    const equip = equipStash(view, catalogue);

    if (equip !== null) {
      return equip;
    }

    const formation = botFormation(view.you.heroBuilds, controllerSeed);

    if (!sameFormation(formation, view.you.formation)) {
      return { kind: "place-heroes", playerId, formation, expectedRevision: decisionRevision };
    }

    return { kind: "confirm-ready", playerId, expectedRevision: decisionRevision };
  }

  return null;
}

export function decideFallbackCommand(view: PlayerView, controllerSeed: number, catalogue: Catalogue): RunCommand | null {
  if (view.phase === "preparing") {
    return view.you.eliminated
      ? null
      : { kind: "confirm-ready", playerId: view.you.playerId, expectedRevision: view.you.decisionRevision };
  }

  if (view.phase === "reward") {
    const decision = view.pendingDecisions[0];

    return view.you.eliminated || decision === undefined ? null : chooseOffer(view, decision, 0, catalogue);
  }

  return decideBotCommand(view, controllerSeed, catalogue);
}

type SeatPolicy = (view: PlayerView, controllerSeed: number, catalogue: Catalogue) => RunCommand | null;

function applySeatPolicy(state: RunState, playerId: PlayerId, policy: SeatPolicy, catalogue: Catalogue): RunState {
  let current = state;
  const controllerSeed = deriveControllerSeed(current.runSeed, current.currentRound?.round ?? 0, playerId);

  for (let attempt = 0; attempt < MAX_BOT_COMMANDS_PER_PASS; attempt += 1) {
    if (isSeatReady(current, playerId)) {
      break;
    }

    const view = getPlayerView(current, playerId);
    const command = view === null ? null : policy(view, controllerSeed, catalogue);

    if (command === null) {
      break;
    }

    const result = applyCommand(current, command, catalogue);

    if (!result.accepted) {
      break;
    }

    current = result.state;
  }

  return current;
}

export function runFallbackCommands(state: RunState, playerIds: readonly PlayerId[], catalogue: Catalogue): RunState {
  let current = state;

  for (const playerId of playerIds) {
    const seat = current.players[playerId];

    if (seat !== undefined && !seat.eliminated) {
      current = applySeatPolicy(current, playerId, decideFallbackCommand, catalogue);
    }
  }

  return current;
}

export function runBotCommands(state: RunState, catalogue: Catalogue): RunState {
  let current = state;

  for (const seat of Object.values(current.players)) {
    if (seat.eliminated || isSeatReady(current, seat.playerId)) {
      continue;
    }

    if (seat.controllerKind === "jev" && (current.phase === "draft" || current.phase === "reward")) {
      continue;
    }

    if (seat.controllerKind !== "human") {
      current = applySeatPolicy(current, seat.playerId, decideBotCommand, catalogue);
    } else if (seat.forfeited) {
      current = applySeatPolicy(current, seat.playerId, decideFallbackCommand, catalogue);
    }
  }

  return current;
}
