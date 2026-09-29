import { Room, ServerError, type Client, type CloseCode } from "colyseus";
import { gameCatalogue, validateCatalogue } from "@jev-game/content";
import {
  applyJevOutcome,
  createJevDriver,
  SUPERSEDED,
  type DecisionRecord,
  type DriverOutcome,
  type JevDriver,
} from "@jev-game/jev";
import {
  advanceIfReady,
  createRun,
  forfeitSeat,
  getPlayerView,
  requireRound,
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
  createOptions,
  JOIN_REFUSAL_CODES,
  joinOptions,
  PROTOCOL_VERSION,
  SERVER_MESSAGES,
  SIM_HASH,
  startMessage,
  syncMessage,
  watchedMessage,
  type CommandMessage,
  type CreateOptions,
  type JoinOptions,
  type ServerMessages,
  type StartMessage,
  type SyncMessage,
  type ViewMessage,
  type WatchedMessage,
} from "@jev-game/protocol";
import { LobbySeat, MatchState } from "./match-state.js";
import { matchRules, matchTimings, type MatchTimings } from "./match-timings.js";
import {
  claimBotSeat,
  createSeats,
  humanSeats,
  releaseToBot,
  seatForSession,
  type SeatSlot,
} from "./seat-registry.js";
import { botSeatLabel, jevProvider } from "./jev-provider.js";
import { handleCommand } from "./command-handler.js";

const SEAT_COUNT = 8;

const MAX_ADVANCE_STEPS = 64;

export interface MatchMetrics {
  lastResolveMilliseconds: number;
  lastViewBytes: number;
  viewsSent: number;
}

function phaseSeconds(timings: MatchTimings, phase: RunPhase): number | null {
  switch (phase) {
    case "draft":
      return timings.draftSeconds;

    case "preparing":
      return timings.preparingSeconds;

    case "lobby":
    case "round-result":
    case "finished":
      return null;
  }
}

function admittedOptions(options: JoinOptions): JoinOptions {
  const parsed = joinOptions.safeParse(options);

  if (!parsed.success) {
    throw new ServerError(
      JOIN_REFUSAL_CODES.outdated,
      `this client's join options do not match the server's: ${parsed.error.message}`,
    );
  }

  if (parsed.data.protocolVersion !== PROTOCOL_VERSION) {
    throw new ServerError(
      JOIN_REFUSAL_CODES.outdated,
      `this client speaks protocol ${parsed.data.protocolVersion} and the server ${PROTOCOL_VERSION}`,
    );
  }

  if (parsed.data.simHash !== SIM_HASH) {
    throw new ServerError(
      JOIN_REFUSAL_CODES.outdated,
      "this client simulates battles differently from the server",
    );
  }

  return parsed.data;
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
      const outcome = handleCommand(this.run, seat, parsed.data);
      client.send(SERVER_MESSAGES.ack, outcome.ack);

      if (outcome.next !== null) {
        this.advance(outcome.next);
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

      if (seat !== null && this.run !== null && syncMessage.safeParse(payload ?? {}).success) {
        this.sendView(client, this.run, seat, true);
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

  override onCreate(options: CreateOptions) {
    validateCatalogue(gameCatalogue);
    this.solo = createOptions.parse(options ?? {}).solo === true;

    if (this.solo) {
      void this.setPrivate(true);
    }

    this.syncLobby();
    this.clock.setInterval(() => this.onClock(), this.timings.clockMilliseconds);
  }

  override onJoin(client: MatchClient, options: JoinOptions) {
    const admitted = admittedOptions(options);

    if (this.state.started) {
      throw new ServerError(JOIN_REFUSAL_CODES.started, "this match has already started");
    }

    const seat = claimBotSeat(this.seats, client.sessionId, admitted.name);

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
      this.advance(forfeitSeat(this.run, seat.playerId));
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

    const hostPresent = humans.some(
      (seat) => seat.connected && seat.playerId === this.state.hostPlayerId,
    );

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
    void this.setPrivate(true);
    const run = createRun(this.roomId, Math.floor(Math.random() * 2 ** 31), specs, matchRules());

    if (this.jev.kind === "provider") {
      this.driver = createJevDriver({
        provider: this.jev.provider,
        playerIds: specs.flatMap((spec) => (spec.controllerKind === "jev" ? [spec.playerId] : [])),
        onOutcome: (outcome) => this.onJevOutcome(outcome),
        now: () => Date.now(),
      });
    }

    this.enterPhase(run);
    this.advance(run);
    this.publish();
  }

  private enterPhase(run: RunState): void {
    const now = Date.now();
    this.phaseStartedAt = now;
    this.holdUntil = null;
    this.deadlineAt = null;

    if (run.phase === "round-result") {
      this.holdUntil =
        now + roundHoldSeconds(requireRound(run)) * 1000 * this.timings.roundHoldScale;

      return;
    }

    const seconds = phaseSeconds(this.timings, run.phase);

    if (seconds !== null) {
      this.deadlineAt = now + seconds * 1000;
    }
  }

  private advance(start: RunState): void {
    let run = start;
    let settled = false;

    for (let step = 0; step < MAX_ADVANCE_STEPS && !settled; step += 1) {
      run = runBotCommands(run);

      if (run.phase === "round-result" && this.holdUntil !== null) {
        settled = true;
        continue;
      }

      const resolveStart = performance.now();
      const next = advanceIfReady(run);

      if (next.phaseEpoch === run.phaseEpoch) {
        run = next;
        settled = true;
        continue;
      }

      if (run.phase === "preparing") {
        this.metrics.lastResolveMilliseconds = performance.now() - resolveStart;
      }

      run = next;
      this.enterPhase(run);
    }

    if (!settled) {
      throw new Error(`Run ${run.runId} kept changing phase for ${MAX_ADVANCE_STEPS} steps`);
    }

    this.run = run;
    this.driver?.sync(run, this.deadlineAt);
  }

  private endHoldIfEveryoneWatched(): void {
    const run = this.run;

    if (run === null || run.phase !== "round-result" || this.holdUntil === null) {
      return;
    }

    const watchers = humanSeats(this.seats).filter(
      (seat) => seat.connected && seat.sessionId !== null,
    );

    if (watchers.length === 0 || watchers.some((seat) => seat.watchedEpoch !== run.phaseEpoch)) {
      return;
    }

    this.holdUntil = null;
    this.advance(run);
    this.publish();
  }

  private onJevOutcome(outcome: DriverOutcome): void {
    const run = this.run;

    if (run === null) {
      throw new Error(`Jev answered for ${outcome.playerId} before room ${this.roomId} started`);
    }

    this.jevRecords.push(...outcome.records);

    for (const record of outcome.records) {
      if (record.fallbackReason !== null && record.fallbackReason !== SUPERSEDED) {
        console.warn(
          `[jev] ${this.roomId} ${record.playerId} pick ${record.pick} fell back: ${record.fallbackReason}`,
        );
      }
    }

    this.advance(applyJevOutcome(run, outcome).state);
    this.publish();
  }

  private onClock(): void {
    const run = this.run;

    if (run === null) {
      return;
    }

    const now = Date.now();

    if (this.deadlineAt !== null && now >= this.deadlineAt) {
      this.deadlineAt = null;
      this.advance(runFallbackCommands(run, Object.keys(run.players)));

      if (this.run?.phaseEpoch === run.phaseEpoch) {
        throw new Error(`The ${run.phase} deadline of run ${run.runId} passed without moving on`);
      }

      this.publish();

      return;
    }

    if (this.holdUntil !== null && now >= this.holdUntil) {
      this.holdUntil = null;
      this.advance(run);
      this.publish();
    }
  }

  private syncLobby(): void {
    this.state.phase = this.run?.phase ?? "lobby";
    this.state.phaseEpoch = this.run?.phaseEpoch ?? 0;
    this.state.deadlineAt = this.publishedDeadline() ?? 0;

    while (this.state.seats.length < this.seats.length) {
      this.state.seats.push(
        new LobbySeat({
          playerId: "",
          sessionId: "",
          displayName: "",
          controller: "bot",
          connected: false,
        }),
      );
    }

    this.seats.forEach((seat, index) => {
      const wire = this.state.seats[index];

      if (wire === undefined) {
        throw new Error(`Lobby seat ${index} was never created`);
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

  private sendView(client: MatchClient, run: RunState, seat: SeatSlot, force: boolean): void {
    const view = getPlayerView(run, seat.playerId);
    const deadlineAt = this.publishedDeadline();
    const key = JSON.stringify([view, this.phaseStartedAt, deadlineAt]);

    if (!force && key === seat.lastViewKey) {
      return;
    }

    seat.lastViewKey = key;

    const message: ViewMessage = {
      view,
      phaseStartedAt: this.phaseStartedAt,
      deadlineAt,
      serverNow: Date.now(),
    };

    this.metrics.lastViewBytes = JSON.stringify(message).length;
    this.metrics.viewsSent += 1;
    client.send(SERVER_MESSAGES.view, message);
  }

  private publish(): void {
    this.syncLobby();
    const run = this.run;

    if (run === null) {
      return;
    }

    for (const seat of humanSeats(this.seats)) {
      const client =
        seat.sessionId === null || !seat.connected
          ? undefined
          : this.clients.getById(seat.sessionId);

      if (client !== undefined) {
        this.sendView(client, run, seat, false);
      }
    }
  }
}
