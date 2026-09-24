import { Room, ServerError, type Client, type CloseCode } from "colyseus";
import { gameCatalogue as catalogue, validateCatalogue } from "@jev-game/content";
import { applyJevOutcome, createJevDriver, type DecisionRecord, type DriverOutcome, type JevDriver } from "@jev-game/jev";
import {
  advanceIfReady,
  createRun,
  forfeitSeat,
  getPlayerView,
  milestoneAfterRound,
  roundHoldSeconds,
  runBotCommands,
  runFallbackCommands,
  type ControllerKind,
  type RunPhase,
  type RunState,
  type SeatSpec,
} from "@jev-game/run";
import {
  CLIENT_MESSAGES,
  commandMessage,
  JOIN_REFUSAL_CODES,
  joinOptions,
  PROTOCOL_VERSION,
  SERVER_MESSAGES,
  startMessage,
  syncMessage,
  watchedMessage,
  type CommandMessage,
  type JoinOptions,
  type ServerMessages,
  type StartMessage,
  type SyncMessage,
  type ViewMessage,
  type WatchedMessage,
} from "@jev-game/protocol";
import { LobbySeat, MatchState } from "./match-state.js";
import { matchRules, matchTimings, type MatchTimings } from "./match-timings.js";
import { claimBotSeat, createSeats, humanSeats, releaseToBot, seatForSession, type SeatSlot } from "./seat-registry.js";
import { botSeatLabel, jevProvider } from "./jev-provider.js";
import { handleCommand } from "./command-handler.js";

const SEAT_COUNT = 8;

const MAX_ADVANCE_STEPS = 64;

const DEADLINE_RETRY_MILLISECONDS = 1000;

export interface MatchMetrics {
  lastResolveMilliseconds: number;
  lastViewBytes: number;
  viewsSent: number;
}

function phaseSeconds(timings: MatchTimings, run: RunState): number | null {
  const phase: RunPhase = run.phase;

  switch (phase) {
    case "draft":
      return timings.draftSeconds;

    case "preparing":
      return timings.preparingSeconds;

    case "reward": {
      const round = (run.currentRound?.round ?? 0) + 1;

      return milestoneAfterRound(run.rules, round) === "none" ? timings.rewardSeconds : timings.milestoneRewardSeconds;
    }

    default:
      return null;
  }
}

export type MatchClient = Client<{ messages: ServerMessages }>;

export class MatchRoom extends Room<{ state: MatchState; client: MatchClient }> {
  override maxClients = SEAT_COUNT;
  override state = new MatchState();

  readonly metrics: MatchMetrics = { lastResolveMilliseconds: 0, lastViewBytes: 0, viewsSent: 0 };
  readonly jevRecords: DecisionRecord[] = [];

  private readonly timings = matchTimings();
  private readonly jev = jevProvider();
  private readonly botLabel = botSeatLabel(this.jev);
  private readonly seats: SeatSlot[] = createSeats(SEAT_COUNT, this.botLabel);
  private solo = false;
  private driver: JevDriver | null = null;
  private run: RunState | null = null;
  private phaseStartedAt = Date.now();
  private deadlineAt: number | null = null;
  private holdUntil: number | null = null;

  override messages = {
    [CLIENT_MESSAGES.command]: (client: MatchClient, payload: CommandMessage) => {
      const parsed = commandMessage.safeParse(payload);

      if (!parsed.success) {
        return;
      }

      const seat = seatForSession(this.seats, client.sessionId);
      const outcome = handleCommand(this.run, seat, parsed.data, catalogue);
      client.send(SERVER_MESSAGES.ack, outcome.ack);

      if (outcome.changed) {
        this.run = outcome.run;
        this.advance();
        this.publish();
      }
    },

    [CLIENT_MESSAGES.start]: (client: MatchClient, payload: StartMessage) => {
      if (startMessage.safeParse(payload ?? {}).success) {
        this.start(client);
      }
    },

    [CLIENT_MESSAGES.sync]: (client: MatchClient, payload: SyncMessage) => {
      const seat = seatForSession(this.seats, client.sessionId);

      if (seat !== null && syncMessage.safeParse(payload ?? {}).success) {
        this.sendView(client, seat, true);
      }
    },

    [CLIENT_MESSAGES.watched]: (client: MatchClient, payload: WatchedMessage) => {
      const parsed = watchedMessage.safeParse(payload);
      const seat = seatForSession(this.seats, client.sessionId);

      if (!parsed.success || seat === null) {
        return;
      }

      seat.watchedEpoch = parsed.data.phaseEpoch;
      this.endHoldIfEveryoneWatched();
    },
  };

  override onCreate(options: JoinOptions) {
    validateCatalogue(catalogue);
    const parsed = joinOptions.safeParse(options ?? {});
    this.solo = parsed.success && parsed.data.solo === true;

    if (this.solo) {
      this.setPrivate(true).catch(() => {});
    }

    this.syncLobby();
    this.clock.setInterval(() => this.onClock(), this.timings.clockMilliseconds);
  }

  override onJoin(client: MatchClient, options: JoinOptions) {
    if (this.state.started) {
      throw new ServerError(JOIN_REFUSAL_CODES.started, "this match has already started");
    }

    const parsed = joinOptions.safeParse(options ?? {});
    const version = parsed.success ? parsed.data.protocolVersion : undefined;

    if (version !== undefined && version !== PROTOCOL_VERSION) {
      throw new ServerError(JOIN_REFUSAL_CODES.outdated, "this client is out of date");
    }

    const name = parsed.success ? parsed.data.name : undefined;
    const seat = claimBotSeat(this.seats, client.sessionId, name);

    if (seat === null) {
      throw new ServerError(JOIN_REFUSAL_CODES.full, "every seat is taken");
    }

    if (this.state.hostPlayerId === "") {
      this.state.hostPlayerId = seat.playerId;
    }

    if (this.solo) {
      this.start(client);

      return;
    }

    this.publish();
  }

  override onDispose() {
    this.driver?.stop();
  }

  override onDrop(client: MatchClient, _code: CloseCode) {
    const seat = seatForSession(this.seats, client.sessionId);

    if (seat !== null) {
      seat.connected = false;

      if (!this.state.started) {
        this.reassignHost();
      }

      this.publish();
      this.endHoldIfEveryoneWatched();
    }

    this.allowReconnection(client, this.timings.reconnectGraceSeconds).catch(() => {});
  }

  override onReconnect(client: MatchClient) {
    const seat = seatForSession(this.seats, client.sessionId);

    if (seat === null) {
      return;
    }

    seat.connected = true;
    seat.lastViewKey = "";
    this.publish();
  }

  override onLeave(client: MatchClient, _code: CloseCode) {
    const seat = seatForSession(this.seats, client.sessionId);

    if (seat === null) {
      return;
    }

    if (!this.state.started) {
      releaseToBot(seat, this.botLabel);
      this.reassignHost();
      this.publish();

      return;
    }

    seat.connected = false;
    seat.sessionId = null;

    if (this.run !== null) {
      this.run = forfeitSeat(this.run, seat.playerId);
      this.advance();
    }

    this.publish();
    this.endHoldIfEveryoneWatched();
  }

  playerIdFor(sessionId: string): string | null {
    return seatForSession(this.seats, sessionId)?.playerId ?? null;
  }

  currentRun(): RunState | null {
    return this.run;
  }

  private reassignHost(): void {
    const humans = humanSeats(this.seats);
    const hostPresent = humans.some((seat) => seat.connected && seat.playerId === this.state.hostPlayerId);

    if (hostPresent) {
      return;
    }

    const next = humans.find((seat) => seat.connected) ?? humans[0];
    this.state.hostPlayerId = next?.playerId ?? "";
  }

  private start(client: MatchClient): void {
    const seat = seatForSession(this.seats, client.sessionId);

    if (this.state.started || seat === null || seat.playerId !== this.state.hostPlayerId) {
      return;
    }

    const botKind: ControllerKind = this.jev.kind === "provider" ? "jev" : "random-bot";

    const specs: SeatSpec[] = this.seats.map((slot) => ({
      playerId: slot.playerId,
      displayName: slot.displayName,
      controllerKind: slot.controller === "human" ? "human" : botKind,
    }));

    this.state.started = true;
    this.setPrivate(true).catch(() => {});
    this.run = createRun(this.roomId, Math.floor(Math.random() * 2 ** 31), specs, matchRules());

    if (this.jev.kind === "provider") {
      this.driver = createJevDriver({
        provider: this.jev.provider,
        catalogue,
        playerIds: specs.flatMap((spec) => (spec.controllerKind === "jev" ? [spec.playerId] : [])),
        onOutcome: (outcome) => this.onJevOutcome(outcome),
        now: () => Date.now(),
      });
    }

    this.enterPhase(this.run);
    this.advance();
    this.publish();
  }

  private enterPhase(run: RunState): void {
    const now = Date.now();
    this.phaseStartedAt = now;
    this.holdUntil = null;
    this.deadlineAt = null;

    if (run.phase === "round-result" && run.currentRound !== null) {
      this.holdUntil = now + roundHoldSeconds(run.currentRound) * 1000 * this.timings.roundHoldScale;

      return;
    }

    const seconds = phaseSeconds(this.timings, run);

    if (seconds !== null) {
      this.deadlineAt = now + seconds * 1000;
    }
  }

  private advance(): void {
    let run = this.run;

    if (run === null) {
      return;
    }

    for (let step = 0; step < MAX_ADVANCE_STEPS; step += 1) {
      run = runBotCommands(run, catalogue);

      if (run.phase === "round-result" && this.holdUntil !== null) {
        break;
      }

      const resolveStart = performance.now();
      const next = advanceIfReady(run, catalogue);

      if (next.phaseEpoch === run.phaseEpoch) {
        run = next;
        break;
      }

      if (next.phase === "battle") {
        this.metrics.lastResolveMilliseconds = performance.now() - resolveStart;
      }

      run = next;
      this.enterPhase(run);
    }

    this.run = run;
    this.driver?.sync(run, this.deadlineAt);
  }

  private endHoldIfEveryoneWatched(): void {
    const run = this.run;

    if (run === null || run.phase !== "round-result" || this.holdUntil === null) {
      return;
    }

    const watchers = humanSeats(this.seats).filter((seat) => seat.connected && seat.sessionId !== null);

    if (watchers.length === 0 || watchers.some((seat) => seat.watchedEpoch !== run.phaseEpoch)) {
      return;
    }

    this.holdUntil = null;
    this.advance();
    this.publish();
  }

  private onJevOutcome(outcome: DriverOutcome): void {
    if (this.run === null) {
      return;
    }

    this.jevRecords.push(...outcome.records);

    for (const record of outcome.records) {
      if (record.source === "fallback" && record.fallbackReason !== "superseded") {
        console.warn(`[jev] ${this.roomId} ${record.playerId} ${record.kind} fell back: ${record.fallbackReason ?? "unknown"}`);
      }
    }

    const applied = applyJevOutcome(this.run, outcome, catalogue);

    if (applied.verdict === "applied") {
      this.run = applied.state;
    } else if (applied.verdict === "rejected" || applied.verdict === "no-command") {
      this.run = runFallbackCommands(this.run, [outcome.playerId], catalogue);
    }

    this.advance();
    this.publish();
  }

  private onClock(): void {
    const run = this.run;

    if (run === null) {
      return;
    }

    const now = Date.now();
    let due = false;

    if (this.deadlineAt !== null && now >= this.deadlineAt) {
      this.run = runFallbackCommands(run, Object.keys(run.players), catalogue);
      this.deadlineAt = null;
      due = true;
    }

    if (this.holdUntil !== null && now >= this.holdUntil) {
      this.holdUntil = null;
      due = true;
    }

    if (!due) {
      return;
    }

    const epochBefore = this.run?.phaseEpoch ?? -1;
    this.advance();

    if (this.run !== null && this.run.phaseEpoch === epochBefore && this.deadlineAt === null && this.holdUntil === null) {
      const seconds = phaseSeconds(this.timings, this.run);

      if (seconds !== null) {
        this.deadlineAt = now + DEADLINE_RETRY_MILLISECONDS;
      }
    }

    this.publish();
  }

  private syncLobby(): void {
    this.state.phase = this.run?.phase ?? "lobby";
    this.state.phaseEpoch = this.run?.phaseEpoch ?? 0;
    this.state.deadlineAt = this.publishedDeadline() ?? 0;

    while (this.state.seats.length < this.seats.length) {
      this.state.seats.push(
        new LobbySeat({ playerId: "", sessionId: "", displayName: "", controller: "bot", connected: false }),
      );
    }

    this.seats.forEach((seat, index) => {
      const wire = this.state.seats[index];

      if (wire === undefined) {
        return;
      }

      wire.playerId = seat.playerId;
      wire.sessionId = seat.sessionId ?? "";
      wire.displayName = seat.displayName;
      wire.controller = seat.controller;
      wire.connected = seat.controller === "bot" || seat.connected;
      wire.thinking = this.driver?.activity(seat.playerId) === "thinking";
    });
  }

  private publishedDeadline(): number | null {
    return this.deadlineAt ?? this.holdUntil;
  }

  private sendView(client: MatchClient, seat: SeatSlot, force: boolean): void {
    const view = this.run === null ? null : getPlayerView(this.run, seat.playerId);

    if (view === null) {
      return;
    }

    const deadlineAt = this.publishedDeadline();
    const key = JSON.stringify([view, this.phaseStartedAt, deadlineAt]);

    if (!force && key === seat.lastViewKey) {
      return;
    }

    seat.lastViewKey = key;

    const message: ViewMessage = { view, phaseStartedAt: this.phaseStartedAt, deadlineAt, serverNow: Date.now() };
    this.metrics.lastViewBytes = JSON.stringify(message).length;
    this.metrics.viewsSent += 1;
    client.send(SERVER_MESSAGES.view, message);
  }

  private publish(): void {
    this.syncLobby();

    for (const seat of humanSeats(this.seats)) {
      const client = seat.sessionId === null || !seat.connected ? undefined : this.clients.getById(seat.sessionId);

      if (client !== undefined) {
        this.sendView(client, seat, false);
      }
    }
  }
}
