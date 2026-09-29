import { strict as assert } from "node:assert";
import { test } from "node:test";
import type { MatchConnectTarget } from "../src/network/connect-room.js";
import type { MatchSession } from "../src/session/match-session.js";
import {
  LEAVE_MATCH_PROMPT,
  createMatchController,
  type MatchController,
} from "../src/features/match/state/match-controller.js";
import {
  FOURTH,
  ME,
  RIVAL,
  THIRD,
  battleBetween,
  createFakeSession,
  lobbyOf,
  resolvedRound,
  roundOf,
  seatOf,
  snapshotOf,
  viewOf,
  type FakeSession,
} from "./match-fixtures.js";

interface Harness {
  controller: MatchController;
  played: string[];
  targets: MatchConnectTarget[];
  prompts: string[];
  token: { value: string | null };
  cleared: { count: number };
  consumed: { count: number };
}

interface HarnessOptions {
  connect: (target: MatchConnectTarget) => Promise<MatchSession>;
  confirm?: boolean;
  token?: string | null;
}

function harness(options: HarnessOptions): Harness {
  const played: string[] = [];
  const targets: MatchConnectTarget[] = [];
  const prompts: string[] = [];
  const token = { value: options.token ?? null };
  const cleared = { count: 0 };
  const consumed = { count: 0 };

  const controller = createMatchController({
    audio: {
      play(id) {
        played.push(id);

        return 0;
      },
    },
    connect(target) {
      targets.push(target);

      return options.connect(target);
    },
    confirmLeave(message) {
      prompts.push(message);

      return options.confirm ?? true;
    },
    resumeToken: {
      read: () => token.value,
      clear() {
        cleared.count += 1;
        token.value = null;
      },
    },
    describeFailure: (reason) => `failed: ${reason.message}`,
    joinLink: {
      consume() {
        consumed.count += 1;
      },
    },
  });

  return { controller, played, targets, prompts, token, cleared, consumed };
}

function settle(): Promise<void> {
  return new Promise((resolve) => setImmediate(resolve));
}

const DRAFT = viewOf("draft", { phaseEpoch: 2 });

function draftSession(): FakeSession {
  return createFakeSession(snapshotOf(DRAFT));
}

function connectTo(session: FakeSession): HarnessOptions["connect"] {
  return () => Promise.resolve(session);
}

function liveOf(controller: MatchController) {
  const live = controller.state.get().live;

  if (live === null) {
    throw new Error("The controller has no live match");
  }

  return live;
}

test("starting solo shows the connecting state, then adopts the session", async () => {
  const session = draftSession();
  const { controller, targets } = harness({ connect: connectTo(session) });

  controller.startSolo();
  assert.equal(controller.state.get().connecting, true);
  assert.equal(controller.state.get().live, null);

  await settle();
  assert.deepEqual(targets, [{ kind: "solo" }]);
  assert.equal(controller.state.get().connecting, false);
  assert.equal(liveOf(controller).session, session);
});

test("a second connect while one is pending is ignored", async () => {
  const session = draftSession();
  const { controller, targets } = harness({ connect: connectTo(session) });

  controller.startSolo();
  controller.startQuick();
  await settle();

  assert.equal(targets.length, 1);
});

test("a failed connect leaves a notice and clears it on the next attempt", async () => {
  let failing = true;
  const session = draftSession();

  const { controller } = harness({
    connect: () => (failing ? Promise.reject(new Error("no server")) : Promise.resolve(session)),
  });

  controller.startQuick();
  await settle();
  assert.equal(controller.state.get().notice, "failed: no server");
  assert.equal(controller.state.get().connecting, false);
  assert.equal(controller.state.get().live, null);

  failing = false;
  controller.startQuick();
  assert.equal(controller.state.get().notice, null);
  await settle();
  assert.equal(controller.state.get().notice, null);
  assert.equal(liveOf(controller).session, session);
});

test("arriving with a saved seat resumes it and a failed resume forgets the token quietly", async () => {
  const { controller, targets, token, cleared } = harness({
    connect: () => Promise.reject(new Error("seat expired")),
    token: "seat-token",
  });

  controller.navigate(null);
  await settle();

  assert.deepEqual(targets, [{ kind: "resume", token: "seat-token" }]);
  assert.equal(cleared.count, 1);
  assert.equal(token.value, null);
  assert.equal(controller.state.get().notice, null);
});

test("arriving with nothing to join or resume stays on the menu", async () => {
  const { controller, targets } = harness({ connect: connectTo(draftSession()) });

  controller.navigate(null);
  await settle();

  assert.deepEqual(targets, []);
  assert.equal(controller.state.get().live, null);
});

test("arriving through an invite link joins that room even when a seat is saved", async () => {
  const { controller, targets } = harness({
    connect: connectTo(draftSession()),
    token: "seat-token",
  });

  controller.navigate("room-9");
  await settle();

  assert.deepEqual(targets, [{ kind: "room", roomId: "room-9" }]);
});

test("an invite link is consumed on every visit, and a plain visit leaves the address alone", async () => {
  const { controller, consumed } = harness({ connect: connectTo(draftSession()) });

  controller.navigate(null);
  assert.equal(consumed.count, 0);

  controller.navigate("room-9");
  assert.equal(consumed.count, 1);

  await settle();
  controller.navigate("room-9");
  assert.equal(consumed.count, 2);
});

test("only the first visit resumes a saved seat", async () => {
  const session = draftSession();
  const { controller, targets } = harness({ connect: connectTo(session), token: "seat-token" });

  controller.navigate(null);
  await settle();
  controller.leave();
  controller.navigate(null);
  await settle();

  assert.deepEqual(targets, [{ kind: "resume", token: "seat-token" }]);
  assert.equal(controller.state.get().live, null);
});

test("a visit through an invite link still counts as the first, so later plain visits do not resume", async () => {
  const { controller, targets } = harness({
    connect: connectTo(draftSession()),
    token: "seat-token",
  });

  controller.navigate("room-9");
  await settle();
  controller.leave();
  controller.navigate(null);
  await settle();

  assert.deepEqual(targets, [{ kind: "room", roomId: "room-9" }]);
});

test("a rejection that is not an Error is a recorded defect that frees the connection", async () => {
  const { controller } = harness({ connect: () => Promise.reject("socket exploded") });

  controller.startQuick();
  await settle();

  const state = controller.state.get();
  assert.equal(state.connecting, false);
  assert.match(state.defect?.message ?? "", /non-Error value/);
  assert.equal(state.defect?.cause, "socket exploded");
  assert.equal(state.live, null);

  controller.startQuick();
  assert.equal(controller.state.get().connecting, true);
});

test("a session that cannot be read is released, not leaked, and recorded as a defect", async () => {
  const good = draftSession();

  const broken: FakeSession = {
    ...good,
    getView() {
      throw new Error("view unreadable");
    },
  };

  const { controller } = harness({ connect: connectTo(broken) });

  controller.startSolo();
  await settle();

  const state = controller.state.get();
  assert.equal(state.connecting, false);
  assert.equal(state.live, null);
  assert.equal(state.defect?.message, "view unreadable");
  assert.equal(broken.disposals.disposed, 1);
});

test("a rejection that is not an Error also surfaces a notice and forgets a dead resume token", async () => {
  const { controller, token, cleared } = harness({
    connect: () => Promise.reject("socket exploded"),
    token: "seat-token",
  });

  controller.navigate(null);
  await settle();

  assert.equal(cleared.count, 1);
  assert.equal(token.value, null);
  assert.equal(controller.state.get().notice, null);
  assert.notEqual(controller.state.get().defect, null);

  const other = harness({ connect: () => Promise.reject("socket exploded") });
  other.controller.startQuick();
  await settle();
  assert.match(other.controller.state.get().notice ?? "", /^failed: .*non-Error value/);
});

test("a value that is not an Error thrown while reading the session is still a defect", async () => {
  const good = draftSession();

  const broken: FakeSession = {
    ...good,
    getView() {
      throw "raw failure";
    },
  };

  const { controller } = harness({ connect: connectTo(broken) });

  controller.startSolo();
  await settle();

  const defect = controller.state.get().defect;
  assert.equal(defect instanceof Error, true);
  assert.equal(defect?.cause, "raw failure");
  assert.equal(broken.disposals.disposed, 1);
});

test("a session whose first view cannot be announced is released, not kept for resuming", async () => {
  const session = createFakeSession(snapshotOf(viewOf("preparing")));
  const { controller } = harness({ connect: connectTo(session) });

  controller.startSolo();
  await settle();

  const state = controller.state.get();
  assert.equal(state.connecting, false);
  assert.equal(state.live, null);
  assert.match(state.defect?.message ?? "", /arrived without a round/);
  assert.equal(session.disposals.disposed, 1);
  assert.equal(session.disposals.suspended, 0);

  session.publish(snapshotOf(viewOf("draft")));
  assert.equal(controller.state.get().live, null);
});

test("an error while applying a session change is recorded instead of escaping the session", async () => {
  const session = draftSession();
  const { controller } = harness({ connect: connectTo(session) });

  controller.startSolo();
  await settle();

  session.publish(snapshotOf(viewOf("preparing")));

  assert.match(controller.state.get().defect?.message ?? "", /arrived without a round/);
  assert.equal(session.disposals.disposed, 0);
});

test("visiting twice in a row before the connection lands connects once", async () => {
  const resumed = harness({ connect: connectTo(draftSession()), token: "seat-token" });
  resumed.controller.navigate(null);
  resumed.controller.navigate(null);
  await settle();
  assert.deepEqual(resumed.targets, [{ kind: "resume", token: "seat-token" }]);

  const invited = harness({ connect: connectTo(draftSession()) });
  invited.controller.navigate("room-9");
  invited.controller.navigate("room-9");
  await settle();
  assert.deepEqual(invited.targets, [{ kind: "room", roomId: "room-9" }]);
});

test("following another invite link while in a match asks first and then joins that room", async () => {
  const first = draftSession();
  const second = draftSession();
  const sessions = [first, second];

  const { controller, prompts, targets, consumed } = harness({
    connect: () => Promise.resolve(sessions.shift() ?? first),
  });

  controller.navigate("room-1");
  await settle();
  controller.navigate("room-2");
  await settle();

  assert.deepEqual(prompts, [LEAVE_MATCH_PROMPT]);
  assert.deepEqual(targets, [
    { kind: "room", roomId: "room-1" },
    { kind: "room", roomId: "room-2" },
  ]);
  assert.equal(first.disposals.disposed, 1);
  assert.equal(liveOf(controller).session, second);
  assert.equal(consumed.count, 2);
});

test("a disposed controller refuses every command", async () => {
  const { controller } = harness({ connect: connectTo(draftSession()) });

  controller.dispose();

  assert.throws(() => controller.navigate(null), /used after it was disposed/);
  assert.throws(() => controller.startSolo(), /used after it was disposed/);
  assert.throws(() => controller.startQuick(), /used after it was disposed/);
  assert.throws(() => controller.leave(), /used after it was disposed/);
  assert.throws(() => controller.startMatch(), /used after it was disposed/);
});

test("a later good connection replaces the earlier defect", async () => {
  let failing = true;
  const session = draftSession();

  const { controller } = harness({
    connect: () => (failing ? Promise.reject("bad") : Promise.resolve(session)),
  });

  controller.startQuick();
  await settle();
  assert.notEqual(controller.state.get().defect, null);

  failing = false;
  controller.startQuick();
  await settle();
  assert.equal(controller.state.get().defect, null);
  assert.equal(liveOf(controller).session, session);
});

test("leaving releases the session and detaches its listener", async () => {
  const session = draftSession();
  const { controller } = harness({ connect: connectTo(session) });

  controller.startSolo();
  await settle();
  controller.leave();

  assert.equal(controller.state.get().live, null);
  assert.equal(session.disposals.disposed, 1);

  session.publish(snapshotOf(viewOf("preparing")));
  assert.equal(controller.state.get().live, null);
});

test("session changes flow into the live match", async () => {
  const session = draftSession();
  const { controller } = harness({ connect: connectTo(session) });

  controller.startSolo();
  await settle();

  session.publish(snapshotOf(viewOf("draft", { phaseEpoch: 3, draftSelection: ["paladin"] })));

  assert.equal(liveOf(controller).snapshot.view?.phaseEpoch, 3);
  assert.deepEqual(liveOf(controller).draft.selection, ["paladin"]);
});

test("toggling a pick updates the selection, plays a sound and tells the session", async () => {
  const session = draftSession();
  const { controller, played } = harness({ connect: connectTo(session) });

  controller.startSolo();
  await settle();

  controller.toggleDraftPick("paladin");
  controller.toggleDraftPick("firebrand");
  controller.toggleDraftPick("paladin");

  assert.deepEqual(liveOf(controller).draft.selection, ["firebrand"]);
  assert.deepEqual(played, ["draft-pick", "draft-pick", "draft-unpick"]);
  assert.deepEqual(session.calls, [
    "selectHeroes:paladin",
    "selectHeroes:paladin,firebrand",
    "selectHeroes:firebrand",
  ]);
});

test("a pick that changes nothing makes no sound and sends nothing", async () => {
  const session = createFakeSession(snapshotOf(viewOf("draft", { ready: true })));
  const { controller, played } = harness({ connect: connectTo(session) });

  controller.startSolo();
  await settle();
  controller.toggleDraftPick("paladin");

  assert.deepEqual(played, []);
  assert.deepEqual(session.calls, []);
});

test("submitting the draft locks it, plays the lock sound and sends the picks", async () => {
  const session = draftSession();
  const { controller, played } = harness({ connect: connectTo(session) });

  controller.startSolo();
  await settle();
  controller.toggleDraftPick("paladin");
  controller.submitDraft();

  assert.equal(liveOf(controller).draft.submittedEpoch, 2);
  assert.equal(played.at(-1), "draft-lock");
  assert.equal(session.calls.at(-1), "pickHeroes:paladin");
});

test("a full draft the server moves past without a submission plays the lock sound", async () => {
  const session = createFakeSession(
    snapshotOf(viewOf("draft", { draftSelection: ["paladin", "firebrand", "training-dummy"] })),
  );

  const { controller, played } = harness({ connect: connectTo(session) });

  controller.startSolo();
  await settle();
  const round = roundOf(0, [battleBetween("b1", ME, RIVAL, null)]);
  session.publish(snapshotOf(viewOf("preparing", { currentRound: round })));

  assert.deepEqual(played, ["draft-lock"]);
});

test("a resolved round opens the watch and closing it announces the result once", async () => {
  const players = [seatOf(ME), seatOf(RIVAL), seatOf(THIRD), seatOf(FOURTH)];
  const battles = [battleBetween("b1", ME, RIVAL, ME), battleBetween("b2", THIRD, FOURTH, THIRD)];
  const session = draftSession();
  const { controller, played } = harness({ connect: connectTo(session) });

  controller.startSolo();
  await settle();

  session.publish(
    snapshotOf(viewOf("round-result", { currentRound: roundOf(0, battles) }), {
      latestRound: resolvedRound(0, battles, players),
    }),
  );

  assert.notEqual(liveOf(controller).watch, null);
  assert.deepEqual(played, []);

  controller.closeWatch();
  assert.equal(liveOf(controller).watch, null);
  assert.deepEqual(played, ["round-won"]);

  session.publish(
    snapshotOf(viewOf("round-result", { currentRound: roundOf(0, battles) }), {
      latestRound: resolvedRound(0, battles, players),
    }),
  );
  assert.deepEqual(played, ["round-won"]);
});

test("a result already on screen is announced on adoption, and a new session announces it afresh", async () => {
  const players = [seatOf(ME), seatOf(RIVAL)];
  const battles = [battleBetween("b1", ME, RIVAL, ME)];
  const round = viewOf("round-result", { players, currentRound: roundOf(0, battles) });
  const first = createFakeSession(snapshotOf(round));
  const second = createFakeSession(snapshotOf(round));
  const sessions = [first, second];

  const { controller, played } = harness({
    connect: () => Promise.resolve(sessions.shift() ?? first),
  });

  controller.startSolo();
  await settle();
  controller.leave();
  controller.startSolo();
  await settle();

  assert.equal(first.disposals.disposed, 1);
  assert.equal(liveOf(controller).session, second);
  assert.deepEqual(played, ["round-won", "round-won"]);
});

test("session commands are forwarded, and using them without a session is a loud error", async () => {
  const session = draftSession();
  const { controller } = harness({ connect: connectTo(session) });

  assert.throws(() => controller.startMatch(), /No match session is running/);
  assert.throws(() => controller.confirmReady(), /No match session is running/);
  assert.throws(() => controller.toggleDraftPick("paladin"), /No match session is running/);
  assert.throws(() => controller.closeWatch(), /No match session is running/);

  controller.startSolo();
  await settle();
  controller.startMatch();
  controller.confirmReady();
  controller.placeHeroes([]);

  assert.deepEqual(session.calls, ["startMatch", "confirmReady", "placeHeroes:0"]);
});

test("joining the room you are already in does nothing", async () => {
  const session = createFakeSession(snapshotOf(null, { lobby: lobbyOf(ME, [{}], "room-1") }));
  const { controller, prompts, targets } = harness({ connect: connectTo(session) });

  controller.startSolo();
  await settle();
  controller.navigate("room-1");
  await settle();

  assert.deepEqual(prompts, []);
  assert.equal(targets.length, 1);
  assert.equal(session.disposals.disposed, 0);
});

test("joining another room asks first, and declining keeps the current match", async () => {
  const session = draftSession();
  const { controller, prompts, targets } = harness({ connect: connectTo(session), confirm: false });

  controller.startSolo();
  await settle();
  controller.navigate("room-2");

  assert.deepEqual(prompts, [LEAVE_MATCH_PROMPT]);
  assert.equal(targets.length, 1);
  assert.equal(liveOf(controller).session, session);
  assert.equal(session.disposals.disposed, 0);
});

test("accepting the prompt leaves the old match and joins the new room", async () => {
  const old = draftSession();
  const next = draftSession();
  const sessions = [old, next];

  const { controller, targets } = harness({
    connect: () => Promise.resolve(sessions.shift() ?? old),
  });

  controller.startSolo();
  await settle();
  controller.navigate("room-2");
  await settle();

  assert.equal(old.disposals.disposed, 1);
  assert.deepEqual(targets.at(-1), { kind: "room", roomId: "room-2" });
  assert.equal(liveOf(controller).session, next);
});

test("joining a room from the menu needs no confirmation", async () => {
  const { controller, prompts, targets } = harness({ connect: connectTo(draftSession()) });

  controller.navigate("room-3");
  await settle();

  assert.deepEqual(prompts, []);
  assert.deepEqual(targets, [{ kind: "room", roomId: "room-3" }]);
});

test("disposing suspends the session so the seat can be resumed", async () => {
  const session = draftSession();
  const { controller } = harness({ connect: connectTo(session) });

  controller.startSolo();
  await settle();
  controller.dispose();

  assert.equal(session.disposals.suspended, 1);
  assert.equal(session.disposals.disposed, 0);

  session.publish(snapshotOf(viewOf("preparing")));
  assert.equal(liveOf(controller).snapshot.view?.phase, "draft");
});

test("a connection that lands after disposal is suspended rather than adopted", async () => {
  const session = draftSession();
  let resolve: (value: MatchSession) => void = () => {};

  const pending = new Promise<MatchSession>((settled) => {
    resolve = settled;
  });

  const { controller } = harness({ connect: () => pending });

  controller.startSolo();
  controller.dispose();
  resolve(session);
  await settle();

  assert.equal(session.disposals.suspended, 1);
  assert.equal(controller.state.get().live, null);
});

test("a failure that lands after disposal is not reported", async () => {
  let reject: (reason: Error) => void = () => {};

  const pending = new Promise<MatchSession>((_, rejected) => {
    reject = rejected;
  });

  const { controller } = harness({ connect: () => pending });

  controller.startSolo();
  controller.dispose();
  reject(new Error("late"));
  await settle();

  assert.equal(controller.state.get().notice, null);
});
