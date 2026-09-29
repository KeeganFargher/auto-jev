import assert from "node:assert";
import { ColyseusTestServer, boot } from "@colyseus/testing";
import type { Room as ClientRoom } from "@colyseus/sdk";
import appConfig, {
  configureJevProvider,
  configureMatchTimings,
  DEFAULT_MATCH_TIMINGS,
  type MatchRoom,
  type MatchTimings,
} from "@jev-game/server-runtime";
import { providerFromEnvironment, type ProviderSelection } from "@jev-game/jev";
import {
  JOIN_REFUSAL_CODES,
  PROTOCOL_VERSION,
  SIM_HASH,
  type AckMessage,
  type CommandIntent,
  type JoinOptions,
  type ViewMessage,
} from "@jev-game/protocol";
import {
  requireSeat,
  type PlayerSeat,
  type PlayerView,
  type PublicSeat,
  type RunState,
} from "@jev-game/run";

const BASELINE_BOTS: ProviderSelection = {
  kind: "none",
  reason: "the tests use baseline bots",
};

const FAST_TIMINGS: MatchTimings = {
  draftSeconds: 1.5,
  preparingSeconds: 0.3,
  reconnectGraceSeconds: 0.5,
  roundHoldScale: 0.01,
  clockMilliseconds: 20,
};

const JOIN: JoinOptions = { protocolVersion: PROTOCOL_VERSION, simHash: SIM_HASH };

const SOLO: JoinOptions = { ...JOIN, solo: true };

interface Human {
  room: ClientRoom;
  playerId: string;
  view: PlayerView | null;
  views: ViewMessage[];
  acks: Map<string, AckMessage>;
  sent: number;
}

function named(name: string): JoinOptions {
  return { ...JOIN, name };
}

function at<T>(items: readonly T[], index: number): T {
  const item = items[index];

  if (item === undefined) {
    throw new Error(`Nothing at index ${index} of ${items.length}`);
  }

  return item;
}

function viewOf(human: Human): PlayerView {
  if (human.view === null) {
    throw new Error(`${human.playerId} has not been sent a view`);
  }

  return human.view;
}

function runOf(room: MatchRoom): RunState {
  const run = room.currentRun();

  if (run === null) {
    throw new Error(`Room ${room.roomId} has not started`);
  }

  return run;
}

function seatOf(room: MatchRoom, playerId: string): PlayerSeat {
  return requireSeat(runOf(room), playerId);
}

function publicSeat(view: PlayerView, playerId: string): PublicSeat {
  const seat = view.players[playerId];

  if (seat === undefined) {
    throw new Error(`${view.you.playerId} cannot see a seat for ${playerId}`);
  }

  return seat;
}

function humanCount(room: MatchRoom): number {
  return room.state.seats.filter((seat) => seat.controller === "human").length;
}

function track(server: MatchRoom, room: ClientRoom): Human {
  const playerId = server.playerIdFor(room.sessionId);

  if (playerId === null) {
    throw new Error(`Session ${room.sessionId} has no seat in room ${server.roomId}`);
  }

  const human: Human = { room, playerId, view: null, views: [], acks: new Map(), sent: 0 };

  room.onMessage("view", (message: ViewMessage) => {
    human.view = message.view;
    human.views.push(message);
  });

  room.onMessage("ack", (message: AckMessage) => human.acks.set(message.commandId, message));
  room.send("sync", {});

  return human;
}

async function until(check: () => boolean, timeoutMs = 8000): Promise<void> {
  const started = Date.now();

  while (!check()) {
    if (Date.now() - started > timeoutMs) {
      throw new Error("timed out waiting for condition");
    }

    await new Promise((resolve) => setTimeout(resolve, 10));
  }
}

async function pause(milliseconds: number): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, milliseconds));
}

async function sendRaw(
  human: Human,
  commandId: string,
  phaseEpoch: number,
  expectedRevision: number,
  intent: CommandIntent,
): Promise<AckMessage> {
  human.room.send("command", {
    commandId,
    runId: viewOf(human).runId,
    phaseEpoch,
    expectedRevision,
    intent,
  });

  await until(() => human.acks.has(commandId));
  const ack = human.acks.get(commandId);

  if (ack === undefined) {
    throw new Error(`No ack for ${commandId}`);
  }

  return ack;
}

async function send(human: Human, intent: CommandIntent): Promise<AckMessage> {
  const view = viewOf(human);
  human.sent += 1;

  return sendRaw(
    human,
    `${human.playerId}-${human.sent}`,
    view.phaseEpoch,
    view.you.decisionRevision,
    intent,
  );
}

function rejection(ack: AckMessage): [boolean, string | null] {
  return [ack.accepted, ack.reason];
}

describe("online match room", function () {
  this.timeout(60000);

  let colyseus: ColyseusTestServer<typeof appConfig>;

  before(async () => {
    configureJevProvider(BASELINE_BOTS);
    configureMatchTimings(FAST_TIMINGS);
    colyseus = await boot(appConfig);
  });

  after(async () => {
    await colyseus.shutdown();
    configureMatchTimings(DEFAULT_MATCH_TIMINGS);
  });

  beforeEach(async () => {
    await colyseus.cleanup();
  });

  it("turns away a client that speaks another protocol or simulates battles differently", async () => {
    const room = await colyseus.createRoom<MatchRoom>("match", {});
    const outdated = { code: JOIN_REFUSAL_CODES.outdated };
    track(room, await colyseus.connectTo(room, JOIN));

    await assert.rejects(
      colyseus.connectTo(room, { ...JOIN, protocolVersion: PROTOCOL_VERSION - 1 }),
      outdated,
    );
    await assert.rejects(colyseus.connectTo(room, { ...JOIN, simHash: "0".repeat(64) }), outdated);
    await assert.rejects(colyseus.connectTo(room, { name: "Old client" }), outdated);
    assert.strictEqual(humanCount(room), 1);
    assert.strictEqual(room.clients.length, 1);
  });

  it("gives simultaneous joiners different seats, the first becomes host, bots hold the rest", async () => {
    const room = await colyseus.createRoom<MatchRoom>("match", {});

    const [first, second] = await Promise.all([
      colyseus.connectTo(room, named("Ada")),
      colyseus.connectTo(room, named("Bea")),
    ]);

    const humans = [track(room, first), track(room, second)];

    assert.notStrictEqual(at(humans, 0).playerId, at(humans, 1).playerId);
    assert.ok(humans.some((human) => human.playerId === room.state.hostPlayerId));
    assert.strictEqual(humanCount(room), 2);
    assert.strictEqual(room.state.seats.filter((seat) => seat.controller === "bot").length, 6);
  });

  it("locks the roster at start: no joining by id, and matchmaking opens a fresh room", async () => {
    const room = await colyseus.createRoom<MatchRoom>("match", {});
    const host = track(room, await colyseus.connectTo(room, JOIN));
    host.room.send("start", {});
    await until(() => host.view !== null);

    await assert.rejects(colyseus.sdk.joinById(room.roomId, JOIN), {
      code: JOIN_REFUSAL_CODES.started,
    });

    const other = await colyseus.sdk.joinOrCreate("match", JOIN);
    assert.notStrictEqual(other.roomId, room.roomId);
    await other.leave();
  });

  it("only the host can start", async () => {
    const room = await colyseus.createRoom<MatchRoom>("match", {});
    const host = track(room, await colyseus.connectTo(room, JOIN));
    const guest = track(room, await colyseus.connectTo(room, JOIN));

    guest.room.send("start", {});
    await pause(100);
    assert.strictEqual(room.state.started, false);

    host.room.send("start", {});
    await until(() => room.state.started);
  });

  it("drafts from one shared pool, shows only public seats and changes only the sender's seat", async () => {
    const room = await colyseus.createRoom<MatchRoom>("match", {});
    const alice = track(room, await colyseus.connectTo(room, JOIN));
    const bob = track(room, await colyseus.connectTo(room, JOIN));
    alice.room.send("start", {});
    await until(() => alice.view?.phase === "draft" && bob.view?.phase === "draft");

    const pool = viewOf(alice).draftPool;
    assert.deepStrictEqual(viewOf(bob).draftPool, pool);
    assert.strictEqual(pool.length, 5);
    assert.ok(!pool.includes("training-dummy"), "the training dummy is not draftable");
    assert.deepStrictEqual(Object.keys(publicSeat(viewOf(alice), bob.playerId)).sort(), [
      "controllerKind",
      "displayName",
      "eliminated",
      "playerId",
      "runHealth",
    ]);

    const team = pool.slice(0, 3);
    assert.strictEqual((await send(alice, { kind: "commit-draft", heroIds: team })).accepted, true);
    assert.strictEqual((await send(bob, { kind: "commit-draft", heroIds: team })).accepted, true);
    await until(
      () => viewOf(alice).you.heroIds.length === 3 && viewOf(bob).you.heroIds.length === 3,
    );
    assert.deepStrictEqual(viewOf(alice).you.heroIds, team);
    assert.deepStrictEqual(seatOf(room, bob.playerId).heroIds, team);
  });

  it("drafts the heroes a player selected but never confirmed when the draft runs out", async () => {
    const room = await colyseus.createRoom<MatchRoom>("match", { solo: true });
    const solo = track(room, await colyseus.connectTo(room, SOLO));
    await until(() => solo.view?.phase === "draft");

    const pool = viewOf(solo).draftPool;
    const selected = [at(pool, 3), at(pool, 0), at(pool, 2)];
    const selection = send(solo, { kind: "select-heroes", heroIds: selected });
    await until(() => viewOf(solo).you.heroIds.length === 3, 5000);

    assert.deepStrictEqual(viewOf(solo).you.heroIds, selected);
    assert.strictEqual((await selection).accepted, true);
  });

  it("fills a partial selection with random heroes from the pool when the draft runs out", async () => {
    const room = await colyseus.createRoom<MatchRoom>("match", { solo: true });
    const solo = track(room, await colyseus.connectTo(room, SOLO));
    await until(() => solo.view?.phase === "draft");

    const pool = viewOf(solo).draftPool;
    const selection = send(solo, { kind: "select-heroes", heroIds: [at(pool, 4)] });
    await until(() => viewOf(solo).you.heroIds.length === 3, 5000);

    const team = viewOf(solo).you.heroIds;
    assert.strictEqual(team[0], at(pool, 4));
    assert.strictEqual(new Set(team).size, 3);
    assert.ok(team.every((heroId) => pool.includes(heroId)));
    assert.strictEqual((await selection).accepted, true);
  });

  it("keeps a selection open and private until the player confirms", async () => {
    const room = await colyseus.createRoom<MatchRoom>("match", {});
    const alice = track(room, await colyseus.connectTo(room, JOIN));
    const bob = track(room, await colyseus.connectTo(room, JOIN));
    alice.room.send("start", {});
    await until(() => alice.view?.phase === "draft" && bob.view?.phase === "draft");

    const pool = viewOf(alice).draftPool;
    const epoch = viewOf(alice).phaseEpoch;
    const bobViewsBefore = bob.views.length;

    assert.strictEqual(
      (await send(alice, { kind: "select-heroes", heroIds: pool.slice(0, 3) })).accepted,
      true,
    );
    await until(() => viewOf(alice).draftSelection.length === 3);
    assert.strictEqual(viewOf(alice).you.ready, false);
    assert.strictEqual(runOf(room).phase, "draft");

    const changed = [at(pool, 4), at(pool, 1)];
    assert.strictEqual(
      (await send(alice, { kind: "select-heroes", heroIds: changed })).accepted,
      true,
    );
    await until(() => viewOf(alice).draftSelection.join() === changed.join());

    const tooMany = await send(alice, { kind: "select-heroes", heroIds: pool.slice(0, 4) });
    assert.deepStrictEqual(rejection(tooMany), [false, "invalid-pick-count"]);
    const twice = await send(alice, { kind: "select-heroes", heroIds: [at(pool, 0), at(pool, 0)] });
    assert.deepStrictEqual(rejection(twice), [false, "duplicate-hero"]);
    const dummy = await send(alice, { kind: "select-heroes", heroIds: ["training-dummy"] });
    assert.deepStrictEqual(rejection(dummy), [false, "unknown-hero"]);

    assert.strictEqual(
      (await send(alice, { kind: "commit-draft", heroIds: pool.slice(0, 3) })).accepted,
      true,
    );
    await until(() => viewOf(alice).you.ready);
    const late = await send(alice, { kind: "select-heroes", heroIds: changed });
    assert.deepStrictEqual(rejection(late), [false, "already-decided"]);

    assert.deepStrictEqual(viewOf(bob).draftSelection, []);
    assert.strictEqual(
      bob.views.slice(bobViewsBefore).filter((message) => message.view.phaseEpoch === epoch).length,
      0,
    );
  });

  it("returns the original result for a duplicate command and rejects stale ones", async () => {
    const room = await colyseus.createRoom<MatchRoom>("match", {});
    const alice = track(room, await colyseus.connectTo(room, JOIN));
    track(room, await colyseus.connectTo(room, JOIN));
    alice.room.send("start", {});
    await until(() => alice.view?.phase === "draft");

    const team = viewOf(alice).draftPool.slice(0, 3);
    const epoch = viewOf(alice).phaseEpoch;
    const revision = viewOf(alice).you.decisionRevision;
    const draft: CommandIntent = { kind: "commit-draft", heroIds: team };
    const first = await sendRaw(alice, "dup-1", epoch, revision, draft);
    assert.strictEqual(first.accepted, true);

    alice.acks.delete("dup-1");
    const repeat = await sendRaw(alice, "dup-1", epoch, revision, draft);
    assert.deepStrictEqual(repeat, first);

    const staleEpoch = await sendRaw(alice, "stale-1", epoch - 1, revision, {
      kind: "confirm-ready",
    });

    assert.deepStrictEqual(rejection(staleEpoch), [false, "stale-epoch"]);

    const staleRevision = await sendRaw(alice, "stale-2", epoch, revision, draft);
    assert.deepStrictEqual(rejection(staleRevision), [false, "stale-revision"]);
    assert.deepStrictEqual(seatOf(room, alice.playerId).heroIds, team);
  });

  it("drops malformed messages before they reach the run", async () => {
    const room = await colyseus.createRoom<MatchRoom>("match", {});
    const alice = track(room, await colyseus.connectTo(room, JOIN));
    alice.room.send("start", {});
    await until(() => alice.view?.phase === "draft");
    const before = runOf(room);

    alice.room.send("command", {
      commandId: "evil",
      runId: before.runId,
      phaseEpoch: before.phaseEpoch,
      expectedRevision: 0,
      intent: { kind: "commit-draft", heroIds: "all" },
    });
    alice.room.send("command", {
      playerId: "seat-2",
      commandId: "evil-2",
      runId: before.runId,
      phaseEpoch: before.phaseEpoch,
      expectedRevision: 0,
      intent: { kind: "win-battle" },
    });
    await pause(100);

    assert.strictEqual(alice.acks.size, 0);
    assert.strictEqual(seatOf(room, alice.playerId).heroIds.length, 0);
    assert.strictEqual(runOf(room).phaseEpoch, before.phaseEpoch);
    assert.ok(
      room.clients.some((client) => client.sessionId === alice.room.sessionId),
      "the sender stays connected",
    );
    assert.strictEqual(seatOf(room, alice.playerId).forfeited, false);
  });

  it("keeps a dropped seat through a reconnect and restores the same player", async () => {
    const room = await colyseus.createRoom<MatchRoom>("match", {});
    const alice = track(room, await colyseus.connectTo(room, JOIN));
    alice.room.send("start", {});
    await until(() => alice.view?.phase === "draft");
    const team = viewOf(alice).draftPool.slice(0, 3);
    assert.strictEqual((await send(alice, { kind: "commit-draft", heroIds: team })).accepted, true);

    const token = alice.room.reconnectionToken;
    const playerId = alice.playerId;
    alice.room.reconnection.enabled = false;
    alice.room.connection.close();
    await until(() =>
      room.state.seats.some((seat) => seat.playerId === playerId && !seat.connected),
    );

    const again = track(room, await colyseus.sdk.reconnect(token));
    await until(() => again.view !== null);
    assert.strictEqual(again.playerId, playerId);
    assert.deepStrictEqual(viewOf(again).you.heroIds, team);
    assert.strictEqual(humanCount(room), 1);
  });

  it("forfeits a seat whose grace runs out and eliminates it at the next settlement", async () => {
    const room = await colyseus.createRoom<MatchRoom>("match", {});
    const alice = track(room, await colyseus.connectTo(room, JOIN));
    const bob = track(room, await colyseus.connectTo(room, JOIN));
    alice.room.send("start", {});
    await until(() => alice.view?.phase === "draft");

    const bobId = bob.playerId;
    bob.room.reconnection.enabled = false;
    bob.room.connection.close();
    await until(() => seatOf(room, bobId).forfeited, 5000);
    await until(() => alice.view?.phase === "preparing", 10000);

    const round = viewOf(alice).currentRound;
    assert.ok(round !== null, "preparing has a round");
    assert.ok(
      round.pairings.every(
        (pairing) => pairing.teamAPlayerId !== bobId && pairing.teamBPlayerId !== bobId,
      ),
      "a forfeited seat is not paired again",
    );

    await until(() => seatOf(room, bobId).eliminated, 10000);
    assert.strictEqual(seatOf(room, bobId).runHealth, 0);
    await until(() => publicSeat(viewOf(alice), bobId).eliminated);
  });

  it("runs two humans and six bots to the end, everyone agreeing on the standings", async () => {
    const room = await colyseus.createRoom<MatchRoom>("match", {});
    const alice = track(room, await colyseus.connectTo(room, JOIN));
    const bob = track(room, await colyseus.connectTo(room, JOIN));
    alice.room.send("start", {});

    const memoryBefore = process.memoryUsage().heapUsed;
    await until(() => alice.view?.phase === "finished" && bob.view?.phase === "finished", 40000);

    const standings = (human: Human): string =>
      JSON.stringify(
        Object.values(viewOf(human).players).map((seat) => [
          seat.playerId,
          seat.runHealth,
          seat.eliminated,
        ]),
      );

    const settled = (human: Human): string[][] =>
      human.views.flatMap((message) =>
        message.view.phase === "round-result" && message.view.currentRound !== null
          ? [message.view.currentRound.battles.map((battle) => battle.digest)]
          : [],
      );

    assert.strictEqual(standings(alice), standings(bob));
    assert.deepStrictEqual(viewOf(alice).winnerPlayerIds, viewOf(bob).winnerPlayerIds);
    assert.ok((viewOf(alice).winnerPlayerIds ?? []).length > 0);
    assert.ok(settled(alice).length > 0);
    assert.deepStrictEqual(settled(alice), settled(bob));

    console.log(
      `      four-battle resolve ${room.metrics.lastResolveMilliseconds.toFixed(1)} ms, view message ${room.metrics.lastViewBytes} bytes, heap +${((process.memoryUsage().heapUsed - memoryBefore) / 1024 / 1024).toFixed(1)} MB`,
    );
  });

  it("starts a solo room on join and lets seven Jev seats draft through the driver", async () => {
    configureJevProvider(providerFromEnvironment({ JEV_PROVIDER: "offline" }));

    try {
      const room = await colyseus.createRoom<MatchRoom>("match", { solo: true });
      const solo = track(room, await colyseus.connectTo(room, SOLO));
      await until(() => room.state.started && solo.view?.phase === "draft");

      const others = Object.values(viewOf(solo).players).filter(
        (seat) => seat.playerId !== solo.playerId,
      );

      assert.strictEqual(others.length, 7);
      assert.ok(
        others.every(
          (seat) => seat.controllerKind === "jev" && seat.displayName.startsWith("Stub "),
        ),
      );

      await until(() => solo.view?.phase === "finished", 45000);

      for (const seat of others) {
        const picks = room.jevRecords.flatMap((record) =>
          record.playerId === seat.playerId ? [record.pick] : [],
        );

        assert.deepStrictEqual([...new Set(picks)].sort(), [1, 2, 3], seat.playerId);
        assert.strictEqual(seatOf(room, seat.playerId).heroIds.length, 3);
      }

      const answered = room.jevRecords.filter((record) => record.source === "offline");
      assert.ok(answered.length > 0);
      assert.ok(room.jevRecords.every((record) => record.source !== "jev"));
      assert.ok((viewOf(solo).winnerPlayerIds ?? []).length > 0);

      const fallbacks = new Map<string, number>();

      for (const record of room.jevRecords) {
        if (record.fallbackReason !== null) {
          fallbacks.set(record.fallbackReason, (fallbacks.get(record.fallbackReason) ?? 0) + 1);
        }
      }

      console.log(
        `      ${room.jevRecords.length} Jev draft picks, ${answered.length} answered by the offline stub, fallbacks ${JSON.stringify(Object.fromEntries(fallbacks))}`,
      );
    } finally {
      configureJevProvider(BASELINE_BOTS);
    }
  });

  it("ends the round hold as soon as every connected human has watched", async () => {
    configureMatchTimings({ ...FAST_TIMINGS, roundHoldScale: 1 });

    try {
      const soloRoom = await colyseus.createRoom<MatchRoom>("match", { solo: true });
      const solo = track(soloRoom, await colyseus.connectTo(soloRoom, SOLO));
      await until(() => solo.view?.phase === "round-result", 15000);
      const soloEpoch = viewOf(solo).phaseEpoch;
      const watchedAt = Date.now();
      solo.room.send("watched", { phaseEpoch: soloEpoch });
      await until(() => viewOf(solo).phaseEpoch > soloEpoch, 3000);
      assert.ok(Date.now() - watchedAt < 1500, "the solo hold ended right after watching");

      const pairRoom = await colyseus.createRoom<MatchRoom>("match", {});
      const alice = track(pairRoom, await colyseus.connectTo(pairRoom, JOIN));
      const bob = track(pairRoom, await colyseus.connectTo(pairRoom, JOIN));
      alice.room.send("start", {});
      await until(
        () => alice.view?.phase === "round-result" && bob.view?.phase === "round-result",
        15000,
      );
      const pairEpoch = viewOf(alice).phaseEpoch;
      alice.room.send("watched", { phaseEpoch: pairEpoch });
      await pause(600);
      assert.strictEqual(
        runOf(pairRoom).phase,
        "round-result",
        "one human watching does not end a shared hold",
      );

      bob.room.send("watched", { phaseEpoch: pairEpoch });
      await until(() => runOf(pairRoom).phase !== "round-result", 3000);
    } finally {
      configureMatchTimings(FAST_TIMINGS);
    }
  });

  it("seats eight humans in the same room and run, and turns a ninth away", async () => {
    const room = await colyseus.createRoom<MatchRoom>("match", {});
    const humans: Human[] = [];

    for (let index = 0; index < 8; index += 1) {
      humans.push(track(room, await colyseus.connectTo(room, named(`P${index + 1}`))));
    }

    await assert.rejects(colyseus.connectTo(room, JOIN));
    assert.strictEqual(humanCount(room), 8);

    at(humans, 0).room.send("start", {});
    await until(() => humans.every((human) => human.view?.phase === "draft"));
    const kinds = Object.values(runOf(room).players).map((seat) => seat.controllerKind);
    assert.deepStrictEqual([...new Set(kinds)], ["human"]);
  });

  it("measures two full rooms running at once", async () => {
    const heapBefore = process.memoryUsage().heapUsed;
    const started = Date.now();

    const rooms = await Promise.all([
      colyseus.createRoom<MatchRoom>("match", {}),
      colyseus.createRoom<MatchRoom>("match", {}),
    ]);

    const humans: Human[] = [];

    for (const room of rooms) {
      humans.push(track(room, await colyseus.connectTo(room, JOIN)));
      humans.push(track(room, await colyseus.connectTo(room, JOIN)));
    }

    at(humans, 0).room.send("start", {});
    at(humans, 2).room.send("start", {});
    await until(() => humans.every((human) => human.view?.phase === "finished"), 40000);

    const heapAfter = process.memoryUsage().heapUsed;

    const largest = Math.max(
      ...humans.flatMap((human) => human.views.map((message) => JSON.stringify(message).length)),
    );

    const resolves = rooms.map((room) => room.metrics.lastResolveMilliseconds.toFixed(1));

    console.log(
      `      two rooms: ${((Date.now() - started) / 1000).toFixed(1)} s wall, resolves ${resolves.join(" / ")} ms, largest view ${largest} bytes, heap +${((heapAfter - heapBefore) / 1024 / 1024).toFixed(1)} MB`,
    );
  });

  it("hands the host role over as soon as the host drops in the lobby", async () => {
    const room = await colyseus.createRoom<MatchRoom>("match", {});
    const host = track(room, await colyseus.connectTo(room, JOIN));
    const guest = track(room, await colyseus.connectTo(room, JOIN));
    assert.strictEqual(room.state.hostPlayerId, host.playerId);

    host.room.reconnection.enabled = false;
    host.room.connection.close();
    await until(() => room.state.hostPlayerId === guest.playerId, 2000);

    guest.room.send("start", {});
    await until(() => room.state.started, 2000);
  });

  it("sends a placement only to the player who made it", async () => {
    const room = await colyseus.createRoom<MatchRoom>("match", {});
    const alice = track(room, await colyseus.connectTo(room, JOIN));
    const bob = track(room, await colyseus.connectTo(room, JOIN));
    alice.room.send("start", {});
    await until(() => alice.view?.phase === "draft" && bob.view?.phase === "draft");

    for (const human of [alice, bob]) {
      const team = viewOf(human).draftPool.slice(0, 3);
      assert.strictEqual(
        (await send(human, { kind: "commit-draft", heroIds: team })).accepted,
        true,
      );
    }

    await until(() => alice.view?.phase === "preparing" && bob.view?.phase === "preparing");
    const epoch = viewOf(bob).phaseEpoch;
    const bobViewsBefore = bob.views.length;
    const own = viewOf(alice).you.formation.map((cell) => ({ ...cell }));

    const moved = own.map((cell, index) =>
      index === 0 ? { column: cell.column === 0 ? 1 : 0, row: 3 } : cell,
    );

    for (let index = 0; index < 20; index += 1) {
      const formation = index % 2 === 0 ? moved : own;
      assert.strictEqual((await send(alice, { kind: "place-heroes", formation })).accepted, true);
    }

    await pause(100);

    const samePhase = bob.views
      .slice(bobViewsBefore)
      .filter((message) => message.view.phaseEpoch === epoch);

    assert.strictEqual(samePhase.length, 0);
  });
});
