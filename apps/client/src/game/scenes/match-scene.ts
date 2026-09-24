import type { BattleResult } from "@jev-game/game";
import { boardArena } from "@jev-game/content";
import {
  DEFAULT_RUN_RULES,
  lossCost,
  ROUND_END_PAUSE_SECONDS,
  TELEPORT_SECONDS,
  type PlayerId,
  type PlayerView,
  type PublicSeat,
  type RoundBattle,
} from "@jev-game/run";
import { battleFor, type MatchSession, type ResolvedRound } from "../../session/match-session.js";
import { createRoundPlayback, type RoundPlayback } from "../../session/round-playback.js";
import { createOnlineSession } from "../../session/online-session.js";
import {
  joinFailureMessage,
  savedResumeToken,
  saveResumeToken,
  type MatchConnectTarget,
} from "../../network/connect-room.js";
import { createBattleView, type BattleView } from "../views/battle-view.js";
import { createBoardStage, type ViewportInsets } from "../views/board-stage.js";
import { createFormationView, type FormationView } from "../views/formation-view.js";
import { createDraftView, type DraftView } from "../views/draft-view.js";
import { createTeleportView, type TeleportView } from "../views/teleport-view.js";
import { mountEnvironment, type EnvironmentTheme, type MountedEnvironment } from "../environments/environment.js";
import { boardThemeFor } from "../environments/board-choice.js";
import { createUnitInspectorView, type UnitInspectorView } from "../../hud/unit-inspector.js";
import { createDamageMeter } from "../../hud/damage-meter.js";
import { hideTip } from "../../hud/tooltip.js";
import { createCountdown, type Countdown } from "../../hud/countdown.js";
import { button, el } from "../../hud/dom.js";
import { botSilhouette, heartIcon, humanSilhouette, roleIcon, skipIcon } from "../../hud/icons.js";
import { renderDraftLoadout, renderLoadout, renderTeamLoadout, type SelectedPiece } from "../../hud/loadout.js";
import { createDraftPlate, type DraftPlate } from "../../hud/draft.js";
import { renderRewardPanel } from "../../hud/rewards.js";
import { gameCatalogue } from "../catalogues.js";
import { audio } from "../../audio/engine.js";
import { MUSIC_FOR_SCREEN, type MusicScreen, type SoundId } from "../../audio/catalogue.js";
import { heroVoices } from "../fx/hero-voices.js";

export interface MatchScene {
  joinRoom(roomId: string): void;
  dispose(): void;
}

type Seats = Record<PlayerId, PublicSeat>;

const ROUND_TIMER_SECONDS = 30;

const URGENT_SECONDS = 3;

const MAX_FRAME_SECONDS = 0.1;

const CATCH_UP_SECONDS = 1;

const SEAT_COLOR_COUNT = 8;

const LONG_ACTION_LABEL = 6;

const BATTLE_HUD_INSETS: ViewportInsets = { left: 208, right: 244, top: 76, bottom: 24 };

const PLACEMENT_HUD_INSETS: ViewportInsets = { left: 208, right: 244, top: 76, bottom: 24 };

const DRAFT_HUD_INSETS: ViewportInsets = { left: 208, right: 244, top: 170, bottom: 150 };

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

const WIN_LINE_OVERLAP = 0.85;

const BATTLE_START_TICKS = 6;

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

function displayName(seats: Seats, playerId: string): string {
  return seats[playerId]?.displayName ?? playerId;
}

function opponentOf(battle: RoundBattle, playerId: string): string {
  return battle.teamAPlayerId === playerId ? battle.teamBPlayerId : battle.teamAPlayerId;
}

function battleOf(battles: readonly RoundBattle[], playerId: string): RoundBattle | null {
  return battles.find((battle) => battle.teamAPlayerId === playerId || battle.teamBPlayerId === playerId) ?? null;
}

function thisRoundBattle(view: PlayerView, latest: ResolvedRound | null): RoundBattle | null {
  if (latest === null || view.currentRound === null || latest.round !== view.currentRound.round) {
    return null;
  }

  return battleFor(latest, view.you.playerId);
}

function roundLabel(round: number): string {
  return `Round ${round + 1}`;
}

function seatColor(seats: Seats, playerId: string): string {
  const index = Math.max(0, Object.keys(seats).indexOf(playerId));

  return `var(--color-seat-${(index % SEAT_COLOR_COUNT) + 1})`;
}

function silhouetteFor(seat: PublicSeat | undefined): SVGSVGElement {
  return seat?.controllerKind === "human" ? humanSilhouette() : botSilhouette();
}

function banner(tone: BannerTone, title: string, sub: string | null): HTMLElement {
  return el(
    "div",
    `brush-banner ${BANNER_TONE_CLASS[tone]}`,
    el("div", "banner-title", title),
    sub === null ? null : el("div", "banner-sub", sub),
  );
}

function resultBanner(seats: Seats, battle: RoundBattle, meId: string): HTMLElement {
  const versus = `vs ${displayName(seats, opponentOf(battle, meId))}`;
  const result = battle.result;

  if (result === null || result.kind === "failure") {
    return banner("crimson", "No result", versus);
  }

  if (result.kind === "draw") {
    return banner("slate", "Draw", `${versus} · ${result.reason === "timeout" ? "time ran out" : "both teams wiped out"}`);
  }

  return result.winningTeamId === meId ? banner("gold", "Victory", versus) : banner("crimson", "Defeat", versus);
}

function outcomeFor(result: BattleResult | null, playerId: string): SeatTone {
  if (result === null || result.kind !== "win") {
    return "neutral";
  }

  return result.winningTeamId === playerId ? "won" : "lost";
}

function outcomeTag(result: BattleResult | null, playerId: string): string {
  if (result === null || result.kind === "failure") {
    return "—";
  }

  if (result.kind === "draw") {
    return "Draw";
  }

  return result.winningTeamId === playerId ? "Won" : "Lost";
}

function boardOwnerLabel(seats: Seats, ownerId: string, meId: string): string {
  return ownerId === meId ? "Your board" : `${displayName(seats, ownerId)}'s board`;
}

function battleStatus(seats: Seats, battle: RoundBattle, ended: boolean): string {
  const result = battle.result;

  if (!ended) {
    return "Fighting";
  }

  if (result === null || result.kind === "failure") {
    return "No result";
  }

  if (result.kind === "draw") {
    return result.reason === "timeout" ? "Time's up · draw" : "Draw";
  }

  return `${displayName(seats, result.winningTeamId)} won`;
}

function portraitRing(seats: Seats, playerId: string, sizePx: number): HTMLElement {
  const inner = el("div", "portrait-ring-inner", silhouetteFor(seats[playerId]));
  inner.style.setProperty("--seat", seatColor(seats, playerId));

  const ring = el("div", "portrait-ring", inner);
  ring.style.setProperty("--ring-size", `${sizePx}px`);

  return ring;
}

function viewSeatTag(seat: PublicSeat, isYou: boolean, isOpponent: boolean, isAway: boolean, isThinking: boolean): string | null {
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
  opponentId: string | null,
  isAway: (playerId: string) => boolean,
  isThinking: (playerId: string) => boolean,
): SeatRow[] {
  return Object.values(view.players).map((seat) => ({
    seat,
    health: Math.max(0, seat.runHealth),
    eliminated: seat.eliminated,
    tag: viewSeatTag(
      seat,
      seat.playerId === view.you.playerId,
      seat.playerId === opponentId,
      isAway(seat.playerId),
      isThinking(seat.playerId),
    ),
    tone: "neutral",
    isOpponent: seat.playerId === opponentId,
    isFocused: false,
    onWatch: null,
  }));
}

function renderSeatRail(root: HTMLElement, seats: Seats, rows: readonly SeatRow[], meId: string): void {
  const cards = rows.map((row) => {
    const { seat } = row;
    const isYou = seat.playerId === meId;

    const portrait = el("div", "seat-portrait", silhouetteFor(seat));
    portrait.style.setProperty("--seat", seatColor(seats, seat.playerId));

    const tag = row.tag === null ? null : el("span", "seat-tag", row.tag);
    tag?.setAttribute("data-tone", row.tone);

    const children = [
      portrait,
      el("div", "seat-info", el("div", "seat-name", seat.displayName), el("div", "seat-health", String(row.health), heartIcon())),
      tag,
    ];

    const label = `${seat.displayName}, ${row.health} health${row.eliminated ? ", eliminated" : ""}`;
    const onWatch = row.onWatch;
    const card = onWatch === null ? el("div", "seat-card", ...children) : button("seat-card", onWatch, ...children);

    card.classList.toggle("is-you", isYou);
    card.classList.toggle("is-opponent", row.isOpponent);
    card.classList.toggle("is-focused", row.isFocused);
    card.classList.toggle("is-eliminated", row.eliminated);
    card.setAttribute("aria-label", onWatch === null ? label : `Watch ${seat.displayName}'s battle. ${label}`);

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
      round.textContent = roundText;
      phase.textContent = phaseText;
    },
  };
}

function menuEmblem(heroId: string, left: string, top: string): HTMLElement {
  const emblem = el("div", "menu-art-emblem", roleIcon(heroId));
  emblem.dataset.role = heroId;
  emblem.style.left = left;
  emblem.style.top = top;

  return emblem;
}

interface RoundWatch {
  resolved: ResolvedRound;
  playback: RoundPlayback;
  focusPlayerId: string;
  battle: RoundBattle;
  battleView: BattleView | null;
  teleportView: TeleportView | null;
  inspector: UnitInspectorView | null;
  selectedUnitId: string | null;
  clock: number;
  lastTick: number;
  railKey: string;
  animationFrame: number;
  endCountdown: Countdown | null;
  holdEnded: boolean;
}

function isTeleporting(active: RoundWatch): boolean {
  return active.clock < TELEPORT_SECONDS;
}

function advanceWatch(active: RoundWatch, deltaSeconds: number): void {
  active.clock += Math.max(0, deltaSeconds);
  active.playback.advance(Math.max(0, active.clock - TELEPORT_SECONDS) - active.playback.elapsedSeconds());
}

export interface MatchSceneOptions {
  joinRoomId: string | null;
}

export function createMatchScene(matchRoot: HTMLElement, options: MatchSceneOptions): MatchScene {
  void audio.preload("battle");
  void audio.preload("voices");

  let session: MatchSession | null = null;
  let sessionUnsubscribe: (() => void) | null = null;
  let draftSelection: string[] = [];
  let activeCountdown: Countdown | null = null;
  let timerEpoch = -1;
  let timerStartedAt = 0;
  let timerTotalSeconds = 0;
  let formationView: FormationView | null = null;
  let formationKey = "";
  let draftView: DraftView | null = null;
  let draftPlates: DraftPlate[] = [];
  let draftKey = "";
  let watch: RoundWatch | null = null;
  let menuNotice: string | null = null;
  let connecting = false;
  let draftSubmittedEpoch = -1;
  let lastRenderedEpoch = -1;
  let selectedPiece: SelectedPiece | null = null;
  const watchedRounds = new Set<number>();
  const announcedRounds = new Set<number>();
  let finishAnnounced = false;
  let winLineTimer = 0;
  const healthBeforeRound = new Map<string, number>();

  const seatRail = el("div", "seat-rail");
  seatRail.setAttribute("aria-label", "Players");

  const damageMeter = createDamageMeter();
  damageMeter.root.hidden = true;
  const teamLoadout = el("div", "team-loadout");
  const teamRail = el("div", "team-rail", damageMeter.root, teamLoadout);
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
  const battleSkip = button("pill-button battle-skip", () => skipRound(), skipIcon(), "Skip");

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

  function stopTimer(): void {
    activeCountdown?.dispose();
    activeCountdown = null;
    timerEpoch = -1;
  }

  function me(): string {
    return session?.playerId() ?? "";
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

  function announceRoundResult(round: number, battle: RoundBattle): void {
    if (announcedRounds.has(round)) {
      return;
    }

    announcedRounds.add(round);
    const outcome = outcomeFor(battle.result, me());
    const sound = RESULT_SOUNDS[outcome];
    const seconds = sound === null ? 0 : audio.play(sound);

    if (outcome === "won") {
      const heroIds = session?.getView()?.you.heroBuilds.map((build) => build.heroId) ?? [];
      window.clearTimeout(winLineTimer);
      winLineTimer = window.setTimeout(() => heroVoices.win(heroIds), seconds * WIN_LINE_OVERLAP * 1000);
    }
  }

  function announceFinish(view: PlayerView): void {
    if (finishAnnounced || view.abortReason !== null) {
      return;
    }

    finishAnnounced = true;

    if (view.you.eliminated) {
      audio.play("eliminated");
    } else if ((view.winnerPlayerIds ?? []).includes(view.you.playerId)) {
      audio.play("run-won");
    }
  }

  function announceChoice(view: PlayerView, decisionId: string, offerId: string): void {
    const offer = view.pendingDecisions
      .find((decision) => decision.decisionId === decisionId)
      ?.offers.find((candidate) => candidate.offerId === offerId);

    if (offer?.kind === "recruit" && offer.heroId !== null) {
      audio.play("recruit");
      heroVoices.pick(offer.heroId);

      return;
    }

    audio.play("reward-claim");
  }

  function countdownTick(remaining: number): void {
    if (remaining <= URGENT_SECONDS) {
      audio.play("countdown-tick");
    }
  }

  function timerSeconds(): number {
    const deadline = session?.getDeadline() ?? null;

    return deadline === null ? ROUND_TIMER_SECONDS : Math.max(1, Math.ceil((deadline - Date.now()) / 1000));
  }

  function roundEndPauseSeconds(): number {
    if (session === null) {
      return ROUND_END_PAUSE_SECONDS;
    }

    const phase = session.getView()?.phase;
    const deadline = session.getDeadline();

    if (phase === "round-result" && deadline !== null) {
      return Math.max(1, Math.ceil((deadline - Date.now()) / 1000));
    }

    return phase === "finished" ? ROUND_END_PAUSE_SECONDS : 1;
  }

  function startTimer(epoch: number, onExpire: () => void): void {
    if (activeCountdown !== null && timerEpoch === epoch) {
      return;
    }

    stopTimer();
    timerTotalSeconds = timerSeconds();
    timerStartedAt = Date.now();
    activeCountdown = createCountdown(roundPlate.timer, timerTotalSeconds, onExpire, countdownTick);
    timerEpoch = epoch;
  }

  function timerBar(): HTMLElement {
    const totalMilliseconds = Math.max(1, timerTotalSeconds * 1000);
    const remaining = Math.max(0, totalMilliseconds - (Date.now() - timerStartedAt));
    const fill = el("span", "reward-timer-fill");
    fill.style.setProperty("--from", String(remaining / totalMilliseconds));
    fill.style.animationDuration = `${remaining}ms`;

    return el("div", "reward-timer", fill);
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

  function showRewardBoard(view: PlayerView): void {
    dressBoard(boardThemeFor(view.you.playerId, view.you.playerId));
    battleLayer.hidden = false;
    battleHeader.hidden = true;
    const heroIds = view.you.heroBuilds.map((build) => build.heroId);
    const key = `reward:${view.phaseEpoch}:${heroIds.join(",")}`;

    if (formationView !== null && formationKey === key) {
      formationView.setFormation(view.you.formation);

      return;
    }

    formationView?.dispose();
    formationKey = key;

    formationView = createFormationView(boardStage, {
      grid: boardArena,
      insets: PLACEMENT_HUD_INSETS,
      heroIds,
      formation: view.you.formation,
      onChange: () => {},
    });

    formationView.setLocked(true);
  }

  function showPlacementBoard(view: PlayerView, activeSession: MatchSession, opponentId: string): void {
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
      insets: PLACEMENT_HUD_INSETS,
      heroIds: view.you.heroBuilds.map((build) => build.heroId),
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

    const brand = el(
      "div",
      "brush-banner menu-brand",
      el("div", "menu-brand-title", "Jev Game"),
      el("div", "menu-brand-sub", "Local match · you + 7 baseline bots"),
    );

    const labLink = el("a", "menu-link", "Battle lab");
    labLink.href = "#lab";

    const boardsLink = el("a", "menu-link", "Board themes");
    boardsLink.href = "#env";

    const onlineButton = button("menu-link", () => startOnline({ kind: "quick" }), connecting ? "Connecting…" : "Play online");
    onlineButton.disabled = connecting;
    const notice = menuNotice === null ? null : el("div", "menu-notice", menuNotice);

    const art = el(
      "div",
      "menu-art",
      el("div", "menu-art-glow"),
      menuEmblem("frostweaver", "31%", "2%"),
      menuEmblem("bulwark", "4%", "50%"),
      menuEmblem("duskblade", "58%", "50%"),
    );

    const fight = button("menu-fight-button", () => startMatch(), el("span", "brush-banner menu-fight", "Fight!"));
    fight.disabled = connecting;

    menuLayer.replaceChildren(brand, el("nav", "menu-nav", onlineButton, labLink, boardsLink, notice), art, fight);
    menuLayer.hidden = false;
  }

  function showMatch(): void {
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

  function toggleDraftPick(offerId: string): void {
    const activeSession = session;
    const view = activeSession?.getView() ?? null;

    if (activeSession === null || view === null || view.phase !== "draft" || draftLocked(view)) {
      return;
    }

    if (draftSelection.includes(offerId)) {
      draftSelection = draftSelection.filter((id) => id !== offerId);
      audio.play("draft-unpick");
    } else if (draftSelection.length < view.rules.draftPicks) {
      draftSelection = [...draftSelection, offerId];
      audio.play("draft-pick");
      const heroId = view.heroOffers.find((offer) => offer.offerId === offerId)?.heroId;

      if (heroId !== undefined) {
        heroVoices.pick(heroId);
      }
    }

    activeSession.selectHeroes(draftSelection);
    render();
  }

  function lockedPicks(view: PlayerView): string[] {
    const heroIds = view.you.heroBuilds.map((build) => build.heroId);

    if (heroIds.length === 0) {
      return draftSelection;
    }

    return heroIds.flatMap((heroId) => {
      const offer = view.heroOffers.find((candidate) => candidate.heroId === heroId);

      return offer === undefined ? [] : [offer.offerId];
    });
  }

  function showDraftLineup(view: PlayerView, picked: readonly string[], locked: boolean): void {
    dressBoard(boardThemeFor(view.you.playerId, view.you.playerId));
    battleLayer.hidden = false;
    battleHeader.hidden = true;
    const key = `draft:${view.phaseEpoch}:${view.heroOffers.map((offer) => offer.offerId).join(",")}`;

    if (draftView === null || draftKey !== key) {
      hideDraft();
      draftKey = key;
      draftPlates = view.heroOffers.map((offer) => createDraftPlate(offer, gameCatalogue, () => toggleDraftPick(offer.offerId)));

      draftView = createDraftView(boardStage, {
        grid: boardArena,
        insets: DRAFT_HUD_INSETS,
        offers: view.heroOffers,
        slots: new Map(draftPlates.map((plate) => [plate.offer.offerId, plate.slot])),
        onRise: () => audio.play("draft-rise"),
      });
    }

    battleLayer.classList.add("is-drafting");
    stage.classList.add("is-draft");
    const picks = view.rules.draftPicks;

    const builds = picked.flatMap((offerId) => {
      const plate = draftPlates.find((candidate) => candidate.offer.offerId === offerId);

      return plate === undefined ? [] : [plate.build];
    });

    for (const plate of draftPlates) {
      plate.sync({ picked, builds, picks, locked });
    }

    draftView.setState({ picked, full: picked.length >= picks, locked });
    renderDraftLoadout(teamLoadout, builds, picks, gameCatalogue);
    teamRail.hidden = false;
  }

  function renderDraft(view: PlayerView, activeSession: MatchSession): void {
    roundPlate.set("Round 1", "Draft");

    if (activeSession.getDeadline() !== null) {
      startTimer(view.phaseEpoch, () => {});
    }

    const picks = view.rules.draftPicks;
    const locked = draftLocked(view);
    showDraftLineup(view, locked ? lockedPicks(view) : draftSelection, locked);

    if (locked) {
      stage.append(banner("slate", "Team locked in", "Waiting for the other players to draft"));

      return;
    }

    stage.append(banner("blue", "Draft your team", `Pick ${picks} heroes · ${draftSelection.length}/${picks} chosen`));

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
    roundPlate.set(roundLabel(view.currentRound?.round ?? 0), "Preparing");

    const battle = battleOf(Object.values(view.currentRound?.battles ?? {}), view.you.playerId);

    if (battle === null) {
      stage.append(banner("slate", "Bye", "Waiting for the other battles"));

      return;
    }

    const opponentId = opponentOf(battle, view.you.playerId);
    stage.hidden = true;
    showPlacementBoard(view, activeSession, opponentId);
    startTimer(view.phaseEpoch, () => {});

    if (!view.you.ready) {
      setAction("Ready", () => activeSession.confirmReady(), false);
    }
  }

  function renderRoundResult(view: PlayerView, activeSession: MatchSession): void {
    if (view.currentRound?.byePlayerId === view.you.playerId) {
      stage.append(banner("slate", "Bye", "You sat this round out"));

      return;
    }

    const latest = activeSession.getLatestRound();
    const battle = thisRoundBattle(view, latest);

    if (latest !== null && battle !== null) {
      announceRoundResult(latest.round, battle);
      stage.append(resultBanner(view.players, battle, view.you.playerId));
    }
  }

  function renderReward(view: PlayerView, activeSession: MatchSession): void {
    roundPlate.set(roundLabel(view.currentRound?.round ?? 0), "Rewards");
    showRewardBoard(view);
    renderRoundResult(view, activeSession);

    startTimer(view.phaseEpoch, () => {});

    if (view.you.ready) {
      stage.append(el("div", "stage-subtitle reward-waiting", "Waiting for the other players · you can still move items and runes"));

      return;
    }

    const panel = renderRewardPanel(stage, view, gameCatalogue, (decisionId, offerId) => {
      announceChoice(view, decisionId, offerId);
      activeSession.chooseOffer(decisionId, offerId, null);
    });

    panel?.append(timerBar());
  }

  function renderTeamRail(view: PlayerView, activeSession: MatchSession): void {
    const interactive =
      !view.you.eliminated && (view.phase === "reward" || (view.phase === "preparing" && !view.you.ready));

    if (!interactive) {
      selectedPiece = null;
    }

    renderLoadout(teamLoadout, view.you, view.rules, gameCatalogue, {
      selected: selectedPiece,
      interactive,
      select(piece) {
        selectedPiece = piece;
        render();
      },
      moveItem(instanceId, heroSlot) {
        activeSession.moveItem(instanceId, heroSlot);
      },
      socketRune(instanceId, heroSlot) {
        activeSession.socketRune(instanceId, heroSlot);
      },
      discardItem(instanceId) {
        activeSession.discardItem(instanceId);
      },
    });
  }

  function renderFinished(view: PlayerView, activeSession: MatchSession): void {
    roundPlate.set(roundLabel(view.currentRound?.round ?? 0), "Finished");
    setAction("Menu", () => endMatch(), false);
    announceFinish(view);

    if (view.abortReason !== null) {
      stage.append(banner("crimson", "Aborted", view.abortReason));

      return;
    }

    const winners = view.winnerPlayerIds ?? [];

    const winnerText =
      winners.length === 0
        ? "Nobody survived"
        : `Winner${winners.length > 1 ? "s" : ""}: ${winners.map((playerId) => displayName(view.players, playerId)).join(", ")}`;

    if (view.you.eliminated) {
      const latest = activeSession.getLatestRound();
      const lastBattle = latest === null ? null : battleFor(latest, view.you.playerId);

      const lostTo =
        latest === null || lastBattle === null
          ? null
          : `Round ${latest.round + 1} · lost to ${displayName(view.players, opponentOf(lastBattle, view.you.playerId))}`;

      stage.append(banner("crimson", "Eliminated", lostTo), el("div", "stage-subtitle", winnerText));

      return;
    }

    if (winners.includes(view.you.playerId)) {
      stage.append(banner("gold", "Victory!", winners.length > 1 ? "You share the win" : "You won the run"));

      return;
    }

    stage.append(banner("slate", "Match over", winnerText));
  }

  function rowsForWatch(active: RoundWatch): SeatRow[] {
    const { resolved, playback } = active;

    return Object.values(resolved.seats).map((seat): SeatRow => {
      const battle = battleOf(resolved.battles, seat.playerId);
      const isFocused = battle !== null && battle.battleId === active.battle.battleId;

      if (battle === null) {
        const isBye = resolved.byePlayerId === seat.playerId;

        return {
          seat,
          health: Math.max(0, seat.runHealth),
          eliminated: !isBye && seat.eliminated,
          tag: isBye ? "Bye" : "Out",
          tone: "neutral",
          isOpponent: false,
          isFocused: false,
          onWatch: null,
        };
      }

      const ended = playback.hasEnded(battle);
      const lostThisRound = outcomeFor(battle.result, seat.playerId) === "lost";
      const cost = lostThisRound ? lossCost(session?.getView()?.rules ?? DEFAULT_RUN_RULES, battle.winnerSurvivors) : 0;
      const health = Math.max(0, ended ? seat.runHealth : (healthBeforeRound.get(seat.playerId) ?? seat.runHealth + cost));
      const playerId = seat.playerId;

      return {
        seat,
        health,
        eliminated: ended && seat.eliminated,
        tag: ended ? outcomeTag(battle.result, playerId) : "Live",
        tone: ended ? outcomeFor(battle.result, playerId) : "live",
        isOpponent: false,
        isFocused,
        onWatch: () => focusPlayer(playerId),
      };
    });
  }

  function renderWatchChrome(active: RoundWatch): void {
    const { resolved, battle, focusPlayerId, playback } = active;

    const status =
      active.teleportView === null
        ? battleStatus(resolved.seats, battle, playback.hasEnded(battle))
        : boardOwnerLabel(resolved.seats, battle.teamAPlayerId, me());

    versusHeader(resolved.seats, focusPlayerId, opponentOf(battle, focusPlayerId), status);

    renderSeatRail(seatRail, resolved.seats, rowsForWatch(active), me());
  }

  function watchBoardOwner(active: RoundWatch): string {
    const warp = active.teleportView?.warpSeconds ?? null;

    return warp !== null && active.clock < warp ? active.focusPlayerId : active.battle.teamAPlayerId;
  }

  function renderTeleportFrame(active: RoundWatch, teleportView: TeleportView): void {
    teleportView.seek(active.clock);
    battleSkip.hidden = false;
    roundPlate.set(roundLabel(active.resolved.round), "Teleport");
    roundPlate.timer.textContent = "";
    roundPlate.timer.classList.remove("is-urgent");
  }

  function renderFightFrame(active: RoundWatch): void {
    const { playback, battle } = active;
    const frame = playback.frame(battle);
    const tick = playback.tick();
    const events = playback.eventsBetween(battle, active.lastTick, tick);
    active.lastTick = tick;

    active.battleView?.update(frame.snapshot, active.selectedUnitId, events);
    damageMeter.push(events);

    const selectedUnit =
      active.selectedUnitId === null
        ? null
        : (frame.snapshot.units.find((unit) => unit.unitId === active.selectedUnitId) ?? null);

    active.inspector?.update(selectedUnit, frame.snapshot.tick);

    const roundDone = playback.isDone();
    battleSkip.hidden = roundDone;

    if (!roundDone) {
      const secondsLeft = Math.ceil(playback.secondsLeft(frame.snapshot.tickLimit));
      roundPlate.set(roundLabel(active.resolved.round), "Battle");
      roundPlate.timer.textContent = String(secondsLeft);
      roundPlate.timer.classList.toggle("is-urgent", secondsLeft <= URGENT_SECONDS);
    } else if (active.endCountdown === null) {
      roundPlate.set(roundLabel(active.resolved.round), "Round over");
      active.endCountdown = createCountdown(roundPlate.timer, roundEndPauseSeconds(), () => closeRoundWatch());
      session?.markWatched();
    }
  }

  function renderWatchFrame(active: RoundWatch): void {
    const teleportView = active.teleportView;

    if (teleportView !== null && !isTeleporting(active)) {
      mountBattle(active);

      return;
    }

    dressBoard(boardThemeFor(watchBoardOwner(active), me()));

    if (teleportView === null) {
      renderFightFrame(active);
    } else {
      renderTeleportFrame(active, teleportView);
    }

    const endedIds = active.resolved.battles
      .filter((candidate) => active.playback.hasEnded(candidate))
      .map((candidate) => candidate.battleId);

    const ownBattle = battleFor(active.resolved, me());

    if (ownBattle !== null && endedIds.includes(ownBattle.battleId)) {
      announceRoundResult(active.resolved.round, ownBattle);
    }

    const beat = teleportView === null ? "fight" : "teleport";
    const railKey = `${beat}|${active.focusPlayerId}|${endedIds.join(",")}`;

    if (railKey !== active.railKey) {
      active.railKey = railKey;
      renderWatchChrome(active);
    }
  }

  function mountBattle(active: RoundWatch): void {
    active.teleportView?.dispose();
    active.teleportView = null;
    active.battleView?.dispose();
    active.battleView = null;
    active.inspector?.dispose();

    const viewSide = active.battle.teamAPlayerId === active.focusPlayerId ? "south" : "north";

    if (isTeleporting(active)) {
      active.teleportView = createTeleportView(boardStage, {
        seconds: TELEPORT_SECONDS,
        opening: active.playback.openingSnapshot(active.battle),
        friendlyTeamId: active.focusPlayerId,
        homeTeamId: active.battle.teamAPlayerId,
        viewSide,
        insets: BATTLE_HUD_INSETS,
      });
    } else {
      if (active.playback.tick() <= BATTLE_START_TICKS) {
        audio.play("battle-start");
      }

      active.battleView = createBattleView(boardStage, {
        friendlyTeamId: active.focusPlayerId,
        viewSide,
        insets: BATTLE_HUD_INSETS,
        targetLines: "selected",
        showUnitIds: false,
        onSelectUnit: (unitId) => {
          active.selectedUnitId = active.selectedUnitId === unitId ? null : unitId;
          renderWatchFrame(active);
        },
      });
    }

    active.inspector = createUnitInspectorView(battleUnit, active.focusPlayerId);
    active.selectedUnitId = null;
    active.lastTick = active.playback.tick();
    active.railKey = "";
    showWatchedTeam(active);
    renderWatchFrame(active);
  }

  function showWatchedTeam(active: RoundWatch): void {
    const units = active.battle.setup?.units ?? [];
    const builds = units.flatMap((unit) => (unit.teamId === active.focusPlayerId ? [unit.build] : []));
    const itemSlots = session?.getView()?.rules.itemSlots ?? DEFAULT_RUN_RULES.itemSlots;
    renderTeamLoadout(teamLoadout, builds, itemSlots, gameCatalogue);

    damageMeter.start(
      active.playback.openingSnapshot(active.battle),
      active.focusPlayerId,
      active.playback.eventsBetween(active.battle, -1, active.lastTick),
    );
  }

  function focusPlayer(playerId: string): void {
    const active = watch;

    if (active === null) {
      return;
    }

    const battle = battleOf(active.resolved.battles, playerId);

    if (battle === null) {
      return;
    }

    active.focusPlayerId = playerId;
    active.battle = battle;
    mountBattle(active);
  }

  function skipRound(): void {
    if (watch === null) {
      return;
    }

    watch.playback.skipToEnd();
    watch.clock = TELEPORT_SECONDS + watch.playback.elapsedSeconds();
    renderWatchFrame(watch);
  }

  function openRoundWatch(resolved: ResolvedRound): void {
    const ownBattle = battleFor(resolved, me());
    const battle = ownBattle ?? resolved.battles[0];

    if (battle === undefined) {
      return;
    }

    stopTimer();
    formationView?.dispose();
    formationView = null;
    formationKey = "";
    stage.hidden = true;

    for (const region of battleRegions) {
      region.hidden = false;
    }

    const active: RoundWatch = {
      resolved,
      playback: createRoundPlayback(resolved.battles, gameCatalogue),
      focusPlayerId: ownBattle === null ? battle.teamAPlayerId : me(),
      battle,
      battleView: null,
      teleportView: null,
      inspector: null,
      selectedUnitId: null,
      clock: 0,
      lastTick: 0,
      railKey: "",
      animationFrame: 0,
      endCountdown: null,
      holdEnded: false,
    };

    advanceWatch(active, session?.roundElapsedSeconds() ?? 0);
    watch = active;
    syncMusic();
    actionButton.hidden = true;
    selectedPiece = null;
    teamRail.hidden = false;
    teamRail.classList.add("is-battle");
    damageMeter.root.hidden = false;
    mountBattle(active);

    let lastFrameTime = performance.now();

    const frame = (now: number): void => {
      const step = Math.min(MAX_FRAME_SECONDS, (now - lastFrameTime) / 1000);
      const behind = (session?.roundElapsedSeconds() ?? 0) - active.clock;
      advanceWatch(active, behind > CATCH_UP_SECONDS ? behind : step);
      lastFrameTime = now;
      renderWatchFrame(active);
      active.animationFrame = requestAnimationFrame(frame);
    };

    active.animationFrame = requestAnimationFrame(frame);
  }

  function disposeRoundWatch(): void {
    const active = watch;

    if (active === null) {
      return;
    }

    cancelAnimationFrame(active.animationFrame);
    active.endCountdown?.dispose();
    active.teleportView?.dispose();
    active.battleView?.dispose();
    active.inspector?.dispose();
    damageMeter.clear();
    damageMeter.root.hidden = true;
    teamRail.classList.remove("is-battle");
    teamLoadout.replaceChildren();
    hideTip();

    for (const region of battleRegions) {
      region.hidden = true;
    }

    battleUnit.hidden = true;
    roundPlate.timer.textContent = "";
    stage.hidden = false;
    watch = null;
  }

  function shortenRoundOverIfHoldEnded(active: RoundWatch, view: PlayerView | null): void {
    if (active.holdEnded || active.endCountdown === null || view === null || view.phase === "round-result") {
      return;
    }

    active.holdEnded = true;
    active.endCountdown.dispose();
    active.endCountdown = createCountdown(roundPlate.timer, roundEndPauseSeconds(), () => closeRoundWatch());
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

    const text = el("span", "connection-banner-text", lost ? "Connection to the match was lost" : "Reconnecting…");

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

    const copy = button("pill-button", () => {
      navigator.clipboard?.writeText(link).catch(() => {});
      linkField.select();
    }, "Copy");

    const seats = lobby.seats.map((seat, index) => {
      const portrait = el("div", "seat-portrait", seat.controller === "human" ? humanSilhouette() : botSilhouette());
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
      el("div", "stage-subtitle", `${humans} of 8 seats taken by players · the rest play when the host starts`),
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

    renderConnection(session);

    if (watch !== null) {
      shortenRoundOverIfHoldEnded(watch, session.getView());

      return;
    }

    const activeSession = session;
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

    if ((view.phase !== "preparing" && view.phase !== "reward") || view.you.eliminated) {
      hidePlacementBoard();
    }

    if (view.phase !== "draft" || view.you.eliminated) {
      hideDraft();
    }

    const latest = activeSession.getLatestRound();

    showMatch();

    if (latest !== null && !watchedRounds.has(latest.round)) {
      watchedRounds.add(latest.round);

      if (latest.replay) {
        renderTeamRail(view, activeSession);
        openRoundWatch(latest);

        return;
      }
    }

    const entering = view.phaseEpoch !== lastRenderedEpoch;
    lastRenderedEpoch = view.phaseEpoch;

    if (entering) {
      draftSelection = [...view.draftSelection];
    }

    stage.replaceChildren();
    stage.classList.toggle("is-entering", entering);
    stage.classList.toggle("is-reward", view.phase === "reward" && !view.you.eliminated);
    battleLayer.classList.toggle("is-dimmed", view.phase === "reward" && !view.you.eliminated);
    actionButton.hidden = true;
    actionButton.onclick = null;

    const myId = view.you.playerId;

    const myBattle =
      view.phase === "preparing" ? battleOf(Object.values(view.currentRound?.battles ?? {}), myId) : null;

    renderSeatRail(
      seatRail,
      view.players,
      rowsForView(
        view,
        myBattle === null ? null : opponentOf(myBattle, myId),
        (playerId) => activeSession.isAway(playerId),
        (playerId) => activeSession.isThinking(playerId),
      ),
      myId,
    );

    renderTeamRail(view, activeSession);
    teamRail.hidden = view.you.heroBuilds.length === 0;

    if (view.you.eliminated && view.phase !== "finished") {
      roundPlate.set(roundLabel(view.currentRound?.round ?? 0), "Spectating");
      stage.append(banner("crimson", "Eliminated", "You're watching the rest of the match"));
      setAction("Leave", () => endMatch(), false);

      return;
    }

    switch (view.phase) {
      case "draft":
        renderDraft(view, activeSession);
        break;

      case "preparing":
        renderPreparing(view, activeSession);
        break;

      case "reward":
        renderReward(view, activeSession);
        break;

      case "finished":
        renderFinished(view, activeSession);
        break;

      case "round-result":
        roundPlate.set(roundLabel(view.currentRound?.round ?? 0), "Round over");
        renderRoundResult(view, activeSession);
        stage.append(el("div", "stage-subtitle", "Waiting for the other battles to finish"));

        if (activeSession.getDeadline() !== null) {
          startTimer(view.phaseEpoch, () => {});
        }

        break;

      default:
        roundPlate.set(roundLabel(view.currentRound?.round ?? 0), "Resolving");
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
    window.clearTimeout(winLineTimer);
    healthBeforeRound.clear();
    draftSubmittedEpoch = -1;
    lastRenderedEpoch = -1;
    selectedPiece = null;
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

  let disposed = false;
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
      window.clearTimeout(winLineTimer);
      audio.setMusic(null);
      disposeRoundWatch();
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
