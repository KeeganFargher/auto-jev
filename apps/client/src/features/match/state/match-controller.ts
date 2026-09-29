import type { HeroDefinitionId, BoardCell } from "@jev-game/game";
import type { AudioEngine } from "../../../audio/engine.js";
import type { MatchConnectTarget } from "../../../network/connect-room.js";
import type { MatchSession } from "../../../session/match-session.js";
import { createStore, type ReadableStore, type Store } from "../../../state/store.js";
import {
  advanceLive,
  closeWatch,
  draftLapsedUnlocked,
  openLive,
  submitDraft,
  toggleDraftPick,
  type LiveMatch,
  type MatchState,
} from "../model/match-state.js";
import { describePlay } from "../model/play-screen.js";
import { readSnapshot } from "../model/session-snapshot.js";
import { createAnnouncer, type Announcer } from "./announcer.js";
import { createWatchHud, type WatchHud } from "./watch-hud.js";

export interface MatchServices {
  audio: Pick<AudioEngine, "play">;
  connect(target: MatchConnectTarget): Promise<MatchSession>;
  confirmLeave(message: string): boolean;
  resumeToken: {
    read(): string | null;
    clear(): void;
  };
  describeFailure(reason: Error): string;
  joinLink: {
    consume(): void;
  };
}

export interface MatchController {
  readonly state: ReadableStore<MatchState>;
  readonly watchHud: WatchHud;
  readonly announcer: Announcer;
  navigate(joinRoomId: string | null): void;
  startSolo(): void;
  startQuick(): void;
  leave(): void;
  startMatch(): void;
  toggleDraftPick(heroId: HeroDefinitionId): void;
  submitDraft(): void;
  confirmReady(): void;
  placeHeroes(formation: readonly BoardCell[]): void;
  closeWatch(): void;
  dispose(): void;
}

function defectFrom(
  reason: Error | string | number | boolean | bigint | symbol | null | undefined,
): Error {
  if (reason instanceof Error) {
    return reason;
  }

  return new Error("The match controller failed with a non-Error value", { cause: reason });
}

export const LEAVE_MATCH_PROMPT = "Leave your current match to join another one?";

const IDLE: MatchState = { connecting: false, notice: null, defect: null, live: null };

export function createMatchController(services: MatchServices): MatchController {
  const { audio, connect, confirmLeave, resumeToken, describeFailure, joinLink } = services;
  const state: Store<MatchState> = createStore<MatchState>(IDLE);
  const watchHud = createWatchHud();
  const announcer = createAnnouncer(audio);
  let stopListening: (() => void) | null = null;
  let disposed = false;
  let arrived = false;

  function requireActive(): void {
    if (disposed) {
      throw new Error("The match controller was used after it was disposed");
    }
  }

  function requireLive(): LiveMatch {
    requireActive();

    const live = state.get().live;

    if (live === null) {
      throw new Error("No match session is running");
    }

    return live;
  }

  function setLive(live: LiveMatch): void {
    state.update((current) => ({ ...current, live }));
  }

  function announce(live: LiveMatch): void {
    const view = live.snapshot.view;

    if (live.watch !== null || view === null) {
      return;
    }

    const sound = describePlay(view, live.draft).sound;

    if (sound === null) {
      return;
    }

    switch (sound.kind) {
      case "round-result":
        announcer.roundResult(sound.round, sound.battle, view.you.playerId);
        break;

      case "finish":
        announcer.finish(view);
        break;
    }
  }

  function onSessionChange(session: MatchSession): void {
    const current = state.get().live;

    if (current === null || current.session !== session) {
      throw new Error("A released match session reported a change");
    }

    const snapshot = readSnapshot(session);

    if (draftLapsedUnlocked(current, snapshot)) {
      audio.play("draft-lock");
    }

    const next = advanceLive(current, snapshot);
    setLive(next);
    announce(next);
  }

  function release(): void {
    stopListening?.();
    stopListening = null;

    const live = state.get().live;

    if (live === null) {
      return;
    }

    state.update((current) => ({ ...current, live: null }));
    live.session.dispose();
  }

  function adopt(session: MatchSession, live: LiveMatch): void {
    release();
    announcer.reset();
    state.set({ connecting: false, notice: null, defect: null, live });
    stopListening = session.subscribe(() => {
      try {
        onSessionChange(session);
      } catch (reason) {
        recordDefect(reason instanceof Error ? reason : defectFrom(String(reason)));
      }
    });
    announce(live);
  }

  function failed(target: MatchConnectTarget, reason: Error): void {
    if (target.kind === "resume" && resumeToken.read() === target.token) {
      resumeToken.clear();
    }

    state.update((current) => ({
      ...current,
      connecting: false,
      notice: target.kind === "resume" ? null : describeFailure(reason),
    }));
  }

  async function connectTo(target: MatchConnectTarget): Promise<void> {
    let session: MatchSession;

    try {
      session = await connect(target);
    } catch (reason) {
      if (!(reason instanceof Error)) {
        const defect = new Error("Connecting to the match rejected with a non-Error value", {
          cause: reason,
        });

        if (!disposed) {
          failed(target, defect);
        }

        throw defect;
      }

      if (!disposed) {
        failed(target, reason);
      }

      return;
    }

    if (disposed) {
      session.suspend();

      return;
    }

    try {
      adopt(session, openLive(session, readSnapshot(session)));
    } catch (defect) {
      if (state.get().live?.session === session) {
        release();
      } else {
        session.dispose();
      }

      throw defect;
    }
  }

  function recordDefect(reason: Error): void {
    if (disposed) {
      throw reason;
    }

    state.update((current) => ({ ...current, connecting: false, defect: reason }));
  }

  function startOnline(target: MatchConnectTarget): void {
    requireActive();

    if (state.get().connecting) {
      return;
    }

    state.update((current) => ({ ...current, connecting: true, notice: null }));
    connectTo(target).catch((reason) => recordDefect(defectFrom(reason)));
  }

  function joinRoom(roomId: string): void {
    const live = state.get().live;

    if (live !== null && live.snapshot.lobby?.roomId === roomId) {
      return;
    }

    if (live !== null && !confirmLeave(LEAVE_MATCH_PROMPT)) {
      return;
    }

    release();
    startOnline({ kind: "room", roomId });
  }

  return {
    state,
    watchHud,
    announcer,

    navigate(joinRoomId) {
      requireActive();
      const firstVisit = !arrived;
      arrived = true;

      if (joinRoomId !== null) {
        joinRoom(joinRoomId);
        joinLink.consume();

        return;
      }

      const token = resumeToken.read();

      if (firstVisit && token !== null) {
        startOnline({ kind: "resume", token });
      }
    },

    startSolo() {
      startOnline({ kind: "solo" });
    },

    startQuick() {
      startOnline({ kind: "quick" });
    },

    leave() {
      requireActive();
      release();
    },

    startMatch() {
      requireLive().session.startMatch();
    },

    toggleDraftPick(heroId) {
      const live = requireLive();
      const toggle = toggleDraftPick(live, heroId);

      if (toggle.live === live) {
        return;
      }

      setLive(toggle.live);

      if (toggle.sound !== null) {
        audio.play(toggle.sound);
      }

      live.session.selectHeroes(toggle.live.draft.selection);
    },

    submitDraft() {
      const live = requireLive();
      const submitted = submitDraft(live);
      audio.play("draft-lock");
      setLive(submitted);
      live.session.pickHeroes(submitted.draft.selection);
    },

    confirmReady() {
      requireLive().session.confirmReady();
    },

    placeHeroes(formation) {
      requireLive().session.placeHeroes(formation);
    },

    closeWatch() {
      const closed = closeWatch(requireLive());
      setLive(closed);
      announce(closed);
    },

    dispose() {
      disposed = true;
      stopListening?.();
      stopListening = null;
      state.get().live?.session.suspend();
      watchHud.meter.dispose();
    },
  };
}
