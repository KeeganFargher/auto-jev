import {
  TICK_RATE,
  type BattleResult,
  type BattleSnapshot,
  type HeroDefinitionId,
  type UnitState,
} from "@jev-game/game";
import { boardArena } from "@jev-game/content";
import {
  PLAYBACK_SPEED,
  ROUND_END_PAUSE_SECONDS,
  TELEPORT_SECONDS,
  type Pairing,
  type PlayerId,
  type PlayerView,
  type PublicSeat,
  type RoundBattle,
  type RoundState,
} from "@jev-game/run";
import type { MatchSession, ResolvedRound } from "../../session/match-session.js";
import { createRoundPlayback } from "../../session/round-playback.js";
import { createOnlineSession } from "../../session/online-session.js";
import {
  joinFailureMessage,
  savedResumeToken,
  saveResumeToken,
  type MatchConnectTarget,
} from "../../network/connect-room.js";
import { createBattleView, type BattleView } from "../views/battle-view.js";
import { createBoardStage, type ViewSide, type ViewportInsets } from "../views/board-stage.js";
import { createFormationView, type FormationView } from "../views/formation-view.js";
import { createDraftView, type DraftView } from "../views/draft-view.js";
import { createTeleportView, type TeleportView } from "../views/teleport-view.js";
import { createMenuView, type MenuView } from "../views/menu-view.js";
import {
  mountEnvironment,
  type EnvironmentTheme,
  type MountedEnvironment,
} from "../environments/environment.js";
import { boardThemeFor, savedBoardTheme } from "../environments/board-choice.js";
import { createUnitInspectorView, type UnitInspectorView } from "../../hud/unit-inspector.js";
import { createDamageMeter } from "../../hud/damage-meter.js";
import { hideTip } from "../../hud/tooltip.js";
import { createCountdown, type Countdown } from "../../hud/countdown.js";
import { button, el, setText } from "../../hud/dom.js";
import { botSilhouette, heartIcon, humanSilhouette, skipIcon } from "../../hud/icons.js";
import { createDraftPlate, type DraftPlate } from "../../hud/draft.js";
import { renderTeamRoster } from "../../hud/team-roster.js";
import { gameCatalogue } from "../catalogues.js";
import { audio } from "../../audio/engine.js";
import { MUSIC_FOR_SCREEN, type MusicScreen, type SoundId } from "../../audio/catalogue.js";

export interface MatchScene {
  joinRoom(roomId: string): void;
  dispose(): void;
}

export interface MatchSceneOptions {
  joinRoomId: string | null;
}

type Seats = Record<PlayerId, PublicSeat>;

const URGENT_SECONDS = 3;

const CATCH_UP_SECONDS = 1;

const NEXT_PHASE_PAUSE_SECONDS = 1;

const SEAT_COUNT = 8;

const SEAT_COLOR_COUNT = 8;

const LONG_ACTION_LABEL = 6;

const BOARD_HUD_INSETS: ViewportInsets = { left: 208, right: 244, top: 76, bottom: 24 };

const DRAFT_HUD_INSETS: ViewportInsets = { left: 208, right: 244, top: 170, bottom: 150 };

const MENU_INSETS: ViewportInsets = { left: 360, right: 40, top: 80, bottom: 200 };

const BATTLE_START_TICKS = 6;

type BannerTone = "blue" | "gold" | "crimson" | "slate";

const BANNER_TONE_CLASS: Record<BannerTone, string> = {
  blue: "",
  gold: "is-gold",
  crimson: "is-crimson",
  slate: "is-slate",
};

type SeatTone = "neutral" | "live" | "won" | "lost";

const RESULT_SOUNDS: Readonly<Record<SeatTone, SoundId | null>> = {
  neutral: null,
  live: null,
  won: "round-won",
  lost: "round-lost",
};

interface SeatRow {
  seat: PublicSeat;
  health: number;
  eliminated: boolean;
  tag: string | null;
  tone: SeatTone;
  isOpponent: boolean;
  isFocused: boolean;
  onWatch: (() => void) | null;
}

interface TeleportStage {
  kind: "teleport";
  view: TeleportView;
}

interface FightStage {
  kind: "fight";
  view: BattleView;
  inspector: UnitInspectorView;
}

type WatchStage = TeleportStage | FightStage;

interface RoundWatch {
  skip(): void;
  serverMovedOn(view: PlayerView): void;
  dispose(): void;
}

function seatOf(seats: Seats, playerId: string): PublicSeat {
  const seat = seats[playerId];

  if (seat === undefined) {
    throw new Error(`The match has no seat for player "${playerId}"`);
  }

  return seat;
}

function displayName(seats: Seats, playerId: string): string {
  return seatOf(seats, playerId).displayName;
}

function opponentOf(pairing: Pairing, playerId: string): PlayerId {
  if (pairing.teamAPlayerId === playerId) {
    return pairing.teamBPlayerId;
  }

  if (pairing.teamBPlayerId === playerId) {
    return pairing.teamAPlayerId;
  }

  throw new Error(`Player "${playerId}" is not in ${pairing.battleId}`);
}

function pairingOf<T extends Pairing>(pairings: readonly T[], playerId: string): T | null {
  return (
    pairings.find(
      (pairing) => pairing.teamAPlayerId === playerId || pairing.teamBPlayerId === playerId,
    ) ?? null
  );
}

function roundOf(view: PlayerView): RoundState {
  if (view.currentRound === null) {
    throw new Error(`The ${view.phase} phase arrived without a round`);
  }

  return view.currentRound;
}

function winnersOf(view: PlayerView): PlayerId[] {
  const winners = view.winnerPlayerIds;

  if (winners === null || winners.length === 0) {
    throw new Error(`The ${view.phase} phase arrived without winners`);
  }

  return winners;
}

function requireDeadline(activeSession: MatchSession, view: PlayerView): number {
  const deadline = activeSession.getDeadline();

  if (deadline === null) {
    throw new Error(`The ${view.phase} phase arrived without a deadline`);
  }

  return deadline;
}

function secondsUntil(deadline: number): number {
  return Math.max(1, Math.ceil((deadline - Date.now()) / 1000));
}

function unitIn(snapshot: BattleSnapshot, unitId: string): UnitState {
  const unit = snapshot.units.find((candidate) => candidate.unitId === unitId);

  if (unit === undefined) {
    throw new Error(`Snapshot at tick ${snapshot.tick} has no unit ${unitId}`);
  }

  return unit;
}

function roundLabel(round: number): string {
  return `Round ${round + 1}`;
}

function seatColor(seats: Seats, playerId: string): string {
  const index = Object.keys(seats).indexOf(playerId);

  if (index === -1) {
    throw new Error(`The match has no seat for player "${playerId}"`);
  }

  return `var(--color-seat-${(index % SEAT_COLOR_COUNT) + 1})`;
}

function silhouetteFor(seat: PublicSeat): SVGSVGElement {
  return seat.controllerKind === "human" ? humanSilhouette() : botSilhouette();
}

function titleBanner(tone: BannerTone, title: string): HTMLElement {
  return el("div", `brush-banner ${BANNER_TONE_CLASS[tone]}`, el("div", "banner-title", title));
}

function banner(tone: BannerTone, title: string, sub: string): HTMLElement {
  const box = titleBanner(tone, title);
  box.append(el("div", "banner-sub", sub));

  return box;
}

function resultBanner(seats: Seats, battle: RoundBattle, meId: string): HTMLElement {
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

function outcomeFor(result: BattleResult, playerId: string): SeatTone {
  if (result.kind === "draw") {
    return "neutral";
  }

  return result.winningTeamId === playerId ? "won" : "lost";
}

function outcomeTag(result: BattleResult, playerId: string): string {
  if (result.kind === "draw") {
    return "Draw";
  }

  return result.winningTeamId === playerId ? "Won" : "Lost";
}

function boardOwnerLabel(seats: Seats, ownerId: string, meId: string): string {
  return ownerId === meId ? "Your board" : `${displayName(seats, ownerId)}'s board`;
}

function battleStatus(seats: Seats, battle: RoundBattle, ended: boolean): string {
  if (!ended) {
    return "Fighting";
  }

  const result = battle.result;

  if (result.kind === "draw") {
    return result.reason === "timeout" ? "Time's up · draw" : "Draw";
  }

  return `${displayName(seats, result.winningTeamId)} won`;
}

function portraitRing(seats: Seats, playerId: string, sizePx: number): HTMLElement {
  const inner = el("div", "portrait-ring-inner", silhouetteFor(seatOf(seats, playerId)));
  inner.style.setProperty("--seat", seatColor(seats, playerId));

  const ring = el("div", "portrait-ring", inner);
  ring.style.setProperty("--ring-size", `${sizePx}px`);

  return ring;
}

function viewSeatTag(
  seat: PublicSeat,
  isYou: boolean,
  isOpponent: boolean,
  isAway: boolean,
  isThinking: boolean,
): string | null {
  if (isYou) {
    return "You";
  }

  if (isOpponent) {
    return "VS";
  }

  if (seat.eliminated) {
    return "Out";
  }

  if (isAway) {
    return "Away";
  }

  return isThinking ? "Thinking" : null;
}

function rowsForView(
  view: PlayerView,
  isOpponent: (playerId: string) => boolean,
  isAway: (playerId: string) => boolean,
  isThinking: (playerId: string) => boolean,
): SeatRow[] {
  return Object.values(view.players).map((seat): SeatRow => ({
    seat,
    health: seat.runHealth,
    eliminated: seat.eliminated,
    tag: viewSeatTag(
      seat,
      seat.playerId === view.you.playerId,
      isOpponent(seat.playerId),
      isAway(seat.playerId),
      isThinking(seat.playerId),
    ),
    tone: "neutral",
    isOpponent: isOpponent(seat.playerId),
    isFocused: false,
    onWatch: null,
  }));
}

function renderSeatRail(
  root: HTMLElement,
  seats: Seats,
  rows: readonly SeatRow[],
  meId: string,
): void {
  const cards = rows.map((row) => {
    const { seat } = row;
    const portrait = el("div", "seat-portrait", silhouetteFor(seat));
    portrait.style.setProperty("--seat", seatColor(seats, seat.playerId));

    const tag = row.tag === null ? null : el("span", "seat-tag", row.tag);
    tag?.setAttribute("data-tone", row.tone);

    const children = [
      portrait,
      el(
        "div",
        "seat-info",
        el("div", "seat-name", seat.displayName),
        el("div", "seat-health", String(row.health), heartIcon()),
      ),
      tag,
    ];

    const label = `${seat.displayName}, ${row.health} health${row.eliminated ? ", eliminated" : ""}`;
    const onWatch = row.onWatch;

    const card =
      onWatch === null
        ? el("div", "seat-card", ...children)
        : button("seat-card", onWatch, ...children);

    card.classList.toggle("is-you", seat.playerId === meId);
    card.classList.toggle("is-opponent", row.isOpponent);
    card.classList.toggle("is-focused", row.isFocused);
    card.classList.toggle("is-eliminated", row.eliminated);

    card.setAttribute(
      "aria-label",
      onWatch === null ? label : `Watch ${seat.displayName}'s battle. ${label}`,
    );

    return card;
  });

  root.replaceChildren(...cards);
}

interface RoundPlate {
  root: HTMLElement;
  timer: HTMLElement;
  set(round: string, phase: string): void;
}

function createRoundPlate(): RoundPlate {
  const timer = el("div", "round-plate-timer");
  const round = el("div", "round-plate-round");
  const phase = el("div", "round-plate-phase");
  timer.setAttribute("aria-live", "off");

  return {
    root: el("div", "round-plate", timer, el("div", "round-plate-label", round, phase)),
    timer,
    set(roundText, phaseText) {
      setText(round, roundText);
      setText(phase, phaseText);
    },
  };
}

export function createMatchScene(matchRoot: HTMLElement, options: MatchSceneOptions): MatchScene {
  void audio.preload("battle");

  let disposed = false;
  let session: MatchSession | null = null;
  let sessionUnsubscribe: (() => void) | null = null;
  let draftSelection: HeroDefinitionId[] = [];
  let activeCountdown: Countdown | null = null;
  let timerEpoch = -1;
  let formationView: FormationView | null = null;
  let formationKey = "";
  let draftView: DraftView | null = null;
  let draftPlates: DraftPlate[] = [];
  let draftKey = "";
  let watch: RoundWatch | null = null;
  let menuView: MenuView | null = null;
  let menuNotice: string | null = null;
  let connecting = false;
  let draftSubmittedEpoch = -1;
  let lastRenderedEpoch = -1;
  let finishAnnounced = false;
  const watchedRounds = new Set<number>();
  const announcedRounds = new Set<number>();
  const healthBeforeRound = new Map<PlayerId, number>();

  const seatRail = el("div", "seat-rail");
  seatRail.setAttribute("aria-label", "Players");

  const damageMeter = createDamageMeter();
  damageMeter.root.hidden = true;

  const teamRoster = el("div", "team-roster");
  const teamRail = el("div", "team-rail", damageMeter.root, teamRoster);
  teamRail.setAttribute("aria-label", "Your team");
  teamRail.dataset.tipEdge = "";

  const stage = el("div", "match-stage");
  const roundPlate = createRoundPlate();
  const actionButton = el("button", "action-button");
  actionButton.type = "button";

  const battleCanvas = el("div", "battle-canvas");
  const battleLayer = el("div", "battle-layer", battleCanvas);
  const boardStage = createBoardStage(battleCanvas);
  let environment: MountedEnvironment | null = null;
  let environmentThemeId: string | null = null;
  const battleHeader = el("div", "battle-header");
  const battleUnit = el("div", "hud-unit battle-unit");

  const battleSkip = button(
    "pill-button battle-skip",
    () => requireWatch().skip(),
    skipIcon(),
    "Skip",
  );

  const menuLayer = el("div", "menu-screen");
  const connectionBanner = el("div", "connection-banner");
  connectionBanner.hidden = true;

  matchRoot.replaceChildren(
    el("div", "match-backdrop"),
    battleLayer,
    seatRail,
    teamRail,
    stage,
    battleHeader,
    battleUnit,
    roundPlate.root,
    battleSkip,
    actionButton,
    menuLayer,
    connectionBanner,
  );

  const matchRegions: HTMLElement[] = [seatRail, teamRail, stage, roundPlate.root, actionButton];
  const battleRegions: HTMLElement[] = [battleLayer, battleHeader, battleSkip];

  for (const region of battleRegions) {
    region.hidden = true;
  }

  battleUnit.hidden = true;

  function requireSession(): MatchSession {
    if (session === null) {
      throw new Error("No match session is running");
    }

    return session;
  }

  function requireView(activeSession: MatchSession): PlayerView {
    const view = activeSession.getView();

    if (view === null) {
      throw new Error("The match has not sent a view yet");
    }

    return view;
  }

  function requireWatch(): RoundWatch {
    if (watch === null) {
      throw new Error("No round is being watched");
    }

    return watch;
  }

  function stopTimer(): void {
    activeCountdown?.dispose();
    activeCountdown = null;
    timerEpoch = -1;
  }

  function musicScreen(): MusicScreen {
    if (session === null) {
      return "menu";
    }

    return watch === null ? "planning" : "battle";
  }

  function syncMusic(): void {
    audio.setMusic(MUSIC_FOR_SCREEN[musicScreen()]);
  }

  function announceRoundResult(round: number, battle: RoundBattle, playerId: PlayerId): void {
    if (announcedRounds.has(round)) {
      return;
    }

    announcedRounds.add(round);
    const sound = RESULT_SOUNDS[outcomeFor(battle.result, playerId)];

    if (sound !== null) {
      audio.play(sound);
    }
  }

  function announceFinish(view: PlayerView): void {
    if (finishAnnounced) {
      return;
    }

    finishAnnounced = true;

    if (view.you.eliminated) {
      audio.play("eliminated");
    } else if (winnersOf(view).includes(view.you.playerId)) {
      audio.play("run-won");
    }
  }

  function countdownTick(remaining: number): void {
    if (remaining <= URGENT_SECONDS) {
      audio.play("countdown-tick");
    }
  }

  function roundEndPauseSeconds(): number {
    const activeSession = requireSession();
    const view = requireView(activeSession);

    switch (view.phase) {
      case "round-result":
        return secondsUntil(requireDeadline(activeSession, view));

      case "finished":
        return ROUND_END_PAUSE_SECONDS;

      case "lobby":
      case "draft":
      case "preparing":
        return NEXT_PHASE_PAUSE_SECONDS;
    }
  }

  function startTimer(epoch: number, deadline: number): void {
    if (activeCountdown !== null && timerEpoch === epoch) {
      return;
    }

    stopTimer();
    activeCountdown = createCountdown(
      roundPlate.timer,
      secondsUntil(deadline),
      () => {},
      countdownTick,
    );
    timerEpoch = epoch;
  }

  function versusHeader(seats: Seats, friendlyId: string, enemyId: string, status: string): void {
    const side = (playerId: string, className: string): HTMLElement =>
      el(
        "div",
        `battle-side ${className}`,
        portraitRing(seats, playerId, 40),
        el("span", "battle-side-name", displayName(seats, playerId)),
      );

    battleHeader.replaceChildren(
      side(friendlyId, "is-friendly"),
      el("span", "battle-vs", "vs"),
      side(enemyId, "is-enemy"),
      el("span", "battle-status", status),
    );
  }

  function dressBoard(theme: EnvironmentTheme): void {
    if (environmentThemeId === theme.id) {
      return;
    }

    environment?.dispose();
    environment = mountEnvironment(boardStage, theme, boardArena);
    environmentThemeId = theme.id;
  }

  function hidePlacementBoard(): void {
    formationView?.dispose();
    formationView = null;
    formationKey = "";

    if (watch === null) {
      battleLayer.hidden = true;
      battleHeader.hidden = true;
    }
  }

  function showPlacementBoard(
    view: PlayerView,
    activeSession: MatchSession,
    opponentId: string,
  ): void {
    dressBoard(boardThemeFor(view.you.playerId, view.you.playerId));
    battleLayer.hidden = false;
    battleHeader.hidden = false;
    const status = view.you.ready ? "Ready · waiting for the others" : "Drag heroes to place them";
    versusHeader(view.players, view.you.playerId, opponentId, status);

    const key = `preparing:${view.phaseEpoch}`;

    if (formationView !== null && formationKey === key) {
      formationView.setFormation(view.you.formation);
      formationView.setLocked(view.you.ready);

      return;
    }

    formationView?.dispose();
    formationKey = key;

    formationView = createFormationView(boardStage, {
      grid: boardArena,
      insets: BOARD_HUD_INSETS,
      heroIds: view.you.heroIds,
      formation: view.you.formation,
      onChange: (formation) => activeSession.placeHeroes(formation),
    });

    formationView.setLocked(view.you.ready);
  }

  function setAction(label: string, onClick: () => void, disabled: boolean): void {
    actionButton.hidden = false;
    actionButton.textContent = label;
    actionButton.disabled = disabled;
    actionButton.onclick = onClick;
    actionButton.classList.toggle("is-long", label.length > LONG_ACTION_LABEL);
  }

  function showMenu(): void {
    for (const region of matchRegions) {
      region.hidden = true;
    }

    dressBoard(savedBoardTheme());
    battleLayer.hidden = false;
    battleLayer.classList.add("is-menu");
    menuView ??= createMenuView(boardStage, { grid: boardArena, insets: MENU_INSETS });

    const brand = el(
      "div",
      "brush-banner menu-brand",
      el("div", "menu-brand-title", "Jev Game"),
      el("div", "menu-brand-sub", `Local match · you + ${SEAT_COUNT - 1} bots`),
    );

    const labLink = el("a", "menu-link", "Battle lab");
    labLink.href = "#lab";

    const boardsLink = el("a", "menu-link", "Board themes");
    boardsLink.href = "#env";

    const onlineButton = button(
      "menu-link",
      () => startOnline({ kind: "quick" }),
      connecting ? "Connecting…" : "Play online",
    );

    onlineButton.disabled = connecting;
    const notice = menuNotice === null ? null : el("div", "menu-notice", menuNotice);

    const fight = button(
      "menu-fight-button",
      () => startMatch(),
      el("span", "brush-banner menu-fight", "Fight!"),
    );

    fight.disabled = connecting;

    menuLayer.replaceChildren(
      brand,
      el("nav", "menu-nav", onlineButton, labLink, boardsLink, notice),
      fight,
    );

    menuLayer.hidden = false;
  }

  function showMatch(): void {
    menuView?.dispose();
    menuView = null;
    battleLayer.classList.remove("is-menu");
    menuLayer.hidden = true;
    menuLayer.replaceChildren();

    for (const region of matchRegions) {
      region.hidden = false;
    }
  }

  function hideDraft(): void {
    draftView?.dispose();
    draftView = null;
    draftPlates = [];
    draftKey = "";
    battleLayer.classList.remove("is-drafting");
    stage.classList.remove("is-draft");
  }

  function draftLocked(view: PlayerView): boolean {
    return view.you.ready || draftSubmittedEpoch === view.phaseEpoch;
  }

  function draftLockedByTimer(view: PlayerView): boolean {
    return (
      draftView !== null &&
      draftSubmittedEpoch !== lastRenderedEpoch &&
      draftSelection.length === view.rules.draftPicks
    );
  }

  function toggleDraftPick(heroId: HeroDefinitionId): void {
    const activeSession = requireSession();
    const view = requireView(activeSession);

    if (view.phase !== "draft") {
      throw new Error(`A draft pick arrived during the ${view.phase} phase`);
    }

    if (draftLocked(view)) {
      return;
    }

    if (draftSelection.includes(heroId)) {
      draftSelection = draftSelection.filter((picked) => picked !== heroId);
      audio.play("draft-unpick");
    } else if (draftSelection.length < view.rules.draftPicks) {
      draftSelection = [...draftSelection, heroId];
      audio.play("draft-pick");
    }

    activeSession.selectHeroes(draftSelection);
    render();
  }

  function lockedPicks(view: PlayerView): readonly HeroDefinitionId[] {
    return view.you.heroIds.length === 0 ? draftSelection : view.you.heroIds;
  }

  function showDraftLineup(
    view: PlayerView,
    picked: readonly HeroDefinitionId[],
    locked: boolean,
  ): void {
    dressBoard(boardThemeFor(view.you.playerId, view.you.playerId));
    battleLayer.hidden = false;
    battleHeader.hidden = true;
    const key = `draft:${view.phaseEpoch}:${view.draftPool.join(",")}`;

    if (draftView === null || draftKey !== key) {
      hideDraft();
      draftKey = key;
      draftPlates = view.draftPool.map((heroId) =>
        createDraftPlate(heroId, () => toggleDraftPick(heroId)),
      );

      draftView = createDraftView(boardStage, {
        grid: boardArena,
        insets: DRAFT_HUD_INSETS,
        heroIds: view.draftPool,
        slots: new Map(draftPlates.map((plate) => [plate.heroId, plate.slot])),
        onRise: () => audio.play("draft-rise"),
      });
    }

    battleLayer.classList.add("is-drafting");
    stage.classList.add("is-draft");
    const picks = view.rules.draftPicks;

    for (const plate of draftPlates) {
      plate.sync({ picked, picks, locked });
    }

    draftView.setState({ picked, full: picked.length >= picks, locked });
    renderTeamRoster(teamRoster, picked, picks);
    teamRail.hidden = false;
  }

  function renderDraft(view: PlayerView, activeSession: MatchSession): void {
    roundPlate.set(roundLabel(0), "Draft");
    startTimer(view.phaseEpoch, requireDeadline(activeSession, view));
    const picks = view.rules.draftPicks;
    const locked = draftLocked(view);
    showDraftLineup(view, locked ? lockedPicks(view) : draftSelection, locked);

    if (locked) {
      stage.append(banner("slate", "Team locked in", "Waiting for the other players to draft"));

      return;
    }

    stage.append(
      banner(
        "blue",
        "Draft your team",
        `Pick ${picks} heroes · ${draftSelection.length}/${picks} chosen`,
      ),
    );

    setAction(
      "Confirm",
      () => {
        draftSubmittedEpoch = view.phaseEpoch;
        audio.play("draft-lock");
        activeSession.pickHeroes(draftSelection);
        render();
      },
      draftSelection.length !== picks,
    );
  }

  function renderPreparing(view: PlayerView, activeSession: MatchSession): void {
    const round = roundOf(view);
    roundPlate.set(roundLabel(round.round), "Preparing");
    const pairing = pairingOf(round.pairings, view.you.playerId);

    if (pairing === null) {
      stage.append(banner("slate", "Bye", "Waiting for the other battles"));

      return;
    }

    stage.hidden = true;
    showPlacementBoard(view, activeSession, opponentOf(pairing, view.you.playerId));
    startTimer(view.phaseEpoch, requireDeadline(activeSession, view));

    if (!view.you.ready) {
      setAction("Ready", () => activeSession.confirmReady(), false);
    }
  }

  function renderRoundOver(view: PlayerView, activeSession: MatchSession): void {
    const round = roundOf(view);
    roundPlate.set(roundLabel(round.round), "Round over");
    startTimer(view.phaseEpoch, requireDeadline(activeSession, view));

    if (round.byePlayerId === view.you.playerId) {
      stage.append(banner("slate", "Bye", "You sat this round out"));

      return;
    }

    const battle = pairingOf(round.battles, view.you.playerId);

    if (battle === null) {
      throw new Error(`${roundLabel(round.round)} has no battle for ${view.you.playerId}`);
    }

    announceRoundResult(round.round, battle, view.you.playerId);

    stage.append(
      resultBanner(view.players, battle, view.you.playerId),
      el("div", "stage-subtitle", "The next round is about to start"),
    );
  }

  function renderFinished(view: PlayerView): void {
    const round = roundOf(view);
    roundPlate.set(roundLabel(round.round), "Finished");
    setAction("Menu", () => endMatch(), false);
    announceFinish(view);

    const winners = winnersOf(view);
    const names = winners.map((playerId) => displayName(view.players, playerId)).join(", ");
    const winnerText = `Winner${winners.length > 1 ? "s" : ""}: ${names}`;

    if (view.you.eliminated) {
      const lastBattle = pairingOf(round.battles, view.you.playerId);

      stage.append(
        lastBattle === null
          ? titleBanner("crimson", "Eliminated")
          : banner(
              "crimson",
              "Eliminated",
              `${roundLabel(round.round)} · lost to ${displayName(view.players, opponentOf(lastBattle, view.you.playerId))}`,
            ),
        el("div", "stage-subtitle", winnerText),
      );

      return;
    }

    if (winners.includes(view.you.playerId)) {
      stage.append(
        banner("gold", "Victory!", winners.length > 1 ? "You share the win" : "You won the run"),
      );

      return;
    }

    stage.append(banner("slate", "Match over", winnerText));
  }

  function createRoundWatch(
    activeSession: MatchSession,
    meId: PlayerId,
    resolved: ResolvedRound,
  ): RoundWatch {
    if (resolved.battles.length === 0) {
      throw new Error(`${roundLabel(resolved.round)} has no battles to watch`);
    }

    const ownBattle = pairingOf(resolved.battles, meId);
    let battle = ownBattle ?? resolved.battles[0];
    let focusPlayerId = ownBattle === null ? battle.teamAPlayerId : meId;
    const playback = createRoundPlayback(resolved.battles, battle, gameCatalogue);
    let clock = 0;
    let selectedUnitId: string | null = null;
    let railKey = "";
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

    function mountStage(): WatchStage {
      const history = playback.follow(battle);
      const opening = playback.openingSnapshot(battle);
      damageMeter.start(opening, focusPlayerId, history);
      selectedUnitId = null;
      railKey = "";

      if (teleporting()) {
        return {
          kind: "teleport",
          view: createTeleportView(boardStage, {
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
        view: createBattleView(boardStage, {
          friendlyTeamId: focusPlayerId,
          viewSide: viewSide(),
          insets: BOARD_HUD_INSETS,
          targetLines: "selected",
          showUnitIds: false,
          onSelectUnit(unitId) {
            selectedUnitId = selectedUnitId === unitId ? null : unitId;
          },
        }),
        inspector: createUnitInspectorView(battleUnit, focusPlayerId),
      };
    }

    function disposeStage(mounted: WatchStage): void {
      mounted.view.dispose();

      if (mounted.kind === "fight") {
        mounted.inspector.dispose();
      }
    }

    advance(activeSession.roundElapsedSeconds());
    let watchStage = mountStage();

    function remount(): void {
      disposeStage(watchStage);
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

    function watchRows(): SeatRow[] {
      return Object.values(resolved.seats).map((seat): SeatRow => {
        const playerId = seat.playerId;
        const seatBattle = pairingOf(resolved.battles, playerId);

        if (seatBattle === null) {
          const isBye = resolved.byePlayerId === playerId;

          return {
            seat,
            health: seat.runHealth,
            eliminated: !isBye && seat.eliminated,
            tag: isBye ? "Bye" : "Out",
            tone: "neutral",
            isOpponent: false,
            isFocused: false,
            onWatch: null,
          };
        }

        const ended = playback.hasEnded(seatBattle);

        return {
          seat,
          health: ended ? seat.runHealth : (healthBeforeRound.get(playerId) ?? seat.runHealth),
          eliminated: ended && seat.eliminated,
          tag: ended ? outcomeTag(seatBattle.result, playerId) : "Live",
          tone: ended ? outcomeFor(seatBattle.result, playerId) : "live",
          isOpponent: false,
          isFocused: seatBattle.battleId === battle.battleId,
          onWatch: () => focus(playerId),
        };
      });
    }

    function drawChrome(): void {
      const status =
        watchStage.kind === "teleport"
          ? boardOwnerLabel(resolved.seats, battle.teamAPlayerId, meId)
          : battleStatus(resolved.seats, battle, playback.hasEnded(battle));

      versusHeader(resolved.seats, focusPlayerId, opponentOf(battle, focusPlayerId), status);
      renderSeatRail(seatRail, resolved.seats, watchRows(), meId);
    }

    function drawTeleport(teleport: TeleportStage): void {
      teleport.view.seek(clock);
      battleSkip.hidden = false;
      roundPlate.set(roundLabel(resolved.round), "Teleport");
      setText(roundPlate.timer, "");
      roundPlate.timer.classList.remove("is-urgent");
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

      damageMeter.push(events);

      if (selectedUnitId === null) {
        fight.inspector.hide();
      } else {
        fight.inspector.show(snapshot, unitIn(snapshot, selectedUnitId));
      }

      const roundDone = playback.isDone();
      battleSkip.hidden = roundDone;

      if (roundDone) {
        if (endCountdown === null) {
          roundPlate.set(roundLabel(resolved.round), "Round over");
          endCountdown = createCountdown(roundPlate.timer, roundEndPauseSeconds(), closeRoundWatch);
          activeSession.markWatched();
        }

        return;
      }

      if (playback.hasEnded(battle)) {
        roundPlate.set(roundLabel(resolved.round), "Battle over");
        setText(roundPlate.timer, "");
        roundPlate.timer.classList.remove("is-urgent");

        return;
      }

      const secondsLeft = Math.max(0, Math.ceil((snapshot.tickLimit - moment.tick) / TICK_RATE));
      roundPlate.set(roundLabel(resolved.round), "Battle");
      setText(roundPlate.timer, String(secondsLeft));
      roundPlate.timer.classList.toggle("is-urgent", secondsLeft <= URGENT_SECONDS);
    }

    function draw(deltaSeconds: number): void {
      if (watchStage.kind === "teleport" && !teleporting()) {
        remount();
      }

      dressBoard(boardThemeFor(boardOwner(), meId));

      if (watchStage.kind === "teleport") {
        drawTeleport(watchStage);
      } else {
        drawFight(watchStage, deltaSeconds);
      }

      if (ownBattle !== null && playback.hasEnded(ownBattle)) {
        announceRoundResult(resolved.round, ownBattle, meId);
      }

      const endedIds = resolved.battles.flatMap((candidate) =>
        playback.hasEnded(candidate) ? [candidate.battleId] : [],
      );

      const key = `${watchStage.kind}|${focusPlayerId}|${endedIds.join(",")}`;

      if (key !== railKey) {
        railKey = key;
        drawChrome();
      }
    }

    function focus(playerId: PlayerId): void {
      const next = pairingOf(resolved.battles, playerId);

      if (next === null) {
        throw new Error(`${playerId} has no battle to watch in ${roundLabel(resolved.round)}`);
      }

      focusPlayerId = playerId;
      battle = next;
      remount();
      draw(0);
    }

    const stopFrames = boardStage.onFrame((deltaSeconds) => {
      const behind = activeSession.roundElapsedSeconds() - clock;
      advance(behind > CATCH_UP_SECONDS ? behind : deltaSeconds);
      draw(deltaSeconds);
    });

    draw(0);

    return {
      skip() {
        playback.skipToEnd();
        clock = TELEPORT_SECONDS + playback.elapsedSeconds();
        remount();
        draw(0);
      },

      serverMovedOn(view) {
        if (holdEnded || endCountdown === null || view.phase === "round-result") {
          return;
        }

        holdEnded = true;
        endCountdown.dispose();
        endCountdown = createCountdown(roundPlate.timer, roundEndPauseSeconds(), closeRoundWatch);
      },

      dispose() {
        stopFrames();
        endCountdown?.dispose();
        disposeStage(watchStage);
      },
    };
  }

  function openRoundWatch(
    activeSession: MatchSession,
    view: PlayerView,
    resolved: ResolvedRound,
  ): void {
    stopTimer();
    formationView?.dispose();
    formationView = null;
    formationKey = "";
    stage.hidden = true;

    for (const region of battleRegions) {
      region.hidden = false;
    }

    actionButton.hidden = true;
    teamRoster.replaceChildren();
    teamRail.hidden = false;
    teamRail.classList.add("is-battle");
    damageMeter.root.hidden = false;
    watch = createRoundWatch(activeSession, view.you.playerId, resolved);
    syncMusic();
  }

  function disposeRoundWatch(): void {
    if (watch === null) {
      return;
    }

    watch.dispose();
    watch = null;
    damageMeter.clear();
    damageMeter.root.hidden = true;
    teamRail.classList.remove("is-battle");
    hideTip();

    for (const region of battleRegions) {
      region.hidden = true;
    }

    battleUnit.hidden = true;
    roundPlate.timer.textContent = "";
    stage.hidden = false;
  }

  function closeRoundWatch(): void {
    disposeRoundWatch();
    render();
  }

  function renderConnection(activeSession: MatchSession): void {
    const state = activeSession.connection();

    if (state === "connected") {
      connectionBanner.hidden = true;
      connectionBanner.replaceChildren();

      return;
    }

    const lost = state === "lost";

    const text = el(
      "span",
      "connection-banner-text",
      lost ? "Connection to the match was lost" : "Reconnecting…",
    );

    connectionBanner.replaceChildren(text);

    if (lost) {
      connectionBanner.append(button("pill-button", () => endMatch(), "Menu"));
    }

    connectionBanner.hidden = false;
  }

  function renderLobby(activeSession: MatchSession): void {
    const lobby = activeSession.getLobby();
    const myId = activeSession.playerId();
    roundPlate.set("Lobby", lobby === null ? "Connecting" : "Waiting");
    seatRail.replaceChildren();
    teamRail.hidden = true;

    if (lobby === null) {
      stage.append(banner("slate", "Connecting", "Finding a lobby"));

      return;
    }

    const humans = lobby.seats.filter((seat) => seat.controller === "human").length;
    const isHost = myId !== null && myId === lobby.hostPlayerId;
    const link = `${location.origin}${location.pathname}#join/${lobby.roomId}`;
    const linkField = el("input", "lobby-link-field");
    linkField.value = link;
    linkField.readOnly = true;
    linkField.setAttribute("aria-label", "Invite link");

    const copy = button(
      "pill-button",
      () => {
        void navigator.clipboard.writeText(link);
        linkField.select();
      },
      "Copy",
    );

    const seats = lobby.seats.map((seat, index) => {
      const portrait = el(
        "div",
        "seat-portrait",
        seat.controller === "human" ? humanSilhouette() : botSilhouette(),
      );

      portrait.style.setProperty("--seat", `var(--color-seat-${(index % SEAT_COLOR_COUNT) + 1})`);

      const tags = [
        seat.playerId === myId ? "You" : null,
        seat.playerId === lobby.hostPlayerId ? "Host" : null,
        seat.controller === "human" && !seat.connected ? "Away" : null,
      ].filter((tag) => tag !== null);

      const card = el(
        "div",
        "lobby-seat",
        portrait,
        el("div", "lobby-seat-name", seat.displayName),
        el("div", "lobby-seat-tags", tags.join(" · ")),
      );

      card.classList.toggle("is-you", seat.playerId === myId);
      card.classList.toggle("is-bot", seat.controller === "bot");

      return card;
    });

    stage.append(
      el("div", "stage-title", "Online lobby"),
      el(
        "div",
        "stage-subtitle",
        `${humans} of ${SEAT_COUNT} seats taken by players · the rest play when the host starts`,
      ),
      el("div", "lobby-link", linkField, copy),
      el("div", "lobby-grid", ...seats),
      button("pill-button lobby-leave", () => endMatch(), "Leave"),
    );

    if (isHost) {
      setAction("Start", () => activeSession.startMatch(), false);
    } else {
      setAction("Waiting", () => {}, true);
    }
  }

  function render(): void {
    syncMusic();

    if (session === null) {
      stopTimer();
      hidePlacementBoard();
      hideDraft();
      connectionBanner.hidden = true;
      showMenu();

      return;
    }

    const activeSession = session;
    renderConnection(activeSession);

    if (watch !== null) {
      watch.serverMovedOn(requireView(activeSession));

      return;
    }

    const view = activeSession.getView();

    if (view === null) {
      stopTimer();
      hidePlacementBoard();
      hideDraft();
      showMatch();
      stage.replaceChildren();
      actionButton.hidden = true;
      renderLobby(activeSession);

      return;
    }

    if (view.phaseEpoch !== timerEpoch) {
      stopTimer();
    }

    if (view.phase === "preparing") {
      for (const seat of Object.values(view.players)) {
        healthBeforeRound.set(seat.playerId, seat.runHealth);
      }
    }

    if (view.phase !== "preparing" || view.you.eliminated) {
      hidePlacementBoard();
    }

    if (view.phase !== "draft" || view.you.eliminated) {
      if (draftLockedByTimer(view)) {
        audio.play("draft-lock");
      }

      hideDraft();
    }

    showMatch();
    const latest = activeSession.getLatestRound();

    if (latest !== null && !watchedRounds.has(latest.round)) {
      watchedRounds.add(latest.round);
      openRoundWatch(activeSession, view, latest);

      return;
    }

    const entering = view.phaseEpoch !== lastRenderedEpoch;
    lastRenderedEpoch = view.phaseEpoch;

    if (entering) {
      draftSelection = [...view.draftSelection];
    }

    stage.replaceChildren();
    stage.hidden = false;
    stage.classList.toggle("is-entering", entering);
    actionButton.hidden = true;
    actionButton.onclick = null;

    const myId = view.you.playerId;
    const myPairing = view.phase === "preparing" ? pairingOf(roundOf(view).pairings, myId) : null;
    const opponentId = myPairing === null ? null : opponentOf(myPairing, myId);

    renderSeatRail(
      seatRail,
      view.players,
      rowsForView(
        view,
        (playerId) => playerId === opponentId,
        (playerId) => activeSession.isAway(playerId),
        (playerId) => activeSession.isThinking(playerId),
      ),
      myId,
    );

    if (view.phase !== "draft") {
      renderTeamRoster(teamRoster, view.you.heroIds, view.rules.draftPicks);
      teamRail.hidden = view.you.heroIds.length === 0;
    }

    if (view.you.eliminated && view.phase !== "finished") {
      roundPlate.set(roundLabel(roundOf(view).round), "Spectating");
      stage.append(banner("crimson", "Eliminated", "You're watching the rest of the match"));
      setAction("Leave", () => endMatch(), false);

      return;
    }

    switch (view.phase) {
      case "lobby":
        roundPlate.set("Lobby", "Starting");
        break;

      case "draft":
        renderDraft(view, activeSession);
        break;

      case "preparing":
        renderPreparing(view, activeSession);
        break;

      case "round-result":
        renderRoundOver(view, activeSession);
        break;

      case "finished":
        renderFinished(view);
        break;
    }
  }

  function releaseSession(): void {
    disposeRoundWatch();
    sessionUnsubscribe?.();
    sessionUnsubscribe = null;
    session?.dispose();
    session = null;
  }

  function adoptSession(next: MatchSession): void {
    releaseSession();
    watchedRounds.clear();
    announcedRounds.clear();
    finishAnnounced = false;
    healthBeforeRound.clear();
    draftSubmittedEpoch = -1;
    lastRenderedEpoch = -1;
    menuNotice = null;
    session = next;
    sessionUnsubscribe = session.subscribe(render);
    render();
  }

  function startMatch(): void {
    if (connecting) {
      return;
    }

    startOnline({ kind: "solo" });
  }

  function startOnline(target: MatchConnectTarget): void {
    if (connecting) {
      return;
    }

    connecting = true;
    menuNotice = null;
    render();

    createOnlineSession(target)
      .then((online) => {
        connecting = false;

        if (disposed) {
          online.suspend();

          return;
        }

        adoptSession(online);
      })
      .catch((reason) => {
        connecting = false;

        if (target.kind === "resume" && savedResumeToken() === target.token) {
          saveResumeToken(null);
        }

        menuNotice = target.kind === "resume" ? null : joinFailureMessage(reason);

        if (!disposed) {
          render();
        }
      });
  }

  function endMatch(): void {
    releaseSession();
    render();
  }

  function joinRoom(roomId: string): void {
    const current = session;

    if (current !== null && current.getLobby()?.roomId === roomId) {
      return;
    }

    if (current !== null && !window.confirm("Leave your current match to join another one?")) {
      return;
    }

    releaseSession();
    startOnline({ kind: "room", roomId });
  }

  const resumeToken = savedResumeToken();

  render();

  if (options.joinRoomId !== null) {
    startOnline({ kind: "room", roomId: options.joinRoomId });
  } else if (resumeToken !== null) {
    startOnline({ kind: "resume", token: resumeToken });
  }

  return {
    joinRoom,

    dispose() {
      disposed = true;
      audio.setMusic(null);
      disposeRoundWatch();
      menuView?.dispose();
      formationView?.dispose();
      hideDraft();
      stopTimer();
      damageMeter.dispose();
      hideTip();
      sessionUnsubscribe?.();
      session?.suspend();
      environment?.dispose();
      boardStage.dispose();
      matchRoot.replaceChildren();
    },
  };
}
