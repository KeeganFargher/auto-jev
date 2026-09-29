import type { HeroDefinitionId } from "@jev-game/game";
import type { PlayerId, PlayerView } from "@jev-game/run";
import type { MatchSession, ResolvedRound } from "../../../session/match-session.js";
import { requireView, type SessionSnapshot } from "./session-snapshot.js";

export interface DraftState {
  epoch: number;
  selection: readonly HeroDefinitionId[];
  submittedEpoch: number;
}

export interface LiveMatch {
  session: MatchSession;
  snapshot: SessionSnapshot;
  watchedThrough: number;
  watch: ResolvedRound | null;
  draft: DraftState;
  healthBeforeRound: ReadonlyMap<PlayerId, number>;
}

export interface MatchState {
  connecting: boolean;
  notice: string | null;
  defect: Error | null;
  live: LiveMatch | null;
}

export type DraftSound = "draft-pick" | "draft-unpick";

export interface DraftToggle {
  live: LiveMatch;
  sound: DraftSound | null;
}

export function draftLocked(view: PlayerView, draft: DraftState): boolean {
  return view.you.ready || draft.submittedEpoch === view.phaseEpoch;
}

function nextWatch(live: LiveMatch, snapshot: SessionSnapshot): ResolvedRound | null {
  const latest = snapshot.latestRound;

  if (latest === null || latest.round <= live.watchedThrough) {
    return null;
  }

  return latest;
}

export function advanceLive(live: LiveMatch, snapshot: SessionSnapshot): LiveMatch {
  const view = snapshot.view;

  if (live.watch !== null || view === null) {
    return { ...live, snapshot };
  }

  const healthBeforeRound =
    view.phase === "preparing"
      ? new Map(Object.values(view.players).map((seat) => [seat.playerId, seat.runHealth]))
      : live.healthBeforeRound;

  const opened = nextWatch(live, snapshot);

  if (opened !== null) {
    return {
      ...live,
      snapshot,
      healthBeforeRound,
      watch: opened,
      watchedThrough: opened.round,
    };
  }

  const draft: DraftState =
    view.phaseEpoch === live.draft.epoch
      ? live.draft
      : { ...live.draft, epoch: view.phaseEpoch, selection: [...view.draftSelection] };

  return { ...live, snapshot, healthBeforeRound, draft };
}

export function openLive(session: MatchSession, snapshot: SessionSnapshot): LiveMatch {
  return advanceLive(
    {
      session,
      snapshot,
      watchedThrough: -1,
      watch: null,
      draft: { epoch: -1, selection: [], submittedEpoch: -1 },
      healthBeforeRound: new Map(),
    },
    snapshot,
  );
}

export function closeWatch(live: LiveMatch): LiveMatch {
  return advanceLive({ ...live, watch: null }, live.snapshot);
}

export function draftLapsedUnlocked(live: LiveMatch, snapshot: SessionSnapshot): boolean {
  const before = live.snapshot.view;
  const after = snapshot.view;

  if (before === null || after === null || before.phase !== "draft" || after.phase === "draft") {
    return false;
  }

  return (
    live.draft.submittedEpoch !== before.phaseEpoch &&
    live.draft.selection.length === before.rules.draftPicks
  );
}

export function toggleDraftPick(live: LiveMatch, heroId: HeroDefinitionId): DraftToggle {
  const view = requireView(live.snapshot);

  if (view.phase !== "draft") {
    throw new Error(`A draft pick arrived during the ${view.phase} phase`);
  }

  if (draftLocked(view, live.draft)) {
    return { live, sound: null };
  }

  const selection = live.draft.selection;

  if (selection.includes(heroId)) {
    return {
      live: {
        ...live,
        draft: { ...live.draft, selection: selection.filter((picked) => picked !== heroId) },
      },
      sound: "draft-unpick",
    };
  }

  if (selection.length < view.rules.draftPicks) {
    return {
      live: { ...live, draft: { ...live.draft, selection: [...selection, heroId] } },
      sound: "draft-pick",
    };
  }

  return { live, sound: null };
}

export function submitDraft(live: LiveMatch): LiveMatch {
  const view = requireView(live.snapshot);

  return { ...live, draft: { ...live.draft, submittedEpoch: view.phaseEpoch } };
}

export function lockedPicks(view: PlayerView, draft: DraftState): readonly HeroDefinitionId[] {
  return view.you.heroIds.length === 0 ? draft.selection : view.you.heroIds;
}
