import type { HeroDefinitionId } from "@jev-game/game";
import type { PlayerView, RoundBattle } from "@jev-game/run";
import {
  displayName,
  opponentOf,
  pairingOf,
  roundLabel,
  roundOf,
  winnersOf,
  type Seats,
} from "./match-model.js";
import { draftLocked, lockedPicks, type DraftState } from "./match-state.js";

export type BannerTone = "blue" | "gold" | "crimson" | "slate";

export interface BannerSpec {
  tone: BannerTone;
  title: string;
  sub: string | null;
}

export type ActionKind = "confirm" | "ready" | "menu" | "leave";

export interface ActionSpec {
  kind: ActionKind;
  label: string;
  disabled: boolean;
}

export type PhaseSound =
  | { kind: "round-result"; round: number; battle: RoundBattle }
  | { kind: "finish" };

export type PlayBoard = "draft" | "placement";

export interface PlayScreen {
  roundText: string;
  phaseText: string;
  countdownEpoch: number | null;
  banner: BannerSpec | null;
  subtitle: string | null;
  action: ActionSpec | null;
  board: PlayBoard | null;
  opponentId: string | null;
  sound: PhaseSound | null;
}

export interface RosterSpec {
  heroIds: readonly HeroDefinitionId[];
  slots: number;
  visible: boolean;
}

const BLANK: PlayScreen = {
  roundText: "",
  phaseText: "",
  countdownEpoch: null,
  banner: null,
  subtitle: null,
  action: null,
  board: null,
  opponentId: null,
  sound: null,
};

function banner(tone: BannerTone, title: string, sub: string | null): BannerSpec {
  return { tone, title, sub };
}

function resultBanner(seats: Seats, battle: RoundBattle, meId: string): BannerSpec {
  const versus = `vs ${displayName(seats, opponentOf(battle, meId))}`;
  const result = battle.result;

  if (result.kind === "draw") {
    return banner(
      "slate",
      "Draw",
      `${versus} · ${result.reason === "timeout" ? "time ran out" : "both teams wiped out"}`,
    );
  }

  return result.winningTeamId === meId
    ? banner("gold", "Victory", versus)
    : banner("crimson", "Defeat", versus);
}

function describeDraft(view: PlayerView, draft: DraftState): PlayScreen {
  const picks = view.rules.draftPicks;
  const locked = draftLocked(view, draft);

  return {
    ...BLANK,
    roundText: roundLabel(0),
    phaseText: "Draft",
    countdownEpoch: view.phaseEpoch,
    board: "draft",
    banner: locked
      ? banner("slate", "Team locked in", "Waiting for the other players to draft")
      : banner(
          "blue",
          "Draft your team",
          `Pick ${picks} heroes · ${draft.selection.length}/${picks} chosen`,
        ),
    action: locked
      ? null
      : { kind: "confirm", label: "Confirm", disabled: draft.selection.length !== picks },
  };
}

function describePreparing(view: PlayerView): PlayScreen {
  const round = roundOf(view);
  const pairing = pairingOf(round.pairings, view.you.playerId);
  const base = { ...BLANK, roundText: roundLabel(round.round), phaseText: "Preparing" };

  if (pairing === null) {
    return { ...base, banner: banner("slate", "Bye", "Waiting for the other battles") };
  }

  return {
    ...base,
    countdownEpoch: view.phaseEpoch,
    board: "placement",
    opponentId: opponentOf(pairing, view.you.playerId),
    action: view.you.ready ? null : { kind: "ready", label: "Ready", disabled: false },
  };
}

function describeRoundOver(view: PlayerView): PlayScreen {
  const round = roundOf(view);

  const base = {
    ...BLANK,
    roundText: roundLabel(round.round),
    phaseText: "Round over",
    countdownEpoch: view.phaseEpoch,
  };

  if (round.byePlayerId === view.you.playerId) {
    return { ...base, banner: banner("slate", "Bye", "You sat this round out") };
  }

  const battle = pairingOf(round.battles, view.you.playerId);

  if (battle === null) {
    throw new Error(`${roundLabel(round.round)} has no battle for ${view.you.playerId}`);
  }

  return {
    ...base,
    banner: resultBanner(view.players, battle, view.you.playerId),
    subtitle: "The next round is about to start",
    sound: { kind: "round-result", round: round.round, battle },
  };
}

function describeFinished(view: PlayerView): PlayScreen {
  const round = roundOf(view);
  const winners = winnersOf(view);
  const names = winners.map((playerId) => displayName(view.players, playerId)).join(", ");
  const winnerText = `Winner${winners.length > 1 ? "s" : ""}: ${names}`;

  const base = {
    ...BLANK,
    roundText: roundLabel(round.round),
    phaseText: "Finished",
    action: { kind: "menu", label: "Menu", disabled: false } satisfies ActionSpec,
    sound: { kind: "finish" } satisfies PhaseSound,
  };

  if (view.you.eliminated) {
    const lastBattle = pairingOf(round.battles, view.you.playerId);

    return {
      ...base,
      banner:
        lastBattle === null
          ? banner("crimson", "Eliminated", null)
          : banner(
              "crimson",
              "Eliminated",
              `${roundLabel(round.round)} · lost to ${displayName(view.players, opponentOf(lastBattle, view.you.playerId))}`,
            ),
      subtitle: winnerText,
    };
  }

  if (winners.includes(view.you.playerId)) {
    return {
      ...base,
      banner: banner(
        "gold",
        "Victory!",
        winners.length > 1 ? "You share the win" : "You won the run",
      ),
    };
  }

  return { ...base, banner: banner("slate", "Match over", winnerText) };
}

function describeSpectating(view: PlayerView): PlayScreen {
  return {
    ...BLANK,
    roundText: roundLabel(roundOf(view).round),
    phaseText: "Spectating",
    banner: banner("crimson", "Eliminated", "You're watching the rest of the match"),
    action: { kind: "leave", label: "Leave", disabled: false },
  };
}

export function describePlay(view: PlayerView, draft: DraftState): PlayScreen {
  if (view.you.eliminated && view.phase !== "finished") {
    return describeSpectating(view);
  }

  switch (view.phase) {
    case "lobby":
      return { ...BLANK, roundText: "Lobby", phaseText: "Starting" };

    case "draft":
      return describeDraft(view, draft);

    case "preparing":
      return describePreparing(view);

    case "round-result":
      return describeRoundOver(view);

    case "finished":
      return describeFinished(view);
  }
}

export function describeRoster(view: PlayerView, draft: DraftState): RosterSpec {
  const slots = view.rules.draftPicks;

  if (view.phase === "draft") {
    const heroIds = draftLocked(view, draft) ? lockedPicks(view, draft) : draft.selection;

    return { heroIds, slots, visible: true };
  }

  return { heroIds: view.you.heroIds, slots, visible: view.you.heroIds.length > 0 };
}
