import { TICK_RATE } from "@jev-game/game";
import { PLAYBACK_SPEED, TELEPORT_SECONDS, type PlayerId } from "@jev-game/run";
import type { AudioEngine } from "../../../audio/engine.js";
import { gameCatalogue } from "../../../game/catalogues.js";
import type { BattleOverlay } from "../../../game/views/battle-overlay.js";
import { createBattleView, type BattleView } from "../../../game/views/battle-view.js";
import type { BoardStage, ViewSide } from "../../../game/views/board-stage.js";
import { createTeleportView, type TeleportView } from "../../../game/views/teleport-view.js";
import type { MatchSession, ResolvedRound } from "../../../session/match-session.js";
import { createRoundPlayback } from "../../../session/round-playback.js";
import { readUnit, unitIn } from "../../../ui/hero/unit-readout.js";
import { versusHeader } from "../model/battle-header.js";
import {
  battleStatus,
  boardOwnerLabel,
  opponentOf,
  pairingOf,
  roundLabel,
  URGENT_SECONDS,
} from "../model/match-model.js";
import { readSnapshot } from "../model/session-snapshot.js";
import { watchRows } from "../model/seat-rows.js";
import { advanceBy, BATTLE_START_TICKS, roundEndPauseSeconds } from "../model/watch-pacing.js";
import type { Announcer } from "../state/announcer.js";
import { createCountdown, type Countdown } from "../state/countdown.js";
import type { WatchHud } from "../state/watch-hud.js";
import { BOARD_HUD_INSETS } from "./insets.js";

interface TeleportStage {
  kind: "teleport";
  view: TeleportView;
}

interface FightStage {
  kind: "fight";
  view: BattleView;
}

type WatchStage = TeleportStage | FightStage;

export interface RoundWatch {
  pick(clientX: number, clientY: number): void;
  dispose(): void;
}

export interface RoundWatchOptions {
  stage: BoardStage;
  overlay: BattleOverlay;
  session: MatchSession;
  resolved: ResolvedRound;
  meId: PlayerId;
  healthBeforeRound: ReadonlyMap<PlayerId, number>;
  hud: WatchHud;
  audio: Pick<AudioEngine, "play">;
  announcer: Announcer;
  onClose: () => void;
}

export function createRoundWatch(options: RoundWatchOptions): RoundWatch {
  const {
    stage,
    overlay,
    session,
    resolved,
    meId,
    healthBeforeRound,
    hud,
    audio,
    announcer,
    onClose,
  } = options;

  if (resolved.battles.length === 0) {
    throw new Error(`${roundLabel(resolved.round)} has no battles to watch`);
  }

  const roundText = roundLabel(resolved.round);
  const ownBattle = pairingOf(resolved.battles, meId);
  let battle = ownBattle ?? resolved.battles[0];
  let focusPlayerId = ownBattle === null ? battle.teamAPlayerId : meId;
  const playback = createRoundPlayback(resolved.battles, battle, gameCatalogue);
  let clock = 0;
  let selectedUnitId: string | null = null;
  let chromeKey = "";
  let endCountdown: Countdown | null = null;
  let holdEnded = false;

  function advance(deltaSeconds: number): void {
    clock += deltaSeconds;
    const target = Math.max(0, clock - TELEPORT_SECONDS);
    playback.advance(Math.max(0, target - playback.elapsedSeconds()));
  }

  function teleporting(): boolean {
    return clock < TELEPORT_SECONDS;
  }

  function viewSide(): ViewSide {
    return battle.teamAPlayerId === focusPlayerId ? "south" : "north";
  }

  function showPlate(phaseText: string, timer: string, urgent: boolean): void {
    hud.plate.set({ roundText, phaseText, timer, urgent });
  }

  function startEndCountdown(): void {
    endCountdown = createCountdown(roundEndPauseSeconds(readSnapshot(session), Date.now()), {
      onChange(remaining) {
        hud.plate.update((current) => ({
          ...current,
          timer: remaining === null ? "" : String(remaining),
          urgent: remaining !== null && remaining <= URGENT_SECONDS,
        }));
      },
      onExpire: onClose,
    });
  }

  function mountStage(): WatchStage {
    const history = playback.follow(battle);
    const opening = playback.openingSnapshot(battle);
    hud.meter.start(opening, focusPlayerId, history);
    selectedUnitId = null;
    hud.selected.set(null);
    chromeKey = "";

    if (teleporting()) {
      return {
        kind: "teleport",
        view: createTeleportView(stage, {
          seconds: TELEPORT_SECONDS,
          opening,
          friendlyTeamId: focusPlayerId,
          homeTeamId: battle.teamAPlayerId,
          viewSide: viewSide(),
          insets: BOARD_HUD_INSETS,
        }),
      };
    }

    if (playback.moment().tick <= BATTLE_START_TICKS) {
      audio.play("battle-start");
    }

    return {
      kind: "fight",
      view: createBattleView(stage, {
        overlay,
        friendlyTeamId: focusPlayerId,
        viewSide: viewSide(),
        insets: BOARD_HUD_INSETS,
        targetLines: "selected",
        showUnitIds: false,
        onSelectUnit(unitId) {
          selectedUnitId = selectedUnitId === unitId ? null : unitId;
        },
      }),
    };
  }

  advance(session.roundElapsedSeconds());
  let watchStage = mountStage();

  function remount(): void {
    watchStage.view.dispose();
    watchStage = mountStage();
  }

  function boardOwner(): PlayerId {
    if (watchStage.kind === "teleport") {
      const warp = watchStage.view.warpSeconds;

      if (warp !== null && clock < warp) {
        return focusPlayerId;
      }
    }

    return battle.teamAPlayerId;
  }

  function drawChrome(): void {
    const status =
      watchStage.kind === "teleport"
        ? boardOwnerLabel(resolved.seats, battle.teamAPlayerId, meId)
        : battleStatus(resolved.seats, battle, playback.hasEnded(battle));

    hud.header.set(
      versusHeader(resolved.seats, focusPlayerId, opponentOf(battle, focusPlayerId), status),
    );

    hud.rows.set(
      watchRows({
        resolved,
        meId,
        focusedBattleId: battle.battleId,
        healthBeforeRound,
        hasEnded: (candidate) => playback.hasEnded(candidate),
      }),
    );
  }

  function drawTeleport(teleport: TeleportStage): void {
    teleport.view.seek(clock);
    hud.canSkip.set(true);
    showPlate("Teleport", "", false);
  }

  function drawFight(fight: FightStage, deltaSeconds: number): void {
    const moment = playback.moment();
    const snapshot = moment.snapshot;
    const events = playback.takeEvents();

    fight.view.update({
      moment,
      events,
      selectedUnitId,
      deltaSeconds,
      playRate: PLAYBACK_SPEED,
    });

    hud.meter.push(events);

    hud.selected.set(
      selectedUnitId === null
        ? null
        : readUnit(snapshot, unitIn(snapshot, selectedUnitId), focusPlayerId),
    );

    const roundDone = playback.isDone();
    hud.canSkip.set(!roundDone);

    if (roundDone) {
      if (endCountdown === null) {
        showPlate("Round over", "", false);
        startEndCountdown();
        session.markWatched();
      }

      return;
    }

    if (playback.hasEnded(battle)) {
      showPlate("Battle over", "", false);

      return;
    }

    const secondsLeft = Math.max(0, Math.ceil((snapshot.tickLimit - moment.tick) / TICK_RATE));
    showPlate("Battle", String(secondsLeft), secondsLeft <= URGENT_SECONDS);
  }

  function draw(deltaSeconds: number): void {
    if (watchStage.kind === "teleport" && !teleporting()) {
      remount();
    }

    hud.boardOwner.set(boardOwner());

    if (watchStage.kind === "teleport") {
      drawTeleport(watchStage);
    } else {
      drawFight(watchStage, deltaSeconds);
    }

    if (ownBattle !== null && playback.hasEnded(ownBattle)) {
      announcer.roundResult(resolved.round, ownBattle, meId);
    }

    const endedIds = resolved.battles.flatMap((candidate) =>
      playback.hasEnded(candidate) ? [candidate.battleId] : [],
    );

    const key = `${watchStage.kind}|${focusPlayerId}|${endedIds.join(",")}`;

    if (key !== chromeKey) {
      chromeKey = key;
      drawChrome();
    }
  }

  function focus(playerId: PlayerId): void {
    const next = pairingOf(resolved.battles, playerId);

    if (next === null) {
      throw new Error(`${playerId} has no battle to watch in ${roundText}`);
    }

    focusPlayerId = playerId;
    battle = next;
    remount();
    draw(0);
  }

  function skip(): void {
    playback.skipToEnd();
    clock = TELEPORT_SECONDS + playback.elapsedSeconds();
    remount();
    draw(0);
  }

  function serverMovedOn(): void {
    const view = readSnapshot(session).view;

    if (view === null) {
      throw new Error("The match lost its view while a round was being watched");
    }

    if (holdEnded || endCountdown === null || view.phase === "round-result") {
      return;
    }

    holdEnded = true;
    endCountdown.dispose();
    startEndCountdown();
  }

  const stopFrames = stage.onFrame((deltaSeconds) => {
    const behind = session.roundElapsedSeconds() - clock;
    advance(advanceBy(behind, deltaSeconds));
    draw(deltaSeconds);
  });

  const stopSession = session.subscribe(serverMovedOn);
  const unbind = hud.bind({ skip, focus });

  draw(0);

  return {
    pick(clientX, clientY) {
      if (watchStage.kind === "fight") {
        watchStage.view.pick(clientX, clientY);
      }
    },

    dispose() {
      stopFrames();
      stopSession();
      unbind();
      endCountdown?.dispose();
      watchStage.view.dispose();
      hud.reset();
    },
  };
}
