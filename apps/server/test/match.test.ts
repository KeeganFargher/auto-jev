import assert from "assert";
import { ColyseusTestServer, boot } from "@colyseus/testing";
import type { Room as ClientRoom } from "@colyseus/sdk";
import appConfig, { configureJevProvider, configureMatchTimings, DEFAULT_MATCH_TIMINGS, type MatchRoom } from "@jev-game/server-runtime";
import { providerFromEnvironment } from "@jev-game/jev";
import type { AckMessage, CommandIntent, ViewMessage } from "@jev-game/protocol";
import type { PlayerView } from "@jev-game/run";
import { WebSocket as NodeWebSocket } from "ws";

if (!("WebSocket" in globalThis)) {
  Object.assign(globalThis, { WebSocket: NodeWebSocket });
}

const BASELINE_BOTS = { kind: "none", reason: "the tests use baseline bots" } as const;

const FAST_TIMINGS = {
  draftSeconds: 1.5,
  preparingSeconds: 0.3,
  rewardSeconds: 0.3,
  milestoneRewardSeconds: 0.3,
  reconnectGraceSeconds: 0.5,
  roundHoldScale: 0.01,
  clockMilliseconds: 20,
};

interface Human {
  room: ClientRoom;
  playerId: string;
  view: PlayerView | null;
  views: ViewMessage[];
  acks: Map<string, AckMessage>;
  sent: number;
}

function track(server: MatchRoom, room: ClientRoom): Human {
  const human: Human = { room, playerId: server.playerIdFor(room.sessionId) ?? "", view: null, views: [], acks: new Map(), sent: 0 };

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

async function send(human: Human, intent: CommandIntent, overrides: { commandId?: string; phaseEpoch?: number; expectedRevision?: number } = {}): Promise<AckMessage> {
  const view = human.view;
  assert.ok(view !== null, "a view has arrived before sending a command");
  human.sent += 1;
  const commandId = overrides.commandId ?? `${human.playerId}-${human.sent}`;

  human.room.send("command", {
    commandId,
    runId: view.runId,
    phaseEpoch: overrides.phaseEpoch ?? view.phaseEpoch,
    expectedRevision: overrides.expectedRevision ?? view.you.decisionRevision,
    intent,
  });

  await until(() => human.acks.has(commandId));

  return human.acks.get(commandId)!;
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

  it("gives simultaneous joiners different seats, the first becomes host, bots hold the rest", async () => {
    const room = await colyseus.createRoom<MatchRoom>("match", {});
    const [first, second] = await Promise.all([colyseus.connectTo(room, { name: "Ada" }), colyseus.connectTo(room, { name: "Bea" })]);
    const humans = [track(room, first), track(room, second)];
    assert.ok(humans.every((human) => human.playerId !== ""));
    assert.notStrictEqual(humans[0]!.playerId, humans[1]!.playerId);
    assert.ok(humans.some((human) => human.playerId === room.state.hostPlayerId));
    assert.strictEqual(room.state.seats.filter((seat) => seat.controller === "human").length, 2);
    assert.strictEqual(room.state.seats.filter((seat) => seat.controller === "bot").length, 6);
  });

  it("locks the roster at start: no joining by id, and matchmaking opens a fresh room", async () => {
    const room = await colyseus.createRoom<MatchRoom>("match", {});
    const host = track(room, await colyseus.connectTo(room));
    host.room.send("start", {});
    await until(() => host.view !== null);

    await assert.rejects(colyseus.sdk.joinById(room.roomId, {}));

    const other = await colyseus.sdk.joinOrCreate("match", {});
    assert.notStrictEqual(other.roomId, room.roomId);
    await other.leave();
  });

  it("only the host can start", async () => {
    const room = await colyseus.createRoom<MatchRoom>("match", {});
    const host = track(room, await colyseus.connectTo(room));
    const guest = track(room, await colyseus.connectTo(room));

    guest.room.send("start", {});
    await new Promise((resolve) => setTimeout(resolve, 100));
    assert.strictEqual(room.state.started, false);

    host.room.send("start", {});
    await until(() => room.state.started);
  });

  it("each human sees only their own offers and can only change their own seat", async () => {
    const room = await colyseus.createRoom<MatchRoom>("match", {});
    const alice = track(room, await colyseus.connectTo(room));
    const bob = track(room, await colyseus.connectTo(room));
    alice.room.send("start", {});
    await until(() => alice.view?.phase === "draft" && bob.view?.phase === "draft");

    const aliceOffers = alice.view!.heroOffers.map((offer) => offer.offerId);
    const bobOffers = bob.view!.heroOffers.map((offer) => offer.offerId);
    assert.strictEqual(aliceOffers.filter((offerId) => bobOffers.includes(offerId)).length, 0);
    assert.deepStrictEqual(Object.keys(alice.view!.players[bob.playerId]!).sort(), [
      "controllerKind",
      "displayName",
      "eliminated",
      "playerId",
      "runHealth",
    ]);

    const stolen = await send(alice, { kind: "commit-draft", offerIds: bobOffers.slice(0, 3) });
    assert.deepStrictEqual([stolen.accepted, stolen.reason], [false, "unknown-offer"]);

    const own = await send(alice, { kind: "commit-draft", offerIds: aliceOffers.slice(0, 3) });
    assert.strictEqual(own.accepted, true);
    await until(() => alice.view!.you.heroBuilds.length === 3);
    assert.strictEqual(bob.view!.you.heroBuilds.length, 0);
  });

  it("drafts the heroes a player selected but never confirmed when the draft runs out", async () => {
    const room = await colyseus.createRoom<MatchRoom>("match", { solo: true });
    const solo = track(room, await colyseus.connectTo(room, { solo: true }));
    await until(() => solo.view?.phase === "draft");

    const offers = solo.view!.heroOffers;
    const selected = [offers[3]!, offers[0]!, offers[2]!];
    const selection = send(solo, { kind: "select-heroes", offerIds: selected.map((offer) => offer.offerId) });
    await until(() => solo.view!.you.heroBuilds.length === 3, 5000);

    assert.deepStrictEqual(
      solo.view!.you.heroBuilds.map((build) => build.heroId),
      selected.map((offer) => offer.heroId),
    );
    assert.strictEqual((await selection).accepted, true);
  });

  it("fills a partial selection with random offers when the draft runs out", async () => {
    const room = await colyseus.createRoom<MatchRoom>("match", { solo: true });
    const solo = track(room, await colyseus.connectTo(room, { solo: true }));
    await until(() => solo.view?.phase === "draft");

    const offers = solo.view!.heroOffers;
    const selection = send(solo, { kind: "select-heroes", offerIds: [offers[4]!.offerId] });
    await until(() => solo.view!.you.heroBuilds.length === 3, 5000);

    const team = solo.view!.you.heroBuilds.map((build) => build.heroId);
    assert.strictEqual(team[0], offers[4]!.heroId);
    assert.strictEqual(new Set(team).size, 3);
    assert.ok(team.every((heroId) => offers.some((offer) => offer.heroId === heroId)));
    assert.strictEqual((await selection).accepted, true);
  });

  it("keeps a selection open and private until the player confirms", async () => {
    const room = await colyseus.createRoom<MatchRoom>("match", {});
    const alice = track(room, await colyseus.connectTo(room));
    const bob = track(room, await colyseus.connectTo(room));
    alice.room.send("start", {});
    await until(() => alice.view?.phase === "draft" && bob.view?.phase === "draft");

    const offers = alice.view!.heroOffers.map((offer) => offer.offerId);
    const epoch = alice.view!.phaseEpoch;
    const bobViewsBefore = bob.views.length;

    assert.strictEqual((await send(alice, { kind: "select-heroes", offerIds: offers.slice(0, 3) })).accepted, true);
    await until(() => alice.view!.draftSelection.length === 3);
    assert.strictEqual(alice.view!.you.ready, false);
    assert.strictEqual(room.currentRun()!.phase, "draft");

    const changed = [offers[4]!, offers[1]!];
    assert.strictEqual((await send(alice, { kind: "select-heroes", offerIds: changed })).accepted, true);
    await until(() => alice.view!.draftSelection.join() === changed.join());

    const tooMany = await send(alice, { kind: "select-heroes", offerIds: offers.slice(0, 4) });
    assert.deepStrictEqual([tooMany.accepted, tooMany.reason], [false, "invalid-offer-count"]);
    const twice = await send(alice, { kind: "select-heroes", offerIds: [offers[0]!, offers[0]!] });
    assert.deepStrictEqual([twice.accepted, twice.reason], [false, "duplicate-offer"]);
    const stolen = await send(alice, { kind: "select-heroes", offerIds: [bob.view!.heroOffers[0]!.offerId] });
    assert.deepStrictEqual([stolen.accepted, stolen.reason], [false, "unknown-offer"]);

    assert.strictEqual((await send(alice, { kind: "commit-draft", offerIds: offers.slice(0, 3) })).accepted, true);
    await until(() => alice.view!.you.ready);
    const late = await send(alice, { kind: "select-heroes", offerIds: changed });
    assert.deepStrictEqual([late.accepted, late.reason], [false, "already-decided"]);

    assert.deepStrictEqual(bob.view!.draftSelection, []);
    assert.strictEqual(bob.views.slice(bobViewsBefore).filter((message) => message.view.phaseEpoch === epoch).length, 0);
  });

  it("returns the original result for a duplicate command and rejects stale ones", async () => {
    const room = await colyseus.createRoom<MatchRoom>("match", {});
    const alice = track(room, await colyseus.connectTo(room));
    track(room, await colyseus.connectTo(room));
    alice.room.send("start", {});
    await until(() => alice.view?.phase === "draft");

    const offers = alice.view!.heroOffers.map((offer) => offer.offerId).slice(0, 3);
    const epoch = alice.view!.phaseEpoch;
    const revision = alice.view!.you.decisionRevision;
    const first = await send(alice, { kind: "commit-draft", offerIds: offers }, { commandId: "dup-1" });
    assert.strictEqual(first.accepted, true);

    alice.acks.delete("dup-1");
    const repeat = await send(alice, { kind: "commit-draft", offerIds: offers }, { commandId: "dup-1", phaseEpoch: epoch, expectedRevision: revision });
    assert.deepStrictEqual(repeat, first);

    const staleEpoch = await send(alice, { kind: "confirm-ready" }, { phaseEpoch: epoch - 1 });
    assert.deepStrictEqual([staleEpoch.accepted, staleEpoch.reason], [false, "stale-epoch"]);

    const staleRevision = await send(alice, { kind: "commit-draft", offerIds: offers }, { phaseEpoch: epoch, expectedRevision: revision });
    assert.deepStrictEqual([staleRevision.accepted, staleRevision.reason], [false, "stale-revision"]);
    assert.strictEqual(alice.view!.you.heroBuilds.length, 3);
  });

  it("drops malformed messages before they reach the run", async () => {
    const room = await colyseus.createRoom<MatchRoom>("match", {});
    const alice = track(room, await colyseus.connectTo(room));
    alice.room.send("start", {});
    await until(() => alice.view?.phase === "draft");
    const before = room.currentRun()!;

    alice.room.send("command", { commandId: "evil", runId: before.runId, phaseEpoch: before.phaseEpoch, expectedRevision: 0, intent: { kind: "commit-draft", offerIds: "all" } });
    alice.room.send("command", { playerId: "seat-2", commandId: "evil-2", runId: before.runId, phaseEpoch: before.phaseEpoch, expectedRevision: 0, intent: { kind: "win-battle" } });
    await new Promise((resolve) => setTimeout(resolve, 100));

    assert.strictEqual(alice.acks.size, 0);
    assert.strictEqual(room.currentRun()!.players[alice.playerId]!.heroBuilds.length, 0);
    assert.strictEqual(room.currentRun()!.phaseEpoch, before.phaseEpoch);
    assert.ok(room.clients.some((client) => client.sessionId === alice.room.sessionId), "the sender stays connected");
    assert.strictEqual(room.currentRun()!.players[alice.playerId]!.forfeited, false);
  });

  it("keeps a dropped seat through a reconnect and restores the same player", async () => {
    const room = await colyseus.createRoom<MatchRoom>("match", {});
    const alice = track(room, await colyseus.connectTo(room));
    alice.room.send("start", {});
    await until(() => alice.view?.phase === "draft");
    const offers = alice.view!.heroOffers.map((offer) => offer.offerId).slice(0, 3);
    assert.strictEqual((await send(alice, { kind: "commit-draft", offerIds: offers })).accepted, true);

    const token = alice.room.reconnectionToken;
    const playerId = alice.playerId;
    alice.room.reconnection.enabled = false;
    alice.room.connection.close();
    await until(() => room.state.seats.some((seat) => seat.playerId === playerId && !seat.connected));

    const again = track(room, await colyseus.sdk.reconnect(token));
    await until(() => again.view !== null);
    assert.strictEqual(again.playerId, playerId);
    assert.strictEqual(again.view!.you.heroBuilds.length, 3);
    assert.strictEqual(room.state.seats.filter((seat) => seat.controller === "human").length, 1);
  });

  it("forfeits a seat whose grace runs out and eliminates it at the next settlement", async () => {
    const room = await colyseus.createRoom<MatchRoom>("match", {});
    const alice = track(room, await colyseus.connectTo(room));
    const bob = track(room, await colyseus.connectTo(room));
    alice.room.send("start", {});
    await until(() => alice.view?.phase === "draft");

    const bobId = bob.playerId;
    bob.room.reconnection.enabled = false;
    bob.room.connection.close();
    await until(() => room.currentRun()!.players[bobId]!.forfeited, 5000);
    await until(() => alice.view?.phase === "preparing", 10000);

    const pairedWithBob = Object.values(alice.view!.currentRound!.battles).filter(
      (battle) => battle.teamAPlayerId === bobId || battle.teamBPlayerId === bobId,
    );

    assert.strictEqual(pairedWithBob.length, 0, "a forfeited seat is not paired again");
    await until(() => room.currentRun()!.players[bobId]!.eliminated, 10000);

    assert.strictEqual(room.currentRun()!.players[bobId]!.runHealth, 0);
    await until(() => alice.view!.players[bobId]!.eliminated);
  });

  it("runs two humans and six bots to the end, everyone agreeing on the standings", async () => {
    const room = await colyseus.createRoom<MatchRoom>("match", {});
    const alice = track(room, await colyseus.connectTo(room));
    const bob = track(room, await colyseus.connectTo(room));
    alice.room.send("start", {});

    const memoryBefore = process.memoryUsage().heapUsed;
    await until(() => alice.view?.phase === "finished" && bob.view?.phase === "finished", 40000);

    const standings = (human: Human): string =>
      JSON.stringify(Object.values(human.view!.players).map((seat) => [seat.playerId, seat.runHealth, seat.eliminated]));

    assert.strictEqual(standings(alice), standings(bob));
    assert.deepStrictEqual(alice.view!.winnerPlayerIds, bob.view!.winnerPlayerIds);
    assert.ok((alice.view!.winnerPlayerIds ?? []).length > 0);

    const settledRounds = alice.views.filter((message) => message.view.phase === "round-result");
    const bobSettled = bob.views.filter((message) => message.view.phase === "round-result");
    assert.deepStrictEqual(
      settledRounds.map((message) => [message.view.currentRound?.round, Object.keys(message.view.currentRound?.battles ?? {})]),
      bobSettled.map((message) => [message.view.currentRound?.round, Object.keys(message.view.currentRound?.battles ?? {})]),
    );

    console.log(
      `      four-battle resolve ${room.metrics.lastResolveMilliseconds.toFixed(1)} ms, view message ${room.metrics.lastViewBytes} bytes, heap +${((process.memoryUsage().heapUsed - memoryBefore) / 1024 / 1024).toFixed(1)} MB`,
    );
  });
  it("starts a solo room on join and plays seven Jev seats through the driver to the end", async () => {
    configureJevProvider(providerFromEnvironment({ JEV_PROVIDER: "offline" }));

    try {
      const room = await colyseus.createRoom<MatchRoom>("match", { solo: true });
      const solo = track(room, await colyseus.connectTo(room, { solo: true }));
      await until(() => room.state.started && solo.view?.phase === "draft");

      const others = Object.values(solo.view!.players).filter((seat) => seat.playerId !== solo.playerId);
      assert.strictEqual(others.length, 7);
      assert.ok(others.every((seat) => seat.controllerKind === "jev" && seat.displayName.startsWith("Stub ")));

      await until(() => solo.view?.phase === "finished", 45000);

      const kinds = new Set(room.jevRecords.map((record) => record.kind));
      const answered = room.jevRecords.filter((record) => record.source === "offline");
      assert.ok(kinds.has("draft-pick") && kinds.has("reward"));
      assert.ok(answered.length > 0);
      assert.ok(room.jevRecords.every((record) => record.source !== "jev"));
      assert.ok((solo.view!.winnerPlayerIds ?? []).length > 0);

      const fallbacks = new Map<string, number>();

      for (const record of room.jevRecords) {
        if (record.fallbackReason !== null) {
          fallbacks.set(record.fallbackReason, (fallbacks.get(record.fallbackReason) ?? 0) + 1);
        }
      }

      console.log(
        `      ${room.jevRecords.length} Jev-seat decisions, ${answered.length} answered by the offline stub, fallbacks ${JSON.stringify(Object.fromEntries(fallbacks))}`,
      );
    } finally {
      configureJevProvider(BASELINE_BOTS);
    }
  });

  it("ends the round hold as soon as every connected human has watched", async () => {
    configureMatchTimings({ ...FAST_TIMINGS, roundHoldScale: 1 });

    try {
      const soloRoom = await colyseus.createRoom<MatchRoom>("match", { solo: true });
      const solo = track(soloRoom, await colyseus.connectTo(soloRoom, { solo: true }));
      await until(() => solo.view?.phase === "round-result", 15000);
      const soloEpoch = solo.view!.phaseEpoch;
      const watchedAt = Date.now();
      solo.room.send("watched", { phaseEpoch: soloEpoch });
      await until(() => solo.view !== null && solo.view.phaseEpoch > soloEpoch, 3000);
      assert.ok(Date.now() - watchedAt < 1500, "the solo hold ended right after watching");

      const pairRoom = await colyseus.createRoom<MatchRoom>("match", {});
      const alice = track(pairRoom, await colyseus.connectTo(pairRoom));
      const bob = track(pairRoom, await colyseus.connectTo(pairRoom));
      alice.room.send("start", {});
      await until(() => alice.view?.phase === "round-result" && bob.view?.phase === "round-result", 15000);
      const pairEpoch = alice.view!.phaseEpoch;
      alice.room.send("watched", { phaseEpoch: pairEpoch });
      await new Promise((resolve) => setTimeout(resolve, 600));
      assert.strictEqual(pairRoom.currentRun()?.phase, "round-result", "one human watching does not end a shared hold");

      bob.room.send("watched", { phaseEpoch: pairEpoch });
      await until(() => pairRoom.currentRun()?.phase !== "round-result", 3000);
    } finally {
      configureMatchTimings(FAST_TIMINGS);
    }
  });

  it("seats eight humans in the same room and run, and turns a ninth away", async () => {
    const room = await colyseus.createRoom<MatchRoom>("match", {});
    const humans: Human[] = [];

    for (let index = 0; index < 8; index += 1) {
      humans.push(track(room, await colyseus.connectTo(room, { name: `P${index + 1}` })));
    }

    await assert.rejects(colyseus.connectTo(room));
    assert.strictEqual(room.state.seats.filter((seat) => seat.controller === "human").length, 8);

    humans[0]!.room.send("start", {});
    await until(() => humans.every((human) => human.view?.phase === "draft"));
    const kinds = Object.values(room.currentRun()!.players).map((seat) => seat.controllerKind);
    assert.deepStrictEqual([...new Set(kinds)], ["human"]);
  });

  it("measures two full rooms running at once", async () => {
    const heapBefore = process.memoryUsage().heapUsed;
    const started = Date.now();
    const rooms = await Promise.all([colyseus.createRoom<MatchRoom>("match", {}), colyseus.createRoom<MatchRoom>("match", {})]);
    const humans: Human[] = [];

    for (const room of rooms) {
      humans.push(track(room, await colyseus.connectTo(room)));
      humans.push(track(room, await colyseus.connectTo(room)));
    }

    humans[0]!.room.send("start", {});
    humans[2]!.room.send("start", {});
    await until(() => humans.every((human) => human.view?.phase === "finished"), 40000);

    const heapAfter = process.memoryUsage().heapUsed;
    const largest = Math.max(...humans.flatMap((human) => human.views.map((message) => JSON.stringify(message).length)));
    const resolves = rooms.map((room) => room.metrics.lastResolveMilliseconds.toFixed(1));

    console.log(
      `      two rooms: ${((Date.now() - started) / 1000).toFixed(1)} s wall, resolves ${resolves.join(" / ")} ms, largest view ${largest} bytes, heap +${((heapAfter - heapBefore) / 1024 / 1024).toFixed(1)} MB`,
    );
  });
  it("hands the host role over as soon as the host drops in the lobby", async () => {
    const room = await colyseus.createRoom<MatchRoom>("match", {});
    const host = track(room, await colyseus.connectTo(room));
    const guest = track(room, await colyseus.connectTo(room));
    assert.strictEqual(room.state.hostPlayerId, host.playerId);

    host.room.reconnection.enabled = false;
    host.room.connection.close();
    await until(() => room.state.hostPlayerId === guest.playerId, 2000);

    guest.room.send("start", {});
    await until(() => room.state.started, 2000);
  });

  it("sends a placement only to the player who made it", async () => {
    const room = await colyseus.createRoom<MatchRoom>("match", {});
    const alice = track(room, await colyseus.connectTo(room));
    const bob = track(room, await colyseus.connectTo(room));
    alice.room.send("start", {});
    await until(() => alice.view?.phase === "draft" && bob.view?.phase === "draft");

    for (const human of [alice, bob]) {
      await send(human, { kind: "commit-draft", offerIds: human.view!.heroOffers.slice(0, 3).map((offer) => offer.offerId) });
    }

    await until(() => alice.view?.phase === "preparing" && bob.view?.phase === "preparing");
    const epoch = bob.view!.phaseEpoch;
    const bobViewsBefore = bob.views.length;
    const own = alice.view!.you.formation.map((cell) => ({ ...cell }));
    const moved = own.map((cell, index) => (index === 0 ? { column: cell.column === 0 ? 1 : 0, row: 3 } : cell));

    for (let index = 0; index < 20; index += 1) {
      assert.strictEqual((await send(alice, { kind: "place-heroes", formation: index % 2 === 0 ? moved : own })).accepted, true);
    }

    await new Promise((resolve) => setTimeout(resolve, 100));
    const samePhase = bob.views.slice(bobViewsBefore).filter((message) => message.view.phaseEpoch === epoch);
    assert.strictEqual(samePhase.length, 0);
  });
});
